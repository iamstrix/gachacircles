/**
 * Fighter.js — In-game fighter entity
 * Wraps a character's visual representation and combat state.
 * Contains the circle, portrait, orbiting weapon, and glow effects.
 */

import { Container, Graphics, Sprite, Assets, Text } from 'pixi.js';

export class Fighter {
  /**
   * @param {Object} characterData - Character config from CharacterData.js
   * @param {number} startX - Starting X position
   * @param {number} startY - Starting Y position
   * @param {{ vx: number, vy: number }} velocity - Initial velocity
   */
  constructor(characterData, startX, startY, velocity) {
    this.data = characterData;
    this.id = characterData.id;
    this.element = characterData.element;

    // Combat state
    this.hp = characterData.hp;
    this.maxHp = characterData.hp;
    this.alive = true;
    this.lastAttackTime = 0;

    // Start fight with abilities on full cooldown
    this.skillCDTimer = characterData.skillE.cooldown;
    this.burstCDTimer = characterData.burstQ.cooldown;
    this.isInfused = false; // Yoimiya's E infusion
    this.infusionActiveTimer = 0;

    // Passives
    this.passiveStacks = 0; // Yoimiya's stacks
    this.passiveTimer = 0; // duration tracking

    // Ayaka Melee Combo State
    this.comboIndex = 0;       // N1 to N5 (0-4)
    this.swingProgress = 1.0;  // 0 to 1 (animation fraction)
    this.swingDuration = 0;    // Duration in ms
    this.visualOffset = { x: 0, y: 0, rotation: 0 };
    this.isInvincible = false;

    // Infusion visual (Yoimiya E)
    this.infusionParticles = [];

    // Physics body
    this.body = {
      x: startX,
      y: startY,
      vx: velocity.vx,
      vy: velocity.vy,
      radius: characterData.circleRadius,
      mass: 1,
    };

    // Weapon orbit state
    this.weaponAngle = Math.random() * Math.PI * 2;
    this.weaponOrbitRadius = this.id === 'yoimiya' ? characterData.circleRadius : (characterData.circleRadius + 20);
    this.weaponOrbitSpeed = 2.5; // radians per second

    // PixiJS display objects (initialized in createVisuals)
    this.container = new Container();
    this.circleGlow = null;
    this.circleGraphics = null;
    this.portraitSprite = null;
    this.weaponSprite = null;
    this.portraitMask = null;

    // VFX reference (set externally)
    this.vfx = null;
  }

  /**
   * Create all PixiJS visual objects
   * Must be called after assets are loaded
   */
  async createVisuals() {
    const { circleRadius, colors } = this.data;

    // Outer glow ring
    this.circleGlow = new Graphics();
    this.circleGlow.circle(0, 0, circleRadius + 6);
    this.circleGlow.fill({ color: colors.primary, alpha: 0.15 });
    this.container.addChild(this.circleGlow);

    // Main circle background
    this.circleGraphics = new Graphics();
    this.circleGraphics.circle(0, 0, circleRadius);
    this.circleGraphics.fill({ color: colors.circle, alpha: 0.9 });
    this.circleGraphics.circle(0, 0, circleRadius);
    this.circleGraphics.stroke({ color: colors.circleStroke, width: 3, alpha: 0.8 });
    this.container.addChild(this.circleGraphics);

    // Portrait (circular masked)
    try {
      const portraitTexture = await Assets.load(this.data.portrait);
      this.portraitSprite = new Sprite(portraitTexture);
      this.portraitSprite.anchor.set(0.5);
      const portraitSize = circleRadius * 1.8;
      this.portraitSprite.width = portraitSize;
      this.portraitSprite.height = portraitSize;

      // Circular mask for portrait
      this.portraitMask = new Graphics();
      this.portraitMask.circle(0, 0, circleRadius - 3);
      this.portraitMask.fill({ color: 0xffffff });
      this.container.addChild(this.portraitMask);
      this.portraitSprite.mask = this.portraitMask;
      this.container.addChild(this.portraitSprite);
    } catch (e) {
      console.warn(`Could not load portrait for ${this.id}:`, e);
    }

    // Weapon sprite (orbiting)
    try {
      const weaponTexture = await Assets.load(this.data.weaponSprite);
      this.weaponSprite = new Sprite(weaponTexture);
      this.weaponSprite.anchor.set(0.5);
      const weaponSize = this.id === 'yoimiya' ? 110 : 130;
      this.weaponSprite.width = this.id === 'ayaka' ? -weaponSize : weaponSize; // Mirror sword horizontally so cutting edge leads
      this.weaponSprite.height = weaponSize;
      this.container.addChild(this.weaponSprite);
    } catch (e) {
      console.warn(`Could not load weapon for ${this.id}:`, e);
    }

    // HP text inside the circle
    try {
      this.hpText = new Text({
        text: Math.round(this.hp).toString(),
        style: {
          fontFamily: 'Outfit',
          fontSize: 22,
          fontWeight: '900',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
          align: 'center'
        }
      });
      this.hpText.anchor.set(0.5);
      this.hpText.y = 0; // Center it vertically
      this.container.addChild(this.hpText);
    } catch (e) {
      console.warn(`Could not create HP text for ${this.id}:`, e);
    }

    // Set initial position
    this.container.x = this.body.x;
    this.container.y = this.body.y;

    // ── Infusion Particles (Yoimiya only) ────────────────
    if (this.id === 'yoimiya') {
      for (let i = 0; i < 3; i++) {
        const p = new Graphics();
        p.circle(0, 0, 5);
        p.fill({ color: 0xffd54f });
        p.stroke({ color: 0xffffff, width: 1 });
        p.visible = false;
        this.infusionParticles.push(p);
        this.container.addChild(p);
      }
    }
  }

