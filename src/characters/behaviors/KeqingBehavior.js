/**
 * KeqingBehavior.js — Keqing's combat behavior module.
 *
 * Implements the CharacterBehavior interface:
 *   isRanged         — false (melee sword fighter)
 *   onSkillActivate  — Stellar Restoration: throw stiletto / teleport
 *   onBurstActivate  — Starward Sword: 8-slash lightning dance
 *   startAttackCombo — N1-N5 electro sword combo
 *   onMeleeHit       — passive tracking + electro audio
 *   getDamageModifier— Thundering Poise (+25% Electro DMG)
 *   createVFX        — returns ElectroVFX instance
 */

import { ElectroVFX } from '../../vfx/ElectroVFX.js';

export const KeqingBehavior = {
  isRanged: false,

  createVFX() {
    return new ElectroVFX();
  },

  hudConfig: {
    nameLabel: 'Keqing ⚡',
    nameClass: 'ghud-name-electro',
    barClass: 'electro',
  },

  // ── Elemental Skill: Stellar Restoration ───────────────────

  /**
   * Two-phase skill:
   *   Phase 1 (stiletto not thrown yet): throw the stiletto — place a marker
   *   Phase 2 (stiletto already out): teleport to it and detonate AoE
   *
   * The Fighter stores:
   *   fighter.stilettoThrown  — boolean
   *   fighter.stilettoX/Y     — world position
   *   fighter.stilettoTimer   — time until auto-detonate (~2.5s)
   *   fighter.stilettoVisual  — Graphics object on stage
   */
  onSkillActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    if (!fighter.stilettoThrown) {
      // ── Phase 1: Throw stiletto ─────────────────────────────
      gameLoop._playSFX('/audio/keqing/keqing-skill.wav', 0.85);
      fighter.stats.casts.skill++;

      // Place stiletto at a mid-point toward the opponent
      const dx = opponent.body.x - fighter.body.x;
      const dy = opponent.body.y - fighter.body.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const travelFrac = Math.min(0.75, 160 / dist); // travel up to 160px or 75% of gap

      fighter.stilettoX = fighter.body.x + dx * travelFrac;
      fighter.stilettoY = fighter.body.y + dy * travelFrac;
      fighter.stilettoThrown = true;
      fighter.stilettoTimer = 2.5; // auto-detonate after 2.5s if not recast

      // Draw stiletto marker on stage
      if (!gameLoop.headlessMode) {
        const stilettoGfx = new Graphics();
        // Draw a small lightning bolt shape
        stilettoGfx.moveTo(0, -12);
        stilettoGfx.lineTo(5, -2);
        stilettoGfx.lineTo(2, -2);
        stilettoGfx.lineTo(8, 10);
        stilettoGfx.lineTo(2, 0);
        stilettoGfx.lineTo(5, 0);
        stilettoGfx.lineTo(-2, -12);
        stilettoGfx.closePath();
        stilettoGfx.fill({ color: 0xc77dff });
        stilettoGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });

        // Outer glow ring
        stilettoGfx.circle(0, 0, 14);
        stilettoGfx.stroke({ color: 0xe040fb, width: 1.5, alpha: 0.5 });

        stilettoGfx.x = fighter.stilettoX;
        stilettoGfx.y = fighter.stilettoY;
        gameLoop.stage.addChildAt(stilettoGfx, 1);
        fighter.stilettoVisual = stilettoGfx;
      }

      // VFX: launch flash at throw point
      if (fighter.vfx && typeof fighter.vfx.triggerStilettoThrow === 'function') {
        fighter.vfx.triggerStilettoThrow(fighter.body.x, fighter.body.y);
      }

      // Push a timed effect to handle auto-detonation + forced recall
      gameLoop.activeEffects.push({
        type: 'stellar_stiletto',
        owner: fighter,
        target: opponent,
        timer: 2.5,
        stilettoX: fighter.stilettoX,
        stilettoY: fighter.stilettoY,
        visual: fighter.stilettoVisual || null,
      });

      // Override the CD to 0.5s (short recast window) then it will be reset to full CD
      fighter.skillCDTimer = 0.5;

    } else {
      // ── Phase 2: Teleport & detonate ────────────────────────
      KeqingBehavior._detonateStiletto(fighter, opponent, gameLoop, Graphics);
    }
  },

  /**
   * Internal: teleport Keqing to stiletto and explode.
   * Also called by the stellar_stiletto effect timer when it expires.
   */
  _detonateStiletto(fighter, opponent, gameLoop, Graphics) {
    if (!fighter.stilettoThrown) return;

    const sx = fighter.stilettoX;
    const sy = fighter.stilettoY;

    // Teleport Keqing's physics body
    fighter.body.x = sx;
    fighter.body.y = sy;
    fighter.body.vx = 0;
    fighter.body.vy = 0;

    // Reset stiletto state
    fighter.stilettoThrown = false;
    fighter.stilettoTimer = 0;

    // Remove stiletto marker from stage
    if (fighter.stilettoVisual && fighter.stilettoVisual.parent) {
      fighter.stilettoVisual.parent.removeChild(fighter.stilettoVisual);
      fighter.stilettoVisual.destroy();
      fighter.stilettoVisual = null;
    }

    // VFX: big teleport burst at detonation point
    if (fighter.vfx && typeof fighter.vfx.triggerTeleportBurst === 'function') {
      fighter.vfx.triggerTeleportBurst(sx, sy);
    }

    gameLoop._playSFX('/audio/keqing/keqing-skill2.wav', 0.9);

    // AoE damage check
    const dx = opponent.body.x - sx;
    const dy = opponent.body.y - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = fighter.data.skillE.teleportRadius || 120;

    if (dist < radius) {
      const damage = Math.round(fighter.data.damage * fighter.data.skillE.damageMultiplier);
      const result = opponent.takeDamage(damage);
      if (result.actualDamage > 0) {
        fighter.stats.damageDealt.skill += result.actualDamage;
        if (gameLoop.damageNumbers) {
          gameLoop.damageNumbers.spawn(sx, sy - 25, result.actualDamage, fighter.element, true);
        }
        // Apply knockback away from detonation
        const angle = Math.atan2(dy, dx);
        opponent.body.vx += Math.cos(angle) * 9.0;
        opponent.body.vy += Math.sin(angle) * 9.0;

        if (result.died) {
          gameLoop._endGame(fighter);
          return;
        }
      }
    }

    // Activate passive: Thundering Poise
    fighter.passiveTimer = fighter.data.passive.duration;

    gameLoop._screenShake();

    // Full skill CD reset
    fighter.skillCDTimer = fighter.data.skillE.cooldown;
  },

  // ── Elemental Burst: Starward Sword ─────────────────────────

  /**
   * Begin the Starward Sword burst: 8 rapid lightning slashes fan-out,
   * then a massive central Electro explosion.
   */
  onBurstActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/keqing/keqing-ultimate.wav', 0.9);
    fighter.stats.casts.burst++;

    const ringGfx = new Graphics();
    gameLoop.stage.addChildAt(ringGfx, 1);

    gameLoop.activeEffects.push({
      type: 'starward_cast',
      owner: fighter,
      target: opponent,
      timer: 1.0,
      ring: ringGfx,
      slashIndex: 0,
      nextSlashTimer: 0.1,
      totalSlashes: fighter.data.burstQ.slashCount || 8,
    });

    fighter.isInvincible = true;

    if (fighter.vfx && typeof fighter.vfx.triggerCastAura === 'function') {
      fighter.vfx.triggerCastAura(fighter.body.x, fighter.body.y);
    }

    gameLoop._screenShake();
  },

  // ── Attack Combo ─────────────────────────────────────────────

  /**
   * Schedule Keqing's N1-N5 electro sword combo, plus CA if close enough.
   * Similar timing to Ayaka but with Electro audio.
   */
  startAttackCombo(fighter, opponent, gameLoop) {
    const targetTime = performance.now();

    const steps = [
      { delay: 0,    index: 0, dur: 200, sound: '/audio/keqing/keqing-na_1.wav' },
      { delay: 200,  index: 1, dur: 200, sound: '/audio/keqing/keqing-na_2.wav' },
      { delay: 400,  index: 2, dur: 250, sound: '/audio/keqing/keqing-na_3.wav' },
      { delay: 650,  index: 3, dur: 350, sound: '/audio/keqing/keqing-na_4.wav' },
      { delay: 1000, index: 4, dur: 400, sound: '/audio/keqing/keqing-na_5.wav' },
    ];

    // Add CA (Charged Attack) at the end, conditionally executed if the enemy is in range
    steps.push({
      delay: 1400,
      index: 5,
      dur: 300,
      sound: '/audio/keqing/keqing-skill2.wav', // High energy CA sound
      condition: () => {
        const dx = opponent.body.x - fighter.body.x;
        const dy = opponent.body.y - fighter.body.y;
        return Math.sqrt(dx * dx + dy * dy) < (fighter.body.radius + opponent.body.radius + 90);
      }
    });
    // Keqing's CA hits twice rapidly
    steps.push({
      delay: 1500,
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

  // ── Per-Hit Logic ─────────────────────────────────────────────

  onMeleeHit(fighter, opponent, gameLoop, result) {
    // Add significant knockback for Charged Attack (index 5)
    if (fighter.comboIndex === 5) {
      const angle = Math.atan2(opponent.body.y - fighter.body.y, opponent.body.x - fighter.body.x);
      opponent.body.vx += Math.cos(angle) * 7.5;
      opponent.body.vy += Math.sin(angle) * 7.5;
    }

    if (result.actualDamage > 0) {
      if (fighter.passiveTimer > 0) {
        gameLoop._playSFX('/audio/keqing/keqing-hit_infused.wav', 0.9);
        return 'enhanced';
      } else {
        gameLoop._playSFX('/audio/keqing/keqing-hit.wav', 0.85);
      }
    }
    return 'normal';
  },

  getDamageModifier(fighter) {
    if (fighter.passiveTimer > 0) return 1.25; // Thundering Poise: +25%
    return 1.0;
  },

  isCrit(fighter) {
    return fighter.passiveTimer > 0;
  },

  isLunging(fighter) {
    // Keqing N5 has a dash/blink phase
    return fighter.comboIndex === 4 &&
           fighter.swingProgress > 0.55 &&
           fighter.swingProgress < 0.9;
  },

  tickPassive(fighter, delta) {
    if (fighter.passiveTimer > 0) {
      fighter.passiveTimer -= delta * 16.67;
      if (fighter.passiveTimer <= 0) {
        fighter.passiveTimer = 0;
      }
    }
  },

  tickInfusion(_fighter, _delta) {
    // Keqing has no persistent infusion timer (passive is per-cast of E)
  },

  updateWeaponTint(fighter) {
    if (!fighter.weaponSprite) return;
    if (fighter.passiveTimer > 0) {
      fighter.weaponSprite.tint = 0xc77dff; // Electric violet
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
