# src/ Architecture

Developer reference for the RoomCast source modules. All files in this directory use ES modules loaded via the importmap defined in `index.html`.

## Module Map

```
index.html ──── (importmap: Three.js CDN) ──── <script type="module" src="app.js">
                                                        │
                                                        ▼
                                                      app.js  (orchestrator)
                                            ┌───┬──────┼──────────────────────────┐
                                            │   │      │      │      │      │     │
                                            ▼   ▼      ▼      ▼      ▼      ▼     ▼
                                         room furn  furn-   ui   spatial render voice
                                          .js  .js  inter  .js    .js    .js   .js
                                           │         act     │      │      │     │
                                           │         .js     │      ├──────┘     │
                                           │          │      │      │            │
                                           │          │      │      ▼            │
                                           │          ├──────┤   furniture.js    │
                                           │          │      │                   │
                                           ▼          ▼      ▼                   ▼
                                          config.js ◄────────┴───── env.js       │
                                            ▲                                    │
                                            └────────────────────────────────────┘
```

**Cross-module imports** (beyond app.js):
- `config.js` → `env.js` (dynamic import of `GEMINI_API_KEY`)
- `room.js` → `config.js` (room dimension constants)
- `furniture.js` → `config.js` (none — only Three.js CDN import)
- `ui.js` → `config.js` (`GEMINI_API_KEY`), `room.js` (`transitionToView`)
- `spatial.js` → `config.js` (`GEMINI_API_KEY`, `GEMINI_MODEL`, room dimensions), `furniture.js` (`roomState`, `meshes`, `animateFurniture`, `furnitureData`, `swapFurniture`), `ui.js` (`setStatus`, `setTranscript`)
- `render.js` → `config.js` (`GEMINI_API_KEY`, `IMAGE_MODEL`), `ui.js` (`setStatus`, `setTranscript`), `furniture-interact.js` (`getFurnitureRefParts`)
- `voice.js` → `config.js` (`GEMINI_API_KEY`, `GEMINI_MODEL`), `ui.js` (`setStatus`, `setTranscript`), `spatial.js` (`handleTextInstruction`)
- `furniture-interact.js` → `furniture.js` (`furnitureData`)

## Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `index.html` | 61 | HTML shell. Defines the importmap for Three.js 0.160 from CDN. Contains all DOM elements (loading overlay, label container, walk mode crosshair and instruction card, viewpoint bar with walk button, API status dot, render overlay, UI panel with transcript/input/buttons). Single `<script type="module" src="app.js">` entry. |
| `app.js` | 233 | **Orchestrator.** Creates the Three.js scene, camera, renderer (with WebXR VR). Sets up OrbitControls + PointerLockControls (walk mode with WASD movement, sprint, room-boundary clamping). Configures lighting (ambient, sun with 2048 shadow map, fill, hemisphere, accent point, RectAreaLight window). Calls `init*()` on all modules. Runs the render loop via `setAnimationLoop`. |
| `config.js` | 13 | Dynamically imports the API key from `env.js` (gitignored) via top-level `await`. Exports `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.1-pro-preview`), `IMAGE_MODEL` (`gemini-3-pro-image-preview`), and room dimension constants (`ROOM_WIDTH=5`, `ROOM_LENGTH=8`, `ROOM_HEIGHT=2.7`). Gracefully handles a missing `env.js` — a try/catch around the dynamic import means API features are disabled while 3D features work independently. |
| `env.js` | 2 | Gitignored file that exports `GEMINI_API_KEY`. Imported dynamically by `config.js`. |
| `room.js` | 280 | `buildRoom(scene)` — Constructs floor, ceiling, four walls (as Groups for visibility toggling), north wall with window opening (frame, sill, glass using MeshPhysicalMaterial with transmission), door on south wall with handle, baseboard trim on all walls, and an outdoor scene visible through the window (green ground plane, trees, distant buildings). Exports `walls` for auto-hide. `initViewpoints(camera, controls)` — Caches references. `transitionToView(name, duration)` — Animated camera transitions with ease-in-out cubic easing (cancellable). `updateWallVisibility(camera, fpMode, fpLocked)` — Hides walls the camera is behind in orbit mode; shows all in walk mode. Five preset views: corner, birdseye, entrance, window, side. |
| `furniture.js` | 419 | `furnitureData` — Array of 6 items (sofa, bed, desk, armchair, wardrobe, coffee_table) with id, label, dimensions (w/d/h), position (x/z), rotation (degrees), color. `MODEL_MAP` maps item IDs to glTF files (sofa→couch_pillows, bed→bed_double_A, wardrobe→cabinet_medium, armchair→chair_A). `SWAP_CATALOG` — Hardcoded alternative variants per item (sofa has Loveseat using couch.gltf). `roomState` — Mutable source of truth for positions/rotations (sent to spatial API). `meshes` — Three.js object references keyed by ID. `initFurniture(scene, camera, loader)` — Loads glTF models with bounding-box normalization; builds procedural geometry for desk (table top + cylindrical metal legs) and coffee table (top + shelf + legs); creates HTML labels; loading overlay dismissed when all models loaded. `animateFurniture(id, x, z, rotation)` — 500ms ease-out repositioning with rotation and shortest-path angle interpolation; snaps interrupted animations to target. `undoLastMove(id)` — Pops from per-item position history (max 10), also with shortest-path rotation. `swapFurniture(id)` — Cycles through `SWAP_CATALOG` variants: disposes old mesh (geometry+materials+textures), updates `furnitureData`/`roomState` dimensions and label, loads new glTF model, clears position history. Falls back to colored box on load failure. |
| `furniture-interact.js` | 338 | Click-to-upload reference images and hover highlighting for furniture. `initFurnitureInteract(scene, camera, renderer, meshes, fpModeGetter)` — Registers pointer event listeners. Uses raycasting to detect which furniture piece the pointer is over. On hover: sets emissive highlight (`0x333333`) on the hovered furniture's materials, changes cursor to pointer. On click (distinguished from drag via 5px threshold): opens a hidden `<input type="file" accept="image/*">` to upload a reference image. Uploaded images stored in `refImages` map as `{ base64, mime, dataUrl }`. A fixed-position indicator panel (bottom-right) shows thumbnails of all uploaded reference images with remove buttons. `getFurnitureRefParts()` — Called by `render.js` to get reference image data formatted as Gemini API parts (interleaved label text + inlineData). Disabled during first-person mode. Injects its own CSS styles into the document head. |
| `ui.js` | 106 | DOM bindings for the bottom panel. `initUI({ onSend, onEnterFP, onExitFP })` — Wires send button, Enter key, viewpoint buttons (each triggers `transitionToView` and calls `onExitFP`), walk button (toggles between enter/exit FP). API key indicator dot (green when key present). `handleSend()` — Disables input during async processing, calls `onSend` callback. `setStatus(text)` / `setTranscript(instruction, response)` — Update status bar and transcript area. Uses `escapeHTML()` helper (creates a text node via `div.textContent`) to sanitize user input before inserting into the DOM. Exports element accessors: `getTextInputElement()`, `getMicButton()`, `getRenderButton()`, `getTextInput()`, `clearTextInput()`. |
| `spatial.js` | 233 | `handleTextInstruction(text)` — The core reasoning function shared by text and voice input. Embeds a detailed system instruction covering room boundaries, named zones, default positions, rotation semantics (degrees 0-360), and furniture swap rules (with examples). Sends room state + instruction to Gemini 3.1 Pro (`temperature: 0.2`). `parseSpatialResponse()` — Strips markdown fences, validates required keys (`actions`, `room_description`, `user_message`), filters actions to known furniture IDs, clamps coordinates to room bounds (with special handling for swap actions that skip dimension-based clamping), normalizes rotation to 0-360. For each action: updates `roomState` position/rotation, calls `swapFurniture()` if `action.swap` is true, otherwise calls `animateFurniture()`. Exports `lastRoomDescription` and `isBusy()` guard. |
| `render.js` | 264 | `initRender(scene, camera, renderer)` — Binds the Render button and Escape key handler. `handleRenderClick()` — Toggle behavior (Render / Back to 3D). `captureCanvas()` — Captures the Three.js canvas at 2x resolution (temporarily upscales pixel ratio) as JPEG (quality 0.95). `captureTopView()` — Temporarily moves camera to birdseye position, captures as JPEG (quality 0.85), restores camera. Builds a detailed img2img style prompt describing photorealistic materials and lighting. Assembles API request parts: furniture reference images first (from `getFurnitureRefParts()`), then style prompt, then top-view image, then main screenshot. Computes closest Gemini-supported aspect ratio from canvas dimensions (14 presets from 1:8 to 8:1). POSTs to image model with `responseModalities: ['TEXT', 'IMAGE']` and `imageSize: '2K'`. Logs timing, part types, and output dimensions. Displays returned image in fullscreen overlay with auto-fading hint. |
| `voice.js` | 165 | `initVoice()` — Binds MIC button click handler. Uses MediaRecorder API (not WebSocket). Three mic states: idle (blue MIC), recording (red STOP with pulse), processing (grey disabled). `startRecording()` — Requests microphone via `getUserMedia`, creates MediaRecorder, collects audio chunks. `stopRecording()` — Stops recorder, releases mic tracks. `processAudio()` — Converts audio blob to base64, sends to Gemini 3.1 Pro (same model as spatial) with a transcription prompt (`temperature: 0.0`), extracts transcript text, then calls `handleTextInstruction()` to execute the voice command. |
| `style.css` | 246 | Dark-themed UI. Loading overlay with fade-out transition, furniture labels with backdrop blur, viewpoint button bar (pill-shaped, active states: blue for views, green for walk), bottom control panel with transcript (blue instructions / green replies) + input + buttons, API status dot (grey/green), render overlay with fullscreen image and fade-out hint, walk mode crosshair (CSS-drawn cross) and instruction card with kbd styling. MIC button has three visual states: ready (blue) / recording (red with pulse animation) / processing (grey). Send button is blue, render button is purple. |

