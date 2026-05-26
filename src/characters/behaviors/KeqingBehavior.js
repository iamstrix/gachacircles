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
   * Three-phase skill overhaul:
   *   Phase 1: Throw Lightning Stiletto (Projectile)
   *   Phase 2: Teleport & Slash (Recast E)
   *   Phase 3: Thunderclap Slashes (Charged Attack Detonation)
   */
  onSkillActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    if (!fighter.stilettoThrown) {
      // ── Phase 1: Throw stiletto projectile ───────────────────
      gameLoop._playSFX('/audio/keqing/keqing-skill.wav', 0.85);
      fighter.stats.casts.skill++;

      const startX = fighter.body.x;
      const startY = fighter.body.y;
      const dx = opponent.body.x - startX;
      const dy = opponent.body.y - startY;
      const angle = Math.atan2(dy, dx);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Target destination for the mark (up to 200px away)
      const travelDist = Math.min(200, dist * 0.8);
      const targetX = startX + Math.cos(angle) * travelDist;
      const targetY = startY + Math.sin(angle) * travelDist;

      // Create stiletto projectile visual
      const visual = new Graphics();
      visual.moveTo(-12, 0);
      visual.lineTo(12, 0);
      visual.lineTo(0, -4);
      visual.closePath();
      visual.fill({ color: 0xc77dff });
      visual.stroke({ color: 0xffffff, width: 1.5 });
      visual.x = startX;
      visual.y = startY;
      visual.rotation = angle;
      gameLoop.stage.addChild(visual);

      gameLoop.projectiles.push({
        isStiletto: true,
        x: startX,
        y: startY,
        targetX: targetX,
        targetY: targetY,
        angle: angle,
        speed: 18.0,
        visual: visual,
        owner: fighter,
        target: opponent
      });

      // Put skill on a very short internal CD for the recast window
      fighter.skillCDTimer = 0.2; 
    } else {
      // ── Phase 2: Teleport & Recast Slash ────────────────────
      this._teleportToStiletto(fighter, opponent, gameLoop, Graphics);
    }
  },

  /**
   * Internal: Place the pulsing stiletto mark at a location.
   * Called when the stiletto projectile hits or reaches destination.
   */
  _placeStilettoMark(fighter, opponent, gameLoop, x, y) {
    fighter.stilettoX = x;
    fighter.stilettoY = y;
    fighter.stilettoThrown = true;
    fighter.stilettoTimer = 5.0; // Mark lasts 5 seconds

    if (!gameLoop.headlessMode) {
      const mark = new gameLoop.constructor.Graphics(); // Use loop's Graphics for headless safety
      mark.moveTo(0, -12);
      mark.lineTo(5, -2);
      mark.lineTo(2, -2);
      mark.lineTo(8, 10);
      mark.lineTo(2, 0);
      mark.lineTo(5, 0);
      mark.lineTo(-2, -12);
      mark.closePath();
      mark.fill({ color: 0xc77dff });
      mark.stroke({ color: 0xffffff, width: 2 });
      mark.x = x;
      mark.y = y;
      gameLoop.stage.addChildAt(mark, 1);
      fighter.stilettoVisual = mark;
    }

    // Effect to track mark expiration
    gameLoop.activeEffects.push({
      type: 'keqing_stiletto_mark',
      owner: fighter,
      timer: 5.0,
      visual: fighter.stilettoVisual
    });

    // Reset skill CD to allow for recast or CA detonation
    fighter.skillCDTimer = 0;
  },

  /**
   * Internal: Perform the purple lightning blink teleport.
   */
  _teleportToStiletto(fighter, opponent, gameLoop, Graphics) {
    const startX = fighter.body.x;
    const startY = fighter.body.y;
    const destX = fighter.stilettoX;
    const destY = fighter.stilettoY;

    // VFX: Lightning streak between start and end
    if (fighter.vfx && typeof fighter.vfx.triggerTeleportStreak === 'function') {
      fighter.vfx.triggerTeleportStreak(startX, startY, destX, destY);
    }

    // Physical move
    fighter.body.x = destX;
    fighter.body.y = destY;
    fighter.body.vx = 0;
    fighter.body.vy = 0;

    this._cleanupMark(fighter);
    gameLoop._playSFX('/audio/keqing/keqing-skill2.wav', 0.9);

    // E2 AoE Slash Damage
    const dx = opponent.body.x - destX;
    const dy = opponent.body.y - destY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 130) {
      const dmg = Math.round(fighter.data.damage * 2.5);
      const res = opponent.takeDamage(dmg);
      fighter.stats.damageDealt.skill += res.actualDamage;
      if (gameLoop.damageNumbers) {
        gameLoop.damageNumbers.spawn(destX, destY - 30, res.actualDamage, fighter.element, true);
      }
    }

    // Trigger Electro Infusion
    fighter.passiveTimer = 5000; // 5 seconds in ms
    gameLoop._screenShake();

    // Start full cooldown
    fighter.skillCDTimer = fighter.data.skillE.cooldown;
  },

  /**
   * Internal: Remote detonation via Charged Attack.
   */
  _detonateRemote(fighter, opponent, gameLoop) {
    const x = fighter.stilettoX;
    const y = fighter.stilettoY;

    // VFX: Thunderclap Slashes at mark location
    if (fighter.vfx && typeof fighter.vfx.triggerThunderclapSlashes === 'function') {
      fighter.vfx.triggerThunderclapSlashes(x, y);
    }

    gameLoop._playSFX('/audio/keqing/keqing-hit_infused.wav', 1.0);

    // Damage check at mark
    const dx = opponent.body.x - x;
    const dy = opponent.body.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < 140) {
      const dmg = Math.round(fighter.data.damage * 3.0);
      const res = opponent.takeDamage(dmg);
      fighter.stats.damageDealt.skill += res.actualDamage;
      if (gameLoop.damageNumbers) {
        gameLoop.damageNumbers.spawn(x, y - 30, res.actualDamage, fighter.element, true);
      }
    }

    this._cleanupMark(fighter);
    gameLoop._screenShake();

    // Full skill CD
    fighter.skillCDTimer = fighter.data.skillE.cooldown;
  },

  _cleanupMark(fighter) {
    fighter.stilettoThrown = false;
    fighter.stilettoTimer = 0;
    if (fighter.stilettoVisual && fighter.stilettoVisual.parent) {
      fighter.stilettoVisual.parent.removeChild(fighter.stilettoVisual);
      fighter.stilettoVisual.destroy();
    }
    fighter.stilettoVisual = null;
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
    // Charged Attack (index 5)
    if (fighter.comboIndex === 5) {
      // Remote detonation if stiletto is active
      if (fighter.stilettoThrown) {
        this._detonateRemote(fighter, opponent, gameLoop);
      }

      // Add significant knockback for CA
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
