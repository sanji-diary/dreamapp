import { createGame, startGame, stepGame } from './engine.mjs';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomLifetime = 45 * 60 * 1000;
const roundLength = 300000;
const resultLifetime = 7 * 24 * 60 * 60 * 1000;
const hexKey = /^[a-f0-9]{64}$/;
const roundPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}:[1-9][0-9]{0,9}$/;
const pageSize = 64;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function member(body, time) {
  if (typeof body.deviceId !== 'string' || !/^[\w-]{8,100}$/.test(body.deviceId)) {
    fail(400, '이 기기의 입장 정보를 확인해 주세요.');
  }
  const name = String(body.name ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 16);
  if (!name) fail(400, '참가할 이름을 입력해 주세요.');
  if (body.launchId != null && (typeof body.launchId !== 'string' || !hexKey.test(body.launchId))) {
    fail(400, '앱에서 게임을 다시 열어 주세요.');
  }
  return {
    deviceId: body.deviceId, token: crypto.randomUUID(), name, seen: time,
    launchId: body.launchId ?? null,
    dx: 0, dy: 0, barkSeq: 0, barkPending: false, ready: false, replay: false
  };
}

function view(room, time) {
  return { ...room.game, round: room.round, roundId: room.instanceId + ':' + room.round, serverTime: time,
    movement: room.members.map(m => time - m.seen < 700 ? {dx:m.dx, dy:m.dy} : {dx:0, dy:0}),
    names: room.members.map(m => m.name), ready: room.members.map(m => m.ready),
    replay: room.members.map(m => m.replay), online: room.members.map(m => time - m.seen < 10000)
  };
}

function ticket(code, room, slot, time) {
  return { room: code, token: room.members[slot].token, playerId: 'p' + (slot + 1), state: view(room, time) };
}

function advance(room, now) {
  const game = room.game;
  if (game.status !== 'playing') return;
  // Never replay a minute of held joystick input after a phone sleeps.
  let cursor = Math.max(room.updated, now - 400);
  const end = Math.min(now, game.startedAt + roundLength);
  while (cursor < end && game.status === 'playing') {
    const dt = Math.min(40, end - cursor);
    cursor += dt;
    const inputs = room.members.map(m => {
      const active = cursor - m.seen < 700;
      const input = { dx: active ? m.dx : 0, dy: active ? m.dy : 0, bark: active && m.barkPending };
      m.barkPending = false;
      return input;
    });
    stepGame(game, inputs, dt, cursor);
  }
  if (game.status === 'playing') {
    game.elapsedMs = Math.min(roundLength, now - game.startedAt);
    game.remainingMs = roundLength - game.elapsedMs;
    if (game.remainingMs === 0) game.status = 'lost';
  }
}

function acceptSync(room, body, now) {
  const slot = room.members.findIndex(m => m.token === body.token);
  if (slot < 0) fail(403, '이 방의 참가 정보를 다시 확인해 주세요.');
  if (body.leave === true) {
    room.closed = true;
    return;
  }
  advance(room, now);
  const m = room.members[slot];
  m.seen = now;
  const sameRound = !Number.isInteger(body.round) || body.round === room.round;
  if (!sameRound) return;
  if (room.game.status === 'ready') {
    if (body.ready === true) m.ready = true;
    if (room.members.length === 2 && room.members.every(p => p.ready && now - p.seen < 10000)) {
      room.game.status = 'waiting';
      startGame(room.game, now);
    }
  } else if (room.game.status === 'playing') {
    m.dx = Number.isFinite(body.dx) ? Math.max(-1, Math.min(1, body.dx)) : 0;
    m.dy = Number.isFinite(body.dy) ? Math.max(-1, Math.min(1, body.dy)) : 0;
    if (Number.isSafeInteger(body.barkSeq) && body.barkSeq > m.barkSeq) {
      m.barkSeq = body.barkSeq;
      m.barkPending = true;
    }
  } else if (['won', 'lost'].includes(room.game.status) && body.replay === true) {
    m.replay = true;
    if (room.members.every(p => p.replay)) {
      room.round++;
      room.game = createGame(now);
      room.game.status = 'ready';
      for (const p of room.members) Object.assign(p, { ready: false, replay: false, dx: 0, dy: 0, barkPending: false, barkSeq: 0 });
    }
  }
}

const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

