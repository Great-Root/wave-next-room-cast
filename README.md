# RoomCast

**Voice-driven, AI-powered interior design visualizer.**

RoomCast lets you see your furniture placed in a navigable 3D room and rearrange it by speaking (or typing) to an AI. Swap furniture for alternatives, upload reference images for material matching, and generate photorealistic renders of your layout. Built with Three.js and Google Gemini APIs.

*"Before you move, see if your furniture fits — and if it doesn't, try alternatives that do."*

Built for the **Gemini 3 Seoul Hackathon** (February 28, 2026).

---

## Features

- **3D Room** — A 5m x 8m room with walls, hardwood floor, window (with frame, sill, and glass), door with handle, baseboard trim, and an outdoor scene visible through the window (trees, distant buildings).
- **6 Furniture Items** — Sofa, queen bed, desk, armchair, wardrobe, and coffee table with real-world dimensions. Four use glTF models; desk and coffee table use composed Three.js geometry. Floating labels identify each item.
- **AI Spatial Reasoning** — Type or speak natural language instructions to move and rotate furniture. Gemini 3.1 Pro interprets spatial intent ("move the sofa near the window and face it toward the room") and returns coordinate updates.
- **Furniture Swap** — Say "try a different sofa" or "swap the sofa for something smaller" to cycle between alternatives (sofa ↔ loveseat). The AI handles swaps through natural language.
- **Reference Images** — Click any furniture piece to upload a photo. The uploaded image is used as a material/texture reference when generating photorealistic renders.
- **Photorealistic Render** — Captures the 3D viewport and a birdseye view, sends both to Gemini's image model as img2img. The AI transforms the layout into a photorealistic interior photograph at 2K resolution.
- **Voice Input** — Click MIC, speak your instruction, click STOP. Audio is recorded via MediaRecorder and transcribed by Gemini, then fed into the same spatial reasoning pipeline as text.
- **Walk Mode** — First-person navigation with WASD + mouse look, sprint with Shift, bounded to room walls.
- **WebXR VR** — Connect a VR headset and click the VR button to explore the room in virtual reality.
- **5 Camera Presets** — Corner, Bird's Eye, From Door, From Window, and Side views with smooth animated transitions.


---

## Architecture

<h2>🏗 Architecture</h2>
<img src="./docs/architecture.png" width="800"/>


---

## Tech Stack

| Layer | Technology | Model / Version |
|-------|-----------|-----------------|
| 3D Engine | Three.js | 0.160 (ES modules via CDN importmap) |
| Spatial Reasoning | Gemini 3.1 Pro | `gemini-3.1-pro-preview` |
| Image Generation | Gemini 3 Pro Image | `gemini-3-pro-image-preview` |
| Voice Transcription | Gemini 3.1 Pro | `gemini-3.1-pro-preview` (same model) |
| 3D Models | KayKit Furniture Pack | glTF format |
| Frontend | Vanilla JS | ES modules, no frameworks or build tools |

All Google AI services authenticate with the same API key via `generativelanguage.googleapis.com`.

---

## Quick Start

### Prerequisites

