/**
 * AyakaBehavior.js — Kamisato Ayaka's combat behavior module.
 *
 * Implements the CharacterBehavior interface:
 *   isRanged         — false (melee sword fighter)
 *   onSkillActivate  — Hyouka ice bloom effect
 *   onBurstActivate  — Soumetsu ice cyclone
 *   startAttackCombo — N1-N5 melee combo scheduling
 *   onMeleeHit       — passive logic + cryo CD reduction
 *   getDamageModifier— Kanten Senmyou Blessing (+30%)
 *   createVFX        — returns CryoVFX instance
 */

import { CryoVFX } from '../../vfx/CryoVFX.js';

export const AyakaBehavior = {
  isRanged: false,

  createVFX() {
    return new CryoVFX();
  },

  hudConfig: {
    nameLabel: 'Ayaka ❄️',
    nameClass: 'ghud-name-cryo',
    barClass: 'cryo',
  },

  /**
   * Called when Ayaka's E skill activates.
   * Creates the frost bloom visual and Hyouka effect entry.
   */
  onSkillActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/ayaka/ayaka-skill.mp3', 0.78);
    fighter.stats.casts.skill++;

    // Frost bloom visual indicator
    const visual = new Graphics();
    visual.circle(0, 0, 180);
    visual.fill({ color: 0x80deea, alpha: 0.06 });
    visual.stroke({ color: 0x4fc3f7, width: 2, alpha: 0.6 });
    visual.circle(0, 0, 90);
    visual.stroke({ color: 0x4fc3f7, width: 1, alpha: 0.3 });
    visual.x = fighter.body.x;
    visual.y = fighter.body.y;
    gameLoop.stage.addChildAt(visual, 1);

    const effect = {
      type: 'hyouka',
      owner: fighter,
      target: opponent,
      timer: 1.0,
      radius: 180,
      visual: visual,
      symbolSprite: null,
    };
    gameLoop.activeEffects.push(effect);

    if (!gameLoop.headlessMode) {
      Assets.load('/cryo.png').then(texture => {
        if (gameLoop.gameOver) return;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.x = fighter.body.x;
        sprite.y = fighter.body.y;
        sprite.width = 0;
        sprite.height = 0;
        sprite.alpha = 0;
        sprite.tint = 0x80deea;
        gameLoop.stage.addChildAt(sprite, 1);
        effect.symbolSprite = sprite;
      }).catch(err => console.warn('Could not load Cryo symbol:', err));
    }
  },

  /**
   * Called when Ayaka's Q burst activates.
   * Creates the Soumetsu telegraph + contracting ring.
   */
  onBurstActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/ayaka/ayaka-ultimate.wav', 0.6);
    fighter.stats.casts.burst++;

    const telegraphGfx = new Graphics();
    const ringGfx = new Graphics();
    gameLoop.stage.addChildAt(telegraphGfx, 1);
    gameLoop.stage.addChildAt(ringGfx, 1);

    const effect = {
      type: 'soumetsu_cast',
      owner: fighter,
      target: opponent,
      timer: 1.3,
      telegraph: telegraphGfx,
      ring: ringGfx,
      angle: 0,
      symbolSprite: null,
    };
    gameLoop.activeEffects.push(effect);

    if (!gameLoop.headlessMode) {
      Assets.load('/cryo.png').then(texture => {
        if (gameLoop.gameOver || !gameLoop.activeEffects.includes(effect)) return;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.x = fighter.body.x;
        sprite.y = fighter.body.y;
        sprite.width = 300;
        sprite.height = 300;
        sprite.alpha = 0.2;
        sprite.tint = 0x80deea;
        gameLoop.stage.addChildAt(sprite, 1);
        effect.symbolSprite = sprite;
      }).catch(err => console.warn('Could not load Cryo symbol for ultimate:', err));
    }

    fighter.isInvincible = true;
    fighter.isBurstActive = true;
    fighter.body.vx = 0;
    fighter.body.vy = 0;

    if (fighter.vfx) {
      fighter.vfx.triggerCastAura(fighter.body.x, fighter.body.y);
    }
    gameLoop._screenShake();
  },

  /**
   * Start Ayaka's N1-N5 melee combo.
   */
  startAttackCombo(fighter, opponent, gameLoop) {
    gameLoop._startAyakaMeleeCombo(fighter, opponent);
  },

  /**
   * Extra logic after a melee hit lands (CD reduction, audio).
   * Returns whether the hit should count as enhanced (for stats).
   */
  onMeleeHit(fighter, opponent, gameLoop, result) {
    if (result.actualDamage > 0) {
      if (fighter.passiveTimer > 0) {
        gameLoop._playSFX('/audio/ayaka/ayaka-hit_infused.wav', 0.9);
        // Ayaka C1: every infused hit reduces Hyouka CD by 1.0s
        fighter.skillCDTimer = Math.max(0, fighter.skillCDTimer - 1.0);
        return 'enhanced';
      } else {
        gameLoop._playSFX('/audio/ayaka/ayaka-hit.wav', 0.85);
      }
    }
    return 'normal';
  },

  /**
   * Get damage multiplier on top of base damage.
   */
  getDamageModifier(fighter) {
    if (fighter.passiveTimer > 0) return 1.30;
    return 1.0;
  },

  /**
   * Whether a hit counts as a crit (used for screen shake + damage number styling).
   */
  isCrit(fighter) {
    return fighter.passiveTimer > 0;
  },

  /**
   * Returns true if fighter is in the N5 lunge phase (damage on contact, not via scheduled hit).
   */
  isLunging(fighter) {
    return fighter.comboIndex === 4 &&
           fighter.swingProgress > 0.1 &&
           fighter.swingProgress < 0.6;
  },

  /**
   * Update passive timer tick.
   * @param {Fighter} fighter
   * @param {number} delta
   */
  tickPassive(fighter, delta) {
    if (fighter.passiveTimer > 0) {
      fighter.passiveTimer -= delta * 16.67;
      if (fighter.passiveTimer <= 0) {
        fighter.passiveTimer = 0;
      }
    }
  },

  /**
   * Update infusion timer (no infusion for Ayaka at fighter level — handled via passiveTimer).
   */
  tickInfusion(fighter, delta) {
    // Ayaka's infusion is represented via passiveTimer, not isInfused
  },

  /**
   * Update any weapon visual tinting for passive state.
   * @param {Fighter} fighter
   */
  updateWeaponTint(fighter) {
    if (!fighter.weaponSprite) return;
    if (fighter.passiveTimer > 0) {
      fighter.weaponSprite.tint = 0x80deea; // Icy cyan glow
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
