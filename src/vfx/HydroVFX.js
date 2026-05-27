// ─────────────────────────────────────────────────────────────
// HydroVFX.js – Kamisato Ayato's water/Hydro visual effects layer.
//   • ambient aura   – floating water bubbles and droplets
//   • collision burst – explosive radial splashes and droplets
//   • skill effect    – Kyouka stance/Suiyuu visual support
//   • afterimage      – ghostly aquamarine clones for blink N5
// ─────────────────────────────────────────────────────────────
import { Container, Graphics } from 'pixi.js';
import { ParticleSystem } from './ParticleSystem.js';
import { HYDRO_GRADIENT, HYDRO_COLORS } from './ElementalColors.js';

export class HydroVFX {
  constructor() {
    this.container = new Container();

    // ── sub-systems
    this._ambient = new ParticleSystem({ poolSize: 80 });
    this._burst   = new ParticleSystem({ poolSize: 150 });
    this._skill   = new ParticleSystem({ poolSize: 200 });

    this.container.addChild(this._ambient.container);
    this.container.addChild(this._burst.container);
    this.container.addChild(this._skill.container);

    // Afterimage pool
    this._afterimagesContainer = new Container();
    this.container.addChild(this._afterimagesContainer);
    this._afterimages = [];

    // Continuous emitter handle for ambient aura
    this._ambientHandle = null;

    // Skill animation state (shell support)
    this._skillActive = false;
    this._skillTimer = 0;
    this._skillX = 0;
    this._skillY = 0;
  }

  // ── Ambient aura ──────────────────────────────────────────

  /**
   * Call every frame to keep the ambient aura alive around (x, y).
   */
  updateAmbient(x, y, delta) {
    if (!this._ambientHandle) {
      this._ambientHandle = this._ambient.emitContinuous(x, y, {
        rate: 0.6,            // droplet every couple frames
        count: 1,
        speedMin: 0.15,
        speedMax: 0.5,
        spreadAngle: Math.PI * 2,
        angleCenter: -Math.PI / 2,
        lifetimeMin: 40,
        lifetimeMax: 70,
        sizeMin: 1.5,
        sizeMax: 3.5,
        startAlpha: 0.5,
        endAlpha: 0,
        gravity: -0.012,      // float upward slowly
        blendMode: 'add',
        gradient: HYDRO_GRADIENT,
        shrink: true,
      });
    }

    // Follow character position with micro-offsets
    this._ambientHandle.x = x + (Math.random() - 0.5) * 20;
    this._ambientHandle.y = y + (Math.random() - 0.5) * 20;

    this._ambient.update(delta);
  }

  // ── Collision burst ──────────────────────────────────────

  /**
   * Trigger a beautiful water splash at (x, y).
   */
  triggerCollision(x, y) {
    // Explosive water droplets
    this._burst.emit(x, y, {
      count: 22 + Math.floor(Math.random() * 8),
      speedMin: 2.0,
      speedMax: 7.0,
      spreadAngle: Math.PI * 2,
      angleCenter: 0,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 2.0,
      sizeMax: 5.5,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: 0.035, // fall back like gravity splashing
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });

    // Secondary fine mist overlay
    this._burst.emit(x, y, {
      count: 8,
      speedMin: 0.5,
      speedMax: 2.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 12,
      lifetimeMax: 24,
      sizeMin: 0.8,
      sizeMax: 2.0,
      startAlpha: 0.8,
      endAlpha: 0,
      blendMode: 'add',
      color: HYDRO_COLORS.white,
      shrink: true,
    });
  }

  // ── Cast Aura ──────────────────────────────────────────

  /**
   * Trigger water ripple expansions radiating outwards.
   */
  triggerCastAura(x, y) {
    this._skill.emit(x, y, {
      count: 15,
      speedMin: 0.3,
      speedMax: 1.2,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 35,
      lifetimeMax: 65,
      sizeMin: 2.5,
      sizeMax: 6.0,
      startAlpha: 0.75,
      endAlpha: 0,
      gravity: -0.008,
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });
  }

  // ── Sword Infusion Particles ──────────────────────────

  /**
   * Emit beautiful trailing water droplets from the sword.
   */
  triggerSwordInfusionParticles(x, y) {
    this._burst.emit(x, y, {
      count: 1,
      speedMin: 0.1,
      speedMax: 0.9,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 15,
      lifetimeMax: 35,
      sizeMin: 1.2,
      sizeMax: 3.0,
      startAlpha: 0.8,
      endAlpha: 0.0,
      gravity: 0.01,
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });

    if (Math.random() < 0.3) {
      this._burst.emit(x, y, {
        count: 1,
        speedMin: 0.3,
        speedMax: 1.2,
        spreadAngle: Math.PI * 2,
        lifetimeMin: 10,
        lifetimeMax: 20,
        sizeMin: 0.6,
        sizeMax: 1.6,
        startAlpha: 0.9,
        endAlpha: 0.0,
        blendMode: 'add',
        color: HYDRO_COLORS.accent,
        shrink: true,
      });
    }
  }

  // ── Ghostly Afterimages ────────────────────────────────

  /**
   * Spawns a gorgeous pooled aquamarine ghost at departure coords.
   */
  triggerAfterimage(x, y, angle) {
    let afterimage = this._afterimages.find(ai => !ai.active);
    if (!afterimage) {
      const g = new Graphics();
      this._afterimagesContainer.addChild(g);
      afterimage = { gfx: g, active: false };
      this._afterimages.push(afterimage);
    }

    afterimage.active = true;
    afterimage.timer = 0.32; // 320ms lifespan
    afterimage.maxTimer = 0.32;
    afterimage.x = x;
    afterimage.y = y;
    afterimage.angle = angle;
  }

