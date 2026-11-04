// Secret developer console. Unlock by typing the code below anywhere
// (menu, pause, or mid-game), or by tapping the menu title 5 times quickly.
// Every letter in the code is a key the game doesn't use, so typing it mid-fight is safe.
import * as THREE from 'three';

export const CHEAT_CODE = 'IMBOT';

export const cheats = {
  aimbot: false,     // snaps aim to the nearest visible clanker while firing
  god: false,        // no damage
  infAmmo: false,    // never reload
  noCooldown: false, // abilities always ready
  oneShot: false,    // every hit kills
  speed: false,      // 1.8x move speed
  wallhack: false,   // see clankers through walls
  slowmo: false,     // clankers move at 40% speed
};

export const CHEAT_LIST = [
  ['aimbot', 'AIMBOT', 'Hold fire to lock onto the nearest visible clanker'],
  ['wallhack', 'WALLHACK', 'See clankers through walls'],
  ['god', 'GOD MODE', 'Take no damage'],
  ['oneShot', 'ONE-SHOT', 'Every hit is a kill'],
  ['infAmmo', 'INFINITE AMMO', 'Never reload'],
  ['noCooldown', 'NO COOLDOWNS', 'Spam Q / E / F'],
  ['speed', 'SPEED BOOST', 'Move 1.8x faster'],
  ['slowmo', 'SLOW-MO CLANKERS', 'Enemies move at 40% speed'],
];

export function anyCheatOn() {
  return Object.values(cheats).some(Boolean);
}

/* ---- aimbot ---- */
const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Returns the best target (smallest angle off-crosshair with clear line of sight) or null.
export function findAimTarget(player, enemies, world) {
  const cam = player.camera;
  cam.getWorldPosition(_from);
  const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    _to.copy(e.pos);
    _dir.subVectors(_to, _from);
    const dist = _dir.length();
    if (dist < 0.5 || dist > 70) continue;
    _dir.divideScalar(dist);
    // horizontal angle off the view direction; ignore things behind us
    const dot = _dir.x * fwdX + _dir.z * fwdZ;
    if (dot < Math.cos(Math.PI * 0.42)) continue;
    // line of sight: nothing solid before the enemy
    _ray.set(_from, _dir);
    _ray.far = dist - 0.6;
    if (_ray.intersectObjects(world.raycastTargets, false).length > 0) continue;
    const score = (1 - dot) * 40 + dist * 0.05 + (e.isBoss ? -0.5 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

export function aimAt(player, target, dt) {
  const cam = player.camera;
  cam.getWorldPosition(_from);
  const dx = target.pos.x - _from.x, dy = target.pos.y - _from.y, dz = target.pos.z - _from.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  let dYaw = wantYaw - player.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const k = Math.min(1, dt * 28); // very fast but not a single-frame teleport
  player.yaw += dYaw * k;
  player.pitch += (wantPitch - player.pitch) * k;
}

/* ---- wallhack: draw enemy materials on top of everything ---- */
export function applyWallhack(enemies) {
  for (const e of enemies) {
    if (e._wh === cheats.wallhack) continue;
    e._wh = cheats.wallhack;
    e.mesh.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.depthTest = !cheats.wallhack; m.needsUpdate = true; }
      o.renderOrder = cheats.wallhack ? 999 : 0;
    });
  }
}

/* ---- UI ---- */
export function initCheats({ onOpen, onClose, onCoins, onUnlockAll }) {
  const panel = document.getElementById('cheat-panel');
  const list = document.getElementById('cheat-list');
  const badge = document.getElementById('cheat-badge');
  let buffer = '';

  function renderList() {
    list.innerHTML = '';
    for (const [key, label, desc] of CHEAT_LIST) {
      const b = document.createElement('button');
      b.className = 'cheat-toggle' + (cheats[key] ? ' on' : '');
      b.dataset.cheat = key;
      b.innerHTML = `<span class="ct-state">${cheats[key] ? 'ON' : 'OFF'}</span><span class="ct-label">${label}</span><span class="ct-desc">${desc}</span>`;
      b.addEventListener('click', () => { cheats[key] = !cheats[key]; renderList(); });
      list.appendChild(b);
    }
    badge.classList.toggle('hidden', !anyCheatOn());
  }

  function open() {
    if (!panel.classList.contains('hidden')) return;
    onOpen && onOpen();
    renderList();
    panel.classList.remove('hidden');
  }
  function close() {
    if (panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    onClose && onClose();
  }
  function toggle() { panel.classList.contains('hidden') ? open() : close(); }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Escape' && !panel.classList.contains('hidden')) { e.stopImmediatePropagation(); close(); return; }
    if (!e.key || e.key.length !== 1) return;
    buffer = (buffer + e.key.toUpperCase()).slice(-CHEAT_CODE.length);
    if (buffer === CHEAT_CODE) { buffer = ''; toggle(); }
  }, true);

  // mobile-friendly: tap the menu title 5 times within 2 seconds
  const title = document.querySelector('#start-screen .title');
  let taps = [];
  if (title) title.addEventListener('click', () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 2000);
    taps.push(now);
    if (taps.length >= 5) { taps = []; open(); }
  });

  document.getElementById('cheat-close').addEventListener('click', close);
  document.getElementById('cheat-all').addEventListener('click', () => { for (const [k] of CHEAT_LIST) cheats[k] = true; renderList(); });
  document.getElementById('cheat-none').addEventListener('click', () => { for (const [k] of CHEAT_LIST) cheats[k] = false; renderList(); });
  document.getElementById('cheat-coins').addEventListener('click', () => onCoins && onCoins(5000));
  document.getElementById('cheat-unlock').addEventListener('click', () => onUnlockAll && onUnlockAll());

  return { open, close, toggle, isOpen: () => !panel.classList.contains('hidden'), renderList };
}
