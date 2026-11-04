/* Online 1v1 duels — peer-to-peer over WebRTC (PeerJS).
   One player hosts a room and shares a 5-letter code; the other joins with it.
   The free PeerJS cloud broker (0.peerjs.com) only introduces the two browsers —
   all game traffic then flows directly between them.

   Netcode model (built for playing with friends, not anti-cheat):
   - each client owns its own movement and sends state ~20x/sec
   - the shooter checks hits against where it SEES the rival and sends a "hit"
   - the victim applies damage to itself and announces its own death
   - first to KILL_TARGET or most kills when the clock runs out (host decides time-out) */
import * as THREE from 'three';
import { getSkin } from './skins.js';
import { cheats } from './cheats.js';

const PEER_PREFIX = 'shootclankers-v1-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PROTOCOL = 1;

export const DUEL = {
  killTarget: 10,
  time: 300,          // seconds
  respawn: 3,
  spawnShield: 1.2,
  gunScale: 0.5,      // pulse rifle does 13 per body shot vs players
  headMult: 1.6,
  shockDmg: 35,
  regenDelay: 4,
  regenRate: 12,      // hp / sec
  killCoins: 3,
  winCoins: 40,
  lossCoins: 12,
  sendRate: 20,
};

const SPAWNS = [
  { x: 0, z: 24, yaw: 0 },
  { x: 0, z: -24, yaw: Math.PI },
  { x: 26, z: 4, yaw: Math.PI / 2 },
  { x: -26, z: -4, yaw: -Math.PI / 2 },
];

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './vendor/peerjs/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve() : reject(new Error('Networking library failed to start')));
    s.onerror = () => reject(new Error('Could not load the networking library'));
    document.head.appendChild(s);
  });
}

function makeCode() {
  let c = '';
  const buf = new Uint32Array(5);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  for (let i = 0; i < 5; i++) c += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return c;
}

function cleanName(n) {
  return (String(n || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 14)) || 'OPERATOR';
}

function r2(v) { return Math.round(v * 100) / 100; }

function makeNameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 54px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 256, 50);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.2, 0.41, 1);
  return s;
}

