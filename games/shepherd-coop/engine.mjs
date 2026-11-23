export const MAP = {
  width: 960,
  height: 600,
  bounds: { left: 24, top: 24, right: 936, bottom: 576 },
  walls: [
    { x: 304, y: 24, w: 27, h: 372 },
    { x: 590, y: 206, w: 27, h: 370 },
  ],
  dogs: [{ x: 104, y: 450 }, { x: 243, y: 451 }],
  lures: [{ x: 241, y: 470, radius: 86 }, { x: 500, y: 184, radius: 89 }],
  sheep: [
    { x: 116, y: 156 }, { x: 180, y: 168 }, { x: 241, y: 187 },
    { x: 132, y: 243 }, { x: 217, y: 264 }, { x: 246, y: 360 },
  ],
  shepherd: { x: 812, y: 130, callRadius: 124, safeRadius: 34 },
  barkRadius: 95,
  barkCooldownMs: 650,
  durationMs: 300_000,
  quietNeededMs: 850,
};

const DOG_SPEED = 124;
const DOG_RADIUS = 10;
const SHEEP_RADIUS = 13;
const FOLLOW_SPEED = 45;
const BOTH_HELPERS = 0b11;

export function createGame(now = Date.now()) {
  return {
    status: 'waiting',
    flockSeed: Math.floor(now) % 997,
    players: MAP.dogs.map(({ x, y }, index) => ({
      id: `p${index + 1}`,
      x,
      y,
      heading: -Math.PI / 2,
      barkAt: null,
    })),
    sheep: MAP.sheep.map(({ x, y }, index) => ({
      id: `s${index + 1}`,
      x,
      y,
      heading: Math.PI / 5 + index * Math.PI / 7,
      mode: 'graze',
      modeAt: now,
      vx: 0,
      vy: 0,
      helpers: 0,
      fleeUntil: 0,
      fleeX: 0,
      fleeY: 0,
    })),
    elapsedMs: 0,
    remainingMs: MAP.durationMs,
    savedCount: 0,
    quietMs: MAP.quietNeededMs,
    quietUntil: null,
    startedAt: null,
    wonAt: null,
    lostAt: null,
    updatedAt: now,
  };
}

