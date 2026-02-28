// furniture-interact.js — Click any furniture → reference image upload + hover highlight

import * as THREE from 'three';

// --- Module state ---
let _scene, _camera, _renderer, _meshes, _getFPMode;

// Per-furniture reference images: { [furnitureId]: { base64, mime, dataUrl } }
const refImages = {};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = null;
const DRAG_THRESHOLD = 5; // px — distinguish click from drag

// Hover state
let _hoveredFurnitureId = null;
let _allFurnitureMeshes = []; // cached list of raycastable meshes

// Pending furniture ID for file input flow
let _pendingFurnitureId = null;

// --- Inject styles ---
const style = document.createElement('style');
style.textContent = `
.furn-ref-container {
  position: fixed;
  bottom: 80px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 200;
}
.furn-ref-indicator {
  background: rgba(0,0,0,0.85);
  border-radius: 10px;
  padding: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  animation: furn-ref-in 0.25s ease-out;
}
@keyframes furn-ref-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.furn-ref-indicator img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
}
.furn-ref-indicator .furn-ref-label {
  color: #fff;
  font-size: 12px;
  max-width: 90px;
  line-height: 1.3;
}
.furn-ref-indicator .furn-ref-remove {
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  font-size: 16px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}
.furn-ref-indicator .furn-ref-remove:hover {
  background: rgba(255,80,80,0.6);
}
`;
document.head.appendChild(style);

// --- Container for indicator cards ---
const indicatorContainer = document.createElement('div');
indicatorContainer.className = 'furn-ref-container';
document.body.appendChild(indicatorContainer);

// --- Hidden file input ---
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

// --- Furniture label map ---
const FURNITURE_LABELS = {
  sofa: 'Sofa',
  bed: 'Bed',
  desk: 'Desk',
  wardrobe: 'Wardrobe',
  coffee_table: 'Coffee Table',
};

// --- Indicator UI ---
function renderIndicators() {
  indicatorContainer.innerHTML = '';

  for (const [id, ref] of Object.entries(refImages)) {
    const el = document.createElement('div');
    el.className = 'furn-ref-indicator';
    el.dataset.furnitureId = id;

    const thumb = document.createElement('img');
    thumb.src = ref.dataUrl;

    const label = document.createElement('span');
    label.className = 'furn-ref-label';
    label.textContent = (FURNITURE_LABELS[id] || id) + ' ref';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'furn-ref-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove reference image';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      delete refImages[id];
      renderIndicators();
    });

    el.appendChild(thumb);
    el.appendChild(label);
    el.appendChild(removeBtn);
    indicatorContainer.appendChild(el);
  }
}

// --- File handling ---
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file || !_pendingFurnitureId) return;

  const furnitureId = _pendingFurnitureId;
  _pendingFurnitureId = null;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/data:(.*?);/)[1];
    refImages[furnitureId] = { base64, mime, dataUrl };
    renderIndicators();
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
});

// --- Collect all furniture meshes for raycasting ---
function collectFurnitureMeshes() {
  _allFurnitureMeshes = [];
  if (!_meshes) return;

  for (const id of Object.keys(FURNITURE_LABELS)) {
    const root = _meshes[id];
    if (!root) continue;
    root.traverse(child => {
      if (child.isMesh) {
        child.userData.furnitureId = id;
        _allFurnitureMeshes.push(child);
      }
    });
    if (root.isMesh) {
      root.userData.furnitureId = id;
      _allFurnitureMeshes.push(root);
    }
  }
}

// --- Hover highlight ---
function setFurnitureEmissive(furnitureId, color) {
  const root = _meshes[furnitureId];
  if (!root) return;
  root.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat.emissive) mat.emissive.set(color);
      }
    }
  });
}

function onPointerMove(e) {
  if (_getFPMode()) {
    if (_hoveredFurnitureId) {
      setFurnitureEmissive(_hoveredFurnitureId, 0x000000);
      _hoveredFurnitureId = null;
      _renderer.domElement.style.cursor = '';
    }
    return;
  }

  // Skip if over UI
  if (e.target.closest('#ui-panel') || e.target.closest('#viewpoints') ||
      e.target.closest('.furn-ref-container')) {
    if (_hoveredFurnitureId) {
      setFurnitureEmissive(_hoveredFurnitureId, 0x000000);
      _hoveredFurnitureId = null;
      _renderer.domElement.style.cursor = '';
    }
    return;
  }

  const rect = _renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, _camera);

  // Re-collect meshes periodically (furniture can move)
  collectFurnitureMeshes();
  if (_allFurnitureMeshes.length === 0) {
    if (_hoveredFurnitureId) {
      setFurnitureEmissive(_hoveredFurnitureId, 0x000000);
      _hoveredFurnitureId = null;
      _renderer.domElement.style.cursor = '';
    }
    return;
  }

  const hits = raycaster.intersectObjects(_allFurnitureMeshes, false);
  const hitId = hits.length > 0 ? hits[0].object.userData.furnitureId : null;

  if (hitId !== _hoveredFurnitureId) {
    // Restore previous
    if (_hoveredFurnitureId) {
      setFurnitureEmissive(_hoveredFurnitureId, 0x000000);
    }
    // Highlight new
    if (hitId) {
      setFurnitureEmissive(hitId, 0x333333);
      _renderer.domElement.style.cursor = 'pointer';
    } else {
      _renderer.domElement.style.cursor = '';
    }
    _hoveredFurnitureId = hitId;
  }
}

// --- Click detection ---
function onPointerDown(e) {
  pointerDownPos = { x: e.clientX, y: e.clientY };
}

function onPointerUp(e) {
  if (!pointerDownPos) return;

  // Ignore if in first-person mode
  if (_getFPMode()) { pointerDownPos = null; return; }

  // Ignore clicks on UI elements
  if (e.target.closest('#ui-panel') || e.target.closest('#viewpoints') ||
      e.target.closest('.furn-ref-container')) {
    pointerDownPos = null;
    return;
  }

  // Distinguish click from drag
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return;

  // Raycast
  const rect = _renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, _camera);
  collectFurnitureMeshes();
  if (_allFurnitureMeshes.length === 0) return;

  const hits = raycaster.intersectObjects(_allFurnitureMeshes, false);
  if (hits.length > 0) {
    const furnitureId = hits[0].object.userData.furnitureId;
    if (furnitureId) {
      _pendingFurnitureId = furnitureId;
      fileInput.click();
    }
  }
}

// --- Public API ---

/**
 * Initialize furniture interaction. Call once after scene is ready.
 */
export function initFurnitureInteract(scene, camera, renderer, meshesRef, fpModeGetter) {
  _scene = scene;
  _camera = camera;
  _renderer = renderer;
  _meshes = meshesRef;
  _getFPMode = fpModeGetter;

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
}

/**
 * Called by render.js to get all furniture reference image data for API call.
 * Returns { extraPrompt, parts } or null if no reference images uploaded.
 */
export function getFurnitureRefParts() {
  const ids = Object.keys(refImages);
  if (ids.length === 0) return null;

  const descriptions = ids.map(id => {
    const label = FURNITURE_LABELS[id] || id;
    return 'a reference photo for the ' + label;
  });

  const extraPrompt =
    'IMPORTANT: I have attached reference photos for specific furniture. ' +
    'The references include: ' + descriptions.join('; ') + '. ' +
    'Make each piece of furniture in the rendered image match the style, color, material, ' +
    'and overall look of its corresponding reference photo as closely as possible.';

  const parts = ids.map(id => ({
    inlineData: { mimeType: refImages[id].mime, data: refImages[id].base64 }
  }));

  return { extraPrompt, parts };
}
