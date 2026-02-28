# RoomCast

**Voice-driven, AI-powered interior design visualizer.**

RoomCast lets you see your furniture placed in a navigable 3D room and rearrange it by speaking (or typing) to an AI. A render button generates a photorealistic image of the final layout. Built with Three.js and Google Gemini APIs.

*"Before you move, see if your furniture fits — and if it doesn't, try alternatives that do."*

## Features

- **3D Room** — A 5m x 8m room with walls, hardwood floor, window, door, and baseboard trim. Orbit camera with five preset viewpoints.
- **Furniture** — glTF models (sofa, bed, wardrobe) and procedural geometry (desk, coffee table) with floating labels. Smooth animated repositioning.
- **Walk Mode** — First-person navigation with WASD + mouse look, sprint with Shift, bounded to room walls. WebXR VR support via headset button.
- **Text Input** — Type natural language instructions ("move the sofa near the window") to rearrange furniture via Gemini spatial reasoning.
- **Voice Input** — Hold-to-speak microphone using Gemini Live API. Speech is transcribed and fed into the same spatial reasoning pipeline.
- **Photorealistic Render** — Captures the Three.js canvas and sends it as an img2img prompt to Gemini's image model. The result is displayed as a fullscreen overlay.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D Engine | Three.js 0.160 (ES modules via CDN) |
| Spatial Reasoning | Gemini 3.1 Pro (`gemini-3.1-pro-preview`) |
| Image Generation | Gemini 3.1 Flash Image (`gemini-3.1-flash-image-preview`) |
| Voice Input | Gemini Live API (`gemini-2.5-flash-native-audio-preview-12-2025`) |
| Frontend | Vanilla JS ES modules, no build tools |
| 3D Models | glTF format (loaded via Three.js GLTFLoader) |

## Quick Start

### Prerequisites

- A modern browser (Chrome/Edge recommended for WebXR and audio APIs)
- A [Google AI Studio](https://aistudio.google.com/) API key with access to Gemini models
- A local HTTP server (the app uses ES modules, which require serving over HTTP)
- glTF furniture model files placed at the paths referenced in `src/furniture.js` (see the `MODEL_MAP` object)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd roomcast
   ```

2. **Configure your API key:**
   `src/config.js` dynamically imports a sibling module to load `GEMINI_API_KEY`. Create that module exporting your key as a named export. If the import fails, the app still works — API-dependent features (text input, voice, render) are disabled while the 3D room and walk mode function normally. A green dot in the top-right corner confirms the key is loaded.

3. **Start a local server** from the project root:
   ```bash
   npx serve .
   ```

4. **Open in browser:**
   Navigate to the server URL shown in your terminal, appending `/src/index.html` (e.g., `http://localhost:3000/src/index.html`).

## Usage

### Camera Controls

| Control | Action |
|---------|--------|
| Click + drag | Orbit camera |
| Scroll wheel | Zoom in/out |
| Viewpoint buttons (top bar) | Jump to preset angles: Corner, Bird's Eye, From Door, From Window, Side |
| Walk button | Enter first-person mode (WASD to move, mouse to look, Shift to sprint, Esc to exit) |

### Moving Furniture

**Text:** Type an instruction in the bottom panel and press Send (or Enter).
Examples:
- "Move the sofa near the window"
- "Put the desk against the left wall"
- "Swap the bed and wardrobe"

**Voice:** Click MIC when it turns blue (voice connected), speak your instruction, click STOP. The transcribed text is processed through the same spatial reasoning pipeline.

### Rendering

Click **Render** to generate a photorealistic image of the current 3D view. The AI transforms your layout mockup into an interior design photograph while preserving furniture positions. Press Escape or click "Back to 3D" to return.

## Project Structure

```
roomcast/
├── README.md              # This file
├── serve.json             # Local server config (disables clean URLs)
├── .gitignore
└── src/
    ├── ARCHITECTURE.md    # Module architecture and data flow documentation
    ├── index.html         # Entry point — HTML structure and Three.js importmap
    ├── style.css          # All styling (dark theme, overlays, walk mode HUD)
    ├── app.js             # Orchestrator — scene, camera, renderer, lighting, render loop
    ├── config.js          # API key loader + room dimension constants
    ├── room.js            # 3D room construction (walls, floor, window, door, viewpoints)
    ├── furniture.js       # Furniture data, glTF loading, labels, animation
    ├── ui.js              # Bottom panel, transcript, status bar, button wiring
    ├── spatial.js         # Gemini spatial reasoning (text → JSON → furniture moves)
    ├── render.js          # img2img render (canvas screenshot → Gemini → photo overlay)
    └── voice.js           # Gemini Live API (WebSocket audio → transcription → spatial)
```

## API Configuration

All three Gemini services authenticate with the same API key. The key is loaded at runtime by `src/config.js` via a dynamic import.

| Service | Endpoint | Protocol |
|---------|----------|----------|
| Spatial Reasoning | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | REST (POST) |
| Image Generation | Same endpoint, different model | REST (POST) |
| Voice Input | `generativelanguage.googleapis.com/ws/.../BidiGenerateContent?key=` | WebSocket |

Authentication method differs by protocol: REST endpoints use the `x-goog-api-key` HTTP header; the WebSocket endpoint uses a `key` query parameter.

## Coordinate System

The room uses a Three.js coordinate system where:
- **X axis**: 0 (left wall) to 5 (right wall) — room width
- **Z axis**: 0 (door/south wall) to 8 (window/north wall) — room length
- **Y axis**: 0 (floor) to 2.7 (ceiling) — room height

All furniture positions (x, z) refer to the center of each item. The spatial reasoning model is instructed to keep items within bounds accounting for their width and depth.

## License

Built for the Gemini API Hackathon (February 2026).
