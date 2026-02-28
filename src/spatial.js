// spatial.js — Gemini 3.1 Pro spatial reasoning (Spec 4)

import { GEMINI_API_KEY, GEMINI_MODEL, ROOM_WIDTH, ROOM_LENGTH } from './config.js';
import { roomState, meshes, animateFurniture, furnitureData, swapFurniture } from './furniture.js';
import { setStatus, setTranscript } from './ui.js';

const SPATIAL_SYSTEM_INSTRUCTION = `You are an interior design spatial reasoning engine for RoomCast.

You receive a voice instruction and the current room state JSON.
You output ONLY raw JSON. No markdown. No explanation. No code blocks. No backticks.

Room boundaries: X = 0 to 5, Z = 0 to 8
Coordinate convention: All x, z values refer to the CENTER of each item.

Named zones:
- "near the window" = Z 6.5 to 8.0 (north wall)
- "near the door / entrance" = Z 0 to 1.5 (south wall)
- "center of the room" = X ≈ 2.5, Z ≈ 4.0
- "left wall" = X close to 0 (accounting for item half-width)
- "right wall" = X close to 5 (accounting for item half-width)

Default positions (use these when the user says "reset" or "put it back"):
- sofa: x=1.5, z=2.0, rotation=0
- bed: x=3.0, z=5.0, rotation=0
- desk: x=1.0, z=6.5, rotation=0
- armchair: x=1.0, z=5.8, rotation=0
- wardrobe: x=4.0, z=1.0, rotation=0
- coffee_table: x=1.5, z=3.0, rotation=0

Rules:
- When the user asks to "reset" an item, move it to its default position listed above
- Only move items explicitly mentioned or clearly implied
- Keep all items within room boundaries, accounting for item width and depth from center
- Approximate positions are acceptable — precision is not required
- Do NOT add new furniture items. Only move items that already exist in the room state.
- Do NOT remove furniture items. If asked to remove something, return an empty actions array and explain in user_message.
- Do NOT rename furniture items or change their IDs
- If an instruction is ambiguous, make a reasonable design choice
- Rotation is in degrees (0–360) around the vertical (Y) axis. 0 = default orientation (facing toward +Z / north wall). 90 = facing left (-X). 180 = facing south. 270 = facing right (+X).
- The "rotation" field in actions is OPTIONAL — omit it if the item's rotation should not change.
- When the user says "face toward the window" (north wall), use rotation close to 0. "Face the door" (south wall) = 180. "Face left wall" = 90. "Face right wall" = 270.
- When the user says "rotate X degrees", ADD that amount to the item's current rotation and normalize to 0–360.

Furniture alternatives (available swaps):
- sofa can be swapped with: Loveseat (1.5m wide × 0.85m deep × 0.80m tall)
- No other items have alternatives currently.

Swap rules:
- When the user asks to "swap", "try something different", "try something smaller/bigger", "replace", or "change" the sofa, set "swap": true in the action for that item.
- Swap toggles between the current item and its alternative. If already swapped, swapping again returns to the original.
- You can combine a swap with a position change and/or rotation in the same action.
- When combining swap with a position change, use the ALTERNATIVE item's dimensions for boundary calculations (e.g., loveseat is 1.5m wide, not 2.2m).
- If the user asks to swap an item that has no alternatives (desk, armchair, bed, wardrobe, coffee_table), return an empty actions array and explain in user_message.

Output format — strictly this structure, nothing else:
{
  "actions": [
    {
      "id": "<id from furniture list>",
      "x": <number>,
      "z": <number>,
      "rotation": <number, optional, degrees 0-360>,
      "swap": <boolean, optional, true to swap item to its alternative>
    }
  ],
  "room_description": "<2-3 sentence natural language description of the full room in its updated state — written as an image generation prompt: include furniture positions, orientations, style, lighting, mood>",
  "user_message": "<one short friendly sentence confirming what was done — no JSON terminology>"
}

If multiple items need to move, include multiple objects in the actions array.
If nothing needs to move, return an empty actions array.

EXAMPLE 1 — Move + rotate:

User instruction: "Move the sofa near the window and rotate it to face the room"
Current room state includes: sofa at x:1.0 z:2.0 rotation:0 (width 2.2m, depth 0.9m)

Response:
{
  "actions": [
    {
      "id": "sofa",
      "x": 2.5,
      "z": 7.0,
      "rotation": 180
    }
  ],
  "room_description": "A 5m x 8m minimalist studio apartment with a north-facing window. A blue sofa is centered beneath the window, rotated to face the room. A queen bed sits in the middle of the room, a desk and armchair near the window on the left wall, a wardrobe near the entrance, and a coffee table in the southern half. Warm natural lighting streams through the window, casting soft shadows. Photorealistic interior design render.",
  "user_message": "Done — I moved the sofa to the window wall and rotated it to face the room."
}

EXAMPLE 2 — Swap + reposition:

User instruction: "Try a different sofa, something smaller, and put it against the left wall"
Current room state includes: sofa at x:1.5 z:2.0 rotation:0 (width 2.2m, depth 0.9m)

Response:
{
  "actions": [
    {
      "id": "sofa",
      "x": 0.75,
      "z": 2.0,
      "swap": true
    }
  ],
  "room_description": "A 5m x 8m minimalist studio apartment. A compact loveseat sits against the left wall near the entrance. A desk and armchair are by the window, a queen bed in the back half, a wardrobe near the door, and a coffee table in the center. Warm natural light, modern Scandinavian style. Photorealistic interior design render.",
  "user_message": "Done — I swapped the sofa for a compact loveseat and placed it against the left wall."
}`;

