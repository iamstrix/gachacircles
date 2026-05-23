/**
 * gameLoop.js — Main game loop and battle logic
 * Orchestrates physics, combat, VFX, and UI updates.
 */

import { updatePosition, bounceOffWalls, checkCircleCollision, resolveCollision } from './physics.js';

export class GameLoop {
  /**
   * @param {import('./characters/Fighter.js').Fighter} fighter1
   * @param {import('./characters/Fighter.js').Fighter} fighter2
   * @param {Object} bounds - Arena bounds { x, y, width, height }
   * @param {Object} hud - HUD instance
   * @param {Object} damageNumbers - DamageNumbers instance
   */
  constructor(fighter1, fighter2, bounds, hud, damageNumbers) {
    this.fighter1 = fighter1;
    this.fighter2 = fighter2;
    this.bounds = bounds;
    this.hud = hud;
    this.damageNumbers = damageNumbers;

    this.gameOver = false;
    this.winner = null;
    this.elapsedTime = 0;
    this.collisionCooldown = 0; // Prevent rapid re-collision damage

    this.onGameOver = null; // Callback

    this.activeEffects = []; // Store active Q whirlwind effects, etc.
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
