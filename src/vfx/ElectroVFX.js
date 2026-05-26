// ─────────────────────────────────────────────────────────────
// ElectroVFX.js – Keqing's Electro visual effects layer.
//   • ambient aura   – crackling violet sparks around Keqing
//   • collision burst – branching lightning arcs on hit
//   • skill effect    – Stellar Restoration teleport flash
//   • burst effect    – Starward Sword spiral lightning dance
// ─────────────────────────────────────────────────────────────
import { Container } from 'pixi.js';
import { ParticleSystem } from './ParticleSystem.js';
import {
  ELECTRO_GRADIENT,
  ELECTRO_TELEPORT_GRADIENT,
  ELECTRO_COLORS,
} from './ElementalColors.js';

export class ElectroVFX {
  /**
   * @param {object} [opts]
   * @param {number} [opts.poolSize=600]
   */
  constructor({ poolSize = 1000 } = {}) {
    this.container = new Container();

    // Sub-systems layered for visual depth
    this._ambient  = new ParticleSystem({ poolSize: 200 });
    this._burst    = new ParticleSystem({ poolSize: 1000 });
    this._skill    = new ParticleSystem({ poolSize: 600 });

    this.container.addChild(this._ambient.container);
    this.container.addChild(this._burst.container);
    this.container.addChild(this._skill.container);

    this._ambientHandle = null;

    // Skill / burst animation state
    this._skillActive  = false;
    this._skillTimer   = 0;
    this._skillX       = 0;
    this._skillY       = 0;

    this._burstActive  = false;
    this._burstTimer   = 0;
    this._burstX       = 0;
    this._burstY       = 0;
    this._burstSlash   = 0;  // how many slashes have fired
    this._burstAngle   = 0;
  }

  // ── Ambient aura ──────────────────────────────────────────

