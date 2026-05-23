// ─────────────────────────────────────────────────────────────
// CryoVFX.js – Ayaka's ice/Cryo visual effects layer.
//   • ambient aura   – always-on floating ice crystals
//   • collision burst – sharp ice shards exploding outward
//   • skill effect    – Soumetsu ice cyclone ring
// ─────────────────────────────────────────────────────────────
import { Container } from 'pixi.js';
import { ParticleSystem } from './ParticleSystem.js';
import { CRYO_GRADIENT, CRYO_COLORS, HYOUKA_BURST_GRADIENT } from './ElementalColors.js';

export class CryoVFX {
  /**
   * @param {object} [opts]
   * @param {number} [opts.poolSize=400]
   */
  constructor({ poolSize = 400 } = {}) {
    this.container = new Container();

    // ── sub-systems (separate pools for layering control)
    this._ambient = new ParticleSystem({ poolSize: 80 });
    this._burst   = new ParticleSystem({ poolSize: 150 });
    this._skill   = new ParticleSystem({ poolSize: 200 });

    // Additive layer sits on top
    this.container.addChild(this._ambient.container);
    this.container.addChild(this._burst.container);
    this.container.addChild(this._skill.container);

    // Continuous emitter handle for the ambient aura
    this._ambientHandle = null;

    // Skill animation state
    this._skillActive = false;
    this._skillTimer = 0;
    this._skillX = 0;
    this._skillY = 0;
    this._skillAngle = 0;
  }

  // ── Ambient aura ──────────────────────────────────────────

