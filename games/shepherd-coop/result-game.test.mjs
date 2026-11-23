import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {MAP} from './engine.mjs';
import {roomApi} from './rooms.mjs';
import {createLocalStore} from './server.mjs';

function launch() {
  const bytes = randomBytes(32);
  return { secret:bytes.toString('hex'), id:createHash('sha256').update(bytes).digest('hex') };
}

test('verified results belong to a fixed seat and survive retries, rematches and restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(),'shepherd-result-test-'));
  let store = createLocalStore(directory);
  try {
    async function post(path,body) {
      const response = await roomApi(new Request('http://localhost/api/'+path,{method:'POST',body:JSON.stringify(body)}),store);
      return { status:response.status, ...await response.json() };
    }
    const a = launch(), b = launch();
    const first = await post('rooms',{name:'하늘',deviceId:'device-one',launchId:a.id});
    const path = 'rooms/'+first.room;
    const secondBody = {name:'바다',deviceId:'device-two',launchId:b.id};
    assert.equal((await post(path+'/join',{...secondBody,launchId:a.id})).status,409);
    assert.equal((await post(path+'/join',{...secondBody,deviceId:'device-one'})).status,409);
    const second = await post(path+'/join',secondBody);
    assert.equal(second.status,200);
    assert.equal((await post(path+'/join',secondBody)).token, second.token);
    assert.equal(JSON.stringify(second).includes(a.id),false);
    const readResults = (key,fields={}) => post('results/verify',{launchSecret:key, ...fields});
    assert.deepEqual((await readResults(a.secret)).results,[]);
    const sync = (p,fields={}) => post(path+'/sync',{token:p.token,...fields});
    const prepareFinish = async () => {
      await sync(first,{ready:true});
      await sync(second,{ready:true});
      const {revision,room} = store.read(first.room);
      assert.equal(room.game.status,'playing');
      for (const [i,s] of room.game.sheep.entries()) {
        Object.assign(s,{x:MAP.shepherd.x+((i%3)-1)*20,y:MAP.shepherd.y+(i<3?9:27),helpers:3});
      }
      room.updated -= 40;
      assert.ok(store.write(first.room,revision,room));
      const snapshots = await Promise.all([sync(first),sync(second),sync(first)]);
      assert.ok(snapshots.every(s=>s.state.status==='won' && s.state.savedCount===6));
      return snapshots[0].state.roundId;
    };
    const round1 = await prepareFinish();
    const firstResult = (await readResults(a.secret)).results;
    const secondResult = (await readResults(b.secret)).results;
    assert.equal(firstResult.length,1);
    assert.equal(secondResult.length,1);
    assert.equal(firstResult[0].roundId,round1);
    assert.equal(firstResult[0].savedCount,6);
    assert.ok(firstResult[0].completedAt>0);
    assert.notEqual(firstResult[0].resultId,secondResult[0].resultId);
    assert.deepEqual((await readResults(a.id)).results,[]); // Public fragment cannot verify a launch.
    assert.deepEqual((await readResults(launch().secret)).results,[]);
    assert.equal((await readResults('invalid')).status,400);
    assert.equal((await roomApi(new Request('http://localhost/api/results/verify'),store)).status,405);
    await Promise.all([sync(first,{replay:true}),sync(second,{replay:true})]);
    const round2 = await prepareFinish();
    assert.notEqual(round2,round1);
    await sync(first,{leave:true});
    store.clean(Date.now()+1,0);
    assert.equal(store.read(first.room),undefined);
    store.close();
    store = createLocalStore(directory);
    assert.equal((await readResults(a.secret)).results.length,2);
    assert.deepEqual((await readResults(a.secret,{roundId:round1})).results,firstResult);
    assert.deepEqual((await readResults(b.secret,{roundId:round1})).results,secondResult);
  } finally {
    store.close();
    rmSync(directory,{recursive:true,force:true});
  }
});
