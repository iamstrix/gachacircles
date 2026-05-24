/**
 * audio.js — Zero-latency audio loader and real-time Web Audio synth generator
 */

const sfxCache = {};
let audioCtx = null;

/**
 * Get or initialize the AudioContext lazily (respecting browser autoplay policies).
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Preload an audio file so it is ready to play instantly.
 * @param {string} path - URL path to the audio file
 */
export function preloadSFX(path) {
  if (!sfxCache[path]) {
    try {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.load();
      sfxCache[path] = audio;
    } catch (e) {
      console.warn(`Failed to preload audio: ${path}`, e);
    }
  }
}

/**
 * Play a sound effect from cache (cloned for overlap/polyphony support).
 * @param {string} path - URL path to the audio file
 * @param {number} [volume=0.6] - Playback volume (0.0 to 1.0)
 */
export function playSFX(path, volume = 0.6) {
  try {
    let audioNode;
    if (sfxCache[path]) {
      audioNode = sfxCache[path].cloneNode();
    } else {
      audioNode = new Audio(path);
      audioNode.preload = 'auto';
      sfxCache[path] = audioNode;
    }
    audioNode.volume = volume;
    audioNode.play().catch(e => {
      console.debug(`Autoplay policy blocked audio play: ${path}`, e);
    });
  } catch (err) {
    console.warn(`Audio system failed playing: ${path}`, err);
  }
}

/**
 * Play the circle-bounce WAV file for arena wall bounces.
 * @param {number} [volume=0.18] - Playback volume
 */
export function playSynthBounce(volume = 0.18) {
  playSFX('/audio/circle-bounce.wav', volume);
}

/**
 * Play the circle-bounce WAV file for character collisions.
 * @param {number} [volume=0.38] - Playback volume
 */
export function playSynthClash(volume = 0.38) {
  playSFX('/audio/circle-bounce.wav', volume);
}

/**
 * Play the circle-bounce WAV file for sword deflections and vortex shredding.
 * @param {number} [volume=0.28] - Playback volume
 */
export function playSynthDeflect(volume = 0.28) {
  playSFX('/audio/circle-bounce.wav', volume);
}

// ── Random Parry Sound System (no-repeat shuffle deck) ─────────────────────────
const PARRY_SOUNDS = [
  '/audio/ayaka/ayaka-parry_1.wav',
  '/audio/ayaka/ayaka-parry_2.wav',
  '/audio/ayaka/ayaka-parry_3.wav',
  '/audio/ayaka/ayaka-parry_4.wav',
];

let parryDeck = [];
let lastParryPlayed = null;

function shuffleParryDeck() {
  parryDeck = [...PARRY_SOUNDS];
  // Fisher-Yates shuffle
  for (let i = parryDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parryDeck[i], parryDeck[j]] = [parryDeck[j], parryDeck[i]];
  }
  // Ensure the first sound of the new deck isn't the same as the last sound of the previous deck
  if (parryDeck[0] === lastParryPlayed && parryDeck.length > 1) {
    // Swap with a random later position
    const swapIdx = 1 + Math.floor(Math.random() * (parryDeck.length - 1));
    [parryDeck[0], parryDeck[swapIdx]] = [parryDeck[swapIdx], parryDeck[0]];
  }
}

/**
 * Play a random parry sound effect from the shuffled deck.
 * Guarantees the same sound never plays twice in a row.
 * @param {number} [volume=0.5] - Playback volume
 */
export function playRandomParry(volume = 0.5) {
  if (parryDeck.length === 0) {
    shuffleParryDeck();
  }
  const sound = parryDeck.shift();
  lastParryPlayed = sound;
  playSFX(sound, volume);
}
