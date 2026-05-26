import { Container as OriginalContainer, Graphics as OriginalGraphics, Sprite as OriginalSprite, Assets, Text, TextStyle } from 'pixi.js';
import { updatePosition, bounceOffWalls, checkCircleCollision, resolveCollision } from './physics.js';
import { 
  playSFX as originalPlaySFX, 
  preloadSFX, 
  playSynthBounce as originalPlaySynthBounce, 
  playSynthClash as originalPlaySynthClash, 
  playSynthDeflect as originalPlaySynthDeflect, 
  playRandomParry as originalPlayRandomParry 
} from './utils/audio.js';

let currentLoopInstanceForAudio = null;

function createMockVisual() {
  const mock = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rotation: 0,
    alpha: 1,
    visible: true,
    tint: 0xffffff,
    width: 0,
    height: 0,
    parent: { removeChild: () => {} },
    scale: { set: () => {}, x: 1, y: 1 },
    anchor: { set: () => {}, x: 0.5, y: 0.5 },
    clear: () => mock,
    circle: () => mock,
    rect: () => mock,
    moveTo: () => mock,
    lineTo: () => mock,
    bezierCurveTo: () => mock,
    quadraticCurveTo: () => mock,
    arc: () => mock,
    closePath: () => mock,
    fill: () => mock,
    stroke: () => mock,
    destroy: () => {}
  };
  return mock;
}

function Container() {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    const mock = createMockVisual();
    mock.children = [];
    mock.addChild = (child) => {
      if (child) {
        mock.children.push(child);
        child.parent = mock;
      }
      return child;
    };
    mock.addChildAt = (child, index) => {
      if (child) {
        mock.children.splice(index, 0, child);
        child.parent = mock;
      }
      return child;
    };
    mock.removeChild = (child) => {
      if (child) {
        const idx = mock.children.indexOf(child);
        if (idx !== -1) mock.children.splice(idx, 1);
        child.parent = null;
      }
      return child;
    };
    mock.removeChildren = () => {
      const old = mock.children;
      mock.children = [];
      old.forEach(child => {
        if (child) child.parent = null;
      });
      return old;
    };
    return mock;
  }
  return new OriginalContainer();
}

function Graphics() {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    return createMockVisual();
  }
  return new OriginalGraphics();
}

function Sprite(texture) {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    return createMockVisual();
  }
  return new OriginalSprite(texture);
}

function playSFX(path, volume) {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    if (typeof window !== 'undefined' && typeof window.audioInterceptor === 'function') {
      window.audioInterceptor(path, volume);
    }
    return;
  }
  originalPlaySFX(path, volume);
}

function playSynthBounce() {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    if (typeof window !== 'undefined' && typeof window.audioInterceptor === 'function') {
      window.audioInterceptor('/audio/circle-bounce.wav', 0.126);
    }
    return;
  }
  originalPlaySynthBounce();
}

function playSynthClash() {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    if (typeof window !== 'undefined' && typeof window.audioInterceptor === 'function') {
      window.audioInterceptor('/audio/circle-bounce.wav', 0.266);
    }
    return;
  }
  originalPlaySynthClash();
}

function playSynthDeflect() {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    if (typeof window !== 'undefined' && typeof window.audioInterceptor === 'function') {
      window.audioInterceptor('/audio/circle-bounce.wav', 0.196);
    }
    return;
  }
  originalPlaySynthDeflect();
}

function playRandomParry(volume) {
  if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
    if (typeof window !== 'undefined' && typeof window.audioInterceptor === 'function') {
      // Pick parry_1.wav for footprint
      window.audioInterceptor('/audio/ayaka/ayaka-parry_1.wav', volume);
    }
    return;
  }
  originalPlayRandomParry(volume);
}

const performance = {
  now: () => {
    if (currentLoopInstanceForAudio && currentLoopInstanceForAudio.headlessMode) {
      return currentLoopInstanceForAudio.virtualTime;
    }
    return window.performance.now();
  }
};

export class GameLoop {
  /**
   * @param {import('./characters/Fighter.js').Fighter} fighter1
   * @param {import('./characters/Fighter.js').Fighter} fighter2
   * @param {Object} bounds - Arena bounds { x, y, width, height }
   * @param {Object} hud - HUD instance
   * @param {Object} damageNumbers - DamageNumbers instance
   */
  constructor(fighter1, fighter2, bounds, hud, damageNumbers, stage) {
    currentLoopInstanceForAudio = this;
    this.headlessMode = false;
    this.virtualTime = 0;
    this.recordReplayEnabled = true;

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

    this.paused = false;
    this.pauseContainer = new Container();
    this.pauseContainer.visible = false;
    this.stage.addChild(this.pauseContainer);

    this._setupPauseVisuals();

    this.activeEffects = []; // Store active Q whirlwind effects, etc.
    this.projectiles = []; // Store active flying arrows, etc.
    this.shards = []; // Store tumbling sliced arrow shards
    this.scheduledArrows = []; // Scheduled timed arrow combo queue
    this.scheduledMelee = []; // Scheduled timed melee hits (Ayaka)

    // Initial delay: start attacking 2 seconds after game start (Grace Period)
    const startTime = performance.now();
    // Setting these far back so they are ready to attack immediately after the 2s grace period ends
    this.fighter1.lastAttackTime = startTime - 5000;
    this.fighter2.lastAttackTime = startTime - 5000;

    // Preload normal attack sound files for both characters
    for (let i = 1; i <= 5; i++) {
      preloadSFX(`/audio/yoimiya/yoimiya-na_${i}.mp3`);
      preloadSFX(`/audio/ayaka/ayaka-na_${i}.wav`);
      preloadSFX(`/audio/keqing/keqing-na_${i}.wav`);
    }

    // Preload skill and burst sound files
    preloadSFX('/audio/ayaka/ayaka-skill.mp3');
    preloadSFX('/audio/ayaka/ayaka-ultimate.wav');
    preloadSFX('/audio/ayaka/ayaka-ultimate_tick.wav');
    preloadSFX('/audio/yoimiya/yoimiya-skill.wav');
    preloadSFX('/audio/yoimiya/yoimiya-ultimate.wav');
    preloadSFX('/audio/keqing/keqing-skill.wav');
    preloadSFX('/audio/keqing/keqing-skill2.wav');
    preloadSFX('/audio/keqing/keqing-ultimate.wav');
    preloadSFX('/audio/circle-bounce.wav');
    preloadSFX('/audio/winner-splash.wav');

    // Preload parry and hit sound effects
    for (let i = 1; i <= 4; i++) {
      preloadSFX(`/audio/ayaka/ayaka-parry_${i}.wav`);
    }
    preloadSFX('/audio/ayaka/ayaka-parry_infused.wav');
    preloadSFX('/audio/ayaka/ayaka-hit.wav');
    preloadSFX('/audio/ayaka/ayaka-hit_infused.wav');
    preloadSFX('/audio/keqing/keqing-hit.wav');
    preloadSFX('/audio/keqing/keqing-hit_infused.wav');

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

    // ── Replay System State Initialization ─────────
    this.replayFrames = [];
    this.replaySFXEvents = [];
    this.replayMode = false;
    this.replayPlayhead = 0;
    this.replaySpeed = 1.0;
    this.replayPaused = false;
    this.replayTime = 0;
    this.replayEffectsCache = new Map();
    
    // Dedicated PIXI containers for replay visuals to ensure instant redraws/scrubs
    this.replayProjectilesContainer = new Container();
    this.replayEffectsContainer = new Container();
    this.stage.addChild(this.replayProjectilesContainer);
    this.stage.addChild(this.replayEffectsContainer);

    // Audio logger hook
    window.audioInterceptor = (path, volume) => {
      if (this.replayMode || !this.recordReplayEnabled) return;
      this.replaySFXEvents.push({
        time: this.elapsedTime,
        path: path,
        volume: volume
      });
    };

    // Damage Number logger hook
    if (this.damageNumbers) {
      const originalSpawn = this.damageNumbers.spawn.bind(this.damageNumbers);
      this.damageNumbers.spawn = (x, y, text, type, isCrit) => {
        originalSpawn(x, y, text, type, isCrit);
        if (!this.replayMode && this.recordReplayEnabled) {
          this.replaySFXEvents.push({
            type: 'damage_number',
            time: this.elapsedTime,
            x: x,
            y: y,
            text: text,
            element: type,
            isCrit: isCrit
          });
        }
      };
    }

    // VFX trigger logger hook
    const logVFX = (element, method, args) => {
      if (this.replayMode || !this.recordReplayEnabled) return;
      this.replaySFXEvents.push({
        type: 'vfx',
        time: this.elapsedTime,
        element: element,
        method: method,
        args: args
      });
    };

    [this.fighter1, this.fighter2].forEach(fighter => {
      const vfx = fighter.vfx;
      if (!vfx) return;

      const methodsToWrap = [
        'triggerCollision',
        'triggerBlazingCollision',
        'triggerFinisherImpact',
        'triggerFinisherLaunch',
        'triggerMeltReaction',
        'triggerSkill',
        'triggerInfusion',
        'triggerCastAura',
        'triggerBlazeDetonation',
        'triggerUltimateHitGust',
        'triggerRocketImpact',
        // Keqing / Electro methods
        'triggerStilettoThrow',
        'triggerTeleportBurst',
        'triggerStarwardSword',
        'triggerStarwardExplosion',
        'triggerSlashArc',
      ];

      methodsToWrap.forEach(method => {
        if (typeof vfx[method] === 'function') {
          const original = vfx[method].bind(vfx);
          vfx[method] = (...args) => {
            original(...args);
            logVFX(fighter.element, method, args);
          };
        }
      });
    });
  }

  _setupPauseVisuals() {
    const { x, y, width, height } = this.bounds;
    
    // 1. Gray transparent overlay
    const overlay = new Graphics();
    overlay.rect(x, y, width, height);
    overlay.fill({ color: 0x333333, alpha: 0.4 });
    this.pauseContainer.addChild(overlay);

    // 2. Large pulsing white columns
    const colW = 40;
    const colH = 120;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    this.pauseCol1 = new Graphics();
    this.pauseCol1.rect(-colW - 15, -colH / 2, colW, colH);
    this.pauseCol1.fill({ color: 0xffffff });
    
    this.pauseCol2 = new Graphics();
    this.pauseCol2.rect(15, -colH / 2, colW, colH);
    this.pauseCol2.fill({ color: 0xffffff });

    this.pauseCol1.x = centerX;
    this.pauseCol1.y = centerY;
    this.pauseCol2.x = centerX;
    this.pauseCol2.y = centerY;

    this.pauseContainer.addChild(this.pauseCol1);
    this.pauseContainer.addChild(this.pauseCol2);
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    this.pauseContainer.visible = this.paused;
    
    // If we just unpaused, reset lastAttackTimes to prevent immediate burst of attacks
    if (!this.paused) {
      const now = performance.now();
      const offset = 1500;
      this.fighter1.lastAttackTime = now - offset;
      this.fighter2.lastAttackTime = now - offset;
    }
  }

