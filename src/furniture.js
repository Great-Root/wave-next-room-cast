import * as THREE from 'three';

export const furnitureData = [
  { id: "sofa",         label: "Sofa",         w: 2.2, d: 0.9, h: 0.85, x: 1.5, z: 2.0, rotation: 0, color: "#4A90D9" },
  { id: "bed",          label: "Queen Bed",    w: 1.6, d: 2.0, h: 0.50, x: 3.0, z: 5.0, rotation: 0, color: "#7B68EE" },
  { id: "desk",         label: "Desk",         w: 1.2, d: 0.6, h: 0.75, x: 1.0, z: 6.5, rotation: 0, color: "#8B6914" },
  { id: "armchair",     label: "Armchair",     w: 0.75, d: 0.75, h: 0.9, x: 1.0, z: 5.8, rotation: 0, color: "#C97B4B" },
  { id: "wardrobe",     label: "Wardrobe",     w: 1.2, d: 0.6, h: 1.0,  x: 4.0, z: 1.0, rotation: 0, color: "#5D4037" },
  { id: "coffee_table", label: "Coffee Table", w: 1.0, d: 0.5, h: 0.45, x: 1.5, z: 3.0, rotation: 0, color: "#A0522D" }
];

const MODEL_MAP = {
  sofa:         { file: './models/couch_pillows.gltf' },
  bed:          { file: './models/bed_double_A.gltf' },
  wardrobe:     { file: './models/cabinet_medium.gltf' },
  armchair:     { file: './models/chair_A.gltf' },
};

// Swap catalog — hardcoded alternatives for demo
const SWAP_CATALOG = {
  sofa: [
    { label: "Sofa",     w: 2.2, d: 0.9, h: 0.85, color: "#4A90D9", model: './models/couch_pillows.gltf' },
    { label: "Loveseat", w: 1.5, d: 0.85, h: 0.80, color: "#4A90D9", model: './models/couch.gltf' },
  ]
};
const swapState = {};  // tracks current variant index per item id

// Mutable room state (source of truth for positions)
// Structure matches the demo data JSON — spatial.js accesses roomState.room and roomState.furniture
export const roomState = {
  room: { width: 5, length: 8, height: 2.7 },
  furniture: furnitureData.map(item => ({
    id: item.id, label: item.label, w: item.w, d: item.d, h: item.h,
    x: item.x, z: item.z, rotation: item.rotation, color: item.color
  }))
};

// Three.js mesh references keyed by ID
export const meshes = {};

// Per-item position history (last 10 moves)
const positionHistory = {};
furnitureData.forEach(item => { positionHistory[item.id] = []; });

// Track pending animation targets so we can snap on interruption
const pendingTarget = {};

// Label tracking
const labels = {};
let _camera = null;
let _labelContainer = null;
let _scene = null;
let _loader = null;

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
  _scene = scene;
  _loader = loader;
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

        // Normalize size via bounding box — scale each axis to match declared w, d
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        const sx = item.w / size.x;
        const sy = item.h / size.y;
        const sz = item.d / size.z;
        model.scale.set(sx, sy, sz);

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

