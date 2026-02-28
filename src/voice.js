// voice.js — Gemini Live API voice input (Spec 6)

import { GEMINI_API_KEY, LIVE_API_MODEL } from './config.js';
import { setStatus, setTranscript } from './ui.js';
import { handleTextInstruction } from './spatial.js';

let ws = null;
let micState = 'disconnected';
let voiceTranscript = '';
let audioContext = null;
let processor = null;
let source = null;
let micStream = null;
let reconnectAttempted = false;

const btnMic = document.getElementById('btn-mic');

function setMicState(state) {
  micState = state;
  if (!btnMic) return;

  // Reset classes — CSS uses #btn-mic.ready, #btn-mic.recording, #btn-mic.processing
  btnMic.classList.remove('ready', 'recording', 'processing');

  switch (state) {
    case 'disconnected':
      btnMic.textContent = 'MIC';
      btnMic.disabled = false;
      break;
    case 'connecting':
      btnMic.textContent = '...';
      btnMic.disabled = true;
      setStatus('Connecting voice...');
      break;
    case 'ready':
      btnMic.textContent = 'MIC';
      btnMic.disabled = false;
      btnMic.classList.add('ready');
      setStatus('Voice ready — click MIC to speak');
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
      setStatus('Processing speech...');
      break;
  }
}

function float32ToBase64PCM(float32Array, inputSampleRate) {
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.floor(float32Array.length / ratio);
  const int16 = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, float32Array.length - 1);
    const frac = srcIndex - low;
    const sample = float32Array[low] + (float32Array[high] - float32Array[low]) * frac;
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }

  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function startRecording() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(micStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (micState !== 'recording' || !ws || ws.readyState !== WebSocket.OPEN) return;
      const float32 = event.inputBuffer.getChannelData(0);
      const base64 = float32ToBase64PCM(float32, audioContext.sampleRate);
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          }]
        }
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setMicState('recording');
  } catch (err) {
    console.error('Microphone access error:', err);
    setTranscript('Could not access microphone. Check browser permissions.');
    setMicState('ready');
  }
}

function stopRecording() {
  if (source) { source.disconnect(); source = null; }
  if (processor) { processor.disconnect(); processor = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  setMicState('processing');
}

export function connectLiveAPI() {
  if (!GEMINI_API_KEY) return;

  setMicState('connecting');
  reconnectAttempted = false;

  const wsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + GEMINI_API_KEY;
  ws = new WebSocket(wsUrl);

  // Timeout if connection takes too long
  const connectTimeout = setTimeout(() => {
    if (micState === 'connecting') {
      console.warn('Voice connection timed out');
      if (ws) { ws.close(); ws = null; }
      setMicState('disconnected');
    }
  }, 10000);

  ws.onopen = () => {
    clearTimeout(connectTimeout);
    ws.send(JSON.stringify({
      setup: {
        model: 'models/' + LIVE_API_MODEL,
        generationConfig: { responseModalities: ['AUDIO'] },
        inputAudioTranscription: {},
        systemInstruction: {
          parts: [{
            text: 'You are a voice input interface for an interior design tool called RoomCast. The user will speak instructions about moving furniture. Listen to their instruction and respond with a brief, friendly one-sentence acknowledgment of what they said. Do not attempt to provide coordinates or JSON.'
          }]
        }
      }
    }));
  };

  ws.onmessage = async (event) => {
    let raw = event.data;
    if (raw instanceof Blob) {
      raw = await raw.text();
    } else if (raw instanceof ArrayBuffer) {
      raw = new TextDecoder().decode(raw);
    }

    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    if (msg.setupComplete) {
      setTranscript('Voice connected! Click MIC to speak.');
      setMicState('ready');
      return;
    }

    if (msg.error) {
      console.error('Voice error:', msg.error);
      return;
    }

    if (msg.serverContent?.inputTranscription?.text) {
      voiceTranscript += msg.serverContent.inputTranscription.text;
    }

    if (msg.serverContent?.turnComplete) {
      if (voiceTranscript.trim()) {
        const transcribedText = voiceTranscript.trim();
        setTranscript(transcribedText + ' (voice)', 'Processing...');
        handleTextInstruction(transcribedText).then(() => {
          setMicState('ready');
        }).catch(() => {
          setMicState('ready');
        });
      } else {
        setMicState('ready');
      }
      voiceTranscript = '';
    }
  };

  ws.onclose = () => {
    if (micState === 'recording') stopRecording();
    if (!reconnectAttempted) {
      reconnectAttempted = true;
      setTranscript('Voice reconnecting...');
      setTimeout(() => connectLiveAPI(), 1000);
    } else {
      setMicState('disconnected');
      setTranscript('Voice unavailable. Use text input instead.');
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    setTranscript('Voice connection error. Use text input instead.');
  };
}

function handleMicClick() {
  switch (micState) {
    case 'disconnected':
      if (GEMINI_API_KEY) connectLiveAPI();
      break;
    case 'ready':
      voiceTranscript = '';
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
  // Connect in background — don't block the UI or change button state until connected
  if (GEMINI_API_KEY) {
    // Small delay so the page finishes rendering first
    setTimeout(() => connectLiveAPI(), 1000);
  }
}
