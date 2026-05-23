/**
 * gameLoop.js — Main game loop and battle logic
 * Orchestrates physics, combat, VFX, and UI updates.
 */

import { Graphics } from 'pixi.js';
import { updatePosition, bounceOffWalls, checkCircleCollision, resolveCollision } from './physics.js';
import { playSFX, preloadSFX } from './utils/audio.js';

export class GameLoop {
  /**
   * @param {import('./characters/Fighter.js').Fighter} fighter1
   * @param {import('./characters/Fighter.js').Fighter} fighter2
   * @param {Object} bounds - Arena bounds { x, y, width, height }
   * @param {Object} hud - HUD instance
   * @param {Object} damageNumbers - DamageNumbers instance
   */
  constructor(fighter1, fighter2, bounds, hud, damageNumbers, stage) {
    this.fighter1 = fighter1;
    this.fighter2 = fighter2;
    this.bounds = bounds;
    this.hud = hud;
    this.damageNumbers = damageNumbers;
    this.stage = stage;

    this.gameOver = false;
    this.winner = null;
    this.elapsedTime = 0;
    this.collisionCooldown = 0; // Prevent rapid re-collision damage

    this.onGameOver = null; // Callback

    this.activeEffects = []; // Store active Q whirlwind effects, etc.
    this.projectiles = []; // Store active flying arrows, etc.
    this.scheduledArrows = []; // Scheduled timed arrow combo queue

    // Preload Yoimiya's 5 normal attack sound files
    for (let i = 1; i <= 5; i++) {
      preloadSFX(`/audio/na_${i}.mp3`);
    }
  }

