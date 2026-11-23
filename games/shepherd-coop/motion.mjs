import {moveDog, slideDog, slideSheep} from './engine.mjs';

const rest = {dx:0, dy:0};
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

// Keep fence collisions identical to the authoritative simulation, even on slow frames.
function travel(dog, input, ms) {
  while (ms > 0) {
    const step = Math.min(ms, 20);
    moveDog(dog, input, step / 1000);
    ms -= step;
  }
}

function blend(a, b, t) {
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return {...b, x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, heading:a.heading+turn*t};
}

// Ease into a run from grazing using the velocities at both snapshots. Limit
// the tangents on each axis so a sharp turn cannot overshoot an endpoint.
function sheepAxis(start, end, startVelocity, endVelocity, seconds, t) {
  const span = end - start;
  if (!span) return start;
  if (!Number.isFinite(startVelocity) || !Number.isFinite(endVelocity)) return start + t * span;
  const v0 = clamp(startVelocity * seconds / span, 0, 3);
  const v1 = clamp(endVelocity * seconds / span, 0, 3);
  const u = 1-t;
  return start + span * (t*t*(3-2*t) + t*u*(u*v0-t*v1));
}

export function createMotion() {
  let samples = [];
  let changes = [];
  let interval = 155;
  let jitter = 15;
  let receivedAt, paintedAt, localAt, playbackTime, local, target, own;

  function reset() {
    samples = [];
    changes = [];
    interval = 155;
    jitter = 15;
    receivedAt = paintedAt = localAt = playbackTime = local = target = undefined;
  }

  function input(x, y, time) {
    const last = changes.at(-1);
    if (!last || last.dx !== x || last.dy !== y) changes.push({dx:x, dy:y, time});
  }

  function replay(dog, from, until) {
    let command = rest;
    let cursor = from;
    for (const event of changes) {
      if (event.time > until) break;
      if (event.time > cursor) {
        travel(dog, command, event.time - cursor);
        cursor = event.time;
      }
      command = event;
    }
    travel(dog, command, until - cursor);
  }

  function advanceLocal(now) {
    // The server releases a held stick if its player stops sending updates.
    const until = Math.min(now, receivedAt + 700);
    if (until <= localAt) return;
    const dt = until - localAt;
    replay(local, localAt, until);
    replay(target, localAt, until);
    const correction = 1 - Math.exp(-dt / 115);
    slideDog(local, (target.x-local.x)*correction, (target.y-local.y)*correction);
    localAt = until;
  }

  function receive(snap, slot, sent, now) {
    const prev = samples.at(-1);
    if (prev && snap.serverTime < prev.serverTime) return;
    own = slot;
    if (!prev || now-receivedAt > 1000 || snap.round !== prev.round) {
      samples = [];
      local = {...snap.players[own]};
      playbackTime = snap.serverTime - interval;
      paintedAt = localAt = now;
    } else {
      advanceLocal(now);
      const gap = clamp(now - receivedAt, 12, 700);
      jitter += (Math.abs(gap - interval) - jitter) * .14;
      interval += (gap - interval) * .18;
    }
    // Anchor at the acknowledged command. Replay turns and releases that happened
    // while this particular request was travelling, then ease out the difference.
    target = {...snap.players[own]};
    replay(target, Math.max(sent, now-450), now);
    localAt = receivedAt = now;
    while (changes.length > 1 && changes[1].time <= now-800) changes.shift();
    samples.push(snap);
    if(samples.length > 32) samples.shift();
  }

  function frame(now) {
    const latest = samples.at(-1);
    if (!latest) return;
    advanceLocal(now);
    const gap = now - receivedAt;
    const dt = Math.max(0, now - paintedAt);
    paintedAt = now;
    const delay = clamp(interval + 1.2*jitter + 18, 100, 550);
    const desired = latest.serverTime - delay + gap;
    const speed = clamp(1+(desired-playbackTime)/350, .78, 1.22);
    playbackTime = Math.min(latest.serverTime+110, playbackTime + dt*speed);
    while(samples.length>1 && samples[1].serverTime<=playbackTime) samples.shift();
    const a = samples[0], b = samples[1] || a;
    const t = a === b ? 0 : clamp((playbackTime-a.serverTime)/(b.serverTime-a.serverTime),0,1);
    const players = b.players.map((dog,i) => {
      if (i === own) return {...latest.players[i], x:local.x,y:local.y,heading:local.heading};
      const pose = blend(a.players[i],dog,t);
      if (playbackTime>latest.serverTime) travel(pose,latest.movement?.[i] || rest,playbackTime-latest.serverTime);
      return pose;
    });
    const seconds = (b.serverTime - a.serverTime) / 1000;
    const sheep = b.sheep.map((s, i) => {
      const before = a.sheep[i];
      const pose = blend(before, s, t);
      if (s.modeAt > playbackTime && before.mode !== s.mode) pose.mode = before.mode;
      pose.x = sheepAxis(before.x, s.x, before.vx, s.vx, seconds, t);
      pose.y = sheepAxis(before.y, s.y, before.vy, s.vy, seconds, t);
      if (playbackTime > latest.serverTime && s.mode !== 'safe') {
        const ahead = (playbackTime-latest.serverTime)/1000;
        slideSheep(pose, (s.vx || 0)*ahead, (s.vy || 0)*ahead);
      }
      return pose;
    });
    return {...latest, players, sheep};
  }
  return {input,receive,frame,reset};
}
