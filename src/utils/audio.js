/**
 * audio.js — Zero-latency audio loader and overlapping player utility
 */

const sfxCache = {};

/**
 * Preload an audio file so it is ready to play instantly.
 * @param {string} path - URL path to the audio file
 */
export function preloadSFX(path) {
  if (!sfxCache[path]) {
    try {
      const audio = new Audio(path);
      audio.preload = 'auto';
      // Load it immediately in the background
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
      sfxCache[path] = audioNode; // Cache it for next time
    }
    audioNode.volume = volume;
    audioNode.play().catch(e => {
      // Browser autoplay policy might block this until user interacts, which is normal
      console.debug(`Autoplay policy blocked audio play: ${path}`, e);
    });
  } catch (err) {
    console.warn(`Audio system failed playing: ${path}`, err);
  }
}
