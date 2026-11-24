// All distances are in world pixels and all times are in seconds.
export const WORLD = Object.freeze({ width: 760, height: 500, floorY: 425 });
export const LAUNCH = Object.freeze({ x: 102, y: 390 });
export const CUSHION = Object.freeze({ x: 270, y: 404, width: 96 });
export const WALL = Object.freeze({ x: 420, y: 285, width: 29 });
export const SPARE_BASKET = Object.freeze({ x: 703, y: 371, width: 56 });
export const LIMITS = Object.freeze({ minVx: 45, maxVx: 480, minVy: -560, maxVy: -60 });
export const STAGES = Object.freeze([
  Object.freeze({ target: 2 }),
  Object.freeze({ target: 2 }),
  Object.freeze({ target: 1 }),
]);

const EGG_RADIUS = 10;
const GRAVITY = 630;
const SPRING_SPEED = 493;
const DT = 1 / 120;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function assertStage(stageIndex) {
  if (!Number.isInteger(stageIndex) || !STAGES[stageIndex]) throw new RangeError('Unknown stage');
}

export function isValidShot(shot) {
  return !!shot && Number.isFinite(shot.vx) && Number.isFinite(shot.vy)
    && Number.isFinite(shot.phase)
    && shot.vx >= LIMITS.minVx && shot.vx <= LIMITS.maxVx
    && shot.vy >= LIMITS.minVy && shot.vy <= LIMITS.maxVy
    && shot.phase >= 0 && shot.phase <= 600;
}

export function basketAt(stageIndex, phaseSeconds, misses = 0, goalsInStage = 0, rulesVersion = 2) {
  assertStage(stageIndex);
  const extraWidth = misses >= 2 ? 12 : 0;
  if (rulesVersion === 1) {
    // Existing round tickets and saved shots keep their original targets.
    if (stageIndex === 0) return { x: 385, y: 343, width: 96 + extraWidth };
    if (stageIndex === 1) return { x: 605, y: 327, width: 90 + extraWidth };
    const x = 559 + 66 * Math.sin(2 * Math.PI * phaseSeconds / 5.6);
    return { x, y: 331, width: 92 + extraWidth };
  }
  if (stageIndex === 0) {
    return goalsInStage === 0
      ? { x: 385, y: 343, width: 96 + extraWidth }
      : { x: 500, y: 322, width: 76 + extraWidth };
  }
  if (stageIndex === 1) {
    return goalsInStage === 0
      ? { x: 540, y: 327, width: 78 + extraWidth }
      : { x: 635, y: 309, width: 72 + extraWidth };
  }
  const x = 541 + 92 * Math.sin(2 * Math.PI * phaseSeconds / 5);
  return { x, y: 331, width: 72 + extraWidth };
}

export function spareBasketAt(stageIndex, goalsInStage = 0, rulesVersion = 2) {
  if (stageIndex === 0) {
    const x = rulesVersion === 1 || goalsInStage === 0 ? 482 : 605;
    return { ...SPARE_BASKET, x };
  }
  return rulesVersion === 1 ? SPARE_BASKET : { ...SPARE_BASKET, x: 720 };
}

// A reproducible good line for optional hints, accounting for the cart's
// position when the egg lands and for both legs of a spring shot.
export function guide(stageIndex, phaseSeconds, misses = 0, goalsInStage = 0, rulesVersion = 2) {
  assertStage(stageIndex);
  const phase = clamp(phaseSeconds, 0, 600);
  let vx, vy;
  if (stageIndex === 1) {
    const springX = CUSHION.x + CUSHION.width * 0.45;
    const springY = CUSHION.y - EGG_RADIUS;
    const basket = basketAt(stageIndex, phase, misses, goalsInStage, rulesVersion);
    const returnTime = (SPRING_SPEED + Math.sqrt(SPRING_SPEED ** 2 + 2 * GRAVITY * (basket.y - springY))) / GRAVITY;
    vx = (basket.x - springX) / returnTime;
    const firstLeg = (springX - LAUNCH.x) / vx;
    vy = (springY - LAUNCH.y) / firstLeg - GRAVITY * firstLeg / 2;
  } else {
    const flightTime = stageIndex === 0 ? 1.15 : 1.25;
    const basket = basketAt(stageIndex, phase + flightTime, misses, goalsInStage, rulesVersion);
    vx = (basket.x - LAUNCH.x) / flightTime;
    vy = (basket.y - LAUNCH.y) / flightTime - GRAVITY * flightTime / 2;
  }
  return { vx: Math.round(vx), vy: Math.round(vy), phase };
}