  /**
   * Update fighter state each frame
   * @param {number} delta - Frame delta multiplier
   * @param {number} elapsed - Total elapsed seconds
   * @param {Fighter} [opponent] - Opponent fighter for target aiming
   */
  update(delta, elapsed, opponent) {
    if (!this.alive) return;

    // Sync container position with physics body
    this.container.x = this.body.x;
    this.container.y = this.body.y;

    // Update weapon orbit or aiming direction
    if (this.id === 'yoimiya' && opponent) {
      // Aim bow at opponent
      const dx = opponent.body.x - this.body.x;
      const dy = opponent.body.y - this.body.y;
      const angle = Math.atan2(dy, dx);

      if (this.weaponSprite) {
        this.weaponSprite.x = Math.cos(angle) * this.weaponOrbitRadius;
        this.weaponSprite.y = Math.sin(angle) * this.weaponOrbitRadius;
        // Face the opponent (front of bow is up-left in original image, i.e., 3 * PI / 4 offset)
        this.weaponSprite.rotation = angle + 3 * Math.PI / 4;
      }
    } else if (this.id === 'ayaka') {
      // ── Ayaka's Procedural Sword Animation ────────────────
      const dx = opponent ? (opponent.body.x - this.body.x) : 0;
      const dy = opponent ? (opponent.body.y - this.body.y) : 0;
      const targetAngle = opponent ? Math.atan2(dy, dx) : this.weaponAngle;

      // Update swing progress
      if (this.swingProgress < 1.0) {
        this.swingProgress += (delta * 16.67) / this.swingDuration;
        if (this.swingProgress > 1.0) this.swingProgress = 1.0;
      }

      const p = this.swingProgress;
      let offX = 0, offY = 0, offRot = 0;
      let orbitDist = this.weaponOrbitRadius;

      // Animation Logic per N-step
      switch(this.comboIndex) {
        case 0: // N1: Vertical/Diagonal Slash
        case 1: // N2: Horizontal Slash
        case 2: // N3: Heavy Lunge
        case 3: // N4: Triple Flurry (3 mini-swings)
          const sweep = (this.comboIndex === 0 ? 1 : (this.comboIndex === 1 ? -1 : 0)) * Math.PI * 0.8;
          
          if (this.comboIndex === 3) {
            // N4 flurry
            const flurry = Math.sin(p * Math.PI * 3);
            offRot = flurry * 0.6;
            orbitDist += flurry * 15;
          } else if (this.comboIndex === 2) {
            // N3 lunge
            orbitDist += (p < 0.3 ? p * 150 : (1 - p) * 60);
            offRot = Math.sin(p * Math.PI * 2) * 0.2;
          } else {
            // N1/N2 sweeps
            offRot = (p - 0.5) * sweep;
            orbitDist += Math.sin(p * Math.PI) * 25;
          }

          // Apply slight forward impulse for all early hits (Step-in effect)
          if (p > 0.05 && p < 0.25 && opponent) {
            const stepForce = 0.15;
            this.body.vx += Math.cos(targetAngle) * stepForce;
            this.body.vy += Math.sin(targetAngle) * stepForce;
          }
          break;

        case 4: // N5: Spin & Dash
          offRot = p * Math.PI * 2;
          orbitDist -= 10;
          // Apply forward dash impulse in the first half of N5
          if (p > 0.1 && p < 0.4 && opponent) {
            const dashForce = 0.8;
            this.body.vx += Math.cos(targetAngle) * dashForce;
            this.body.vy += Math.sin(targetAngle) * dashForce;
          }
          break;
      }

      if (this.weaponSprite) {
        const finalAngle = targetAngle + offRot;
        this.weaponSprite.x = Math.cos(finalAngle) * orbitDist;
        this.weaponSprite.y = Math.sin(finalAngle) * orbitDist;
        // Try negative offset: tip outward.
        this.weaponSprite.rotation = finalAngle - Math.PI / 4;
      }
    } else {
      // Standard orbital behavior for Ayaka and others
      let currentOrbitSpeed = this.weaponOrbitSpeed;
      if (this.id === 'yoimiya' && this.isInfused) {
        currentOrbitSpeed *= 2.0;
      }
      this.weaponAngle += currentOrbitSpeed * delta * 0.016;

      if (this.weaponSprite) {
        this.weaponSprite.x = Math.cos(this.weaponAngle) * this.weaponOrbitRadius;
        this.weaponSprite.y = Math.sin(this.weaponAngle) * this.weaponOrbitRadius;
        // Match offensive offset
        this.weaponSprite.rotation = this.weaponAngle - Math.PI / 4;
      }
    }

    // Pulse glow effect
    if (this.circleGlow) {
      const isInfused = this.isInfused;
      const pulseScale = (isInfused ? 1.2 : 1) + Math.sin(elapsed * 3) * 0.05;
      this.circleGlow.scale.set(pulseScale);
      this.circleGlow.alpha = isInfused ? 0.6 : 0.4;

      // ── Infusion Particles logic (Yoimiya only) ────────────────
      if (this.infusionParticles.length > 0) {
        this.infusionParticles.forEach((p, i) => {
          p.visible = isInfused;
          if (isInfused) {
            const orbitAngle = elapsed * 5 + (i * Math.PI * 2) / 3;
            const orbitDist = this.data.circleRadius + 20;
            p.x = Math.cos(orbitAngle) * orbitDist;
            p.y = Math.sin(orbitAngle) * orbitDist;
            // Add a little flicker
            p.alpha = 0.8 + Math.sin(elapsed * 20 + i) * 0.2;
          }
        });
      }
    }

    // Cooldown ticks
    if (this.skillCDTimer > 0) {
      this.skillCDTimer -= delta * 0.016;
      if (this.skillCDTimer < 0) this.skillCDTimer = 0;
    }

    if (this.burstCDTimer > 0) {
      this.burstCDTimer -= delta * 0.016;
      if (this.burstCDTimer < 0) this.burstCDTimer = 0;
    }

    // Yoimiya infusion duration tick
    if (this.id === 'yoimiya' && this.isInfused) {
      this.infusionActiveTimer -= delta * 16.67;
      if (this.infusionActiveTimer <= 0) {
        this.isInfused = false;
        this.infusionActiveTimer = 0;
      }
    }

    // Passive timers tick
    if (this.passiveTimer > 0) {
      this.passiveTimer -= delta * 16.67;
      if (this.passiveTimer <= 0) {
        this.passiveTimer = 0;
        this.passiveStacks = 0; // Stacks expire
      }
    }

    // Update VFX ambient effects
    if (this.vfx) {
      this.vfx.updateAmbient(this.body.x, this.body.y, delta);
    }
  }

