import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { World } from './world.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { ABILITIES } from './player.js';
import { MODES } from './modes.js';
import { storage } from './storage.js';
import { SKINS, getSkin } from './skins.js';
import { cheats, initCheats, applyWallhack } from './cheats.js';

/* ---------- renderer / scene / camera ---------- */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 200);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.3, 0.9);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

/* ---------- profile (coins, skins, bests) ---------- */
const profile = storage.load();

function saveProfile() {
  storage.save(profile);
}

/* ---------- game object ---------- */
const game = {
  phase: 'menu', // menu | armory | playing | paused | gameover
  modeId: 'siege',
  score: 0,
  runCoins: 0,
  addScore(n) {
    this.score += n;
    ui.setScore(this.score);
  },
  addCoins(n) {
    if (n <= 0) return;
    this.runCoins += n;
    profile.coins += n;
    ui.setWallet(profile.coins);
  },
  getShootTargets() {
    const arr = world.raycastTargets.slice();
    for (const e of enemies.enemies) if (e.alive) arr.push(e.mesh);
    return arr;
  },
  _endRun(extracted) {
    this.phase = 'gameover';
    audio.stopMusic();
    if (extracted) audio.extract(); else audio.gameOver();
    const mode = MODES[this.modeId];
    const prevBest = profile.best[this.modeId] || 0;
    profile.best[this.modeId] = Math.max(prevBest, this.score);
    profile.totalKills += enemies.kills;
    saveProfile();
    ui.setBests(profile.best);
    ui.setGameOver({
      mode, score: this.score, wave: enemies.wave, kills: enemies.kills, coins: this.runCoins,
      best: prevBest, extracted, blitz: mode.id === 'blitz',
    });
    ui.setBoss(null);
    ui.setOverdrive(false);
    ui.setPhase('gameover');
    document.body.classList.remove('playing');
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  },
  gameOver() { this._endRun(false); },
  extract() { this._endRun(true); },
};

const ui = new UI();
const audio = new GameAudio();
const world = new World(scene);
const effects = new Effects(scene);
const player = new Player(camera, world, effects, audio, ui, game);
game.player = player;
const enemies = new EnemyManager(scene, world, effects, audio, ui, game);
game.enemies = enemies;
player.applySkin(getSkin(profile.equipped));
ui.setWallet(profile.coins);
ui.setBests(profile.best);
ui.setModeSelected(game.modeId);
ui.setSaveWarning(!storage.persistent);

/* ---------- debug overlay ---------- */
const debugEl = document.getElementById('debug-overlay');
debugEl.classList.add('hidden'); // press ` to show
let frames = 0, lastDebug = performance.now(), lastFrameTime = performance.now();
let frameTimes = [];
function updateDebug() {
  const now = performance.now();
  frameTimes.push(now - lastFrameTime);
  lastFrameTime = now;
  frames++;
  if (now - lastDebug >= 1000) {
    const fps = (frames * 1000) / (now - lastDebug);
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const info = renderer.info;
    const lines = [
      `FPS:${fps.toFixed(0)}  Frame:${avg.toFixed(1)}ms`,
      `Draw:${info.render.calls}  Tri:${info.render.triangles}`,
      `Geo:${info.memory.geometries}  Tex:${info.memory.textures}`,
    ];
    if (fps < 30) lines.push('LOW FPS');
    if (info.render.calls > 300) lines.push('HIGH DRAW CALLS');
    debugEl.textContent = lines.join('\n');
    frames = 0;
    frameTimes = [];
    lastDebug = now;
  }
}

/* ---------- input ---------- */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && game.phase === 'playing') e.preventDefault();
  player.keys[e.code] = true;
  if (e.code === 'KeyR') player.reload();
  if (e.code === 'Backquote') debugEl.classList.toggle('hidden');
  if (game.phase === 'playing' && !e.repeat) {
    if (e.code === 'KeyQ') player.useAbility('dash');
    if (e.code === 'KeyE') player.useAbility('shock');
    if (e.code === 'KeyF') player.useAbility('overdrive');
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && (game.phase === 'playing' || game.phase === 'paused')) {
    togglePause();
  } else if (e.code === 'Escape' && game.phase === 'armory') {
    closeArmory();
  }
});
window.addEventListener('keyup', (e) => {
  player.keys[e.code] = false;
});