export function startGame(state, now = Date.now()) {
  if (state.status === 'waiting') {
    state.status = 'playing';
    state.startedAt = now;
    state.updatedAt = now;
  }
  return state;
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function walkable(x, y, radius) {
  return MAP.walls.every((wall) => {
    const nearestX = clamp(x, wall.x, wall.x + wall.w);
    const nearestY = clamp(y, wall.y, wall.y + wall.h);
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 >= radius ** 2;
  });
}

function move(actor, dx, dy, radius) {
  const { left, top, right, bottom } = MAP.bounds;
  const x = clamp(actor.x + dx, left + radius, right - radius);
  if (walkable(x, actor.y, radius)) actor.x = x;
  const y = clamp(actor.y + dy, top + radius, bottom - radius);
  if (walkable(actor.x, y, radius)) actor.y = y;
}

export function slideDog(dog, dx, dy) {
  move(dog, dx, dy, DOG_RADIUS);
}

export function moveDog(dog, input, dt) {
  const dx = Number.isFinite(input?.dx) ? input.dx : 0;
  const dy = Number.isFinite(input?.dy) ? input.dy : 0;
  const strength = Math.hypot(dx, dy);
  if (strength === 0) return;

  dog.heading = Math.atan2(dy, dx);
  const distance = (DOG_SPEED * dt) / Math.max(1, strength);
  slideDog(dog, dx * distance, dy * distance);
}

function isInCall(sheep) {
  const { x, y, callRadius } = MAP.shepherd;
  return Math.hypot(sheep.x - x, sheep.y - y) <= callRadius;
}

export function slideSheep(sheep, dx, dy) {
  move(sheep, dx, dy, SHEEP_RADIUS);
}

function setMode(sheep, mode, now) {
  if (sheep.mode !== mode) sheep.modeAt = now;
  sheep.mode = mode;
}

// Sheep on opposite sides of a fence can't see a flock mate running.
function canSee(a, b) {
  for (const wall of MAP.walls) {
    let enter = 0, exit = 1;
    for (const [origin, end, low, size] of [[a.x,b.x,wall.x,wall.w],[a.y,b.y,wall.y,wall.h]]) {
      const delta = end - origin;
      if (Math.abs(delta) < 0.001) {
        if (origin < low || origin > low + size) { exit = -1; break; }
      } else {
        const near = (low - origin) / delta, far = (low + size - origin) / delta;
        enter = Math.max(enter, Math.min(near, far));
        exit = Math.min(exit, Math.max(near, far));
      }
    }
    if (enter <= exit) return false;
  }
  return true;
}

function prepareWave(state, dog, playerIndex, now) {
  const wave = [];
  for (const sheep of state.sheep) {
    if (sheep.mode === 'safe') continue;
    const dx = sheep.x - dog.x, dy = sheep.y - dog.y;
    const distance = Math.hypot(dx, dy);
    if (distance > MAP.barkRadius || !canSee(dog, sheep)) continue;
    sheep.helpers |= 1 << playerIndex;
    if (isInCall(sheep)) continue;
    wave.push({sheep, hop:0, at:now + 28 + distance * 3.25,
      dx:distance > .01 ? dx/distance : Math.cos(dog.heading),
      dy:distance > .01 ? dy/distance : Math.sin(dog.heading)});
  }

  // Each sheep reacts once to this bark. A second rank copies the movement
  // it sees; only the dogs' own voices count toward the cooperative rescue.
  const reached = new Set(wave.map(node => node.sheep.id));
  while (wave.length) {
    wave.sort((a,b) => b.at-a.at);
    const leader = wave.pop();
    const direct = leader.hop === 0;
    if (!direct && (leader.sheep.moodUntil > leader.at || leader.sheep.directUntil > leader.at)) continue;
    const reactions = leader.sheep.reactions ?? [];
    if (direct || !reactions.some(r => r.direct)) {
      const pending = direct ? reactions.filter(r => r.direct) : reactions;
      pending.push({at:leader.at,dx:leader.dx,dy:leader.dy,direct, dog:playerIndex});
      leader.sheep.reactions = pending.sort((a,b) => a.at-b.at).slice(0,3);
    }
    if (leader.hop === 2) continue;
    for (const other of state.sheep) {
      if (reached.has(other.id) || other.mode === 'safe' || isInCall(other)) continue;
      const dx = leader.sheep.x-other.x, dy = leader.sheep.y-other.y;
      const gap = Math.hypot(dx,dy);
      if (gap > 68 || !canSee(leader.sheep,other)) continue;
      const x = leader.dx + .25*dx/Math.max(gap,1), y = leader.dy + .25*dy/Math.max(gap,1);
      const length = Math.hypot(x,y);
      wave.push({sheep:other,hop:leader.hop+1,at:leader.at+135+gap*2.6,dx:x/length,dy:y/length});
      reached.add(other.id);
    }
  }
}

function bark(state, playerIndex, now) {
  const dog = state.players[playerIndex];
  if (dog.barkAt !== null && now - dog.barkAt < MAP.barkCooldownMs) return;
  dog.barkAt = now;

  const { x, y, callRadius } = MAP.shepherd;
  if (Math.hypot(dog.x - x, dog.y - y) <= callRadius + MAP.barkRadius) {
    state.quietUntil = now + MAP.quietNeededMs;
  }

  prepareWave(state, dog, playerIndex, now);
}

function follow(sheep, index, dt, now) {
  const { x, y } = MAP.shepherd;
  const targetX = x + ((index % 3) - 1) * 20;
  const targetY = y + (index < 3 ? 9 : 27);
  const dx = targetX - sheep.x;
  const dy = targetY - sheep.y;
  const distance = Math.hypot(dx, dy);
  const step = FOLLOW_SPEED * dt;

  if (distance <= Math.max(step, 1)) {
    sheep.x = targetX;
    sheep.y = targetY;
    setMode(sheep, 'safe', now);
    return;
  }

  setMode(sheep, 'follow', now);
  sheep.heading = Math.atan2(dy, dx);
  move(sheep, (dx / distance) * step, (dy / distance) * step, SHEEP_RADIUS);
}

function steer(sheep, x, y, speed, dt) {
  const length = Math.hypot(x,y) || 1;
  const gain = 1 - Math.exp(-dt * (sheep.mode === 'flee' ? 13 : 6));
  const dx = (sheep.vx || 0) + (x/length*speed - (sheep.vx || 0))*gain;
  const dy = (sheep.vy || 0) + (y/length*speed - (sheep.vy || 0))*gain;
  const oldX = sheep.x, oldY = sheep.y;
  slideSheep(sheep, dx*dt, dy*dt);
  if (sheep.mode === 'flee') {
    if (Math.abs(sheep.x-oldX)+.01 < Math.abs(dx*dt)*.5) sheep.fleeX *= -.45;
    if (Math.abs(sheep.y-oldY)+.01 < Math.abs(dy*dt)*.5) sheep.fleeY *= -.45;
  }
}

function graze(sheep, index, state, dt, now) {
  let x = 0, y = 0, count = 0;
  for (const mate of state.sheep) {
    if (mate === sheep || isInCall(mate)) continue;
    const dx = mate.x-sheep.x, dy = mate.y-sheep.y;
    if (Math.hypot(dx,dy) > 160 || !canSee(sheep,mate)) continue;
    x += dx; y += dy; count++;
  }
  if (count) { x /= count; y /= count; }
  // The phase is personal and stable over network retries. Sheep take turns
  // cropping a mouthful and stepping toward the nearest patch of their flock.
  const beat = state.elapsedMs / (3600 + index*190) + index*.347 + ((state.flockSeed || 0) % 31)/31;
  if (beat % 1 < .50 || (Math.hypot(x,y) < 20 && beat%1 < .7)) {
    setMode(sheep,'graze',now);
    steer(sheep,0,0,0,dt);
    return;
  }
  const angle = Math.floor(beat)*2.39996 + index*2.113;
  setMode(sheep,'amble',now);
  steer(sheep,x + 22*Math.cos(angle), y + 22*Math.sin(angle), Math.hypot(x,y)>45 ? 11 : 6,dt);
}

function noticeDistraction(sheep,index,now) {
  for (const [i,lure] of MAP.lures.entries()) {
    const bit = 1 << i;
    if ((index+i)%3 === 1) continue;
    if (Math.hypot(sheep.x-lure.x,sheep.y-lure.y)>lure.radius || !canSee(sheep,lure)) continue;
    if (sheep.visited & bit) {
      // A particularly curious sheep may double back once if the dogs have
      // left it close enough to the flowers, even after the first successful bark.
      if ((index+i)%3 || (sheep.revisited & bit) || sheep.lureAgainAt > now) continue;
      sheep.revisited = (sheep.revisited || 0) | bit;
    } else {
      sheep.visited = (sheep.visited || 0) | bit;
    }
    sheep.lure = i;
    sheep.moodUntil = now + 5900 + index*230;
    sheep.lureAgainAt = now + 7200 + index*260;
    setMode(sheep,'tempted',now);
    return;
  }
  const firstBend = sheep.x>348 && sheep.x<456 && sheep.y>395;
  const secondBend = sheep.x>618 && sheep.x<704 && sheep.y<192;
  const bit = firstBend ? 4 : secondBend ? 8 : 0;
  if ((index+(firstBend?0:1))%3 !== 0 && bit && !(sheep.visited & bit)) {
    sheep.visited = (sheep.visited || 0) | bit;
    sheep.moodUntil = now + 3950 + index*150;
    sheep.wanderAngle = sheep.heading + (index%2 ? 1.92 : -1.92);
    setMode(sheep,'confused',now);
  }
}

function moveSheep(sheep, index, state, dt, now) {
  if (sheep.mode === 'safe') return;

  if (isInCall(sheep)) {
    sheep.fleeUntil = 0;
    if (sheep.reactions?.length) sheep.reactions = [];
    if (sheep.helpers === BOTH_HELPERS && state.quietMs >= MAP.quietNeededMs) {
      follow(sheep, index, dt, now);
    } else {
      setMode(sheep, 'graze', now);
    }
    return;
  }

  // Each replay rotates the curious and easily distracted members of the flock.
  const character = (index + (state.flockSeed || 0)) % state.sheep.length;
  if (!(sheep.moodUntil > now)) noticeDistraction(sheep,character,now);
  while (sheep.reactions?.length && sheep.reactions[0].at <= now) {
    const reaction = sheep.reactions.shift();
    if (!reaction.direct && (sheep.moodUntil > now || sheep.directUntil > now)) continue;
    if (reaction.direct) {
      sheep.moodUntil = 0;
      sheep.sameVoice = sheep.lastDog === reaction.dog && now < sheep.voiceUntil
        ? Math.min(3,(sheep.sameVoice || 0)+1) : 1;
      sheep.lastDog = reaction.dog;
      sheep.voiceUntil = now + 4300;
      sheep.directUntil = now + 480;
    }
    sheep.fleeX = reaction.dx;
    sheep.fleeY = reaction.dy;
    sheep.fleeSpeed = reaction.direct ? 53+index%3*2 : 42;
    sheep.cautious = reaction.direct && character%3 !== 0 && sheep.sameVoice >= 3;
    const burst = sheep.cautious ? 448 : 625;
    sheep.fleeUntil = now + (reaction.direct ? burst : 490);
    setMode(sheep,'flee',now);
  }
  if (sheep.moodUntil > now && sheep.mode === 'tempted') {
    const lure = MAP.lures[sheep.lure];
    const dx = lure.x-sheep.x, dy = lure.y-sheep.y;
    steer(sheep,dx,dy,Math.hypot(dx,dy)>5 ? 20 : 0,dt);
  } else if (sheep.moodUntil > now && sheep.mode === 'confused') {
    const angle = sheep.wanderAngle + .35*Math.sin((now-sheep.modeAt)/600);
    steer(sheep,Math.cos(angle),Math.sin(angle),16,dt);
  } else if (now < sheep.fleeUntil) {
    setMode(sheep,'flee',now);
    const taper = clamp((sheep.fleeUntil-now)/120,.25,1);
    steer(sheep,sheep.fleeX,sheep.fleeY,(sheep.fleeSpeed || 53)*taper,dt);
  } else {
    graze(sheep,index,state,dt,now);
  }
}

function separateSheep(sheep, dt) {
  for (let index = 0; index < sheep.length; index += 1) {
    const first = sheep[index];
    if (first.mode === 'safe' || isInCall(first)) continue;

    for (let other = index + 1; other < sheep.length; other += 1) {
      const second = sheep[other];
      if (second.mode === 'safe' || isInCall(second)) continue;
      const dx = first.x - second.x;
      const dy = first.y - second.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 21) continue;

      const push = (21 - distance) * dt * 2;
      const escapeX = distance > 0.01 ? dx / distance : 1;
      const escapeY = distance > 0.01 ? dy / distance : 0;
      move(first, escapeX * push, escapeY * push, SHEEP_RADIUS);
      move(second, -escapeX * push, -escapeY * push, SHEEP_RADIUS);
    }
  }
}

