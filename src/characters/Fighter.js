/**
 * Fighter.js — In-game fighter entity
 * Wraps a character's visual representation and combat state.
 * Contains the circle, portrait, orbiting weapon, and glow effects.
 *
 * Character-specific combat logic is delegated to fighter.behavior (CharacterBehavior).
 */

import { Container, Graphics, Sprite, Assets, Text, Texture } from 'pixi.js';

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
    this.attackIntervalOffset = 0; // Random variability between attack chains

    // Start fight with abilities on full cooldown
    this.skillCDTimer = characterData.skillE.cooldown;
    this.burstCDTimer = characterData.burstQ.cooldown;
    this.isInfused = false; // Yoimiya's E infusion
    this.infusionActiveTimer = 0;

    // Passives
    this.passiveStacks = 0; // Yoimiya's stacks
    this.passiveTimer = 0; // duration tracking

    // Melee Combo State (Ayaka / Keqing sword)
    this.comboIndex = 0;       // N1 to N5 (0-4)
    this.swingProgress = 1.0;  // 0 to 1 (animation fraction)
    this.swingDuration = 0;    // Duration in ms
    this.hasHitThisSwing = false;
    this.hasThrustedThisSwing = false;
    this.visualOffset = { x: 0, y: 0, rotation: 0 };
    this.isInvincible = false;
    this.slowMultiplier = 1.0;

    // Keqing-specific: Stellar Restoration stiletto state
    this.stilettoThrown = false;
    this.stilettoX = 0;
    this.stilettoY = 0;
    this.stilettoTimer = 0;
    this.stilettoVisual = null;

    // Statistics tracking
    this.stats = {
      damageDealt: {
        normal: 0,
        enhancedNormal: 0,
        skill: 0,
        burst: 0
      },
      casts: {
        skill: 0,
        burst: 0
      }
    };

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
    this.weaponOrbitRadius = this.id === 'yoimiya' ? characterData.circleRadius : 
                             (this.id === 'keqing' ? characterData.circleRadius + 7 : characterData.circleRadius + 20);
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

    // Behavior module (set externally from main.js)
    // Must implement: isRanged, onSkillActivate, onBurstActivate, startAttackCombo,
    //                 onMeleeHit, getDamageModifier, isCrit, isLunging,
    //                 tickPassive, tickInfusion, updateWeaponTint, createVFX
    this.behavior = null;
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

      // Video ultimate animation sprite (circular masked)
      if (this.data.ultAnimation) {
        try {
          const videoElement = document.createElement('video');
          videoElement.src = this.data.ultAnimation;
          videoElement.loop = false;
          videoElement.muted = true;
          videoElement.playsInline = true;
          videoElement.style.display = 'none';
          document.body.appendChild(videoElement);

          this.ultVideo = videoElement;
          this.ultVideoTexture = Texture.from(videoElement);
          this.ultVideoSprite = new Sprite(this.ultVideoTexture);
          this.ultVideoSprite.anchor.set(0.5);

          // Asynchronously scale and center the sprite once video metadata dimensions are fully loaded
          videoElement.addEventListener('loadedmetadata', () => {
            const size = circleRadius * 1.8;
            this.ultVideoSprite.width = size;
            this.ultVideoSprite.height = size;
          });

          this.ultVideoSprite.mask = this.portraitMask;
          this.ultVideoSprite.alpha = 0;
          this.ultVideoSprite.visible = false;
          this.container.addChild(this.ultVideoSprite);

          this.ultVideoFading = false;
        } catch (e) {
          console.warn(`Could not load ultimate video for ${this.id}:`, e);
        }
      }
    } catch (e) {
      console.warn(`Could not load portrait for ${this.id}:`, e);
    }

    // Weapon sprite (orbiting)
    try {
      const weaponTexture = await Assets.load(this.data.weaponSprite);
      this.weaponSprite = new Sprite(weaponTexture);
      this.weaponSprite.anchor.set(0.5);
      const weaponSize = this.id === 'yoimiya' ? 110 : 130;
      // Mirror swords horizontally so cutting edge leads (ayaka & keqing both use sword)
      const isSword = this.data.weapon === 'sword';
      this.weaponSprite.width = isSword ? -weaponSize : weaponSize;
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
      this.hpText.y = circleRadius * 0.83; // Shifted further downward to unblock the character face portrait
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

    if (window.headlessGachaMode) {
      // Headless: tick timers only, skip all visuals
      if (this.skillCDTimer > 0) {
        this.skillCDTimer -= delta * 0.016;
        if (this.skillCDTimer < 0) this.skillCDTimer = 0;
      }
      if (this.burstCDTimer > 0) {
        this.burstCDTimer -= delta * 0.016;
        if (this.burstCDTimer < 0) this.burstCDTimer = 0;
      }
      // Delegate timer ticks to behavior
      if (this.behavior) {
        this.behavior.tickPassive(this, delta);
        this.behavior.tickInfusion(this, delta);
      }
      // Keqing stiletto auto-detonation timer
      if (this.stilettoThrown && this.stilettoTimer > 0) {
        this.stilettoTimer -= delta * 0.016;
      }
      return;
    }

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
    } else if (this.data.weapon === 'sword') {
      // ── Procedural Sword Animation (Ayaka & Keqing) ────────────────
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

      if (this.id === 'keqing') {
        // Animation Logic per N-step
        switch(this.comboIndex) {
          case 0: // N1: Swift horizontal outward slash
            offRot = (p - 0.5) * Math.PI * 0.9 * Math.sin(p * Math.PI);
            orbitDist += Math.sin(p * Math.PI) * 20;
            if (p > 0.05 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 3.0;
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;
          case 1: // N2: Quick return inward slash
            offRot = -(p - 0.5) * Math.PI * 0.9 * Math.sin(p * Math.PI);
            orbitDist += Math.sin(p * Math.PI) * 20;
            if (p > 0.05 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 2.0;
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;
          case 2: // N3: Spinning forward slash
            offRot = p * Math.PI * 2 * (1 - p); // Return to 0
            orbitDist += Math.sin(p * Math.PI) * 15;
            if (p > 0.05 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 3.5;
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;
          case 3: // N4: Double strike (Thrust then Slice)
            if (p < 0.5) {
              const p2 = p * 2; // 0 to 1
              offRot = 0;
              orbitDist += Math.sin(p2 * Math.PI) * 35;
            } else {
              const p2 = (p - 0.5) * 2; // 0 to 1
              offRot = (p2 - 0.5) * Math.PI * Math.sin(p2 * Math.PI);
              orbitDist += Math.sin(p2 * Math.PI) * 20;
            }
            if (p > 0.05 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 2.5;
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;
          case 4: // N5: Blink Finisher
            if (p < 0.6) {
              // Windup/Blinking: weapon stays behind
              offRot = Math.PI; 
            } else {
              // Reappear and strike instantly
              const p2 = (p - 0.6) / 0.4; // 0 to 1
              offRot = 0;
              orbitDist += Math.sin(p2 * Math.PI) * 40; // huge reach but returns
            }
            if (p > 0.55 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 9.5; // Massive dash forward
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;
          case 5: // CA: Charged Attack
            // Fast double slash back and forth
            offRot = Math.sin(p * Math.PI * 5) * Math.PI * 0.6;
            orbitDist += Math.sin(p * Math.PI) * 25;
            break;
        }
      } else {
        // Ayaka Animation Logic per N-step
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

            // Apply snappy forward impulse for all early hits (Step-in effect)
            if (p > 0.05 && !this.hasThrustedThisSwing && opponent) {
              this.hasThrustedThisSwing = true;
              const impulse = 3.5; // Large snappy instantaneous impulse
              this.body.vx += Math.cos(targetAngle) * impulse;
              this.body.vy += Math.sin(targetAngle) * impulse;
            }
            break;

          case 4: // N5: Spin & Dash
            offRot = p * Math.PI * 2;
            orbitDist -= 10;
            // Apply forward dash impulse in the first half of N5
            if (p > 0.1 && p < 0.4 && opponent) {
              const dashForce = 1.2;
              this.body.vx += Math.cos(targetAngle) * dashForce;
              this.body.vy += Math.sin(targetAngle) * dashForce;
            }
            break;
        }
      }
      if (this.weaponSprite) {
        const finalAngle = targetAngle + offRot;
        this.weaponSprite.x = Math.cos(finalAngle) * orbitDist;
        this.weaponSprite.y = Math.sin(finalAngle) * orbitDist;
        // Try negative offset: tip outward.
        this.weaponSprite.rotation = finalAngle - Math.PI / 4;
      }
    } else {
      // Standard orbital behavior for other weapons
      let currentOrbitSpeed = this.weaponOrbitSpeed;
      this.weaponAngle += currentOrbitSpeed * delta * 0.016;

      if (this.weaponSprite) {
        this.weaponSprite.x = Math.cos(this.weaponAngle) * this.weaponOrbitRadius;
        this.weaponSprite.y = Math.sin(this.weaponAngle) * this.weaponOrbitRadius;
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

            // ── Sparkler Trail effect ────────────────
            if (this.vfx && Math.random() < 0.5 * delta) {
              // Convert local particle pos to world pos for emission
              const worldX = this.body.x + p.x;
              const worldY = this.body.y + p.y;
              this.vfx.triggerCollision(worldX, worldY);
            }
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

    // Delegate passive/infusion ticks to behavior
    if (this.behavior) {
      this.behavior.tickPassive(this, delta);
      this.behavior.tickInfusion(this, delta);
    }

    // Keqing: stiletto auto-detonation timer (handled by gameLoop activeEffects, just tick here)
    if (this.stilettoThrown && this.stilettoTimer > 0) {
      this.stilettoTimer -= delta * 0.016;
    }

    // Update ultimate video fade-out to portrait
    if (this.ultVideoFading && this.ultVideoSprite && this.portraitSprite) {
      const fadeSpeed = (delta * 16.67) / 800; // 800ms fade speed
      this.ultVideoSprite.alpha -= fadeSpeed;
      this.portraitSprite.alpha += fadeSpeed;

      if (this.ultVideoSprite.alpha <= 0) {
        this.ultVideoSprite.alpha = 0;
        this.portraitSprite.alpha = 1;
        this.ultVideoSprite.visible = false;
        this.ultVideoFading = false;
      }
    }

    // Update VFX ambient effects
    if (this.vfx) {
      this.vfx.updateAmbient(this.body.x, this.body.y, delta);
    }

    // Update invincibility visual pulse
    if (this.isInvincible && this.circleGraphics) {
      // Gentle golden pulse! Oscillates between white (0xffffff) and vibrant gold (0xffd54f)
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 15);
      const startR = 0xff, startG = 0xff, startB = 0xff;
      const endR = 0xff, endG = 0xd5, endB = 0x4f;
      const r = Math.round(startR + (endR - startR) * pulse);
      const g = Math.round(startG + (endG - startG) * pulse);
      const b = Math.round(startB + (endB - startB) * pulse);
      this.circleGraphics.tint = (r << 16) | (g << 8) | b;
    } else if (this.circleGraphics && this.circleGraphics.tint !== 0xffffff && this.circleGraphics.tint !== 0xff4444) {
      // Revert to standard
      this.circleGraphics.tint = 0xffffff;
    }

    // Weapon visual tinting — delegated to behavior
    if (this.behavior) {
      this.behavior.updateWeaponTint(this);
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
    // Generate new random variability for the NEXT interval (-300ms to +300ms)
    this.attackIntervalOffset = (Math.random() - 0.5) * 600;
  }

  /**
   * Trigger a melee swing animation
   * @param {number} index - N-step index (0-4)
   * @param {number} duration - Animation duration in ms
   */
  triggerMeleeSwing(index, duration) {
    this.comboIndex = index;
    this.swingProgress = 0;
    this.swingDuration = duration;
    this.hasHitThisSwing = false;
    this.hasThrustedThisSwing = false;
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
    if (this.hpText && !window.headlessGachaMode) {
      this.hpText.text = Math.round(this.hp).toString();
    }

    // Visual hit feedback — brief red flash
    if (this.circleGraphics && !window.headlessGachaMode) {
      this.circleGraphics.tint = 0xff4444;
      setTimeout(() => {
        if (this.circleGraphics) this.circleGraphics.tint = 0xffffff;
      }, 100);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      if (this.hpText && !window.headlessGachaMode) {
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
    // For Keqing: phase 2 (stiletto already thrown) — reset CD to short window, let behavior handle detonation
    // For all others: check normal CD
    if (this.id !== 'keqing' && this.skillCDTimer > 0) return false;
    if (this.id === 'keqing' && !this.stilettoThrown && this.skillCDTimer > 0) return false;
    if (this.id === 'keqing' && this.stilettoThrown && this.skillCDTimer > 0) return false;

    if (this.id !== 'keqing') {
      this.skillCDTimer = this.data.skillE.cooldown;
    }

    // Legacy path for Ayaka's passive (kept for backwards compat, but behavior will override)
    if (this.id === 'ayaka') {
      this.passiveTimer = this.data.passive.duration;
    } else if (this.id === 'yoimiya') {
      // Yoimiya's Pyro infusion activates for duration
      this.isInfused = true;
      this.infusionActiveTimer = this.data.skillE.duration;
    }

    // Trigger VFX E (non-Ayaka and non-Keqing, since those handle it in behavior)
    if (this.vfx && this.id !== 'ayaka' && this.id !== 'keqing') {
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
   * Play the ultimate burst video animation inside the circle
   */
  playUltAnimation() {
    if (window.headlessGachaMode) return;
    if (!this.ultVideoSprite || !this.ultVideo) return;

    // Reset dimensions to ensure it scales and centers perfectly inside the circle, regardless of raw video metadata dimensions
    const portraitSize = this.data.circleRadius * 1.8;
    this.ultVideoSprite.width = portraitSize;
    this.ultVideoSprite.height = portraitSize;

    // Reset fade states and toggle visibility
    this.ultVideoFading = false;
    this.ultVideoSprite.visible = true;
    this.ultVideoSprite.alpha = 1;
    if (this.portraitSprite) {
      this.portraitSprite.alpha = 0;
    }

    // Play video
    this.ultVideo.currentTime = 0;
    this.ultVideo.play().catch(err => {
      console.warn(`Could not play ultimate video for ${this.id}:`, err);
    });

    // Slow fade back to static portrait when video completes
    this.ultVideo.onended = () => {
      this.ultVideoFading = true;
    };
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
   * Get the damage this fighter deals (considering active skills and passives).
   * Delegates multiplier to behavior module.
   */
  getCurrentDamage() {
    let dmg = this.data.damage;

    if (this.behavior && typeof this.behavior.getDamageModifier === 'function') {
      dmg = Math.round(dmg * this.behavior.getDamageModifier(this));
    } else {
      // Legacy fallback for fighters without behavior set
      if (this.id === 'ayaka') {
        if (this.passiveTimer > 0) dmg = Math.round(dmg * 1.30);
      } else if (this.id === 'yoimiya') {
        if (this.isInfused) dmg = Math.round(dmg * 1.50);
        if (this.passiveStacks > 0) dmg = Math.round(dmg * (1 + this.passiveStacks * 0.02));
      }
    }

    return dmg;
  }
}