/* ---------- the rival operator, rendered on this client ---------- */
class RivalAvatar {
  constructor(scene, duel) {
    this.scene = scene;
    this.duel = duel;
    this.type = 'rival';
    this.isBoss = false;
    this.alive = false;
    this.pos = new THREE.Vector3(0, 1.65, -24); // eye position (matches player.pos convention)
    this.target = this.pos.clone();
    this.knock = new THREE.Vector3();           // shockwave code writes here; unused for players
    this.yaw = 0; this.targetYaw = 0;
    this.pitch = 0;
    this.walkT = 0;
    this.flashT = 0;
    this.mesh = new THREE.Group();
    this.mesh.userData.enemyRef = this;          // lets player.shoot() treat us as a target
    this._build();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  _build() {
    const body = new THREE.MeshStandardMaterial({ color: 0x1b2533, roughness: 0.45, metalness: 0.7 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x2b3a4f, roughness: 0.5, metalness: 0.6 });
    this.accent = new THREE.MeshStandardMaterial({ color: 0x0c1622, emissive: 0xff2e6b, emissiveIntensity: 1.4 });
    this.gunMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.35, metalness: 0.8 });
    this.mats = [body, armor, this.accent, this.gunMat];
    const box = (w, h, d, m, x, y, z, name) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      if (name) mesh.name = name;
      return mesh;
    };
    // all positions are relative to the feet (y=0); group is placed at feet
    this.legL = new THREE.Group(); this.legL.position.set(-0.17, 0.9, 0);
    this.legL.add(box(0.2, 0.9, 0.24, armor, 0, -0.45, 0));
    this.legR = new THREE.Group(); this.legR.position.set(0.17, 0.9, 0);
    this.legR.add(box(0.2, 0.9, 0.24, armor, 0, -0.45, 0));
    this.mesh.add(this.legL, this.legR);
    const torso = new THREE.Group(); torso.position.y = 0.9;
    torso.add(box(0.62, 0.62, 0.36, body, 0, 0.32, 0));
    torso.add(box(0.5, 0.08, 0.04, this.accent, 0, 0.42, -0.19));     // chest light bar
    torso.add(box(0.7, 0.16, 0.42, armor, 0, 0.6, 0));                // shoulders
    torso.add(box(0.26, 0.3, 0.14, armor, 0, 0.28, 0.22));            // backpack
    torso.add(box(0.06, 0.22, 0.06, this.accent, 0, 0.35, 0.3));       // backpack beacon
    this.torso = torso;
    this.mesh.add(torso);
    // head pivots with pitch
    const head = new THREE.Group(); head.position.y = 1.62;
    head.add(box(0.34, 0.3, 0.34, body, 0, 0.02, 0, 'head'));
    head.add(box(0.28, 0.08, 0.04, this.accent, 0, 0.04, -0.18, 'head')); // visor
    head.add(box(0.04, 0.16, 0.04, this.accent, 0.12, 0.24, 0.05));        // antenna
    this.head = head;
    this.mesh.add(head);
    // arms + rifle, pivot at shoulder so they follow pitch
    const arms = new THREE.Group(); arms.position.set(0, 1.42, 0);
    arms.add(box(0.14, 0.14, 0.5, armor, -0.3, -0.06, -0.2));
    arms.add(box(0.14, 0.14, 0.5, armor, 0.3, -0.06, -0.2));
    arms.add(box(0.12, 0.16, 0.8, this.gunMat, 0.14, -0.04, -0.55));
    arms.add(box(0.05, 0.05, 0.5, this.accent, 0.14, 0.06, -0.6));
    this.arms = arms;
    this.mesh.add(arms);
    this.light = new THREE.PointLight(0xff2e6b, 3, 5, 2);
    this.light.position.set(0, 1.4, -0.4);
    this.mesh.add(this.light);
    this.tagColor = '#ff6b93';
    this.setName('RIVAL');
  }

  setName(name) {
    if (this.tag) { this.mesh.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.tag = makeNameTag(name, this.tagColor);
    this.tag.position.y = 2.25;
    this.mesh.add(this.tag);
  }

  setSkin(id) {
    const skin = getSkin(id);
    this.skinId = skin.id;
    this.gunMat.color.setHex(skin.body);
    this.gunMat.metalness = skin.metal;
    this.accent.emissive.setHex(skin.accent);
    this.light.color.setHex(skin.accent);
    this.tracer = skin.tracer;
    this.animated = !!skin.animated;
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z); this.target.set(x, y, z);
    this.yaw = this.targetYaw = yaw;
  }

  // called by player.shoot() / shockwave when our rival model is hit
  hit(dmg, point, dir, source) {
    if (!this.alive) return false;
    let d, head = false;
    if (source === 'shock') d = DUEL.shockDmg;
    else {
      head = point && point.y > this.pos.y - 0.2;
      d = dmg * DUEL.gunScale * (head ? DUEL.headMult : 1);
    }
    this.flashT = 0.08;
    this.duel._sendHit(d, source, dir, head);
    return false; // the victim confirms kills
  }

  update(dt, t) {
    this.mesh.visible = this.alive;
    if (!this.alive) return;
    // smooth toward the latest network position
    const k = Math.min(1, dt * 14);
    const moved = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
    if (moved > 6) this.pos.copy(this.target); // teleport/dash/respawn — snap
    else this.pos.lerp(this.target, k);
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    this.mesh.position.set(this.pos.x, this.pos.y - 1.65, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch * 0.6;
    this.arms.rotation.x = this.pitch;
    // walk cycle from network speed
    const spd = Math.min(1, (this.netSpeed || 0) / 7);
    this.walkT += dt * (6 + spd * 6) * (spd > 0.05 ? 1 : 0);
    const sw = Math.sin(this.walkT) * 0.6 * spd;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.torso.position.y = 0.9 + Math.abs(Math.cos(this.walkT)) * 0.04 * spd;
    if (this.animated) {
      const c = new THREE.Color().setHSL((t * 0.25) % 1, 1, 0.6);
      this.accent.emissive.copy(c); this.light.color.copy(c);
    }
    if (this.flashT > 0) { this.flashT -= dt; this.accent.emissiveIntensity = 4; }
    else this.accent.emissiveIntensity = this.overdrive ? 2.6 + Math.sin(t * 20) * 0.6 : 1.4;
  }
}

