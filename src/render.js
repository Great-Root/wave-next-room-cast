// render.js — Nano Banana 2 image generation via img2img (Spec 5)

import { GEMINI_API_KEY, IMAGE_MODEL } from './config.js';
import { furnitureData } from './furniture.js';
import { setStatus, setTranscript } from './ui.js';

let _scene, _camera, _renderer;
let renderActive = false;

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
  _renderer.render(_scene, _camera);
  const dataUrl = _renderer.domElement.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

function buildImg2ImgPrompt() {
  const legend = furnitureData.map(f =>
    f.label + ' (the ' + f.color + ' shape, ' + f.w + 'm x ' + f.d + 'm)'
  ).join(', ');

  return 'This image is a 3D layout mockup of a real apartment room (5m x 8m, 2.7m ceilings). ' +
    'Transform it into a photorealistic interior photograph while keeping EVERY piece of furniture ' +
    'in the EXACT same position, same size, and same camera angle. Do not move, add, or remove anything. ' +
    'The furniture in the scene: ' + legend + '. ' +
    'The room has: honey hardwood floor with wood grain, off-white plaster walls, ' +
    'a large window on the far wall with warm afternoon sunlight, and a wooden door. ' +
    'Make all materials realistic — real fabric on the sofa, real wood on the desk and table, real bedding on the bed. ' +
    'Style: Architectural Digest editorial photography. Warm natural light, soft shadows, slight depth of field.';
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
    const screenshotBase64 = captureCanvas();
    const stylePrompt = buildImg2ImgPrompt();

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + IMAGE_MODEL + ':generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: stylePrompt },
            { inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } }
          ]
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    });

    if (!response.ok) {
      throw new Error('API returned ' + response.status);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new Error('Empty or filtered response from API');
    }
    const parts = candidate.content.parts;
    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart) throw new Error('No image in response');

    const imgSrc = 'data:' + imagePart.inlineData.mimeType + ';base64,' + imagePart.inlineData.data;
    renderImg.src = imgSrc;
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
