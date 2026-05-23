/**
 * physics.js — Simple custom physics for bouncing circles
 * Handles velocity, wall bouncing, and circle-circle elastic collision.
 */

/**
 * @typedef {Object} PhysicsBody
 * @property {number} x - Center X position
 * @property {number} y - Center Y position
 * @property {number} vx - Velocity X (pixels per frame at 60fps)
 * @property {number} vy - Velocity Y (pixels per frame at 60fps)
 * @property {number} radius - Circle radius
 * @property {number} mass - Mass for collision response (default 1)
 */

/**
 * Update a body's position based on velocity
 * @param {PhysicsBody} body
 * @param {number} delta - Frame delta (1.0 = 60fps)
 */
export function updatePosition(body, delta) {
  body.x += body.vx * delta;
  body.y += body.vy * delta;
}

/**
 * Bounce body off arena walls
 * @param {PhysicsBody} body
 * @param {Object} bounds - { x, y, width, height }
 * @returns {boolean} true if a wall bounce occurred
 */
export function bounceOffWalls(body, bounds) {
  let bounced = false;
  const left = bounds.x + body.radius;
  const right = bounds.x + bounds.width - body.radius;
  const top = bounds.y + body.radius;
  const bottom = bounds.y + bounds.height - body.radius;

  if (body.x <= left) {
    body.x = left;
    body.vx = Math.abs(body.vx);
    bounced = true;
  } else if (body.x >= right) {
    body.x = right;
    body.vx = -Math.abs(body.vx);
    bounced = true;
  }

  if (body.y <= top) {
    body.y = top;
    body.vy = Math.abs(body.vy);
    bounced = true;
  } else if (body.y >= bottom) {
    body.y = bottom;
    body.vy = -Math.abs(body.vy);
    bounced = true;
  }

  return bounced;
}

/**
 * Check if two circles are overlapping
 * @param {PhysicsBody} a
 * @param {PhysicsBody} b
 * @returns {{ colliding: boolean, overlap: number, nx: number, ny: number }}
 */
export function checkCircleCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.radius + b.radius;

  if (dist < minDist && dist > 0) {
    return {
      colliding: true,
      overlap: minDist - dist,
      nx: dx / dist,    // Normal X (a → b)
      ny: dy / dist,    // Normal Y (a → b)
      contactX: a.x + (dx / dist) * a.radius,
      contactY: a.y + (dy / dist) * a.radius,
    };
  }

  return { colliding: false, overlap: 0, nx: 0, ny: 0, contactX: 0, contactY: 0 };
}

/**
 * Resolve elastic collision between two circles
 * Separates overlapping circles and exchanges velocity components along collision normal
 * @param {PhysicsBody} a
 * @param {PhysicsBody} b
 * @param {{ overlap: number, nx: number, ny: number }} collision
 */
export function resolveCollision(a, b, collision) {
  const { overlap, nx, ny } = collision;

  // Separate circles (push apart equally)
  const separation = overlap / 2 + 0.5;
  a.x -= nx * separation;
  a.y -= ny * separation;
  b.x += nx * separation;
  b.y += ny * separation;

  // Elastic collision velocity exchange along collision normal
  const massA = a.mass || 1;
  const massB = b.mass || 1;
  const totalMass = massA + massB;

  // Relative velocity along collision normal
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const relVelNormal = dvx * nx + dvy * ny;

  // Don't resolve if velocities are separating
  if (relVelNormal < 0) return;

  // Impulse magnitude (coefficient of restitution = 1.0 for perfect elastic)
  const restitution = 0.95;
  const impulse = (-(1 + restitution) * relVelNormal) / totalMass;

  // Apply impulse
  a.vx += impulse * massB * nx;
  a.vy += impulse * massB * ny;
  b.vx -= impulse * massA * nx;
  b.vy -= impulse * massA * ny;

  // Ensure minimum speed (prevent circles from getting stuck)
  enforceMinSpeed(a, 1.5);
  enforceMinSpeed(b, 1.5);
}

/**
 * Ensure a body maintains a minimum speed
 */
function enforceMinSpeed(body, minSpeed) {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
  if (speed < minSpeed && speed > 0) {
    const scale = minSpeed / speed;
    body.vx *= scale;
    body.vy *= scale;
  }
}

/**
 * Create initial velocity vector at a given speed with random direction
 * @param {number} speed
 * @returns {{ vx: number, vy: number }}
 */
export function randomVelocity(speed) {
  const angle = Math.random() * Math.PI * 2;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}
