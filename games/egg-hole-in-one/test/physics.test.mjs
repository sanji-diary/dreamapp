import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basketAt, guide, isValidShot, LAUNCH, LIMITS, simulateShot, spareBasketAt, STAGES } from '../public/physics.mjs';

test('every course has a reachable repeatable hint, throughout the cart cycle', () => {
  assert.deepEqual(STAGES.map(stage => stage.target), [2, 2, 1]);
  for (const [stage, goals] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]) {
    for (const misses of [0, 2]) {
      for (const phase of [0, 0.45, 1.4, 2.3, 2.8, 3.24, 4.2, 5.44, 18, 599.2, 600]) {
        const shot = guide(stage, phase, misses, goals);
        assert.ok(isValidShot(shot));
        const result = simulateShot(stage, shot, misses, goals);
        assert.equal(result.hit, true);
        assert.equal(result.banked, stage === 1);
        assert.deepEqual(result.frames[0], { ...LAUNCH, t: 0 });
        assert.equal(result.frames.at(-1).t, result.duration);
        assert.deepEqual(simulateShot(stage, shot, misses, goals), result);
      }
    }
  }
});

test('nearby aim and force values score without pixel-perfect gestures', () => {
  for (const [stage, goals] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]) {
    const shot = guide(stage, 0, 0, goals);
    let wins = 0;
    for (let dx = -20; dx <= 20; dx += 5) {
      for (let dy = -30; dy <= 30; dy += 5) {
        if (simulateShot(stage, { ...shot, vx: shot.vx + dx, vy: shot.vy + dy }, 0, goals).hit) wins++;
      }
    }
    assert.ok(wins >= 60, 'Over half of 117 neighboring shots should score on course ' + stage);
  }
});

test('either spring-basket target accepts an arc over the wall or a spring shot', () => {
  for (const [goals, vx, vy] of [[0, 313, -486], [1, 381, -499]]) {
    const direct = simulateShot(1, { vx, vy, phase: 0 }, 0, goals);
    assert.equal(direct.hit, true);
    assert.equal(direct.banked, false);
    assert.deepEqual(direct.events.map(event => event.type), ['goal']);
    const bank = simulateShot(1, guide(1, 0, 0, goals), 0, goals);
    assert.deepEqual(bank.events.map(event => event.type), ['cushion', 'goal']);
  }
  const wall = simulateShot(1, { vx: 360, vy: -255, phase: 0 });
  assert.equal(wall.hit, false);
  assert.equal(wall.events[0].type, 'wall');
});

test('a rebound may score only when it actually reaches the flagged basket', () => {
  const shot = { vx: 434, vy: -560, phase: 0 };
  const miss = simulateShot(1, shot);
  assert.equal(miss.hit, false);
  assert.equal(miss.events[0].type, 'spare');
  const rebound = simulateShot(1, shot, 0, 1);
  assert.equal(rebound.hit, true);
  assert.equal(rebound.banked, false);
  assert.deepEqual(rebound.events.map(event => event.type), ['spare', 'goal']);
  const offWall = simulateShot(1, { vx: 202, vy: -556, phase: 0 });
  assert.deepEqual(offWall.events.map(event => event.type), ['wall', 'goal']);
});

test('second targets need a fresh aim and keep clear of the spare', () => {
  for (const stage of [0, 1]) {
    const first = basketAt(stage, 0);
    const second = basketAt(stage, 0, 2, 1);
    assert.ok(second.x - first.x > (second.width + first.width) / 2);
    const spare = spareBasketAt(stage, 1);
    assert.ok(spare.x - second.x > (spare.width + second.width) / 2);
    assert.equal(simulateShot(stage, guide(stage, 0), 0, 1).hit, false);
  }
});

test('legacy rounds keep fixed basket positions, the old cart and bank requirement', () => {
  assert.deepEqual(basketAt(0, 0, 0, 1, 1), { x: 385, y: 343, width: 96 });
  assert.deepEqual(basketAt(1, 0, 0, 1, 1), { x: 605, y: 327, width: 90 });
  assert.deepEqual(basketAt(2, 1.4, 0, 0, 1), { x: 625, y: 331, width: 92 });
  const straight = simulateShot(1, { vx: 400, vy: -450, phase: 0 }, 0, 1, 1);
  assert.equal(straight.hit, false);
  assert.deepEqual(straight.events.slice(0, 2).map(event => event.type), ['needs-cushion', 'spare']);
  for (const n of [0, 1]) {
    assert.ok(simulateShot(1, { vx: 206, vy: -319, phase: 0 }, 0, n, 1).hit);
  }
});

test('the spare basket bounces a miss and the cart rewards leading it', () => {
  const miss = simulateShot(0, { vx: 330, vy: -400, phase: 0 });
  assert.equal(miss.hit, false);
  assert.ok(miss.events.some(event => event.type === 'spare'));
  const good = guide(2, 0);
  assert.equal(simulateShot(2, good).hit, true);
  assert.equal(simulateShot(2, { ...good, phase: 2.5 }).hit, false);
  assert.deepEqual(basketAt(2, 1.25), { x: 633, y: 331, width: 72 });
  assert.deepEqual(basketAt(2, 3.75), { x: 449, y: 331, width: 72 });
});

test('assistance has one bounded effect and invalid server inputs are rejected', () => {
  assert.equal(basketAt(0, 0, 0).width, basketAt(0, 0, 1).width);
  assert.ok(basketAt(0, 0, 2).width > basketAt(0, 0, 1).width);
  assert.equal(basketAt(0, 0, 2).width, basketAt(0, 0, 10000).width);
  const legal = { vx: LIMITS.minVx, vy: LIMITS.minVy, phase: 0 };
  assert.ok(isValidShot(legal));
  for (const bad of [null, {}, { ...legal, phase: 601 }, { ...legal, vx: NaN },
    { ...legal, vx: '200' }, { ...legal, vy: Infinity }, { ...legal, vy: 0 }]) {
    assert.equal(isValidShot(bad), false);
    assert.throws(() => simulateShot(0, bad), RangeError);
  }
  assert.throws(() => simulateShot(3, legal), RangeError);
});
