// ─────────────────────────────────────────────────────────────
// ParticleSystem.js – Lightweight, pooled particle emitter
// built on plain PixiJS v8 Graphics inside a Container.
// ─────────────────────────────────────────────────────────────
import { Container, Graphics } from 'pixi.js';
import { sampleGradient } from './ElementalColors.js';

// ── Default emitter config ──────────────────────────────────
const DEFAULT_CONFIG = {
  count: 20,              // particles per burst
  speedMin: 1,            // px / frame‐unit
  speedMax: 4,
  spreadAngle: Math.PI * 2, // full circle
  angleCenter: -Math.PI / 2, // upward
  lifetimeMin: 30,        // frames (at 60 fps ≈ 0.5 s)
  lifetimeMax: 60,
  sizeMin: 2,
  sizeMax: 5,
  scaleX: 1,              // width multiplier
  scaleY: 1,              // height multiplier
  shape: 'circle',        // 'circle' or 'rect'
  autoRotate: false,      // face velocity vector
  startAlpha: 1,
  endAlpha: 0,
  gravity: 0,             // px / frame²
  blendMode: 'normal',    // 'add' for glow
  gradient: null,         // optional gradient array from ElementalColors
  color: 0xffffff,        // fallback static colour
  shrink: true,           // whether particles shrink over life
};

// ── Particle data (plain object – no class overhead) ────────
function createParticleData() {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    life: 0, maxLife: 1,
    size: 3,
    scaleX: 1,
    scaleY: 1,
    autoRotate: false,
    color: 0xffffff,
    alpha: 1,
    blendMode: 'normal',
    active: false,
    // references to Graphics visuals
    gfxCircle: null,
    gfxRect: null,
    activeGfx: null,
    // config snapshot so we can shade over lifetime
    gradient: null,
    startAlpha: 1,
    endAlpha: 0,
    shrink: true,
    startSize: 3,
    // Attraction properties
    targetX: 0,
    targetY: 0,
    attractionForce: 0,
    // Orbital properties
    centerX: 0,
    centerY: 0,
    orbitalForce: 0,
  };
}

// ─────────────────────────────────────────────────────────────
export class ParticleSystem {
  /**
   * @param {object} opts
   * @param {number} [opts.poolSize=300] – pre-allocated particles
   */
  constructor({ poolSize = 300 } = {}) {
    /** Container that holds every particle graphic. Add this to your stage. */
    this.container = new Container();
    this.container.sortableChildren = false;
    this.container.interactiveChildren = false;

    /** @type {Array<object>} All particle data objects (pool). */
    this._pool = [];

    /** Active continuous emitter descriptors. */
    this._continuousEmitters = [];

    this._initPool(poolSize);
  }

  // ── Pool management ──────────────────────────────────────

  _initPool(size) {
    for (let i = 0; i < size; i++) {
      const p = createParticleData();
      
      const gfxCircle = new Graphics();
      gfxCircle.circle(0, 0, 1).fill(0xffffff);
      gfxCircle.visible = false;
      this.container.addChild(gfxCircle);
      
      const gfxRect = new Graphics();
      gfxRect.rect(-0.5, -0.5, 1, 1).fill(0xffffff);
      gfxRect.visible = false;
      this.container.addChild(gfxRect);

      p.gfxCircle = gfxCircle;
      p.gfxRect = gfxRect;
      this._pool.push(p);
    }
  }

