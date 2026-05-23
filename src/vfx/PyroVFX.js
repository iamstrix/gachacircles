// ─────────────────────────────────────────────────────────────
// PyroVFX.js – Yoimiya's fire/Pyro visual effects layer.
//   • ambient aura   – always-on flickering embers rising upward
//   • collision burst – fire sparks spraying outward
//   • skill effect    – Ryuukin Saxifrage firework explosion
// ─────────────────────────────────────────────────────────────
import { Container } from 'pixi.js';
import { ParticleSystem } from './ParticleSystem.js';
import { PYRO_GRADIENT, PYRO_COLORS } from './ElementalColors.js';

export class PyroVFX {
  /**
   * @param {object} [opts]
   * @param {number} [opts.poolSize=400]
   */
  constructor({ poolSize = 400 } = {}) {
    this.container = new Container();

    this._ambient = new ParticleSystem({ poolSize: 80 });
    this._burst   = new ParticleSystem({ poolSize: 150 });
    this._skill   = new ParticleSystem({ poolSize: 250 });

    this.container.addChild(this._ambient.container);
    this.container.addChild(this._burst.container);
    this.container.addChild(this._skill.container);

    this._ambientHandle = null;

    // Skill animation state
    this._skillActive = false;
    this._skillTimer = 0;
    this._skillX = 0;
    this._skillY = 0;
    this._skillWave = 0;
  }

  // ── Ambient aura ──────────────────────────────────────────

  /**
   * Call every frame. Keeps flickering ember particles drifting
   * upward around the character at (x, y).
   */
  updateAmbient(x, y, delta) {
    if (!this._ambientHandle) {
      this._ambientHandle = this._ambient.emitContinuous(x, y, {
        rate: 0.6,
        count: 1,
        speedMin: 0.3,
        speedMax: 0.8,
        spreadAngle: Math.PI * 0.6,
        angleCenter: -Math.PI / 2, // upward
        lifetimeMin: 35,
        lifetimeMax: 70,
        sizeMin: 0.8,
        sizeMax: 2.2,
        startAlpha: 0.7,
        endAlpha: 0,
        gravity: -0.02,   // float up
        blendMode: 'add',
        gradient: PYRO_GRADIENT,
        shrink: true,
      });
    }

    // Track position with a little random jitter
    this._ambientHandle.x = x + (Math.random() - 0.5) * 24;
    this._ambientHandle.y = y + (Math.random() - 0.5) * 18;

    this._ambient.update(delta);
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Trigger a fire-spark burst at (x, y) on hit.
   */
  triggerCollision(x, y) {
    // Main spray
    this._burst.emit(x, y, {
      count: 18 + Math.floor(Math.random() * 8), // 18-25
      speedMin: 2.5,
      speedMax: 7,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 12,
      lifetimeMax: 30,
      sizeMin: 1,
      sizeMax: 3.5,
      startAlpha: 1,
      endAlpha: 0,
      gravity: 0.04,     // sparks arc downward
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
    });

    // Hot-white flash at centre
    this._burst.emit(x, y, {
      count: 5,
      speedMin: 0.2,
      speedMax: 0.6,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 6,
      lifetimeMax: 12,
      sizeMin: 3,
      sizeMax: 5,
      startAlpha: 1,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.white,
      shrink: true,
    });
  }

  // ── Skill effect – Ryuukin Saxifrage firework ────────────

  /**
   * Trigger the firework skill at (x, y).
   * Self-animates via updateSkill() over ~2.5 seconds in multiple waves.
   */
  triggerSkill(x, y) {
    this._skillActive = true;
    this._skillTimer = 0;
    this._skillX = x;
    this._skillY = y;
    this._skillWave = 0;

    // Initial golden flash
    this._skill.emit(x, y, {
      count: 25,
      speedMin: 2,
      speedMax: 5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 2,
      sizeMax: 5,
      startAlpha: 1,
      endAlpha: 0,
      gravity: 0.02,
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
    });
  }

  /**
   * Call every frame. Drives the firework animation if active.
   */
  updateSkill(delta) {
    this._burst.update(delta);
    this._skill.update(delta);

    if (!this._skillActive) return;

    this._skillTimer += delta;

    const duration = 150; // ~2.5 seconds at 60 fps
    const progress = this._skillTimer / duration;

    if (progress >= 1) {
      this._skillActive = false;
      return;
    }

    // Wave schedule: fire new radial bursts at certain progress marks
    const waveMarks = [0.0, 0.15, 0.35, 0.55, 0.75];
    if (this._skillWave < waveMarks.length && progress >= waveMarks[this._skillWave]) {
      this._skillWave++;
      this._fireFireworkWave();
    }

    // Continuous golden trailing sparks
    if (Math.random() < 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 60 * progress;
      const px = this._skillX + Math.cos(angle) * r;
      const py = this._skillY + Math.sin(angle) * r;

      this._skill.emit(px, py, {
        count: 1,
        speedMin: 0.1,
        speedMax: 0.5,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 10,
        lifetimeMax: 25,
        sizeMin: 1,
        sizeMax: 2.5,
        startAlpha: 0.8,
        endAlpha: 0,
        gravity: 0.03,
        blendMode: 'add',
        gradient: PYRO_GRADIENT,
        shrink: true,
      });
    }
  }

  /** Internal – fire one wave of the firework. */
  _fireFireworkWave() {
    const x = this._skillX + (Math.random() - 0.5) * 30;
    const y = this._skillY + (Math.random() - 0.5) * 30;

    // Radial burst – golden sparks
    this._skill.emit(x, y, {
      count: 20,
      speedMin: 3,
      speedMax: 7,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 25,
      lifetimeMax: 50,
      sizeMin: 1.5,
      sizeMax: 4,
      startAlpha: 1,
      endAlpha: 0,
      gravity: 0.05,
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
    });

    // Accent sparkles
    this._skill.emit(x, y, {
      count: 8,
      speedMin: 1,
      speedMax: 3,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 0.5,
      sizeMax: 1.5,
      startAlpha: 1,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.accent,
      shrink: true,
    });
  }

  // ── Lifecycle helpers ────────────────────────────────────

  get skillActive() {
    return this._skillActive;
  }

  destroy() {
    this._ambient.destroy();
    this._burst.destroy();
    this._skill.destroy();
    this.container.destroy({ children: true });
  }
}
