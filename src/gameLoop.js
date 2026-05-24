/**
 * gameLoop.js — Main game loop and battle logic
 * Orchestrates physics, combat, VFX, and UI updates.
 */

import { Graphics, Sprite, Assets, Container, Text, TextStyle } from 'pixi.js';
import { updatePosition, bounceOffWalls, checkCircleCollision, resolveCollision } from './physics.js';
import { playSFX, preloadSFX, playSynthBounce, playSynthClash, playSynthDeflect, playRandomParry } from './utils/audio.js';

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
    this.soundCooldown = 0; // Rate-limit collision SFX

    this.onGameOver = null; // Callback

    this.activeEffects = []; // Store active Q whirlwind effects, etc.
    this.projectiles = []; // Store active flying arrows, etc.
    this.shards = []; // Store tumbling sliced arrow shards
    this.scheduledArrows = []; // Scheduled timed arrow combo queue
    this.scheduledMelee = []; // Scheduled timed melee hits (Ayaka)

    // Initial delay: start attacking 1 second after game start
    const startTime = performance.now();
    this.fighter1.lastAttackTime = startTime - 1500;
    this.fighter2.lastAttackTime = startTime - 1500;

    // Preload normal attack sound files for both characters
    for (let i = 1; i <= 5; i++) {
      preloadSFX(`/audio/yoimiya/yoimiya-na_${i}.mp3`);
      preloadSFX(`/audio/ayaka/ayaka-na_${i}.wav`);
    }

    // Preload skill and burst sound files
    preloadSFX('/audio/ayaka/ayaka-skill.mp3');
    preloadSFX('/audio/ayaka/ayaka-ultimate.mp3');
    preloadSFX('/audio/yoimiya/ayaka-skill.mp3'); // Existing misnamed file or just preloading for safety
    preloadSFX('/audio/yoimiya/yoimiya-skill.wav');
    preloadSFX('/audio/yoimiya/yoimiya-ultimate.wav');
    preloadSFX('/audio/circle-bounce.wav');

    // Preload parry sound effects
    for (let i = 1; i <= 4; i++) {
      preloadSFX(`/audio/ayaka/ayaka-parry_${i}.wav`);
    }
    preloadSFX('/audio/ayaka/ayaka-parry_infused.wav');

    // ── Bouncing Watermark Setup ──────────────────
    const style = new TextStyle({
      fontFamily: 'Outfit',
      fontSize: 24,
      fontWeight: '800',
      fill: '#000000',
      alpha: 0.15,
      letterSpacing: 2,
    });
    this.watermark = new Text({ text: 'gachacircles', style });
    this.watermark.anchor.set(0.5);
    this.watermark.alpha = 0.12;
    this.watermark.x = bounds.width / 2;
    this.watermark.y = bounds.height / 2;
    this.watermarkVx = 1.2;
    this.watermarkVy = 0.9;
    this.stage.addChild(this.watermark);
  }

  /**
   * Main update tick — called every frame by PixiJS ticker
   * @param {number} delta - Frame delta (1.0 = target frame rate)
   */
  update(delta) {
    if (this.gameOver) return;

    this.elapsedTime += delta * 0.016; // Convert to seconds roughly
    const currentTime = performance.now();

    // Reset temporary debuffs
    this.fighter1.slowMultiplier = 1.0;
    this.fighter2.slowMultiplier = 1.0;

    // Update collision cooldown
    if (this.collisionCooldown > 0) {
      this.collisionCooldown -= delta;
    }

    // Update sound cooldown
    if (this.soundCooldown > 0) {
      this.soundCooldown -= delta * 16.67;
    }

    // Apply Snappy Movement Damping to all fighters
    // This bleeds off high-velocity impulses (recoil, dashes, step-ins)
    [this.fighter1, this.fighter2].forEach(fighter => {
      if (!fighter.alive) return;
      const damping = 0.94; // Bleed 6% velocity per frame when over base speed
      const speed = Math.sqrt(fighter.body.vx ** 2 + fighter.body.vy ** 2);
      if (speed > 4.5) {
        fighter.body.vx *= Math.pow(damping, delta);
        fighter.body.vy *= Math.pow(damping, delta);
      }
    });



    // Process scheduled sequential arrow shots (Yoimiya's aa-a-a-aa-a sequence)
    const now = performance.now();
    if (this.scheduledArrows) {
      this.scheduledArrows = this.scheduledArrows.filter(shot => {
        if (now >= shot.time) {
          this._shootSingleArrow(shot.owner, shot.target, shot.sound, shot.isFinalShot);
          return false; // remove from queue
        }
        return true; // keep in queue
      });
    }

    // Process scheduled melee hits (Ayaka's N1-N5 sequence)
    if (this.scheduledMelee) {
      this.scheduledMelee = this.scheduledMelee.filter(hit => {
        if (now >= hit.time) {
          this._performMeleeHit(hit.owner, hit.target, hit.index, hit.duration, hit.sound);
          return false;
        }
        return true;
      });
    }

    // Update active projectiles (Yoimiya's flaming arrows)
    if (this.stage) {
      this.projectiles = this.projectiles.filter(arrow => {
        // ── 0. Homing tracking for Yoimiya's Kindling Sparks ───────────
        if (arrow.isKindlingSpark && arrow.target && arrow.target.alive) {
          const targetAngle = Math.atan2(arrow.target.body.y - arrow.y, arrow.target.body.x - arrow.x);
          let diff = targetAngle - arrow.angle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          
          // Curve smoothly towards opponent center
          arrow.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.085 * delta);
        }

        // Move arrow
        arrow.x += Math.cos(arrow.angle) * arrow.speed * delta;
        arrow.y += Math.sin(arrow.angle) * arrow.speed * delta;
        
        // Sync visual position
        arrow.visual.x = arrow.x;
        arrow.visual.y = arrow.y;
        arrow.visual.rotation = arrow.angle;

        // ── 1. Vortex Shield Check (Soumetsu shreds arrows) ────────────
        const isInVortex = !arrow.isFireworkRocket && this.activeEffects && this.activeEffects.some(effect => {
          if (effect.type === 'soumetsu_vortex') {
            const vdx = arrow.x - effect.x;
            const vdy = arrow.y - effect.y;
            const vdist = Math.sqrt(vdx * vdx + vdy * vdy);
            return vdist <= effect.radius;
          }
          return false;
        });

        if (isInVortex) {
          // Shred arrow on contact with vortex
          if (arrow.isBlazing) {
            // Trigger spectacular Melt reaction visual clash within the blizzard!
            if (arrow.target.vfx && typeof arrow.target.vfx.triggerMeltReaction === 'function') {
              arrow.target.vfx.triggerMeltReaction(arrow.x, arrow.y);
            }
            // Spawn a bold floating elemental reaction text popup!
            if (this.damageNumbers) {
              this.damageNumbers.spawn(arrow.x, arrow.y - 25, 'MELT!', 'cryo', true);
            }
          } else {
            // Standard physical deflect sparks
            if (arrow.target.vfx) {
              arrow.target.vfx.triggerCollision(arrow.x, arrow.y);
            }
          }

          playSynthDeflect();
          
          // Spawn the anime-style sliced arrow shards (respecting blazing state!)
          this._spawnSlicedArrowShards(arrow.x, arrow.y, arrow.angle, arrow.isBlazing);

          this.stage.removeChild(arrow.visual);
          arrow.visual.destroy();
          return false;
        }

        // Spawn fire particle trail behind flying arrow only if it's a Blazing Arrow!
        if (arrow.isBlazing && arrow.owner.vfx) {
          if (arrow.isFireworkRocket && typeof arrow.owner.vfx.triggerRocketTrail === 'function') {
            arrow.owner.vfx.triggerRocketTrail(arrow.x, arrow.y, arrow.angle);
          } else if (typeof arrow.owner.vfx.triggerArrowTrail === 'function') {
            arrow.owner.vfx.triggerArrowTrail(arrow.x, arrow.y, arrow.isKindlingSpark);
          } else {
            // Fallback for missing function
            arrow.owner.vfx.updateAmbient(arrow.x, arrow.y, delta);
          }
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
        
        // ── 2. Active Parry Check (Melee Swing deflection - blocks physical arrows, and blocks blazing arrows if Cryo Imbued!) ──
        if (!arrow.isFireworkRocket && dist < arrow.target.body.radius + 15) {
          const isCryoImbued = (arrow.target.id === 'ayaka' && arrow.target.passiveTimer > 0);
          const canParryBlazing = arrow.isBlazing && isCryoImbued;

          if (arrow.target.id === 'ayaka' && arrow.target.swingProgress < 0.9 && (!arrow.isBlazing || canParryBlazing)) {
            // PARRY! Sword deflects arrow
            if (canParryBlazing) {
              // Trigger spectacular Melt reaction visual clash!
              if (arrow.target.vfx && typeof arrow.target.vfx.triggerMeltReaction === 'function') {
                arrow.target.vfx.triggerMeltReaction(arrow.x, arrow.y);
              }
              // Play special infused parry sound on top of standard deflect
              playSFX('/audio/ayaka/ayaka-parry_infused.wav', 0.6);

              // Spawn a bold floating elemental reaction text popup!
              if (this.damageNumbers) {
                this.damageNumbers.spawn(arrow.x, arrow.y - 25, 'MELT!', 'cryo', true);
              }

              // Apply heavy knockback to Ayaka even if she blocks! Blazing arrows are powerful.
              const blockKnockback = 6.5;
              arrow.target.body.vx += Math.cos(arrow.angle) * blockKnockback;
              arrow.target.body.vy += Math.sin(arrow.angle) * blockKnockback;
            } else {
              // Standard physical deflect sparks
              if (arrow.target.vfx) {
                arrow.target.vfx.triggerCollision(arrow.x, arrow.y);
              }
              // Apply slight knockback for normal arrows if not Cryo Imbued
              if (!isCryoImbued) {
                const parryKnockback = 2.6;
                arrow.target.body.vx += Math.cos(arrow.angle) * parryKnockback;
                arrow.target.body.vy += Math.sin(arrow.angle) * parryKnockback;
              }
            }
            playRandomParry(0.5);
            
            // Spawn the anime-style sliced arrow shards (respecting blazing state!)
            this._spawnSlicedArrowShards(arrow.x, arrow.y, arrow.angle, arrow.isBlazing);

            this.stage.removeChild(arrow.visual);
            arrow.visual.destroy();
            return false;
          }
        }

        if (dist < arrow.target.body.radius + 5) {
          // HIT!
          let damage;
          if (arrow.isFireworkRocket) {
            // Massive firework rocket hit!
            damage = Math.round(arrow.owner.data.damage * arrow.owner.data.burstQ.damageMultiplier);
            const result = arrow.target.takeDamage(damage);

            // Apply heavy pyrotechnic knockback to Ayaka!
            const force = 13.5;
            arrow.target.body.vx += Math.cos(arrow.angle) * force;
            arrow.target.body.vy += Math.sin(arrow.angle) * force;

            // Trigger massive fireworks explosion visual and a piercing directional jet stream gust behind the enemy!
            if (arrow.owner.vfx) {
              if (typeof arrow.owner.vfx.triggerRocketImpact === 'function') {
                arrow.owner.vfx.triggerRocketImpact(arrow.x, arrow.y);
              } else {
                arrow.owner.vfx.triggerSkill(arrow.x, arrow.y);
              }
              
              if (typeof arrow.owner.vfx.triggerUltimateHitGust === 'function') {
                arrow.owner.vfx.triggerUltimateHitGust(arrow.x, arrow.y, arrow.angle);
              }
            }

            // Screen shake
            this._screenShake();

            // Spawn damage numbers
            if (this.damageNumbers) {
              this.damageNumbers.spawn(arrow.x, arrow.y - 30, damage, arrow.owner.element, true);
            }

            // Apply the Aurous Blaze mark!
            const circleGfx1 = new Graphics();
            const circleGfx2 = new Graphics();

            circleGfx1.circle(0, 0, 10);
            circleGfx1.fill({ color: 0xff6d00, alpha: 0.15 });
            circleGfx1.stroke({ color: 0xffab40, width: 2 });

            circleGfx2.circle(0, 0, 10);
            circleGfx2.fill({ color: 0xff6d00, alpha: 0.15 });
            circleGfx2.stroke({ color: 0xffab40, width: 2 });

            this.stage.addChild(circleGfx1);
            this.stage.addChild(circleGfx2);

            this.activeEffects.push({
              type: 'aurous_blaze_mark',
              owner: arrow.owner,
              target: arrow.target,
              timer: 10.0,
              explosionCD: 2.0,
              circle1: circleGfx1,
              circle2: circleGfx2,
              angleOffset: 0
            });

            if (result.died) {
              this._endGame(arrow.owner);
            }

            // Clean up rocket projectile
            this.stage.removeChild(arrow.visual);
            arrow.visual.destroy();
            return false;
          }
          else if (arrow.isKindlingSpark) {
            damage = Math.round(arrow.owner.getCurrentDamage() * 0.25); // Kindling sparks deal 25% damage
          } else {
            damage = Math.round(arrow.owner.getCurrentDamage() * 0.75); // Blazing arrow deals 75%
            if (!arrow.isBlazing) {
              // Normal physical arrow deals half damage
              damage = Math.round(damage * 0.5);
            }
          }
          const result = arrow.target.takeDamage(damage);

          // Pyro explosion burst VFX only for Blazing Arrows!
          if (arrow.isBlazing && arrow.owner.vfx) {
            if (arrow.isFinalShot && typeof arrow.owner.vfx.triggerFinisherImpact === 'function') {
              arrow.owner.vfx.triggerFinisherImpact(arrow.x, arrow.y);
            } else if (typeof arrow.owner.vfx.triggerBlazingCollision === 'function') {
              arrow.owner.vfx.triggerBlazingCollision(arrow.x, arrow.y);
            } else {
              arrow.owner.vfx.triggerCollision(arrow.x, arrow.y);
            }
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

      if (effect.type === 'ryuukin_cast') {
        if (effect.timer <= 0) {
          effect.owner.isInvincible = false; // Turn off invincibility!
          // Clean up the contracting ring!
          if (effect.ring) {
            if (effect.owner.vfx && effect.owner.vfx.container) {
              effect.owner.vfx.container.removeChild(effect.ring);
            } else {
              this.stage.removeChild(effect.ring);
            }
            effect.ring.destroy();
          }

          // Transition to Phase 2: Fire the massive firework rocket!
          this._shootFireworkRocket(effect.owner, effect.target);
          return false; // Remove casting effect
        }

        // Spawn dense, swirling and crackling pyrotechnic windup sparkles around Yoimiya!
        if (effect.owner.vfx && typeof effect.owner.vfx.triggerWindupSparks === 'function') {
          effect.owner.vfx.triggerWindupSparks(effect.owner.body.x, effect.owner.body.y);
        }

        // Update the closing-in ring from orange to white!
        if (effect.ring) {
          const progress = Math.min(1.0, Math.max(0.0, 1 - (effect.timer / 1.0))); // 0 (start) to 1 (end)
          
          // Radius starts at 160px and closes to 30px (circle boundary)
          const ringRadius = 160 * (1 - progress) + 30;
          
          // Interpolate color from orange (0xff6d00) to white (0xffffff)
          const startR = 0xff, startG = 0x6d, startB = 0x00;
          const endR = 0xff, endG = 0xff, endB = 0xff;
          
          const currentR = Math.round(startR + (endR - startR) * progress);
          const currentG = Math.round(startG + (endG - startG) * progress);
          const currentB = Math.round(startB + (endB - startB) * progress);
          const currentColor = (currentR << 16) | (currentG << 8) | currentB;

          effect.ring.clear();
          effect.ring.circle(0, 0, ringRadius);
          
          // Elegant glow stroke that solidifies as it gets closer
          const alpha = 0.35 + 0.65 * progress;
          effect.ring.stroke({ color: currentColor, width: 3.0, alpha });
          
          effect.ring.x = effect.owner.body.x;
          effect.ring.y = effect.owner.body.y;
        }
        return true;
      }
      else if (effect.type === 'aurous_blaze_mark') {
        if (effect.timer <= 0 || !effect.target.alive) {
          this.stage.removeChild(effect.circle1);
          this.stage.removeChild(effect.circle2);
          effect.circle1.destroy();
          effect.circle2.destroy();
          return false;
        }

        // Orbiting logic: two medium-sized orange circles circling her dynamically
        effect.angleOffset += delta * 0.045; // Speed of orbit
        const radius = 45; // Orbit distance around target circle
        
        effect.circle1.x = effect.target.body.x + Math.cos(effect.angleOffset) * radius;
        effect.circle1.y = effect.target.body.y + Math.sin(effect.angleOffset) * radius;
        
        effect.circle2.x = effect.target.body.x + Math.cos(effect.angleOffset + Math.PI) * radius;
        effect.circle2.y = effect.target.body.y + Math.sin(effect.angleOffset + Math.PI) * radius;

        // Emit sizzling, burning particle trails from both orbiting circles on every frame!
        if (effect.owner.vfx && typeof effect.owner.vfx.triggerMarkTrail === 'function') {
          effect.owner.vfx.triggerMarkTrail(
            effect.circle1.x, effect.circle1.y,
            effect.circle2.x, effect.circle2.y
          );
        }

        // Explosion tick logic: detonates every 2 seconds
        effect.explosionCD -= delta * 0.016;
        if (effect.explosionCD <= 0) {
          effect.explosionCD = 2.0; // Reset CD

          // DETONATION EXPLOSION!
          const tickDmg = 16;
          const result = effect.target.takeDamage(tickDmg);

          // Trigger massive Pyrotechnic sparks burst!
          if (effect.owner.vfx) {
            effect.owner.vfx.triggerCollision(effect.target.body.x, effect.target.body.y);
          }

          // Play sharp metal firework pop synth!
          playSynthDeflect();

          if (this.damageNumbers) {
            this.damageNumbers.spawn(
              effect.target.body.x,
              effect.target.body.y - 25,
              tickDmg,
              'pyro',
              true // Styled Crit damage numbers!
            );
          }

          if (result.died) {
            this._endGame(effect.owner);
          }
        }
        return true;
      }
      else if (effect.type === 'soumetsu_cast') {
        // Phase 1: Casting logic
        if (effect.timer <= 0) {
          effect.owner.isInvincible = false; // Turn off invincibility!
          // Transitions to Phase 2: Unleash Vortex
          this.stage.removeChild(effect.telegraph);
          if (effect.ring) {
            this.stage.removeChild(effect.ring);
            effect.ring.destroy();
          }
          effect.telegraph.destroy();

          const vortex = new Container();
          
          // Helper to draw a sharp, tapered ice blade
          const drawBlade = (r, t, len, color, alpha, speed) => {
            const g = new Graphics();
            const half = len / 2;
            // Draw a sharp "eye" or "petal" shape curved along an arc
            g.moveTo(Math.cos(-half) * r, Math.sin(-half) * r);
            // Outer tapered edge
            g.bezierCurveTo(
              Math.cos(-half/2) * (r + t), Math.sin(-half/2) * (r + t),
              Math.cos(half/2) * (r + t), Math.sin(half/2) * (r + t),
              Math.cos(half) * r, Math.sin(half) * r
            );
            // Inner tapered edge
            g.bezierCurveTo(
              Math.cos(half/2) * (r - t), Math.sin(half/2) * (r - t),
              Math.cos(-half/2) * (r - t), Math.sin(-half/2) * (r - t),
              Math.cos(-half) * r, Math.sin(-half) * r
            );
            g.fill({ color, alpha });
            g.spinSpeed = speed;
            return g;
          };

          // Generate an ultra-messy hurricane of 90 independent blades - scaled to 75% of previous size (max 135px)
          // Included darker tones for contrast against light background
          const cryoColors = [0x5ed4fc, 0xb4e1fa, 0xffffff, 0x9df0ff, 0x1a6dd4, 0x0c3366];
          for (let k = 0; k < 90; k++) {
            const r = 34 + Math.random() * 101;      // Max radius ~135px (75% of 180px)
            const t = 1.5 + Math.random() * 9;      // Balanced thickness
            const len = 0.2 + Math.random() * 2.5; // Varying arc length
            const speed = (0.1 + Math.random() * 0.3) * (Math.random() > 0.5 ? 1 : -1); 
            const color = cryoColors[Math.floor(Math.random() * cryoColors.length)];
            const alpha = 0.12 + Math.random() * 0.4; // Slightly lower alpha for high count
            
            const blade = drawBlade(r, t, len, color, alpha, speed);
            blade.rotation = Math.random() * Math.PI * 2;
            vortex.addChild(blade);
          }

          this.stage.addChild(vortex);

          // Return new effect state for Phase 2
          Object.assign(effect, {
            type: 'soumetsu_vortex',
            timer: 5.0,
            x: effect.owner.body.x,
            y: effect.owner.body.y,
            visual: vortex,
            radius: 135, // Set vortex radius to 75% of 180 (135px)
            hitTimer: 0,
            hits: 0
          });
          return true;
        }

        // Lock laser onto enemy
        const dx = effect.target.body.x - effect.owner.body.x;
        const dy = effect.target.body.y - effect.owner.body.y;
        effect.angle = Math.atan2(dy, dx);

        const progress = 1 - (effect.timer / 1.3); // Divisor reduced to 1.3s to match shorter windup
        const ringRadius = 250 * (1 - progress) + 40; // Starts at 250, closes to 40

        if (effect.owner.vfx) {
          const range = 800;
          // Draw laser
          effect.owner.vfx.drawSoumetsuTelegraph(
            effect.telegraph,
            effect.owner.body.x,
            effect.owner.body.y,
            effect.owner.body.x + Math.cos(effect.angle) * range,
            effect.owner.body.y + Math.sin(effect.angle) * range,
            progress
          );
          
          // Draw contracting ring
          if (effect.ring) {
            effect.owner.vfx.drawSoumetsuRing(
              effect.ring,
              effect.owner.body.x,
              effect.owner.body.y,
              ringRadius,
              progress
            );
          }

          // Vacuum particles: pull from outside the ring toward Ayaka
          if (Math.random() < 0.8 * delta) {
            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnR = ringRadius + 20 + Math.random() * 50;
            const px = effect.owner.body.x + Math.cos(spawnAngle) * spawnR;
            const py = effect.owner.body.y + Math.sin(spawnAngle) * spawnR;
            
            // Trigger multi-toned particles that are attracted to center
            effect.owner.vfx.triggerVacuumParticles(px, py, effect.owner.body.x, effect.owner.body.y);
          }
        }
        return true;
      } 
      else if (effect.type === 'soumetsu_vortex') {
        // Phase 2: Vortex Movement & Damage
        let currentSpeed = 1.17; // Base speed increased by 30% (from 0.9 to 1.17)
        const distToEnemy = Math.sqrt((effect.x - effect.target.body.x)**2 + (effect.y - effect.target.body.y)**2);
        const isEnemyInside = distToEnemy < 135; // Reduced to 75% of 180 (135px)

        // Slow down by 50% more if enemy is inside
        if (isEnemyInside) {
          currentSpeed *= 0.5;
          effect.target.slowMultiplier = 0.2; // Reduce enemy movement speed by 80% (multiplier 0.2)
        }

        effect.x += Math.cos(effect.angle) * currentSpeed * delta;
        effect.y += Math.sin(effect.angle) * currentSpeed * delta;

        // Visual spin: independently rotate 90 blade layers
        effect.visual.x = effect.x;
        effect.visual.y = effect.y;
        if (effect.visual.children) {
          effect.visual.children.forEach(child => {
            child.rotation += (child.spinSpeed || 0.2) * delta;
          });
        }

        // Emit constant ice particles for "messy" blizzard feel - spread adjusted for 135 radius
        if (effect.owner.vfx && Math.random() < 0.6 * delta) {
          if (typeof effect.owner.vfx.triggerVortexParticles === 'function') {
            effect.owner.vfx.triggerVortexParticles(
              effect.x + (Math.random() - 0.5) * 270,
              effect.y + (Math.random() - 0.5) * 270,
              effect.x,
              effect.y
            );
          } else {
            effect.owner.vfx.triggerCollision(
              effect.x + (Math.random() - 0.5) * 270, // Spread ~2x radius (2 * 135 = 270)
              effect.y + (Math.random() - 0.5) * 270
            );
          }
        }

        // Sticky logic: if very close to enemy, stop moving entirely
        if (distToEnemy < 40) {
          effect.x -= Math.cos(effect.angle) * currentSpeed * delta; // cancel movement
          effect.y -= Math.sin(effect.angle) * currentSpeed * delta;
        }

        // Damage ticks (19 hits every 0.25s approx)
        effect.hitTimer += delta * 0.016;
        if (effect.hitTimer >= 0.25 && effect.hits < 19) {
          effect.hitTimer = 0;

          // Only deal damage if target is actually inside the vortex!
          if (isEnemyInside) {
            effect.hits++;
            const damage = 10; // Ramped up to 10 (was 0.4x dmg)
            const result = effect.target.takeDamage(damage);

            if (effect.owner.vfx) {
              effect.owner.vfx.triggerCollision(effect.target.body.x, effect.target.body.y);
            }
            if (this.damageNumbers) {
              this.damageNumbers.spawn(effect.target.body.x, effect.target.body.y - 30, damage, 'cryo', false);
            }

            if (result.died) {
              this._endGame(effect.owner);
            }
          }
        }
          // Finale Bloom (The +1)
          if (effect.timer <= 0) {
          const bloomDmg = Math.round(effect.owner.getCurrentDamage() * 1.5);
          const result = effect.target.takeDamage(bloomDmg);

          if (effect.owner.vfx) {
            effect.owner.vfx.triggerHyoukaBurst(effect.x, effect.y);
          }
          if (this.damageNumbers) {
            this.damageNumbers.spawn(effect.x, effect.y - 30, bloomDmg, 'cryo', true);
          }
          this._screenShake();

          if (result.died) {
            this._endGame(effect.owner);
          }

          this.stage.removeChild(effect.visual);

          effect.visual.destroy();
          return false;
        }
        return true;
      }
      else if (effect.type === 'hyouka') {

        // Track Ayaka's circle center
        effect.visual.x = effect.owner.body.x;
        effect.visual.y = effect.owner.body.y;

        if (effect.symbolSprite) {
          effect.symbolSprite.x = effect.owner.body.x;
          effect.symbolSprite.y = effect.owner.body.y;
        }

        // Dynamic visual effects: grow size and transition from light ice blue to a rising heavy darkness
        const elapsed = 1.0 - effect.timer; // goes from 0.0 to 1.0 seconds
        const progress = Math.min(1.0, elapsed / 1.0); // progress ratio from 0 to 1

        const scale = Math.min(1.0, elapsed / 0.15); // Grow scale over first 150ms
        effect.visual.scale.set(scale);

        if (effect.symbolSprite) {
          const popProgress = Math.min(1.0, elapsed / 0.35); // pop up over 350ms
          const targetSize = 360; // match E skill's radius (radius 180px means diameter 360px!)
          effect.symbolSprite.width = targetSize * popProgress;
          effect.symbolSprite.height = targetSize * popProgress;
          effect.symbolSprite.alpha = 0.75 * popProgress;
          effect.symbolSprite.rotation = elapsed * 0.5; // slow spin
        }

        // Redraw radius circle in real-time to represent gathering dark frosty energy
        effect.visual.clear();

        // Linearly interpolate colors:
        // Outline transitions from bright Cryo blue (0x4fc3f7) to deep navy shadow-blue (0x0d47a1)
        const rOut = Math.round(79 * (1 - progress) + 13 * progress);
        const gOut = Math.round(195 * (1 - progress) + 71 * progress);
        const bOut = Math.round(247 * (1 - progress) + 161 * progress);
        const outlineColor = (rOut << 16) | (gOut << 8) | bOut;

        // Fill transitions from semi-transparent Cryo blue (0x80deea) to deep ominous frozen abyss blue/black (0x070c1e)
        const rFill = Math.round(128 * (1 - progress) + 7 * progress);
        const gFill = Math.round(222 * (1 - progress) + 12 * progress);
        const bFill = Math.round(234 * (1 - progress) + 30 * progress);
        const fillColor = (rFill << 16) | (gFill << 8) | bFill;

        const fillAlpha = 0.06 + 0.39 * progress; // gets denser and darker
        const strokeAlpha = 0.6 + 0.4 * progress; // gets fully opaque
        const strokeWidth = 2 + 1.5 * progress; // stroke thickens as energy accumulates

        effect.visual.circle(0, 0, 180);
        effect.visual.fill({ color: fillColor, alpha: fillAlpha });
        effect.visual.stroke({ color: outlineColor, width: strokeWidth, alpha: strokeAlpha });

        // Draw inner target ring that fades out as energy condenses
        effect.visual.circle(0, 0, 90);
        effect.visual.stroke({ color: outlineColor, width: 1, alpha: 0.3 * (1 - progress) });

        // Dynamic pulsing alpha animation overlay
        effect.visual.alpha = 0.85 + Math.sin(performance.now() * 0.015) * 0.1;

        // If 1 second has passed, execute the blooming ice explosion!
        if (effect.timer <= 0) {
          const dx = effect.target.body.x - effect.owner.body.x;
          const dy = effect.target.body.y - effect.owner.body.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Check if opponent is within the 180px radius
          if (dist <= effect.radius) {
            // Strong repel force (fling/launch opponent upward/away!)
            const force = 10;
            const angle = Math.atan2(dy, dx);
            effect.target.body.vx += Math.cos(angle) * force;
            effect.target.body.vy += Math.sin(angle) * force;

            const damage = Math.round(effect.owner.data.damage * effect.owner.data.skillE.damageMultiplier);
            const result = effect.target.takeDamage(damage);

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

          // Trigger the beautiful Hyouka single-burst ice explosion at the location of Ayaka's circle (no lingering swirling particles!)
          if (effect.owner.vfx) {
            if (typeof effect.owner.vfx.triggerHyoukaBurst === 'function') {
              effect.owner.vfx.triggerHyoukaBurst(effect.owner.body.x, effect.owner.body.y);
            } else {
              effect.owner.vfx.triggerSkill(effect.owner.body.x, effect.owner.body.y);
            }
          }

          // Screen shake on bloom
          this._screenShake();

          // Clean up the Cryo symbol sprite instantly (no lingering fade on the field!)
          if (effect.symbolSprite && effect.owner.vfx && effect.owner.vfx.container) {
            effect.owner.vfx.container.removeChild(effect.symbolSprite);
            effect.symbolSprite.destroy();
          }

          // Clean up the visual radius circle object from the owner's VFX container
          if (effect.owner.vfx && effect.owner.vfx.container) {
            effect.owner.vfx.container.removeChild(effect.visual);
          } else {
            this.stage.removeChild(effect.visual);
          }
          effect.visual.destroy();
          return false; // remove effect from active list
        }
      }
      return effect.timer > 0;
    });

    // Check for skill and burst activation (auto-activate when ready)
    this._checkAbilityActivation(this.fighter1, this.fighter2);
    this._checkAbilityActivation(this.fighter2, this.fighter1);

    // Auto standard attacks for Yoimiya (ranged Normal Attacks)
    if (this.fighter2.id === 'yoimiya' && this.fighter2.alive) {
      let currentAttackSpeed = this.fighter2.data.attackSpeed;
      if (this.fighter2.isInfused) {
        currentAttackSpeed *= 2.0; // Double attack speed during infusion!
      }
      // 2-second base interval (2000ms) at base speed (2.5), which scales with attack speed: 5000 / speed.
      // Begin the interval timer only after the last shot has been fired (the 7-arrow combo takes exactly 1400ms from first shot to last shot).
      const comboDurationMs = 1400;
      const baseIntervalMs = 2500 / currentAttackSpeed; // Was 5000, halved for faster combo cycles
      const cooldownMs = comboDurationMs + baseIntervalMs + this.fighter2.attackIntervalOffset;
      
      if (currentTime - this.fighter2.lastAttackTime >= cooldownMs) {
        this.fighter2.registerAttack(currentTime);
        this._startYoimiyaArrowCombo(this.fighter2, this.fighter1);
      }
    }

    // Auto standard attacks for Ayaka (melee Normal Attacks)
    if (this.fighter1.id === 'ayaka' && this.fighter1.alive) {
      const comboDurationMs = 1500; // Ayaka's N1-N5 string takes ~1.5s
      const delayBetweenCombosMs = 1000; // Restart 1s after last attack finishes
      const cooldownMs = comboDurationMs + delayBetweenCombosMs + this.fighter1.attackIntervalOffset;

      if (currentTime - this.fighter1.lastAttackTime >= cooldownMs) {
        this.fighter1.registerAttack(currentTime);
        this._startAyakaMeleeCombo(this.fighter1, this.fighter2);
      }
    }

    // 4. Update physics positions (NOW respecting slowMultiplier set by activeEffects)
    updatePosition(this.fighter1.body, delta * this.fighter1.slowMultiplier);
    updatePosition(this.fighter2.body, delta * this.fighter2.slowMultiplier);

    // 5. Wall bouncing
    const b1 = bounceOffWalls(this.fighter1.body, this.bounds);
    const b2 = bounceOffWalls(this.fighter2.body, this.bounds);
    if ((b1 || b2) && this.soundCooldown <= 0) {
      playSynthBounce();
      this.soundCooldown = 100; // 100ms throttle
    }

    // 6. Circle-circle collision
    const collision = checkCircleCollision(this.fighter1.body, this.fighter2.body);
    if (collision.colliding) {
      resolveCollision(this.fighter1.body, this.fighter2.body, collision);
      if (this.soundCooldown <= 0) {
        playSynthClash();
        this.soundCooldown = 100;
      }
      this._handleCombat(collision, currentTime);
    }

    // Update tumbling sliced shards
    if (this.shards) {
      this.shards = this.shards.filter(shard => {
        shard.life -= delta * 0.016;
        if (shard.life <= 0) {
          this.stage.removeChild(shard.visual);
          shard.visual.destroy();
          return false;
        }

        // Apply movement physics
        shard.x += shard.vx * delta * 0.6;
        shard.y += shard.vy * delta * 0.6;

        // Sync graphics representation
        shard.visual.x = shard.x;
        shard.visual.y = shard.y;
        shard.visual.rotation += shard.rotSpeed * delta;
        shard.visual.alpha = Math.max(0, shard.life / shard.maxLife);

        return true;
      });
    }

    // Update fighters (Visual sync)
    this.fighter1.update(delta, this.elapsedTime, this.fighter2);
    this.fighter2.update(delta, this.elapsedTime, this.fighter1);

    // ── Update Bouncing Watermark ─────────────────
    if (this.watermark) {
      this.watermark.x += this.watermarkVx * delta;
      this.watermark.y += this.watermarkVy * delta;

      const halfW = this.watermark.width / 2;
      const halfH = this.watermark.height / 2;

      // Bounce off X
      if (this.watermark.x - halfW < this.bounds.x) {
        this.watermark.x = this.bounds.x + halfW;
        this.watermarkVx *= -1;
      } else if (this.watermark.x + halfW > this.bounds.x + this.bounds.width) {
        this.watermark.x = this.bounds.x + this.bounds.width - halfW;
        this.watermarkVx *= -1;
      }

      // Bounce off Y
      if (this.watermark.y - halfH < this.bounds.y) {
        this.watermark.y = this.bounds.y + halfH;
        this.watermarkVy *= -1;
      } else if (this.watermark.y + halfH > this.bounds.y + this.bounds.height) {
        this.watermark.y = this.bounds.y + this.bounds.height - halfH;
        this.watermarkVy *= -1;
      }
    }

    // Update HUD
    this._updateHUD();
  }

  /**
   * Handle combat when circles collide
   */
  _handleCombat(collision, currentTime) {
    // Note: Melee damage is now primarily handled by _performMeleeHit for Ayaka
    // However, N5 lunge deals damage on contact during the dash phase
    const isAyakaLunging = this.fighter1.id === 'ayaka' && 
                           this.fighter1.comboIndex === 4 && 
                           this.fighter1.swingProgress > 0.1 && 
                           this.fighter1.swingProgress < 0.6;

    // Apply damage from fighter1 (Ayaka) to fighter2 (Yoimiya)
    // Fix: check hasHitThisSwing for lunging hits to prevent multi-hit stuttering
    const canLungeHit = isAyakaLunging && !this.fighter1.hasHitThisSwing;
    
    if (canLungeHit || (this.fighter1.canAttack(currentTime) && this.fighter1.id !== 'ayaka')) {
      const damage = this.fighter1.getCurrentDamage();
      const isCrit = (this.fighter1.id === 'ayaka' && this.fighter1.passiveTimer > 0);
      const result = this.fighter2.takeDamage(damage);

      if (result.actualDamage > 0) {
        if (isAyakaLunging) {
          this.fighter1.hasHitThisSwing = true; // Block further hits this animation step
        } else {
          this.fighter1.registerAttack(currentTime);
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

        if (result.died) {
          this._endGame(this.fighter1);
          return;
        }
      }
    }

    // Apply damage from fighter2 to fighter1 (only for melee fighters, not ranged Yoimiya)
    if (this.fighter2.id !== 'yoimiya' && this.fighter2.canAttack(currentTime)) {
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
          playSFX('/audio/ayaka/ayaka-skill.mp3');
          // Create the frost blooming ice radius visual indicator
          const visual = new Graphics();
          visual.circle(0, 0, 180);
          visual.fill({ color: 0x80deea, alpha: 0.06 }); // very soft Cryo blue fill
          visual.stroke({ color: 0x4fc3f7, width: 2, alpha: 0.6 }); // bold Cryo blue border
          visual.circle(0, 0, 90);
          visual.stroke({ color: 0x4fc3f7, width: 1, alpha: 0.3 }); // inner target ring
          
          visual.x = fighter.body.x;
          visual.y = fighter.body.y;
          
          // Add to the fighter's VFX container so it renders beneath the character circles!
          if (fighter.vfx && fighter.vfx.container) {
            fighter.vfx.container.addChild(visual);
          } else {
            this.stage.addChild(visual);
          }

          const effect = {
            type: 'hyouka',
            owner: fighter,
            target: opponent,
            timer: 1.0, // 1.0 second delay before bloom
            radius: 180,
            visual: visual,
            symbolSprite: null
          };
          this.activeEffects.push(effect);

          // Asynchronously load the cryo.png symbol so it doesn't block the loop
          Assets.load('/cryo.png').then(texture => {
            if (this.gameOver) return;
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.x = fighter.body.x;
            sprite.y = fighter.body.y;
            sprite.width = 0;
            sprite.height = 0;
            sprite.alpha = 0;
            sprite.tint = 0x80deea; // Cryo light-cyan glow
            
            // Add to the fighter's VFX container so it renders beneath the character circles!
            if (fighter.vfx && fighter.vfx.container) {
              fighter.vfx.container.addChild(sprite);
            } else {
              this.stage.addChild(sprite);
            }
            effect.symbolSprite = sprite;
          }).catch(err => console.warn('Could not load Cryo symbol:', err));
        } else if (fighter.id === 'yoimiya') {
          playSFX('/audio/yoimiya/yoimiya-skill.wav');
          // Yoimiya E: Infusion, triggers aura visual (VFX triggered inside activateSkill)
          
          // Do NOT call _startYoimiyaArrowCombo directly here to avoid double streams of arrows.
          // Instead, if she is not already shooting, reset the cooldown so the auto standard attack loop fires immediately.
          const isShooting = this.scheduledArrows && this.scheduledArrows.some(shot => shot.owner === fighter);
          if (!isShooting) {
            fighter.lastAttackTime = 0;
          }
        }
      }
    }

    if (fighter.burstCDTimer <= 0) {
      const activated = fighter.activateBurst();
      if (activated) {
        // Play ultimate animation inside character circle portrait if available
        if (typeof fighter.playUltAnimation === 'function') {
          fighter.playUltAnimation();
        }

        if (fighter.id === 'ayaka') {
          playSFX('/audio/ayaka/ayaka-ultimate.mp3', 0.78);
          // Ayaka Q: Two-phase Soumetsu burst
          // Phase 1: 2.1s Casting with Laser Telegraph + Contracting Ring
          const telegraphGfx = new Graphics();
          const ringGfx = new Graphics();
          this.stage.addChild(telegraphGfx);
          this.stage.addChild(ringGfx);

          this.activeEffects.push({
            type: 'soumetsu_cast',
            owner: fighter,
            target: opponent,
            timer: 1.3, // Windup reduced by another 0.3s (from 1.6s to 1.3s) for snappier feel!
            telegraph: telegraphGfx,
            ring: ringGfx,
            angle: 0
          });

          fighter.isInvincible = true; // Invincible during burst cast windup!

          if (fighter.vfx) {
            fighter.vfx.triggerCastAura(fighter.body.x, fighter.body.y);
          }
          this._screenShake();
        }
        else if (fighter.id === 'yoimiya') {
          // Yoimiya Q: Two-phase Ryuukin Saxifrage burst
          // Phase 1: 1.0s Casting with sparkles and orange particles around her
          const ringGfx = new Graphics();
          if (fighter.vfx && fighter.vfx.container) {
            fighter.vfx.container.addChild(ringGfx);
          } else {
            this.stage.addChild(ringGfx);
          }

          this.activeEffects.push({
            type: 'ryuukin_cast',
            owner: fighter,
            target: opponent,
            timer: 1.0,
            ring: ringGfx
          });

          fighter.isInvincible = true; // Invincible during burst cast windup!

          // Play cast audio/whistle
          playSFX('/audio/yoimiya/yoimiya-ultimate.wav', 1.0);
        }
      }
    }
  }

  /**
   * Schedule Ayaka's Normal Attack sequence: 1-2-3-4(flurry)-5
   */
  _startAyakaMeleeCombo(fighter, opponent) {
    const targetTime = performance.now();
    
    // Approximate delays: N1(0), N2(0.3s), N3(0.65s), N4(1.0s, flurry), N5(1.5s)
    const steps = [
      { delay: 0, index: 0, dur: 250, sound: '/audio/ayaka/ayaka-na_1.wav' },
      { delay: 300, index: 1, dur: 250, sound: '/audio/ayaka/ayaka-na_2.wav' },
      { delay: 650, index: 2, dur: 350, sound: '/audio/ayaka/ayaka-na_3.wav' },
      // N4 flurry (3 hits)
      { delay: 1000, index: 3, dur: 350, sound: '/audio/ayaka/ayaka-na_4.wav' },
      { delay: 1080, index: 3, dur: 0, sound: null }, // phantom hits for flurry
      { delay: 1160, index: 3, dur: 0, sound: null },
      // N5 finisher
      { delay: 1500, index: 4, dur: 500, sound: '/audio/ayaka/ayaka-na_5.wav' }
    ];

    steps.forEach(step => {
      this.scheduledMelee.push({
        time: targetTime + step.delay,
        owner: fighter,
        target: opponent,
        index: step.index,
        duration: step.dur,
        sound: step.sound
      });
    });
  }

  /**
   * Perform a single melee hit in a combo
   */
  _performMeleeHit(fighter, opponent, index, duration, sound) {
    if (!fighter.alive || !opponent.alive) return;

    if (sound) {
      playSFX(sound);
    }

    // Trigger animation in fighter
    if (duration > 0) {
      fighter.triggerMeleeSwing(index, duration);
    }

    // Check distance for damage (melee range)
    const dx = opponent.body.x - fighter.body.x;
    const dy = opponent.body.y - fighter.body.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const range = fighter.body.radius + opponent.body.radius + 60;

    if (dist < range) {
      const damage = fighter.getCurrentDamage();
      const isCrit = fighter.passiveTimer > 0;
      const result = opponent.takeDamage(damage);

      if (result.actualDamage > 0) {
        // Ayaka C1: Every hit during Cryo infusion reduces Hyouka (E) cooldown by 1.0s
        if (fighter.id === 'ayaka' && fighter.passiveTimer > 0) {
          fighter.skillCDTimer = Math.max(0, fighter.skillCDTimer - 1.0);
        }

        // VFX
        if (fighter.vfx) {
          fighter.vfx.triggerCollision(
            fighter.body.x + dx * 0.5,
            fighter.body.y + dy * 0.5
          );
        }

        // Damage Number
        if (this.damageNumbers) {
          this.damageNumbers.spawn(
            opponent.body.x,
            opponent.body.y - 20,
            result.actualDamage,
            fighter.element,
            isCrit
          );
        }

        if (result.died) {
          this._endGame(fighter);
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
      '/audio/yoimiya/yoimiya-na_1.mp3', // segment 1 (aa)
      null,
      '/audio/yoimiya/yoimiya-na_2.mp3', // segment 2 (a)
      '/audio/yoimiya/yoimiya-na_3.mp3', // segment 3 (a)
      '/audio/yoimiya/yoimiya-na_4.mp3', // segment 4 (aa)
      null,
      '/audio/yoimiya/yoimiya-na_5.mp3'  // segment 5 (a)
    ];
    
    delays.forEach((delay, index) => {
      this.scheduledArrows.push({
        time: targetTime + delay,
        owner: fighter,
        target: opponent,
        sound: sounds[index],
        isFinalShot: index === delays.length - 1 // The last arrow in the 7-arrow sequence
      });
    });
  }

  /**
   * Shoot a single flaming arrow towards the opponent's current position
   */
  _shootSingleArrow(fighter, opponent, sound, isFinalShot = false) {
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
    const isBlazing = fighter.isInfused;
    const speed = isBlazing ? 33.0 : 16.5; // Buffed arrows retain old speed (+50%), unbuffed reduced to 50% (+50%)

    // Apply snappy recoil to the shooter (push Yoimiya backward)
    // Normal recoil is scaled to 0.6 of the enhanced (isBlazing) recoil strength.
    let recoilStrength = (isFinalShot ? 16.5 : 8.5) * (isBlazing ? 1.0 : 0.6);
    if (!isFinalShot) {
      recoilStrength *= 0.25;
    }
    
    fighter.body.vx -= Math.cos(angle) * recoilStrength;
    fighter.body.vy -= Math.sin(angle) * recoilStrength;

    // Trigger spark effect muzzle flash originating from Yoimiya's circle
    if (fighter.vfx) {
      // Offset start position to bow (approx 30px out)
      const bowX = startX + Math.cos(angle) * 30;
      const bowY = startY + Math.sin(angle) * 30;

      if (isFinalShot && isBlazing && typeof fighter.vfx.triggerFinisherLaunch === 'function') {
        fighter.vfx.triggerFinisherLaunch(bowX, bowY, angle);
      } else if (isBlazing) {
        fighter.vfx.triggerCollision(bowX, bowY);
      }
    }

    // Create arrow graphics
    const visual = new Graphics();
    
    if (isBlazing) {
      // ── Blazing Arrow (Pyro infused) ────────────────
      // Draw pointed flaming arrow tip
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
    } else {
      // ── Normal Arrow (Physical) ─────────────────────
      // Draw pointed silver/iron arrow shaft and tip
      visual.moveTo(-10, -1.5);
      visual.lineTo(8, -1.5);
      visual.lineTo(12, 0);
      visual.lineTo(8, 1.5);
      visual.lineTo(-10, 1.5);
      visual.closePath();
      visual.fill({ color: 0x90a4ae }); // Slate silver/iron main body
      
      // Draw brown wooden tail fletching (feathers)
      visual.moveTo(-8, -4);
      visual.lineTo(-4, -1.5);
      visual.lineTo(-10, -1.5);
      visual.closePath();
      visual.fill({ color: 0x8d6e63 }); // Wooden brown fletching
      
      visual.moveTo(-8, 4);
      visual.lineTo(-4, 1.5);
      visual.lineTo(-10, 1.5);
      visual.closePath();
      visual.fill({ color: 0x8d6e63 });
    }
    
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
      target: opponent,
      isBlazing: isBlazing,
      isFinalShot: isFinalShot
    });

    if (isBlazing && isFinalShot) {
      // Fire 3 homing kindling sparks at wide angles (-0.8, 0, 0.8 rad) that track the opponent!
      // They divert from original trajectory slowly then home in.
      for (let offset of [-0.8, 0, 0.8]) {
        const sparkAngle = angle + offset;
        const sparkVisual = new Graphics();
        
        // Draw small elegant pyrotechnic fire sparkler orb
        sparkVisual.circle(0, 0, 4.5);
        sparkVisual.fill({ color: 0xffaa00 });
        sparkVisual.stroke({ color: 0xff3d00, width: 1.5 });
        
        sparkVisual.x = startX;
        sparkVisual.y = startY;
        sparkVisual.rotation = sparkAngle;
        
        this.stage.addChild(sparkVisual);
        
        this.projectiles.push({
          x: startX,
          y: startY,
          angle: sparkAngle,
          speed: speed * 0.15, // Curving sparks travel MUCH slower to ensure homing!
          visual: sparkVisual,
          owner: fighter,
          target: opponent,
          isBlazing: true,
          isKindlingSpark: true
        });
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

  /**
   * Spawn two realistic, tumbling arrow shards (sliced in half) that fly
   * outward to the sides and fade away, representing an anime-style sword cut!
   */
  _spawnSlicedArrowShards(x, y, angle, isBlazing = false) {
    if (!this.stage) return;

    // ── Shard 1: The Silver Metal Tip (Front Half) ────────────────────
    const shardA = new Graphics();
    shardA.moveTo(0, -1.5);
    shardA.lineTo(8, -1.5);
    shardA.lineTo(12, 0);
    shardA.lineTo(8, 1.5);
    shardA.lineTo(0, 1.5);
    shardA.closePath();
    shardA.fill({ color: isBlazing ? 0xff4500 : 0x90a4ae }); // Silver steel tip or Red-orange Blaze

    shardA.x = x;
    shardA.y = y;
    shardA.rotation = angle;
    this.stage.addChild(shardA);

    // ── Shard 2: The Wooden Feather Fletching (Back Half) ──────────────
    const shardB = new Graphics();
    shardB.moveTo(-10, -1.5);
    shardB.lineTo(0, -1.5);
    shardB.lineTo(0, 1.5);
    shardB.lineTo(-10, 1.5);
    shardB.closePath();
    shardB.fill({ color: isBlazing ? 0xff4500 : 0x90a4ae });

    shardB.moveTo(-8, -4);
    shardB.lineTo(-4, -1.5);
    shardB.lineTo(-10, -1.5);
    shardB.closePath();
    shardB.fill({ color: isBlazing ? 0xffaa00 : 0x8d6e63 }); // Wooden brown or Golden Blaze fletch

    shardB.moveTo(-8, 4);
    shardB.lineTo(-4, 1.5);
    shardB.lineTo(-10, 1.5);
    shardB.closePath();
    shardB.fill({ color: isBlazing ? 0xffaa00 : 0x8d6e63 });

    shardB.x = x;
    shardB.y = y;
    shardB.rotation = angle;
    this.stage.addChild(shardB);

    // Perpendicular angles relative to arrow trajectory
    const angleLeft = angle - Math.PI / 2;
    const angleRight = angle + Math.PI / 2;

    const baseSpeed = 8.0;    // Increased from 4.0 for wider spread
    const forwardSpeed = 5.0; // Increased from 2.0 to fly past the parryer

    // Store shards in loop queue
    this.shards.push(
      {
        x: x,
        y: y,
        vx: Math.cos(angle) * forwardSpeed + Math.cos(angleLeft) * baseSpeed,
        vy: Math.sin(angle) * forwardSpeed + Math.sin(angleLeft) * baseSpeed,
        rotSpeed: 0.22,
        visual: shardA,
        life: 0.7,
        maxLife: 0.7
      },
      {
        x: x,
        y: y,
        vx: Math.cos(angle) * forwardSpeed + Math.cos(angleRight) * baseSpeed,
        vy: Math.sin(angle) * forwardSpeed + Math.sin(angleRight) * baseSpeed,
        rotSpeed: -0.22,
        visual: shardB,
        life: 0.7,
        maxLife: 0.7
      }
    );
  }

  /**
   * Shoot a massive firework rocket projectile that flies towards the enemy
   */
  _shootFireworkRocket(fighter, opponent) {
    const startX = fighter.body.x;
    const startY = fighter.body.y;
    const dx = opponent.body.x - startX;
    const dy = opponent.body.y - startY;
    const angle = Math.atan2(dy, dx);

    const visual = new Graphics();
    // Draw a massive, beautiful golden firework rocket arrow
    visual.moveTo(-15, -4);
    visual.lineTo(15, -4);
    visual.lineTo(22, 0);
    visual.lineTo(15, 4);
    visual.lineTo(-15, 4);
    visual.closePath();
    visual.fill({ color: 0xffaa00 }); // Saturated golden rocket
    visual.stroke({ color: 0xff3d00, width: 2 }); // Vivid red border

    // Draw fire tail/thrust core
    visual.moveTo(-15, -2);
    visual.lineTo(-25, 0);
    visual.lineTo(-15, 2);
    visual.closePath();
    visual.fill({ color: 0xffffff });

    visual.x = startX;
    visual.y = startY;
    visual.rotation = angle;
    this.stage.addChild(visual);

    this.projectiles.push({
      x: startX,
      y: startY,
      angle: angle,
      speed: 32.0, // Hyper fast rocket!
      visual: visual,
      owner: fighter,
      target: opponent,
      isBlazing: true,
      isFireworkRocket: true
    });

    // Play a firework whistle launcher SFX!
    playSFX('/audio/yoimiya/yoimiya-na_5.mp3', 0.85); // Crisp whistle launcher
  }
}
