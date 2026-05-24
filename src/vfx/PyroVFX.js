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

  /**
   * Spawns particle trails behind flaming projectiles.
   */
  triggerArrowTrail(x, y, isKindlingSpark) {
    if (isKindlingSpark) {
      // Dense burning particles and sparkles for homing embers!
      this._ambient.emit(x, y, {
        count: 5,
        speedMin: 0.2,
        speedMax: 1.8,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 25,
        lifetimeMax: 50,
        sizeMin: 1.5,
        sizeMax: 3.5,
        startAlpha: 0.85,
        endAlpha: 0,
        blendMode: 'add',
        color: PYRO_COLORS.brightGold,
        shrink: true,
      });
      // Additional fast, sizzling orange sparks
      this._burst.emit(x, y, {
        count: 3,
        speedMin: 1.5,
        speedMax: 4.0,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 15,
        lifetimeMax: 35,
        sizeMin: 2,
        sizeMax: 4.5,
        blendMode: 'add',
        color: PYRO_COLORS.vividOrange,
        shrink: true,
      });
    } else {
      // Normal flaming arrow trail
      this._ambient.emit(x, y, {
        count: 1,
        speedMin: 0.1,
        speedMax: 0.5,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 15,
        lifetimeMax: 30,
        sizeMin: 1.0,
        sizeMax: 2.5,
        startAlpha: 0.6,
        endAlpha: 0,
        blendMode: 'add',
        color: PYRO_COLORS.vividOrange,
        shrink: true,
      });
    }
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Trigger the Pyro infusion (E skill) activation burst at (x, y).
   * A sharp, focused burst of fiery orange particles.
   */
  triggerInfusion(x, y) {
    // 1. Layer: Vivid Orange (Main body, high visibility)
    this._burst.emit(x, y, {
      count: 35,
      speedMin: 4,
      speedMax: 11,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 25,
      lifetimeMax: 50,
      sizeMin: 4,
      sizeMax: 8,
      blendMode: 'normal', // Use normal to keep saturation on light background
      color: PYRO_COLORS.vividOrange,
      shrink: true,
    });

    // 2. Layer: Blood Orange (Deep contrast)
    this._burst.emit(x, y, {
      count: 25,
      speedMin: 2,
      speedMax: 8,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 30,
      lifetimeMax: 60,
      sizeMin: 3,
      sizeMax: 6,
      blendMode: 'normal',
      color: PYRO_COLORS.bloodOrange,
      shrink: true,
    });

    // 3. Layer: Dark/Charred (Small, high contrast "embers")
    this._burst.emit(x, y, {
      count: 20,
      speedMin: 1.5,
      speedMax: 5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 40,
      lifetimeMax: 70,
      sizeMin: 2,
      sizeMax: 4,
      blendMode: 'normal',
      color: PYRO_COLORS.dark,
      shrink: true,
    });
    
    // 4. Layer: Bright Flash (Additive glow)
    this._burst.emit(x, y, {
      count: 2,
      speedMin: 0,
      speedMax: 0,
      lifetimeMin: 15,
      lifetimeMax: 20,
      sizeMin: 90,
      sizeMax: 130,
      startAlpha: 0.7,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.brightGold,
      shrink: true,
    });
  }

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

  /**
   * Trigger a spectacular, dense fire-spark and sparkling orange pyrotechnic explosion
   * at (x, y) when a Pyro-infused blazing arrow hits the opponent.
   */
  triggerBlazingCollision(x, y) {
    // 1. Layer: Vivid Orange and Gold Spark Spray (dense burst)
    this._burst.emit(x, y, {
      count: 25 + Math.floor(Math.random() * 10), // 25-35 particles
      speedMin: 3.5,
      speedMax: 9.5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 18,
      lifetimeMax: 38,
      sizeMin: 2,
      sizeMax: 5.5,
      startAlpha: 1,
      endAlpha: 0,
      gravity: 0.05,     // sparks arc downward nicely
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
    });

    // 2. Layer: Accent Sparkles (high-speed sparkling fireworks fragments)
    this._burst.emit(x, y, {
      count: 15,
      speedMin: 5,
      speedMax: 12,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 12,
      lifetimeMax: 24,
      sizeMin: 1,
      sizeMax: 3.0,
      startAlpha: 1,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.accent,
      shrink: true,
    });

    // 3. Layer: Bright expanding pyrotechnic core flash
    this._burst.emit(x, y, {
      count: 1,
      speedMin: 0,
      speedMax: 0,
      lifetimeMin: 12,
      lifetimeMax: 18,
      sizeMin: 35,
      sizeMax: 65,
      startAlpha: 0.85,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.brightGold,
      shrink: true,
    });

    // 4. Layer: High contrast dark charred embers
    this._burst.emit(x, y, {
      count: 12,
      speedMin: 1.5,
      speedMax: 4.5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 30,
      lifetimeMax: 55,
      sizeMin: 1.5,
      sizeMax: 3.5,
      startAlpha: 0.9,
      endAlpha: 0,
      blendMode: 'normal',
      color: PYRO_COLORS.dark,
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
   * Trigger a massive directional piercing gust of firework particles and embers
   * shooting behind the target along the arrow's impact trajectory angle.
   */
  triggerUltimateHitGust(x, y, angle) {
    // 1. Core high-speed plasma jet stream (vivid orange and gold sparks)
    this._skill.emit(x, y, {
      count: 60, // Sizable count for a massive feel
      speedMin: 5.5,
      speedMax: 14.5,
      spreadAngle: Math.PI * 0.3, // Tight piercing cone
      angleCenter: angle, // Centered in the direction of the arrow's travel
      lifetimeMin: 18,
      lifetimeMax: 36,
      sizeMin: 2.2,
      sizeMax: 5.5,
      startAlpha: 1.0,
      endAlpha: 0.0,
      gravity: 0.01,
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
    });

    // 2. High-speed brilliant golden crackle fragments (longer tail)
    this._skill.emit(x, y, {
      count: 40,
      speedMin: 7.0,
      speedMax: 17.0,
      spreadAngle: Math.PI * 0.2, // Even tighter cone for the hyper-fast piercing core
      angleCenter: angle,
      lifetimeMin: 12,
      lifetimeMax: 28,
      sizeMin: 1.2,
      sizeMax: 3.2,
      startAlpha: 0.95,
      endAlpha: 0.0,
      blendMode: 'add',
      color: PYRO_COLORS.brightGold,
      shrink: true,
    });

    // 3. Massive high contrast dark charred embers jet (directional gust - 55 particles)
    this._burst.emit(x, y, {
      count: 55,
      speedMin: 3.5,
      speedMax: 12.0,
      spreadAngle: Math.PI * 0.45,
      angleCenter: angle,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 2.0,
      sizeMax: 4.8,
      startAlpha: 0.95,
      endAlpha: 0.0,
      blendMode: 'normal',
      color: PYRO_COLORS.dark,
      shrink: true,
    });

    // 4. Large radial dark soot/ash explosion (45 particles blasting in all directions)
    this._burst.emit(x, y, {
      count: 45,
      speedMin: 1.5,
      speedMax: 7.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 30,
      lifetimeMax: 60,
      sizeMin: 1.8,
      sizeMax: 3.8,
      startAlpha: 0.9,
      endAlpha: 0.0,
      blendMode: 'normal',
      color: PYRO_COLORS.dark,
      shrink: true,
    });

    // 4. Sizzling golden accent sparks spraying out
    this._burst.emit(x, y, {
      count: 25,
      speedMin: 4.0,
      speedMax: 12.0,
      spreadAngle: Math.PI * 0.35,
      angleCenter: angle,
      lifetimeMin: 14,
      lifetimeMax: 26,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.9,
      endAlpha: 0.0,
      blendMode: 'add',
      color: PYRO_COLORS.accent,
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

  /**
   * Trigger dense golden and orange firework sparkles swirling and imploding around Yoimiya's center.
   * Also releases crackling accent embers popping outwards for maximum pyrotechnic intensity.
   */
  triggerWindupSparks(x, y) {
    // 1. Swirling/imploding fireworks sparkles pulling in from outer ring
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 45; // 30 to 75px radius
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;

    this._skill.emit(px, py, {
      count: 2, // Emitted every frame -> high density
      speedMin: -0.5,
      speedMax: 1.2,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 18,
      lifetimeMax: 36,
      sizeMin: 1.8,
      sizeMax: 4.2,
      startAlpha: 0.95,
      endAlpha: 0,
      blendMode: 'add',
      gradient: PYRO_GRADIENT,
      shrink: true,
      targetX: x,
      targetY: y,
      attractionForce: 0.35, // Dynamic gravity pull to create a beautiful charging vortex
    });

    // 2. High-speed bright gold/orange sparks crackling outwards
    this._skill.emit(x, y, {
      count: 1,
      speedMin: 1.2,
      speedMax: 5.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 10,
      lifetimeMax: 24,
      sizeMin: 1.0,
      sizeMax: 3.2,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      color: PYRO_COLORS.accent,
      shrink: true,
    });

    // 3. Mini bright gold/orange core flashes
    if (Math.random() < 0.15) {
      this._skill.emit(x, y, {
        count: 1,
        speedMin: 0,
        speedMax: 0.4,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 6,
        lifetimeMax: 14,
        sizeMin: 15,
        sizeMax: 30,
        startAlpha: 0.75,
        endAlpha: 0,
        blendMode: 'add',
        color: PYRO_COLORS.brightGold,
        shrink: true,
      });
    }
  }

  /**
   * Trigger burning particle trails at the two orbiting Aurous Blaze mark circles.
   * Emits embers resembling those from the enhanced/blazing arrow hits.
   */
  triggerMarkTrail(x1, y1, x2, y2) {
    const emitTrail = (x, y) => {
      // 1. Core orange/gold trail spark
      this._burst.emit(x, y, {
        count: 1,
        speedMin: 0.2,
        speedMax: 0.8,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 15,
        lifetimeMax: 30,
        sizeMin: 1.5,
        sizeMax: 3.2,
        startAlpha: 0.95,
        endAlpha: 0,
        gravity: 0.015,
        blendMode: 'add',
        gradient: PYRO_GRADIENT,
        shrink: true,
      });

      // 2. Deep charred dark ember (for high contrast/burning smoke look)
      if (Math.random() < 0.35) {
        this._burst.emit(x, y, {
          count: 1,
          speedMin: 0.1,
          speedMax: 0.4,
          spreadAngle: Math.PI * 2,
          lifetimeMin: 20,
          lifetimeMax: 40,
          sizeMin: 1.0,
          sizeMax: 2.2,
          startAlpha: 0.8,
          endAlpha: 0,
          blendMode: 'normal',
          color: PYRO_COLORS.dark,
          shrink: true,
        });
      }

      // 3. Sizzling golden accent sparkles
      if (Math.random() < 0.25) {
        this._burst.emit(x, y, {
          count: 1,
          speedMin: 0.8,
          speedMax: 1.8,
          spreadAngle: Math.PI * 2,
          lifetimeMin: 10,
          lifetimeMax: 20,
          sizeMin: 0.8,
          sizeMax: 1.8,
          startAlpha: 0.9,
          endAlpha: 0,
          blendMode: 'add',
          color: PYRO_COLORS.accent,
          shrink: true,
        });
      }
    };

    emitTrail(x1, y1);
    emitTrail(x2, y2);
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
