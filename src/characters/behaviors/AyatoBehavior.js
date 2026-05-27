/**
 * AyatoBehavior.js — Kamisato Ayato's combat behavior module.
 *
 * Implements the CharacterBehavior interface:
 *   isRanged         — false (melee sword fighter)
 *   onSkillActivate  — Kyouka stance shift (shell)
 *   onBurstActivate  — Suiyuu Hydro field (shell)
 *   startAttackCombo — N1-N5 melee combo scheduling + CA
 *   onMeleeHit       — Hydro infusion sounds + reaction trigger hooks
 *   getDamageModifier— Passive Hydro buff (+25%)
 *   createVFX        — returns HydroVFX instance
 */

import { HydroVFX } from '../../vfx/HydroVFX.js';

export const AyatoBehavior = {
  isRanged: false,

  createVFX() {
    return new HydroVFX();
  },

  hudConfig: {
    nameLabel: 'Ayato 🌊',
    nameClass: 'ghud-name-hydro',
    barClass: 'hydro',
  },

  /**
   * Called when Ayato's E skill activates.
   * Kyouka stance shift, elegant retreat, and detonating water clone.
   */
  onSkillActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/ayaka/ayaka-skill.mp3', 0.85);
    fighter.stats.casts.skill++;

    // 1. Retreat: Glide elegantly backward relative to enemy direction
    const dx = opponent.body.x - fighter.body.x;
    const dy = opponent.body.y - fighter.body.y;
    const targetAngle = Math.atan2(dy, dx);
    const evadeForce = 12.0;
    fighter.body.vx = -Math.cos(targetAngle) * evadeForce;
    fighter.body.vy = -Math.sin(targetAngle) * evadeForce;

    // 2. Afterimage Clone: Spawn a static 'ayato_water_clone' trap
    const cloneGfx = new Graphics();
    gameLoop.stage.addChildAt(cloneGfx, 1);

    const cloneEffect = {
      type: 'ayato_water_clone',
      owner: fighter,
      target: opponent,
      x: fighter.body.x,
      y: fighter.body.y,
      timer: 3.0, // 3.0s lifespan
      maxTimer: 3.0,
      visual: cloneGfx,
    };
    gameLoop.activeEffects.push(cloneEffect);

    // 3. Stance Change: Activate Kyouka stance state for exactly 6s
    fighter.kyoukaStanceActive = true;
    fighter.kyoukaTimer = 6000;
    fighter.isInfused = true;

    // 4. Rapid Slashes: Schedule exactly 15 rapid Shunsuiken attacks at 400ms intervals
    const baseTime = performance.now();
    for (let i = 0; i < 15; i++) {
      const delay = i * 400; // 0ms to 5600ms
      const index = i % 3;   // 3-hit repeating loop
      gameLoop.scheduledMelee.push({
        time: baseTime + delay,
        owner: fighter,
        target: opponent,
        index: index,
        duration: 300,
        sound: i % 2 === 0 ? '/audio/ayaka/ayaka-na_1.wav' : '/audio/ayaka/ayaka-na_2.wav',
        condition: () => fighter.alive && opponent.alive && fighter.kyoukaStanceActive,
        isShunsuiken: true // Mark as Shunsuiken!
      });
    }

    if (fighter.vfx) {
      fighter.vfx.triggerCastAura(fighter.body.x, fighter.body.y);
    }
  },

  /**
   * Called when Ayato's Q burst activates.
   * Suiyuu Hydro rain garden shell.
   */
  onBurstActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/ayaka/ayaka-ultimate.wav', 0.7);
    fighter.stats.casts.burst++;

    fighter.isInvincible = true;
    fighter.isBurstActive = true;

    if (fighter.vfx) {
      fighter.vfx.triggerCastAura(fighter.body.x, fighter.body.y);
    }
    gameLoop._screenShake();
  },

  /**
   * Start Ayato's N1-N5 + CA melee combo.
   */
  startAttackCombo(fighter, opponent, gameLoop) {
    const targetTime = performance.now();

    // Standard Marobashi attack string steps
    const steps = [
      { delay: 0,    index: 0, dur: 200, sound: '/audio/ayaka/ayaka-na_1.wav' },
      { delay: 200,  index: 1, dur: 200, sound: '/audio/ayaka/ayaka-na_2.wav' },
      { delay: 400,  index: 2, dur: 250, sound: '/audio/ayaka/ayaka-na_3.wav' },
      // Strike 4: Rapid Flurry (horizontal cut then downward cleave double hit)
      { delay: 650,  index: 3, dur: 350, sound: '/audio/ayaka/ayaka-na_4.wav' },
      { delay: 780,  index: 3, dur: 0,   sound: null },
      // Strike 5: Composed Step Finisher & Slow Sheathing Flourish
      { delay: 1000, index: 4, dur: 900, sound: '/audio/ayaka/ayaka-na_5.wav' },
    ];

    // Add Charged Attack (CA) at the end, conditionally executed if opponent is in range
    steps.push({
      delay: 1950,
      index: 5,
      dur: 300,
      sound: '/audio/ayaka/ayaka-na_5.wav',
      condition: () => {
        const dx = opponent.body.x - fighter.body.x;
        const dy = opponent.body.y - fighter.body.y;
        return Math.sqrt(dx * dx + dy * dy) < (fighter.body.radius + opponent.body.radius + 90);
      }
    });

    // CA double hit
    steps.push({
      delay: 2050,
      index: 5,
      dur: 0,
      sound: null,
      condition: () => {
        const dx = opponent.body.x - fighter.body.x;
        const dy = opponent.body.y - fighter.body.y;
        return Math.sqrt(dx * dx + dy * dy) < (fighter.body.radius + opponent.body.radius + 90);
      }
    });

    steps.forEach(step => {
      gameLoop.scheduledMelee.push({
        time: targetTime + step.delay,
        owner: fighter,
        target: opponent,
        index: step.index,
        duration: step.dur,
        sound: step.sound,
        condition: step.condition
      });
    });
  },

  /**
   * Extra logic after a melee hit lands (Hydro sound triggers, reaction checking).
   */
  onMeleeHit(fighter, opponent, gameLoop, result) {
    if (result.actualDamage > 0) {
      if (fighter.passiveTimer > 0 || fighter.isInfused) {
        // Enhanced Hydro slash sound
        gameLoop._playSFX('/audio/ayaka/ayaka-hit_infused.wav', 0.9);
        return 'enhanced';
      } else {
        // Standard slash sound
        gameLoop._playSFX('/audio/ayaka/ayaka-hit.wav', 0.85);
      }
    }
    return 'normal';
  },

  /**
   * Get damage modifier on top of base damage.
   */
  getDamageModifier(fighter) {
    if (fighter.passiveTimer > 0) return 1.25; // 25% Hydro damage boost
    return 1.0;
  },

  /**
   * Whether a hit counts as a crit.
   */
  isCrit(fighter) {
    return fighter.kyoukaStanceActive || fighter.passiveTimer > 0;
  },

  /**
   * Returns true if fighter is in the N5 active step-forward phase.
   */
  isLunging(fighter) {
    return fighter.comboIndex === 4 &&
           fighter.swingProgress > 0.0 &&
           fighter.swingProgress < 0.5;
  },

  /**
   * Update passive timer tick.
   */
  tickPassive(fighter, delta) {
    // Tick passive timer
    if (fighter.passiveTimer > 0) {
      fighter.passiveTimer -= delta * 16.67;
      if (fighter.passiveTimer <= 0) {
        fighter.passiveTimer = 0;
      }
    }

    // Tick Kyouka Stance timer
    if (fighter.kyoukaStanceActive) {
      fighter.kyoukaTimer -= delta * 16.67;
      if (fighter.kyoukaTimer <= 0) {
        fighter.kyoukaStanceActive = false;
        fighter.kyoukaTimer = 0;
        fighter.isInfused = false;
      }
    }
  },

  /**
   * Update infusion timer.
   */
  tickInfusion(fighter, delta) {
    // Handled in tickPassive
  },

  /**
   * Update weapon tinting/visuals for Hydro passive.
   */
  updateWeaponTint(fighter) {
    if (!fighter.weaponSprite) return;
    if (fighter.kyoukaStanceActive) {
      fighter.weaponSprite.tint = 0x00e5ff; // Pure glowing cyan water blade
      if (fighter.vfx && typeof fighter.vfx.triggerSwordInfusionParticles === 'function') {
        fighter.vfx.triggerSwordInfusionParticles(
          fighter.body.x + fighter.weaponSprite.x,
          fighter.body.y + fighter.weaponSprite.y,
        );
      }
    } else if (fighter.passiveTimer > 0) {
      fighter.weaponSprite.tint = 0x80deea; // Shimmering aquamarine teal
      if (fighter.vfx && typeof fighter.vfx.triggerSwordInfusionParticles === 'function') {
        fighter.vfx.triggerSwordInfusionParticles(
          fighter.body.x + fighter.weaponSprite.x,
          fighter.body.y + fighter.weaponSprite.y,
        );
      }
    } else {
      fighter.weaponSprite.tint = 0xffffff;
    }
  },
};
