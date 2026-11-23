import { createGame, MAP } from './engine.mjs';
import { createRenderer } from './renderer.mjs';
import { createMotion } from './motion.mjs';

const $ = id => document.getElementById(id);
const app = $('app');
const entry = $('entry-form');
const nameInput = $('player-name');
const codeInput = $('join-code');
const dialog = $('dialog-layer');
const dialogAction = $('dialog-action');
const stick = $('stick');
const barkButton = $('bark');
const renderer = createRenderer($('game-map'));
const sessionKey = 'shepherd-room-v1';
const deviceKey = 'shepherd-device-v1';
const nameKey = 'shepherd-name-v1';
const appLaunchKey = 'shepherd-app-launch-v1';
const interval = 120;
const motion = createMotion();

function read(storage, key) {
  try { return window[storage].getItem(key); } catch { return null; }
}

function save(storage, key, value) {
  try {
    if (value === null) window[storage].removeItem(key);
    else window[storage].setItem(key, value);
  } catch { /* A browser without storage can still join this visit. */ }
}

function exactWebOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.origin === value ? url.origin : null;
  } catch { return null; }
}

function readAppLaunch() {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const fromApp = fragment.has('launch') || fragment.has('parentOrigin');
  let launch = null;
  if (fromApp) {
    const id = fragment.get('launch');
    if (/^[a-f0-9]{64}$/.test(id ?? '')) {
      launch = { id, parentOrigin: exactWebOrigin(fragment.get('parentOrigin')) };
    }
    url.hash = '';
    history.replaceState({ ...history.state, [appLaunchKey]: launch?.id ?? null }, '', url);
  } else if (history.state?.[appLaunchKey]) {
    // Only this history entry may restore a tab's app launch after a refresh.
    try {
      const saved = JSON.parse(read('sessionStorage', appLaunchKey));
      if (saved?.id === history.state[appLaunchKey] && /^[a-f0-9]{64}$/.test(saved.id)) {
        launch = { id: saved.id, parentOrigin: exactWebOrigin(saved.parentOrigin) };
      }
    } catch { /* A new guest visit can still play. */ }
  }
  save('sessionStorage', appLaunchKey, launch ? JSON.stringify(launch) : null);
  return launch;
}

const appLaunch = readAppLaunch();
const deviceId = read('localStorage', deviceKey) || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
save('localStorage', deviceKey, deviceId);
nameInput.value = appLaunch ? '' : read('localStorage', nameKey) || '';

let session;
let state;
let arrived = performance.now();
let revision = 0;
let syncTimer;
let pendingRequest = false;
let fastSync = false;
let networkStatus = '';
let readyRequested = false;
let replayRequested = false;
let barkSequence = 0;
let lastBark = -Infinity;
let audio;
let stickPointer;
let move = { x: 0, y: 0 };
const keys = new Set();
const preview = createGame(Date.now());
let flockHintUntil = 0;
let notifiedRound = null;

function rememberSession() {
  if (!session) return;
  save('sessionStorage', sessionKey, JSON.stringify({ ...session, round: state?.round ?? session.round, barkSequence }));
}

function setText(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}

function setEntryMessage(message) {
  setText('entry-error', message);
  $('entry-error').hidden = !message;
}

function setCode(value) {
  codeInput.value = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5);
}

function showJoin(show, focus = false) {
  $('join-fields').hidden = !show;
  $('show-join').setAttribute('aria-expanded', String(show));
  if (show && focus) codeInput.focus();
}

