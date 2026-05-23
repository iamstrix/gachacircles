// ─────────────────────────────────────────────────────────────
// ElementalColors.js – Color palettes & gradient helpers for
// Cryo and Pyro elemental VFX
// ─────────────────────────────────────────────────────────────

/**
 * Hex colour constants used across all VFX layers.
 * Each element defines colours for the full lifecycle of a particle:
 *   birth → mid1 → mid2 → death
 */
export const CRYO_COLORS = {
  white:    0xffffff,
  iceBlue:  0xb4e1fa,
  cyan:     0x5ed4fc,
  deepBlue: 0x1a6dd4,
  accent:   0x9df0ff,  // bright accent for additive glow
  dark:     0x0c3366,  // darkest tint for trailing particles
};

export const PYRO_COLORS = {
  white:    0xffffff,
  gold:     0xffd966,
  orange:   0xff8c32,
  deepRed:  0xd42020,
  accent:   0xffe066,  // bright accent for additive glow
  dark:     0x7a1a1a,  // deep ember colour
};

/**
 * Lifecycle gradient arrays (0→1 mapped to life fraction).
 * Used by the particle system to interpolate colour over a particle's life.
 */
export const CRYO_GRADIENT = [
  { t: 0.0, color: CRYO_COLORS.white },
  { t: 0.25, color: CRYO_COLORS.iceBlue },
  { t: 0.55, color: CRYO_COLORS.cyan },
  { t: 1.0, color: CRYO_COLORS.deepBlue },
];

export const PYRO_GRADIENT = [
  { t: 0.0, color: PYRO_COLORS.white },
  { t: 0.2, color: PYRO_COLORS.gold },
  { t: 0.5, color: PYRO_COLORS.orange },
  { t: 1.0, color: PYRO_COLORS.deepRed },
];

// ── Helpers ──────────────────────────────────────────────────

/** Linearly interpolate a single 0-255 channel. */
function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Extract r, g, b from a 0xRRGGBB integer. */
function unpackRGB(hex) {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

/** Pack r, g, b back into a 0xRRGGBB integer. */
function packRGB(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

/**
 * Given a gradient array and a normalised life fraction (0 = just born,
 * 1 = about to die), return an interpolated 0xRRGGBB colour.
 *
 * @param {Array<{t:number, color:number}>} gradient
 * @param {number} lifeFraction  0..1
 * @returns {number} interpolated colour
 */
export function sampleGradient(gradient, lifeFraction) {
  const f = Math.max(0, Math.min(1, lifeFraction));

  // Find the two stops that bracket `f`
  for (let i = 0; i < gradient.length - 1; i++) {
    const a = gradient[i];
    const b = gradient[i + 1];
    if (f >= a.t && f <= b.t) {
      const segT = (f - a.t) / (b.t - a.t);
      const ca = unpackRGB(a.color);
      const cb = unpackRGB(b.color);
      return packRGB(
        lerpChannel(ca.r, cb.r, segT),
        lerpChannel(ca.g, cb.g, segT),
        lerpChannel(ca.b, cb.b, segT),
      );
    }
  }
  // Fallback – return last colour
  return gradient[gradient.length - 1].color;
}

/**
 * Convenience: get a colour for a given element at a specific life fraction.
 *
 * @param {'cryo'|'pyro'} element
 * @param {number} lifeFraction  0..1
 * @returns {number} colour as 0xRRGGBB
 */
export function getParticleColor(element, lifeFraction) {
  const gradient = element === 'cryo' ? CRYO_GRADIENT : PYRO_GRADIENT;
  return sampleGradient(gradient, lifeFraction);
}

/**
 * Get the full palette object for an element.
 */
export function getPalette(element) {
  return element === 'cryo' ? CRYO_COLORS : PYRO_COLORS;
}

/**
 * Convert 0xRRGGBB → CSS hex string.
 */
export function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
