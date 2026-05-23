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
    this.skillCooldownTimer = characterData.skillCooldown;
    this.skillReady = false;
    this.isUsingSkill = false;
    this.skillActiveTimer = 0;

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
    this.weaponOrbitRadius = characterData.circleRadius + 20;
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
      const weaponSize = 40;
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
   */
  update(delta, elapsed) {
    if (!this.alive) return;

    // Sync container position with physics body
    this.container.x = this.body.x;
    this.container.y = this.body.y;

    // Update weapon orbit
    this.weaponAngle += this.weaponOrbitSpeed * delta * 0.016;
    if (this.weaponSprite) {
      this.weaponSprite.x = Math.cos(this.weaponAngle) * this.weaponOrbitRadius;
      this.weaponSprite.y = Math.sin(this.weaponAngle) * this.weaponOrbitRadius;
      this.weaponSprite.rotation = this.weaponAngle + Math.PI / 4;
    }

    // Pulse glow effect
    if (this.circleGlow) {
      const pulseScale = 1 + Math.sin(elapsed * 3) * 0.05;
      this.circleGlow.scale.set(pulseScale);
    }

    // Update skill cooldown
    if (!this.skillReady && !this.isUsingSkill) {
      this.skillCooldownTimer -= delta * 0.016;
      if (this.skillCooldownTimer <= 0) {
        this.skillReady = true;
        this.skillCooldownTimer = 0;
      }
    }

    // Update active skill timer
    if (this.isUsingSkill) {
      this.skillActiveTimer -= delta * 16.67; // Convert to ms
      if (this.skillActiveTimer <= 0) {
        this.isUsingSkill = false;
        this.skillActiveTimer = 0;
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
    const cooldownMs = 1000 / this.data.attackSpeed;
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
   * Activate elemental skill
   * @returns {boolean} true if skill was activated
   */
  activateSkill() {
    if (!this.skillReady || this.isUsingSkill) return false;

    this.skillReady = false;
    this.isUsingSkill = true;
    this.skillActiveTimer = this.data.skill.duration;
    this.skillCooldownTimer = this.data.skillCooldown;

    // Trigger VFX
    if (this.vfx) {
      this.vfx.triggerSkill(this.body.x, this.body.y);
    }

    return true;
  }

  /**
   * Get current skill cooldown progress (0 to 1)
   */
  getSkillCooldownProgress() {
    if (this.skillReady) return 1;
    return 1 - (this.skillCooldownTimer / this.data.skillCooldown);
  }

  /**
   * Get the damage this fighter deals (considering active skill)
   */
  getCurrentDamage() {
    if (this.isUsingSkill) {
      return Math.round(this.data.damage * this.data.skill.damageMultiplier);
    }
    return this.data.damage;
  }
}
