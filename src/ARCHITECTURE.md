# src/ Architecture

Developer reference for the RoomCast source modules. All files in this directory use ES modules loaded via the importmap defined in `index.html`.

## Module Map

```
index.html ──── (importmap: Three.js CDN) ──── <script type="module" src="app.js">
                                                        │
                                                        ▼
                                                      app.js  (orchestrator)
                                                   ┌────┼────────────────────┐
                                                   │    │    │    │    │     │
                                                   ▼    ▼    ▼    ▼    ▼     ▼
                                               room  furn  ui  spatial render voice
                                                .js   .js  .js   .js   .js   .js
                                                 │          │     │     │     │
                                                 │          │     ├─────┘     │
                                                 │          │     │           │
                                                 ▼          ▼     ▼           ▼
                                                config.js ◄───────────────────┘
```

**Cross-module imports** (beyond app.js and config.js):
- `ui.js` → `room.js` (transitionToView)
- `spatial.js` → `furniture.js` (roomState, meshes, animateFurniture, furnitureData), `ui.js`
- `render.js` → `furniture.js` (furnitureData), `ui.js`
- `voice.js` → `spatial.js` (handleTextInstruction), `ui.js`
- `furniture.js` has no local imports (only Three.js from CDN)

## Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `index.html` | 61 | HTML shell. Defines the importmap for Three.js 0.160 from CDN. Contains all DOM elements (loading overlay, viewpoint bar, UI panel, render overlay, walk mode HUD). Single `<script type="module" src="app.js">` entry. |
| `app.js` | 231 | **Orchestrator.** Creates the Three.js scene, camera, renderer (with WebXR VR). Sets up OrbitControls + PointerLockControls (walk mode). Configures lighting (ambient, sun, fill, hemisphere, accent point, RectAreaLight window). Calls `init*()` on all modules. Runs the render loop via `setAnimationLoop`. |
| `config.js` | 14 | Dynamically imports the API key at load time via a sibling module. Exports `GEMINI_API_KEY`, model strings for all three APIs (`GEMINI_MODEL`, `IMAGE_MODEL`, `LIVE_API_MODEL`), and room dimension constants (`ROOM_WIDTH=5`, `ROOM_LENGTH=8`, `ROOM_HEIGHT=2.7`). Gracefully handles a missing key — a try/catch around the dynamic import means API features are disabled while 3D features work independently. |
| `room.js` | 208 | `buildRoom(scene)` — Constructs floor, ceiling, four walls (as Groups for visibility toggling), window with frame/glass, door with handle, baseboard trim. Exports `walls` for auto-hide. `transitionToView(name, duration)` — Animated camera transitions to preset viewpoints with ease-in-out cubic easing. `updateWallVisibility(camera, fpMode, fpLocked)` — Hides walls the camera is behind (prevents clipping in orbit mode), shows all in walk mode. Five preset views: corner, birdseye, entrance, window, side. |
| `furniture.js` | 254 | `furnitureData` — Array of 5 items (sofa, bed, desk, wardrobe, coffee_table) with id, label, dimensions, position, color. `roomState` — Mutable source of truth for positions (sent to spatial API). `meshes` — Three.js object references keyed by furniture ID. `initFurniture(scene, camera, loader)` — Loads glTF models (sofa, bed, wardrobe) with bounding-box normalization; builds procedural geometry for desk and coffee table; creates HTML labels. Falls back to colored boxes if model loading fails. `animateFurniture(id, x, z)` — Smooth ease-out repositioning (500ms). `undoLastMove(id)` — Pops from per-item position history (max 10 entries per item). |
| `ui.js` | 96 | DOM bindings for the bottom panel. `initUI({ onSend, onEnterFP, onExitFP })` — Wires send button, Enter key, viewpoint buttons, walk button. `setStatus(text)` / `setTranscript(instruction, response)` — Update status bar and transcript area. Uses `escapeHTML()` helper to sanitize user input before inserting into the DOM. Exports element accessors for other modules (`getTextInputElement`, `getMicButton`, `getRenderButton`). |
| `spatial.js` | 159 | `handleTextInstruction(text)` — The core reasoning function shared by text and voice input. Sends room state + instruction to Gemini 3.1 Pro with a system prompt. Parses the JSON response with null-safe candidate checking, filters actions to known furniture IDs only, clamps coordinates to room bounds accounting for each item's half-width and half-depth, then calls `animateFurniture()` for each action. Stores `lastRoomDescription` for render context. |
| `render.js` | 133 | `initRender(scene, camera, renderer)` — Binds the Render button. `handleRenderClick()` — Captures the canvas as JPEG (quality 0.85), builds a style prompt with furniture legend, POSTs to Gemini 3.1 Flash Image as img2img with null-safe response parsing. Displays the returned image in a fullscreen overlay. Toggle behavior (Render ↔ Back to 3D). |
| `voice.js` | 230 | `initVoice()` — Binds MIC button, auto-connects WebSocket on load (1s delay). `connectLiveAPI()` — Opens a WebSocket to Gemini Live API with audio response modality and input transcription enabled. Includes a 10-second connection timeout. Records PCM audio via ScriptProcessor, resamples to 16kHz, sends as base64 chunks. On `turnComplete`, feeds the transcribed text to `handleTextInstruction()` and awaits its completion (via `.then()/.catch()`) before resetting mic state. One auto-reconnect attempt on close. |
| `style.css` | 246 | Dark-themed UI. Loading overlay with fade-out transition, furniture labels with backdrop blur, viewpoint button bar, bottom control panel with transcript/input/buttons, API status dot, render overlay with fullscreen image, walk mode crosshair and instruction card. MIC button has four visual states (default/dimmed → ready/blue → recording/red with pulse animation → processing/grey). |