## Data Flow

### Text Instruction

```
User types "move the sofa near the window" → Send button
    │
    ▼
ui.js handleSend() → disables input → app.js onSend callback
    │
    ▼
spatial.js handleTextInstruction(text)
    │
    ├─ Guard: return early if busy or no API key
    ├─ Build prompt: instruction + JSON.stringify(roomState)
    ├─ POST to Gemini 3.1 Pro (temperature: 0.2, system instruction)
    ├─ Null-safe candidate extraction
    ├─ parseSpatialResponse():
    │    ├─ Strip markdown fences
    │    ├─ Validate required keys (actions, room_description, user_message)
    │    ├─ Filter actions to known furniture IDs
    │    ├─ Clamp coordinates: x to [halfW, ROOM_WIDTH - halfW]
    │    │                     z to [halfD, ROOM_LENGTH - halfD]
    │    │   (swap actions use basic 0-to-max clamp instead)
    │    └─ Normalize rotation to 0-360
    │
    ▼
For each action:
    ├─ Update roomState.furniture[].x, .z, .rotation
    ├─ If action.swap → furniture.js swapFurniture(id)
    │   └─ Dispose old mesh, load new glTF, update data/labels
    ├─ Else → furniture.js animateFurniture(id, x, z, rotation)
    │   └─ 500ms ease-out with shortest-path rotation
    │
    ▼
spatial.js stores lastRoomDescription
ui.js setTranscript(instruction, user_message)
ui.js re-enables input
```

### Voice Instruction

