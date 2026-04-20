/**
 * Renderer Config — constants, sprite settings, state maps
 */

// Single source of truth
import AVATAR_FILES_JSON from '../../assets/shared/avatars.json?raw';
import SPRITE_JSON from '../../assets/shared/sprite-frames.json?raw';

const AVATAR_FILES_DATA = JSON.parse(AVATAR_FILES_JSON) as { allFiles?: string[] } | string[];
const SPRITE_DATA = JSON.parse(SPRITE_JSON) as {
  sheet: { cols: number; rows: number; frameWidth: number; frameHeight: number };
  frames: Record<string, number[]>;
};

// --- Sprite sheet settings ---
// srcWidth/srcHeight = actual pixel size in the image file (from JSON)
// width/height = CSS display size (matches .agent-character in styles.css)
export const SHEET = {
  cols: SPRITE_DATA.sheet.cols,
  rows: SPRITE_DATA.sheet.rows,
  srcWidth: SPRITE_DATA.sheet.frameWidth,
  srcHeight: SPRITE_DATA.sheet.frameHeight,
  width: 48,
  height: 64,
};

// --- Animation sequences (mapped from shared frame definitions) ---
const F = SPRITE_DATA.frames;
export const ANIM_SEQUENCES = {
  working:  { frames: F.front_done_dance, fps: 8, loop: true },
  complete: { frames: F.front_alert_jump, fps: 4, loop: true },
  waiting:  { frames: F.front_idle,       fps: 4, loop: true },
  alert:    { frames: F.front_alert_jump, fps: 4, loop: true },
};

// --- State-to-config mapping ---
export const stateConfig = {
  'Working': { anim: 'working', class: 'state-working', label: 'Working...' },
  'Thinking': { anim: 'working', class: 'state-working', label: 'Thinking...' },
  'Done': { anim: 'complete', class: 'state-complete', label: 'Done!' },
  'Waiting': { anim: 'waiting', class: 'state-waiting', label: 'Waiting...' },
  'Error': { anim: 'alert', class: 'state-alert', label: 'Error!' },
  'Help': { anim: 'alert', class: 'state-alert', label: 'Help!' },
  'Offline': { anim: 'waiting', class: 'state-offline', label: 'Offline' }
};

// --- Shared agent data ---
export const lastAgents = [];

// --- Per-agent state management ---
export const agentStates = new Map();

// --- Avatar management ---
// Loaded from assets/shared/avatars.json (single source of truth)
export const AVATAR_FILES = Array.isArray(AVATAR_FILES_DATA)
  ? AVATAR_FILES_DATA
  : (AVATAR_FILES_DATA.allFiles || []);
export const agentAvatars = new Map();

/** Agent ID -> deterministic avatar filename (produces same result as office view) */
export function avatarFromAgentId(id) {
  let hash = 0;
  const str = id || '';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_FILES[Math.abs(hash) % AVATAR_FILES.length];
}