  /**
   * Main update tick — called every frame by PixiJS ticker
   * @param {number} delta - Frame delta (1.0 = target frame rate)
   */
  update(delta) {
    if (this.replayMode) {
      this.updateReplay(delta);
      return;
    }
    // Even if paused, we want the pause visuals to animate
    if (this.paused) {
      // Pulsing columns (changing darkness slightly)
      const pulse = 0.7 + Math.sin(performance.now() * 0.005) * 0.3;
      this.pauseCol1.alpha = pulse;
      this.pauseCol2.alpha = pulse;
      return;
    }

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
          if (typeof hit.condition === 'function' && !hit.condition()) {
            return false; // remove from queue without executing
          }
          this._performMeleeHit(hit.owner, hit.target, hit.index, hit.duration, hit.sound);
          return false;
        }
        return true;
      });
    }

    // Update active projectiles (Yoimiya's flaming arrows)
    if (this.stage) {
      this.projectiles = this.projectiles.filter(arrow => {
        // ── Keqing: Stiletto Projectile ───────────────────────────
        if (arrow.isStiletto) {
          const shooter = arrow.owner;
          if (shooter && shooter.vfx && typeof shooter.vfx.triggerStilettoTrail === 'function') {
            shooter.vfx.triggerStilettoTrail(arrow.x, arrow.y, arrow.angle);
          }
          
          arrow.x += Math.cos(arrow.angle) * arrow.speed * delta;
          arrow.y += Math.sin(arrow.angle) * arrow.speed * delta;
          
          arrow.visual.x = arrow.x;
          arrow.visual.y = arrow.y;
          arrow.visual.rotation = arrow.angle;

          const dx = arrow.x - arrow.target.body.x;
          const dy = arrow.y - arrow.target.body.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Placement conditions: hits enemy or reaches target destination
          const tx = arrow.targetX - arrow.x;
          const ty = arrow.targetY - arrow.y;
          const distToDest = Math.sqrt(tx * tx + ty * ty);

          if (dist < arrow.target.body.radius + 10 || distToDest < 20) {
            // Place mark at impact
            const beh = shooter.behavior;
            if (beh && typeof beh._placeStilettoMark === 'function') {
              beh._placeStilettoMark(shooter, arrow.target, this, arrow.x, arrow.y);
            }
            this.stage.removeChild(arrow.visual);
            arrow.visual.destroy();
            return false;
          }
          return true;
        }

        // ── 0. Homing tracking for Yoimiya's Kindling Sparks ───────────
        if (arrow.isKindlingSpark && arrow.target && arrow.target.alive) {
          const targetAngle = Math.atan2(arrow.target.body.y - arrow.y, arrow.target.body.x - arrow.x);
          let diff = targetAngle - arrow.angle;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          
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
        let shreddingVortex = null;
        const isInVortex = !arrow.isFireworkRocket && this.activeEffects && this.activeEffects.some(effect => {
          if (effect.type === 'soumetsu_vortex') {
            const vdx = arrow.x - effect.x;
            const vdy = arrow.y - effect.y;
            const vdist = Math.sqrt(vdx * vdx + vdy * vdy);
            if (vdist <= effect.radius) {
              shreddingVortex = effect;
              return true;
            }
          }
          return false;
        });

        if (isInVortex) {
          // Shred arrow on contact with vortex
          if (arrow.isBlazing) {
            // Trigger spectacular Melt reaction visual clash within the blizzard!
            if (arrow.target.vfx && typeof arrow.target.vfx.triggerMeltReaction === 'function') {
              arrow.target.vfx.triggerMeltReaction(arrow.x, arrow.y, arrow.angle);
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
          this._spawnSlicedArrowShards(arrow.x, arrow.y, arrow.angle, arrow.isBlazing, shreddingVortex);

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
                arrow.target.vfx.triggerMeltReaction(arrow.x, arrow.y, arrow.angle);
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
            arrow.owner.stats.damageDealt.burst += result.actualDamage;

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

            drawSparkle(circleGfx1, 0xffab40);
            drawSparkle(circleGfx2, 0xffab40);

            if (!this.headlessMode) {
              if (arrow.owner.vfx && arrow.owner.vfx.container) {
                arrow.owner.vfx.container.addChildAt(circleGfx1, 0);
                arrow.owner.vfx.container.addChildAt(circleGfx2, 0);
              } else {
                this.stage.addChild(circleGfx1);
                this.stage.addChild(circleGfx2);
              }
            }

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
          if (arrow.isBlazing || arrow.isKindlingSpark) {
            arrow.owner.stats.damageDealt.enhancedNormal += result.actualDamage;
          } else {
            arrow.owner.stats.damageDealt.normal += result.actualDamage;
          }

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

          // Interpolate fill color from dark-orange (#9e2a00) to glowing white (#ffffff)
          const fillStartR = 0x9e, fillStartG = 0x2a, fillStartB = 0x00;
          const fillEndR = 0xff, fillEndG = 0xff, fillEndB = 0xff;
          
          const fillR = Math.round(fillStartR + (fillEndR - fillStartR) * progress);
          const fillG = Math.round(fillStartG + (fillEndG - fillStartG) * progress);
          const fillB = Math.round(fillStartB + (fillEndB - fillStartB) * progress);
          const fillCol = (fillR << 16) | (fillG << 8) | fillB;

          // Growing fill opacity as energy accumulates (starts at 0.35, peaks at 0.90 for an almost solid core)
          let fillAlpha = 0.35 + 0.55 * progress;

          // High-frequency white flickering to emphasize detonation (especially in the last 40% of the cast)
          let finalCol = fillCol;
          if (progress > 0.6) {
            const timeScale = performance.now() * 0.08; // High frequency speed
            const isFlickerWhite = Math.sin(timeScale) > 0.1 || Math.random() < 0.3;
            
            if (isFlickerWhite) {
              finalCol = 0xffffff;
              fillAlpha = Math.min(1.0, fillAlpha + 0.15); // Boost opacity during flashes
            }
          }

          effect.ring.clear();
          effect.ring.circle(0, 0, ringRadius);
          
          // Fill the circle
          effect.ring.fill({ color: finalCol, alpha: fillAlpha });
          
          // Elegant glow stroke that solidifies as it gets closer
          const alpha = 0.35 + 0.65 * progress;
          effect.ring.stroke({ color: currentColor, width: 3.5, alpha });
          
          effect.ring.x = effect.owner.body.x;
          effect.ring.y = effect.owner.body.y;
        }
        return true;
      }
      else if (effect.type === 'aurous_blaze_mark') {
        if (effect.timer <= 0 || !effect.target.alive) {
          if (effect.circle1.parent) {
            effect.circle1.parent.removeChild(effect.circle1);
          }
          if (effect.circle2.parent) {
            effect.circle2.parent.removeChild(effect.circle2);
          }
          effect.circle1.destroy();
          effect.circle2.destroy();
          return false;
        }

        if (!this.headlessMode) {
          // Orbiting logic: two medium-sized orange sparkles circling her dynamically and rotating on their own axes
          effect.angleOffset += delta * 0.045; // Speed of orbit
          const radius = 45; // Orbit distance around target circle
          
          effect.circle1.x = effect.target.body.x + Math.cos(effect.angleOffset) * radius;
          effect.circle1.y = effect.target.body.y + Math.sin(effect.angleOffset) * radius;
          effect.circle1.rotation = effect.angleOffset * 2.0; // Self-spinning sparkle
          
          effect.circle2.x = effect.target.body.x + Math.cos(effect.angleOffset + Math.PI) * radius;
          effect.circle2.y = effect.target.body.y + Math.sin(effect.angleOffset + Math.PI) * radius;
          effect.circle2.rotation = -effect.angleOffset * 2.0; // Self-spinning opposite direction

          // Pre-detonation warning flickering phase: flash white 0.8 seconds before the interval explosion
          let sparkleColor = 0xffab40; // Light orange
          if (effect.explosionCD <= 0.8) {
            const flashRate = 75; // high-frequency flickering speed in ms
            const isWhite = Math.floor(performance.now() / flashRate) % 2 === 0;
            sparkleColor = isWhite ? 0xffffff : 0xffab40;
          }
          drawSparkle(effect.circle1, sparkleColor);
          drawSparkle(effect.circle2, sparkleColor);

          // Emit sizzling, burning particle trails from both orbiting circles on every frame!
          if (effect.owner.vfx && typeof effect.owner.vfx.triggerMarkTrail === 'function') {
            effect.owner.vfx.triggerMarkTrail(
              effect.circle1.x, effect.circle1.y,
              effect.circle2.x, effect.circle2.y
            );
          }
        }

        // Explosion tick logic: detonates every 2 seconds
        effect.explosionCD -= delta * 0.016;
        if (effect.explosionCD <= 0) {
          effect.explosionCD = 2.0; // Reset CD

          // DETONATION EXPLOSION!
          const tickDmg = 16;
          const result = effect.target.takeDamage(tickDmg);
          effect.owner.stats.damageDealt.skill += result.actualDamage;

          // Trigger massive Pyrotechnic interval explosion burst!
          if (effect.owner.vfx && typeof effect.owner.vfx.triggerBlazeDetonation === 'function') {
            effect.owner.vfx.triggerBlazeDetonation(effect.target.body.x, effect.target.body.y);
          } else if (effect.owner.vfx) {
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
          if (effect.symbolSprite) {
            if (effect.owner.vfx && effect.owner.vfx.container) {
              effect.owner.vfx.container.removeChild(effect.symbolSprite);
            } else {
              this.stage.removeChild(effect.symbolSprite);
            }
            effect.symbolSprite.destroy();
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

        if (!this.headlessMode) {
          const progress = 1 - (effect.timer / 1.3); // Divisor reduced to 1.3s to match shorter windup
          const ringRadius = 250 * (1 - progress) + 40; // Starts at 250, closes to 40

          // Sync and spin Cryo symbol sprite
          if (effect.symbolSprite) {
            effect.symbolSprite.x = effect.owner.body.x;
            effect.symbolSprite.y = effect.owner.body.y;
            const size = 300 * (1 - progress) + 80; // Shrink as ring contracts
            effect.symbolSprite.width = size;
            effect.symbolSprite.height = size;
            effect.symbolSprite.alpha = 0.2 + progress * 0.45; // Get solid as blast nears
            effect.symbolSprite.rotation = -progress * 1.5; // Spin slowly counter-clockwise
          }

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
        }
        return true;
      } 
      else if (effect.type === 'soumetsu_vortex') {
        // Phase 2: Vortex Movement & Damage
        let currentSpeed = 1.755; // Base speed increased by another 50% (from 1.17 to 1.755)
        const distToEnemy = Math.sqrt((effect.x - effect.target.body.x)**2 + (effect.y - effect.target.body.y)**2);
        const isEnemyInside = distToEnemy < 135; // Reduced to 75% of 180 (135px)

        // Slow down by 50% more if enemy is inside
        if (isEnemyInside) {
          currentSpeed *= 0.5;
          effect.target.slowMultiplier = 0.2; // Reduce enemy movement speed by 80% (multiplier 0.2)
        }

        effect.x += Math.cos(effect.angle) * currentSpeed * delta;
        effect.y += Math.sin(effect.angle) * currentSpeed * delta;

        if (!this.headlessMode) {
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
            effect.owner.stats.damageDealt.burst += result.actualDamage;

            // Play specific tick sound for active hits
            playSFX('/audio/ayaka/ayaka-ultimate_tick.wav', 0.5);

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
          effect.owner.stats.damageDealt.burst += result.actualDamage;

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

        if (!this.headlessMode) {
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
        }

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
      // ── Keqing: Stellar Stiletto auto-detonation ──────────────
      else if (effect.type === 'keqing_stiletto_mark') {
        if (effect.timer <= 0) {
          const beh = effect.owner.behavior;
          if (beh && typeof beh._cleanupMark === 'function') {
            beh._cleanupMark(effect.owner);
          }
          return false;
        }
        // Rotate and flicker the mark
        if (effect.visual && !this.headlessMode) {
          effect.visual.rotation += 0.05 * delta;
          effect.visual.alpha = 0.7 + 0.3 * Math.sin(performance.now() * 0.01);
        }
        return true;
      }
      else if (effect.type === 'stellar_stiletto') {
        if (effect.timer <= 0) {
          // Auto-detonate: time expired, Keqing forcibly recalled
          if (effect.owner.stilettoThrown) {
            const beh = effect.owner.behavior;
            if (beh && typeof beh._detonateStiletto === 'function') {
              beh._detonateStiletto(effect.owner, effect.target, this, Graphics);
            }
          }
          return false; // remove effect
        }
        // Flicker stiletto marker visually
        if (effect.visual && !this.headlessMode) {
          const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.012);
          effect.visual.alpha = pulse;
          // Rotate the lightning bolt icon
          effect.visual.rotation = (effect.visual.rotation || 0) + 0.04;
        }
        return true;
      }
      // ── Keqing: Starward Sword slash sequence ──────────────
      else if (effect.type === 'starward_cast') {
        if (effect.timer <= 0) {
          // Burst complete — clean up ring
          effect.owner.isInvincible = false;
          effect.owner.container.alpha = 1.0; // Restore visibility

          if (effect.ring) {
            this.stage.removeChild(effect.ring);
            effect.ring.destroy();
          }

          // Hit 10: Final massive explosion
          if (effect.owner.vfx && typeof effect.owner.vfx.triggerStarwardExplosion === 'function') {
            effect.owner.vfx.triggerStarwardExplosion(effect.owner.body.x, effect.owner.body.y);
          }

          const expDmg = Math.round(effect.owner.getCurrentDamage() * (effect.owner.data.burstQ.explosionMultiplier || 3.39));
          const expRadius = effect.owner.data.burstQ.aoeRadius || 150;
          const edx = effect.target.body.x - effect.owner.body.x;
          const edy = effect.target.body.y - effect.owner.body.y;
          if (Math.sqrt(edx * edx + edy * edy) < expRadius) {
            const expResult = effect.target.takeDamage(expDmg);
            effect.owner.stats.damageDealt.burst += expResult.actualDamage;
            if (this.damageNumbers) {
              this.damageNumbers.spawn(effect.target.body.x, effect.target.body.y - 30, expResult.actualDamage, effect.owner.element, true);
            }
            this._screenShake();
            if (expResult.died) this._endGame(effect.owner);
          }
          return false;
        }

        // Per-slash damage pulses (Hits 2-9)
        const totalSlashes = effect.totalSlashes || 8;
        // Total sequence is 2.1s. Slashes happen between 0.4s and 1.7s (approx 1.3s window)
        const startWindow = 1.7; // timer value (counting down from 2.1)
        const endWindow = 0.4;   // timer value
        const windowDuration = startWindow - endWindow;
        const slashInterval = windowDuration / totalSlashes;

        // Current progress into the slash window
        if (effect.timer <= startWindow && effect.timer > endWindow) {
          const timeInWindow = startWindow - effect.timer;
          const expectedSlash = Math.floor(timeInWindow / slashInterval) + 1; // +1 because we start at index 1 (Hit 2)

          if (expectedSlash > (effect.slashIndex || 0) && expectedSlash <= totalSlashes) {
            effect.slashIndex = expectedSlash;

            // Hits 2-9: Rapid slashes
            const slashDmg = Math.round(effect.owner.getCurrentDamage() * (effect.owner.data.burstQ.slashMultiplier || 0.41));
            const sAngle = (effect.slashIndex / totalSlashes) * Math.PI * 2;
            const dx2 = effect.target.body.x - effect.owner.body.x;
            const dy2 = effect.target.body.y - effect.owner.body.y;
            const aoeR = 120;

            if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < aoeR) {
              const slashResult = effect.target.takeDamage(slashDmg);
              effect.owner.stats.damageDealt.burst += slashResult.actualDamage;
              if (this.damageNumbers) {
                // Use isCrit check dynamically for each hit
                const beh = effect.owner.behavior;
                const isCritHit = beh && typeof beh.isCrit === 'function' ? beh.isCrit(effect.owner) : false;
                this.damageNumbers.spawn(effect.target.body.x, effect.target.body.y - 15, slashResult.actualDamage, effect.owner.element, isCritHit);
              }
              if (slashResult.died) {
                this._endGame(effect.owner);
                return false;
              }
            }

            // VFX slash arc
            if (effect.owner.vfx && typeof effect.owner.vfx.triggerSlashArc === 'function') {
              // Fire multiple arcs per slash for better visibility
              for (let i = 0; i < 3; i++) {
                const randomOffset = (Math.random() - 0.5) * 0.5;
                effect.owner.vfx.triggerSlashArc(effect.owner.body.x, effect.owner.body.y, sAngle + randomOffset);
              }
            }
          }
        }

        // Windup sparks (Visual filler)
        if (effect.owner.vfx && typeof effect.owner.vfx.triggerWindupSparks === 'function') {
          effect.owner.vfx.triggerWindupSparks(effect.owner.body.x, effect.owner.body.y);
        }

        // Update ring
        if (effect.ring && !this.headlessMode) {
          const prog = Math.min(1.0, Math.max(0.0, 1 - (effect.timer / 2.1)));
          const ringRadius = 150 * (1 - prog) + 30;
          const alpha = 0.3 + 0.7 * prog;
          effect.ring.clear();
          effect.ring.circle(0, 0, ringRadius);
          effect.ring.fill({ color: 0xc77dff, alpha: alpha * 0.25 });
          effect.ring.stroke({ color: 0xe040fb, width: 3, alpha });
          effect.ring.x = effect.owner.body.x;
          effect.ring.y = effect.owner.body.y;
        }
        return true;
      }
      return effect.timer > 0;
    });

    // Check for skill and burst activation (auto-activate when ready)
    if (this.elapsedTime >= 2.0) {
      this._checkAbilityActivation(this.fighter1, this.fighter2);
      this._checkAbilityActivation(this.fighter2, this.fighter1);

      // Auto standard attacks — uses behavior.isRanged and behavior.startAttackCombo
      [this.fighter1, this.fighter2].forEach((fighter, idx) => {
        const opponent = idx === 0 ? this.fighter2 : this.fighter1;
        const beh = fighter.behavior;
        if (!fighter.alive) return;

        if (beh && beh.isRanged) {
          // Ranged auto-attack scheduling
          let currentAttackSpeed = fighter.data.attackSpeed;
          if (fighter.isInfused) currentAttackSpeed *= 2.0;
          const comboDurationMs = fighter.data.comboDurationMs || 1400;
          const baseIntervalMs = (fighter.data.delayBetweenCombosMs || 2500) / currentAttackSpeed;
          const cooldownMs = comboDurationMs + baseIntervalMs + fighter.attackIntervalOffset;
          if (currentTime - fighter.lastAttackTime >= cooldownMs) {
            fighter.registerAttack(currentTime);
            if (typeof beh.startAttackCombo === 'function') {
              beh.startAttackCombo(fighter, opponent, this);
            }
          }
        } else if (beh && !beh.isRanged) {
          // Melee auto-attack scheduling
          const comboDurationMs = fighter.data.comboDurationMs || 1500;
          const delayBetweenCombosMs = fighter.data.delayBetweenCombosMs || 1000;
          const cooldownMs = comboDurationMs + delayBetweenCombosMs + fighter.attackIntervalOffset;
          if (currentTime - fighter.lastAttackTime >= cooldownMs) {
            fighter.registerAttack(currentTime);
            if (typeof beh.startAttackCombo === 'function') {
              beh.startAttackCombo(fighter, opponent, this);
            }
          }
        }
      });
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
        // ── Persistent Shard Logic (Orbiting Vortex) ─────────────────
        if (shard.isPersistent && shard.parentVortex) {
          const vortex = shard.parentVortex;
          
          // Check if parent vortex is still active in the game
          const vortexStillAlive = this.activeEffects.includes(vortex);
          
          if (vortexStillAlive && !shard.isDying) {
            // Orbiting physics: tangential force around vortex center
            const dx = shard.x - vortex.x;
            const dy = shard.y - vortex.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
              const orbitalForce = 0.5 * delta;
              const tx = -dy / dist;
              const ty = dx / dist;
              
              // Apply centripetal pull to stay in circle + tangential spin
              const pull = 0.15 * delta;
              shard.vx += tx * orbitalForce - (dx / dist) * pull;
              shard.vy += ty * orbitalForce - (dy / dist) * pull;
            }
            
            // Damping to prevent infinite acceleration
            shard.vx *= Math.pow(0.96, delta);
            shard.vy *= Math.pow(0.96, delta);
          } 
          else if (!shard.isDying) {
            // Vortex disappeared! Trigger death sequence
            shard.isDying = true;
            shard.life = 0.8; // Final 0.8s life
            shard.maxLife = 0.8;
            
            // Calculate outward "slingshot" trajectory
            const dx = shard.x - vortex.x;
            const dy = shard.y - vortex.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dx / dist;
            const dirY = dy / dist;
            
            // Perpendicular spin component
            const tx = -dirY;
            const ty = dirX;
            
            // Flings them out in a spiral depending on their last orbit position
            const flingSpeed = 6.0;
            shard.vx = (dirX + tx * 0.5) * flingSpeed;
            shard.vy = (dirY + ty * 0.5) * flingSpeed;
          }
        }

        // Standard lifespan processing
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

    // Record this frame
    this._recordReplayFrame();
  }

  /**
   * Handle combat when circles collide
   */
  _handleCombat(collision, currentTime) {
    if (this.elapsedTime < 2.0) return;

    // Behavior-driven lunge detection (N5 dash damage on contact)
    const beh1 = this.fighter1.behavior;
    const isLunging1 = beh1 && typeof beh1.isLunging === 'function'
      ? beh1.isLunging(this.fighter1)
      : false;

    // Fighter1 collision attack:
    // – If lunging (N5 dash), deal contact damage once per swing
    // – If not a ranged fighter and not a melee-combo fighter mid-combo, deal standard collision damage
    const isRanged1 = beh1 && beh1.isRanged;
    const canLungeHit = isLunging1 && !this.fighter1.hasHitThisSwing;
    const canStdHit1 = !isRanged1 && !isLunging1 && this.fighter1.canAttack(currentTime) && this.fighter1.comboIndex === 0 && this.fighter1.swingProgress >= 1.0;

    if (canLungeHit || canStdHit1) {
      const damage = this.fighter1.getCurrentDamage();
      const isCrit = beh1 && typeof beh1.isCrit === 'function' ? beh1.isCrit(this.fighter1) : false;
      const result = this.fighter2.takeDamage(damage);

      if (result.actualDamage > 0) {
        // Delegate hit audio / passive logic to behavior
        let hitType = 'normal';
        if (beh1 && typeof beh1.onMeleeHit === 'function') {
          hitType = beh1.onMeleeHit(this.fighter1, this.fighter2, this, result);
        }

        if (hitType === 'enhanced') {
          this.fighter1.stats.damageDealt.enhancedNormal += result.actualDamage;
        } else {
          this.fighter1.stats.damageDealt.normal += result.actualDamage;
        }

        if (isLunging1) {
          this.fighter1.hasHitThisSwing = true;
        } else {
          this.fighter1.registerAttack(currentTime);
        }

        if (this.fighter1.vfx) {
          this.fighter1.vfx.triggerCollision(collision.contactX, collision.contactY);
        }

        if (this.damageNumbers) {
          this.damageNumbers.spawn(
            collision.contactX, collision.contactY - 20,
            result.actualDamage, this.fighter1.element, isCrit
          );
        }

        if (result.died) {
          this._endGame(this.fighter1);
          return;
        }
      }
    }

    // Apply damage from fighter2 to fighter1 (only for melee fighters, not ranged)
    const beh2 = this.fighter2.behavior;
    const isRanged2 = beh2 && beh2.isRanged;
    const isLunging2 = beh2 && typeof beh2.isLunging === 'function' ? beh2.isLunging(this.fighter2) : false;

    const canLungeHit2 = isLunging2 && !this.fighter2.hasHitThisSwing;
    const canStdHit2 = !isRanged2 && !isLunging2 && this.fighter2.canAttack(currentTime) && this.fighter2.comboIndex === 0 && this.fighter2.swingProgress >= 1.0;

    if (canLungeHit2 || canStdHit2) {
      const damage = this.fighter2.getCurrentDamage();
      const isCrit = beh2 && typeof beh2.isCrit === 'function' ? beh2.isCrit(this.fighter2) : false;
      const result = this.fighter1.takeDamage(damage);

      if (result.actualDamage > 0) {
        // Delegate hit audio / passive logic to behavior
        let hitType = 'normal';
        if (beh2 && typeof beh2.onMeleeHit === 'function') {
          hitType = beh2.onMeleeHit(this.fighter2, this.fighter1, this, result);
        }

        if (hitType === 'enhanced') {
          this.fighter2.stats.damageDealt.enhancedNormal += result.actualDamage;
        } else {
          this.fighter2.stats.damageDealt.normal += result.actualDamage;
        }

        if (isLunging2) {
          this.fighter2.hasHitThisSwing = true;
        } else {
          this.fighter2.registerAttack(currentTime);
        }

        // Collision passive hook (e.g. Yoimiya passive stacks)
        if (beh2 && typeof beh2.onCollisionHit === 'function') {
          beh2.onCollisionHit(this.fighter2);
        }

        // Trigger collision VFX
        if (this.fighter2.vfx) {
          this.fighter2.vfx.triggerCollision(collision.contactX, collision.contactY);
        }

        // Spawn damage number
        if (this.damageNumbers) {
          this.damageNumbers.spawn(
            collision.contactX, collision.contactY + 20,
            result.actualDamage, this.fighter2.element, isCrit
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
    const beh = fighter.behavior;

    // ── Check Elemental Skill (E) ────────────────
    // For Keqing: skillCDTimer may be 0 when stiletto is out (recast window)
    const canActivateSkill = fighter.skillCDTimer <= 0 ||
      (fighter.id === 'keqing' && fighter.stilettoThrown && fighter.skillCDTimer <= 0);

    if (canActivateSkill) {
      const activated = fighter.activateSkill();
      if (activated) {
        // Delegate to behavior module
        if (beh && typeof beh.onSkillActivate === 'function') {
          beh.onSkillActivate(fighter, opponent, this, Graphics, Sprite, Assets);
        }
      }
    }

    // ── Check Elemental Burst (Q) ────────────────
    if (fighter.burstCDTimer <= 0) {
      const activated = fighter.activateBurst();
      if (activated) {
        if (!this.replayMode && this.recordReplayEnabled) {
          this.replaySFXEvents.push({
            type: 'portrait_ult',
            time: this.elapsedTime,
            element: fighter.element
          });
        }
        // Play ultimate animation inside character circle portrait if available
        if (typeof fighter.playUltAnimation === 'function') {
          fighter.playUltAnimation();
        }

        // Delegate to behavior module
        if (beh && typeof beh.onBurstActivate === 'function') {
          beh.onBurstActivate(fighter, opponent, this, Graphics, Sprite, Assets);
        }
      }
    }
  }

  /**
   * Convenience SFX wrapper for use by behavior modules.
   * Respects headless mode and replay interceptors.
   */
  _playSFX(path, volume) {
    playSFX(path, volume);
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
      playSFX(sound, 0.78);
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
      const beh = fighter.behavior;
      const isCrit = beh && typeof beh.isCrit === 'function' ? beh.isCrit(fighter) : fighter.passiveTimer > 0;
      const result = opponent.takeDamage(damage);

      if (result.actualDamage > 0) {
        // Delegate hit audio / passive logic to behavior
        let hitType = 'normal';
        if (beh && typeof beh.onMeleeHit === 'function') {
          hitType = beh.onMeleeHit(fighter, opponent, this, result);
        }

        if (hitType === 'enhanced') {
          fighter.stats.damageDealt.enhancedNormal += result.actualDamage;
        } else {
          fighter.stats.damageDealt.normal += result.actualDamage;
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
      playSFX(sound, 1.0);
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
    if (this.headlessMode) return;
    if (!this.hud) return;

    this.hud.updateHP('left', this.fighter1.hp, this.fighter1.maxHp);
    this.hud.updateHP('right', this.fighter2.hp, this.fighter2.maxHp);

    // Update dynamic stats in footer
    const f1Speed = this.fighter1.data.attackSpeed;
    const f2Speed = this.fighter2.data.attackSpeed * (this.fighter2.isInfused ? 2.0 : 1.0);
    this.hud.updateStats('left', this.fighter1.getCurrentDamage(), f1Speed);
    this.hud.updateStats('right', this.fighter2.getCurrentDamage(), f2Speed);

    // Update sidebar cooldown indicators
    this.hud.updateAbilityCD('left', 'E', this.fighter1.skillCDTimer, this.fighter1.data.skillE.cooldown);
    this.hud.updateAbilityCD('left', 'Q', this.fighter1.burstCDTimer, this.fighter1.data.burstQ.cooldown);
    this.hud.updateAbilityCD('right', 'E', this.fighter2.skillCDTimer, this.fighter2.data.skillE.cooldown);
    this.hud.updateAbilityCD('right', 'Q', this.fighter2.burstCDTimer, this.fighter2.data.burstQ.cooldown);

    // Update passive indicators (if implemented in HUD)
    this.hud.updatePassiveState('left', this.fighter1.passiveTimer, this.fighter1.passiveStacks || 0);
    this.hud.updatePassiveState('right', this.fighter2.passiveTimer, this.fighter2.passiveStacks || 0);
  }

  /**
   * Trigger screen shake effect
   */
  _screenShake() {
    if (!this.replayMode && this.recordReplayEnabled) {
      this.replaySFXEvents.push({
        type: 'screen_shake',
        time: this.elapsedTime
      });
    }
    if (this.headlessMode) return;
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

    if (this.headlessMode) return;

    if (this.hud && typeof this.hud.showWatchReplayButton === 'function') {
      this.hud.showWatchReplayButton(this);
    }

    if (this.onGameOver) {
      this.onGameOver(winner);
    }
  }

  /**
   * Spawn two realistic, tumbling arrow shards (sliced in half) that fly
   * outward to the sides and fade away, representing an anime-style sword cut!
   */
  _spawnSlicedArrowShards(x, y, angle, isBlazing = false, parentVortex = null) {
    if (this.headlessMode) return;
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

    // Determine if these shards should be persistent (unenhanced arrow hitting vortex)
    const isPersistent = !isBlazing && parentVortex !== null;
    const life = isPersistent ? 99.0 : 0.7; // Effectively infinite until vortex dies

    // Store shards in loop queue
    this.shards.push(
      {
        x: x,
        y: y,
        vx: Math.cos(angle) * forwardSpeed + Math.cos(angleLeft) * baseSpeed,
        vy: Math.sin(angle) * forwardSpeed + Math.sin(angleLeft) * baseSpeed,
        rotSpeed: 0.22,
        visual: shardA,
        life: life,
        maxLife: life,
        isPersistent: isPersistent,
        parentVortex: parentVortex,
        isDying: false
      },
      {
        x: x,
        y: y,
        vx: Math.cos(angle) * forwardSpeed + Math.cos(angleRight) * baseSpeed,
        vy: Math.sin(angle) * forwardSpeed + Math.sin(angleRight) * baseSpeed,
        rotSpeed: -0.22,
        visual: shardB,
        life: life,
        maxLife: life,
        isPersistent: isPersistent,
        parentVortex: parentVortex,
        isDying: false
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
    playSFX('/audio/yoimiya/yoimiya-na_5.mp3', 1.0); // Crisp whistle launcher
  }

  // ── Replay System Class Methods ─────────────────

  _recordReplayFrame() {
    if (this.replayMode || !this.recordReplayEnabled) return;

    const frame = {
      elapsedTime: this.elapsedTime,
      fighter1: {
        x: this.fighter1.body.x,
        y: this.fighter1.body.y,
        vx: this.fighter1.body.vx,
        vy: this.fighter1.body.vy,
        hp: this.fighter1.hp,
        maxHp: this.fighter1.maxHp,
        isInvincible: this.fighter1.isInvincible,
        isInfused: this.fighter1.isInfused,
        passiveTimer: this.fighter1.passiveTimer,
        passiveStacks: this.fighter1.passiveStacks,
        infusionActiveTimer: this.fighter1.infusionActiveTimer,
        comboIndex: this.fighter1.comboIndex,
        swingProgress: this.fighter1.swingProgress,
        weaponAngle: this.fighter1.weaponAngle,
        weaponSpriteX: this.fighter1.weaponSprite ? this.fighter1.weaponSprite.x : 0,
        weaponSpriteY: this.fighter1.weaponSprite ? this.fighter1.weaponSprite.y : 0,
        weaponSpriteRotation: this.fighter1.weaponSprite ? this.fighter1.weaponSprite.rotation : 0,
        weaponSpriteTint: this.fighter1.weaponSprite ? this.fighter1.weaponSprite.tint : 0xffffff,
        glowScale: this.fighter1.circleGlow ? this.fighter1.circleGlow.scale.x : 1,
        glowAlpha: this.fighter1.circleGlow ? this.fighter1.circleGlow.alpha : 0.4,
        circleGraphicsTint: this.fighter1.circleGraphics ? this.fighter1.circleGraphics.tint : 0xffffff,
        skillCDProgress: this.fighter1.getSkillCooldownProgress(),
        burstCDProgress: this.fighter1.getBurstCooldownProgress(),
      },
      fighter2: {
        x: this.fighter2.body.x,
        y: this.fighter2.body.y,
        vx: this.fighter2.body.vx,
        vy: this.fighter2.body.vy,
        hp: this.fighter2.hp,
        maxHp: this.fighter2.maxHp,
        isInvincible: this.fighter2.isInvincible,
        isInfused: this.fighter2.isInfused,
        passiveTimer: this.fighter2.passiveTimer,
        passiveStacks: this.fighter2.passiveStacks,
        infusionActiveTimer: this.fighter2.infusionActiveTimer,
        comboIndex: this.fighter2.comboIndex,
        swingProgress: this.fighter2.swingProgress,
        weaponAngle: this.fighter2.weaponAngle,
        weaponSpriteX: this.fighter2.weaponSprite ? this.fighter2.weaponSprite.x : 0,
        weaponSpriteY: this.fighter2.weaponSprite ? this.fighter2.weaponSprite.y : 0,
        weaponSpriteRotation: this.fighter2.weaponSprite ? this.fighter2.weaponSprite.rotation : 0,
        weaponSpriteTint: this.fighter2.weaponSprite ? this.fighter2.weaponSprite.tint : 0xffffff,
        glowScale: this.fighter2.circleGlow ? this.fighter2.circleGlow.scale.x : 1,
        glowAlpha: this.fighter2.circleGlow ? this.fighter2.circleGlow.alpha : 0.4,
        circleGraphicsTint: this.fighter2.circleGraphics ? this.fighter2.circleGraphics.tint : 0xffffff,
        skillCDProgress: this.fighter2.getSkillCooldownProgress(),
        burstCDProgress: this.fighter2.getBurstCooldownProgress(),
      },
      projectiles: this.projectiles.map(arrow => ({
        x: arrow.x,
        y: arrow.y,
        angle: arrow.angle,
        isBlazing: !!arrow.isBlazing,
        isKindlingSpark: !!arrow.isKindlingSpark,
        isFireworkRocket: !!arrow.isFireworkRocket,
        isFinalShot: !!arrow.isFinalShot
      })),
      activeEffects: this.activeEffects.map(effect => {
        const data = {
          type: effect.type,
          timer: effect.timer,
          x: effect.x,
          y: effect.y,
          radius: effect.radius,
          angleOffset: effect.angleOffset,
          angle: effect.angle,
          explosionCD: effect.explosionCD
        };
        if (effect.type === 'hyouka' || effect.type === 'soumetsu_cast' || effect.type === 'ryuukin_cast') {
          data.x = effect.owner.body.x;
          data.y = effect.owner.body.y;
        } else if (effect.type === 'aurous_blaze_mark' && effect.target) {
          data.x = effect.target.body.x;
          data.y = effect.target.body.y;
        }
        return data;
      })
    };

    this.replayFrames.push(frame);
  }

  updateReplay(delta) {
    if (this.replayPaused) return;

    const prevTime = this.replayTime;
    // Advance replayTime by real elapsed seconds (60fps target frametime of ~0.01667s)
    this.replayTime += delta * 0.01667 * this.replaySpeed;

    // Check if replay has finished
    const lastFrame = this.replayFrames[this.replayFrames.length - 1];
    if (this.replayTime >= lastFrame.elapsedTime) {
      this.replayTime = lastFrame.elapsedTime;
      this.replayPlayhead = this.replayFrames.length - 1;
      this.replayPaused = true;
      if (this.hud && typeof this.hud.setReplayPlaying === 'function') {
        this.hud.setReplayPlaying(false);
      }
    } else {
      // Find the closest frame index matching this.replayTime
      let idx = Math.floor(this.replayPlayhead);
      if (this.replayTime < this.replayFrames[idx].elapsedTime) {
        idx = 0; // Reset search from start if seeked backwards
      }
      while (idx < this.replayFrames.length - 1 && this.replayFrames[idx + 1].elapsedTime <= this.replayTime) {
        idx++;
      }
      this.replayPlayhead = idx;
    }

    const frame = this.replayFrames[this.replayPlayhead];
    if (!frame) return;

    this.renderReplayFrame(frame);

    // Call ambient particle emitters during replay to keep steam & sparks floating dynamically
    if (this.fighter1.alive && this.fighter1.vfx) {
      this.fighter1.vfx.updateAmbient(this.fighter1.body.x, this.fighter1.body.y, delta);
    }
    if (this.fighter2.alive && this.fighter2.vfx) {
      this.fighter2.vfx.updateAmbient(this.fighter2.body.x, this.fighter2.body.y, delta);
    }

    // Audio / Damage Number / VFX triggers sync
    const curTime = frame.elapsedTime;
    if (this.replaySpeed > 0 && curTime > prevTime) {
      this.replaySFXEvents.forEach(evt => {
        if (evt.time > prevTime && evt.time <= curTime) {
          let logMsg = "";
          if (evt.type === 'damage_number') {
            if (this.damageNumbers) {
              this.damageNumbers.spawn(evt.x, evt.y, evt.text, evt.element, evt.isCrit);
            }
            logMsg = `[DMG] Dealt ${evt.text} ${evt.element.toUpperCase()}${evt.isCrit ? ' CRIT' : ''}`;
          } else if (evt.type === 'screen_shake') {
            this._screenShake();
            logMsg = `[SYSTEM] Screen Shake Impact`;
          } else if (evt.type === 'portrait_ult') {
            const fighter = evt.element === 'cryo' ? this.fighter1 : this.fighter2;
            if (fighter && typeof fighter.playUltAnimation === 'function') {
              fighter.playUltAnimation();
            }
            logMsg = `[ULT] Portrait cinematic start`;
          } else if (evt.type === 'vfx') {
            const fighter = evt.element === 'cryo' ? this.fighter1 : this.fighter2;
            if (fighter && fighter.vfx && typeof fighter.vfx[evt.method] === 'function') {
              fighter.vfx[evt.method](...evt.args);
            }
            logMsg = `[VFX] ${evt.element.toUpperCase()} ${evt.method.replace('trigger', '')}`;
          } else if (evt.path) {
            playSFX(evt.path, evt.volume || 0.6);
            logMsg = `[AUDIO] Play ${evt.path.split('/').pop()}`;
          }
          if (logMsg) {
            this.telemetryLogs.push(logMsg);
            if (this.telemetryLogs.length > 7) {
              this.telemetryLogs.shift();
            }
          }
        }
      });
    }
    
    this._updateTelemetry(frame);
  }

  clearEffectsCache() {
    if (this.replayEffectsCache) {
      const vortex = this.replayEffectsCache.get('soumetsu_vortex');
      if (vortex) {
        vortex.destroy({ children: true });
      }
      this.replayEffectsCache.clear();
    } else {
      this.replayEffectsCache = new Map();
    }
  }

  seekReplay(frameIndex) {
    if (this.fighter1 && this.fighter1.vfx && typeof this.fighter1.vfx.clear === 'function') {
      this.fighter1.vfx.clear();
    }
    if (this.fighter2 && this.fighter2.vfx && typeof this.fighter2.vfx.clear === 'function') {
      this.fighter2.vfx.clear();
    }
    this.clearEffectsCache();
    if (this.replayEffectsContainer) {
      this.replayEffectsContainer.removeChildren().forEach(c => c.destroy());
    }
    this.replayPlayhead = Math.max(0, Math.min(this.replayFrames.length - 1, frameIndex));
    const frame = this.replayFrames[this.replayPlayhead];
    if (frame) {
      this.replayTime = frame.elapsedTime; // Sync replay clock!
      this.renderReplayFrame(frame);
    }
  }

  _updateTelemetry(frame) {
    const container = document.getElementById('telemetry-content');
    if (!container) return;

    const f1HPPercent = (frame.fighter1.hp / frame.fighter1.maxHp) * 100;
    const f2HPPercent = (frame.fighter2.hp / frame.fighter2.maxHp) * 100;

    const logsHtml = (this.telemetryLogs && this.telemetryLogs.length > 0)
      ? this.telemetryLogs.map(log => `<div class="telemetry-feed-item">${log}</div>`).join('')
      : '<div style="color:#555577; text-align:center; padding-top:40px; font-size: 10px;">No events recorded...</div>';

    container.innerHTML = `
      <div class="telemetry-section">
        <div class="telemetry-header">🌐 OVERVIEW</div>
        <div class="telemetry-row">
          <span class="telemetry-label">Status:</span>
          <span class="telemetry-value" style="color: ${this.replayPaused ? '#ff5252' : '#00ff66'};">${this.replayPaused ? 'PAUSED' : 'PLAYING'}</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">Time:</span>
          <span class="telemetry-value">${frame.elapsedTime.toFixed(2)}s</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">Playhead:</span>
          <span class="telemetry-value" style="font-variant-numeric: tabular-nums;">${this.replayPlayhead + 1} / ${this.replayFrames.length}</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">Speed:</span>
          <span class="telemetry-value" style="color: #ffd54f;">${this.replaySpeed}x</span>
        </div>
      </div>

      <div class="telemetry-section">
        <div class="telemetry-header" style="color: #80deea;">❄️ AYAKA (CRYO)</div>
        <div class="telemetry-row">
          <span class="telemetry-label">HP:</span>
          <span class="telemetry-value">${Math.round(frame.fighter1.hp)} / ${frame.fighter1.maxHp}</span>
        </div>
        <div class="telemetry-bar-bg">
          <div class="telemetry-bar-fill" style="width: ${f1HPPercent}%; background: #00bcd4;"></div>
        </div>
        <div class="telemetry-row" style="margin-top: 4px;">
          <span class="telemetry-label">Velocity:</span>
          <span class="telemetry-value" style="font-size: 10px;">vx:${frame.fighter1.vx.toFixed(1)} vy:${frame.fighter1.vy.toFixed(1)}</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">CD (E / Q):</span>
          <span class="telemetry-value" style="font-size: 10px;">E:${(frame.fighter1.skillCDProgress * 100).toFixed(0)}% | Q:${(frame.fighter1.burstCDProgress * 100).toFixed(0)}%</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">State:</span>
          <span class="telemetry-value" style="color: #80deea; font-size: 10px; text-transform: uppercase;">${frame.fighter1.passiveTimer > 0 ? '❄️ CRYOMELED' : 'NORMAL'}</span>
        </div>
      </div>

      <div class="telemetry-section">
        <div class="telemetry-header" style="color: #ff8a65;">🔥 YOIMIYA (PYRO)</div>
        <div class="telemetry-row">
          <span class="telemetry-label">HP:</span>
          <span class="telemetry-value">${Math.round(frame.fighter2.hp)} / ${frame.fighter2.maxHp}</span>
        </div>
        <div class="telemetry-bar-bg">
          <div class="telemetry-bar-fill" style="width: ${f2HPPercent}%; background: #ff5722;"></div>
        </div>
        <div class="telemetry-row" style="margin-top: 4px;">
          <span class="telemetry-label">Velocity:</span>
          <span class="telemetry-value" style="font-size: 10px;">vx:${frame.fighter2.vx.toFixed(1)} vy:${frame.fighter2.vy.toFixed(1)}</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">CD (E / Q):</span>
          <span class="telemetry-value" style="font-size: 10px;">E:${(frame.fighter2.skillCDProgress * 100).toFixed(0)}% | Q:${(frame.fighter2.burstCDProgress * 100).toFixed(0)}%</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">State:</span>
          <span class="telemetry-value" style="color: #ff8a65; font-size: 10px; text-transform: uppercase;">${frame.fighter2.isInfused ? '🔥 INFUSED' : 'NORMAL'} (${frame.fighter2.passiveStacks} St)</span>
        </div>
      </div>

      <div class="telemetry-section">
        <div class="telemetry-header">☄️ ENTITIES</div>
        <div class="telemetry-row">
          <span class="telemetry-label">Projectiles:</span>
          <span class="telemetry-value">${frame.projectiles.length} active</span>
        </div>
        <div class="telemetry-row">
          <span class="telemetry-label">Burst Effects:</span>
          <span class="telemetry-value">${frame.activeEffects.length} active</span>
        </div>
      </div>

      <div class="telemetry-section" style="margin-bottom: 0;">
        <div class="telemetry-header">📡 PROCESS FEED</div>
        <div class="telemetry-feed">
          ${logsHtml}
        </div>
      </div>
    `;
  }

  renderReplayFrame(frame) {
    this.elapsedTime = frame.elapsedTime;

    // 1. Fighter 1
    const f1 = this.fighter1;
    const s1 = frame.fighter1;
    f1.body.x = s1.x;
    f1.body.y = s1.y;
    f1.body.vx = s1.vx;
    f1.body.vy = s1.vy;
    f1.hp = s1.hp;
    f1.maxHp = s1.maxHp;
    f1.isInvincible = s1.isInvincible;
    f1.isInfused = s1.isInfused;
    f1.passiveTimer = s1.passiveTimer;
    f1.passiveStacks = s1.passiveStacks;
    f1.infusionActiveTimer = s1.infusionActiveTimer;
    f1.comboIndex = s1.comboIndex;
    f1.swingProgress = s1.swingProgress;
    f1.weaponAngle = s1.weaponAngle;
    f1.alive = s1.hp > 0;

    // Ayaka Cryo sword infusion snow trail particles during replay
    if (f1.vfx && (s1.passiveTimer > 0 || s1.isInfused) && typeof f1.vfx.triggerSwordInfusionParticles === 'function') {
      f1.vfx.triggerSwordInfusionParticles(f1.body.x + s1.weaponSpriteX, f1.body.y + s1.weaponSpriteY);
    }

    f1.container.x = s1.x;
    f1.container.y = s1.y;

    if (f1.hpText) {
      f1.hpText.text = Math.round(f1.hp).toString();
    }
    if (f1.circleGraphics) {
      f1.circleGraphics.tint = s1.circleGraphicsTint;
    }
    if (f1.circleGlow) {
      f1.circleGlow.scale.set(s1.glowScale);
      f1.circleGlow.alpha = s1.glowAlpha;
    }
    if (f1.weaponSprite) {
      f1.weaponSprite.x = s1.weaponSpriteX;
      f1.weaponSprite.y = s1.weaponSpriteY;
      f1.weaponSprite.rotation = s1.weaponSpriteRotation;
      f1.weaponSprite.tint = s1.weaponSpriteTint;
    }

    // 2. Fighter 2
    const f2 = this.fighter2;
    const s2 = frame.fighter2;
    f2.body.x = s2.x;
    f2.body.y = s2.y;
    f2.body.vx = s2.vx;
    f2.body.vy = s2.vy;
    f2.hp = s2.hp;
    f2.maxHp = s2.maxHp;
    f2.isInvincible = s2.isInvincible;
    f2.isInfused = s2.isInfused;
    f2.passiveTimer = s2.passiveTimer;
    f2.passiveStacks = s2.passiveStacks;
    f2.infusionActiveTimer = s2.infusionActiveTimer;
    f2.comboIndex = s2.comboIndex;
    f2.swingProgress = s2.swingProgress;
    f2.weaponAngle = s2.weaponAngle;
    f2.alive = s2.hp > 0;

    f2.container.x = s2.x;
    f2.container.y = s2.y;

    if (f2.hpText) {
      f2.hpText.text = Math.round(f2.hp).toString();
    }
    if (f2.circleGraphics) {
      f2.circleGraphics.tint = s2.circleGraphicsTint;
    }
    if (f2.circleGlow) {
      f2.circleGlow.scale.set(s2.glowScale);
      f2.circleGlow.alpha = s2.glowAlpha;
    }
    if (f2.weaponSprite) {
      f2.weaponSprite.x = s2.weaponSpriteX;
      f2.weaponSprite.y = s2.weaponSpriteY;
      f2.weaponSprite.rotation = s2.weaponSpriteRotation;
      f2.weaponSprite.tint = s2.weaponSpriteTint;
    }

    // Yoimiya E particles (infusion particles)
    [f1, f2].forEach(f => {
      if (f.id === 'yoimiya' && f.infusionParticles) {
        f.infusionParticles.forEach((p, idx) => {
          p.visible = f.isInfused;
          if (f.isInfused) {
            const orbitAngle = this.elapsedTime * 5 + (idx * Math.PI * 2) / 3;
            const orbitDist = f.data.circleRadius + 20;
            p.x = Math.cos(orbitAngle) * orbitDist;
            p.y = Math.sin(orbitAngle) * orbitDist;
          }
        });
      }
    });

    // Yoimiya's E infusion sparkler trail particles during replay
    if (f2.id === 'yoimiya' && f2.isInfused && f2.vfx && f2.infusionParticles) {
      f2.infusionParticles.forEach((p, i) => {
        if (Math.random() < 0.3) {
          const worldX = f2.body.x + p.x;
          const worldY = f2.body.y + p.y;
          if (typeof f2.vfx.triggerCollision === 'function') {
            f2.vfx.triggerCollision(worldX, worldY);
          }
        }
      });
    }

    // 3. Clear and Draw Replay Projectiles
    this.replayProjectilesContainer.removeChildren().forEach(c => c.destroy());

    frame.projectiles.forEach(p => {
      const g = new Graphics();
      if (p.isFireworkRocket) {
        g.rect(-12, -4, 24, 8);
        g.fill({ color: 0xffab40 });
        g.rect(-6, -4, 12, 8);
        g.fill({ color: 0xd84315 });
        g.moveTo(12, -4);
        g.lineTo(19, 0);
        g.lineTo(12, 4);
        g.closePath();
        g.fill({ color: 0xffeb3b });
        g.stroke({ color: 0xff3d00, width: 2 });
        g.moveTo(-12, -2);
        g.lineTo(-22, 0);
        g.lineTo(-12, 2);
        g.closePath();
        g.fill({ color: 0xffffff });
      } else if (p.isKindlingSpark) {
        g.circle(0, 0, 4.5);
        g.fill({ color: 0xffaa00 });
        g.stroke({ color: 0xff3d00, width: 1.5 });
      } else if (p.isBlazing) {
        g.moveTo(-10, -2);
        g.lineTo(10, -2);
        g.lineTo(14, 0);
        g.lineTo(10, 2);
        g.lineTo(-10, 2);
        g.closePath();
        g.fill({ color: 0xff4500 });
        g.circle(6, 0, 3);
        g.fill({ color: 0xffaa00 });
      } else {
        g.moveTo(-10, -1.5);
        g.lineTo(8, -1.5);
        g.lineTo(12, 0);
        g.lineTo(8, 1.5);
        g.lineTo(-10, 1.5);
        g.closePath();
        g.fill({ color: 0x90a4ae });
        g.moveTo(-8, -4);
        g.lineTo(-4, -1.5);
        g.lineTo(-10, -1.5);
        g.closePath();
        g.fill({ color: 0x8d6e63 });
        g.moveTo(-8, 4);
        g.lineTo(-4, 1.5);
        g.lineTo(-10, 1.5);
        g.closePath();
        g.fill({ color: 0x8d6e63 });
      }
      g.x = p.x;
      g.y = p.y;
      g.rotation = p.angle;
      this.replayProjectilesContainer.addChild(g);

      // Trigger continuous arrow trails during replay
      const shooter = this.fighter2; // Yoimiya is the shooter of blazing arrows/rockets
      if (p.isBlazing && shooter && shooter.vfx) {
        if (p.isFireworkRocket && typeof shooter.vfx.triggerRocketTrail === 'function') {
          shooter.vfx.triggerRocketTrail(p.x, p.y, p.angle);
        } else if (typeof shooter.vfx.triggerArrowTrail === 'function') {
          shooter.vfx.triggerArrowTrail(p.x, p.y, p.isKindlingSpark);
        }
      }
    });

    // 4. Clear and Draw Replay Active Effects
    // Destroy simple temporary children from previous frame to avoid leaking, but preserve the cached vortex
    this.replayEffectsContainer.children.forEach(c => {
      if (c !== this.replayEffectsCache.get('soumetsu_vortex')) {
        c.destroy();
      }
    });
    this.replayEffectsContainer.removeChildren();

    frame.activeEffects.forEach(effect => {
      if (effect.type === 'hyouka') {
        const g = new Graphics();
        
        // Snapshotted timer starts at 1.0 (bloom delay) and counts down to 0
        const elapsed = 1.0 - effect.timer; // goes from 0.0 to 1.0 seconds
        const progress = Math.min(1.0, elapsed / 1.0); // progress ratio from 0 to 1
        
        const scale = Math.min(1.0, elapsed / 0.15); // Grow scale over first 150ms
        g.scale.set(scale);

        // Outline color interpolation (bright Cryo blue to deep navy)
        const rOut = Math.round(79 * (1 - progress) + 13 * progress);
        const gOut = Math.round(195 * (1 - progress) + 71 * progress);
        const bOut = Math.round(247 * (1 - progress) + 161 * progress);
        const outlineColor = (rOut << 16) | (gOut << 8) | bOut;

        // Fill color interpolation (Cryo blue to deep ominious navy)
        const rFill = Math.round(128 * (1 - progress) + 7 * progress);
        const gFill = Math.round(222 * (1 - progress) + 12 * progress);
        const bFill = Math.round(234 * (1 - progress) + 30 * progress);
        const fillColor = (rFill << 16) | (gFill << 8) | bFill;

        const fillAlpha = 0.06 + 0.39 * progress;
        const strokeAlpha = 0.6 + 0.4 * progress;
        const strokeWidth = 2 + 1.5 * progress;

        g.circle(0, 0, 180);
        g.fill({ color: fillColor, alpha: fillAlpha });
        g.stroke({ color: outlineColor, width: strokeWidth, alpha: strokeAlpha });

        // Draw inner target ring
        g.circle(0, 0, 90);
        g.stroke({ color: outlineColor, width: 1, alpha: 0.3 * (1 - progress) });

        // Dynamic pulsing alpha animation overlay
        g.alpha = 0.85 + Math.sin(this.elapsedTime * 60 * 0.015) * 0.1;
        
        let cx = effect.x;
        let cy = effect.y;
        if (typeof cx !== 'number' || isNaN(cx)) cx = f1.body.x;
        if (typeof cy !== 'number' || isNaN(cy)) cy = f1.body.y;
        
        g.x = cx;
        g.y = cy;
        this.replayEffectsContainer.addChild(g);

        // Draw rotating Cryo symbol sprite dynamically!
        const popProgress = Math.min(1.0, elapsed / 0.35); // pop up over 350ms
        const targetSize = 360;
        
        if (this.cryoTexture) {
          const sprite = new Sprite(this.cryoTexture);
          sprite.anchor.set(0.5);
          sprite.x = cx;
          sprite.y = cy;
          sprite.width = targetSize * popProgress;
          sprite.height = targetSize * popProgress;
          sprite.alpha = 0.75 * popProgress;
          sprite.rotation = elapsed * 0.5;
          sprite.tint = 0x80deea;
          this.replayEffectsContainer.addChild(sprite);
        } else {
          Assets.load('/cryo.png').then(texture => {
            this.cryoTexture = texture;
          }).catch(() => {});
        }
      }
      else if (effect.type === 'soumetsu_cast') {
        const progress = 1 - (effect.timer / 1.3);
        const gTelegraph = new Graphics();
        const range = 800;
        const width = 12 + 65 * progress;
        const alpha = 0.15 + 0.5 * progress;
        
        let cx = effect.x;
        let cy = effect.y;
        if (typeof cx !== 'number' || isNaN(cx)) cx = f1.body.x;
        if (typeof cy !== 'number' || isNaN(cy)) cy = f1.body.y;
        
        const angle = effect.angle || 0;
        gTelegraph.moveTo(0, 0);
        gTelegraph.lineTo(Math.cos(angle) * range, Math.sin(angle) * range);
        gTelegraph.stroke({ color: 0x80deea, width: width, alpha: alpha });
        gTelegraph.x = cx;
        gTelegraph.y = cy;
        this.replayEffectsContainer.addChild(gTelegraph);

        const gRing = new Graphics();
        const ringRadius = 250 * (1 - progress) + 40;
        gRing.circle(0, 0, ringRadius);
        gRing.stroke({ color: 0x00e5ff, width: 3, alpha: 0.5 + progress * 0.4 });
        gRing.x = cx;
        gRing.y = cy;
        this.replayEffectsContainer.addChild(gRing);

        // Draw rotating Cryo symbol inside ultimate telegraph!
        if (this.cryoTexture) {
          const sprite = new Sprite(this.cryoTexture);
          sprite.anchor.set(0.5);
          sprite.x = cx;
          sprite.y = cy;
          const size = 300 * (1 - progress) + 80;
          sprite.width = size;
          sprite.height = size;
          sprite.alpha = 0.2 + progress * 0.45;
          sprite.rotation = -progress * 1.5;
          sprite.tint = 0x80deea;
          this.replayEffectsContainer.addChild(sprite);
        } else {
          Assets.load('/cryo.png').then(texture => {
            this.cryoTexture = texture;
          }).catch(() => {});
        }

        // Emit vacuum particles towards Ayaka
        const shooter = this.fighter1; // Ayaka
        if (shooter && shooter.vfx && typeof shooter.vfx.triggerVacuumParticles === 'function') {
          const delta = 1.0;
          if (Math.random() < 0.8 * delta) {
            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnR = ringRadius + 20 + Math.random() * 50;
            const px = cx + Math.cos(spawnAngle) * spawnR;
            const py = cy + Math.sin(spawnAngle) * spawnR;
            shooter.vfx.triggerVacuumParticles(px, py, cx, cy);
          }
        }
      }
      else if (effect.type === 'ryuukin_cast') {
        const g = new Graphics();
        const progress = Math.min(1.0, Math.max(0.0, 1 - (effect.timer / 1.0)));
        const ringRadius = 160 * (1 - progress) + 30;
        
        let cx = effect.x;
        let cy = effect.y;
        if (typeof cx !== 'number' || isNaN(cx)) cx = f2.body.x;
        if (typeof cy !== 'number' || isNaN(cy)) cy = f2.body.y;
        
        // Exact live coloring: orange to white, dark orange fill white flickering
        const startR = 0xff, startG = 0x6d, startB = 0x00;
        const endR = 0xff, endG = 0xff, endB = 0xff;
        const currentR = Math.round(startR + (endR - startR) * progress);
        const currentG = Math.round(startG + (endG - startG) * progress);
        const currentB = Math.round(startB + (endB - startB) * progress);
        const currentColor = (currentR << 16) | (currentG << 8) | currentB;

        const fillStartR = 0x9e, fillStartG = 0x2a, fillStartB = 0x00;
        const fillEndR = 0xff, fillEndG = 0xff, fillEndB = 0xff;
        const fillR = Math.round(fillStartR + (fillEndR - fillStartR) * progress);
        const fillG = Math.round(fillStartG + (fillEndG - fillStartG) * progress);
        const fillB = Math.round(fillStartB + (fillEndB - fillStartB) * progress);
        const fillCol = (fillR << 16) | (fillG << 8) | fillB;

        let fillAlpha = 0.35 + 0.55 * progress;
        let finalCol = fillCol;

        // Flicker white in last 40% of the cast
        if (progress > 0.6) {
          const timeScale = this.elapsedTime * 1000 * 0.08;
          const isFlickerWhite = Math.sin(timeScale) > 0.1 || Math.random() < 0.3;
          if (isFlickerWhite) {
            finalCol = 0xffffff;
            fillAlpha = Math.min(1.0, fillAlpha + 0.15);
          }
        }

        g.circle(0, 0, ringRadius);
        g.fill({ color: finalCol, alpha: fillAlpha });
        g.stroke({ color: currentColor, width: 3.5, alpha: 0.35 + 0.65 * progress });
        g.x = cx;
        g.y = cy;
        this.replayEffectsContainer.addChild(g);

        // Emit windup sparks towards Yoimiya center
        const shooter = this.fighter2; // Yoimiya
        if (shooter && shooter.vfx && typeof shooter.vfx.triggerWindupSparks === 'function') {
          shooter.vfx.triggerWindupSparks(cx, cy);
        }
      }
      else if (effect.type === 'aurous_blaze_mark') {
        const rad = 45;
        const angleOffset = effect.angleOffset || 0;
        
        let cx = effect.x;
        let cy = effect.y;
        if (typeof cx !== 'number' || isNaN(cx)) cx = f1.body.x;
        if (typeof cy !== 'number' || isNaN(cy)) cy = f1.body.y;

        // Warning flicker color logic 0.8s before interval pops
        let sparkleColor = 0xffab40;
        if (effect.explosionCD <= 0.8) {
          const flashRate = 75;
          const isWhite = Math.floor((this.elapsedTime * 1000) / flashRate) % 2 === 0;
          sparkleColor = isWhite ? 0xffffff : 0xffab40;
        }

        const c1 = new Graphics();
        drawSparkle(c1, sparkleColor);
        c1.x = cx + Math.cos(angleOffset) * rad;
        c1.y = cy + Math.sin(angleOffset) * rad;
        c1.rotation = angleOffset * 2.0;

        const c2 = new Graphics();
        drawSparkle(c2, sparkleColor);
        c2.x = cx + Math.cos(angleOffset + Math.PI) * rad;
        c2.y = cy + Math.sin(angleOffset + Math.PI) * rad;
        c2.rotation = -angleOffset * 2.0;

        this.replayEffectsContainer.addChild(c1);
        this.replayEffectsContainer.addChild(c2);

        // Emit mark trail particles on both orbiters
        const shooter = this.fighter2; // Yoimiya
        if (shooter && shooter.vfx && typeof shooter.vfx.triggerMarkTrail === 'function') {
          shooter.vfx.triggerMarkTrail(c1.x, c1.y, c2.x, c2.y);
        }
      }
      else if (effect.type === 'soumetsu_vortex') {
        // High-fidelity performance-optimized cached vortex implementation
        let vortex = this.replayEffectsCache.get('soumetsu_vortex');
        if (!vortex) {
          vortex = new Container();
          
          const drawBlade = (r, t, len, color, alpha, speed) => {
            const g = new Graphics();
            const half = len / 2;
            g.moveTo(Math.cos(-half) * r, Math.sin(-half) * r);
            g.bezierCurveTo(
              Math.cos(-half/2) * (r + t), Math.sin(-half/2) * (r + t),
              Math.cos(half/2) * (r + t), Math.sin(half/2) * (r + t),
              Math.cos(half) * r, Math.sin(half) * r
            );
            g.bezierCurveTo(
              Math.cos(half/2) * (r - t), Math.sin(half/2) * (r - t),
              Math.cos(-half/2) * (r - t), Math.sin(-half/2) * (r - t),
              Math.cos(-half) * r, Math.sin(-half) * r
            );
            g.fill({ color, alpha });
            g.spinSpeed = speed;
            return g;
          };

          const cryoColors = [0x5ed4fc, 0xb4e1fa, 0xffffff, 0x9df0ff, 0x1a6dd4, 0x0c3366];
          for (let k = 0; k < 90; k++) {
            const r = 34 + Math.random() * 101;      // Max radius ~135px
            const t = 1.5 + Math.random() * 9;      // Balanced thickness
            const len = 0.2 + Math.random() * 2.5; // Varying arc length
            const speed = (0.1 + Math.random() * 0.3) * (Math.random() > 0.5 ? 1 : -1); 
            const color = cryoColors[Math.floor(Math.random() * cryoColors.length)];
            const alpha = 0.12 + Math.random() * 0.4;
            
            const blade = drawBlade(r, t, len, color, alpha, speed);
            blade.rotation = Math.random() * Math.PI * 2;
            vortex.addChild(blade);
          }
          this.replayEffectsCache.set('soumetsu_vortex', vortex);
        }

        // Spin each blade dynamically
        if (vortex.children) {
          vortex.children.forEach(child => {
            child.rotation += (child.spinSpeed || 0.2) * delta;
          });
        }

        let vx = effect.x;
        let vy = effect.y;
        if (typeof vx !== 'number' || isNaN(vx)) vx = f1.body.x;
        if (typeof vy !== 'number' || isNaN(vy)) vy = f1.body.y;
        vortex.x = vx;
        vortex.y = vy;
        this.replayEffectsContainer.addChild(vortex);

        // Emit constant ice particles for "messy" blizzard feel during replay
        const shooter = this.fighter1; // Ayaka
        if (shooter && shooter.vfx && Math.random() < 0.6) {
          if (typeof shooter.vfx.triggerVortexParticles === 'function') {
            shooter.vfx.triggerVortexParticles(
              vx + (Math.random() - 0.5) * 270,
              vy + (Math.random() - 0.5) * 270,
              vx,
              vy
            );
          }
        }
      }
    });

    // 5. Update HUD stats & HP
    if (this.hud) {
      this.hud.updateHP('left', f1.hp, f1.maxHp);
      this.hud.updateHP('right', f2.hp, f2.maxHp);

      // Reconstruct and update cooldown timers from snapshot progress values during replay
      f1.skillCDTimer = f1.data.skillE.cooldown * (1 - (s1.skillCDProgress ?? 1));
      if (s1.skillCDProgress === 1) f1.skillCDTimer = 0;
      f1.burstCDTimer = f1.data.burstQ.cooldown * (1 - (s1.burstCDProgress ?? 1));
      if (s1.burstCDProgress === 1) f1.burstCDTimer = 0;

      f2.skillCDTimer = f2.data.skillE.cooldown * (1 - (s2.skillCDProgress ?? 1));
      if (s2.skillCDProgress === 1) f2.skillCDTimer = 0;
      f2.burstCDTimer = f2.data.burstQ.cooldown * (1 - (s2.burstCDProgress ?? 1));
      if (s2.burstCDProgress === 1) f2.burstCDTimer = 0;

      this.hud.updateAbilityCD('left', 'E', f1.skillCDTimer, f1.data.skillE.cooldown);
      this.hud.updateAbilityCD('left', 'Q', f1.burstCDTimer, f1.data.burstQ.cooldown);
      this.hud.updateAbilityCD('right', 'E', f2.skillCDTimer, f2.data.skillE.cooldown);
      this.hud.updateAbilityCD('right', 'Q', f2.burstCDTimer, f2.data.burstQ.cooldown);

      const f1Speed = f1.data.attackSpeed;
      const ySpeed = f2.data.attackSpeed * (f2.isInfused ? 2.0 : 1.0);
      this.hud.updateStats('left', f1.getCurrentDamage(), f1Speed);
      this.hud.updateStats('right', f2.getCurrentDamage(), ySpeed);

      this.hud.updatePassiveState('left', f1.passiveTimer, f1.passiveStacks || 0);
      this.hud.updatePassiveState('right', f2.passiveTimer, f2.passiveStacks || 0);

      if (typeof this.hud.updateReplayScrubber === 'function') {
        this.hud.updateReplayScrubber(Math.floor(this.replayPlayhead), this.replayFrames.length, this.elapsedTime);
      }
    }
  }
  startReplay() {
    if (this.replayFrames.length === 0) {
      console.warn("Replay: No recorded frames available.");
      return;
    }

    this.replayMode = true;
    this.telemetryLogs = [];
    this.replayPlayhead = 0;
    this.replayTime = 0; // Initialize replay clock!
    this.replayPaused = false;
    this.replaySpeed = 1.0;

    if (this.fighter1 && this.fighter1.vfx && typeof this.fighter1.vfx.clear === 'function') {
      this.fighter1.vfx.clear();
    }
    if (this.fighter2 && this.fighter2.vfx && typeof this.fighter2.vfx.clear === 'function') {
      this.fighter2.vfx.clear();
    }
    this.clearEffectsCache();
    if (this.replayEffectsContainer) {
      this.replayEffectsContainer.removeChildren().forEach(c => c.destroy());
    }

    // Remove victory styling hooks from HUD so health bars don't disappear during replay
    const hudElement = document.getElementById('gacha-hud');
    if (hudElement) {
      hudElement.classList.remove('hud-active-win', 'hud-winner-cryo', 'hud-winner-pyro');
    }

    // Reset loop pausing and gameover triggers
    this.paused = false;
    this.gameOver = false;

    if (this.pauseContainer) {
      this.pauseContainer.visible = false;
    }

    // Hide standard victory screen
    const winScreen = document.getElementById('win-screen');
    if (winScreen) {
      winScreen.style.opacity = '0';
      winScreen.style.pointerEvents = 'none';
      setTimeout(() => {
        if (winScreen.style.opacity === '0') {
          winScreen.style.display = 'none';
        }
      }, 300);
    }

    // Hide active live elements from PixiJS stage
    this.projectiles.forEach(p => {
      if (p.visual && p.visual.parent) p.visual.parent.removeChild(p.visual);
      p.visual.destroy();
    });
    this.projectiles = [];

    this.activeEffects.forEach(e => {
      if (e.visual && e.visual.parent) e.visual.parent.removeChild(e.visual);
      if (e.telegraph && e.telegraph.parent) e.telegraph.parent.removeChild(e.telegraph);
      if (e.ring && e.ring.parent) e.ring.parent.removeChild(e.ring);
      if (e.symbolSprite && e.symbolSprite.parent) e.symbolSprite.parent.removeChild(e.symbolSprite);
      if (e.circle1 && e.circle1.parent) e.circle1.parent.removeChild(e.circle1);
      if (e.circle2 && e.circle2.parent) e.circle2.parent.removeChild(e.circle2);
    });
    this.activeEffects = [];

    // Trigger HUD Deck injection
    if (this.hud && typeof this.hud.showReplayDeck === 'function') {
      this.hud.showReplayDeck(this);
    }
  }

  exitReplay() {
    this.replayMode = false;

    if (this.fighter1 && this.fighter1.vfx && typeof this.fighter1.vfx.clear === 'function') {
      this.fighter1.vfx.clear();
    }
    if (this.fighter2 && this.fighter2.vfx && typeof this.fighter2.vfx.clear === 'function') {
      this.fighter2.vfx.clear();
    }

    // Clean containers
    this.replayProjectilesContainer.removeChildren().forEach(c => c.destroy());
    this.replayEffectsContainer.removeChildren().forEach(c => c.destroy());

    if (this.hud && typeof this.hud.hideReplayDeck === 'function') {
      this.hud.hideReplayDeck();
    }

    if (this.winner) {
      if (this.hud && typeof this.hud.showWatchReplayButton === 'function') {
        this.hud.showWatchReplayButton(this);
      }
      // Restore victory styling hooks on HUD so loser's elements are correctly faded on win overlay
      const hudElement = document.getElementById('gacha-hud');
      if (hudElement) {
        hudElement.classList.add('hud-active-win');
        hudElement.classList.add(this.winner.element === 'cryo' ? 'hud-winner-cryo' : 'hud-winner-pyro');
      }
      // Restore standard win overlay
      const winScreen = document.getElementById('win-screen');
      if (winScreen) {
        winScreen.style.display = 'flex';
        winScreen.style.pointerEvents = 'auto';
        void winScreen.offsetHeight;
        winScreen.style.opacity = '1';
      }
      this.gameOver = true;
    } else {
      location.reload();
    }
  }

  resetFighters(vel1, vel2) {
    const f1 = this.fighter1;
    const f2 = this.fighter2;

    const instantCast = localStorage.getItem('dev-instant-cast') === 'true';

    f1.hp = f1.maxHp;
    f1.alive = true;
    f1.lastAttackTime = 0;
    f1.attackIntervalOffset = 0;
    f1.skillCDTimer = instantCast ? 0 : f1.data.skillE.cooldown;
    f1.burstCDTimer = instantCast ? 0 : f1.data.burstQ.cooldown;
    f1.isInfused = false;
    f1.infusionActiveTimer = 0;
    f1.passiveStacks = 0;
    f1.passiveTimer = 0;
    f1.comboIndex = 0;
    f1.swingProgress = 1.0;
    f1.swingDuration = 0;
    f1.hasHitThisSwing = false;
    f1.hasThrustedThisSwing = false;
    f1.isInvincible = false;
    f1.slowMultiplier = 1.0;
    f1.stats = {
      damageDealt: { normal: 0, enhancedNormal: 0, skill: 0, burst: 0 },
      casts: { skill: 0, burst: 0 }
    };
    f1.body.x = 600 * 0.25;
    f1.body.y = 670 * 0.5;
    f1.body.vx = vel1.vx;
    f1.body.vy = vel1.vy;
    f1.weaponAngle = Math.random() * Math.PI * 2;

    f2.hp = f2.maxHp;
    f2.alive = true;
    f2.lastAttackTime = 0;
    f2.attackIntervalOffset = 0;
    f2.skillCDTimer = instantCast ? 0 : f2.data.skillE.cooldown;
    f2.burstCDTimer = instantCast ? 0 : f2.data.burstQ.cooldown;
    f2.isInfused = false;
    f2.infusionActiveTimer = 0;
    f2.passiveStacks = 0;
    f2.passiveTimer = 0;
    f2.comboIndex = 0;
    f2.swingProgress = 1.0;
    f2.swingDuration = 0;
    f2.hasHitThisSwing = false;
    f2.hasThrustedThisSwing = false;
    f2.isInvincible = false;
    f2.slowMultiplier = 1.0;
    f2.stats = {
      damageDealt: { normal: 0, enhancedNormal: 0, skill: 0, burst: 0 },
      casts: { skill: 0, burst: 0 }
    };
    f2.body.x = 600 * 0.75;
    f2.body.y = 670 * 0.5;
    f2.body.vx = vel2.vx;
    f2.body.vy = vel2.vy;
    f2.weaponAngle = Math.random() * Math.PI * 2;
  }

  async runHeadlessSimulation(maxRuns = 500) {
    console.log("🔍 Starting extreme-diff headless battle search...");
    
    // Telemetry log registration of button click
    this.simTelemetryLogs = [
      '[SYSTEM] Instant Sim button click registered.',
      '[SYSTEM] Initializing simulation overlay...'
    ];
    this._updateSimTelemetry();
    await new Promise(resolve => setTimeout(resolve, 50)); // Paint DOM immediately!

    // Create progress overlay dynamically in DOM
    const overlayId = 'sim-progress-overlay';
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.position = 'fixed';
      overlay.style.top = '50%';
      overlay.style.left = '50%';
      overlay.style.transform = 'translate(-50%, -50%)';
      overlay.style.background = '#0d0d16';
      overlay.style.border = '4px solid #000';
      overlay.style.boxShadow = '10px 10px 0px #000';
      overlay.style.padding = '30px';
      overlay.style.zIndex = '9999';
      overlay.style.color = 'white';
      overlay.style.fontFamily = "'Outfit', sans-serif";
      overlay.style.textAlign = 'center';
      overlay.style.width = '320px';
      overlay.style.userSelect = 'none';

      overlay.innerHTML = `
        <div style="font-size: 18px; font-weight: 900; color: #ff9800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;">🔍 SIMULATING BATTLES</div>
        <div style="font-size: 10px; font-weight: 700; color: #8888aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 24px;">CRUNCHING PHYSICS SEEDS FOR CLUTCH FINISH</div>
        <div id="sim-progress-text" style="font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums; background: #161626; border: 2.5px solid #000; padding: 12px; margin-bottom: 18px; text-transform: uppercase; letter-spacing: 0.5px;">RUN 0 / ${maxRuns}</div>
        <div style="width: 100%; height: 16px; background: #1b1b24; border: 2.5px solid #000; overflow: hidden; position: relative;">
          <div id="sim-progress-bar" style="width: 0%; height: 100%; background: #ffd54f; transition: width 0.08s ease;"></div>
        </div>
        <div style="font-size: 9px; font-weight: 600; color: #555577; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 15px;">Zero Frame Render Lag • CPU Safe</div>
      `;
      document.body.appendChild(overlay);
    }

    const progressText = document.getElementById('sim-progress-text');
    const progressBar = document.getElementById('sim-progress-bar');

    this.simTelemetryLogs.push('[SYSTEM] Saving active gameplay state...');
    this._updateSimTelemetry();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Save current state
    const savedElapsedTime = this.elapsedTime;
    const savedGameOver = this.gameOver;
    const savedWinner = this.winner;
    const savedReplayMode = this.replayMode;
    const savedPaused = this.paused;
    const savedProjectiles = [...this.projectiles];
    const savedActiveEffects = [...this.activeEffects];
    const savedReplayFrames = [...this.replayFrames];
    const savedReplaySFXEvents = [...this.replaySFXEvents];
    const savedScheduledArrows = [...this.scheduledArrows];
    const savedScheduledMelee = [...this.scheduledMelee];
    const savedCollisionCooldown = this.collisionCooldown;
    const savedSoundCooldown = this.soundCooldown;
    const savedDamageNumbers = this.damageNumbers;

    // Save actual live position/velocity of fighters
    const f1Start = {
      hp: this.fighter1.hp,
      vx: this.fighter1.body.vx,
      vy: this.fighter1.body.vy,
      x: this.fighter1.body.x,
      y: this.fighter1.body.y
    };
    const f2Start = {
      hp: this.fighter2.hp,
      vx: this.fighter2.body.vx,
      vy: this.fighter2.body.vy,
      x: this.fighter2.body.x,
      y: this.fighter2.body.y
    };

    // Temporarily mock stage and damageNumbers for headless mode
    const realStage = this.stage;
    this.stage = {
      addChild: () => {},
      addChildAt: () => {},
      removeChild: () => {},
      removeChildren: () => []
    };
    this.damageNumbers = { spawn: () => {} };

    this.headlessMode = true;
    window.headlessGachaMode = true;
    this.replayMode = false;
    this.paused = false;

    // Disable recording during search to save massive memory & CPU allocation!
    this.recordReplayEnabled = false;

    // Seeded PRNG setup for 100% deterministic runs
    const originalRandom = Math.random;
    function mulberry32(a) {
      return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
    }

    let foundExtreme = false;
    let foundWinner = null;
    let foundElapsedTime = 0;
    let foundSeed = 0;
    
    // Fallback tracking (closest match in case no true extreme diff is found)
    let bestFallbackHP = Infinity;
    let bestFallbackWinner = null;
    let bestFallbackElapsedTime = 0;
    let bestFallbackSeed = 0;

    // Character configuration for starting speed/stats
    const ayakaSpeed = this.fighter1.data.speed;
    const yoimiyaSpeed = this.fighter2.data.speed;

    for (let run = 0; run < maxRuns; run++) {
      // Telemetry log run commence
      this.simTelemetryLogs.push(`[RUN ${run + 1}] Commencing ticks...`);
      this._updateSimTelemetry();
      
      // Smooth progress bar update
      if (progressText) progressText.textContent = `RUNNING ${run + 1} / ${maxRuns}`;
      if (progressBar) progressBar.style.width = `${((run + 1) / maxRuns) * 100}%`;
      await new Promise(resolve => setTimeout(resolve, 0));

      // Create a deterministic seed for this run
      const runSeed = Math.floor(originalRandom() * 99999999);
      Math.random = mulberry32(runSeed);

      // Generate velocities using the deterministic Math.random
      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI * 2;
      const vel1 = { vx: Math.cos(angle1) * ayakaSpeed, vy: Math.sin(angle1) * ayakaSpeed };
      const vel2 = { vx: Math.cos(angle2) * yoimiyaSpeed, vy: Math.sin(angle2) * yoimiyaSpeed };

      // Reset Loop & Fighter Combat variables
      this.elapsedTime = 0;
      this.virtualTime = 0;
      this.gameOver = false;
      this.winner = null;
      this.projectiles = [];
      this.activeEffects = [];
      this.replayFrames = [];
      this.replaySFXEvents = [];
      this.scheduledArrows = [];
      this.scheduledMelee = [];
      this.collisionCooldown = 0;
      this.soundCooldown = 0;
      this.shards = [];

      this.resetFighters(vel1, vel2);

      // Fast-forward loop simulation
      let ticks = 0;
      while (!this.gameOver && ticks < 4000) {
        ticks++;
        this.virtualTime += 16.67;
        this.update(1); // Call update tick
        if (ticks % 250 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Check if the outcome fits "extreme-diff" (winner has very low health, e.g. <= 8% HP)
      let outcomeText = "";
      if (this.gameOver && this.winner) {
        const winnerHP = this.winner.hp;
        const maxHP = this.winner.maxHp || 500;
        const hpPct = (winnerHP / maxHP) * 100;
        
        outcomeText = `Winner: ${this.winner.id.toUpperCase()} (${hpPct.toFixed(1)}% HP)`;
        console.log(`[Headless Run ${run + 1}] Winner: ${this.winner.id}, HP: ${Math.round(winnerHP)}/${maxHP} (${hpPct.toFixed(1)}%), Ticks: ${ticks}`);
        
        // Track the absolute lowest winning HP for the fallback mechanism
        if (winnerHP > 0 && winnerHP < bestFallbackHP) {
          bestFallbackHP = winnerHP;
          bestFallbackWinner = this.winner;
          bestFallbackElapsedTime = this.elapsedTime;
          bestFallbackSeed = runSeed;
        }

        if (winnerHP > 0 && hpPct <= 8.0) {
          console.log(`✨ Success on run ${run + 1}! Winner ${this.winner.id} survived with ${Math.round(winnerHP)} HP!`);
          this.simTelemetryLogs.push(`[RUN ${run + 1}] Outcome: SUCCESS (Winner survives with ${Math.round(winnerHP)} HP)`);
          this._updateSimTelemetry();
          foundExtreme = true;
          foundWinner = this.winner;
          foundElapsedTime = this.elapsedTime;
          foundSeed = runSeed;
          break;
        }
      } else {
        outcomeText = `TIMEOUT / DRAW`;
        console.log(`[Headless Run ${run + 1}] Draw or Timeout! Ticks: ${ticks}`);
      }

      this.simTelemetryLogs.push(`[RUN ${run + 1}] Outcome: ${outcomeText}`);
      if (this.simTelemetryLogs.length > 20) {
        this.simTelemetryLogs.splice(0, this.simTelemetryLogs.length - 20);
      }
      this._updateSimTelemetry();
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Final update to progress overlay before cleanup
    if (progressText) progressText.textContent = `COMPLETED ${maxRuns} / ${maxRuns}`;
    if (progressBar) progressBar.style.width = '100%';

    // Restore real Math.random
    Math.random = originalRandom;

    const winnerSeed = foundExtreme ? foundSeed : bestFallbackSeed;
    const finalWinner = foundExtreme ? foundWinner : bestFallbackWinner;

    if (finalWinner !== null) {
      // RUN THE RECORDING PASS deterministically using the selected winning seed!
      console.log(`🎥 Re-running the chosen match (Seed: ${winnerSeed}) to record replay frames...`);
      
      // Override Math.random for identical playback recording
      Math.random = mulberry32(winnerSeed);

      // Generate same velocities
      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI * 2;
      const vel1 = { vx: Math.cos(angle1) * ayakaSpeed, vy: Math.sin(angle1) * ayakaSpeed };
      const vel2 = { vx: Math.cos(angle2) * yoimiyaSpeed, vy: Math.sin(angle2) * yoimiyaSpeed };

      // Enable recording
      this.recordReplayEnabled = true;

      // Reset states
      this.elapsedTime = 0;
      this.virtualTime = 0;
      this.gameOver = false;
      this.winner = null;
      this.projectiles = [];
      this.activeEffects = [];
      this.replayFrames = [];
      this.replaySFXEvents = [];
      this.scheduledArrows = [];
      this.scheduledMelee = [];
      this.collisionCooldown = 0;
      this.soundCooldown = 0;

      this.resetFighters(vel1, vel2);

      // Run loop with recording
      let ticks = 0;
      while (!this.gameOver && ticks < 4000) {
        ticks++;
        this.virtualTime += 16.67;
        this.update(1);
        if (ticks % 250 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Restore real random again
      Math.random = originalRandom;

      // Restore real stage & objects
      this.stage = realStage;
      this.damageNumbers = savedDamageNumbers;
      this.headlessMode = false;
      window.headlessGachaMode = false;
      this.replayMode = savedReplayMode;
      this.paused = savedPaused;

      // Destroy the progress overlay cleanly
      const overlayEl = document.getElementById(overlayId);
      if (overlayEl) overlayEl.remove();

      // Automatically start playing the replay!
      this.startReplay();
      
      const winnerName = this.winner.id === 'ayaka' ? 'Ayaka' : 'Yoimiya';
      const maxHP = this.winner.maxHp || 500;
      const hpPct = (this.winner.hp / maxHP) * 100;
      const titleStr = foundExtreme ? "🔥 TRUE EXTREME-DIFF MATCH FOUND!" : "⚔️ CLUTCH BATTLE SEED LOCATED!";
      
      alert(`${titleStr}\nWinner: ${winnerName}\nRemaining HP: ${Math.round(this.winner.hp)} / ${maxHP} (${hpPct.toFixed(1)}%)\nDuration: ${this.elapsedTime.toFixed(1)}s\n\nStarting playback now!`);
    } else {
      // Restore real stage & objects
      this.stage = realStage;
      this.damageNumbers = savedDamageNumbers;
      this.headlessMode = false;
      window.headlessGachaMode = false;
      this.replayMode = savedReplayMode;
      this.paused = savedPaused;
      this.recordReplayEnabled = true;

      // Destroy the progress overlay cleanly
      const overlayEl = document.getElementById(overlayId);
      if (overlayEl) overlayEl.remove();

      // Restore previous state if not found (impossible since there's always a winner)
      this.elapsedTime = savedElapsedTime;
      this.gameOver = savedGameOver;
      this.winner = savedWinner;
      this.projectiles = savedProjectiles;
      this.activeEffects = savedActiveEffects;
      this.replayFrames = savedReplayFrames;
      this.replaySFXEvents = savedReplaySFXEvents;
      this.scheduledArrows = savedScheduledArrows;
      this.scheduledMelee = savedScheduledMelee;
      this.collisionCooldown = savedCollisionCooldown;
      this.soundCooldown = savedSoundCooldown;

      // Restore fighter positions
      this.fighter1.hp = f1Start.hp;
      this.fighter1.body.vx = f1Start.vx;
      this.fighter1.body.vy = f1Start.vy;
      this.fighter1.body.x = f1Start.x;
      this.fighter1.body.y = f1Start.y;

      this.fighter2.hp = f2Start.hp;
      this.fighter2.body.vx = f2Start.vx;
      this.fighter2.body.vy = f2Start.vy;
      this.fighter2.body.x = f2Start.x;
      this.fighter2.body.y = f2Start.y;

      alert(`❌ No matches finished in ${maxRuns} runs. Check parameters!`);
    }
  }

  _updateSimTelemetry() {
    const container = document.getElementById('telemetry-content');
    if (!container) return;

    const logsHtml = (this.simTelemetryLogs && this.simTelemetryLogs.length > 0)
      ? this.simTelemetryLogs.map(log => `<div class="telemetry-feed-item" style="color: #ffd54f;">${log}</div>`).join('')
      : '<div style="color:#555577; text-align:center; padding-top:40px; font-size: 10px;">Idle...</div>';

    container.innerHTML = `
      <div class="telemetry-section" style="margin-bottom: 0;">
        <div class="telemetry-header">📡 SIMULATOR TELEMETRY</div>
        <div class="telemetry-feed" style="height: 380px; font-size: 10px;">
          ${logsHtml}
        </div>
      </div>
    `;
  }
}

/**
 * Draws a retro neo-brutalist solid circle (sparkle) with a solid color
 * fill, matching Yoimiya's circular ultimate mark style without borders.
 * @param {import('pixi.js').Graphics} gfx - The Pixi Graphics object to draw into
 * @param {number} color - The hex color code for the solid fill
 */
function drawSparkle(gfx, color) {
  gfx.clear();
  gfx.circle(0, 0, 8);
  gfx.fill({ color: color, alpha: 1.0 });
}

