import { GEMINI_API_KEY } from './config.js';
import { transitionToView } from './room.js';

const transcript = document.getElementById('transcript');
const textInput = document.getElementById('text-input');
const btnSend = document.getElementById('btn-send');
const btnMic = document.getElementById('btn-mic');
const btnRender = document.getElementById('btn-render');
const status = document.getElementById('status');
const apiDot = document.getElementById('api-dot');

// Callback set by app.js for send action
let _onSend = null;
let _onEnterFP = null;
let _onExitFP = null;

export function setStatus(text) {
  status.textContent = text;
}

export function setTranscript(instruction, response) {
  if (response === undefined) {
    // Single-arg: display as a reply message
    transcript.innerHTML = '<span class="reply">' + instruction + '</span>';
  } else {
    transcript.innerHTML =
      '<span class="instr">You: ' + instruction + '</span><br>' +
      '<span class="reply">' + response + '</span>';
  }
}

export function getTextInput() {
  return textInput.value.trim();
}

export function clearTextInput() {
  textInput.value = '';
}

export function initUI({ onSend, onEnterFP, onExitFP }) {
  _onSend = onSend;
  _onEnterFP = onEnterFP;
  _onExitFP = onExitFP;

  // API key indicator
  if (GEMINI_API_KEY) apiDot.classList.add('live');

  // Send button
  btnSend.addEventListener('click', handleSend);
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSend();
  });

  // Viewpoint buttons
  document.querySelectorAll('#viewpoints button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_onExitFP) _onExitFP();
      transitionToView(btn.dataset.view);
    });
  });

  // Walk button
  const btnWalk = document.getElementById('btn-walk');
  btnWalk.addEventListener('click', () => {
    if (btnWalk.classList.contains('active')) {
      if (_onExitFP) _onExitFP();
    } else {
      if (_onEnterFP) _onEnterFP();
    }
  });
}

function handleSend() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  if (_onSend) _onSend(text);
}

export function getTextInputElement() {
  return textInput;
}

export function getMicButton() {
  return btnMic;
}

export function getRenderButton() {
  return btnRender;
}