  /**
   * Main update tick — called every frame by PixiJS ticker
   * @param {number} delta - Frame delta (1.0 = target frame rate)
   */
  update(delta) {
    if (this.gameOver) return;

    this.elapsedTime += delta * 0.016; // Convert to seconds roughly
    const currentTime = performance.now();

    // Update collision cooldown
    if (this.collisionCooldown > 0) {
      this.collisionCooldown -= delta;
    }

    // Update physics positions
    updatePosition(this.fighter1.body, delta);
    updatePosition(this.fighter2.body, delta);

    // Wall bouncing
    bounceOffWalls(this.fighter1.body, this.bounds);
    bounceOffWalls(this.fighter2.body, this.bounds);

    // Circle-circle collision
    const collision = checkCircleCollision(this.fighter1.body, this.fighter2.body);
    if (collision.colliding) {
      resolveCollision(this.fighter1.body, this.fighter2.body, collision);
      this._handleCombat(collision, currentTime);
    }

    // Process scheduled sequential arrow shots (Yoimiya's aa-a-a-aa-a sequence)
    const now = performance.now();
    if (this.scheduledArrows) {
      this.scheduledArrows = this.scheduledArrows.filter(shot => {
        if (now >= shot.time) {
          this._shootSingleArrow(shot.owner, shot.target, shot.sound);
          return false; // remove from queue
        }
        return true; // keep in queue
      });
    }

    // Update active projectiles (Yoimiya's flaming arrows)
    if (this.stage) {
      this.projectiles = this.projectiles.filter(arrow => {
        // Move arrow
        arrow.x += Math.cos(arrow.angle) * arrow.speed * delta;
        arrow.y += Math.sin(arrow.angle) * arrow.speed * delta;
        
        // Sync visual position
        arrow.visual.x = arrow.x;
        arrow.visual.y = arrow.y;

        // Spawn fire particle trail behind flying arrow
        if (arrow.owner.vfx) {
          arrow.owner.vfx.updateAmbient(arrow.x, arrow.y, delta * 1.5);
        }

        // Out of bounds check
        const padding = 15;
        if (arrow.x < this.bounds.x - padding || 
            arrow.x > this.bounds.x + this.bounds.width + padding ||
            arrow.y < this.bounds.y - padding || 
            arrow.y > this.bounds.y + this.bounds.height + padding) {
          this.stage.removeChild(arrow.visual);
          arrow.visual.destroy();
          return false;
        }

        // Collision check with opponent
        const dx = arrow.x - arrow.target.body.x;
        const dy = arrow.y - arrow.target.body.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < arrow.target.body.radius + 5) {
          // HIT!
          const damage = Math.round(arrow.owner.data.damage * 0.75); // Arrow deals 75% of base damage
          const result = arrow.target.takeDamage(damage);

          // Pyro explosion burst VFX
          if (arrow.owner.vfx) {
            arrow.owner.vfx.triggerCollision(arrow.x, arrow.y);
          }

          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              arrow.x,
              arrow.y - 15,
              damage,
              arrow.owner.element,
              false
            );
          }

          if (result.died) {
            this._endGame(arrow.owner);
          }

          // Clean up visual
          this.stage.removeChild(arrow.visual);
          arrow.visual.destroy();
          return false;
        }

        return true;
      });
    }

    // Update active burst/skill effects
    this.activeEffects = this.activeEffects.filter(effect => {
      effect.timer -= delta * 0.016;
      if (effect.type === 'soumetsu') {
        effect.tickTimer -= delta * 0.016;
        if (effect.tickTimer <= 0) {
          effect.tickTimer = 0.5; // Tick every 0.5s
          
          // Cyclone tracks opponent
          const damage = Math.round(effect.owner.data.damage * effect.owner.data.burstQ.damageMultiplier);
          const result = effect.target.takeDamage(damage);
          
          // Trigger Cryo swirl burst VFX where the opponent is
          if (effect.owner.vfx) {
            effect.owner.vfx.triggerCollision(effect.target.body.x, effect.target.body.y);
          }
          
          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              effect.target.body.x,
              effect.target.body.y - 30,
              damage,
              effect.owner.element,
              true
            );
          }
          
          if (result.died) {
            this._endGame(effect.owner);
          }
        }
      }
      return effect.timer > 0;
    });

    // Check for skill and burst activation (auto-activate when ready)
    this._checkAbilityActivation(this.fighter1, this.fighter2);
    this._checkAbilityActivation(this.fighter2, this.fighter1);

    // Update fighters
    this.fighter1.update(delta, this.elapsedTime);
    this.fighter2.update(delta, this.elapsedTime);

    // Update HUD
    this._updateHUD();
  }

  /**
   * Handle combat when circles collide
   */
  _handleCombat(collision, currentTime) {
    // Apply damage from fighter1 to fighter2
    if (this.fighter1.canAttack(currentTime)) {
      const damage = this.fighter1.getCurrentDamage();
      const isCrit = (this.fighter1.id === 'ayaka' && this.fighter1.passiveTimer > 0) ||
                     (this.fighter1.id === 'yoimiya' && this.fighter1.isInfused);
      const result = this.fighter2.takeDamage(damage);

      if (result.actualDamage > 0) {
        this.fighter1.registerAttack(currentTime);

        // Trigger passive stack for Yoimiya
        if (this.fighter1.id === 'yoimiya') {
          this.fighter1.passiveStacks = Math.min(10, this.fighter1.passiveStacks + 1);
          this.fighter1.passiveTimer = this.fighter1.data.passive.duration;
        }

        // Trigger collision VFX
        if (this.fighter1.vfx) {
          this.fighter1.vfx.triggerCollision(collision.contactX, collision.contactY);
        }

        // Spawn damage number
        if (this.damageNumbers) {
          this.damageNumbers.spawn(
            collision.contactX,
            collision.contactY - 20,
            result.actualDamage,
            this.fighter1.element,
            isCrit
          );
        }

        // Screen shake on skill/crit hits
        if (isCrit) {
          this._screenShake();
        }

        if (result.died) {
          this._endGame(this.fighter1);
          return;
        }
      }
    }

    // Apply damage from fighter2 to fighter1
    if (this.fighter2.canAttack(currentTime)) {
      const damage = this.fighter2.getCurrentDamage();
      const isCrit = (this.fighter2.id === 'ayaka' && this.fighter2.passiveTimer > 0) ||
                     (this.fighter2.id === 'yoimiya' && this.fighter2.isInfused);
      const result = this.fighter1.takeDamage(damage);

      if (result.actualDamage > 0) {
        this.fighter2.registerAttack(currentTime);

        // Trigger passive stack for Yoimiya
        if (this.fighter2.id === 'yoimiya') {
          this.fighter2.passiveStacks = Math.min(10, this.fighter2.passiveStacks + 1);
          this.fighter2.passiveTimer = this.fighter2.data.passive.duration;
        }

        // Trigger collision VFX
        if (this.fighter2.vfx) {
          this.fighter2.vfx.triggerCollision(collision.contactX, collision.contactY);
        }

        // Spawn damage number
        if (this.damageNumbers) {
          this.damageNumbers.spawn(
            collision.contactX,
            collision.contactY + 20,
            result.actualDamage,
            this.fighter2.element,
            isCrit
          );
        }

        if (isCrit) {
          this._screenShake();
        }

        if (result.died) {
          this._endGame(this.fighter2);
          return;
        }
      }
    }
  }

  /**
   * Auto-activate skills and bursts when ready (AI)
   */
  _checkAbilityActivation(fighter, opponent) {
    if (this.gameOver) return;

    // ── Check Elemental Skill (E) ────────────────
    if (fighter.skillCDTimer <= 0) {
      const activated = fighter.activateSkill();
      if (activated) {
        if (fighter.id === 'ayaka') {
          // Ayaka E: AoE damage + high repel push!
          const dx = opponent.body.x - fighter.body.x;
          const dy = opponent.body.y - fighter.body.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // Strong repel force
          const force = 9;
          opponent.body.vx += (dx / dist) * force;
          opponent.body.vy += (dy / dist) * force;

          const damage = Math.round(fighter.data.damage * fighter.data.skillE.damageMultiplier);
          const result = opponent.takeDamage(damage);

          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              opponent.body.x,
              opponent.body.y - 30,
              damage,
              fighter.element,
              true
            );
          }

          this._screenShake();

          if (result.died) {
            this._endGame(fighter);
            return;
          }
        } else if (fighter.id === 'yoimiya') {
          // Yoimiya E: Infusion, triggers aura visual
          if (fighter.vfx) {
            fighter.vfx.triggerSkill(fighter.body.x, fighter.body.y);
          }
          // Start the sequential aa-a-a-aa-a arrow combo!
          this._startYoimiyaArrowCombo(fighter, opponent);
        }
      }
    }

    // ── Check Elemental Burst (Q) ────────────────
    if (fighter.burstCDTimer <= 0) {
      const activated = fighter.activateBurst();
      if (activated) {
        if (fighter.id === 'ayaka') {
          // Ayaka Q: Soumetsu frost whirlwind ticks over 3 seconds tracking target
          this.activeEffects.push({
            type: 'soumetsu',
            owner: fighter,
            target: opponent,
            timer: 3.0,
            tickTimer: 0
          });

          if (fighter.vfx) {
            fighter.vfx.triggerSkill(fighter.body.x, fighter.body.y);
          }
          this._screenShake();
        } else if (fighter.id === 'yoimiya') {
          // Yoimiya Q: Massive instant firework explosion
          const damage = Math.round(fighter.data.damage * fighter.data.burstQ.damageMultiplier);
          const result = opponent.takeDamage(damage);

          if (fighter.vfx) {
            fighter.vfx.triggerSkill(opponent.body.x, opponent.body.y);
          }

          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              opponent.body.x,
              opponent.body.y - 30,
              damage,
              fighter.element,
              true
            );
          }

          this._screenShake();

          if (result.died) {
            this._endGame(fighter);
            return;
          }
        }
      }
    }
  }

  /**
   * Schedule Yoimiya's authentic Normal Attack sequence: aa - a - a - aa - a
   */
  _startYoimiyaArrowCombo(fighter, opponent) {
    const targetTime = performance.now();
    
    // Delays corresponding to the sequence:
    // aa (0s, 0.1s) -> a (0.4s) -> a (0.7s) -> aa (1.0s, 1.1s) -> a (1.4s)
    const delays = [0, 100, 400, 700, 1000, 1100, 1400];
    const sounds = [
      '/audio/na_1.mp3', // segment 1 (aa)
      null,
      '/audio/na_2.mp3', // segment 2 (a)
      '/audio/na_3.mp3', // segment 3 (a)
      '/audio/na_4.mp3', // segment 4 (aa)
      null,
      '/audio/na_5.mp3'  // segment 5 (a)
    ];
    
    delays.forEach((delay, index) => {
      this.scheduledArrows.push({
        time: targetTime + delay,
        owner: fighter,
        target: opponent,
        sound: sounds[index]
      });
    });
  }

  /**
   * Shoot a single flaming arrow towards the opponent's current position
   */
  _shootSingleArrow(fighter, opponent, sound) {
    if (!this.stage || !fighter.alive || !opponent.alive) return;

    if (sound) {
      playSFX(sound);
    }

    const startX = fighter.body.x;
    const startY = fighter.body.y;

    // Calculate angle towards target at the exact moment of firing!
    const dx = opponent.body.x - startX;
    const dy = opponent.body.y - startY;
    const angle = Math.atan2(dy, dx);
    const speed = 22.0; // Extreme fly speed (hyper-snappy projectiles)

    // Trigger spark effect muzzle flash originating from Yoimiya's circle
    if (fighter.vfx) {
      fighter.vfx.triggerCollision(startX, startY);
    }

    // Create glowing arrow graphics
    const visual = new Graphics();
    
    // Draw pointed arrow tip
    visual.moveTo(-10, -2);
    visual.lineTo(10, -2);
    visual.lineTo(14, 0);
    visual.lineTo(10, 2);
    visual.lineTo(-10, 2);
    visual.closePath();
    visual.fill({ color: 0xff4500 }); // Red-orange main body
    
    // Draw fire core
    visual.circle(6, 0, 3);
    visual.fill({ color: 0xffaa00 }); // Golden yellow fire head
    
    visual.x = startX;
    visual.y = startY;
    visual.rotation = angle;
    
    this.stage.addChild(visual);

    this.projectiles.push({
      x: startX,
      y: startY,
      angle: angle,
      speed: speed,
      visual: visual,
      owner: fighter,
      target: opponent
    });
  }

  /**
   * Update HUD elements
   */
  _updateHUD() {
    if (!this.hud) return;

    this.hud.updateHP(this.fighter1.element, this.fighter1.hp, this.fighter1.maxHp);
    this.hud.updateHP(this.fighter2.element, this.fighter2.hp, this.fighter2.maxHp);

    // Update dynamic stats in footer
    const ySpeed = this.fighter2.data.attackSpeed * (this.fighter2.isInfused ? 2.0 : 1.0);
    this.hud.updateStats('cryo', this.fighter1.getCurrentDamage(), this.fighter1.data.attackSpeed);
    this.hud.updateStats('pyro', this.fighter2.getCurrentDamage(), ySpeed);

    // Update sidebar cooldown indicators
    this.hud.updateAbilityCD('cryo', 'E', this.fighter1.skillCDTimer, this.fighter1.data.skillE.cooldown);
    this.hud.updateAbilityCD('cryo', 'Q', this.fighter1.burstCDTimer, this.fighter1.data.burstQ.cooldown);
    this.hud.updateAbilityCD('pyro', 'E', this.fighter2.skillCDTimer, this.fighter2.data.skillE.cooldown);
    this.hud.updateAbilityCD('pyro', 'Q', this.fighter2.burstCDTimer, this.fighter2.data.burstQ.cooldown);

    // Update passive indicators below circular icons
    this.hud.updatePassiveState('cryo', this.fighter1.passiveTimer, 0);
    this.hud.updatePassiveState('pyro', this.fighter2.passiveTimer, this.fighter2.passiveStacks);
  }

  /**
   * Trigger screen shake effect
   */
  _screenShake() {
    const container = document.getElementById('game-container');
    if (container) {
      container.classList.remove('screen-shake');
      // Force reflow
      void container.offsetWidth;
      container.classList.add('screen-shake');
      setTimeout(() => container.classList.remove('screen-shake'), 300);
    }
  }

  /**
   * End the game
   */
  _endGame(winner) {
    this.gameOver = true;
    this.winner = winner;

    if (this.onGameOver) {
      this.onGameOver(winner);
    }
  }
}