export function animateFurniture(itemId, newX, newZ, newRotation) {
  const obj = meshes[itemId];
  if (!obj) return;

  // If a previous animation was in-flight, snap to its target first
  const prev = pendingTarget[itemId];
  if (prev) {
    obj.position.x = prev.x;
    obj.position.z = prev.z;
    obj.rotation.y = prev.rad;
  }

  // Save position history (now guaranteed to be at a real position, not mid-lerp)
  const history = positionHistory[itemId];
  if (history) {
    const currentRotDeg = obj.rotation.y * 180 / Math.PI;
    history.push({ x: obj.position.x, z: obj.position.z, rotation: currentRotDeg });
    if (history.length > 10) history.shift();
  }

  const startX = obj.position.x;
  const startZ = obj.position.z;
  const startRad = obj.rotation.y;
  const targetRad = (newRotation != null) ? newRotation * Math.PI / 180 : startRad;

  // Record this animation's target for potential interruption
  pendingTarget[itemId] = { x: newX, z: newZ, rad: targetRad };

  // Shortest-path angle wrapping
  let deltaRad = targetRad - startRad;
  deltaRad = deltaRad - Math.round(deltaRad / (2 * Math.PI)) * 2 * Math.PI;

  const duration = 500;
  const t0 = performance.now();

  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = t * (2 - t); // ease-out quad
    obj.position.x = startX + (newX - startX) * ease;
    obj.position.z = startZ + (newZ - startZ) * ease;
    obj.rotation.y = startRad + deltaRad * ease;
    if (t < 1) requestAnimationFrame(step);
    else delete pendingTarget[itemId];
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
    item.rotation = prev.rotation != null ? prev.rotation : 0;
  }
  // Animate without pushing to history (we just popped)
  const obj = meshes[itemId];
  if (!obj) return false;
  const startX = obj.position.x;
  const startZ = obj.position.z;
  const startRad = obj.rotation.y;
  const targetRad = (prev.rotation != null ? prev.rotation : 0) * Math.PI / 180;
  let deltaRad = targetRad - startRad;
  deltaRad = deltaRad - Math.round(deltaRad / (2 * Math.PI)) * 2 * Math.PI;
  const duration = 500;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = t * (2 - t);
    obj.position.x = startX + (prev.x - startX) * ease;
    obj.position.z = startZ + (prev.z - startZ) * ease;
    obj.rotation.y = startRad + deltaRad * ease;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return true;
}

export function swapFurniture(itemId) {
  const catalog = SWAP_CATALOG[itemId];
  if (!catalog || catalog.length < 2) return null;

  // Cycle to next variant
  const current = swapState[itemId] || 0;
  const next = (current + 1) % catalog.length;
  swapState[itemId] = next;
  const variant = catalog[next];

  // Find data entries to mutate
  const fdItem = furnitureData.find(f => f.id === itemId);
  const rsItem = roomState.furniture.find(f => f.id === itemId);
  if (!fdItem || !rsItem) return null;

  // Preserve current position and rotation
  const posX = rsItem.x;
  const posZ = rsItem.z;
  const rotDeg = rsItem.rotation;

  // Update both data sources with new variant's properties
  for (const target of [fdItem, rsItem]) {
    target.label = variant.label;
    target.w = variant.w;
    target.d = variant.d;
    target.h = variant.h;
    target.color = variant.color;
  }

  // Remove old mesh from scene
  const oldMesh = meshes[itemId];
  if (oldMesh) _scene.remove(oldMesh);
  delete meshes[itemId];

  // Clear position history — undo across swaps makes no sense
  positionHistory[itemId] = [];

  // Update label text
  if (labels[itemId]) {
    labels[itemId].el.textContent = variant.label;
    labels[itemId].heightOffset = variant.h + 0.2;
  }

  // Load new glTF model (same normalization logic as initFurniture)
  _loader.load(variant.model, (gltf) => {
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const sx = variant.w / size.x;
    const sy = variant.h / size.y;
    const sz = variant.d / size.z;
    model.scale.set(sx, sy, sz);

    // Recompute after scaling, sit on floor
    box.setFromObject(model);
    model.position.set(posX, -box.min.y, posZ);
    model.rotation.y = rotDeg * Math.PI / 180;

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    _scene.add(model);
    meshes[itemId] = model;

    // Update label height from actual model
    box.setFromObject(model);
    if (labels[itemId]) labels[itemId].heightOffset = box.max.y + 0.15;
  }, undefined, (err) => {
    console.warn('Failed to load swap model for', itemId, err);
    const group = buildFallbackBox(fdItem);
    group.position.set(posX, 0, posZ);
    group.rotation.y = rotDeg * Math.PI / 180;
    _scene.add(group);
    meshes[itemId] = group;
  });

  return variant;
}
