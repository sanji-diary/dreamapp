import assert from 'node:assert/strict';
import test from 'node:test';
import {createMotion} from './motion.mjs';
import {createGame, moveDog} from './engine.mjs';

test('joystick motion responds before a reply and uses the same fence as the server', () => {
  const motion = createMotion();
  const game = {...createGame(0),round:1,serverTime:0};
  Object.assign(game.players[0],{x:286,y:200});
  motion.receive(game,0,0,0);
  motion.input(1,0,0);
  const first = motion.frame(16).players[0];
  assert.ok(first.x > 286 && first.x < 289);
  for(let t=32;t<=240;t+=16) {
    const pose = motion.frame(t).players[0];
    assert.ok(pose.x < 295);
  }
  motion.input(0,0,240);
  assert.equal(motion.frame(260).players[0].x,motion.frame(550).players[0].x);
  motion.reset();
  assert.equal(motion.frame(560),undefined);
});

test('remote motion continues between irregular snapshots', () => {
  const motion = createMotion();
  const game = {...createGame(0),round:1,serverTime:0,movement:[{dx:0,dy:0},{dx:1,dy:0}]};
  motion.receive(structuredClone(game),0,0,0);
  let next = 0, lastX = 0;
  for(let t=16;t<=1648;t+=16) {
    moveDog(game.players[1],game.movement[1],.016);
    if(t>=next) {
      game.serverTime=t;
      motion.receive(structuredClone(game),0,t-10,t);
      next=t+(t%3===0?210:145);
    }
    const x=motion.frame(t).players[1].x;
    if(t>480) assert.ok(x>lastX && x-lastX<4,'peer should advance every frame');
    lastX=x;
  }
});