  /**
   * Check if this fighter can attack (based on attack speed cooldown)
   * @param {number} currentTime - Current time in ms
   * @returns {boolean}
   */
  canAttack(currentTime) {
    let currentAttackSpeed = this.data.attackSpeed;
    if (this.id === 'yoimiya' && this.isInfused) {
      currentAttackSpeed *= 2.0; // Double attack speed during infusion!
    }
    const cooldownMs = 1000 / currentAttackSpeed;
    return currentTime - this.lastAttackTime >= cooldownMs;
  }

  /**
   * Register an attack
   * @param {number} currentTime
   */
  registerAttack(currentTime) {
    this.lastAttackTime = currentTime;
  }

  /**
   * Trigger a melee swing animation (Ayaka)
   * @param {number} index - N-step index (0-4)
   * @param {number} duration - Animation duration in ms
   */
  triggerMeleeSwing(index, duration) {
    this.comboIndex = index;
    this.swingProgress = 0;
    this.swingDuration = duration;
  }

  /**
   * Take damage
   * @param {number} amount
   * @returns {{ died: boolean, actualDamage: number }}
   */
  takeDamage(amount) {
    if (!this.alive || this.isInvincible) return { died: false, actualDamage: 0 };

    const actualDamage = Math.min(amount, this.hp);
    this.hp -= actualDamage;

    // Update HP text
    if (this.hpText) {
      this.hpText.text = Math.round(this.hp).toString();
    }

    // Visual hit feedback — brief red flash
    if (this.circleGraphics) {
      this.circleGraphics.tint = 0xff4444;
      setTimeout(() => {
        if (this.circleGraphics) this.circleGraphics.tint = 0xffffff;
      }, 100);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      if (this.hpText) {
        this.hpText.text = '0';
      }
      this.alive = false;
      return { died: true, actualDamage };
    }

    return { died: false, actualDamage };
  }

