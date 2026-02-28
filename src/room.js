import * as THREE from 'three';
import { ROOM_WIDTH, ROOM_HEIGHT, ROOM_LENGTH } from './config.js';

const VIEWS = {
  corner:   { pos: [8, 5.5, -2],    target: [2.5, 0.5, 4], fov: 50 },
  birdseye: { pos: [2.5, 10, 4],    target: [2.5, 0, 4],   fov: 55 },
  entrance: { pos: [2.5, 1.6, -0.3], target: [2.5, 1.2, 5], fov: 65 },
  window:   { pos: [2.5, 1.6, 8.3], target: [2.5, 1.0, 3], fov: 65 },
  side:     { pos: [9, 3, 4],       target: [2.5, 0.6, 4], fov: 45 },
};

let cameraAnim = null;
let _camera = null;
let _controls = null;

// Wall group references for auto-hide
export let walls = null;

export function buildRoom(scene) {
  const W = ROOM_WIDTH, L = ROOM_LENGTH, H = ROOM_HEIGHT;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ color: 0xd4a76a, roughness: 0.65, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, L / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.BackSide })
  );
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set(W / 2, H, L / 2);
  scene.add(ceiling);

  // Wall material
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf5efe6, roughness: 0.78, metalness: 0.0, side: THREE.DoubleSide
  });
  const wallThick = 0.06;

  // West wall (x=0)
  const westGroup = new THREE.Group();
  const westMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, H, L), wallMat);
  westMesh.position.set(0, H / 2, L / 2);
  westMesh.receiveShadow = true;
  westGroup.add(westMesh);
  scene.add(westGroup);

  // East wall (x=ROOM_WIDTH)
  const eastGroup = new THREE.Group();
  const eastMesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, H, L), wallMat);
  eastMesh.position.set(W, H / 2, L / 2);
  eastMesh.receiveShadow = true;
  eastGroup.add(eastMesh);
  scene.add(eastGroup);

  // North wall (z=ROOM_LENGTH) — window wall, split around opening
  const northGroup = new THREE.Group();
  const winCY = H * 0.55;
  const winHW = 1.3, winHH = 0.78;
  const winL = W / 2 - winHW, winR = W / 2 + winHW;
  const winB = winCY - winHH, winT = winCY + winHH;

  // Left wall piece (x: 0 → winL)
  const nLeft = new THREE.Mesh(new THREE.BoxGeometry(winL, H, wallThick), wallMat);
  nLeft.position.set(winL / 2, H / 2, L);
  nLeft.receiveShadow = true;
  northGroup.add(nLeft);

  // Right wall piece (x: winR → W)
  const nRightW = W - winR;
  const nRight = new THREE.Mesh(new THREE.BoxGeometry(nRightW, H, wallThick), wallMat);
  nRight.position.set(winR + nRightW / 2, H / 2, L);
  nRight.receiveShadow = true;
  northGroup.add(nRight);

  // Top piece (above window)
  const nTopH = H - winT;
  const nTop = new THREE.Mesh(new THREE.BoxGeometry(winR - winL, nTopH, wallThick), wallMat);
  nTop.position.set(W / 2, winT + nTopH / 2, L);
  nTop.receiveShadow = true;
  northGroup.add(nTop);

  // Bottom piece (below window)
  const nBot = new THREE.Mesh(new THREE.BoxGeometry(winR - winL, winB, wallThick), wallMat);
  nBot.position.set(W / 2, winB / 2, L);
  nBot.receiveShadow = true;
  northGroup.add(nBot);

  // Window sill
  const sillMat = new THREE.MeshStandardMaterial({ color: 0xe0d8cc, roughness: 0.5 });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(winR - winL + 0.1, 0.04, 0.12), sillMat);
  sill.position.set(W / 2, winB - 0.02, L - 0.04);
  northGroup.add(sill);

  // Window frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.6 });

  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.08), frameMat);
  frameTop.position.set(W / 2, winT, L - 0.01);

  const frameBot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.08), frameMat);
  frameBot.position.set(W / 2, winB, L - 0.01);

  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.62, 0.08), frameMat);
  frameL.position.set(winL, winCY, L - 0.01);

  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.62, 0.08), frameMat);
  frameR.position.set(winR, winCY, L - 0.01);

  const frameMid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.56, 0.06), frameMat);
  frameMid.position.set(W / 2, winCY, L - 0.01);

  northGroup.add(frameTop, frameBot, frameL, frameR, frameMid);

  // Glass — MeshPhysicalMaterial with transmission for realistic see-through glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1.0,
    roughness: 0.05,
    thickness: 0.5,
    ior: 1.5,
    reflectivity: 0.5,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5), glassMat);
  glass.position.set(W / 2, winCY, L - 0.02);
  northGroup.add(glass);
  scene.add(northGroup);

  // --- Outdoor scene: Han River view (visible through window) ---
  const outdoorGroup = new THREE.Group();

  // Riverside embankment
  const embankMat = new THREE.MeshStandardMaterial({ color: 0x9e9e8e, roughness: 0.85 });
  const embankment = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), embankMat);
  embankment.rotation.x = -Math.PI / 2;
  embankment.position.set(W / 2, -0.05, L + 2.5);
  outdoorGroup.add(embankment);

  // Riverside park strip
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x5a8f4a, roughness: 0.9 });
  const parkStrip = new THREE.Mesh(new THREE.PlaneGeometry(40, 3), parkMat);
  parkStrip.rotation.x = -Math.PI / 2;
  parkStrip.position.set(W / 2, -0.03, L + 6.5);
  outdoorGroup.add(parkStrip);

  // Han River water surface
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3a7ca5, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85
  });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), waterMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(W / 2, -0.15, L + 17);
  outdoorGroup.add(river);

  // Far bank
  const farBankMat = new THREE.MeshStandardMaterial({ color: 0x6b8e5a, roughness: 0.9 });
  const farBank = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), farBankMat);
  farBank.rotation.x = -Math.PI / 2;
  farBank.position.set(W / 2, -0.05, L + 29);
  outdoorGroup.add(farBank);

  // Railing
  const railMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.6 });
  for (let rx = -8; rx <= 14; rx += 1.5) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), railMat);
    post.position.set(rx, 0.5, L + 5);
    outdoorGroup.add(post);
  }
  const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 24, 8), railMat);
  railBar.rotation.z = Math.PI / 2;
  railBar.position.set(W / 2, 0.9, L + 5);
  outdoorGroup.add(railBar);

  // Bridge
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.5, metalness: 0.3 });
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 22), bridgeMat);
  bridgeDeck.position.set(12, 1.5, L + 17);
  outdoorGroup.add(bridgeDeck);
  for (const pz of [L + 10, L + 17, L + 24]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), bridgeMat);
    pylon.position.set(12, 0.5, pz);
    outdoorGroup.add(pylon);
  }
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.7 });
  const cableTower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), cableMat);
  cableTower.position.set(12, 4, L + 17);
  outdoorGroup.add(cableTower);

  // Apartment complexes on the far bank
  const bldgColors = [0x8899aa, 0x95a5b5, 0xb0bec5, 0xa0aab4];
  const apartments = [
    [-6, L + 32, 2.5, 14, 2], [-3, L + 33, 2, 18, 2], [0, L + 32, 2.5, 16, 2],
    [3, L + 34, 2, 20, 2], [6, L + 33, 2.5, 15, 2], [9, L + 32, 2, 17, 2],
    [12, L + 34, 2.5, 12, 2], [15, L + 33, 2, 19, 2],
    [-5, L + 36, 2, 16, 2], [1, L + 37, 2.5, 22, 2], [7, L + 36, 2, 14, 2],
    [13, L + 37, 2.5, 18, 2],
  ];
  for (let i = 0; i < apartments.length; i++) {
    const a = apartments[i];
    const bMat = new THREE.MeshStandardMaterial({ color: bldgColors[i % bldgColors.length], roughness: 0.6 });
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(a[2], a[3], a[4]), bMat);
    bldg.position.set(a[0], a[3] / 2, a[1]);
    outdoorGroup.add(bldg);
  }

  // Riverside park trees (simple shapes — detail comes from render prompt)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.8 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3d8b40, roughness: 0.7 });
  const treeSpots = [[0, L + 6], [3.5, L + 6.5], [7, L + 6], [-3, L + 7]];
  for (let i = 0; i < treeSpots.length; i++) {
    const tx = treeSpots[i][0], tz = treeSpots[i][1];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.6, 6), trunkMat);
    trunk.position.set(tx, 0.8, tz);
    outdoorGroup.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), foliageMat);
    crown.position.set(tx, 2.0, tz);
    outdoorGroup.add(crown);
  }

  scene.add(outdoorGroup);

  // South wall (z=0) — door wall
  const southGroup = new THREE.Group();
  const southMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallThick), wallMat);
  southMesh.position.set(W / 2, H / 2, 0);
  southMesh.receiveShadow = true;
  southGroup.add(southMesh);

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4c3b, roughness: 0.7 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.06), doorMat);
  door.position.set(W / 2, 1.05, 0.02);
  door.castShadow = true;
  southGroup.add(door);

  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), handleMat);
  handle.position.set(W / 2 + 0.32, 1.0, 0.06);
  southGroup.add(handle);
  scene.add(southGroup);

  // Baseboard trim
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.6 });
  const trimH = 0.08;
  const trimD = 0.03;

  const trimW = new THREE.Mesh(new THREE.BoxGeometry(trimD, trimH, L), trimMat);
  trimW.position.set(trimD / 2, trimH / 2, L / 2);
  westGroup.add(trimW);

  const trimE = new THREE.Mesh(new THREE.BoxGeometry(trimD, trimH, L), trimMat);
  trimE.position.set(W - trimD / 2, trimH / 2, L / 2);
  eastGroup.add(trimE);

  const trimN = new THREE.Mesh(new THREE.BoxGeometry(W, trimH, trimD), trimMat);
  trimN.position.set(W / 2, trimH / 2, L - trimD / 2);
  northGroup.add(trimN);

  const trimS = new THREE.Mesh(new THREE.BoxGeometry(W, trimH, trimD), trimMat);
  trimS.position.set(W / 2, trimH / 2, trimD / 2);
  southGroup.add(trimS);

  walls = { northGroup, southGroup, eastGroup, westGroup, ceiling };
  return walls;
}

