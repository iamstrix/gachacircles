// ─────────────────────────────────────────────────────────────
// ElectroVFX.js – Keqing's Electro visual effects layer.
//   • ambient aura   – crackling violet sparks around Keqing
//   • collision burst – branching lightning arcs on hit
//   • skill effect    – Stellar Restoration teleport flash
//   • burst effect    – Starward Sword spiral lightning dance
// ─────────────────────────────────────────────────────────────
import { Container, Graphics } from 'pixi.js';
import { ParticleSystem } from './ParticleSystem.js';
import {
  ELECTRO_GRADIENT,
  ELECTRO_TELEPORT_GRADIENT,
  ELECTRO_COLORS,
} from './ElementalColors.js';

export class ElectroVFX {
  /**
   * @param {object} [opts]
   * @param {number} [opts.poolSize=600]
   */
  constructor({ poolSize = 1000 } = {}) {
    this.container = new Container();

    // Luminous layers drawn procedurally (under the particle sparks)
    this._vfxGraphicsContainer = new Container();
    this.container.addChild(this._vfxGraphicsContainer);

    // Sub-systems layered for visual depth
    this._ambient  = new ParticleSystem({ poolSize: 200 });
    this._burst    = new ParticleSystem({ poolSize: 1000 });
    this._skill    = new ParticleSystem({ poolSize: 600 });

    this.container.addChild(this._ambient.container);
    this.container.addChild(this._burst.container);
    this.container.addChild(this._skill.container);

    this._ambientHandle = null;

    // Pools for procedural beam lines, outlines, and tendrils
    this._beams = [];
    this._afterimages = [];
    this._tendrils = [];

    // Skill / burst animation state
    this._skillActive  = false;
    this._skillTimer   = 0;
    this._skillX       = 0;
    this._skillY       = 0;

    this._burstActive  = false;
    this._burstTimer   = 0;
    this._burstX       = 0;
    this._burstY       = 0;
    this._burstSlash   = 0;  // how many slashes have fired
    this._burstAngle   = 0;
  }

  // ── Ambient aura ──────────────────────────────────────────