function clearInvite() {
  const url = new URL(location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  history.replaceState(history.state, '', url);
}

function notifyAppOfWin(next) {
  if (!appLaunch || session?.launchId !== appLaunch.id || next.status !== 'won' ||
      next.savedCount !== 6 || typeof next.roundId !== 'string' || !next.roundId ||
      notifiedRound === next.roundId) return;
  const message = {
    type: 'dreamforest.minigame.completed', version: 1, gameId: 'shepherd-coop',
    launchId: appLaunch.id, roundId: next.roundId
  };
  try {
    if (typeof window.ReactNativeWebView?.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (typeof window.webkit?.messageHandlers?.DreamForestGame?.postMessage === 'function') {
      window.webkit.messageHandlers.DreamForestGame.postMessage(message);
    } else if (window.parent !== window && appLaunch.parentOrigin) {
      window.parent.postMessage(message, appLaunch.parentOrigin);
    } else return;
    notifiedRound = next.roundId;
  } catch { /* Retry on the next sync if the native bridge is still starting. */ }
}

function nicknameForNote(name) {
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  return `${name}${last >= 0 && last <= 11171 && last % 28 !== 0 ? '아' : '야'}`;
}

function formatTimer(remaining) {
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function slot() { return session?.playerId === 'p2' ? 1 : 0; }

function renderPlayers(names) {
  const element = $('players');
  const identifier = JSON.stringify([names, slot()]);
  if (element.dataset.key === identifier) return;
  element.dataset.key = identifier;
  element.replaceChildren(...names.map((name, index) => {
    const chip = document.createElement('div');
    chip.className = `player-chip${index === slot() ? ' self' : ''}`;
    const marker = document.createElement('span');
    marker.className = 'identity-dot';
    marker.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = index === slot() ? `${name} (나)` : name;
    chip.append(marker, text);
    return chip;
  }));
}

function renderInterface() {
  const oldPhase = app.dataset.phase;
  const phase = state?.status ?? (session ? 'loading' : 'lobby');
  const inRoom = phase !== 'lobby';
  const playing = phase === 'playing';
  const finished = phase === 'won' || phase === 'lost';
  app.dataset.phase = phase;
  $('lobby').hidden = inRoom;
  $('leave').hidden = !inRoom;
  $('game-top').hidden = !inRoom;
  $('preview-caption').hidden = inRoom;
  $('controls').hidden = !playing;
  $('play-help').hidden = !playing;
  if (playing && performance.now() >= flockHintUntil) {
    const sheep = state.sheep;
    let hint = '';
    if (sheep.some(s => s.mode === 'tempted')) hint = '한눈팔고 있어요! 꽃밭 쪽에서 짖어 무리로 돌려보세요.';
    else if (sheep.some(s => s.mode === 'confused')) hint = '길을 잃었어요! 양 뒤로 돌아가 가야 할 쪽으로 몰아주세요.';
    else if (sheep.some(s => s.mode === 'flee' && s.cautious)) hint = '양이 망설여요. 이번엔 친구가 자리를 잡고 짖어 보세요.';
    setText('play-help', hint || '양마다 두 강아지의 짖기를 한 번씩 들려주세요.');
    if (hint) flockHintUntil = performance.now() + 2600;
  }
  if (!playing) flockHintUntil = 0;
  $('match-hud').hidden = !playing;
  dialog.hidden = !inRoom || playing;
  $('game-map').inert = !dialog.hidden;
  $('leave').inert = !dialog.hidden;

  const saved = state?.savedCount ?? 0;
  if (inRoom) {
    setText('room-caption', `방 ${session.room}`);
    setText('saved-count', `${saved} / 6`);
    $('sheep-progress').setAttribute('aria-label', `도착한 양 ${saved}마리`);
    Array.from($('sheep-progress').querySelectorAll('i'), (dot, index) => dot.classList.toggle('done', index < saved));
    renderPlayers(state?.names ?? []);
  }

  const disconnected = state?.online?.[1 - slot()] === false;
  const signal = playing ? networkStatus || (disconnected ? '친구가 다시 연결되기를 기다리고 있어요.' : '') : '';
  setText('signal', signal);
  $('signal').hidden = !signal;
  if (!inRoom || playing) return;

  const waiting = phase === 'waiting';
  const ready = phase === 'ready';
  const names = state?.names ?? [];
  const mine = slot();
  $('room-card').hidden = !waiting;
  setText('invite-code', session.room);
  $('note').hidden = !ready;
  dialogAction.hidden = !(ready || finished);
  let heading = '방에 연결하고 있어요';
  let copy = '';
  let eyebrow = '방 ' + session.room;
  let status = networkStatus;
  if (waiting) {
    heading = '친구를 기다려요';
    copy = '친구에게 방 코드나 초대 링크를 보내주세요.';
  } else if (ready) {
    eyebrow = '예수님이 보낸 편지';
    heading = '둘이 함께 출발해요!';
    setText('note', `${names.map(nicknameForNote).join(', ')}, 양 떼를 데리고 꿈의 숲으로 와 줘! 시간이 없어!`);
    copy = '가까운 양이 먼저 뛰면 옆 양들이 뒤따라요. 양마다 두 강아지의 짖기를 한 번씩 들려주세요. 스틱이나 방향키로 걷고 짖기 버튼이나 Space로 짖어요.';
    const ownReady = Boolean(state.ready?.[mine]) || readyRequested;
    const otherReady = Boolean(state.ready?.[1 - mine]);
    dialogAction.disabled = ownReady;
    dialogAction.textContent = ownReady ? '시작 준비 완료' : '시작';
    if (!status && ownReady) status = `${names[1 - mine] ?? '친구'}의 시작을 기다려요.`;
    if (!status && otherReady) status = `${names[1 - mine] ?? '친구'}의 시작 준비가 끝났어요.`;
  } else if (finished) {
    heading = phase === 'won' ? '양 여섯 마리 모두 도착!' : '시간이 다 됐어요';
    copy = phase === 'won' ? '두 친구가 함께 양들을 꿈의숲교회까지 데려왔어요.' : `양 ${saved}마리가 도착했어요. 같은 친구와 한 판 더 할 수 있어요.`;
    const ownReplay = Boolean(state.replay?.[mine]) || replayRequested;
    const otherReplay = Boolean(state.replay?.[1 - mine]);
    dialogAction.disabled = ownReplay;
    dialogAction.textContent = ownReplay ? '친구 기다리는 중' : '다시 하기';
    if (!status && otherReplay) status = `${names[1 - mine] ?? '친구'}가 다시 하기를 눌렀어요.`;
  }
  if (!status && disconnected) status = '친구가 다시 연결되기를 기다리고 있어요.';
  setText('dialog-eyebrow', eyebrow);
  setText('dialog-title', heading);
  setText('dialog-copy', copy);
  setText('dialog-status', status);
  if (oldPhase !== phase) {
    (waiting ? $('copy-link') : !dialogAction.hidden && !dialogAction.disabled ? dialogAction : $('dialog-leave')).focus({ preventScroll: true });
    if (waiting) $('copy-link').textContent = '초대 링크 복사';
  }
}

async function post(path, payload, options = {}) {
  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), 5500);
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      cache: 'no-store', signal: aborter.signal, ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || '서버에 연결하지 못했어요.'), { status: response.status });
    return data;
  } finally { clearTimeout(timeout); }
}

