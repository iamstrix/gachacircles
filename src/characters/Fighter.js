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
      const weaponSize = this.id === 'yoimiya' ? 110 : 100;
      this.weaponSprite.width = weaponSize;
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
        // Rotate by Math.PI (180 degrees) relative to previous orientation to point hilt inward!
        this.weaponSprite.rotation = this.weaponAngle - 3 * Math.PI / 4;
      }
    }

    // Pulse glow effect
    if (this.circleGlow) {
      const pulseScale = 1 + Math.sin(elapsed * 3) * 0.05;
      this.circleGlow.scale.set(pulseScale);
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
   * Take damage
   * @param {number} amount
   * @returns {{ died: boolean, actualDamage: number }}
   */
  takeDamage(amount) {
    if (!this.alive) return { died: false, actualDamage: 0 };

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

    // Trigger VFX E
    if (this.vfx) {
      this.vfx.triggerSkill(this.body.x, this.body.y);
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