/* ---------- duel controller ---------- */
export class Duel {
  constructor({ scene, world, effects, audio, ui, player, game, profile, saveProfile, onExit }) {
    Object.assign(this, { scene, world, effects, audio, ui, player, game, profile, saveProfile, onExit });
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.code = null;
    this.state = 'idle'; // idle | connecting | hosting | joining | lobby-ready | match | over
    this.avatar = new RivalAvatar(scene, this);
    this.scores = { me: 0, them: 0 };
    this.oppName = 'RIVAL';
    this.sendT = 0;
    this.pingT = 0;
    this.ping = null;
    this.lastHurtT = 99;
    this.respawnT = 0;
    this.timeLeft = DUEL.time;
    this.wantRematch = false;
    this.oppWantsRematch = false;
    this._savedCheats = null;
    this._bindLobby();
  }

  get inMatch() { return this.state === 'match'; }
  get active() { return this.state === 'match' || this.state === 'over'; }
  get avatarTarget() { return this.inMatch && this.avatar.alive ? this.avatar : null; }

  /* ===== lobby UI ===== */
  _bindLobby() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      screen: $('lobby-screen'), name: $('lobby-name'), hostBtn: $('lobby-host-btn'), codeWrap: $('lobby-code-wrap'),
      code: $('lobby-code'), copyBtn: $('lobby-copy-btn'), joinCode: $('lobby-join-code'), joinBtn: $('lobby-join-btn'),
      status: $('lobby-status'), back: $('lobby-back-btn'),
      hud: $('duel-hud'), meName: $('duel-me-name'), themName: $('duel-them-name'), me: $('duel-me'), them: $('duel-them'),
      time: $('duel-time'), target: $('duel-target'), dead: $('duel-dead'), deadSub: $('duel-dead-sub'), ping: $('duel-ping'),
    };
    this.el.hostBtn.addEventListener('click', () => this.host());
    this.el.joinBtn.addEventListener('click', () => this.join(this.el.joinCode.value));
    this.el.joinCode.addEventListener('input', () => {
      this.el.joinCode.value = this.el.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    this.el.joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(this.el.joinCode.value); });
    this.el.name.addEventListener('change', () => { this.profile.name = cleanName(this.el.name.value); this.el.name.value = this.profile.name; this.saveProfile(); });
    this.el.copyBtn.addEventListener('click', () => this._copyInvite());
    this.el.back.addEventListener('click', () => { this.leave(); this.onExit && this.onExit(); });
  }

  _bindUnload() {
    if (this._unloadBound) return;
    this._unloadBound = true;
    window.addEventListener('pagehide', () => { if (this.conn) { try { this._send({ t: 'bye' }); } catch (e) {} } });
  }

  openLobby(prefillCode) {
    this._bindUnload();
    this.el.name.value = this.profile.name || '';
    if (prefillCode) this.el.joinCode.value = String(prefillCode).toUpperCase().slice(0, 5);
    this.el.codeWrap.classList.add('hidden');
    this.el.hostBtn.disabled = false; this.el.joinBtn.disabled = false;
    this._status(prefillCode ? 'Invite code loaded — press JOIN ROOM.' : '');
    this.game.phase = 'lobby';
    this.ui.setPhase('lobby');
    this.el.screen.classList.remove('hidden');
  }

  closeLobby() { this.el.screen.classList.add('hidden'); }

  _status(text, kind = '') {
    this.el.status.textContent = text;
    this.el.status.className = 'lobby-status' + (kind ? ' ' + kind : '');
  }

  _myName() {
    const n = cleanName(this.el.name.value || this.profile.name);
    if (this.profile.name !== n) { this.profile.name = n; this.saveProfile(); }
    return n;
  }

  _inviteLink() {
    const base = location.href.split('#')[0];
    return `${base}#join=${this.code}`;
  }

  async _copyInvite() {
    const text = this._inviteLink();
    try { await navigator.clipboard.writeText(text); this._status('Invite link copied. Waiting for your rival to join…'); }
    catch (e) { this._status(`Share this code: ${this.code}`); }
  }

  /* ===== connection ===== */
  async _makePeer(id) {
    await loadPeerJS();
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(id, {
        debug: 0,
        config: { iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ] },
      });
      let opened = false;
      peer.on('open', () => { opened = true; resolve(peer); });
      peer.on('error', (err) => {
        if (!opened) { try { peer.destroy(); } catch (e) {} reject(err); return; }
        this._onPeerError(err);
      });
      peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
    });
  }

  async host() {
    this.leave(true);
    this._myName();
    this.isHost = true;
    this.state = 'connecting';
    this.el.hostBtn.disabled = true; this.el.joinBtn.disabled = true;
    this._status('Opening a room…');
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      try {
        this.peer = await this._makePeer(PEER_PREFIX + code);
        this.code = code;
        break;
      } catch (err) {
        if (err && err.type === 'unavailable-id') continue;
        this._fail(err); return;
      }
    }
    if (!this.peer) { this._fail(new Error('Could not reserve a room code')); return; }
    this.state = 'hosting';
    this.el.code.textContent = this.code;
    this.el.codeWrap.classList.remove('hidden');
    this._status('Room open. Send the code to your rival — waiting for them to join…');
    this.peer.on('connection', (conn) => {
      if (this.conn) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this._attach(conn);
    });
  }

  async join(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { this._status('Room codes are 5 characters.', 'error'); return; }
    this.leave(true);
    this._myName();
    this.isHost = false;
    this.state = 'connecting';
    this.el.hostBtn.disabled = true; this.el.joinBtn.disabled = true;
    this._status(`Connecting to room ${code}…`);
    try { this.peer = await this._makePeer(undefined); }
    catch (err) { this._fail(err); return; }
    this.state = 'joining';
    this.code = code;
    const conn = this.peer.connect(PEER_PREFIX + code, { serialization: 'json', reliable: true });
    this._attach(conn);
    this._joinTimer = setTimeout(() => {
      if (this.state === 'joining') this._fail(new Error(`Couldn't reach room ${code}. Check the code, or the networks may be blocking direct connections.`));
    }, 15000);
  }

  _attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      clearTimeout(this._joinTimer);
      this._send({ t: 'hello', v: PROTOCOL, name: this._myName(), skin: this.profile.equipped });
      this._status('Connected. Syncing…', 'ok');
    });
    conn.on('data', (msg) => this._onData(msg));
    conn.on('close', () => this._onDisconnect());
    conn.on('error', () => this._onDisconnect());
  }

  _onPeerError(err) {
    if (this.state === 'joining' && err && err.type === 'peer-unavailable') {
      this._fail(new Error(`Room ${this.code} doesn't exist (or the host closed it).`));
    } else if (this.state !== 'match' && this.state !== 'over') {
      this._fail(err);
    }
  }

  _fail(err) {
    const msg = (err && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error'))
      ? 'Could not reach the matchmaking service. Check your connection and try again.'
      : (err && err.message) || 'Connection failed.';
    this.leave(true);
    this._status(msg, 'error');
    this.el.hostBtn.disabled = false; this.el.joinBtn.disabled = false;
  }

  _send(msg) {
    if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (e) {} }
  }

  leave(silent = false) {
    clearTimeout(this._joinTimer);
    clearTimeout(this._startTimer);
    if (this.conn) { try { this._send({ t: 'bye' }); } catch (e) {} }
    const conn = this.conn, peer = this.peer;
    this.conn = null; this.peer = null;
    setTimeout(() => { try { conn && conn.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} }, 150);
    const wasActive = this.active;
    this.state = 'idle';
    this.avatar.alive = false;
    this.avatar.mesh.visible = false;
    this._showHud(false);
    this.el.dead.classList.add('hidden');
    if (wasActive) this._restoreCheats();
    this.game.onPlayerDeath = null;
    this.code = null;
    if (!silent) this._status('');
  }

  _onDisconnect() {
    if (!this.conn) return; // we left on purpose
    const wasMatch = this.state === 'match';
    const wasOver = this.state === 'over';
    this.conn = null;
    if (wasMatch) { this._end('disconnect'); return; }
    if (wasOver) { this.ui.el.goBest.textContent = 'RIVAL LEFT THE ROOM'; this.ui.el.restartBtn.disabled = true; return; }
    this.leave(true);
    this._status('Your rival disconnected.', 'error');
    this.el.hostBtn.disabled = false; this.el.joinBtn.disabled = false;
  }

  /* ===== messages ===== */
  _onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    this.lastRecv = performance.now();
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL) { this._status('Your rival is on a different game version — both refresh the page.', 'error'); return; }
        this.oppName = cleanName(msg.name);
        this.avatar.setName(this.oppName);
        this.avatar.setSkin(msg.skin || 'stock');
        if (this.isHost) {
          this._status(`${this.oppName} joined. Match starting…`, 'ok');
          this._startTimer = setTimeout(() => this._hostStart(), 1500);
        } else {
          this._status(`Joined ${this.oppName}'s room. Match starting…`, 'ok');
        }
        break;
      }
      case 'full': this._fail(new Error('That room already has two players.')); break;
      case 'start': if (!this.isHost) this._beginMatch(msg); break;
      case 's': this._onState(msg); break;
      case 'shot': {
        if (!this.inMatch) break;
        const from = new THREE.Vector3().fromArray(msg.f), to = new THREE.Vector3().fromArray(msg.e);
        this.effects.tracer(from, to, msg.c);
        this.audio.shoot && this.audio.shoot(false);
        break;
      }
      case 'shock': {
        if (!this.inMatch) break;
        this.effects.shockwave(new THREE.Vector3().fromArray(msg.p), msg.c, 9, 0.55);
        this.audio.shockwave && this.audio.shockwave();
        break;
      }
      case 'hit': this._onHit(msg); break;
      case 'died': this._onRivalDied(msg); break;
      case 'end': if (!this.isHost && this.inMatch) { this.scores.me = msg.g; this.scores.them = msg.h; this._end('time'); } break;
      case 'rematch': this.oppWantsRematch = true; this._checkRematch(); break;
      case 'ping': this._send({ t: 'pong', ts: msg.ts }); break;
      case 'pong': this.ping = Math.round(performance.now() - msg.ts); break;
      case 'bye': this._onDisconnect(); break;
    }
  }

  _onState(m) {
    if (!this.inMatch) return;
    const a = this.avatar;
    const was = a.alive;
    a.target.fromArray(m.p);
    a.targetYaw = m.y;
    a.pitch = m.pi;
    a.alive = !!m.a;
    a.overdrive = !!m.od;
    a.netSpeed = m.sp || 0;
    if (m.sk && m.sk !== a.skinId) a.setSkin(m.sk);
    if (a.alive && !was) a.pos.copy(a.target);
  }

  _onHit(m) {
    if (!this.inMatch || !this.player.alive || this.player.invuln > 0) return;
    this.lastHurtT = 0;
    this._lastHitHead = !!m.hd;
    this._lastHitKind = m.k;
    if (m.k === 'shock' && m.kn) { this.player.vel.x += m.kn[0] * 10; this.player.vel.z += m.kn[1] * 10; this.player.vel.y = Math.max(this.player.vel.y, 4); }
    this.player.damage(m.d);
  }

  _sendHit(d, source, dir, head) {
    if (!this.inMatch) return;
    const msg = { t: 'hit', d: Math.round(d * 10) / 10, k: source, hd: head ? 1 : 0 };
    if (source === 'shock' && dir) msg.kn = [r2(dir.x), r2(dir.z)];
    this._send(msg);
    if (head) this.ui.killToast('HEADSHOT', 0, false);
  }

  /* ===== match flow ===== */
  _hostStart() {
    if (!this.conn || !this.isHost) return;
    const msg = { t: 'start', time: DUEL.time, target: DUEL.killTarget };
    this._send(msg);
    this._beginMatch(msg);
  }

  _beginMatch(msg) {
    this.lastRecv = performance.now();
    this.closeLobby();
    this._disableCheats();
    this.state = 'match';
    this.scores = { me: 0, them: 0 };
    this.timeLeft = msg.time || DUEL.time;
    this.wantRematch = false; this.oppWantsRematch = false;
    this.ui.el.restartBtn.disabled = false;
    this.game.onPlayerDeath = () => this._onLocalDeath();
    this.game.beginDuel();                           // main.js: resets player, enemies, HUD, music, pointer lock
    const mine = SPAWNS[this.isHost ? 0 : 1], theirs = SPAWNS[this.isHost ? 1 : 0];
    this._spawnLocal(mine);
    this.avatar.place(theirs.x, 1.65, theirs.z, theirs.yaw);
    this.avatar.alive = true;
    this.el.meName.textContent = this._myName();
    this.el.themName.textContent = this.oppName;
    this.el.target.textContent = `FIRST TO ${msg.target || DUEL.killTarget}`;
    this._renderScore();
    this._showHud(true);
    this.ui.waveBanner('1V1 DUEL', `VS ${this.oppName}`);
    this.audio.waveStart && this.audio.waveStart();
  }

  _spawnLocal(sp) {
    const p = this.player;
    p.reset();
    p.pos.set(sp.x, 1.65, sp.z);
    p.yaw = sp.yaw;
    p.invuln = DUEL.spawnShield;
    p._applyCamera();
    this.lastHurtT = 99;
  }

  _pickRespawn() {
    const a = this.avatar.pos;
    let best = SPAWNS[0], bestD = -1;
    for (const s of SPAWNS) {
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  _onLocalDeath() {
    if (!this.inMatch) return false;
    this.scores.them++;
    this._send({ t: 'died', k: this._lastHitKind || 'gun', hd: this._lastHitHead ? 1 : 0 });
    this.effects.explosion(this.player.pos.x, this.player.pos.y - 0.8, this.player.pos.z, 0x29e6ff);
    this.audio.gameOver && this.audio.gameOver();
    this.respawnT = DUEL.respawn;
    this.el.dead.classList.remove('hidden');
    this.el.deadSub.textContent = `BY ${this.oppName}`;
    this._renderScore();
    this._checkWin();
    return true; // handled — no game over
  }

  _onRivalDied(m) {
    if (!this.inMatch) return;
    this.scores.me++;
    const a = this.avatar;
    this.effects.explosion(a.pos.x, a.pos.y - 0.8, a.pos.z, 0xff2e6b);
    a.alive = false; a.mesh.visible = false;
    this.audio.enemyDeath && this.audio.enemyDeath(true);
    this.ui.hitmarker && this.ui.hitmarker(true);
    this.game.addCoins(DUEL.killCoins);
    this.ui.killToast(`${m.hd ? 'HEADSHOT · ' : ''}${this.oppName} ELIMINATED`, DUEL.killCoins, true);
    this._renderScore();
    this._checkWin();
  }

  _checkWin() {
    if (this.scores.me >= DUEL.killTarget || this.scores.them >= DUEL.killTarget) {
      setTimeout(() => { if (this.inMatch) this._end('score'); }, 600);
    }
  }

  _end(reason) {
    if (this.state !== 'match') return;
    this.state = 'over';
    this.el.dead.classList.add('hidden');
    this.avatar.alive = false;
    this.avatar.mesh.visible = false;
    this.game.onPlayerDeath = null;
    const { me, them } = this.scores;
    const forfeit = reason === 'disconnect';
    const win = forfeit || me > them;
    const draw = !forfeit && me === them;
    const coins = win ? DUEL.winCoins : draw ? Math.round((DUEL.winCoins + DUEL.lossCoins) / 2) : DUEL.lossCoins;
    this.game.addCoins(coins);
    this.profile.duel = this.profile.duel || { wins: 0, losses: 0, draws: 0 };
    if (win) this.profile.duel.wins++; else if (draw) this.profile.duel.draws++; else this.profile.duel.losses++;
    this.saveProfile();
    this._restoreCheats();
    this._showHud(false);
    this.game.endDuel({
      kicker: forfeit ? 'RIVAL DISCONNECTED' : reason === 'time' ? 'TIME' : 'DUEL COMPLETE',
      title: win ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT',
      good: win || draw,
      sub: `1V1 ONLINE — VS ${this.oppName}`,
      me, them, coins,
      record: `RECORD ${this.profile.duel.wins}W · ${this.profile.duel.losses}L${this.profile.duel.draws ? ' · ' + this.profile.duel.draws + 'D' : ''}`,
      canRematch: !forfeit && !!this.conn,
    });
    if (this.isHost && reason !== 'time' && reason !== 'disconnect') { /* both sides reach the same result by score */ }
  }

  requestRematch() {
    if (!this.conn) return;
    this.wantRematch = true;
    this._send({ t: 'rematch' });
    this.ui.el.goBest.textContent = this.oppWantsRematch ? 'STARTING…' : `WAITING FOR ${this.oppName}…`;
    this.ui.el.restartBtn.disabled = true;
    this._checkRematch();
  }

  _checkRematch() {
    if (this.state !== 'over') return;
    if (!this.wantRematch) { this.ui.el.goBest.textContent = `${this.oppName} WANTS A REMATCH`; return; }
    if (this.oppWantsRematch && this.isHost) setTimeout(() => this._hostStart(), 600);
  }

  /* ===== per-frame ===== */
  update(dt, t) {
    if (!this.active) return;
    this.avatar.update(dt, t);
    if (this.state !== 'match') return;
    const p = this.player;

    // clock (host is authoritative for time-outs)
    this.timeLeft -= dt;
    const tl = Math.max(0, this.timeLeft);
    this.el.time.textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
    this.el.time.classList.toggle('low', tl <= 30);
    if (this.timeLeft <= 0) {
      if (this.isHost) { this._send({ t: 'end', h: this.scores.me, g: this.scores.them }); this._end('time'); return; }
      if (this.timeLeft < -3) { this._end('time'); return; }
    }

    // respawn
    if (!p.alive) {
      this.respawnT -= dt;
      this.el.dead.querySelector('.dd-count').textContent = Math.max(1, Math.ceil(this.respawnT));
      if (this.respawnT <= 0) { this.el.dead.classList.add('hidden'); this._spawnLocal(this._pickRespawn()); }
    } else if (this.game.phase === 'playing') {
      // regen after a few seconds without taking damage
      this.lastHurtT += dt;
      if (this.lastHurtT > DUEL.regenDelay && p.health < 100) {
        p.health = Math.min(100, p.health + DUEL.regenRate * dt);
        this.ui.setHealth(p.health);
      }
    }

    // send our state
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / DUEL.sendRate;
      const sp = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
      this._send({ t: 's', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], y: r2(p.yaw), pi: r2(p.pitch), a: p.alive ? 1 : 0, od: p.overdriveT > 0 ? 1 : 0, sp: r2(sp), sk: this.profile.equipped });
    }
    // heartbeat: a closed tab can take ~30s to surface as a WebRTC close
    if (this.lastRecv && performance.now() - this.lastRecv > 8000) { this._onDisconnect(); return; }
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 2; this._send({ t: 'ping', ts: performance.now() }); }
    this.el.ping.textContent = this.ping == null ? '' : `${this.ping} MS`;
  }

  // hooks called from player.js
  onLocalShot(from, to, color) {
    if (!this.inMatch) return;
    this._send({ t: 'shot', f: [r2(from.x), r2(from.y), r2(from.z)], e: [r2(to.x), r2(to.y), r2(to.z)], c: color });
  }
  onLocalShock(pos, color) {
    if (!this.inMatch) return;
    this._send({ t: 'shock', p: [r2(pos.x), r2(pos.y), r2(pos.z)], c: color });
  }

  _renderScore() {
    this.el.me.textContent = this.scores.me;
    this.el.them.textContent = this.scores.them;
  }

  _showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
    document.body.classList.toggle('duel-mode', on || this.state === 'over');
    if (!on && this.state !== 'over') document.body.classList.remove('duel-mode');
  }

  /* online matches are always fair: cheats are switched off for the match and restored after */
  _disableCheats() {
    if (this._savedCheats) return;
    this._savedCheats = { ...cheats };
    for (const k in cheats) cheats[k] = false;
  }
  _restoreCheats() {
    if (!this._savedCheats) return;
    Object.assign(cheats, this._savedCheats);
    this._savedCheats = null;
  }

  debugState() {
    return {
      state: this.state, host: this.isHost, code: this.code, scores: { ...this.scores },
      timeLeft: +this.timeLeft.toFixed(1), opp: this.oppName, ping: this.ping,
      rival: { alive: this.avatar.alive, x: r2(this.avatar.pos.x), z: r2(this.avatar.pos.z) },
    };
  }
}