function enterLobby(message = '', announceLeave = false) {
  const old = session;
  if (announceLeave && old) {
    post(`/api/rooms/${old.room}/sync`, { token: old.token, leave: true }, { keepalive: true }).catch(() => {});
  }
  revision += 1;
  clearTimeout(syncTimer);
  pendingRequest = false;
  fastSync = false;
  session = state = undefined;
  motion.reset();
  networkStatus = '';
  readyRequested = replayRequested = false;
  barkSequence = 0;
  lastBark = -Infinity;
  clearMovement();
  save('sessionStorage', sessionKey, null);
  clearInvite();
  setEntryMessage(message);
  renderInterface();
  nameInput.focus({ preventScroll: true });
}

function receive(next, sent = performance.now()) {
  const roundChanged = next.round !== (state?.round ?? session.round);
  const statusChanged = next.status !== state?.status;
  if (roundChanged) {
    barkSequence = 0;
    lastBark = -Infinity;
  }
  if (roundChanged || statusChanged) {
    readyRequested = replayRequested = false;
    clearMovement();
    motion.reset();
  }
  if (next.status === 'playing' && !roundChanged && !statusChanged) {
    const other = 1 - slot();
    const barkAt = next.players?.[other]?.barkAt;
    if (barkAt > (state?.players?.[other]?.barkAt ?? 0) && next.serverTime - barkAt < 550) playBark(.55);
  }
  state = next;
  arrived = performance.now();
  if (next.status === 'playing') motion.receive(next, slot(), sent, arrived);
  networkStatus = '';
  session.round = next.round;
  if (roundChanged) rememberSession();
  renderInterface();
  notifyAppOfWin(next);
}

function requestSync(immediate = false) {
  if (!session) return;
  if (pendingRequest) {
    fastSync ||= immediate;
    return;
  }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, immediate ? 0 : state?.status === 'playing' ? interval : 260);
}

async function sync() {
  if (!session || pendingRequest) return;
  const stamp = revision;
  pendingRequest = true;
  fastSync = false;
  const movement = getMovement();
  const activeSession = session;
  const sent = performance.now();
  try {
    const result = await post(`/api/rooms/${activeSession.room}/sync`, {
      token: activeSession.token, round: state?.round ?? activeSession.round,
      dx: movement.x, dy: movement.y, barkSeq: barkSequence, ready: readyRequested, replay: replayRequested
    });
    if (stamp === revision) receive(result.state, sent);
  } catch (error) {
    if (stamp !== revision) return;
    if ([403, 404, 410].includes(error.status)) {
      enterLobby(error.status === 410 ? '친구가 방을 나갔어요.' : error.message);
      return;
    }
    networkStatus = '연결을 다시 확인하고 있어요…';
    renderInterface();
  } finally {
    if (stamp === revision) {
      pendingRequest = false;
      if (!networkStatus && !fastSync && state?.status === 'playing') {
        syncTimer = setTimeout(sync, Math.max(16, interval - (performance.now() - sent)));
      } else requestSync(fastSync && !networkStatus);
    }
  }
}