  /**
   * Activate elemental skill (E)
   * @returns {boolean} true if skill was activated
   */
  activateSkill() {
    if (this.skillCDTimer > 0) return false;

    this.skillCDTimer = this.data.skillE.cooldown;

    if (this.id === 'ayaka') {
      // Ayaka's passive activates: NA dmg +30% for 3s
      this.passiveTimer = this.data.passive.duration;
    } else if (this.id === 'yoimiya') {
      // Yoimiya's Pyro infusion activates for 4s
      this.isInfused = true;
      this.infusionActiveTimer = this.data.skillE.duration;
    }

    // Trigger VFX E (Yoimiya's E triggers immediately, Ayaka's E triggers on bloom after 1 second)
    if (this.vfx && this.id !== 'ayaka') {
      if (this.id === 'yoimiya' && typeof this.vfx.triggerInfusion === 'function') {
        this.vfx.triggerInfusion(this.body.x, this.body.y);
      } else {
        this.vfx.triggerSkill(this.body.x, this.body.y);
      }
    }

    return true;
  }

  /**
   * Activate elemental burst (Q)
   * @returns {boolean} true if burst was activated
   */
  activateBurst() {
    if (this.burstCDTimer > 0) return false;

    this.burstCDTimer = this.data.burstQ.cooldown;

    return true;
  }

  /**
   * Get current skill (E) cooldown progress (0 to 1)
   */
  getSkillCooldownProgress() {
    if (this.skillCDTimer <= 0) return 1;
    return 1 - (this.skillCDTimer / this.data.skillE.cooldown);
  }

  /**
   * Get current burst (Q) cooldown progress (0 to 1)
   */
  getBurstCooldownProgress() {
    if (this.burstCDTimer <= 0) return 1;
    return 1 - (this.burstCDTimer / this.data.burstQ.cooldown);
  }

  /**
   * Get the damage this fighter deals (considering active skills and passives)
   */
  getCurrentDamage() {
    let dmg = this.data.damage;

    if (this.id === 'ayaka') {
      // Passive: Kanten Senmyou Blessing (+30% Normal Attack DMG)
      if (this.passiveTimer > 0) {
        dmg = Math.round(dmg * 1.30);
      }
    } else if (this.id === 'yoimiya') {
      // Skill E Pyro Infusion (+50% DMG)
      if (this.isInfused) {
        dmg = Math.round(dmg * 1.50);
      }
      // Passive: Tricks of the Trouble-Maker (+2% DMG per stack, up to 10 stacks)
      if (this.passiveStacks > 0) {
        dmg = Math.round(dmg * (1 + this.passiveStacks * 0.02));
      }
    }

    return dmg;
  }
}
