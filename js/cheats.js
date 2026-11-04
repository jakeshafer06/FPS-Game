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
  fly: false,        // no gravity: SPACE up, C down
  noclip: false,     // walk through walls
  superJump: false,  // jump ~6x higher
  rapidFire: false,  // 3x fire rate
  explosive: false,  // every bullet explodes
};

/* Cheat arsenal — swap with 1-6 once the console has been opened, or pick in the console */
export const GUNS = {
  rifle:   { id: 'rifle',   key: 1, name: 'PULSE RIFLE',     desc: 'Stock issue',                         interval: 0.115, dmg: 26,  mag: 30,  reload: 1.15, spread: 0.006, pellets: 1, kick: 0.02 },
  minigun: { id: 'minigun', key: 2, name: 'MINIGUN',         desc: '28 rounds a second, 250 belt',        interval: 0.036, dmg: 16,  mag: 250, reload: 2.2,  spread: 0.03,  pellets: 1, kick: 0.006 },
  shotgun: { id: 'shotgun', key: 3, name: 'SCATTERGUN',      desc: '10 pellets per blast',                interval: 0.62,  dmg: 15,  mag: 8,   reload: 1.4,  spread: 0.11,  pellets: 10, kick: 0.07 },
  railgun: { id: 'railgun', key: 4, name: 'RAILGUN',         desc: 'Pierces everything, even walls',      interval: 0.85,  dmg: 240, mag: 6,   reload: 1.6,  spread: 0,     pellets: 1, kick: 0.09, pierce: true },
  rocket:  { id: 'rocket',  key: 5, name: 'ROCKET LAUNCHER', desc: 'Huge splash damage',                  interval: 0.7,   dmg: 60,  mag: 6,   reload: 1.8,  spread: 0,     pellets: 1, kick: 0.08, splash: 6.5, splashDmg: 150 },
  zapper:  { id: 'zapper',  key: 6, name: 'CHAIN ZAPPER',    desc: 'Lightning arcs to 5 targets',         interval: 0.2,   dmg: 34,  mag: 40,  reload: 1.3,  spread: 0,     pellets: 1, kick: 0.015, chain: 5 },
};
export const cheatGun = { id: 'rifle', unlocked: false };

export const CHEAT_LIST = [
  ['aimbot', 'AIMBOT', 'Hold fire to lock onto the nearest clanker or rival'],
  ['wallhack', 'WALLHACK', 'See clankers and rivals through walls'],
  ['god', 'GOD MODE', 'Take no damage'],
  ['oneShot', 'ONE-SHOT', 'Every hit is a kill'],
  ['infAmmo', 'INFINITE AMMO', 'Never reload'],
  ['noCooldown', 'NO COOLDOWNS', 'Spam Q / E / F'],
  ['speed', 'SPEED BOOST', 'Move 1.8x faster'],
  ['slowmo', 'SLOW-MO CLANKERS', 'Enemies move at 40% speed'],
  ['fly', 'FLY', 'SPACE to rise, C to drop'],
  ['noclip', 'NOCLIP', 'Walk straight through walls'],
  ['superJump', 'SUPER JUMP', 'Launch yourself across the map'],
  ['rapidFire', 'RAPID FIRE', 'Every gun fires 3x faster'],
  ['explosive', 'EXPLOSIVE AMMO', 'Every bullet blows up'],
];

export function anyCheatOn() {
  return Object.values(cheats).some(Boolean) || cheatGun.id !== 'rifle';
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
    if (!e || !e.mesh) continue;
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
export function initCheats({ onOpen, onClose, onCoins, onUnlockAll, onGun, canOpen }) {
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
    const guns = document.getElementById('cheat-guns');
    if (guns) {
      guns.innerHTML = '';
      for (const g of Object.values(GUNS)) {
        const b = document.createElement('button');
        b.className = 'cheat-gun' + (cheatGun.id === g.id ? ' on' : '');
        b.dataset.gun = g.id;
        b.innerHTML = `<span class="cg-key">${g.key}</span><span class="cg-name">${g.name}</span><span class="cg-desc">${g.desc}</span>`;
        b.addEventListener('click', () => { onGun && onGun(g.id); renderList(); });
        guns.appendChild(b);
      }
    }
    badge.classList.toggle('hidden', !anyCheatOn());
  }

  function open() {
    if (!panel.classList.contains('hidden')) return;
    if (canOpen && !canOpen()) return;
    cheatGun.unlocked = true;
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
