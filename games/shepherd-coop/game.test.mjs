import test from 'node:test';
import assert from 'node:assert/strict';
import {roomApi} from './rooms.mjs';
import {createGame,startGame,stepGame,MAP} from './engine.mjs';

test('two names, two start votes, five-minute deadline, same-room replay', async () => {
  const records = new Map();
  const store = {
    clean() {},
    create(code, room) { records.set(code,{room,revision:0}); return true; },
    read(code) { return structuredClone(records.get(code)); },
    write(code,revision,room) {
      if(records.get(code).revision!==revision) return false;
      records.set(code,{room,revision:revision+1}); return true;
    }
  };
  async function api(path,body) {
    const response = await roomApi(new Request('http://localhost/api/rooms'+path,{
      method:'POST',body:JSON.stringify(body)
    }),store);
    return {status:response.status,...await response.json()};
  }
  const a = await api('',{deviceId:'device-alpha',name:'지민'});
  const prefix = '/'+a.room;
  const b = await api(prefix+'/join',{deviceId:'device-bravo',name:'시우'});
  const sync = (ticket,body={}) => api(prefix+'/sync',{token:ticket.token,round:1,...body});
  assert.equal(a.state.status,'waiting');
  assert.deepEqual(b.state.names,['지민','시우']);
  assert.equal((await api(prefix+'/join',{deviceId:'device-third',name:'새봄'})).status,409);
  assert.equal((await sync(a,{ready:true})).state.status,'ready');
  assert.equal((await sync(b,{ready:true})).state.status,'playing');
  const row = records.get(a.room);
  row.room.game.startedAt -= 300001;
  assert.equal((await sync(a)).state.status,'lost');
  assert.equal((await sync(a,{replay:true})).state.status,'lost');
  const replay = (await sync(b,{replay:true})).state;
  assert.equal(replay.status,'ready');
  assert.equal(replay.round,2);
  assert.equal(replay.savedCount,0);
  assert.equal(replay.remainingMs,300000);
  assert.equal(replay.sheep.length,6);
  // Delayed requests from the old round cannot ready the new one.
  assert.deepEqual((await sync(a,{ready:true})).state.ready,[false,false]);
  const next = (ticket,body) => sync(ticket,{...body,round:2});
  await next(a,{ready:true});
  await next(b,{ready:true});
  const finishing = records.get(a.room).room;
  for(const [i,sheep] of finishing.game.sheep.entries()) {
    Object.assign(sheep,{x:MAP.shepherd.x+((i%3)-1)*20,y:MAP.shepherd.y+(i<3?9:27),helpers:3});
  }
  finishing.updated -= 40;
  assert.equal((await next(a,{})).state.status,'won');
  assert.equal((await next(b,{})).state.savedCount,6);
  await next(a,{replay:true});
  assert.equal((await next(b,{replay:true})).state.round,3);
});

test('the sixth sheep can only finish after the second dog helps', () => {
  const now = Date.now();
  const game = createGame(now);
  startGame(game,now);
  const goal = MAP.shepherd;
  for (const [i,sheep] of game.sheep.entries()) {
    Object.assign(sheep,{x:goal.x+5+i*3,y:goal.y+4,helpers:i===5?1:3});
  }
  const inputs = [{dx:0,dy:0,bark:false},{dx:0,dy:0,bark:false}];
  let t = now;
  const ticks = count => {for(let i=0;i<count;i++) stepGame(game,inputs,40,t+=40);};
  ticks(250);
  assert.equal(game.savedCount,5);
  assert.equal(game.status,'playing');
  Object.assign(game.players[1],{x:game.sheep[5].x+10,y:game.sheep[5].y});
  inputs[1].bark = true;
  ticks(1);
  inputs[1].bark = false;
  ticks(300);
  assert.equal(game.status,'won');
  assert.equal(game.savedCount,6);
});