- A modern browser (Chrome or Edge recommended for WebXR and audio APIs)
- A [Google AI Studio](https://aistudio.google.com/) API key with access to Gemini models
- Node.js (for `npx serve`) or any local HTTP server

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd roomcast
   ```

2. **Create `src/env.js`** with your Gemini API key:
   ```js
   // src/env.js — this file is gitignored
   export const GEMINI_API_KEY = "YOUR_API_KEY_HERE";
   ```
   If this file is missing, the 3D room still works — AI features (text input, voice, render) are simply disabled. A green dot in the top-right corner confirms the key is loaded.

3. **Start a local server** from the project root:
   ```bash
   npx serve .
   ```

4. **Open in browser:**
   ```
   http://localhost:3000/src/index.html
   ```

---

## Usage

### Camera Controls

| Control | Action |
|---------|--------|
| Click + drag | Orbit the camera around the room |
| Scroll wheel | Zoom in / out |
| Viewpoint buttons (top bar) | Jump to a preset angle: Corner, Bird's Eye, From Door, From Window, Side |
| Walk button | Enter first-person mode (WASD to move, mouse to look, Shift to sprint, Esc to exit) |

### Moving Furniture

**Text:** Type an instruction in the bottom panel and press Send (or Enter).

Examples:
- "Move the sofa near the window"
- "Put the desk against the left wall"
- "Rotate the bed to face the door"
- "Move everything to the center of the room"

**Voice:** Click MIC (blue = ready), speak your instruction, click STOP. The audio is transcribed and processed through the same spatial reasoning pipeline.

### Swapping Furniture

Say or type:
- "Try a different sofa"
- "Swap the sofa for something smaller"
- "Change the sofa back to the original"

Currently the sofa can be swapped with a loveseat. Swaps preserve position and rotation.

### Reference Images

Click any furniture item in the 3D view to upload a reference photo. A small indicator card appears in the bottom-right corner showing the uploaded image. When you click Render, these reference images are sent alongside the 3D screenshot as material/texture swatches.

### Rendering

Click **Render** to generate a photorealistic image of the current view. The AI captures two screenshots (your current camera angle + a top-down birdseye view), transforms the layout into a realistic interior photograph, and displays it as a fullscreen overlay. Press **Escape** or click **Back to 3D** to return.

---

## Project Structure

```
roomcast/
├── README.md                  # This file
├── serve.json                 # Local server config (cleanUrls: false)
├── .gitignore
└── src/
    ├── index.html             # HTML shell — Three.js importmap, DOM structure
    ├── style.css              # Dark theme, overlays, walk mode HUD, button states
    ├── app.js                 # Orchestrator — scene, camera, renderer, lighting, walk mode
    ├── config.js              # API key loader (from env.js), model strings, room constants
    ├── env.js                 # API key export (gitignored — create from template above)
    ├── room.js                # 3D room: walls, floor, ceiling, window, door, outdoor scene
    ├── furniture.js           # Furniture data, glTF loading, animation, swap catalog
    ├── furniture-interact.js  # Click-to-upload reference images + hover highlight
    ├── ui.js                  # Bottom panel: transcript, text input, button wiring
    ├── spatial.js             # Gemini spatial reasoning — text/voice → move/rotate/swap
    ├── render.js              # img2img render — dual-view capture → Gemini → photo overlay
    ├── voice.js               # Voice input — MediaRecorder → REST transcription → spatial
    ├── ARCHITECTURE.md        # Detailed module architecture and data flow docs
    └── models/                # glTF furniture models (KayKit pack)
        ├── couch_pillows.gltf # Sofa (default)
        ├── couch.gltf         # Loveseat (swap variant)
        ├── bed_double_A.gltf  # Queen bed
        ├── cabinet_medium.gltf# Wardrobe
        ├── chair_A.gltf       # Armchair
        └── lamp_standing.gltf # Standing lamp (unused, available)
```

---

## API Configuration

All Gemini services use REST endpoints and authenticate with the same API key via the `x-goog-api-key` HTTP header.

| Service | Model | Endpoint |
|---------|-------|----------|
| Spatial Reasoning | `gemini-3.1-pro-preview` | `POST /v1beta/models/{model}:generateContent` |
| Voice Transcription | `gemini-3.1-pro-preview` | `POST /v1beta/models/{model}:generateContent` |
| Image Generation | `gemini-3-pro-image-preview` | `POST /v1beta/models/{model}:generateContent` |

Base URL: `https://generativelanguage.googleapis.com`

---

## Coordinate System

| Axis | Range | Direction |
|------|-------|-----------|
| X | 0 → 5 | Left wall → right wall (width) |
| Z | 0 → 8 | Door/south wall → window/north wall (length) |
| Y | 0 → 2.7 | Floor → ceiling (height) |

All furniture positions (x, z) refer to the **center** of each item. The spatial reasoning model keeps items within bounds accounting for their width and depth.

**Rotation:** 0-360 degrees around the Y axis. 0 = facing north (window), 90 = facing left, 180 = facing south (door), 270 = facing right.

---

## Furniture

| ID | Label | Size (m) | Rendering | glTF Model |
|----|-------|----------|-----------|------------|
| `sofa` | Sofa | 2.2 x 0.9 x 0.85 | glTF | `couch_pillows.gltf` |
| `bed` | Queen Bed | 1.6 x 2.0 x 0.50 | glTF | `bed_double_A.gltf` |
| `desk` | Desk | 1.2 x 0.6 x 0.75 | Composed geometry | — |
| `armchair` | Armchair | 0.75 x 0.75 x 0.9 | glTF | `chair_A.gltf` |
| `wardrobe` | Wardrobe | 1.2 x 0.6 x 1.0 | glTF | `cabinet_medium.gltf` |
| `coffee_table` | Coffee Table | 1.0 x 0.5 x 0.45 | Composed geometry | — |

**Swap alternatives:** Sofa ↔ Loveseat (1.5 x 0.85 x 0.80, `couch.gltf`)

---

## License

Built for the Gemini 3 Seoul Hackathon (February 2026).