async function enterRoom(makeNew) {
  const name = nameInput.value.trim();
  const code = codeInput.value;
  if (!name) { nameInput.reportValidity(); nameInput.focus(); return; }
  if (!makeNew && code.length !== 5) {
    setEntryMessage('방 코드 5자리를 입력해 주세요.');
    codeInput.focus();
    return;
  }
  if (!appLaunch) save('localStorage', nameKey, name);
  setEntryMessage('방에 연결하는 중이에요…');
  entry.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    const body = { deviceId, name };
    if (appLaunch) body.launchId = appLaunch.id;
    const data = await post(makeNew ? '/api/rooms' : `/api/rooms/${code}/join`, body);
    revision += 1;
    pendingRequest = fastSync = false;
    const cached = readSession();
    const sameRound = cached?.token === data.token && cached.round === data.state.round;
    barkSequence = sameRound ? cached.barkSequence || 0 : 0;
    session = { room: data.room, token: data.token, playerId: data.playerId, round: data.state.round, launchId: appLaunch?.id ?? null };
    receive(data.state);
    rememberSession();
    clearInvite();
    setEntryMessage('');
    requestSync(true);
  } catch (error) {
    setEntryMessage(error.status ? error.message : '연결할 수 없어요. 인터넷 연결과 주소를 확인해 주세요.');
  } finally {
    entry.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

function readSession() {
  try { return JSON.parse(read('sessionStorage', sessionKey)); } catch { return null; }
}

async function copyInvite() {
  if (!session) return;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', session.room);
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      copied = true;
    }
  } catch { /* The local HTTP copy fallback can still work. */ }
  if (!copied) {
    const field = document.createElement('textarea');
    field.value = url.href;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    dialog.append(field);
    const range = document.createRange();
    range.selectNodeContents(field);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    field.focus({ preventScroll: true });
    field.setSelectionRange(0, field.value.length);
    try { copied = document.execCommand('copy'); } catch { /* Offer manual copy below. */ }
    field.remove();
    $('copy-link').focus({ preventScroll: true });
  }
  if (copied) $('copy-link').textContent = '복사했어요!';
  else window.prompt('초대 링크를 길게 눌러 복사해 주세요.', url.href);
}

function clearMovement() {
  const captured = stickPointer;
  stickPointer = undefined;
  if (captured !== undefined && stick.hasPointerCapture(captured)) stick.releasePointerCapture(captured);
  move = { x: 0, y: 0 };
  keys.clear();
  motion.input(0, 0, performance.now());
  stick.classList.remove('active');
  $('stick-center').style.setProperty('--dx', '0px');
  $('stick-center').style.setProperty('--dy', '0px');
}

function getMovement() {
  if (state?.status !== 'playing') return { x: 0, y: 0 };
  if (stickPointer !== undefined) return move;
  const x = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  const y = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
  const scale = Math.max(1, Math.hypot(x, y));
  return { x: x / scale, y: y / scale };
}

function updateStick(event) {
  const box = stick.getBoundingClientRect();
  const radius = box.width * .39;
  const dx = (event.clientX - (box.left + box.width / 2)) / radius;
  const dy = (event.clientY - (box.top + box.height / 2)) / radius;
  const radiusUsed = Math.hypot(dx, dy);
  const strength = Math.max(0, (Math.min(1, radiusUsed) - .07) / .93);
  const factor = radiusUsed ? strength / radiusUsed : 0;
  const old = move;
  move = {x: dx * factor, y: dy * factor};
  motion.input(move.x, move.y, performance.now());
  if (Math.hypot(old.x-move.x,old.y-move.y) > .32) requestSync(true);
  $('stick-center').style.setProperty('--dx', `${move.x * radius * .72}px`);
  $('stick-center').style.setProperty('--dy', `${move.y * radius * .72}px`);
}

function stopStick(event) {
  if (stickPointer !== event.pointerId) return;
  clearMovement();
  requestSync(true);
}