/* ---------- pointer lock (mouse capture) ---------- */
const lock = {
  supported: typeof canvas.requestPointerLock === 'function' && !ui._isTouch,
  active: false,
  failed: false,     // lock was refused (e.g. embedding frame forbids it) -> free-cursor fallback
  requesting: false,
  promiseApi: false,
};
const lockHint = document.getElementById('lock-hint');
function updateLockHint() {
  if (!lockHint) return;
  const show = game.phase === 'playing' && lock.supported && !lock.active && !lock.failed;
  lockHint.classList.toggle('hidden', !show);
  document.body.classList.toggle('free-cursor', lock.failed);
}
function requestLock() {
  if (!lock.supported || lock.active || lock.requesting || lock.failed) return;
  lock.requesting = true;
  // Attempt 1: raw (unaccelerated) mouse motion. Attempt 2: default lock.
  // Only after both fail do we drop into free-cursor fallback.
  const attempt = (opts) => {
    try {
      const p = canvas.requestPointerLock(opts);
      if (p && typeof p.then === 'function') { lock.promiseApi = true; return p; }
      return null;
    } catch (err) { return Promise.reject(err); }
  };
  const first = attempt({ unadjustedMovement: true });
  if (!first) return; // legacy API: outcome arrives via pointerlockchange / pointerlockerror
  first.catch(() => {
    const second = attempt(undefined);
    return second ? second : null;
  }).catch(onLockError).finally(() => { lock.requesting = false; });
}
function onLockError(err) {
  lock.requesting = false;
  lock.failed = true;
  console.warn('Pointer lock unavailable, using free-cursor mouse look.', err && err.message ? err.message : err);
  updateLockHint();
}
document.addEventListener('pointerlockerror', () => {
  // With the promise-based API, rejections are handled in requestLock (with retry).
  if (lock.promiseApi) return;
  onLockError(new Error('pointerlockerror'));
});
document.addEventListener('pointerlockchange', () => {
  lock.active = document.pointerLockElement === canvas;
  lock.requesting = false;
  if (lock.active) {
    document.body.classList.add('locked');
  } else {
    document.body.classList.remove('locked');
    player.stopFire();
    // Esc releases the lock natively; treat that as a pause so the game never
    // keeps running while the cursor is free.
    if (game.phase === 'playing') togglePause();
  }
  updateLockHint();
});

window.addEventListener('mousemove', (e) => {
  // When pointer lock is available, only locked motion drives the camera.
  if (lock.supported && !lock.failed && !lock.active) return;
  player.onMouseMove(e.movementX || 0, e.movementY || 0);
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || game.phase !== 'playing') return;
  if (lock.supported && !lock.failed && !lock.active) { requestLock(); return; }
  player.startFire();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) player.stopFire();
});
window.addEventListener('blur', () => {
  player.stopFire();
  player.keys = {};
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- touch ---------- */
if ('ontouchstart' in window && window.innerWidth < 900) {
  const lookZone = document.getElementById('touch-look');
  let lookLast = null;
  lookZone.addEventListener('touchstart', (e) => {
    lookLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  lookZone.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (lookLast) player.onMouseMove((t.clientX - lookLast.x) * 1.6, (t.clientY - lookLast.y) * 1.6);
    lookLast = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  lookZone.addEventListener('touchend', () => { lookLast = null; }, { passive: true });

  const stickBase = document.getElementById('stick-base');
  const stickNub = document.getElementById('stick-nub');
  let stickId = null, stickCenter = null;
  stickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const r = stickBase.getBoundingClientRect();
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stickId = e.changedTouches[0].identifier;
  });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - stickCenter.x;
      let dy = t.clientY - stickCenter.y;
      const len = Math.hypot(dx, dy);
      const max = 45;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      stickNub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      player.keys['KeyW'] = dy < -12;
      player.keys['KeyS'] = dy > 12;
      player.keys['KeyA'] = dx < -12;
      player.keys['KeyD'] = dx > 12;
    }
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null;
        stickNub.style.transform = 'translate(-50%, -50%)';
        player.keys['KeyW'] = player.keys['KeyS'] = player.keys['KeyA'] = player.keys['KeyD'] = false;
      }
    }
  }, { passive: true });

  document.getElementById('fire-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.phase === 'playing') player.startFire();
  });
  document.getElementById('fire-btn').addEventListener('touchend', () => player.stopFire());
  document.getElementById('jump-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    player.keys['Space'] = true;
  });
  document.getElementById('jump-btn').addEventListener('touchend', () => {
    player.keys['Space'] = false;
  });
}

