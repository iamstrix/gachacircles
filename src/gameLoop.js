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

    // Check for skill activation (auto-activate when ready)
    this._checkSkillActivation(this.fighter1, this.fighter2);
    this._checkSkillActivation(this.fighter2, this.fighter1);

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
      const isCrit = this.fighter1.isUsingSkill;
      const result = this.fighter2.takeDamage(damage);

      if (result.actualDamage > 0) {
        this.fighter1.registerAttack(currentTime);

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

        // Screen shake on skill hits
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
      const isCrit = this.fighter2.isUsingSkill;
      const result = this.fighter1.takeDamage(damage);

      if (result.actualDamage > 0) {
        this.fighter2.registerAttack(currentTime);

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
   * Auto-activate skills when ready (simple AI)
   */
  _checkSkillActivation(fighter, opponent) {
    if (fighter.skillReady && !fighter.isUsingSkill) {
      // Activate skill — could add distance check for smarter AI later
      const activated = fighter.activateSkill();
      if (activated) {
        // Apply skill AoE damage if opponent is within range
        const dx = opponent.body.x - fighter.body.x;
        const dy = opponent.body.y - fighter.body.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < fighter.data.skill.aoeRadius) {
          const skillDamage = Math.round(fighter.data.damage * fighter.data.skill.damageMultiplier);
          const result = opponent.takeDamage(skillDamage);

          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              opponent.body.x,
              opponent.body.y - 30,
              skillDamage,
              fighter.element,
              true
            );
          }

          this._screenShake();

          if (result.died) {
            this._endGame(fighter);
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

    // Update skill cooldown indicators
    if (this.fighter1.skillReady) {
      this.hud.showSkillReady(this.fighter1.element);
    } else {
      const remaining = this.fighter1.skillCooldownTimer;
      this.hud.updateSkillCooldown(this.fighter1.element, remaining, this.fighter1.data.skillCooldown);
    }

    if (this.fighter2.skillReady) {
      this.hud.showSkillReady(this.fighter2.element);
    } else {
      const remaining = this.fighter2.skillCooldownTimer;
      this.hud.updateSkillCooldown(this.fighter2.element, remaining, this.fighter2.data.skillCooldown);
    }
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
