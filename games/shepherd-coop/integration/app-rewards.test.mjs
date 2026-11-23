import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRewardAdapter, GAME_ID} from './app-rewards.mjs';

const gameOrigin = 'https://game.example';
const makeResult = (roundId, player) => ({
  resultId:roundId + ':' + player, roundId, completedAt:Date.now(), savedCount:6
});

function verifiedGame(results, calls=[]) {
  return async (url, request) => {
    assert.equal(url.href,gameOrigin+'/api/results/verify');
    assert.equal(request.method,'POST');
    assert.equal(request.redirect,'error');
    const body = JSON.parse(request.body);
    assert.match(body.launchSecret,/^[a-f0-9]{64}$/);
    const launch = createHash('sha256').update(Buffer.from(body.launchSecret,'hex')).digest('hex');
    calls.push(launch);
    const matches = (results.get(launch) || []).filter(r => !body.roundId || r.roundId===body.roundId);
    return Response.json({gameId:GAME_ID, results:matches});
  };
}

test('launch binds a private server secret to the signed-in member; two partners get independent credits',async t=>{
  const database = new DatabaseSync(':memory:');
  t.after(()=>database.close());
  const results = new Map(), calls = [];
  const app = createRewardAdapter({database, gameOrigin, fetchImpl:verifiedGame(results,calls)});
  const a=app.createLaunch('first','https://app.example');
  const b=app.createLaunch('second');
  assert.deepEqual(Object.keys(a).sort(),['gameUrl','launchId']);
  assert.match(a.launchId,/^[a-f0-9]{64}$/);
  assert.notEqual(b.launchId,a.launchId);
  const url=new URL(a.gameUrl), fragment=new URLSearchParams(url.hash.slice(1));
  assert.equal(url.origin,gameOrigin);
  assert.equal(fragment.get('launch'),a.launchId);
  assert.equal(fragment.get('parentOrigin'),'https://app.example');
  assert.deepEqual([...fragment.keys()],['launch','parentOrigin']);
  await assert.rejects(app.collectRewards('second',a.launchId),{status:404});
  assert.equal(calls.length,0);
  assert.equal((await app.collectRewards('first',a.launchId)).status,'pending');
  results.set(a.launchId,[makeResult('round-1','p1')]);
  results.set(b.launchId,[makeResult('round-1','p2')]);
  const attempts=await Promise.all(Array.from({length:6},()=>app.collectRewards('first',a.launchId,'round-1')));
  assert.equal(attempts.reduce((sum,r)=>sum+r.awardedDrops,0),1);
  assert.equal(attempts.filter(r=>r.status==='already_awarded').length,5);
  assert.deepEqual(await app.collectRewards('second',b.launchId),{status:'awarded',awardedDrops:1,balance:1});
  results.get(a.launchId).push(makeResult('round-2','p1'));
  assert.deepEqual(await app.collectRewards('first',a.launchId),{status:'awarded',awardedDrops:1,balance:2});
  assert.equal(app.getBalance('second'),1);

  // The same logged-in member cannot collect two slots from the same match and round.
  const otherDevice=app.createLaunch('first');
  results.set(otherDevice.launchId,[makeResult('round-1','other-slot')]);
  assert.deepEqual(await app.collectRewards('first',otherDevice.launchId),{status:'already_awarded',awardedDrops:0,balance:2});
  assert.deepEqual(new Set(app.listLaunchIds('first')),new Set([a.launchId,otherDevice.launchId]));
  assert.deepEqual(app.listLaunchIds('second'),[b.launchId]);
});

test('missed completion events recover across application restart; wallet and ledger roll back together',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'shepherd-wallet-test-'));
  const file=join(folder,'wallet.sqlite');
  const results=new Map();
  let database=new DatabaseSync(file);
  try {
    let app=createRewardAdapter({database,gameOrigin,fetchImpl:verifiedGame(results),dropsPerWin:3});
    const {launchId}=app.createLaunch('member');
    results.set(launchId,[makeResult('one','p1')]);
    database.close();
    database=new DatabaseSync(file);
    app=createRewardAdapter({database,gameOrigin,fetchImpl:verifiedGame(results),dropsPerWin:3});
    assert.deepEqual(app.listLaunchIds('member'),[launchId]);
    database.exec("CREATE TRIGGER fail_wallet BEFORE INSERT ON shepherd_app_wallets BEGIN SELECT RAISE(ABORT,'simulate write failure'); END");
    await assert.rejects(app.collectRewards('member',launchId),/simulate write failure/);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM shepherd_app_reward_ledger').get().n,0);
    database.exec('DROP TRIGGER fail_wallet');
    assert.equal((await app.collectRewards('member',launchId)).balance,3);
    assert.equal((await app.collectRewards('member',launchId)).awardedDrops,0);
  } finally {
    database.close();
    rmSync(folder,{recursive:true,force:true});
  }
});

test('paginated verification finishes before wallet credit and failed verification can be retried',async t=>{
  const database=new DatabaseSync(':memory:');
  t.after(()=>database.close());
  let action='offline';
  const cursors=[];
  const app=createRewardAdapter({database,gameOrigin,fetchImpl:async (url,request)=>{
    const {after}=JSON.parse(request.body);
    cursors.push(after);
    if(after===0) return Response.json({gameId:GAME_ID,results:[makeResult('r1','p1')],nextCursor:83});
    if(action==='offline') return new Response('unavailable',{status:503});
    const result=makeResult('r2','p1');
    if(action==='incomplete') result.savedCount=5;
    return Response.json({gameId:GAME_ID,results:[result]});
  }});
  const {launchId}=app.createLaunch('member');
  await assert.rejects(app.collectRewards('member',launchId),{status:502});
  action='incomplete';
  await assert.rejects(app.collectRewards('member',launchId),{status:502});
  assert.equal(app.getBalance('member'),0);
  action='ok';
  assert.equal((await app.collectRewards('member',launchId)).balance,2);
  assert.deepEqual(cursors,[0,83,0,83,0,83]);
});
