import { LAUNCH, LIMITS, STAGES, WORLD, guide, simulateShot } from './physics.mjs';
import { drawScene } from './art.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const courses = ['꽃밭 바구니', '쿠션 바구니', '달리는 꽃수레'];
const instructions = [
  '잔디밭 어디서든 왼쪽 아래로 당겼다 놓아요.',
  '담 위로 높이 던지거나 쿠션에 튕겨 바구니에 넣어요.',
  '수레가 움직일 곳을 미리 노려 한 개만 넣어요.',
];
const storageKey = 'dreamforest.egg-hole-in-one.v1';
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let clock = 0, lastTick = 0, lastPaint = -Infinity;
let stage = 0, misses = 0, attempts = 0, hits = [0, 0, 0], shots = [];
let round = null, launch = null, flight = null, drag = null, pointerShot = null;
let hintPoints = [], afterShot = null, noticeUntil = 0, celebrationStart = -10;
let ready = false, starting = false, submitting = false, previewCache = null;
let audio, audible = false;

function safeRead(storage, key) {
  try { return JSON.parse(window[storage].getItem(key)); } catch { return null; }
}
function safeWrite(storage, key, value) {
  try { window[storage].setItem(key, JSON.stringify(value)); } catch { /* Play also works without storage. */ }
}
function readLaunch() {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('launch');
  if (!id) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  let origin = null;
  try {
    const value = new URL(params.get('parentOrigin'));
    if (value.protocol === 'https:' || value.protocol === 'http:') origin = value.origin;
  } catch { /* Native app launches can omit the web parent. */ }
  return { id, origin };
}
function remember() {
  safeWrite('sessionStorage', storageKey, { launch, round, shots, attempts });
}
// Paths are relative to the page, so the game also works when an app serves it from a folder.
async function post(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store',
    });
    if (!response.ok) {
      const error = new Error('Game service unavailable');
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}
function sendResult() {
  if (!launch) return;
  const signal = { type: 'dreamforest.minigame.completed', version: 1, gameId: 'egg-hole-in-one', launchId: launch.id, roundId: round.roundId };
  try {
    if (typeof window.ReactNativeWebView?.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(signal));
    } else if (typeof window.webkit?.messageHandlers?.DreamForestGame?.postMessage === 'function') {
      window.webkit.messageHandlers.DreamForestGame.postMessage(signal);
    } else if (window.parent !== window && launch.origin) {
      window.parent.postMessage(signal, launch.origin);
    }
  } catch { /* The app can reconcile verified rounds when the host screen opens. */ }
}
async function verify() {
  if (submitting || !round) return;
  submitting = true;
  $('verification').textContent = '완주 기록을 확인하고 있어요.';
  $('verify-retry').hidden = true;
  $('replay').hidden = true;
  try {
    const result = await post('api/rounds/' + encodeURIComponent(round.roundId) + '/finish', { token: round.token, shots });
    if (result.verified !== true || result.roundId !== round.roundId) throw new Error('Round not verified');
    sendResult();
    $('verification').textContent = launch ? '완주 기록을 저장했어요. 앱에서 물방울을 확인해요.' : '달걀 다섯 개가 모두 바구니를 찾았어요.';
    $('replay').hidden = false;
    $('replay').focus({ preventScroll: true });
  } catch (error) {
    if (error.status === 403) {
      $('verification').textContent = '이 판의 기록을 보낼 시간이 지났어요. 새 판을 시작해요.';
      $('replay').hidden = false;
    } else {
      $('verification').textContent = '완주 기록을 아직 보내지 못했어요. 연결한 뒤 다시 보내요.';
      $('verify-retry').hidden = false;
    }
  } finally { submitting = false; }
}
function finish() {
  ready = false;
  $('result-score').textContent = attempts + '번 던져 세 코스에서 5골을 넣었어요.';
  if (!$('result').open) $('result').showModal();
  verify();
}
function stageAfter(index, count) { return count >= STAGES[index].target ? index + 1 : index; }
function rulesVersion() { return round?.rulesVersion ?? 2; }
function courseTip() {
  if (rulesVersion() === 1 && stage === 1) return '쿠션에 한 번 튕겨 담 너머 바구니로 보내요.';
  if (rulesVersion() === 2 && hits[stage] === 1 && stage < 2) return '두 번째 바구니는 더 멀어요. 힘과 각도를 다시 골라 봐요.';
  return instructions[stage];
}
function restore(saved) {
  if (!saved?.round?.roundId || !saved.round.token || !Array.isArray(saved.shots) || saved.shots.length > 15) return false;
  const savedRules = saved.round.rulesVersion ?? 1;
  const restoredHits = [0, 0, 0];
  let restoredStage = 0, restoredMisses = 0;
  try {
    for (const shot of saved.shots) {
      if (restoredStage >= STAGES.length) return false;
      const result = simulateShot(restoredStage, shot, restoredMisses, restoredHits[restoredStage], savedRules);
      if (result.hit) {
        restoredMisses = 0;
        restoredHits[restoredStage]++;
        restoredStage = stageAfter(restoredStage, restoredHits[restoredStage]);
      } else { restoredMisses++; }
    }
  } catch { return false; }
  round = { ...saved.round, rulesVersion: savedRules };
  shots = saved.shots;
  hits = restoredHits;
  attempts = Math.max(shots.length, Number(saved.attempts) || 0);
  misses = restoredMisses;
  stage = Math.min(2, restoredStage);
  ready = restoredStage < 3;
  updateBoard();
  $('instruction').textContent = ready ? courseTip() : '세 코스를 모두 완주했어요!';
  if (!ready) finish();
  return true;
}
async function startRound() {
  if (starting) return;
  const previousRound = ready && rulesVersion() === 1 ? { round, shots, attempts } : null;
  starting = true;
  $('retry-connect').hidden = true;
  ready = false;
  round = null;
  stage = 0; hits = [0, 0, 0]; misses = 0; attempts = 0; shots = [];
  flight = null; afterShot = null; drag = null; pointerShot = null; hintPoints = [];
  celebrationStart = -10; previewCache = null;
  $('shot-feedback').hidden = true;
  $('controls').open = false;
  $('instruction').textContent = '봄 정원을 열고 있어요…';
  updateBoard();
  try {
    const opened = await post('api/rounds', { rulesVersion: 2, launchId: launch?.id });
    if (!opened.roundId || !opened.token) throw new Error('Missing game round');
    round = { roundId: opened.roundId, token: opened.token, rulesVersion: opened.rulesVersion ?? 1 };
    ready = true;
    remember();
    $('instruction').textContent = courseTip();
  } catch {
    if (previousRound && restore(previousRound)) {
      $('instruction').textContent = '새 코스에 연결하지 못했어요. 이 판을 계속하거나 다시 시도해요.';
    } else {
      $('instruction').textContent = '정원에 연결하지 못했어요.';
      $('retry-connect').hidden = false;
    }
  } finally { starting = false; updateBoard(); }
}
function updateBoard() {
  const legacy = rulesVersion() === 1;
  $('legacy-round').hidden = !ready || !legacy;
  $('new-course').disabled = !canAim();
  $('meadow-task').textContent = legacy ? '가까운 바구니에 넣기' : '가까이 한 골, 멀리 한 골';
  $('cushion-task').textContent = legacy ? '쿠션에 한 번 튕겨 넣기' : '담 너머 바구니에 넣기';
  $('course-no').textContent = (stage + 1) + '코스';
  $('course-title').textContent = courses[stage];
  $('stage-count').textContent = hits[stage] + ' / ' + STAGES[stage].target;
  $('total-count').textContent = hits.reduce((n, hit) => n + hit, 0) + ' / 5개';
  document.querySelectorAll('[data-course]').forEach((item, index) => {
    const done = hits[index] >= STAGES[index].target;
    item.classList.toggle('active', index === stage && !done);
    item.classList.toggle('done', done);
    if (index === stage && !done) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    item.querySelector('.node').innerHTML = done ? '<svg aria-label="완료"><use href="#i-check"/></svg>' : String(index + 1);
    item.querySelector('.tally').textContent = hits[index] + '/' + STAGES[index].target;
  });
  $('throw').disabled = !canAim();
  $('assist').hidden = misses < 2 || !canAim();
  $('assist').setAttribute('aria-pressed', String(hintPoints.length > 0));
}
function canAim() { return ready && !flight && !afterShot && !$('help-dialog').open && !$('result').open; }
function phaseNow() { return clock % 560; }
function setSound(on) {
  audible = on;
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound-label').textContent = on ? '소리 켬' : '소리 끔';
  $('sound-use').setAttribute('href', on ? '#i-sound' : '#i-mute');
  safeWrite('localStorage', 'dreamforest.egg.sound', on);
}
function wakeAudio() {
  if (!audible) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio && !audio) audio = new Audio();
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Silent mode remains playable. */ }
}
function beep(hz, length = .11, delay = 0) {
  if (!audible || !audio || audio.state !== 'running') return;
  const at = audio.currentTime + delay;
  const tone = audio.createOscillator(), gain = audio.createGain();
  tone.type = 'sine'; tone.frequency.setValueAtTime(hz, at);
  gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(.07, at + .01);
  gain.gain.exponentialRampToValueAtTime(.001, at + length);
  tone.connect(gain); gain.connect(audio.destination); tone.start(at); tone.stop(at + length + .01);
}
function speedBounds(degrees) {
  const radians = degrees * Math.PI / 180, cx = Math.cos(radians), sy = Math.sin(radians);
  return {
    cx, sy,
    low: Math.max(LIMITS.minVx / cx, -LIMITS.maxVy / sy),
    high: Math.min(LIMITS.maxVx / cx, -LIMITS.minVy / sy),
  };
}
function sliderShot(phase) {
  const { cx, sy, low, high } = speedBounds(Number($('angle').value));
  const speed = low + (high - low) * Number($('power').value) / 100;
  return { vx: clamp(Math.round(cx * speed), LIMITS.minVx, LIMITS.maxVx), vy: clamp(Math.round(-sy * speed), LIMITS.minVy, LIMITS.maxVy), phase };
}
function reflectShot(shot) {
  const deg = clamp(Math.round(Math.atan2(-shot.vy, shot.vx) * 180 / Math.PI), 10, 80);
  const { low, high } = speedBounds(deg);
  $('angle').value = String(deg);
  $('power').value = String(clamp(Math.round(100 * (Math.hypot(shot.vx, shot.vy) - low) / (high - low)), 0, 100));
  showSliders();
}
function showSliders() {
  $('angle-value').textContent = $('angle').value + '°';
  $('power-value').textContent = $('power').value + '%';
}
function showNotice(text, duration = .9) {
  $('shot-feedback').textContent = text;
  $('shot-feedback').hidden = false;
  noticeUntil = clock + duration;
}
function launchShot(shot) {
  if (!canAim() || !shot) return;
  const legal = { vx: shot.vx, vy: shot.vy, phase: phaseNow() };
  const sim = simulateShot(stage, legal, misses, hits[stage], rulesVersion());
  if (sim.hit || misses < 2) shots.push(legal);
  attempts++;
  remember();
  flight = { shot: legal, sim, start: clock, eventIndex: 0, frameIndex: 0 };
  drag = null; pointerShot = null; hintPoints = []; previewCache = null;
  $('shot-feedback').hidden = true;
  $('instruction').textContent = '달걀이 날아가요…';
  updateBoard(); wakeAudio(); beep(380, .085); beep(492, .13, .045);
}
function resolveShot() {
  const { sim, shot } = flight;
  const last = sim.frames[sim.frames.length - 1];
  flight = null;
  if (sim.hit) {
    const goalsInStage = hits[stage];
    hits[stage]++;
    const nextStage = stageAfter(stage, hits[stage]);
    afterShot = { nextStage, until: clock + .48, egg: last, goalsInStage, misses, phase: shot.phase + sim.duration };
    misses = 0;
    $('instruction').textContent = nextStage === stage ? '쏙 들어갔어요! 한 개 더 넣어 봐요.' : (stage === 2 ? '세 코스를 모두 완주했어요!' : courses[stage] + ' 완료!');
  } else {
    misses++;
    const had = type => sim.events.some(event => event.type === type);
    let tip;
    if (rulesVersion() === 1 && stage === 1 && !sim.banked) tip = courseTip();
    else if (had('spare')) tip = '옆 바구니에서 통통! 조금 덜 세게 던져 봐요.';
    else if (had('rim')) tip = '테두리에 톡! 힘을 살짝 바꿔 봐요.';
    else if (stage === 1 && had('wall')) tip = '담에 톡! 더 높이 넘기거나 앞쪽 쿠션을 노려요.';
    else if (stage === 2) tip = '수레가 움직이는 방향으로 조금 앞서 노려요.';
    else tip = '한 번 더! 점선을 보며 각도와 힘을 바꿔요.';
    $('instruction').textContent = tip;
  }
  previewCache = null;
  updateBoard();
}
function advance() {
  const next = afterShot.nextStage;
  afterShot = null;
  if (next >= STAGES.length) { updateBoard(); finish(); return; }
  if (next !== stage) {
    stage = next;
    celebrationStart = -10;
    previewCache = null;
    $('instruction').textContent = courseTip();
    showNotice((stage + 1) + '코스 · ' + courses[stage], 1.1);
  } else if (rulesVersion() === 2) {
    celebrationStart = -10;
    $('instruction').textContent = courseTip();
    showNotice('두 번째 바구니!', 1);
  }
  updateBoard();
}
function point(event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left) * WORLD.width / box.width, y: (event.clientY - box.top) * WORLD.height / box.height };
}
function updatePull(event) {
  const now = point(event), dx = drag.x - now.x, dy = drag.y - now.y;
  // A full-power shot fits inside the launch egg's margins on a portrait phone.
  if (dx < 3 || dy > -3 || Math.hypot(dx, dy) < 10) { pointerShot = null; return; }
  pointerShot = {
    vx: clamp(Math.round(dx * 5.6), LIMITS.minVx, LIMITS.maxVx),
    vy: clamp(Math.round(dy * 5.6), LIMITS.minVy, LIMITS.maxVy), phase: phaseNow(),
  };
}
canvas.addEventListener('pointerdown', event => {
  if (!canAim() || drag || event.button !== 0) return;
  event.preventDefault(); wakeAudio();
  drag = { ...point(event), id: event.pointerId };
  pointerShot = null;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (drag?.id === event.pointerId) updatePull(event);
});
canvas.addEventListener('pointerup', event => {
  if (drag?.id !== event.pointerId) return;
  updatePull(event);
  const shot = pointerShot;
  drag = null; pointerShot = null;
  if (shot) { reflectShot(shot); launchShot(shot); }
  else $('instruction').textContent = '왼쪽 아래로 당겨서 점선이 보이면 놓아요.';
});
function cancelDrag() { drag = null; pointerShot = null; }
canvas.addEventListener('pointercancel', cancelDrag);
canvas.addEventListener('lostpointercapture', cancelDrag);
canvas.addEventListener('keydown', event => {
  if (!canAim() || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  $('controls').open = true;
  $('angle').focus();
});
function trajectory(shot) {
  const key = [stage, hits[stage], rulesVersion(), misses >= 2, shot.vx, shot.vy, stage === 2 ? Math.floor(shot.phase * 16) : 0].join('/');
  if (previewCache?.key === key) return previewCache.points;
  const sim = simulateShot(stage, shot, misses, hits[stage], rulesVersion());
  const points = sim.frames.filter((frame, i) => i % 3 === 0 && frame.t <= .55);
  previewCache = { key, points };
  return points;
}
function frameAt(time) {
  const frames = flight.sim.frames;
  while (flight.frameIndex < frames.length - 2 && frames[flight.frameIndex + 1].t < time) flight.frameIndex++;
  const a = frames[flight.frameIndex], b = frames[flight.frameIndex + 1];
  const blend = b ? clamp((time - a.t) / (b.t - a.t), 0, 1) : 0;
  return b ? { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend, t: time } : a;
}
function processEvents(elapsed) {
  const events = flight.sim.events;
  while (flight.eventIndex < events.length && events[flight.eventIndex].t <= elapsed) {
    const event = events[flight.eventIndex++];
    if (event.type === 'goal') {
      celebrationStart = clock;
      let label = '바구니에 쏙!';
      if (stage === 1) label = flight.sim.banked ? '쿠션 타고 쏙!' : '담 너머로 쏙!';
      showNotice(label);
      beep(523, .14); beep(659, .16, .09); beep(784, .22, .18);
    } else if (event.type === 'cushion') { beep(350, .08); beep(610, .13, .045); }
    else if (event.type === 'spare') { showNotice('옆 바구니에서 통통!', .7); beep(284); beep(372, .12, .08); }
    else if (event.type === 'rim') beep(630, .07);
  }
}
let canvasW = 0, canvasH = 0;
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvasW = Math.round(rect.width * scale); canvasH = Math.round(rect.height * scale);
  if (canvas.width !== canvasW || canvas.height !== canvasH) { canvas.width = canvasW; canvas.height = canvasH; }
}
const observer = new ResizeObserver(resize);
observer.observe(canvas);
window.addEventListener('resize', resize);
function animate(now) {
  requestAnimationFrame(animate);
  const delta = lastTick ? Math.min((now - lastTick) / 1000, .15) : 0;
  lastTick = now;
  if (document.hidden || $('help-dialog').open || $('result').open) return;
  clock += delta;
  if (afterShot && clock >= afterShot.until) advance();
  if (!$('shot-feedback').hidden && clock >= noticeUntil) $('shot-feedback').hidden = true;
  // Idle decorations need fewer redraws, while the flying egg follows the display.
  if (!flight && !drag && now - lastPaint < (reducedMotion ? 65 : 32)) return;
  lastPaint = now;
  if (!canvasW) resize();
  let egg = afterShot?.egg || LAUNCH, phase = afterShot?.phase ?? phaseNow(), shotTime = 0;
  let events = [], hit = false, banked = false;
  const shooting = Boolean(flight);
  if (flight) {
    shotTime = Math.min(clock - flight.start, flight.sim.duration);
    phase = flight.shot.phase + shotTime;
    egg = frameAt(shotTime);
    processEvents(shotTime);
    events = flight.sim.events;
    hit = events.some(event => event.type === 'goal' && event.t <= shotTime);
    banked = events.some(event => event.type === 'cushion' && event.t <= shotTime);
  }
  const canPreview = !flight && !afterShot && ready;
  const helpLine = canPreview ? hintPoints : [];
  let aimLine = [];
  if (canPreview && (pointerShot || (!drag && $('controls').open))) {
    const shot = pointerShot ? { ...pointerShot, phase } : sliderShot(phase);
    aimLine = trajectory(shot);
  }
  ctx.setTransform(canvasW / WORLD.width, 0, 0, canvasH / WORLD.height, 0, 0);
  ctx.save();
  drawScene(ctx, {
    stageIndex: stage, phase, misses: afterShot?.misses ?? misses, goalsInStage: afterShot?.goalsInStage ?? hits[stage],
    rulesVersion: rulesVersion(), egg, aim: aimLine, guide: helpLine, time: reducedMotion ? 0 : clock,
    shotTime, hit, banked, shooting, dragging: Boolean(drag), progress: hits[stage], events,
    celebration: clock - celebrationStart,
  });
  ctx.restore();
  if (flight && clock - flight.start >= flight.sim.duration) resolveShot();
}
$('assist').addEventListener('click', () => {
  if (!canAim() || misses < 2) return;
  if (hintPoints.length) {
    hintPoints = [];
    $('instruction').textContent = courseTip();
  } else {
    const example = guide(stage, phaseNow(), misses, hits[stage], rulesVersion());
    hintPoints = trajectory(example).filter(p => p.t <= .35);
    $('instruction').textContent = stage === 2 ? '초록 점선은 지금의 출발 방향이에요. 수레를 보고 던질 때를 골라요.' : '초록 점선은 출발 방향이에요. 각도와 힘을 직접 맞춰 봐요.';
  }
  updateBoard();
});
for (const id of ['angle', 'power']) $(id).addEventListener('input', showSliders);
$('throw').addEventListener('click', () => launchShot(sliderShot(phaseNow())));
$('retry-connect').addEventListener('click', startRound);
$('new-course').addEventListener('click', startRound);
$('verify-retry').addEventListener('click', verify);
$('replay').addEventListener('click', () => { $('result').close(); startRound(); });
$('result').addEventListener('cancel', event => event.preventDefault());
$('help').addEventListener('click', () => { cancelDrag(); $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('play').addEventListener('click', () => $('help-dialog').close());
$('sound').addEventListener('click', () => { setSound(!audible); wakeAudio(); beep(622, .15); });
document.addEventListener('visibilitychange', () => { lastTick = 0; if (document.hidden) cancelDrag(); });

const hadLaunchFragment = new URLSearchParams(location.hash.slice(1)).has('launch');
launch = readLaunch();
const navigation = performance.getEntriesByType('navigation')[0]?.type;
const previous = safeRead('sessionStorage', storageKey);
const resume = !hadLaunchFragment && ['reload', 'back_forward'].includes(navigation);
if (resume) launch = previous?.launch || null;
setSound(safeRead('localStorage', 'dreamforest.egg.sound') === true);
resize(); requestAnimationFrame(animate);
if (!resume || !restore(previous)) startRound();
