// Load API key from env.js (gitignored)
let _apiKey = '';
try {
  const env = await import('./env.js');
  _apiKey = env.GEMINI_API_KEY || '';
} catch (e) { /* env.js missing or empty — API features will be disabled */ }

export const GEMINI_API_KEY = _apiKey;
export const GEMINI_MODEL = 'gemini-3.1-pro-preview';
export const IMAGE_MODEL = 'gemini-3-pro-image-preview';
export const ROOM_WIDTH = 5;
export const ROOM_LENGTH = 8;
export const ROOM_HEIGHT = 2.7;