export let lastRoomDescription = '';

function parseSpatialResponse(responseText, knownIds) {
  let cleaned = responseText.trim();
  cleaned = cleaned.replace(/^```json?\s*\n?/, '');
  cleaned = cleaned.replace(/\n?```\s*$/, '');

  const parsed = JSON.parse(cleaned);

  if (!parsed.actions || !parsed.room_description || !parsed.user_message) {
    throw new Error('Missing required keys in response');
  }

  parsed.actions = parsed.actions.filter(a => knownIds.includes(a.id));

  for (const action of parsed.actions) {
    const item = roomState.furniture.find(f => f.id === action.id);
    // Skip dimension-based clamping for swap actions — the prompt tells Gemini
    // to use the alternative's dimensions, and the old item's halfW/halfD are wrong
    if (!action.swap && item) {
      const halfW = (item.w || item.width_m || 0) / 2;
      const halfD = (item.d || item.depth_m || 0) / 2;
      action.x = Math.max(halfW, Math.min(action.x, ROOM_WIDTH - halfW));
      action.z = Math.max(halfD, Math.min(action.z, ROOM_LENGTH - halfD));
    } else if (!action.swap) {
      action.x = Math.max(0, Math.min(action.x, ROOM_WIDTH));
      action.z = Math.max(0, Math.min(action.z, ROOM_LENGTH));
    } else {
      // For swaps, basic 0-to-max clamp only
      action.x = Math.max(0, Math.min(action.x, ROOM_WIDTH));
      action.z = Math.max(0, Math.min(action.z, ROOM_LENGTH));
    }

    // Normalize rotation to 0–360, default to current rotation if missing
    if (action.rotation != null) {
      action.rotation = ((action.rotation % 360) + 360) % 360;
    } else if (item) {
      action.rotation = item.rotation || 0;
    } else {
      action.rotation = 0;
    }
  }

  return parsed;
}

export async function handleTextInstruction(text) {
  if (!text.trim()) return;

  if (!GEMINI_API_KEY) {
    setTranscript(text, 'Please set your API key in config.js first.');
    return;
  }

  setStatus('Thinking...');
  setTranscript(text, 'Thinking...');

  const userMessage = 'Instruction: "' + text + '"\n\nCurrent room state:\n' + JSON.stringify(roomState);

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SPATIAL_SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
      throw new Error('API returned ' + response.status);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts.length) {
      throw new Error('Empty or filtered response from API');
    }
    const responseText = candidate.content.parts[0].text;
    const knownIds = roomState.furniture.map(f => f.id);
    const result = parseSpatialResponse(responseText, knownIds);

    for (const action of result.actions) {
      const item = roomState.furniture.find(f => f.id === action.id);
      if (item) {
        // Update position/rotation in roomState BEFORE swap
        // (swapFurniture reads these to place the new model)
        item.x = action.x;
        item.z = action.z;
        item.rotation = action.rotation;
        if (action.swap) {
          swapFurniture(action.id);
        } else {
          animateFurniture(action.id, action.x, action.z, action.rotation);
        }
      }
    }

    lastRoomDescription = result.room_description;
    setTranscript(text, result.user_message);
    setStatus('Ready');

  } catch (err) {
    console.error('Spatial reasoning error:', err);
    if (err instanceof SyntaxError || err.message.includes('Missing required keys')) {
      setTranscript(text, 'Could not understand that instruction. Please try again.');
    } else {
      setTranscript(text, 'API error. Please try again.');
    }
    setStatus('Ready');
  }
}