/* ---------- screens / state ---------- */
function startGame() {
  audio.init();
  audio.ctx.resume();
  game.score = 0;
  game.runCoins = 0;
  ui.setScore(0);
  ui.setMultiplier(1);
  ui.setOverdrive(false);
  player.reset();
  enemies.startGame(game.modeId);
  game.phase = 'playing';
  ui.setPhase('playing');
  audio.startMusic();
  requestLock();
  updateLockHint();
}

function goToMenu() {
  if (game.phase === 'paused') {
    // abandon run: keep coins already earned
    profile.best[game.modeId] = Math.max(profile.best[game.modeId] || 0, game.score);
    saveProfile();
    ui.setBests(profile.best);
  }
  enemies.reset();
  player.reset();
  audio.stopMusic();
  ui.setBoss(null);
  ui.setOverdrive(false);
  ui.setTimer(null);
  game.phase = 'menu';
  ui.setPhase('menu');
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

/* ---------- armory ---------- */
let armoryReturn = 'menu';
function openArmory() {
  armoryReturn = game.phase === 'gameover' ? 'gameover' : 'menu';
  game.phase = 'armory';
  renderArmory();
  ui.setPhase('armory');
}
function closeArmory() {
  game.phase = armoryReturn;
  ui.setPhase(armoryReturn);
}
function renderArmory() {
  ui.setWallet(profile.coins);
  ui.renderArmory(profile, (action, skin) => {
    audio.init();
    if (action === 'buy') {
      if (profile.coins < skin.price) { audio.deny(); return; }
      profile.coins -= skin.price;
      profile.owned.push(skin.id);
      profile.equipped = skin.id;
      audio.buy();
    } else if (action === 'equip') {
      profile.equipped = skin.id;
      audio.pickup();
    }
    player.applySkin(getSkin(profile.equipped));
    saveProfile();
    renderArmory();
  });
}

/* ---------- mode select ---------- */
ui.el.modeSelect.addEventListener('click', (e) => {
  const card = e.target.closest('.mode-card');
  if (!card) return;
  game.modeId = card.dataset.mode;
  ui.setModeSelected(game.modeId);
});
ui.el.armoryBtn.addEventListener('click', openArmory);
ui.el.armoryBtnGo.addEventListener('click', openArmory);
ui.el.armoryBackBtn.addEventListener('click', closeArmory);
ui.el.menuBtn.addEventListener('click', goToMenu);
ui.el.menuBtnPause.addEventListener('click', goToMenu);
for (const btn of ui.touchAbilityEls) {
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); player.useAbility(btn.dataset.ability); }, { passive: false });
}

function togglePause() {
  if (game.phase === 'playing') {
    game.phase = 'paused';
    ui.setPhase('paused');
    document.body.classList.remove('playing');
    if (lock.active && document.exitPointerLock) document.exitPointerLock();
  } else if (game.phase === 'paused') {
    game.phase = 'playing';
    ui.setPhase('playing');
    requestLock();
  }
  updateLockHint();
}

ui.el.startBtn.addEventListener('click', startGame);