function openAudio() {
  if (!audio) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try { audio = new Audio(); } catch { return; }
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}

function playBark(volume = 1) {
  if (audio?.state !== 'running') return;
  const start = audio.currentTime;
  for (let i = 0; i < 2; i++) {
    const when = start + i * .073;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(260 - i * 22, when);
    tone.frequency.exponentialRampToValueAtTime(90, when + .071);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(.068 * volume, when + .013);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .075);
    tone.connect(gain).connect(audio.destination);
    tone.start(when);
    tone.stop(when + .079);
  }
}

function bark() {
  if (state?.status !== 'playing' || performance.now() - lastBark < MAP.barkCooldownMs) return;
  lastBark = performance.now();
  barkSequence = Math.max(barkSequence + 1, Date.now());
  rememberSession();
  openAudio();
  playBark();
  barkButton.classList.add('pulse');
  setTimeout(() => barkButton.classList.remove('pulse'), 120);
  requestSync(true);
}

function draw(now) {
  const dt = Math.max(0, now - arrived);
  let frame = state || preview;
  const clock = state?.serverTime ? state.serverTime + dt : Date.now();
  if (state?.status === 'playing') {
    const movement = getMovement();
    motion.input(movement.x, movement.y, now);
    frame = motion.frame(now) || state;
    const remaining = (state.remainingMs ?? 300000) - dt;
    const timer = $('timer');
    const face = formatTimer(remaining);
    if (timer.textContent !== face) timer.textContent = face;
    timer.classList.toggle('urgent', remaining < 45000);
  }
  renderer.draw(frame, session?.playerId, clock);
  requestAnimationFrame(draw);
}

$('create-room').addEventListener('click', () => enterRoom(true));
$('show-join').addEventListener('click', () => showJoin($('join-fields').hidden, true));
codeInput.addEventListener('input', event => setCode(event.target.value));
entry.addEventListener('submit', event => { event.preventDefault(); enterRoom($('join-fields').hidden); });
$('leave').addEventListener('click', () => enterLobby('', true));
$('dialog-leave').addEventListener('click', () => enterLobby('', true));
$('copy-link').addEventListener('click', copyInvite);
dialogAction.addEventListener('click', () => {
  openAudio();
  if (state?.status === 'ready') readyRequested = true;
  if (state?.status === 'won' || state?.status === 'lost') replayRequested = true;
  renderInterface();
  requestSync(true);
});

stick.addEventListener('pointerdown', event => {
  if (state?.status !== 'playing' || stickPointer !== undefined) return;
  event.preventDefault();
  stickPointer = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  stick.classList.add('active');
  updateStick(event);
  requestSync(true);
});
stick.addEventListener('pointermove', event => { if (stickPointer === event.pointerId) updateStick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, stopStick);
barkButton.addEventListener('pointerdown', event => { if (event.button === 0) bark(); });
barkButton.addEventListener('click', event => { if (event.detail === 0) bark(); });
const directions = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
window.addEventListener('keydown', event => {
  if (state?.status !== 'playing') return;
  if (directions.has(event.code)) {
    event.preventDefault();
    if (!keys.has(event.code)) {
      keys.add(event.code);
      requestSync(true);
    }
  } else if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) bark();
  }
});
window.addEventListener('keyup', event => { if (keys.delete(event.code)) requestSync(true); });
window.addEventListener('blur', () => { clearMovement(); requestSync(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovement(); requestSync(true); });
window.addEventListener('online', () => requestSync(true));
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || dialog.hidden) return;
  const buttons = Array.from(dialog.querySelectorAll('button')).filter(button => !button.disabled && button.getClientRects().length);
  const first = buttons[0];
  const last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});

const invite = new URL(location.href).searchParams.get('room');
const stored = readSession();
if (invite) { setCode(invite); showJoin(true); }
if (stored && (stored.launchId ?? null) !== (appLaunch?.id ?? null)) {
  save('sessionStorage', sessionKey, null);
} else if (/^[A-Z2-9]{5}$/.test(stored?.room) && typeof stored.token === 'string' && (!invite || invite.toUpperCase() === stored.room)) {
  session = stored;
  barkSequence = stored.barkSequence || 0;
  renderInterface();
  requestSync(true);
}
// Hosts can navigate an existing WebView to the same game with a new fragment.
window.addEventListener('hashchange', () => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('launch') || params.has('parentOrigin')) location.reload();
});
requestAnimationFrame(draw);