export function initViewpoints(camera, controls) {
  _camera = camera;
  _controls = controls;
}

export function transitionToView(name, duration) {
  const v = VIEWS[name];
  if (!v || !_camera || !_controls) return;
  duration = duration || 800;

  if (cameraAnim) cameraAnim.cancelled = true;

  const startPos = _camera.position.clone();
  const startTarget = _controls.target.clone();
  const startFov = _camera.fov;
  const endPos = new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]);
  const endTarget = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
  const endFov = v.fov;
  const t0 = performance.now();
  const anim = { cancelled: false };
  cameraAnim = anim;

  function step(now) {
    if (anim.cancelled) return;
    const raw = Math.min((now - t0) / duration, 1);
    // ease-in-out cubic
    const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

    _camera.position.lerpVectors(startPos, endPos, t);
    _controls.target.lerpVectors(startTarget, endTarget, t);
    _camera.fov = startFov + (endFov - startFov) * t;
    _camera.updateProjectionMatrix();
    _controls.update();

    if (raw < 1) requestAnimationFrame(step);
    else cameraAnim = null;
  }
  requestAnimationFrame(step);

  // Update active button
  document.querySelectorAll('#viewpoints button').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('#viewpoints button[data-view="' + name + '"]');
  if (btn) btn.classList.add('active');
}

export function updateWallVisibility(camera, fpMode, fpLocked) {
  if (!walls) return;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const cy = camera.position.y;

  if (fpMode && fpLocked) {
    walls.southGroup.visible = true;
    walls.northGroup.visible = true;
    walls.westGroup.visible  = true;
    walls.eastGroup.visible  = true;
    walls.ceiling.visible    = true;
  } else {
    walls.southGroup.visible = cz > 0.3;
    walls.northGroup.visible = cz < ROOM_LENGTH - 0.3;
    walls.westGroup.visible  = cx > 0.3;
    walls.eastGroup.visible  = cx < ROOM_WIDTH - 0.3;
    walls.ceiling.visible    = cy < ROOM_HEIGHT - 0.2;
  }
}
