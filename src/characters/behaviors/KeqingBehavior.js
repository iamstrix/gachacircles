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
      
      // 1. Outer violet glow layer (slightly larger, elongated diamond)
      visual.moveTo(-18, 0);
      visual.lineTo(0, -6);
      visual.lineTo(18, 0);
      visual.lineTo(0, 6);
      visual.closePath();
      visual.fill({ color: 0x7b2d8b, alpha: 0.5 });
      
      // 2. Middle neon violet layer
      visual.moveTo(-15, 0);
      visual.lineTo(0, -4);
      visual.lineTo(15, 0);
      visual.lineTo(0, 4);
      visual.closePath();
      visual.fill({ color: 0xc77dff, alpha: 0.8 });
      visual.stroke({ color: 0xc77dff, width: 2, alpha: 0.7 });
      
      // 3. Inner bright white core (narrow and sharp)
      visual.moveTo(-10, 0);
      visual.lineTo(0, -1.5);
      visual.lineTo(12, 0);
      visual.lineTo(0, 1.5);
      visual.closePath();
      visual.fill({ color: 0xffffff, alpha: 0.95 });

      visual.x = startX;
      visual.y = startY;
      visual.rotation = angle;
      gameLoop.stage.addChild(visual);

      // Trigger stiletto launch flash VFX
      if (fighter.vfx && typeof fighter.vfx.triggerStilettoLaunchFlash === 'function') {
        fighter.vfx.triggerStilettoLaunchFlash(startX, startY);
      }

      // Pre-allocate the Mark visual for later - premium Electro Element symbol
      const mark = new Graphics();
      
      // A. Ground ring & glow backplane
      mark.circle(0, 0, 30);
      mark.stroke({ color: 0xc77dff, width: 1.5, alpha: 0.35 });
      mark.circle(0, 0, 36);
      mark.stroke({ color: 0x7b2d8b, width: 1, alpha: 0.2 });
      mark.circle(0, 0, 26);
      mark.fill({ color: 0x7b2d8b, alpha: 0.15 });

      // B. Inner white-hot circle core
      mark.circle(0, 0, 5);
      mark.fill({ color: 0xffffff, alpha: 0.95 });

      // C. Outer violet circle ring
      mark.circle(0, 0, 14);
      mark.stroke({ color: 0xc77dff, width: 2, alpha: 0.8 });

      // D. Three radiating curved/jagged prongs at 120-degree intervals (styled Electro emblem)
      for (let i = 0; i < 3; i++) {
        const theta = (i * Math.PI * 2) / 3 - Math.PI / 2; // one points straight up
        const x1 = Math.cos(theta) * 14;
        const y1 = Math.sin(theta) * 14;
        const x2 = Math.cos(theta + 0.15) * 22;
        const y2 = Math.sin(theta + 0.15) * 22;
        const x3 = Math.cos(theta) * 25;
        const y3 = Math.sin(theta) * 25;
        
        mark.moveTo(x1, y1);
        mark.lineTo(x2, y2);
        mark.lineTo(x3, y3);
        mark.stroke({ color: 0xc77dff, width: 2, alpha: 0.8 });
      }

      mark.visible = false; // Hidden until impact
      gameLoop.stage.addChildAt(mark, 1);
      fighter.stilettoVisual = mark;

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

    if (!gameLoop.headlessMode && fighter.stilettoVisual) {
      fighter.stilettoVisual.x = x;
      fighter.stilettoVisual.y = y;
      fighter.stilettoVisual.visible = true;
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

    // Trigger arrival slash VFX
    const dxBlink = destX - startX;
    const dyBlink = destY - startY;
    const blinkAngle = (dxBlink === 0 && dyBlink === 0)
      ? Math.atan2(opponent.body.y - destY, opponent.body.x - destX)
      : Math.atan2(dyBlink, dxBlink);

    if (fighter.vfx && typeof fighter.vfx.triggerTeleportArrivalSlash === 'function') {
      fighter.vfx.triggerTeleportArrivalSlash(destX, destY, blinkAngle);
    }

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
   * Begin the Starward Sword burst: 10-hit sequence over 2.1 seconds.
   * Keqing disappears and becomes invincible.
   */
  onBurstActivate(fighter, opponent, gameLoop, Graphics, Sprite, Assets) {
    gameLoop._playSFX('/audio/keqing/keqing-ultimate.wav', 0.9);
    fighter.stats.casts.burst++;

    const ringGfx = new Graphics();
    gameLoop.stage.addChildAt(ringGfx, 1);

    // Initial Strike (Hit 1) - occurs immediately
    const initialDmg = Math.round(fighter.data.damage * (fighter.data.burstQ.initialMultiplier || 1.51));
    const res = opponent.takeDamage(initialDmg);
    fighter.stats.damageDealt.burst += res.actualDamage;
    if (gameLoop.damageNumbers) {
      gameLoop.damageNumbers.spawn(opponent.body.x, opponent.body.y - 30, res.actualDamage, fighter.element, true);
    }

    gameLoop.activeEffects.push({
      type: 'starward_cast',
      owner: fighter,
      target: opponent,
      timer: 2.1, // Accurate 2.1s duration
      ring: ringGfx,
      slashIndex: 0,
      totalSlashes: fighter.data.burstQ.slashCount || 8,
    });

    fighter.isInvincible = true;
    fighter.isBurstActive = true;
    fighter.container.alpha = 0; // Keqing disappears

    // A4 Passive: Aristocratic Dignity (+15% CRIT Rate for 8s)
    // We'll treat this as guaranteed crits for the duration in this simplified engine
    fighter.burstCritTimer = 8000; 

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
    return fighter.passiveTimer > 0 || (fighter.burstCritTimer && fighter.burstCritTimer > 0);
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
    if (fighter.burstCritTimer > 0) {
      fighter.burstCritTimer -= delta * 16.67;
      if (fighter.burstCritTimer <= 0) {
        fighter.burstCritTimer = 0;
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