async function verifyResults(body, store, now) {
  if (typeof body.launchSecret !== 'string' || !hexKey.test(body.launchSecret)) {
    fail(400, '결과 확인 키 형식을 확인해 주세요.');
  }
  if (body.roundId !== undefined && (typeof body.roundId !== 'string' || !roundPattern.test(body.roundId))) {
    fail(400, '라운드 식별자 형식을 확인해 주세요.');
  }
  const after = body.after ?? 0;
  if (!Number.isSafeInteger(after) || after < 0) fail(400, '페이지 위치를 확인해 주세요.');
  const bytes = Uint8Array.from(body.launchSecret.match(/../g), pair => parseInt(pair, 16));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const launchId = Array.from(digest, byte => byte.toString(16).padStart(2,'0')).join('');
  const rows = await store.results(launchId, body.roundId ?? null, now-resultLifetime, after, pageSize+1);
  const page = rows.slice(0,pageSize);
  const data = {gameId:'shepherd-coop',results:page.map(({resultId,roundId,completedAt,savedCount}) =>
    ({resultId,roundId,completedAt,savedCount}))};
  if (rows.length > pageSize) data.nextCursor = page.at(-1).seq;
  return json(data);
}

export async function roomApi(request, store) {
  try {
    const path = new URL(request.url).pathname;
    const match = /^\/api\/rooms(?:\/([A-Z2-9]{5})\/(join|sync))?$/.exec(path);
    const verify = path === '/api/results/verify';
    if (!match && !verify) fail(404, '주소를 확인해 주세요.');
    if (request.method !== 'POST') fail(405, '지원하지 않는 요청이에요.');
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) fail(403, '게임 창에서 입장해 주세요.');
    const raw = await request.text();
    if (raw.length > 4096) fail(413, '요청이 너무 길어요.');
    let body;
    try { body = JSON.parse(raw); } catch { fail(400, '요청을 읽을 수 없어요.'); }
    if (!body || typeof body !== 'object') fail(400, '요청을 읽을 수 없어요.');
    const time = Date.now();
    if (verify) return await verifyResults(body,store,time);
    if (!match[1]) {
      const first = member(body, time);
      const room = { instanceId:crypto.randomUUID(), members:[first], round:1, game:createGame(time), updated:time };
      await store.clean(time - roomLifetime, time - resultLifetime);
      for (let i=0; i<8; i++) {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), n => alphabet[n % alphabet.length]).join('');
        if (await store.create(code, room)) return json(ticket(code, room, 0, time), 201);
      }
      fail(503, '잠시 후 다시 방을 만들어 주세요.');
    }
    const [, code, action] = match;
    for (let attempt=0; attempt<10; attempt++) {
      const row = await store.read(code);
      if (!row || row.room.updated < time - roomLifetime) fail(404, '종료되었거나 찾을 수 없는 방이에요.');
      const room = row.room;
      room.instanceId ??= crypto.randomUUID();
      if (room.closed) fail(410, '친구가 방을 나갔어요. 새 방에서 만나요.');
      const now = Math.max(room.updated, Date.now());
      let reply;
      if (action === 'join') {
        const newcomer = member(body, now);
        let slot = room.members.findIndex(m => m.deviceId === newcomer.deviceId);
        if (slot < 0) {
          if (room.members.length >= 2) fail(409, '이미 두 친구가 입장한 방이에요.');
          if (newcomer.launchId && room.members.some(m => m.launchId === newcomer.launchId)) {
            fail(409, '참가자마다 자신의 앱에서 게임을 열어 주세요.');
          }
          slot = room.members.push(newcomer) - 1;
          room.game.status = 'ready';
        } else if ((room.members[slot].launchId ?? null) !== newcomer.launchId) {
          fail(409, '이 방에 처음 입장한 앱 세션으로 다시 연결해 주세요.');
        }
        room.members[slot].seen = now;
        reply = ticket(code, room, slot, now);
      } else {
        acceptSync(room, body, now);
        reply = { state: view(room, now) };
      }
      room.updated = now;
      if (await store.write(code, row.revision, room)) return json(reply);
    }
    fail(503, '방을 동기화하고 있어요. 잠시 후 다시 연결해 주세요.');
  } catch (error) {
    if (!error.status) console.error('Room request failed', error.message);
    return json({ error:error.status ? error.message : '방에 연결하지 못했어요. 다시 시도해 주세요.' }, error.status || 500);
  }
}