  // ── Skill update and afterimages loop ──────────────────

  /**
   * Trigger skill visual state shell.
   */
  triggerSkill(x, y) {
    this._skillActive = true;
    this._skillTimer = 0;
    this._skillX = x;
    this._skillY = y;
  }

  /**
   * Driven every frame. Updates active particles and draws/fades afterimages.
   */
  updateSkill(delta, x, y) {
    this._burst.update(delta);
    this._skill.update(delta);

    // Update and draw active afterimages
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

        // Draw character body circle
        ai.gfx.circle(ai.x, ai.y, 42);
        ai.gfx.fill({ color: HYDRO_COLORS.dark, alpha: alpha * 0.35 }); // translucent dark abyss
        ai.gfx.stroke({ color: HYDRO_COLORS.cyan, width: 2.5, alpha: alpha }); // glowing cyan outline

        // Draw elegant water ripple wave inside character body
        ai.gfx.moveTo(ai.x - 12, ai.y + 4);
        ai.gfx.bezierCurveTo(ai.x - 6, ai.y - 8, ai.x + 6, ai.y + 8, ai.x + 12, ai.y - 4);
        ai.gfx.stroke({ color: HYDRO_COLORS.accent, width: 2.0, alpha: alpha });

        // Draw stylized sword outline extending in the strike direction
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
        ai.gfx.stroke({ color: HYDRO_COLORS.cyan, width: 3.0, alpha: alpha });

        // Blade
        ai.gfx.moveTo(sx, sy);
        ai.gfx.lineTo(ex, ey);
        ai.gfx.stroke({ color: HYDRO_COLORS.white, width: 2.5, alpha: alpha });
        ai.gfx.stroke({ color: HYDRO_COLORS.cyan, width: 4.5, alpha: alpha * 0.5 });
      }
    }

    if (!this._skillActive) return;

    if (x !== undefined && y !== undefined) {
      this._skillX = x;
      this._skillY = y;
    }

    this._skillTimer += delta;
    if (this._skillTimer >= 60) {
      this._skillActive = false;
    }
  }

  /**
   * Spawns a spectacular outward water clone explosion at (x, y).
   */
  triggerWaterCloneExplosion(x, y) {
    // 1. High-density explosive radial water droplets
    this._burst.emit(x, y, {
      count: 36,
      speedMin: 3.0,
      speedMax: 9.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 2.5,
      sizeMax: 6.0,
      startAlpha: 1.0,
      endAlpha: 0,
      gravity: 0.04, // splash downward
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });

    // 2. White vapor steam mist cloud
    this._ambient.emit(x, y, {
      count: 18,
      speedMin: 0.5,
      speedMax: 2.0,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 30,
      lifetimeMax: 60,
      sizeMin: 6.0,
      sizeMax: 14.0,
      startAlpha: 0.55,
      endAlpha: 0.0,
      color: HYDRO_COLORS.lightCyan,
      blendMode: 'normal',
      shrink: true,
    });
  }

  /**
   * Draws a spectacular Hydro slash arc using high-speed 'rect' particles.
   * Inspired by Keqing's Starward Sword slashes but in Hydro palette.
   */
  triggerShunsuikenSlash(x, y, angle, index) {
    const sweepSign = index === 1 ? -1 : 1;
    const sweepCone = Math.PI * 0.65;
    const targetAngle = angle + sweepSign * Math.PI * 0.15;
    
    // 1. Sharp Blue-Cyan Cut (Elongated Rects)
    this._burst.emit(x, y, {
      count: 28,
      speedMin: 10.0,
      speedMax: 20.0,
      spreadAngle: sweepCone,
      angleCenter: targetAngle,
      lifetimeMin: 10,
      lifetimeMax: 22,
      sizeMin: 1.8,
      sizeMax: 3.2,
      scaleX: 16.0,      // VERY long cut
      scaleY: 0.9,       // thin cut
      shape: 'rect',
      autoRotate: true,
      startAlpha: 1.0,
      endAlpha: 0,
      blendMode: 'add',
      color: 0xffffff,   // White core
      shrink: false,
    });

    // 2. Aquamarine Water Trails (Elongated Rects)
    this._burst.emit(x, y, {
      count: 25,
      speedMin: 8.0,
      speedMax: 16.0,
      spreadAngle: sweepCone * 1.1,
      angleCenter: targetAngle,
      lifetimeMin: 15,
      lifetimeMax: 30,
      sizeMin: 1.5,
      sizeMax: 2.8,
      scaleX: 12.0,      // long streak
      scaleY: 1.4,
      shape: 'rect',
      autoRotate: true,
      startAlpha: 0.85,
      endAlpha: 0,
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });

    // 3. Diffuse Splash Glow (Circles)
    this._burst.emit(x, y, {
      count: 12,
      speedMin: 2.0,
      speedMax: 5.5,
      spreadAngle: Math.PI * 2,
      lifetimeMin: 20,
      lifetimeMax: 45,
      sizeMin: 2.5,
      sizeMax: 6.0,
      startAlpha: 0.7,
      endAlpha: 0,
      gravity: 0.04,
      blendMode: 'add',
      gradient: HYDRO_GRADIENT,
      shrink: true,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────

  clear() {
    this._ambient.clear();
    this._burst.clear();
    this._skill.clear();
    this._skillActive = false;
    this._ambientHandle = null;

    for (const ai of this._afterimages) {
      ai.active = false;
      ai.gfx.clear();
    }
  }

  get skillActive() {
    return this._skillActive;
  }

  destroy() {
    this._ambient.destroy();
    this._burst.destroy();
    this._skill.destroy();
    for (const ai of this._afterimages) {
      ai.gfx.destroy();
    }
    this._afterimages = [];
    this.container.destroy({ children: true });
  }
}
