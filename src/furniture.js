import * as THREE from 'three';

export const furnitureData = [
  { id: "sofa",         label: "Sofa",         w: 2.2, d: 0.9, h: 0.85, x: 1.0, z: 2.0, color: "#4A90D9" },
  { id: "bed",          label: "Queen Bed",    w: 1.6, d: 2.0, h: 0.50, x: 3.0, z: 5.0, color: "#7B68EE" },
  { id: "desk",         label: "Desk",         w: 1.2, d: 0.6, h: 0.75, x: 0.5, z: 6.5, color: "#8B6914" },
  { id: "wardrobe",     label: "Wardrobe",     w: 1.2, d: 0.6, h: 2.0,  x: 4.0, z: 1.0, color: "#5D4037" },
  { id: "coffee_table", label: "Coffee Table", w: 1.0, d: 0.5, h: 0.45, x: 1.5, z: 1.2, color: "#A0522D" }
];

const MODEL_MAP = {
  sofa:         { file: '../tests/models/couch_pillows.gltf', scale: 1.8, rotY: 0 },
  bed:          { file: '../tests/models/bed_double_A.gltf',  scale: 2.0, rotY: 0 },
  wardrobe:     { file: '../tests/models/cabinet_medium.gltf', scale: 2.2, rotY: 0 },
};

// Mutable room state (source of truth for positions)
// Structure matches the demo data JSON — spatial.js accesses roomState.room and roomState.furniture
export const roomState = {
  room: { width: 5, length: 8, height: 2.7 },
  furniture: furnitureData.map(item => ({
    id: item.id, label: item.label, w: item.w, d: item.d, h: item.h,
    x: item.x, z: item.z, color: item.color
  }))
};

// Three.js mesh references keyed by ID
export const meshes = {};

// Per-item position history (last 10 moves)
const positionHistory = {};
furnitureData.forEach(item => { positionHistory[item.id] = []; });

// Label tracking
const labels = {};
let _camera = null;
let _labelContainer = null;

function buildDeskGeometry(item) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(item.w, 0.04, item.d), woodMat);
  top.position.y = item.h;
  top.castShadow = true;
  group.add(top);

  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, item.h, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.7 });
  const offX = item.w / 2 - 0.06;
  const offZ = item.d / 2 - 0.06;

  for (const pos of [[-offX, -offZ], [offX, -offZ], [-offX, offZ], [offX, offZ]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(pos[0], item.h / 2, pos[1]);
    leg.castShadow = true;
    group.add(leg);
  }
  return group;
}

function buildCoffeeTableGeometry(item) {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xA0522D, roughness: 0.5 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(item.w, 0.035, item.d), woodMat);
  top.position.y = item.h;
  top.castShadow = true;
  group.add(top);

  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(item.w - 0.08, 0.02, item.d - 0.06), woodMat
  );
  shelf.position.y = item.h * 0.35;
  group.add(shelf);

  const legGeo = new THREE.BoxGeometry(0.04, item.h, 0.04);
  const offX = item.w / 2 - 0.04;
  const offZ = item.d / 2 - 0.04;

  for (const pos of [[-offX, -offZ], [offX, -offZ], [-offX, offZ], [offX, offZ]]) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(pos[0], item.h / 2, pos[1]);
    leg.castShadow = true;
    group.add(leg);
  }
  return group;
}

function buildFallbackBox(item) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(item.w, item.h, item.d);
  const mat = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = item.h / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

export function initFurniture(scene, camera, loader) {
  _camera = camera;
  _labelContainer = document.getElementById('label-container');

  let modelsToLoad = 0;
  let modelsLoaded = 0;

  function checkLoaded() {
    modelsLoaded++;
    if (modelsLoaded >= modelsToLoad) {
      document.getElementById('loading').classList.add('done');
    }
  }

  furnitureData.forEach(item => {
    const mapping = MODEL_MAP[item.id];

    // Create HTML label
    const lbl = document.createElement('div');
    lbl.className = 'furniture-label';
    lbl.textContent = item.label;
    _labelContainer.appendChild(lbl);
    labels[item.id] = { el: lbl, heightOffset: item.h + 0.2 };

    if (mapping && mapping.file) {
      modelsToLoad++;
      loader.load(mapping.file, (gltf) => {
        const model = gltf.scene;

        // Normalize size via bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        const targetSize = Math.max(item.w, item.d);
        const currentSize = Math.max(size.x, size.z);
        const s = targetSize / currentSize;
        model.scale.set(s, s, s);

        // Recompute after scaling, sit on floor
        box.setFromObject(model);
        model.position.set(item.x, -box.min.y, item.z);

        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);
        meshes[item.id] = model;

        // Update label height from actual model
        box.setFromObject(model);
        labels[item.id].heightOffset = box.max.y + 0.15;

        checkLoaded();
      }, undefined, (err) => {
        console.warn('Failed to load model for', item.id, '— falling back to box', err);
        const group = buildFallbackBox(item);
        group.position.set(item.x, 0, item.z);
        scene.add(group);
        meshes[item.id] = group;
        checkLoaded();
      });
    } else {
      modelsToLoad++;
      let group;
      if (item.id === 'desk') group = buildDeskGeometry(item);
      else if (item.id === 'coffee_table') group = buildCoffeeTableGeometry(item);
      else group = buildFallbackBox(item);

      group.position.set(item.x, 0, item.z);
      scene.add(group);
      meshes[item.id] = group;
      checkLoaded();
    }
  });
}

export function updateLabels(fpMode, fpLocked, xrPresenting) {
  const hideLabels = (fpMode && fpLocked) || xrPresenting;

  furnitureData.forEach(item => {
    const obj = meshes[item.id];
    if (!obj) return;
    const lbl = labels[item.id];
    if (hideLabels) {
      lbl.el.style.display = 'none';
      return;
    }
    const pos = new THREE.Vector3(obj.position.x, lbl.heightOffset, obj.position.z);
    pos.project(_camera);
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    lbl.el.style.left = (pos.x * hw + hw) + 'px';
    lbl.el.style.top = (-pos.y * hh + hh) + 'px';
    lbl.el.style.display = pos.z > 1 ? 'none' : '';
  });
}

export function animateFurniture(itemId, newX, newZ) {
  const obj = meshes[itemId];
  if (!obj) return;

  // Save position history (caller is responsible for updating roomState)
  const history = positionHistory[itemId];
  if (history) {
    history.push({ x: obj.position.x, z: obj.position.z });
    if (history.length > 10) history.shift();
  }

  const startX = obj.position.x;
  const startZ = obj.position.z;
  const duration = 500;
  const t0 = performance.now();

  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = t * (2 - t); // ease-out quad
    obj.position.x = startX + (newX - startX) * ease;
    obj.position.z = startZ + (newZ - startZ) * ease;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function undoLastMove(itemId) {
  const history = positionHistory[itemId];
  if (!history || history.length === 0) return false;
  const prev = history.pop();
  const item = roomState.furniture.find(f => f.id === itemId);
  if (item) {
    item.x = prev.x;
    item.z = prev.z;
  }
  // Animate without pushing to history (we just popped)
  const obj = meshes[itemId];
  if (!obj) return false;
  const startX = obj.position.x;
  const startZ = obj.position.z;
  const duration = 500;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = t * (2 - t);
    obj.position.x = startX + (prev.x - startX) * ease;
    obj.position.z = startZ + (prev.z - startZ) * ease;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return true;
}
