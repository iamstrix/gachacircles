/**
 * YoimiyaBehavior.js — Yoimiya's combat behavior module.
 *
 * Implements the CharacterBehavior interface:
 *   isRanged         — true (bow/ranged fighter)
 *   onSkillActivate  — Niwabi Fire-Dance infusion
 *   onBurstActivate  — Ryuukin Saxifrage firework cast
 *   startAttackCombo — aa-a-a-aa-a arrow combo scheduling
 *   onMeleeHit       — N/A (ranged — handled via projectile hits)
 *   getDamageModifier— Pyro infusion (+50%) + passive stacks
 *   createVFX        — returns PyroVFX instance
 */

import { PyroVFX } from '../../vfx/PyroVFX.js';

export const YoimiyaBehavior = {
  isRanged: true,

  createVFX() {
    return new PyroVFX();
  },

  hudConfig: {
    nameLabel: '🔥 Yoimiya',
    nameClass: 'ghud-name-pyro',
    barClass: 'pyro',
  },

  /**
   * Called when Yoimiya's E skill activates.
   * Triggers Niwabi Fire-Dance infusion.
   */
  onSkillActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/yoimiya/yoimiya-skill.wav');
    fighter.stats.casts.skill++;

    // Reset attack timer so the infused barrage fires immediately
    const isShooting = gameLoop.scheduledArrows &&
      gameLoop.scheduledArrows.some(shot => shot.owner === fighter);
    if (!isShooting) {
      fighter.lastAttackTime = 0;
    }
  },

  /**
   * Called when Yoimiya's Q burst activates.
   * Begins the Ryuukin Saxifrage firework rocket windup.
   */
  onBurstActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    fighter.stats.casts.burst++;

    const ringGfx = new Graphics();
    gameLoop.stage.addChildAt(ringGfx, 1);

    gameLoop.activeEffects.push({
      type: 'ryuukin_cast',
      owner: fighter,
      target: opponent,
      timer: 1.0,
      ring: ringGfx,
    });

    fighter.isInvincible = true;
    gameLoop._playSFX('/audio/yoimiya/yoimiya-ultimate.wav', 1.0);
  },

  /**
   * Start Yoimiya's aa-a-a-aa-a arrow combo.
   */
  startAttackCombo(fighter, opponent, gameLoop) {
    gameLoop._startYoimiyaArrowCombo(fighter, opponent);
  },

  /**
   * Yoimiya's melee hits are N/A (ranged character). No-op.
   */
  onMeleeHit(fighter, opponent, gameLoop, result) {
    return 'normal';
  },

  /**
   * Get damage multiplier — Pyro infusion (+50%) and passive stacks.
   */
  getDamageModifier(fighter) {
    let mult = 1.0;
    if (fighter.isInfused) mult *= 1.5;
    if (fighter.passiveStacks > 0) mult *= (1 + fighter.passiveStacks * 0.02);
    return mult;
  },

  isCrit(fighter) {
    return fighter.isInfused;
  },

  isLunging(_fighter) {
    return false; // Ranged — never lunges
  },

  /**
   * Tick Yoimiya's infusion timer.
   */
  tickInfusion(fighter, delta) {
    if (fighter.isInfused) {
      fighter.infusionActiveTimer -= delta * 16.67;
      if (fighter.infusionActiveTimer <= 0) {
        fighter.isInfused = false;
        fighter.infusionActiveTimer = 0;
      }
    }
  },

  /**
   * Tick passive stack duration.
   */
  tickPassive(fighter, delta) {
    if (fighter.passiveTimer > 0) {
      fighter.passiveTimer -= delta * 16.67;
      if (fighter.passiveTimer <= 0) {
        fighter.passiveTimer = 0;
        fighter.passiveStacks = 0; // stacks expire
      }
    }
  },

  /**
   * On collision with Ayaka — increment Trouble-Maker passive stacks.
   */
  onCollisionHit(fighter) {
    fighter.passiveStacks = Math.min(10, fighter.passiveStacks + 1);
    fighter.passiveTimer = fighter.data.passive.duration;
  },

  /**
   * Yoimiya has no weapon tint during passive (handled by infusion particle orbit).
   */
  updateWeaponTint(_fighter) {},
};