// Fixed-step physics is shared by the canvas player and reward verifier.
// Samples include the moving landing position while a captured egg settles.
export function simulateShot(stageIndex, shot, misses = 0, goalsInStage = 0, rulesVersion = 2) {
  assertStage(stageIndex);
  if (!isValidShot(shot)) throw new RangeError('Shot is outside the playable range');
  const frames = [{ ...LAUNCH, t: 0 }];
  const events = [];
  const spare = spareBasketAt(stageIndex, goalsInStage, rulesVersion);
  const freeRoute = stageIndex === 1 && rulesVersion >= 2;
  let { vx, vy } = shot;
  let { x, y } = LAUNCH;
  let banked = false;
  let hit = false;
  let groundBounces = 0;
  let spareUsed = false;
  let denied = false;
  let time = 0;
  let lastRimAt = -1;
  const floor = WORLD.floorY - EGG_RADIUS;
  const event = type => events.push({ type, t: time, x, y });

  for (let step = 1; step <= 720; step++) {
    time = step * DT;
    const oldX = x, oldY = y;
    x += vx * DT;
    y += vy * DT + GRAVITY * DT * DT / 2;
    vy += GRAVITY * DT;
    const basket = basketAt(stageIndex, shot.phase + time, misses, goalsInStage, rulesVersion);

    if (stageIndex === 1) {
      const springTop = CUSHION.y - EGG_RADIUS;
      if (oldY <= springTop && y >= springTop && vy > 0
          && x >= CUSHION.x && x <= CUSHION.x + CUSHION.width) {
        y = springTop;
        vy = -SPRING_SPEED;
        banked = true;
        event('cushion');
      }
      const left = WALL.x - EGG_RADIUS, right = WALL.x + WALL.width + EGG_RADIUS;
      const top = WALL.y - EGG_RADIUS;
      if (x > left && x < right && y > top) {
        if (oldY <= top && vy > 0) {
          y = top;
          vy = -Math.max(60, Math.abs(vy) * 0.43);
          vx *= 0.75;
        } else {
          const fromLeft = oldX <= left || (oldX < right && vx > 0);
          x = fromLeft ? left : right;
          vx = (fromLeft ? -1 : 1) * Math.abs(vx) * 0.56;
        }
        event('wall');
      }
    }

    if (oldY <= basket.y && y >= basket.y && vy > 0
        && Math.abs(x - basket.x) <= basket.width / 2 - EGG_RADIUS * 0.6) {
      if (freeRoute || (!groundBounces && !spareUsed && (stageIndex !== 1 || banked))) {
        hit = true;
        event('goal');
        frames.push({ x, y: basket.y, t: time });
        const startX = x, startTime = time;
        for (let i = 1; i <= 23; i++) {
          time = startTime + i / 60;
          const p = i / 23, target = basketAt(stageIndex, shot.phase + time, misses, goalsInStage, rulesVersion);
          frames.push({
            x: startX * (1 - p) + target.x * p,
            y: target.y + 18 * (1 - (1 - p) ** 2) + Math.sin(p * 2 * Math.PI) * 4,
            t: time,
          });
        }
        break;
      }
      if (rulesVersion === 1 && stageIndex === 1 && !banked && !denied) {
        vy = -Math.abs(vy) * 0.47;
        vx = Math.abs(vx) * 0.66;
        denied = true;
        event('needs-cushion');
      }
    }

    if (oldY <= spare.y && y >= spare.y && vy > 0 && !spareUsed
        && Math.abs(x - spare.x) < spare.width / 2 + 2) {
      vy = -Math.max(155, Math.abs(vy) * 0.67);
      vx *= 0.23;
      y = spare.y - 1;
      spareUsed = true;
      event('spare');
    }

    // A graze has a softer rebound than the bright trampoline. Debouncing
    // prevents jitter while the center is still close to a basket handle.
    if (time - lastRimAt > 0.1 && !hit) {
      const rim = basket.x + (x < basket.x ? -1 : 1) * basket.width / 2;
      const dx = x - rim, dy = y - basket.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < EGG_RADIUS + 2 && (vx * dx + vy * dy) < 0) {
        const nx = dx / d, ny = dy / d;
        const normalSpeed = vx * nx + vy * ny;
        vx -= 1.45 * normalSpeed * nx;
        vy -= 1.45 * normalSpeed * ny;
        x = rim + (EGG_RADIUS + 2) * nx;
        y = basket.y + (EGG_RADIUS + 2) * ny;
        lastRimAt = time;
        event('rim');
      }
    }
    if (x < EGG_RADIUS || x > WORLD.width - EGG_RADIUS) {
      x = clamp(x, EGG_RADIUS, WORLD.width - EGG_RADIUS);
      vx = -vx * 0.45;
    }
    let rest = false;
    if (y >= floor && vy > 0) {
      y = floor;
      vy *= -0.4;
      vx *= 0.62;
      groundBounces++;
      event('ground');
      rest = groundBounces >= 3 || Math.abs(vy) < 44;
    }
    if (step % 2 === 0 || rest || step === 720) frames.push({ x, y, t: time });
    if (rest) break;
  }
  return { hit, banked, frames, events, duration: time };
}
