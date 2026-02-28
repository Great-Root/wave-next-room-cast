// render.js — Nano Banana 2 image generation via img2img (Spec 5)

import { GEMINI_API_KEY, IMAGE_MODEL } from './config.js';
import { furnitureData } from './furniture.js';
import { setStatus, setTranscript } from './ui.js';
import { getFurnitureRefParts } from './furniture-interact.js';
import * as THREE from 'three';

let _scene, _camera, _renderer;
let renderActive = false;

// Gemini-supported aspect ratios (from API docs)
const ASPECT_RATIOS = [
  { str: '1:1', val: 1 },
  { str: '1:4', val: 1 / 4 },
  { str: '1:8', val: 1 / 8 },
  { str: '2:3', val: 2 / 3 },
  { str: '3:2', val: 3 / 2 },
  { str: '3:4', val: 3 / 4 },
  { str: '4:1', val: 4 / 1 },
  { str: '4:3', val: 4 / 3 },
  { str: '4:5', val: 4 / 5 },
  { str: '5:4', val: 5 / 4 },
  { str: '8:1', val: 8 / 1 },
  { str: '9:16', val: 9 / 16 },
  { str: '16:9', val: 16 / 9 },
  { str: '21:9', val: 21 / 9 },
];

function getClosestAspectRatio(w, h) {
  const ratio = w / h;
  let closest = ASPECT_RATIOS[0];
  let minDiff = Infinity;
  for (const ar of ASPECT_RATIOS) {
    const diff = Math.abs(ar.val - ratio);
    if (diff < minDiff) { minDiff = diff; closest = ar; }
  }
  return closest.str;
}

const renderOverlay = document.getElementById('render-overlay');
const renderImg = document.getElementById('render-img');
const btnRender = document.getElementById('btn-render');

export function initRender(sceneRef, cameraRef, rendererRef) {
  _scene = sceneRef;
  _camera = cameraRef;
  _renderer = rendererRef;

  btnRender.addEventListener('click', handleRenderClick);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && renderActive) exitRender();
  });
}

function captureCanvas() {

  // 현재 상태 저장
  const originalPixelRatio = _renderer.getPixelRatio();
  const originalSize = _renderer.getSize(new THREE.Vector2());

  // 고해상도 설정
  const upscaleFactor = 2; // 2배 해상도
  _renderer.setPixelRatio(upscaleFactor);
  _renderer.setSize(originalSize.x, originalSize.y, false);

  // 렌더
  _renderer.render(_scene, _camera);

  // 고품질 캡처
  const dataUrl = _renderer.domElement.toDataURL('image/jpeg', 0.95);

  // 원래 상태 복구
  _renderer.setPixelRatio(originalPixelRatio);
  _renderer.setSize(originalSize.x, originalSize.y, false);
  _renderer.render(_scene, _camera);

  return dataUrl.split(',')[1];
}

function captureTopView() {
  // Save current camera state
  const savedPos = _camera.position.clone();
  const savedRot = _camera.quaternion.clone();
  const savedFov = _camera.fov;

  // Move to birdseye position
  _camera.position.set(2.5, 10, 4);
  _camera.fov = 55;
  _camera.updateProjectionMatrix();
  _camera.lookAt(2.5, 0, 4);

  _renderer.render(_scene, _camera);
  const dataUrl = _renderer.domElement.toDataURL('image/jpeg', 0.85);

  // Restore camera state
  _camera.position.copy(savedPos);
  _camera.quaternion.copy(savedRot);
  _camera.fov = savedFov;
  _camera.updateProjectionMatrix();

  return dataUrl.split(',')[1];
}

function buildImg2ImgPrompt() {
  const legend = furnitureData.map(f =>
    f.label + ' (the ' + f.color + ' shape, ' + f.w + 'm x ' + f.d + 'm)'
  ).join(', ');

  const allowed = furnitureData.map(f => f.label).join(', ');

  return `
CRITICAL: STRICT PRESERVATION MODE (NO NEW OBJECTS)

This is NOT a creative generation task.
This is a photorealistic re-render of the EXACT input image.

GROUND TRUTH RULE:
Treat the input image as immutable ground-truth geometry.

ABSOLUTE CONSTRAINTS (MUST FOLLOW):
- Do NOT add ANY new objects of any kind.
- Do NOT add wardrobes/cabinets/closets/shelves/dressers/plants/pictures/lamps/rugs/curtains.
- Do NOT remove any existing object.
- Do NOT move, rotate, or scale any object.
- Do NOT change camera angle/perspective/framing.
- Do NOT change wall/window/floor geometry.
- Preserve outside scenery exactly as input.

OBJECT WHITELIST (ONLY these objects may appear in the output):
${allowed}

If an object is not on the whitelist, it MUST NOT appear.

FURNITURE DETAILS (keep exact placement and proportions):
${legend}

TASK:
Convert the input 3D capture into a photorealistic interior photograph
by ONLY improving materials, lighting, and shadows.
No layout edits. No object edits. No additions.

PHOTO STYLE:
Neutral DSLR photo, natural daylight, soft realistic shadows,
physically plausible materials, no stylization, no hallucinations.

FINAL CHECK:
Output must contain EXACTLY the same set of objects as the input (whitelist only).
`;
}

