import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { ROOM_WIDTH, ROOM_HEIGHT, ROOM_LENGTH } from './config.js';
import { buildRoom, initViewpoints, transitionToView, updateWallVisibility } from './room.js';
import { furnitureData, roomState, meshes, initFurniture, updateLabels, animateFurniture } from './furniture.js';
import { initUI, setStatus, setTranscript, getTextInputElement } from './ui.js';
import { handleTextInstruction } from './spatial.js';
import { initRender } from './render.js';
import { initVoice } from './voice.js';

// Must init before creating RectAreaLight
RectAreaLightUniformsLib.init();

// --- Scene ---
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ecfef);
scene.fog = new THREE.FogExp2(0x9ecfef, 0.015);

// --- Camera ---
export const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 100
);

// --- Renderer ---
export const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

// --- WebXR VR support ---
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const vrButton = VRButton.createButton(renderer);
vrButton.style.bottom = '80px';
document.body.appendChild(vrButton);

// --- OrbitControls ---
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 18;

// --- First-person walk mode ---
const fpControls = new PointerLockControls(camera, document.body);
fpControls.pointerSpeed = 0.8;
let fpMode = false;
const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.0;
const SPRINT_MULT = 2.0;
const ROOM_PAD = 0.3;

const fpKeys = { w: false, a: false, s: false, d: false, shift: false };
const fpInstructions = document.getElementById('fp-instructions');
const fpCrosshair = document.getElementById('fp-crosshair');
const btnWalk = document.getElementById('btn-walk');

function enterFPMode() {
  fpMode = true;
  controls.enabled = false;
  btnWalk.classList.add('active');
  document.querySelectorAll('#viewpoints button[data-view]').forEach(b => b.classList.remove('active'));
  fpInstructions.style.display = 'block';
  fpCrosshair.style.display = 'none';
  camera.position.set(2.5, EYE_HEIGHT, 4.0);
  camera.rotation.set(0, 0, 0);
  camera.fov = 75;
  camera.updateProjectionMatrix();
}

function exitFPMode() {
  fpMode = false;
  fpControls.unlock();
  controls.enabled = true;
  btnWalk.classList.remove('active');
  fpInstructions.style.display = 'none';
  fpCrosshair.style.display = 'none';
  camera.fov = 50;
  camera.updateProjectionMatrix();
  transitionToView('corner', 600);
}

fpControls.addEventListener('lock', () => {
  fpInstructions.style.display = 'none';
  fpCrosshair.style.display = 'block';
  prevTime = performance.now();
});

fpControls.addEventListener('unlock', () => {
  if (fpMode) {
    fpCrosshair.style.display = 'none';
    exitFPMode();
  }
});

// Click to lock pointer in FP mode
document.addEventListener('click', (e) => {
  if (fpMode && !fpControls.isLocked && fpInstructions.style.display === 'block') {
    if (e.target.closest('#ui-panel') || e.target.closest('#viewpoints')) return;
    fpControls.lock();
  }
});

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w') fpKeys.w = true;
  if (key === 'a') fpKeys.a = true;
  if (key === 's') fpKeys.s = true;
  if (key === 'd') fpKeys.d = true;
  if (key === 'shift') fpKeys.shift = true;

  // Prevent WASD from typing in text input while walking
  if (fpMode && fpControls.isLocked && ['w','a','s','d'].includes(key)) {
    const textInput = getTextInputElement();
    if (document.activeElement === textInput) textInput.blur();
  }
});

document.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w') fpKeys.w = false;
  if (key === 'a') fpKeys.a = false;
  if (key === 's') fpKeys.s = false;
  if (key === 'd') fpKeys.d = false;
  if (key === 'shift') fpKeys.shift = false;
});

let prevTime = performance.now();

function updateFPMovement() {
  if (!fpMode || !fpControls.isLocked) return;

  const now = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  const speed = MOVE_SPEED * (fpKeys.shift ? SPRINT_MULT : 1.0) * delta;
  if (fpKeys.w) fpControls.moveForward(speed);
  if (fpKeys.s) fpControls.moveForward(-speed);
  if (fpKeys.a) fpControls.moveRight(-speed);
  if (fpKeys.d) fpControls.moveRight(speed);

  camera.position.x = Math.max(ROOM_PAD, Math.min(ROOM_WIDTH - ROOM_PAD, camera.position.x));
  camera.position.z = Math.max(ROOM_PAD, Math.min(ROOM_LENGTH - ROOM_PAD, camera.position.z));
  camera.position.y = EYE_HEIGHT;
}

// --- Lighting ---
const ambient = new THREE.AmbientLight(0xffeedd, 0.4);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xffd68a, 1.6);
sunLight.position.set(3, 8, -2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -6;
sunLight.shadow.camera.right = 6;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -2;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 20;
sunLight.shadow.bias = -0.001;
sunLight.shadow.radius = 4;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8ab4f8, 0.4);
fillLight.position.set(-3, 4, 6);
scene.add(fillLight);

const hemiLight = new THREE.HemisphereLight(0xffd68a, 0x3a3a5c, 0.5);
scene.add(hemiLight);

const accentLight = new THREE.PointLight(0xffaa44, 0.6, 8, 1.5);
accentLight.position.set(1.5, 2.0, 3.0);
scene.add(accentLight);

const windowLight = new THREE.RectAreaLight(0xfff4e0, 2.0, 2.5, 1.5);
windowLight.position.set(ROOM_WIDTH / 2, ROOM_HEIGHT * 0.55, ROOM_LENGTH - 0.1);
windowLight.lookAt(ROOM_WIDTH / 2, ROOM_HEIGHT * 0.55, 0);
scene.add(windowLight);

// --- Build room ---
buildRoom(scene);
initViewpoints(camera, controls);

// --- Set initial camera ---
camera.position.set(8, 5.5, -2);
controls.target.set(2.5, 0.5, 4);
controls.update();

// --- Load furniture ---
const loader = new GLTFLoader();
initFurniture(scene, camera, loader);

// --- Init UI with spatial reasoning handler ---
initUI({
  onSend: handleTextInstruction,
  onEnterFP: enterFPMode,
  onExitFP: exitFPMode,
});

// --- Init API modules ---
initRender(scene, camera, renderer);
initVoice();

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop (WebXR compatible) ---
renderer.setAnimationLoop(() => {
  prevTime = prevTime || performance.now();
  updateFPMovement();
  if (!fpMode) controls.update();
  updateWallVisibility(camera, fpMode, fpControls.isLocked);
  updateLabels(fpMode, fpControls.isLocked, renderer.xr.isPresenting);
  renderer.render(scene, camera);
});