```
User clicks MIC (state: idle/ready)
    │
    ▼
voice.js startRecording()
    ├─ getUserMedia({ audio: true })
    ├─ Create MediaRecorder, collect data chunks
    ├─ Set mic state to "recording" (red STOP button)
    │
User clicks STOP
    │
    ▼
voice.js stopRecording() → MediaRecorder.stop()
    ├─ Stop all mic tracks
    ├─ Set mic state to "processing"
    │
    ▼
voice.js processAudio(blob, mimeType)
    ├─ Convert blob to base64 via FileReader
    ├─ POST to Gemini 3.1 Pro with transcription prompt
    │   (inlineData audio + text: "Transcribe exactly as spoken")
    │   (temperature: 0.0)
    ├─ Extract transcript text from response
    │
    ▼
spatial.js handleTextInstruction(transcript)
    └─ (same flow as Text Instruction above)
    │
    ▼
voice.js resets mic state to idle
```

### Photorealistic Render

```
User clicks Render
    │
    ├─ captureCanvas(): upscale to 2x pixel ratio, render, capture JPEG 0.95, restore
    ├─ captureTopView(): move camera to birdseye, capture JPEG 0.85, restore camera
    ├─ Build detailed img2img style prompt (materials, lighting, camera lens)
    ├─ getFurnitureRefParts() from furniture-interact.js
    │
    ▼
Assemble API request parts (order matters):
    1. Reference image parts (if any) — interleaved label + inlineData
    2. Extra prompt: "extract only color/texture/material from swatches"
    3. Style prompt + "render from the camera angle of the final image"
    4. Top-down birdseye JPEG (spatial reference)
    5. Main screenshot JPEG (edit target — last image)
    │
    ▼
Compute closest Gemini-supported aspect ratio from canvas size
POST to image model (gemini-3-pro-image-preview)
    ├─ generationConfig: { responseModalities: ['TEXT','IMAGE'],
    │                      imageConfig: { aspectRatio, imageSize: '2K' } }
    │
    ▼
Null-safe candidate extraction → parts.find(p => p.inlineData)
    ├─ Display as data URI in fullscreen overlay <img>
    ├─ Log timing, part types, output dimensions
    └─ Toggle: "Back to 3D" / Escape to dismiss
```

### Furniture Reference Image Upload

```
User hovers over furniture in 3D view
    │
    ▼
furniture-interact.js onPointerMove()
    ├─ Raycast against all furniture meshes
    ├─ Set emissive highlight (0x333333) on hovered item
    ├─ Show pointer cursor
    │
User clicks furniture (not a drag)
    │
    ▼
furniture-interact.js onPointerUp()
    ├─ Raycast → identify furniture ID
    ├─ Open file picker (<input type="file" accept="image/*">)
    │
User selects image
    │
    ▼
fileInput change event
    ├─ Read file as dataURL via FileReader
    ├─ Store { base64, mime, dataUrl } in refImages map
    ├─ Render indicator card (thumbnail + label + remove button)
    │
    ▼
On next Render click: getFurnitureRefParts() provides data to render.js
```

## Initialization Order

`app.js` runs these in sequence on module load:

1. `RectAreaLightUniformsLib.init()` — Required before creating RectAreaLight
2. Create scene (sky-blue background `0x9ecfef`, exponential fog `0.015`), camera (50 FOV), renderer (antialiased, `preserveDrawingBuffer: true`, shadow maps PCFSoft, ACES tone mapping, exposure 1.4, SRGB output)
3. Append canvas to document body
4. Enable WebXR VR (`local-floor` reference space), append VR button (positioned above UI panel at `bottom: 80px`)
5. Create OrbitControls (damped `0.08`, zoom range 1-18) + PointerLockControls (pointer speed 0.8)
6. Set up walk mode: WASD key listeners, click-to-lock, pointer lock/unlock handlers, room-boundary clamping (`ROOM_PAD=0.3`), eye height 1.6m, move speed 3.0, sprint 2x
7. Add lighting: AmbientLight (warm `0xffeedd`, 0.4), DirectionalLight sun (`0xffd68a`, 1.6, 2048 shadow map), DirectionalLight fill (`0x8ab4f8`, 0.4), HemisphereLight (`0xffd68a`/`0x3a3a5c`, 0.5), PointLight accent (`0xffaa44`, 0.6), RectAreaLight window (`0xfff4e0`, 2.0)
8. `buildRoom(scene)` + `initViewpoints(camera, controls)` — Room geometry + viewpoint system
9. Set initial camera position: `(8, 5.5, -2)` looking at `(2.5, 0.5, 4)` (corner view)
10. `initFurniture(scene, camera, loader)` — Load glTF models, build fallback geometry
11. `initUI({ onSend: handleTextInstruction, onEnterFP, onExitFP })` — Wire UI callbacks
12. `initRender(scene, camera, renderer)` — Bind render button
13. `initVoice()` — Bind MIC button click handler
14. `initFurnitureInteract(scene, camera, renderer, meshes, () => fpMode)` — Wire furniture click/hover
15. Window resize handler
16. `renderer.setAnimationLoop(...)` — Starts the render loop (calls `updateFPMovement`, `controls.update`, `updateWallVisibility`, `updateLabels`, `renderer.render` every frame)