  /** Get an inactive particle from the pool, or grow the pool. */
  _acquire() {
    for (let i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) return this._pool[i];
    }
    // Pool exhausted – grow by 50
    const before = this._pool.length;
    this._initPool(50);
    return this._pool[before]; // first of the newly created batch
  }

  // ── Emit API ─────────────────────────────────────────────

  /**
   * Burst‐emit a set of particles at (x, y).
   *
   * @param {number} x
   * @param {number} y
   * @param {object} [cfg] – overrides merged with DEFAULT_CONFIG
   */
  emit(x, y, cfg = {}) {
    if (window.headlessGachaMode) return;
    const c = { ...DEFAULT_CONFIG, ...cfg };
    const halfSpread = c.spreadAngle / 2;

    for (let i = 0; i < c.count; i++) {
      const p = this._acquire();
      if (!p) break;

      const angle = c.angleCenter + (Math.random() * 2 - 1) * halfSpread;
      const speed = c.speedMin + Math.random() * (c.speedMax - c.speedMin);
      const life = c.lifetimeMin + Math.random() * (c.lifetimeMax - c.lifetimeMin);
      const size = c.sizeMin + Math.random() * (c.sizeMax - c.sizeMin);

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = life;
      p.maxLife = life;
      p.size = size;
      p.startSize = size;
      p.scaleX = c.scaleX ?? 1;
      p.scaleY = c.scaleY ?? 1;
      p.autoRotate = !!c.autoRotate;
      p.alpha = c.startAlpha;
      p.startAlpha = c.startAlpha;
      p.endAlpha = c.endAlpha;
      p.blendMode = c.blendMode;
      p.gradient = c.gradient;
      p.color = c.color;
      p.shrink = c.shrink;
      p.gravity = c.gravity;
      p.targetX = c.targetX || 0;
      p.targetY = c.targetY || 0;
      p.attractionForce = c.attractionForce || 0;
      p.centerX = c.centerX || 0;
      p.centerY = c.centerY || 0;
      p.orbitalForce = c.orbitalForce || 0;
      p.active = true;

      // Swap active GFX based on shape
      if (p.activeGfx) p.activeGfx.visible = false;
      p.activeGfx = (c.shape === 'rect') ? p.gfxRect : p.gfxCircle;
      
      const gfx = p.activeGfx;
      gfx.visible = true;
      gfx.position.set(x, y);
      gfx.scale.set(size * p.scaleX, size * p.scaleY);
      gfx.alpha = c.startAlpha;
      gfx.blendMode = c.blendMode;

      if (p.autoRotate) {
        gfx.rotation = angle;
      } else {
        gfx.rotation = 0;
      }

      // Tint the circle to its birth colour
      const birthColor = c.gradient ? sampleGradient(c.gradient, 0) : c.color;
      gfx.tint = birthColor;
    }
  }

  /**
   * Start a continuous emitter that fires particles every frame.
   */
  emitContinuous(x, y, cfg = {}) {
    const handle = {
      x,
      y,
      active: true,
      rate: cfg.rate ?? 1,
      _accum: 0,
      config: { ...DEFAULT_CONFIG, ...cfg, count: 1 },
    };
    this._continuousEmitters.push(handle);
    return handle;
  }

  /** Stop and remove a continuous emitter. */
  stopContinuous(handle) {
    if (handle) handle.active = false;
  }

  // ── Update loop ──────────────────────────────────────────

  update(delta) {
    if (window.headlessGachaMode) return;
    
    // 1. Continuous emitters
    for (let i = this._continuousEmitters.length - 1; i >= 0; i--) {
      const e = this._continuousEmitters[i];
      if (!e.active) {
        this._continuousEmitters.splice(i, 1);
        continue;
      }
      e._accum += e.rate * delta;
      while (e._accum >= 1) {
        e._accum -= 1;
        this.emit(e.x, e.y, e.config);
      }
    }

    // 2. Active particles
    for (let i = 0; i < this._pool.length; i++) {
      const p = this._pool[i];
      if (!p.active) continue;

      p.life -= delta;

      if (p.life <= 0) {
        p.active = false;
        if (p.activeGfx) p.activeGfx.visible = false;
        continue;
      }

      const f = 1 - p.life / p.maxLife;

      p.vy += (p.gravity ?? 0) * delta;

      if (p.orbitalForce !== 0) {
        const dx = p.x - p.centerX;
        const dy = p.y - p.centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 1) {
          const dist = Math.sqrt(distSq);
          const tx = -dy / dist;
          const ty = dx / dist;
          p.vx += tx * p.orbitalForce * delta;
          p.vy += ty * p.orbitalForce * delta;
        }
      }

      if (p.attractionForce !== 0) {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 1) {
          const dist = Math.sqrt(distSq);
          const force = p.attractionForce * delta;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      p.x += p.vx * delta;
      p.y += p.vy * delta;

      p.alpha = p.startAlpha + (p.endAlpha - p.startAlpha) * f;

      if (p.shrink) {
        p.size = p.startSize * (1 - f * 0.7);
      }

      if (p.gradient) {
        p.color = sampleGradient(p.gradient, f);
      }

      const gfx = p.activeGfx;
      if (gfx) {
        gfx.position.set(p.x, p.y);
        gfx.scale.set(p.size * p.scaleX, p.size * p.scaleY);
        gfx.alpha = Math.max(0, p.alpha);
        gfx.tint = p.color;

        if (p.autoRotate) {
          gfx.rotation = Math.atan2(p.vy, p.vx);
        }
      }
    }
  }

  // ── Utilities ────────────────────────────────────────────

  clear() {
    for (const p of this._pool) {
      p.active = false;
      if (p.gfxCircle) p.gfxCircle.visible = false;
      if (p.gfxRect) p.gfxRect.visible = false;
    }
    this._continuousEmitters.length = 0;
  }

  get activeCount() {
    let n = 0;
    for (const p of this._pool) if (p.active) n++;
    return n;
  }

  destroy() {
    this.clear();
    this.container.destroy({ children: true });
    this._pool.length = 0;
  }
}
