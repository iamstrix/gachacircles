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
 * Synthesize a highly satisfying, bouncy woodblock/rubber pop sound in real-time
 * whenever a circle bounces off the arena walls.
 * @param {number} [volume=0.18] - Playback volume
 */
export function playSynthBounce(volume = 0.18) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    // Triangle wave provides a clean, woody, warm round bounce tone
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    // Slide up rapidly to 700Hz to create a poppy rubberized rebound feel
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.045);

    gainNode.gain.setValueAtTime(volume, now);
    // Tight exponential fade-out to prevent pops
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch (e) {
    console.debug('Synth bounce failed:', e);
  }
}

/**
 * Synthesize a highly satisfying, hollow resin pool ball "clack" sound in real-time
 * whenever two character circles collide.
 * Combines high-pitched resin transients with a resonant hollow wood-body tock.
 * @param {number} [volume=0.38] - Playback volume
 */
export function playSynthClash(volume = 0.38) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. High-frequency resin "clink" (sine wave)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2100, now);
    osc1.frequency.exponentialRampToValueAtTime(1400, now + 0.015);
    
    gain1.gain.setValueAtTime(volume * 0.8, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // 2. Hollow pool ball body resonance (triangle wave)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(850, now);
    osc2.frequency.exponentialRampToValueAtTime(600, now + 0.035);
    
    gain2.gain.setValueAtTime(volume * 0.4, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // 3. Ultra-short impact transient (bandpass-filtered white noise)
    const bufferSize = ctx.sampleRate * 0.012; // 12ms noise puff
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1700; // Centered high-resonance wood/resin band
    filter.Q.value = 9.0; // High Q for hollow acoustic tock
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.95, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    
    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Trigger all layers
    osc1.start(now);
    osc2.start(now);
    noiseNode.start(now);

    // Stop nodes
    osc1.stop(now + 0.025);
    osc2.stop(now + 0.045);
    noiseNode.stop(now + 0.012);
  } catch (e) {
    console.debug('Synth clash failed:', e);
  }
}