  /**
   * Call every frame to keep the ambient aura alive around (x, y).
   *
   * @param {number} x  character centre x
   * @param {number} y  character centre y
   * @param {number} delta  ticker delta
   */
  updateAmbient(x, y, delta) {
    // Lazy-create the continuous emitter
    if (!this._ambientHandle) {
      this._ambientHandle = this._ambient.emitContinuous(x, y, {
        rate: 0.5,            // ~1 particle every 2 frames
        count: 1,
        speedMin: 0.15,
        speedMax: 0.5,
        spreadAngle: Math.PI * 2,
        angleCenter: -Math.PI / 2,
        lifetimeMin: 50,
        lifetimeMax: 90,
        sizeMin: 1,
        sizeMax: 2.5,
        startAlpha: 0.5,
        endAlpha: 0,
        gravity: -0.01,      // gently float upward
        blendMode: 'add',
        gradient: CRYO_GRADIENT,
        shrink: false,
      });
    }

    // Track character position
    this._ambientHandle.x = x + (Math.random() - 0.5) * 30;
    this._ambientHandle.y = y + (Math.random() - 0.5) * 30;

    this._ambient.update(delta);
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Trigger an ice-shard burst at (x, y).
   */
  triggerCollision(x, y) {
    // Sharp radial shards
    this._burst.emit(x, y, {
      count: 18 + Math.floor(Math.random() * 8), // 18-25
      speedMin: 2,
      speedMax: 6,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.5,
      sizeMax: 4,
      startAlpha: 1,
      endAlpha: 0,
      gravity: 0.02,
      blendMode: 'add',
      gradient: CRYO_GRADIENT,
      shrink: true,
    });

    // Tiny sparkle cloud (secondary layer, very small)
    this._burst.emit(x, y, {
      count: 8,
      speedMin: 0.5,
      speedMax: 1.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 10,
      lifetimeMax: 20,
      sizeMin: 0.5,
      sizeMax: 1.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      color: CRYO_COLORS.white,
      shrink: true,
    });
  }

  // ── Skill effect – Soumetsu ice cyclone ──────────────────

  /**
   * Trigger the Hyouka ice bloom explosion.
   * A single, massive outward explosion of sharp ice spikes. No lingering/swirling effects!
   */
  triggerHyoukaBurst(x, y) {
    // Sharp radial spikes bursting outward — vivid icy-blue palette
    this._burst.emit(x, y, {
      count: 45, // high density for massive impact
      speedMin: 3.5,
      speedMax: 8.5, // fast explosive launch speed
      spreadAngle: Math.PI * 2,
      lifetimeMin: 25,
      lifetimeMax: 45,
      sizeMin: 3.0,
      sizeMax: 7.0, // large ice spikes
      startAlpha: 1.0,
      endAlpha: 0.0,
      gravity: 0.03, // fall down slightly
      blendMode: 'normal',
      gradient: HYOUKA_BURST_GRADIENT,
      shrink: true,
    });

    // Secondary bright icy-blue flash cloud overlay
    this._burst.emit(x, y, {
      count: 15,
      speedMin: 1.0,
      speedMax: 3.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 1.5,
      sizeMax: 4.0,
      startAlpha: 0.9,
      endAlpha: 0,
      blendMode: 'normal',
      color: 0x4fc3f7, // vivid cryo sky-blue flash
      shrink: true,
    });
  }

  /**
   * Trigger the big ice cyclone skill at (x, y).
   * The effect self-animates over ~2 seconds via updateSkill().
   */
  triggerSkill(x, y) {
    this._skillActive = true;
    this._skillTimer = 0;
    this._skillX = x;
    this._skillY = y;
    this._skillAngle = 0;

    // Initial flash burst
    this._skill.emit(x, y, {
      count: 30,
      speedMin: 1,
      speedMax: 3,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 20,
      lifetimeMax: 40,
      sizeMin: 2,
      sizeMax: 5,
      startAlpha: 1,
      endAlpha: 0,
      blendMode: 'add',
      gradient: CRYO_GRADIENT,
      shrink: true,
    });
  }

  /**
   * Call every frame. Drives the cyclone animation if active.
   * Optionally tracks a moving target coordinate (x, y) if passed.
   */
  updateSkill(delta, x, y) {
    this._burst.update(delta);
    this._skill.update(delta);

    if (!this._skillActive) return;

    if (x !== undefined && y !== undefined) {
      this._skillX = x;
      this._skillY = y;
    }

    this._skillTimer += delta;
    this._skillAngle += 0.12 * delta;

    const duration = 120; // ~2 seconds at 60 fps
    const progress = this._skillTimer / duration;

    if (progress >= 1) {
      this._skillActive = false;
      return;
    }

    // Expanding ring of swirling particles
    const radius = 20 + progress * 80; // expand from 20 → 100 px
    const spokes = 6;
    for (let s = 0; s < spokes; s++) {
      const a = this._skillAngle + (Math.PI * 2 * s) / spokes;
      const px = this._skillX + Math.cos(a) * radius;
      const py = this._skillY + Math.sin(a) * radius;

      this._skill.emit(px, py, {
        count: 2,
        speedMin: 0.3,
        speedMax: 1.5,
        spreadAngle: Math.PI * 0.6,
        angleCenter: a + Math.PI / 2, // tangent to ring
        lifetimeMin: 15,
        lifetimeMax: 40,
        sizeMin: 1.5,
        sizeMax: 4,
        startAlpha: 0.9,
        endAlpha: 0,
        gravity: -0.01,
        blendMode: 'add',
        gradient: CRYO_GRADIENT,
        shrink: true,
      });
    }

    // Occasional large centre glow pulses
    if (Math.random() < 0.3) {
      this._skill.emit(this._skillX, this._skillY, {
        count: 3,
        speedMin: 0.2,
        speedMax: 0.8,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 10,
        lifetimeMax: 25,
        sizeMin: 3,
        sizeMax: 6,
        startAlpha: 0.6,
        endAlpha: 0,
        blendMode: 'add',
        color: CRYO_COLORS.accent,
        shrink: true,
      });
    }
  }

  // ── Lifecycle helpers ────────────────────────────────────

  /** Whether the cyclone skill is still running. */
  get skillActive() {
    return this._skillActive;
  }

  /** Destroy everything. */
  destroy() {
    this._ambient.destroy();
    this._burst.destroy();
    this._skill.destroy();
    this.container.destroy({ children: true });
  }
}
