import assert from 'node:assert/strict';
import test from 'node:test';
import {createGame, startGame, stepGame, MAP} from './engine.mjs';

const start = 1700000000000;
function advance(game, ms, inputs = []) {
  const end = game.updatedAt + ms;
  while (game.updatedAt < end) {
    const dt = Math.min(20, end - game.updatedAt);
    stepGame(game, inputs, dt, game.updatedAt + dt);
    inputs = [];
  }
}

test('near sheep scatter first, neighbors follow without earning a direct bark', () => {
  const game = startGame(createGame(start), start);
  Object.assign(game.players[0], {x:67, y:242});
  const flock = game.sheep;
  for (const [i, s] of flock.entries()) {
    Object.assign(s, i < 3 ? {x:[99,148,193][i], y:242} : {x:745+i*20,y:445});
  }
  const reacted = [];
  for (let t=20;t<=2400;t+=20) {
    advance(game,20,t===20?[{bark:true}]:[]);
    for (let i=0;i<3;i++) {
      if (flock[i].mode === 'flee' && reacted[i] === undefined) reacted[i]=t;
    }
  }
  assert.ok(reacted[0] < reacted[1] && reacted[1] < reacted[2],JSON.stringify(reacted));
  assert.ok(flock[0].x>99);
  assert.equal(flock[0].helpers,1);
  assert.equal(flock[1].helpers,1);
  assert.equal(flock[2].helpers,0);
  assert.equal(flock[3].helpers,0);
});

test('idle sheep graze and walk without barking; serialized rooms resume identically', () => {
  const game = startGame(createGame(start),start);
  const initial = game.sheep.map(s=>({...s}));
  const modes = new Set();
  for(let second=0;second<20;second++) {
    advance(game,1000);
    for(const s of game.sheep) modes.add(s.mode);
  }
  assert.ok(modes.has('graze') && modes.has('amble'));
  assert.ok(game.sheep.some((s,i)=>Math.hypot(s.x-initial[i].x,s.y-initial[i].y)>4));
  assert.ok(game.players.every(p=>p.barkAt===null));
  const restored=JSON.parse(JSON.stringify(game));
  advance(game,1000);
  advance(restored,1000);
  assert.deepEqual(restored.sheep,game.sheep);
  assert.equal(game.remainingMs,MAP.durationMs-21000);
});

test('a direct bark can lead a distracted sheep back immediately', () => {
  for (const [place,mode] of [[MAP.lures[0],'tempted'],[{x:399,y:450},'confused']]) {
    const game = startGame(createGame(start),start);
    for (const [i,s] of game.sheep.entries()) {
      Object.assign(s,{x:place.x+(i%3)*14,y:place.y+Math.floor(i/3)*20});
    }
    advance(game,160);
    const sheep = game.sheep.find(s=>s.mode===mode);
    assert.ok(sheep,'encounter: '+mode);
    Object.assign(game.players[1],{x:sheep.x-30,y:sheep.y});
    advance(game,400,[{}, {bark:true}]);
    assert.equal(sheep.mode,'flee');
    assert.ok(sheep.vx>0);
    assert.equal(sheep.helpers,2);
  }
});
