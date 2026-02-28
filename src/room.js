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

  // North wall (z=ROOM_LENGTH) — window wall
  const northGroup = new THREE.Group();
  const northMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallThick), wallMat);
  northMesh.position.set(W / 2, H / 2, L);
  northMesh.receiveShadow = true;
  northGroup.add(northMesh);

  // Window frame + glass
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.6 });
  const winCY = H * 0.55;

  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.08), frameMat);
  frameTop.position.set(W / 2, winCY + 0.78, L - 0.01);

  const frameBot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.08), frameMat);
  frameBot.position.set(W / 2, winCY - 0.78, L - 0.01);

  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.62, 0.08), frameMat);
  frameL.position.set(W / 2 - 1.3, winCY, L - 0.01);

  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.62, 0.08), frameMat);
  frameR.position.set(W / 2 + 1.3, winCY, L - 0.01);

  const frameMid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.56, 0.06), frameMat);
  frameMid.position.set(W / 2, winCY, L - 0.01);

  northGroup.add(frameTop, frameBot, frameL, frameR, frameMid);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xa8d8ea, transparent: true, opacity: 0.25,
    roughness: 0.05, metalness: 0.1
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5), glassMat);
  glass.position.set(W / 2, winCY, L - 0.02);
  northGroup.add(glass);
  scene.add(northGroup);

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
