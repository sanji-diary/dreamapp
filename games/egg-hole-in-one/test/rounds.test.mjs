import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server.mjs';
import { gameApi, isCompleteRound } from '../rounds.mjs';
import { guide, simulateShot } from '../public/physics.mjs';

const win = () => [0,0,1,1,2].map((stage,index) => guide(stage,index * 1.2,0,index % 2));
const miss = {vx:45,vy:-60,phase:0};

test('verified replay retains goals, applies bounded miss aid and requires all three courses', () => {
  assert.equal(isCompleteRound(win()), true);
  assert.equal(isCompleteRound(win().slice(1)), false);
  assert.equal(isCompleteRound([{hit:true}, ...win()]), false);
  assert.equal(isCompleteRound([...win(), miss]), false);
  for (const s of [0,1,2]) assert.equal(simulateShot(s,miss).hit,false);
  const helped = win().flatMap(shot => [miss,miss,shot]);
  assert.equal(isCompleteRound(helped), true);
});

test('finish is scoped to its ticket, is retry-safe, and returns one stable identifier', async t => {
  const store = openStore(':memory:');
  t.after(()=>store.close());
  const post = (path,value) => gameApi(new Request('http://localhost'+path,{
    method:'POST',body:JSON.stringify(value)
  }),store);
  const {roundId,token,rulesVersion} = await (await post('/api/rounds',{rulesVersion:2})).json();
  assert.equal(rulesVersion,2);
  const finish = '/api/rounds/'+roundId+'/finish';
  assert.equal((await post(finish,{token:'0'.repeat(64),shots:win()})).status,403);
  assert.equal((await post(finish,{token,shots:[] } )).status,422);
  assert.equal((await post(finish,{token,shots:[{vx:0,vy:0,phase:0}]})).status,422);
  const attempts = await Promise.all([1,2,3].map(async()=> (await post(finish,{token,shots:win()})).json()));
  assert.deepEqual(attempts[0],attempts[1]);
  assert.deepEqual(attempts[0],attempts[2]);
  assert.equal(attempts[0].verified,true);
  assert.equal(attempts[0].roundId,roundId);
  assert.deepEqual((await (await post('/api/results/verify',{launchSecret:'f'.repeat(64)})).json()).results,[]);
  assert.equal((await post('/api/rounds',{launchId:'incorrect'})).status,400);
  assert.equal((await post('/api/rounds',{rulesVersion:9})).status,400);
});

test('rounds started before the course update can finish under their saved rules', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'egg-migration-'));
  const filename = join(directory, 'old-game.sqlite');
  const legacyId = randomUUID();
  const token = 'ab'.repeat(32);
  const tokenHash = createHash('sha256').update(Buffer.from(token,'hex')).digest('hex');
  const legacy = new DatabaseSync(filename);
  legacy.exec(readFileSync(new URL('../drizzle/0000_egg_rounds.sql', import.meta.url),'utf8'));
  legacy.exec("CREATE TABLE local_migrations(tag TEXT PRIMARY KEY); INSERT INTO local_migrations VALUES ('0000_egg_rounds')");
  legacy.prepare('INSERT INTO egg_rounds(round_id,token_hash,expires_at) VALUES(?,?,?)')
    .run(legacyId,tokenHash,Date.now()+60_000);
  legacy.close();
  const store = openStore(filename);
  // Shots recorded on the original course, before the second basket started moving.
  const oldShots = [[246,-403],[246,-403],[206,-319],[206,-319],[345,-441]]
    .map(([vx,vy],phase)=>({vx,vy,phase}));
  const post = (path,body) => gameApi(new Request('http://localhost'+path,{
    method:'POST',body:JSON.stringify(body)
  }),store);
  try {
    const finishPath = '/api/rounds/'+legacyId+'/finish';
    assert.equal((await post(finishPath,{token,shots:oldShots})).status,200);
    assert.equal((await (await post('/api/rounds',{})).json()).rulesVersion,1);
    const next = await (await post('/api/rounds',{rulesVersion:2})).json();
    const attempt = await post('/api/rounds/'+next.roundId+'/finish',{
      token:next.token,shots:oldShots,rulesVersion:1
    });
    assert.equal(attempt.status,422);
  } finally { store.close(); rmSync(directory,{recursive:true,force:true}); }
});

