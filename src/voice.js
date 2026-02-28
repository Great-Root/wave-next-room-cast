// voice.js — Voice input via MediaRecorder + REST transcription (Spec 6)

import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';
import { setStatus, setTranscript } from './ui.js';
import { handleTextInstruction } from './spatial.js';

let micState = 'idle';
let mediaRecorder = null;
let audioChunks = [];

const btnMic = document.getElementById('btn-mic');

function setMicState(state) {
  micState = state;
  if (!btnMic) return;

  btnMic.classList.remove('ready', 'recording', 'processing');

  switch (state) {
    case 'idle':
      btnMic.textContent = 'MIC';
      btnMic.disabled = false;
      btnMic.classList.add('ready');
      setStatus('Ready');
      break;
    case 'recording':
      btnMic.textContent = 'STOP';
      btnMic.disabled = false;
      btnMic.classList.add('recording');
      setStatus('Listening... click STOP when done');
      break;
    case 'processing':
      btnMic.textContent = '...';
      btnMic.disabled = true;
      btnMic.classList.add('processing');
      setStatus('Transcribing speech...');
      break;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // Stop all mic tracks
      stream.getTracks().forEach(t => t.stop());

      if (audioChunks.length === 0) {
        setTranscript('No audio captured. Try again.');
        setMicState('idle');
        return;
      }

      const mimeType = mediaRecorder.mimeType.split(';')[0];
      const blob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];
      await processAudio(blob, mimeType);
    };

    mediaRecorder.start();
    setMicState('recording');
  } catch (err) {
    console.error('Microphone access error:', err);
    setTranscript('Could not access microphone. Check browser permissions.');
    setMicState('idle');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  setMicState('processing');
}

async function processAudio(blob, mimeType) {
  try {
    const base64 = await blobToBase64(blob);

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe this audio exactly as spoken. Return only the transcript text, nothing else.' },
            { inlineData: { mimeType: mimeType, data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0.0 }
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

    const textPart = candidate.content.parts.find(p => p.text);
    const transcript = textPart ? textPart.text.trim() : '';

    if (!transcript) {
      setTranscript('Could not understand audio. Try again.');
      setMicState('idle');
      return;
    }

    setTranscript(transcript + ' (voice)', 'Processing...');
    await handleTextInstruction(transcript);
    setMicState('idle');

  } catch (err) {
    console.error('Transcription error:', err);
    setTranscript('Transcription failed: ' + err.message);
    setMicState('idle');
  }
}

function handleMicClick() {
  switch (micState) {
    case 'idle':
      startRecording();
      break;
    case 'recording':
      stopRecording();
      break;
  }
}

export function initVoice() {
  if (btnMic) {
    btnMic.addEventListener('click', handleMicClick);
  }
  if (GEMINI_API_KEY) {
    setMicState('idle');
  }
}