  /**
   * Call every frame to keep crackling violet sparks alive around (x, y).
   * @param {number} x  character centre x
   * @param {number} y  character centre y
   * @param {number} delta  ticker delta
   */
  updateAmbient(x, y, delta) {
    if (!this._ambientHandle) {
      this._ambientHandle = this._ambient.emitContinuous(x, y, {
        rate: 0.55,
        count: 1,
        speedMin: 0.2,
        speedMax: 0.7,
        spreadAngle: Math.PI * 2,
        angleCenter: -Math.PI / 2,
        lifetimeMin: 40,
        lifetimeMax: 80,
        sizeMin: 1,
        sizeMax: 2.2,
        startAlpha: 0.6,
        endAlpha: 0,
        gravity: -0.015,  // sparks rise slightly
        blendMode: 'add',
        gradient: ELECTRO_GRADIENT,
        shrink: true,
      });
    }

    // Crackle around the character with a bit of random jitter
    this._ambientHandle.x = x + (Math.random() - 0.5) * 28;
    this._ambientHandle.y = y + (Math.random() - 0.5) * 28;

    this._ambient.update(delta);
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Triggered when Keqing's sword connects.
   * Emits a sharp outward burst of lightning sparks.
   * @param {number} x
   * @param {number} y
   */
  triggerCollision(x, y) {
    this._burst.emit(x, y, {
      count: 18,
      speedMin: 1.5,
      speedMax: 5.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.2,
      sizeMax: 3.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    // A second tighter burst for the electric "zap" feel
    this._burst.emit(x, y, {
      count: 8,
      speedMin: 0.5,
      speedMax: 2.5,
      spreadAngle: Math.PI * 0.5,
      angleCenter: Math.random() * Math.PI * 2,
      lifetimeMin: 10,
      lifetimeMax: 22,
      sizeMin: 0.8,
      sizeMax: 2.0,
      startAlpha: 0.9,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    this._burst.update(0);
  }

  /**
   * Emit a trail of digital electro particles for the flying stiletto.
   */
  triggerStilettoTrail(x, y, angle) {
    this._skill.emit(x, y, {
      count: 2,
      speedMin: 0.5,
      speedMax: 2.0,
      spreadAngle: 0.4,
      angleCenter: angle + Math.PI, // emit behind
      lifetimeMin: 15,
      lifetimeMax: 25,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });
  }

  /**
   * Emit a directional streak of lightning representing Keqing's blink.
   */
  triggerTeleportStreak(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const steps = Math.ceil(dist / 15);

    for (let i = 0; i <= steps; i++) {
      const px = x1 + (dx * i) / steps;
      const py = y1 + (dy * i) / steps;
      this._skill.emit(px, py, {
        count: 3,
        speedMin: 0.2,
        speedMax: 1.5,
        spreadAngle: Math.PI * 2,
        angleCenter: 0,
        lifetimeMin: 10,
        lifetimeMax: 25,
        sizeMin: 1.5,
        sizeMax: 4.0,
        startAlpha: 1.0,
        endAlpha: 0,
        blendMode: 'add',
        gradient: ELECTRO_TELEPORT_GRADIENT,
        shrink: true,
      });
    }
  }

  /**
   * Emit multiple rapid criss-crossing lightning cuts for the CA detonation.
   */
  triggerThunderclapSlashes(x, y) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      this.triggerSlashArc(x, y, angle);
    }
  }

  // ── Sword infusion particles ──────────────────────────────

  /**
   * Emit violet trailing sparks from Keqing's sword tip during passive.
   * @param {number} x sword world X
   * @param {number} y sword world Y
   */
  triggerSwordInfusionParticles(x, y) {
    this._ambient.emit(x, y, {
      count: 2,
      speedMin: 0.3,
      speedMax: 1.2,
      spreadAngle: Math.PI * 0.8,
      angleCenter: Math.PI / 2,
      lifetimeMin: 18,
      lifetimeMax: 40,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
  }

  // ── Skill: Stellar Restoration ───────────────────────────

  /**
   * Phase 1 — throw stiletto: a quick sharp flash at the launch point.
   * @param {number} x  Keqing's position (origin of throw)
   * @param {number} y
   */
  triggerStilettoThrow(x, y) {
    this._skill.emit(x, y, {
      count: 14,
      speedMin: 1.0,
      speedMax: 4.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 12,
      lifetimeMax: 28,
      sizeMin: 1.0,
      sizeMax: 2.8,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });
    this._skill.update(0);
  }

  /**
   * Phase 2 — teleport detonation: massive electric nova at stiletto landing.
   * @param {number} x  stiletto X
   * @param {number} y  stiletto Y
   */
  triggerTeleportBurst(x, y) {
    // Large outer ring of violet sparks
    this._skill.emit(x, y, {
      count: 45,
      speedMin: 2.0,
      speedMax: 9.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 25,
      lifetimeMax: 55,
      sizeMin: 1.5,
      sizeMax: 4.5,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: -0.02,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // Dense inner white-hot core
    this._skill.emit(x, y, {
      count: 20,
      speedMin: 0.5,
      speedMax: 3.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 2.0,
      sizeMax: 5.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: [
        { t: 0.0, color: 0xffffff },
        { t: 0.5, color: 0xf48dff },
        { t: 1.0, color: 0xc77dff },
      ],
      shrink: false,
    });

    // Activate timed pulsing ring effect
    this._skillActive = true;
    this._skillTimer  = 0.5; // half-second afterglow
    this._skillX = x;
    this._skillY = y;

    this._skill.update(0);
  }

  // ── Burst: Starward Sword ────────────────────────────────

  /**
   * Triggered when the burst activates.
   * Begins the Starward Sword slash sequence animation.
   * @param {number} x  Keqing's position
   * @param {number} y
   */
  triggerStarwardSword(x, y) {
    this._burstActive = true;
    this._burstTimer  = 2.0; // total duration
    this._burstX = x;
    this._burstY = y;
    this._burstSlash = 0;
    this._burstAngle = 0;
  }

  /**
   * Starward explosion detonation — final massive blast at end of burst.
   * @param {number} x
   * @param {number} y
   */
  triggerStarwardExplosion(x, y) {
    // Massive outer ring
    this._skill.emit(x, y, {
      count: 80,
      speedMin: 3.0,
      speedMax: 14.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 30,
      lifetimeMax: 70,
      sizeMin: 2.0,
      sizeMax: 6.0,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: -0.01,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    // Bright inner core burst
    this._skill.emit(x, y, {
      count: 30,
      speedMin: 0.5,
      speedMax: 4.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 3.0,
      sizeMax: 8.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: false,
    });

    this._skill.update(0);
  }

  /**
   * Emit a single crescent lightning arc slash — called per burst slash.
   * @param {number} x  Keqing's position
   * @param {number} y
   * @param {number} angle  direction of slash
   */
  triggerSlashArc(x, y, angle) {
    const spread = Math.PI * 0.45;
    
    // Primary sharp lightning streaks
    this._burst.emit(x, y, {
      count: 25,
      speedMin: 4.0,
      speedMax: 12.0,
      spreadAngle: spread,
      angleCenter: angle,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 2.0,
      sizeMax: 5.5,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // Secondary wide additive glow for "impact" feel
    this._burst.emit(x, y, {
      count: 12,
      speedMin: 1.0,
      speedMax: 3.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 4.0,
      sizeMax: 8.5,
      startAlpha: 0.7,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    this._burst.update(0);
  }

  // ── Cast aura (for burst windup) ─────────────────────────

  /**
   * Dramatic buildup sparks around Keqing while charging burst.
   */
  triggerCastAura(x, y) {
    this._skill.emit(x, y, {
      count: 35,
      speedMin: 0.8,
      speedMax: 4.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 30,
      lifetimeMax: 60,
      sizeMin: 1.5,
      sizeMax: 4.0,
      startAlpha: 0.9,
      endAlpha: 0,
      gravity: -0.025,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
    this._skill.update(0);
  }

  /**
   * Dense sparks during burst cast windup (called per frame).
   */
  triggerWindupSparks(x, y) {
    this._burst.emit(x, y, {
      count: 3,
      speedMin: 0.5,
      speedMax: 3.0,
      spreadAngle: Math.PI * 2,
      angleCenter: -Math.PI / 2,
      lifetimeMin: 20,
      lifetimeMax: 40,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
    this._burst.update(0);
  }

  // ── Update skill & burst animations ─────────────────────

  /**
   * Called every frame from the main ticker to update timed effects.
   * @param {number} delta
   * @param {number} kx  Keqing's current x (tracked for burst follow)
   * @param {number} ky  Keqing's current y
   */
  updateSkill(delta, kx, ky) {
    // Skill afterglow ring
    if (this._skillActive) {
      this._skillTimer -= delta * 0.016;
      if (this._skillTimer <= 0) {
        this._skillActive = false;
      } else {
        // Emit a gentle fading ring of sparks at the detonation site
        const ring = this._skillTimer / 0.5;
        this._skill.emit(this._skillX, this._skillY, {
          count: Math.round(3 * ring),
          speedMin: 0.3,
          speedMax: 1.5,
          spreadAngle: Math.PI * 2,
          angleCenter: 0,
          lifetimeMin: 15,
          lifetimeMax: 30,
          sizeMin: 0.8,
          sizeMax: 2.0,
          startAlpha: ring * 0.6,
          endAlpha: 0,
          blendMode: 'add',
          gradient: ELECTRO_GRADIENT,
          shrink: true,
        });
      }
    }

    // Burst slash sequence
    if (this._burstActive && kx !== undefined) {
      this._burstTimer -= delta * 0.016;
      this._burstX = kx;
      this._burstY = ky;

      if (this._burstTimer <= 0) {
        this._burstActive = false;
      }
    }

    this._skill.update(delta);
    this._burst.update(delta);
  }
}