  /**
   * Call every frame to keep crackling violet sparks alive around (x, y).
   * @param {number} x  character centre x
   * @param {number} y  character centre y
   * @param {number} delta  ticker delta
   */
  updateAmbient(x, y, delta) {
    if (!this._ambientHandle) {
      this._ambientHandle = this._ambient.emitContinuous(x, y, {
        rate: 0.55,
        count: 1,
        speedMin: 0.2,
        speedMax: 0.7,
        spreadAngle: Math.PI * 2,
        angleCenter: -Math.PI / 2,
        lifetimeMin: 40,
        lifetimeMax: 80,
        sizeMin: 1,
        sizeMax: 2.2,
        startAlpha: 0.6,
        endAlpha: 0,
        gravity: -0.015,  // sparks rise slightly
        blendMode: 'add',
        gradient: ELECTRO_GRADIENT,
        shrink: true,
      });
    }

    // Crackle around the character with a bit of random jitter
    this._ambientHandle.x = x + (Math.random() - 0.5) * 28;
    this._ambientHandle.y = y + (Math.random() - 0.5) * 28;

    this._ambient.update(delta);
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Trigger a spectacular Overload reaction clash!
   * Combines Electro and Pyro particle bursts in a directed cone.
   * @param {number} x Collision X
   * @param {number} y Collision Y
   * @param {number} angle Impact direction
   */
  triggerOverloadReaction(x, y, angle) {
    const dir = angle || 0;
    const cone = Math.PI * 0.9; // Broad ~160 degree cone

    // 1. Central Violet-White Flash
    this._skill.emit(x, y, {
      count: 15,
      speedMin: 1.5,
      speedMax: 5.5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 12,
      lifetimeMax: 28,
      sizeMin: 14,
      sizeMax: 28,
      startAlpha: 0.9,
      endAlpha: 0,
      blendMode: 'add',
      color: 0xffffff,
    });

    // 2. Electro Residue (Violets/Purples)
    const electroColors = [0xe040fb, 0xc77dff, 0x7b2d8b, 0xf48dff];
    electroColors.forEach(c => {
      this._burst.emit(x, y, {
        count: 10,
        speedMin: 5.0,
        speedMax: 14.0,
        spreadAngle: cone,
        angleCenter: dir,
        lifetimeMin: 25,
        lifetimeMax: 50,
        sizeMin: 2,
        sizeMax: 5,
        startAlpha: 1,
        endAlpha: 0,
        blendMode: 'add',
        color: c,
        shrink: true,
      });
    });

    // 3. Pyro Residue (Oranges/Golds) - The "Overload" part
    const pyroColors = [0xff6d00, 0xffab40, 0xff3d00, 0xffd600];
    pyroColors.forEach(c => {
      this._burst.emit(x, y, {
        count: 8,
        speedMin: 6.0,
        speedMax: 16.0,
        spreadAngle: cone,
        angleCenter: dir,
        lifetimeMin: 20,
        lifetimeMax: 45,
        sizeMin: 2,
        sizeMax: 4,
        startAlpha: 0.8,
        endAlpha: 0,
        blendMode: 'add',
        color: c,
        shrink: true,
      });
    });
  }

  /**
   * Triggered when Keqing's sword connects.
   * Emits a sharp outward burst of lightning sparks.
   * @param {number} x
   * @param {number} y
   */
  triggerCollision(x, y) {
    this._burst.emit(x, y, {
      count: 18,
      speedMin: 1.5,
      speedMax: 5.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.2,
      sizeMax: 3.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    // A second tighter burst for the electric "zap" feel
    this._burst.emit(x, y, {
      count: 8,
      speedMin: 0.5,
      speedMax: 2.5,
      spreadAngle: Math.PI * 0.5,
      angleCenter: Math.random() * Math.PI * 2,
      lifetimeMin: 10,
      lifetimeMax: 22,
      sizeMin: 0.8,
      sizeMax: 2.0,
      startAlpha: 0.9,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    this._burst.update(0);
  }

  /**
   * Emit a trail of digital electro particles and ribbon beam segments for the flying stiletto.
   */
  triggerStilettoTrail(x, y, angle) {
    this._stilettoTrailCounter = (this._stilettoTrailCounter || 0) + 1;
    if (this._stilettoTrailCounter % 3 === 0) {
      // Draw ribbon segment trailing behind
      const bx = x - Math.cos(angle) * 25;
      const by = y - Math.sin(angle) * 25;
      this.triggerBeamSlash(bx, by, angle, 50, 3.5, 0.12);
    }

    // Spark particle
    this._skill.emit(x, y, {
      count: 1,
      speedMin: 0.2,
      speedMax: 1.0,
      spreadAngle: 0.8,
      angleCenter: angle + Math.PI,
      lifetimeMin: 12,
      lifetimeMax: 20,
      sizeMin: 1.0,
      sizeMax: 2.0,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });
  }

  /**
   * Emit a solid vector blink trail + departure afterimage + minor sparkles.
   */
  triggerTeleportStreak(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const mx = x1 + dx / 2;
    const my = y1 + dy / 2;

    // 1. Single solid teleport vector beam
    this.triggerBeamSlash(mx, my, angle, dist, 7.0, 0.22);

    // 2. Departure afterimage
    this.triggerAfterimage(x1, y1, angle);

    // 3. Reduced sparkle scatter along the path
    const steps = Math.ceil(dist / 30);
    for (let i = 0; i <= steps; i++) {
      const px = x1 + (dx * i) / steps;
      const py = y1 + (dy * i) / steps;
      this._skill.emit(px, py, {
        count: 1,
        speedMin: 0.1,
        speedMax: 0.8,
        spreadAngle: Math.PI * 2,
        angleCenter: 0,
        lifetimeMin: 12,
        lifetimeMax: 24,
        sizeMin: 1.2,
        sizeMax: 2.8,
        startAlpha: 0.9,
        endAlpha: 0,
        blendMode: 'add',
        gradient: ELECTRO_TELEPORT_GRADIENT,
        shrink: true,
      });
    }
  }

  /**
   * Detonation slashes: 4 criss-crossing beams + expanding shockwave flash + 2 tendrils + sparks.
   */
  triggerThunderclapSlashes(x, y) {
    // 1. Criss-crossing beam slashes
    const angles = [0.4, 1.57, 2.74, 3.93];
    angles.forEach(ang => {
      this.triggerBeamSlash(x, y, ang, 250, 7.5, 0.18);
    });

    // 2. Expanding shockwave flash ring
    let flash = this._beams.find(f => f.isFlash && !f.active);
    if (!flash) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      flash = { gfx: g, active: false, isFlash: true };
      this._beams.push(flash);
    }
    flash.active = true;
    flash.timer = 0.25; // 250ms
    flash.maxTimer = 0.25;
    flash.x = x;
    flash.y = y;
    flash.minRadius = 40;
    flash.maxRadius = 120;
    flash.strokeWidth = 3.0;

    // 3. Lightning tendrils
    for (let i = 0; i < 2; i++) {
      const tendrilAngle = Math.random() * Math.PI * 2;
      const tx = x + Math.cos(tendrilAngle) * 110;
      const ty = y + Math.sin(tendrilAngle) * 110;
      this.triggerLightningTendril(x, y, tx, ty);
    }

    // 4. Detonation burst particles
    this._skill.emit(x, y, {
      count: 20,
      speedMin: 1.5,
      speedMax: 5.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.5,
      sizeMax: 3.8,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    this._skill.update(0);
  }

  /**
   * Concentric expanding shockwave + particle burst at throw origin.
   */
  triggerStilettoLaunchFlash(x, y) {
    // 1. Particle burst
    this._skill.emit(x, y, {
      count: 20,
      speedMin: 1.5,
      speedMax: 4.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // 2. Small expanding shockwave flash ring
    let flash = this._beams.find(f => f.isFlash && !f.active);
    if (!flash) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      flash = { gfx: g, active: false, isFlash: true };
      this._beams.push(flash);
    }
    flash.active = true;
    flash.timer = 0.20; // 200ms
    flash.maxTimer = 0.20;
    flash.x = x;
    flash.y = y;
    flash.minRadius = 15;
    flash.maxRadius = 65;
    flash.strokeWidth = 2.5;
    
    this._skill.update(0);
  }

  /**
   * Gentle upward rising sparks from Keqing's active stiletto mark.
   */
  triggerStilettoAmbientSpark(x, y) {
    this._skill.emit(x, y, {
      count: 1,
      speedMin: 0.4,
      speedMax: 1.2,
      spreadAngle: 0.6,
      angleCenter: -Math.PI / 2, // upward
      lifetimeMin: 25,
      lifetimeMax: 45,
      sizeMin: 0.8,
      sizeMax: 1.8,
      startAlpha: 0.7,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
  }

  /**
   * Radial teleport arrival slash: V-shaped crescent beams, particle burst, lightning tendrils.
   */
  triggerTeleportArrivalSlash(x, y, angle) {
    // 1. V-shaped arrival crescent beam slashes (±30 degrees offset)
    const angleOffset = Math.PI / 6;
    this.triggerBeamSlash(x, y, angle - angleOffset, 200, 7.5, 0.18);
    this.triggerBeamSlash(x, y, angle + angleOffset, 200, 7.5, 0.18);

    // 2. Burst of 25 particles outward
    this._skill.emit(x, y, {
      count: 25,
      speedMin: 2.0,
      speedMax: 7.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 1.2,
      sizeMax: 3.5,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // 3. 1-2 lightning tendrils radiating outward
    const tendrilCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < tendrilCount; i++) {
      const tendrilAngle = angle + Math.PI + (Math.random() - 0.5) * Math.PI; // back-ish or random side
      const tx = x + Math.cos(tendrilAngle) * 90;
      const ty = y + Math.sin(tendrilAngle) * 90;
      this.triggerLightningTendril(x, y, tx, ty);
    }
  }

  // ── Sword infusion particles ──────────────────────────────

  /**
   * Emit violet trailing sparks from Keqing's sword tip during passive.
   * @param {number} x sword world X
   * @param {number} y sword world Y
   */
  triggerSwordInfusionParticles(x, y) {
    this._ambient.emit(x, y, {
      count: 2,
      speedMin: 0.3,
      speedMax: 1.2,
      spreadAngle: Math.PI * 0.8,
      angleCenter: Math.PI / 2,
      lifetimeMin: 18,
      lifetimeMax: 40,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
  }

  // ── Skill: Stellar Restoration ───────────────────────────

  /**
   * Phase 1 — throw stiletto: a quick sharp flash at the launch point.
   * @param {number} x  Keqing's position (origin of throw)
   * @param {number} y
   */
  triggerStilettoThrow(x, y) {
    this._skill.emit(x, y, {
      count: 14,
      speedMin: 1.0,
      speedMax: 4.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 12,
      lifetimeMax: 28,
      sizeMin: 1.0,
      sizeMax: 2.8,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });
    this._skill.update(0);
  }

  /**
   * Phase 2 — teleport detonation: massive electric nova at stiletto landing.
   * @param {number} x  stiletto X
   * @param {number} y  stiletto Y
   */
  triggerTeleportBurst(x, y) {
    // Large outer ring of violet sparks
    this._skill.emit(x, y, {
      count: 45,
      speedMin: 2.0,
      speedMax: 9.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 25,
      lifetimeMax: 55,
      sizeMin: 1.5,
      sizeMax: 4.5,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: -0.02,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // Dense inner white-hot core
    this._skill.emit(x, y, {
      count: 20,
      speedMin: 0.5,
      speedMax: 3.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 2.0,
      sizeMax: 5.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: [
        { t: 0.0, color: 0xffffff },
        { t: 0.5, color: 0xf48dff },
        { t: 1.0, color: 0xc77dff },
      ],
      shrink: false,
    });

    // Activate timed pulsing ring effect
    this._skillActive = true;
    this._skillTimer  = 0.5; // half-second afterglow
    this._skillX = x;
    this._skillY = y;

    this._skill.update(0);
  }

  // ── Burst: Starward Sword ────────────────────────────────

  /**
   * Triggered when the burst activates.
   * Begins the Starward Sword slash sequence animation.
   * @param {number} x  Keqing's position
   * @param {number} y
   */
  triggerStarwardSword(x, y) {
    this._burstActive = true;
    this._burstTimer  = 2.0; // total duration
    this._burstX = x;
    this._burstY = y;
    this._burstSlash = 0;
    this._burstAngle = 0;
  }

  /**
   * Starward explosion detonation — final massive blast at end of burst.
   * @param {number} x
   * @param {number} y
   */
  triggerStarwardExplosion(x, y) {
    // 1. Giant horizontal beam slash crossing the entire stage
    this.triggerBeamSlash(x, y, 0, 900, 24); // 24px extra wide horizontal final beam

    // 2. Trigger expanding white flash circle shockwave
    let flash = this._beams.find(f => f.isFlash && !f.active);
    if (!flash) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      flash = { gfx: g, active: false, isFlash: true };
      this._beams.push(flash);
    }
    flash.active = true;
    flash.timer = 0.35; // 350ms lifespan
    flash.maxTimer = 0.35;
    flash.x = x;
    flash.y = y;

    // Massive outer ring of particles
    this._skill.emit(x, y, {
      count: 80,
      speedMin: 3.0,
      speedMax: 14.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 30,
      lifetimeMax: 70,
      sizeMin: 2.0,
      sizeMax: 6.0,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: -0.01,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    // Bright inner core burst of particles
    this._skill.emit(x, y, {
      count: 30,
      speedMin: 0.5,
      speedMax: 4.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 3.0,
      sizeMax: 8.0,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: false,
    });

    this._skill.update(0);
  }

  /**
   * Emit a single crescent lightning arc slash — called per burst slash.
   * @param {number} x  Keqing's position
   * @param {number} y
   * @param {number} angle  direction of slash
   */
  triggerSlashArc(x, y, angle) {
    const spread = Math.PI * 0.55;
    
    // 1. Sharp White-Hot Cut (Elongated Rects)
    this._burst.emit(x, y, {
      count: 40,
      speedMin: 12.0,
      speedMax: 22.0,
      spreadAngle: spread,
      angleCenter: angle,
      lifetimeMin: 8,
      lifetimeMax: 18,
      sizeMin: 1.5,
      sizeMax: 2.5,
      scaleX: 18.0,      // VERY long cut
      scaleY: 0.8,       // VERY thin cut
      shape: 'rect',
      autoRotate: true,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      color: 0xffffff,
      shrink: false,     // Don't shrink length
    });

    // 2. Violet Lightning Trails (Elongated Rects)
    this._burst.emit(x, y, {
      count: 35,
      speedMin: 8.0,
      speedMax: 16.0,
      spreadAngle: spread,
      angleCenter: angle,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.2,
      sizeMax: 2.2,
      scaleX: 12.0,      // long streak
      scaleY: 1.2,
      shape: 'rect',
      autoRotate: true,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_TELEPORT_GRADIENT,
      shrink: true,
    });

    // 3. Diffuse Impact Glow (Circles - reduced size to prevent hiding the cuts)
    this._burst.emit(x, y, {
      count: 8,
      speedMin: 1.0,
      speedMax: 3.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 20,
      lifetimeMax: 40,
      sizeMin: 10.0,
      sizeMax: 25.0, // Back to reasonable 25px glow
      startAlpha: 0.5,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });

    this._burst.update(0);
  }

  /**
   * Draw a wide, full-screen beam slash crossing through (cx, cy) at angle.
   * @param {number} cx Epicenter X
   * @param {number} cy Epicenter Y
   * @param {number} angle Slash direction
   * @param {number} length Custom line length
   * @param {number} width Custom line width
   * @param {number} [timer=0.16] Custom lifespan in seconds
   */
  triggerBeamSlash(cx, cy, angle, length = 750, width = 12, timer = 0.16) {
    let beam = this._beams.find(b => !b.active);
    if (!beam) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      beam = { gfx: g, active: false };
      this._beams.push(beam);
    }

    beam.active = true;
    beam.isFlash = false;
    beam.timer = timer;
    beam.maxTimer = timer;
    beam.cx = cx;
    beam.cy = cy;
    beam.angle = angle;
    beam.length = length;
    beam.width = width;
  }

  /**
   * Spawn a ghostly outlines-only silhouette representing Keqing's circle body and sword.
   * @param {number} x Position X
   * @param {number} y Position Y
   * @param {number} angle Swing direction
   */
  triggerAfterimage(x, y, angle) {
    let afterimage = this._afterimages.find(ai => !ai.active);
    if (!afterimage) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      afterimage = { gfx: g, active: false };
      this._afterimages.push(afterimage);
    }

    afterimage.active = true;
    afterimage.timer = 0.28; // 280ms lifespan
    afterimage.maxTimer = 0.28;
    afterimage.x = x;
    afterimage.y = y;
    afterimage.angle = angle;
  }

  /**
   * Draw a jagged, crackling vector lightning polyline connecting two points.
   * @param {number} x1 Start X
   * @param {number} y1 Start Y
   * @param {number} x2 End X
   * @param {number} y2 End Y
   */
  triggerLightningTendril(x1, y1, x2, y2) {
    let tendril = this._tendrils.find(t => !t.active);
    if (!tendril) {
      const g = new Graphics();
      this._vfxGraphicsContainer.addChild(g);
      tendril = { gfx: g, active: false };
      this._tendrils.push(tendril);
    }

    tendril.active = true;
    tendril.timer = 0.12; // 120ms lifespan
    tendril.maxTimer = 0.12;

    // Generate jagged segment points
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Zig-zag every 35-40px
    const segments = Math.max(4, Math.ceil(dist / 35));
    const points = [];
    points.push({ x: x1, y: y1 });

    const angle = Math.atan2(dy, dx);
    const perpAngle = angle + Math.PI / 2;

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const px = x1 + dx * t;
      const py = y1 + dy * t;

      // Peak the distortion in the middle of the lightning
      const factor = Math.sin(t * Math.PI);
      const offset = (Math.random() - 0.5) * 22 * factor;

      points.push({
        x: px + Math.cos(perpAngle) * offset,
        y: py + Math.sin(perpAngle) * offset
      });
    }

    points.push({ x: x2, y: y2 });
    tendril.points = points;
  }

  // ── Cast aura (for burst windup) ─────────────────────────

  /**
   * Dramatic buildup sparks around Keqing while charging burst.
   */
  triggerCastAura(x, y) {
    this._skill.emit(x, y, {
      count: 35,
      speedMin: 0.8,
      speedMax: 4.5,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 30,
      lifetimeMax: 60,
      sizeMin: 1.5,
      sizeMax: 4.0,
      startAlpha: 0.9,
      endAlpha: 0,
      gravity: -0.025,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
    this._skill.update(0);
  }

  /**
   * Dense sparks during burst cast windup (called per frame).
   */
  triggerWindupSparks(x, y) {
    this._burst.emit(x, y, {
      count: 3,
      speedMin: 0.5,
      speedMax: 3.0,
      spreadAngle: Math.PI * 2,
      angleCenter: -Math.PI / 2,
      lifetimeMin: 20,
      lifetimeMax: 40,
      sizeMin: 1.0,
      sizeMax: 2.5,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      gradient: ELECTRO_GRADIENT,
      shrink: true,
    });
    this._burst.update(0);
  }

  // ── Update skill & burst animations ─────────────────────

  /**
   * Called every frame from the main ticker to update timed effects.
   * @param {number} delta
   * @param {number} kx  Keqing's current x (tracked for burst follow)
   * @param {number} ky  Keqing's current y
   */
  updateSkill(delta, kx, ky) {
    // 1. Update and draw active beams and shockwave flashes
    for (const beam of this._beams) {
      if (!beam.active) continue;
      beam.timer -= delta * 0.016;
      if (beam.timer <= 0) {
        beam.active = false;
        beam.gfx.clear();
      } else {
        const progress = beam.timer / beam.maxTimer; // 1.0 down to 0.0
        beam.gfx.clear();

        if (beam.isFlash) {
          // Expanding shockwave flash ring
          const prog = 1 - progress; // 0.0 up to 1.0
          const alpha = prog * (1 - prog) * 4; // smooth ease-in-out-like fade
          const minR = beam.minRadius !== undefined ? beam.minRadius : 40;
          const maxR = beam.maxRadius !== undefined ? beam.maxRadius : 280;
          const radius = minR + prog * (maxR - minR);
          const strokeW = beam.strokeWidth !== undefined ? beam.strokeWidth : 4;
          
          beam.gfx.blendMode = 'add';
          beam.gfx.circle(beam.x, beam.y, radius);
          beam.gfx.fill({ color: 0xffffff, alpha: alpha * 0.45 });
          beam.gfx.stroke({ color: 0xc77dff, width: strokeW * alpha, alpha: alpha });
        } else {
          // Straight line beam slash
          const alpha = progress;
          const halfL = beam.length / 2;
          const dx = Math.cos(beam.angle) * halfL;
          const dy = Math.sin(beam.angle) * halfL;
          
          const x1 = beam.cx - dx;
          const y1 = beam.cy - dy;
          const x2 = beam.cx + dx;
          const y2 = beam.cy + dy;
          
          beam.gfx.blendMode = 'add';
          
          // Outer purple halo
          beam.gfx.moveTo(x1, y1);
          beam.gfx.lineTo(x2, y2);
          beam.gfx.stroke({
            color: 0x7b2d8b,
            width: beam.width * 3.5,
            alpha: alpha * 0.35
          });
          
          // Medium neon-violet glow
          beam.gfx.moveTo(x1, y1);
          beam.gfx.lineTo(x2, y2);
          beam.gfx.stroke({
            color: 0xc77dff,
            width: beam.width * 2.0,
            alpha: alpha * 0.65
          });

          // Bright white core
          beam.gfx.moveTo(x1, y1);
          beam.gfx.lineTo(x2, y2);
          beam.gfx.stroke({
            color: 0xffffff,
            width: beam.width * 0.6,
            alpha: alpha * 0.95
          });
        }
      }
    }

    // 2. Update and draw active afterimages
    for (const ai of this._afterimages) {
      if (!ai.active) continue;
      ai.timer -= delta * 0.016;
      if (ai.timer <= 0) {
        ai.active = false;
        ai.gfx.clear();
      } else {
        const progress = ai.timer / ai.maxTimer; // 1.0 down to 0.0
        const alpha = progress * 0.8;
        
        ai.gfx.clear();
        
        // Draw the circle outline body
        ai.gfx.circle(ai.x, ai.y, 42);
        ai.gfx.fill({ color: 0x2d1a40, alpha: alpha * 0.3 }); // Dark purple translucent body
        ai.gfx.stroke({ color: 0xc77dff, width: 2.5, alpha: alpha }); // Neon outline

        // Draw inner lightning bolt emblem inside the circle body
        ai.gfx.moveTo(ai.x - 4, ai.y - 12);
        ai.gfx.lineTo(ai.x + 6, ai.y - 2);
        ai.gfx.lineTo(ai.x + 1, ai.y - 2);
        ai.gfx.lineTo(ai.x + 8, ai.y + 10);
        ai.gfx.lineTo(ai.x - 2, ai.y + 0);
        ai.gfx.lineTo(ai.x + 2, ai.y + 0);
        ai.gfx.lineTo(ai.x - 4, ai.y - 12);
        ai.gfx.closePath();
        ai.gfx.fill({ color: 0xffffff, alpha: alpha * 0.7 });
        ai.gfx.stroke({ color: 0xc77dff, width: 1.5, alpha: alpha });

        // Draw stylized sword outline extending from the circle
        const startR = 40;
        const swordLen = 70;
        
        const sx = ai.x + Math.cos(ai.angle) * startR;
        const sy = ai.y + Math.sin(ai.angle) * startR;
        const ex = ai.x + Math.cos(ai.angle) * (startR + swordLen);
        const ey = ai.y + Math.sin(ai.angle) * (startR + swordLen);
        
        // Crossguard
        const crossAngle = ai.angle + Math.PI / 2;
        const crossW = 10;
        const cx1 = sx + Math.cos(crossAngle) * crossW;
        const cy1 = sy + Math.sin(crossAngle) * crossW;
        const cx2 = sx - Math.cos(crossAngle) * crossW;
        const cy2 = sy - Math.sin(crossAngle) * crossW;
        
        ai.gfx.moveTo(cx1, cy1);
        ai.gfx.lineTo(cx2, cy2);
        ai.gfx.stroke({ color: 0xc77dff, width: 3, alpha: alpha });
        
        // Blade
        ai.gfx.moveTo(sx, sy);
        ai.gfx.lineTo(ex, ey);
        ai.gfx.stroke({ color: 0xffffff, width: 2.5, alpha: alpha });
        ai.gfx.stroke({ color: 0xc77dff, width: 4.5, alpha: alpha * 0.5 });
      }
    }

    // 3. Update and draw active lightning tendrils
    for (const tendril of this._tendrils) {
      if (!tendril.active) continue;
      tendril.timer -= delta * 0.016;
      if (tendril.timer <= 0) {
        tendril.active = false;
        tendril.gfx.clear();
      } else {
        const progress = tendril.timer / tendril.maxTimer;
        const alpha = progress;
        
        tendril.gfx.clear();
        tendril.gfx.blendMode = 'add';
        
        if (tendril.points.length > 0) {
          tendril.gfx.moveTo(tendril.points[0].x, tendril.points[0].y);
          for (let i = 1; i < tendril.points.length; i++) {
            tendril.gfx.lineTo(tendril.points[i].x, tendril.points[i].y);
          }
          
          tendril.gfx.stroke({
            color: 0xc77dff,
            width: 3.5,
            alpha: alpha * 0.65
          });
          
          tendril.gfx.moveTo(tendril.points[0].x, tendril.points[0].y);
          for (let i = 1; i < tendril.points.length; i++) {
            tendril.gfx.lineTo(tendril.points[i].x, tendril.points[i].y);
          }
          tendril.gfx.stroke({
            color: 0xffffff,
            width: 1.2,
            alpha: alpha * 0.95
          });
        }
      }
    }

    // Skill afterglow ring
    if (this._skillActive) {
      this._skillTimer -= delta * 0.016;
      if (this._skillTimer <= 0) {
        this._skillActive = false;
      } else {
        // Emit a gentle fading ring of sparks at the detonation site
        const ring = this._skillTimer / 0.5;
        this._skill.emit(this._skillX, this._skillY, {
          count: Math.round(3 * ring),
          speedMin: 0.3,
          speedMax: 1.5,
          spreadAngle: Math.PI * 2,
          angleCenter: 0,
          lifetimeMin: 15,
          lifetimeMax: 30,
          sizeMin: 0.8,
          sizeMax: 2.0,
          startAlpha: ring * 0.6,
          endAlpha: 0,
          blendMode: 'add',
          gradient: ELECTRO_GRADIENT,
          shrink: true,
        });
      }
    }

    // Burst slash sequence
    if (this._burstActive && kx !== undefined) {
      this._burstTimer -= delta * 0.016;
      this._burstX = kx;
      this._burstY = ky;

      if (this._burstTimer <= 0) {
        this._burstActive = false;
      }
    }

    this._skill.update(delta);
    this._burst.update(delta);
  }
}