## Data Flow

### Text Instruction

```
User types "move the sofa near the window" → Send button
    │
    ▼
ui.js handleSend() → app.js onSend callback
    │
    ▼
spatial.js handleTextInstruction(text)
    │
    ├─ Build prompt: instruction + JSON.stringify(roomState)
    ├─ POST to Gemini 3.1 Pro (temperature: 0.2)
    ├─ Null-safe candidate extraction
    ├─ Parse JSON response (strip markdown fences as safety net)
    ├─ Filter actions to known furniture IDs
    ├─ Clamp coordinates: x to [halfW, ROOM_WIDTH - halfW]
    │                     z to [halfD, ROOM_LENGTH - halfD]
    │
    ▼
For each action:
    ├─ Update roomState.furniture[].x, .z
    ├─ furniture.js animateFurniture(id, x, z)  →  500ms ease-out
    │
    ▼
spatial.js stores lastRoomDescription (used by render)
ui.js setTranscript(instruction, user_message)
```

### Voice Instruction

```
User clicks MIC (state: ready) → startRecording()
    │
    ├─ getUserMedia → AudioContext → ScriptProcessor (4096 samples)
    ├─ Resample float32 → 16kHz int16 → base64
    ├─ Send via WebSocket as realtimeInput.mediaChunks
    │
User clicks STOP → stopRecording()
    │
    ▼
WebSocket receives serverContent.inputTranscription.text (accumulated)
    │
On serverContent.turnComplete:
    ├─ Concatenated transcript → handleTextInstruction(text)
    ├─ Await completion via .then()/.catch()
    └─ Reset mic state to ready
```

### Photorealistic Render

```
User clicks Render
    │
    ├─ renderer.render(scene, camera)
    ├─ canvas.toDataURL('image/jpeg', 0.85) → base64
    ├─ Build style prompt with furniture legend
    │
    ▼
POST to Gemini 3.1 Flash Image
    ├─ contents: [text prompt, inlineData: {mimeType: 'image/jpeg', data: base64}]
    ├─ generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    │
    ▼
Null-safe candidate extraction → parts.find(p => p.inlineData)
    ├─ Display as data URI in fullscreen overlay <img>
    └─ Toggle: "Back to 3D" / Escape to dismiss
```

## Initialization Order

`app.js` runs these in sequence on module load:

1. `RectAreaLightUniformsLib.init()` — Required before creating RectAreaLight
2. Create scene (sky-blue background `0x9ecfef`, exponential fog), camera (50 FOV), renderer (antialiased, shadow maps, ACES tone mapping, exposure 1.4)
3. Append canvas to document body
4. Enable WebXR VR, append VR button (positioned above UI panel)
5. Create OrbitControls (damped, zoom range 1–18) + PointerLockControls (pointer speed 0.8)
6. Add lighting: AmbientLight, DirectionalLight (sun, 2048 shadow map), DirectionalLight (fill), HemisphereLight, PointLight (accent), RectAreaLight (window)
7. `buildRoom(scene)` → `initViewpoints(camera, controls)` — Room geometry + viewpoint system
8. Set initial camera position: `(8, 5.5, -2)` looking at `(2.5, 0.5, 4)` (corner view)
9. `initFurniture(scene, camera, loader)` — Load glTF models, build fallback geometry
10. `initUI({ onSend, onEnterFP, onExitFP })` — Wire UI callbacks
11. `initRender(scene, camera, renderer)` — Bind render button
12. `initVoice()` — Bind MIC button, auto-connect WebSocket (1s delay)
13. Window resize handler
14. `renderer.setAnimationLoop(...)` — Starts the render loop (calls updateFPMovement, controls.update, updateWallVisibility, updateLabels, renderer.render every frame)

## State Management

**`roomState`** (exported from `furniture.js`) is the single source of truth for furniture positions. It is:
- Read by `spatial.js` to build API prompts (current positions)
- Written by `spatial.js` after receiving API responses (new positions)
- Structured as `{ room: { width, length, height }, furniture: [{ id, label, w, d, h, x, z, color }] }`

**`meshes`** (exported from `furniture.js`) maps furniture IDs to Three.js objects. Used by `animateFurniture()` to update 3D positions.

**`lastRoomDescription`** (exported from `spatial.js`) stores the most recent room description from the spatial API. Available for render context.

## Conventions

- **Init pattern:** Each module exports an `init*()` function that receives dependencies and wires event listeners. Note: several modules (ui.js, render.js, voice.js) cache DOM element references at import time via `getElementById`, but all event binding and behavior is deferred to their init functions.
- **No build tools:** All imports resolve via the importmap or relative paths. Serve from the project root.
- **CDN dependencies:** Only Three.js (and its addons) are loaded externally. No npm packages at runtime.
- **API key loading:** `config.js` uses a dynamic import with try/catch. If the imported module is missing, the key defaults to an empty string and API features are disabled while the 3D room works independently.
- **Coordinate origin:** (0,0,0) is the corner where the left wall meets the door wall at floor level. X increases toward the right wall, Z increases toward the window wall, Y increases toward the ceiling.