/* ---------- secret cheat console (type IMBOT, or tap the menu title 5x) ---------- */
let pausedForCheats = false;
const cheatUI = initCheats({
  onOpen() {
    audio.init();
    audio.abilityReady && audio.abilityReady();
    if (game.phase === 'playing') { togglePause(); pausedForCheats = true; }
  },
  onClose() {
    if (pausedForCheats && game.phase === 'paused') togglePause();
    pausedForCheats = false;
  },
  onCoins(n) {
    profile.coins += n;
    ui.setWallet(profile.coins);
    saveProfile();
    audio.buy && audio.buy();
    if (game.phase === 'armory') renderArmory();
  },
  onUnlockAll() {
    for (const s of SKINS) if (!profile.owned.includes(s.id)) profile.owned.push(s.id);
    saveProfile();
    audio.buy && audio.buy();
    if (game.phase === 'armory') renderArmory();
  },
});
// Engine is ready: arm the DEPLOY button (it starts disabled while scripts load).
ui.el.startBtn.disabled = false;
ui.el.startBtn.dataset.ready = '1';
ui.el.startBtn.textContent = 'DEPLOY';
ui.el.resumeBtn.addEventListener('click', togglePause);
ui.el.restartBtn.addEventListener('click', startGame);
ui.el.restartBtnPause.addEventListener('click', startGame);

ui.el.sensRange.addEventListener('input', () => {
  player.sensitivity = parseFloat(ui.el.sensRange.value);
  ui.el.sensVal.textContent = player.sensitivity.toFixed(1);
});
ui.el.volRange.addEventListener('input', () => {
  audio.setVolume(parseInt(ui.el.volRange.value, 10) / 100);
  ui.el.volVal.textContent = ui.el.volRange.value;
});
ui.el.musicToggle.addEventListener('change', () => {
  audio.setMusic(ui.el.musicToggle.checked);
});

/* ---------- testing hooks ---------- */
window.render_game_to_text = () => {
  return JSON.stringify({
    note: 'origin at arena center; +x east, +z south, y up. arena is 60x60 (half=30).',
    phase: game.phase,
    mode: game.modeId,
    coins: profile.coins,
    runCoins: game.runCoins,
    skin: profile.equipped,
    timeLeft: enemies.timeLeft == null ? null : +enemies.timeLeft.toFixed(1),
    multiplier: enemies.multiplier,
    cooldowns: { dash: +player.cd.dash.toFixed(1), shock: +player.cd.shock.toFixed(1), overdrive: +player.cd.overdrive.toFixed(1) },
    overdriveT: +player.overdriveT.toFixed(1),
    onGround: player.onGround,
    projectiles: enemies.projectiles.length,
    player: {
      x: +player.pos.x.toFixed(2),
      y: +player.pos.y.toFixed(2),
      z: +player.pos.z.toFixed(2),
      yaw: +player.yaw.toFixed(2),
      health: Math.round(player.health),
      ammo: player.ammo,
      reloading: player.reloading,
      alive: player.alive,
    },
    score: game.score,
    wave: enemies.wave,
    waveState: enemies.waveState,
    hostiles: enemies.enemies.map((e) => ({
      type: e.type, x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), hp: Math.round(e.hp), boss: !!e.isBoss,
    })),
    pendingSpawns: enemies.pendingSpawns.length,
    pickups: enemies.pickups.map((p) => ({ kind: p.kind, x: +p.mesh.position.x.toFixed(1), z: +p.mesh.position.z.toFixed(1) })),
    kills: enemies.kills,
  });
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) tick(1 / 60);
  render();
};

/* ---------- main loop ---------- */
const clock = new THREE.Clock();

function tick(dt) {
  world.update(dt, clock.elapsedTime);
  player.update(dt);
  enemies.update(cheats.slowmo ? dt * 0.4 : dt, clock.elapsedTime);
  applyWallhack(enemies.enemies);
  effects.update(dt);
}

function render() {
  renderer.info.reset();
  composer.render();
}

let rafId = null;
/* debug handles (also used by automated tests) */
window.__game = { cheats, cheatUI, lock, profile, MODES, SKINS, ABILITIES, renderer, scene, camera, composer, world, effects, player, enemies, game, ui, audio, bloomPass };
window.__THREE = THREE;

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  tick(dt);
  render();
  updateDebug();
}
animate();

/* pause game loop rendering still runs (menu shows scene behind overlay) */
