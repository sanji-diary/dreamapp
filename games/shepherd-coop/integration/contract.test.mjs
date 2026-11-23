import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP } from '../engine.mjs';
import { roomApi } from '../rooms.mjs';
import { createLocalStore } from '../server.mjs';
import { createRewardAdapter } from './app-rewards.mjs';
import { createShepherdRoutes } from './app-routes.mjs';

test('app routes verify a real game result and reconcile a missed completion notification',async () => {
  const directory = mkdtempSync(join(tmpdir(),'shepherd-contract-'));
  const game = createLocalStore(directory);
  const wallet = new DatabaseSync(':memory:');
  try {
    const gameOrigin = 'https://game.example';
    const appOrigin = 'https://app.example';
    const fetchGame = (url,options)=>roomApi(new Request(url,options),game);
    const rewards = createRewardAdapter({database:wallet,gameOrigin,fetchImpl:fetchGame});
    // The test harness supplies the authenticated member just as app middleware would.
    const asMember = (id) => createShepherdRoutes({rewards,appOrigin,authenticate:async()=>id});
    const appPost = async (id,action,body={}) => {
      const response = await asMember(id)(new Request(appOrigin+'/api/minigames/shepherd/'+action,{
        method:'POST',headers:{origin:appOrigin},body:JSON.stringify(body)
      }));
      return {code:response.status,...await response.json()};
    };
    const gamePost = async (suffix,body) => {
      const response = await fetchGame(gameOrigin+'/api/rooms'+suffix,{method:'POST',body:JSON.stringify(body)});
      assert.ok(response.ok);
      return response.json();
    };
    const la=await appPost('a','launch'), lb=await appPost('b','launch');
    assert.equal(la.code,201);
    const fromLink = (launch) => new URLSearchParams(new URL(launch.gameUrl).hash.slice(1)).get('launch');
    const a = await gamePost('',{deviceId:'phone-a-01',name:'봄',launchId:fromLink(la)});
    const b = await gamePost('/'+a.room+'/join',{deviceId:'phone-b-02',name:'빛',launchId:fromLink(lb)});
    const sync = (ticket,body={}) => gamePost('/'+a.room+'/sync',{token:ticket.token,...body});
    await sync(a,{ready:true});await sync(b,{ready:true});
    assert.equal((await appPost('a','claim',{launchId:la.launchId})).status,'pending');
    const row = game.read(a.room);
    // Move the fixture to the final tick. Saving the victory still goes through normal game logic.
    for(const [i,sheep] of row.room.game.sheep.entries()) Object.assign(sheep,{
      x:MAP.shepherd.x+((i%3)-1)*20,y:MAP.shepherd.y+(i<3?9:27),helpers:3
    });
    row.room.updated-=40;
    assert.ok(game.write(a.room,row.revision,row.room));
    const {state} = await sync(a);
    assert.equal(state.status,'won');
    const claim = {launchId:la.launchId,roundId:state.roundId};
    assert.equal((await appPost('b','claim',claim)).code,404);
    assert.equal((await appPost('a','claim',claim)).awardedDrops,1);
    assert.equal((await appPost('a','claim',claim)).awardedDrops,0);
    await sync(a,{leave:true});
    assert.deepEqual(await appPost('b','reconcile'),{code:200,awardedDrops:1,balance:1});
    assert.equal((await appPost('b','reconcile')).awardedDrops,0);
  } finally {
    wallet.close();game.close();rmSync(directory,{recursive:true,force:true});
  }
});