function exitRender() {
  renderActive = false;
  renderOverlay.classList.remove('active');
  const hint = renderOverlay.querySelector('.hint');
  if (hint) hint.classList.remove('fade');
  btnRender.textContent = 'Render';
  setStatus('Ready');
}

export async function handleRenderClick() {
  // Toggle off if already showing
  if (renderActive) {
    exitRender();
    return;
  }

  if (!GEMINI_API_KEY) {
    setTranscript('Add your Gemini API key to config.js to generate a render.');
    return;
  }

  btnRender.disabled = true;
  btnRender.textContent = 'Rendering...';
  setStatus('Generating photorealistic view...');
  setTranscript('Rendering from your current viewpoint — hold on...');

  try {
    const t0 = performance.now();
    const screenshotBase64 = captureCanvas();
    const topViewBase64 = captureTopView();
    let stylePrompt = buildImg2ImgPrompt();

    // Merge furniture reference images if available
    const furnitureRef = getFurnitureRefParts();
    const contentParts = [
      {
        text: (furnitureRef ? stylePrompt + ' ' + furnitureRef.extraPrompt : stylePrompt) +
          ' I am also providing a top-down birdseye view of the room layout for spatial reference. ' +
          'Use it to understand exact furniture positions, but render from the first image\'s camera angle.'
      },
      { inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } },
      { inlineData: { mimeType: 'image/jpeg', data: topViewBase64 } }
    ];
    if (furnitureRef) contentParts.push(...furnitureRef.parts);

    // Compute aspect ratio from actual canvas dimensions
    const canvasW = _renderer.domElement.width;
    const canvasH = _renderer.domElement.height;
    const aspectRatio = getClosestAspectRatio(canvasW, canvasH);
    console.log('[Render] Canvas:', canvasW, 'x', canvasH, '-> aspect ratio:', aspectRatio);

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + IMAGE_MODEL + ':generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: contentParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: '2K'
          },
          thinkingConfig: {
            thinkingLevel: 'High'
          }
        }
      })
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log('[Render] API responded in', elapsed, 's — status:', response.status);

    if (!response.ok) {
      const errBody = await response.json().catch(function () { return {}; });
      console.error('[Render] API error body:', JSON.stringify(errBody, null, 2));
      throw new Error('API returned ' + response.status);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      console.error('[Render] Unexpected response structure:', JSON.stringify(data, null, 2));
      throw new Error('Empty or filtered response from API');
    }
    const parts = candidate.content.parts;

    // Debug: log what part types came back
    const partTypes = parts.map(function (p) {
      if (p.inlineData) return 'image (' + p.inlineData.mimeType + ')';
      if (p.thought) return 'thought';
      if (p.text) return 'text';
      return 'unknown';
    });
    console.log('[Render] Response parts:', partTypes);

    // Check for thinking output (proves thinkingConfig is active)
    const thoughtPart = parts.find(function (p) { return p.thought; });
    if (thoughtPart) console.log('[Render] Thinking active — thought preview:', thoughtPart.text && thoughtPart.text.substring(0, 200));

    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart) throw new Error('No image in response');

    const imgSrc = 'data:' + imagePart.inlineData.mimeType + ';base64,' + imagePart.inlineData.data;
    renderImg.src = imgSrc;

    // Verify output dimensions match requested aspect ratio
    renderImg.onload = function () {
      console.log('[Render] Output image:', this.naturalWidth, 'x', this.naturalHeight);
      console.log('[Render] Output ratio:', (this.naturalWidth / this.naturalHeight).toFixed(3), '— requested:', aspectRatio);
    };
    renderOverlay.classList.add('active');
    renderActive = true;

    // Fade out hint after 3s
    const hint = renderOverlay.querySelector('.hint');
    if (hint) setTimeout(() => hint.classList.add('fade'), 3000);

    btnRender.disabled = false;
    btnRender.textContent = 'Back to 3D';
    setTranscript('Photorealistic render active. Click "Back to 3D" or press Escape.');
    setStatus('Render active');

  } catch (err) {
    console.error('Render error:', err);
    if (err.message === 'No image in response') {
      setTranscript('No image generated. Try again.');
    } else {
      setTranscript('Render failed: ' + err.message);
    }
    btnRender.disabled = false;
    btnRender.textContent = 'Render';
    setStatus('Ready');
  }
}