## State Management

**`roomState`** (exported from `furniture.js`) is the single source of truth for furniture positions. It is:
- Read by `spatial.js` to build API prompts (current positions)
- Written by `spatial.js` after receiving API responses (new positions/rotations)
- Structured as `{ room: { width, length, height }, furniture: [{ id, label, w, d, h, x, z, rotation, color }] }`

**`furnitureData`** (exported from `furniture.js`) is the original array of furniture definitions. Mutated by `swapFurniture()` when a variant is applied (label, dimensions, color updated in both `furnitureData` and `roomState`).

**`meshes`** (exported from `furniture.js`) maps furniture IDs to Three.js objects. Used by `animateFurniture()` and `undoLastMove()` to update 3D positions, and by `furniture-interact.js` for raycasting.

**`swapState`** (private in `furniture.js`) tracks the current variant index per item ID for the swap catalog cycling.

**`positionHistory`** (private in `furniture.js`) stores per-item position/rotation history (max 10 entries) for undo.

**`pendingTarget`** (private in `furniture.js`) tracks in-flight animation targets so interrupted animations snap to their intended position.

**`refImages`** (private in `furniture-interact.js`) stores uploaded reference images per furniture ID as `{ base64, mime, dataUrl }`. Read by `getFurnitureRefParts()` during render.

**`lastRoomDescription`** (exported from `spatial.js`) stores the most recent room description from the spatial API. Available for render context.

**`_busy`** (private in `spatial.js`, exposed via `isBusy()`) prevents concurrent spatial reasoning calls.

## Conventions

- **Init pattern:** Each module exports an `init*()` function that receives dependencies and wires event listeners. Note: several modules (ui.js, render.js, voice.js, furniture-interact.js) cache DOM element references at import time via `getElementById` or `createElement`, but all event binding and behavior is deferred to their init functions.
- **No build tools:** All imports resolve via the importmap or relative paths. Serve from the project root.
- **CDN dependencies:** Only Three.js 0.160 (and its addons: OrbitControls, PointerLockControls, GLTFLoader, RectAreaLightUniformsLib, VRButton) are loaded externally. No npm packages at runtime.
- **API key loading:** `config.js` uses a dynamic `import('./env.js')` with try/catch. If `env.js` is missing, the key defaults to an empty string and API features are disabled while the 3D room works independently.
- **Coordinate origin:** (0,0,0) is the corner where the left wall meets the door wall at floor level. X increases toward the right wall (0-5), Z increases toward the window wall (0-8), Y increases toward the ceiling (0-2.7).
- **Rotation convention:** Degrees (0-360) in data model and spatial prompt, converted to radians for Three.js. 0 = facing north (window), 90 = facing left, 180 = facing south (door), 270 = facing right.
- **Animation interruption:** Both `animateFurniture()` and `undoLastMove()` snap any in-flight animation to its target before starting a new one, preventing position drift.
- **GPU cleanup:** `swapFurniture()` traverses the old mesh tree to dispose all geometries, materials, and textures before removing from scene.