export function stepGame(state, inputs = [], dtMs = 50, now = Date.now()) {
  if (state.status !== 'playing') return state;

  state.updatedAt = now;
  state.elapsedMs = clamp(now - state.startedAt, 0, MAP.durationMs);
  state.remainingMs = MAP.durationMs - state.elapsedMs;
  if (state.remainingMs === 0) {
    state.status = 'lost';
    state.lostAt = now;
    return state;
  }

  const dt = clamp(dtMs, 0, 100) / 1000;
  state.players.forEach((dog, index) => moveDog(dog, inputs[index], dt));
  state.players.forEach((_, index) => {
    if (inputs[index]?.bark === true) bark(state, index, now);
  });

  state.quietMs = state.quietUntil === null
    ? MAP.quietNeededMs
    : clamp(MAP.quietNeededMs + now - state.quietUntil, 0, MAP.quietNeededMs);

  const previous = state.sheep.map(s => [s.x,s.y]);
  state.sheep.forEach((sheep, index) => moveSheep(sheep, index, state, dt, now));
  separateSheep(state.sheep, dt);
  if (dt > 0) state.sheep.forEach((s,i) => {
    s.vx = (s.x-previous[i][0])/dt;
    s.vy = (s.y-previous[i][1])/dt;
    if (Math.hypot(s.vx,s.vy)>1.5) s.heading = Math.atan2(s.vy,s.vx);
  });

  state.savedCount = state.sheep.filter((sheep) => sheep.mode === 'safe').length;
  if (state.savedCount === state.sheep.length) {
    state.status = 'won';
    state.wonAt = now;
  }
  return state;
}
