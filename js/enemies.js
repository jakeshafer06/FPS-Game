import * as THREE from 'three';
import { MODES } from './modes.js';

/* ---------- hostile classes ---------- */
export const TYPES = {
  scout:    { name: 'SCOUT',    hp: 34,  speed: 6.0, dmg: 8,  radius: 0.5,  value: 100,  coins: 1,  scale: 0.8, color: 0xff2e6b },
  sentinel: { name: 'SENTINEL', hp: 85,  speed: 3.4, dmg: 14, radius: 0.75, value: 175,  coins: 2,  scale: 1.0, color: 0xff2e6b },
  spitter:  { name: 'SPITTER',  hp: 60,  speed: 3.2, dmg: 10, radius: 0.6,  value: 225,  coins: 2,  scale: 0.9, color: 0x39ff6e },
  brute:    { name: 'BRUTE',    hp: 210, speed: 2.4, dmg: 24, radius: 1.1,  value: 400,  coins: 4,  scale: 1.5, color: 0xffb020 },
  phantom:  { name: 'PHANTOM',  hp: 55,  speed: 4.6, dmg: 16, radius: 0.6,  value: 300,  coins: 3,  scale: 1.0, color: 0xb24dff },
  warden:   { name: 'WARDEN',   hp: 900, speed: 2.0, dmg: 20, radius: 1.8,  value: 2500, coins: 30, scale: 1.6, color: 0xff3b1f },
};

let G = null;
function geos() {
  if (!G) {
    G = {
      ico: new THREE.IcosahedronGeometry(0.55, 0),
      dodeca: new THREE.DodecahedronGeometry(0.6, 0),
      eye: new THREE.SphereGeometry(0.16, 10, 8),
      fin: new THREE.BoxGeometry(0.5, 0.1, 0.16),
      ring: new THREE.TorusGeometry(0.72, 0.05, 6, 18),
      cone: new THREE.ConeGeometry(0.32, 0.9, 6),
      spike: new THREE.ConeGeometry(0.12, 0.5, 5),
      plate: new THREE.BoxGeometry(1.1, 0.9, 0.08),
      sphere: new THREE.SphereGeometry(0.5, 14, 10),
      tentacle: new THREE.ConeGeometry(0.09, 0.7, 5),
      shard: new THREE.OctahedronGeometry(0.5, 0),
      smallShard: new THREE.OctahedronGeometry(0.16, 0),
      cube: new THREE.BoxGeometry(1, 1, 1),
    };
  }
  return G;
}

function mat(color, emissiveIntensity = 0.18, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: 0x24313f, roughness: 0.4, metalness: 0.7,
    emissive: new THREE.Color(color), emissiveIntensity, ...extra,
  });
}

/* ---------- base enemy ---------- */
class Enemy {
  constructor(type, x, z, manager, opts = {}) {
    const T = TYPES[type];
    this.type = type;
    this.T = T;
    this.manager = manager;
    this.maxHp = Math.round(T.hp * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.speed = T.speed * (0.92 + Math.random() * 0.16) * (opts.speedMult || 1);
    this.radius = T.radius;
    this.value = T.value;
    this.coins = T.coins;
    this.alive = true;
    this.isBoss = false;
    this.pos = new THREE.Vector3(x, 1.35, z);
    this.bobPhase = Math.random() * Math.PI * 2;
    this.attackCd = 1.0;
    this.hitFlash = 0;
    this.knock = new THREE.Vector3();
    this.hoverY = 1.0 + T.scale * 0.35;
    this.facing = new THREE.Vector3(0, 0, 1);
    this.mats = [];
    this.mesh = new THREE.Group();
    this.mesh.userData.enemyRef = this;
    this._buildMesh();
    this.mesh.position.copy(this.pos);
  }

  _mat(color, ei, extra) {
    const m = mat(color, ei, extra);
    this.mats.push(m);
    return m;
  }

  _buildMesh() {}

  /* source: 'gun' | 'shock' */
  hit(dmg, point, dir, source = 'gun') {
    if (!this.alive) return false;
    const final = this.modifyDamage(dmg, dir, source);
    this.hp -= final;
    this.hitFlash = 0.09;
    if (source === 'gun') this.knock.addScaledVector(dir, this.isBoss ? 0.3 : 1.6);
    this.manager.effects.impact(point, final < dmg ? 0xffffff : this.T.color);
    if (this.isBoss) this.manager.ui.setBoss(this.T.name, this.hp / this.maxHp);
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  modifyDamage(dmg) { return dmg; }

  die() {
    this.alive = false;
    const p = this.mesh.position;
    this.manager.effects.explosion(p.x, p.y, p.z, this.T.color);
    if (this.isBoss) {
      this.manager.effects.shockwave(new THREE.Vector3(p.x, 0.3, p.z), this.T.color, 14, 0.9);
      this.manager.ui.setBoss(null);
    }
    this.manager.audio.enemyDeath(this.isBoss);
    this.manager.onEnemyKilled(this);
    this.dispose();
  }

  dispose() {
    this.mesh.removeFromParent();
    for (const m of this.mats) m.dispose();
  }

  /* shared steering: returns desired planar velocity toward `target` with separation */
  _steer(target, enemies, speed = this.speed) {
    const to = new THREE.Vector3().subVectors(target, this.pos);
    to.y = 0;
    const dist = to.length();
    if (dist > 0.001) to.divideScalar(dist);
    // hold position once in melee range so enemies don't clip through the camera
    const vel = to.multiplyScalar(dist < this.radius + 0.9 ? 0 : speed);
    for (const other of enemies) {
      if (other === this || !other.alive) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const minD = this.radius + other.radius + 0.25;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = ((minD - d) / minD) * this.speed * 2.2;
        vel.x += (dx / d) * push;
        vel.z += (dz / d) * push;
      }
    }
    return vel;
  }

  _move(vel, dt, world) {
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    const res = world.collide(this.pos.x + vel.x * dt, this.pos.z + vel.z * dt, this.radius);
    this.pos.x = res.x;
    this.pos.z = res.z;
    this.groundY = res.ground;
    return res.hit;
  }

  _finish(dt, playerPos) {
    this.bobPhase += dt * 2.4;
    const targetY = (this.groundY || 0) + this.hoverY + Math.sin(this.bobPhase) * 0.18;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 6);
    this.mesh.position.copy(this.pos);
    const ang = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.mesh.rotation.y = ang + Math.PI;
    this.facing.set(Math.sin(ang), 0, Math.cos(ang));
  }

  _flash(dt, baseIntensity = 0.18) {
    const body = this.matBody;
    if (!body) return;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      body.emissive.setHex(0xffffff);
      body.emissiveIntensity = 1.2;
    } else {
      body.emissive.setHex(this.T.color);
      body.emissiveIntensity = baseIntensity;
    }
  }

  _tryMelee(dist, dt, reach = 1.5, cd = 1.0) {
    this.attackCd -= dt;
    if (dist < this.radius + reach && this.attackCd <= 0) {
      this.attackCd = cd;
      this.manager.onEnemyAttack(this, this.T.dmg);
      if (this.matEye) this.matEye.emissiveIntensity = 6;
    }
    if (this.matEye) this.matEye.emissiveIntensity = Math.max(2.6, this.matEye.emissiveIntensity - dt * 10);
  }

  update(dt, t, playerPos, enemies, world) {
    if (!this.alive) return;
    this._flash(dt);
    const dist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.behave(dt, t, playerPos, enemies, world, dist);
    this._finish(dt, playerPos);
  }

  behave(dt, t, playerPos, enemies, world, dist) {
    const vel = this._steer(playerPos, enemies);
    this._move(vel, dt, world);
    this._tryMelee(dist, dt);
  }
}

/* ---------- SCOUT: fast dart that weaves side to side ---------- */
class Scout extends Enemy {
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.25);
    this.matEye = this._mat(this.T.color, 2.6, { color: 0x111111 });
    const matFin = this._mat(this.T.color, 0.6, { color: 0x141d29 });
    const body = new THREE.Mesh(g.cone, this.matBody);
    body.rotation.x = -Math.PI / 2;
    body.scale.setScalar(s);
    this.mesh.add(body);
    const eye = new THREE.Mesh(g.eye, this.matEye);
    eye.position.set(0, 0.05, -0.3 * s);
    eye.scale.setScalar(s * 0.8);
    this.mesh.add(eye);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(g.fin, matFin);
      fin.position.set(side * 0.3 * s, 0, 0.25 * s);
      fin.rotation.y = side * 0.5;
      fin.rotation.z = side * 0.4;
      fin.scale.setScalar(s);
      this.mesh.add(fin);
    }
    const tail = new THREE.Mesh(g.smallShard, matFin);
    tail.position.set(0, 0, 0.6 * s);
    this.mesh.add(tail);
    this.weave = Math.random() * Math.PI * 2;
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    this.weave += dt * 3.2;
    const vel = this._steer(playerPos, enemies);
    if (dist > 3) {
      // strafe perpendicular to the approach vector
      const px = -vel.z, pz = vel.x;
      const len = Math.hypot(px, pz) || 1;
      const w = Math.sin(this.weave) * this.speed * 0.8;
      vel.x += (px / len) * w;
      vel.z += (pz / len) * w;
    }
    this._move(vel, dt, world);
    this.mesh.rotation.z = Math.sin(this.weave) * 0.5;
    this._tryMelee(dist, dt, 1.3, 0.9);
  }
}

/* ---------- SENTINEL: shielded front plate, flank it ---------- */
class Sentinel extends Enemy {
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.18);
    this.matEye = this._mat(this.T.color, 2.6, { color: 0x111111 });
    const matFin = this._mat(this.T.color, 0.5, { color: 0x141d29 });
    this.matShield = this._mat(0x29e6ff, 0.55, { color: 0x1a2a3c, metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(g.ico, this.matBody);
    body.scale.setScalar(s);
    this.mesh.add(body);
    const eye = new THREE.Mesh(g.eye, this.matEye);
    eye.position.set(0, 0.1, -0.42 * s);
    this.mesh.add(eye);
    const shield = new THREE.Mesh(g.plate, this.matShield);
    shield.position.set(0, 0, -0.75 * s);
    this.mesh.add(shield);
    const shieldTrim = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.1), matFin);
    shieldTrim.position.set(0, 0.48, -0.75 * s);
    this.mesh.add(shieldTrim);
    this.mats.push(shieldTrim.material);
    const ring = new THREE.Mesh(g.ring, matFin);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(s);
    this.mesh.add(ring);
    this.ringMesh = ring;
  }
  modifyDamage(dmg, dir, source) {
    if (source !== 'gun') return dmg;
    // shot direction opposing our facing = it hit the shield
    const d = dir.x * this.facing.x + dir.z * this.facing.z;
    if (d < -0.35) { this.matShield.emissiveIntensity = 2.5; return dmg * 0.3; }
    return dmg;
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    this.matShield.emissiveIntensity = Math.max(0.55, this.matShield.emissiveIntensity - dt * 8);
    this.ringMesh.rotation.z += dt * 1.5;
    super.behave(dt, t, playerPos, enemies, world, dist);
  }
  // Sentinels turn slowly, so strafing or dashing around them exposes the unshielded back.
  _finish(dt, playerPos) {
    this.bobPhase += dt * 2.4;
    const targetY = (this.groundY || 0) + this.hoverY + Math.sin(this.bobPhase) * 0.18;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 6);
    this.mesh.position.copy(this.pos);
    const want = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (this.turnAng === undefined) this.turnAng = want;
    let diff = want - this.turnAng;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 1.3 * dt;
    this.turnAng += Math.max(-maxTurn, Math.min(maxTurn, diff));
    this.mesh.rotation.y = this.turnAng + Math.PI;
    this.facing.set(Math.sin(this.turnAng), 0, Math.cos(this.turnAng));
  }
}

/* ---------- SPITTER: keeps range, lobs plasma ---------- */
class Spitter extends Enemy {
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.3, { roughness: 0.6, metalness: 0.3 });
    this.matEye = this._mat(this.T.color, 2.6, { color: 0x0a0a0a });
    const body = new THREE.Mesh(g.sphere, this.matBody);
    body.scale.set(s, s * 0.85, s);
    this.mesh.add(body);
    const eye = new THREE.Mesh(g.eye, this.matEye);
    eye.position.set(0, 0.05, -0.42 * s);
    eye.scale.setScalar(1.4);
    this.mesh.add(eye);
    this.tentacles = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const tn = new THREE.Mesh(g.tentacle, this.matBody);
      tn.position.set(Math.cos(a) * 0.3 * s, -0.55 * s, Math.sin(a) * 0.3 * s);
      tn.rotation.x = Math.PI;
      this.mesh.add(tn);
      this.tentacles.push(tn);
    }
    this.fireCd = 1.5 + Math.random();
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    const vel = this._steer(playerPos, enemies, 0);
    const to = new THREE.Vector3(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z).normalize();
    if (dist > 14) vel.addScaledVector(to, this.speed);
    else if (dist < 9) vel.addScaledVector(to, -this.speed);
    else { vel.x += -to.z * this.speed * 0.6 * this.strafeDir; vel.z += to.x * this.speed * 0.6 * this.strafeDir; }
    if (this._move(vel, dt, world)) this.strafeDir *= -1;
    for (let i = 0; i < this.tentacles.length; i++) this.tentacles[i].rotation.z = Math.sin(t * 3 + i) * 0.3;

    this.fireCd -= dt;
    if (this.fireCd < 0.3) this.matEye.emissiveIntensity = 7;
    if (this.fireCd <= 0 && dist < 26) {
      this.fireCd = 2.4;
      const origin = this.pos.clone();
      origin.y -= 0.1;
      this.manager.fireProjectile(origin, playerPos, 15, this.T.dmg, this.T.color);
      this.manager.audio.spit();
    }
    this.matEye.emissiveIntensity = Math.max(2.6, this.matEye.emissiveIntensity - dt * 12);
    this._tryMelee(dist, dt, 1.0, 1.2);
  }
}

/* ---------- BRUTE: slow tank that winds up and charges ---------- */
class Brute extends Enemy {
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.18, { metalness: 0.8, roughness: 0.35 });
    this.matEye = this._mat(this.T.color, 2.6, { color: 0x111111 });
    const matSpike = this._mat(this.T.color, 0.6, { color: 0x1a1410 });
    const body = new THREE.Mesh(g.cube, this.matBody);
    body.scale.set(0.9 * s, 0.8 * s, 1.0 * s);
    body.rotation.y = Math.PI / 4;
    this.mesh.add(body);
    for (const [ex, ey] of [[-0.22, 0.12], [0.22, 0.12]]) {
      const eye = new THREE.Mesh(g.eye, this.matEye);
      eye.position.set(ex * s, ey * s, -0.6 * s);
      eye.scale.setScalar(0.8);
      this.mesh.add(eye);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = new THREE.Mesh(g.spike, matSpike);
      sp.position.set(Math.cos(a) * 0.55 * s, 0.55 * s, Math.sin(a) * 0.55 * s);
      sp.rotation.z = -Math.cos(a) * 0.7;
      sp.rotation.x = Math.sin(a) * 0.7;
      sp.scale.setScalar(s);
      this.mesh.add(sp);
    }
    this.chargeCd = 3;
    this.state = 'walk'; // walk | windup | charge
    this.stateT = 0;
    this.chargeDir = new THREE.Vector3();
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    this.chargeCd -= dt;
    if (this.state === 'walk') {
      const vel = this._steer(playerPos, enemies);
      this._move(vel, dt, world);
      this._tryMelee(dist, dt, 1.6, 1.1);
      if (this.chargeCd <= 0 && dist > 5 && dist < 18) {
        this.state = 'windup'; this.stateT = 0.7;
        this.chargeDir.set(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z).normalize();
        this.manager.audio.bruteRoar();
      }
    } else if (this.state === 'windup') {
      this.stateT -= dt;
      this.matEye.emissiveIntensity = 8;
      this.mesh.scale.setScalar(1 + (0.7 - this.stateT) * 0.15);
      this.chargeDir.set(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z).normalize();
      this._move(new THREE.Vector3(), dt, world);
      if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 0.9; this.chargeHit = false; }
    } else {
      this.stateT -= dt;
      this.mesh.scale.setScalar(1);
      const vel = this.chargeDir.clone().multiplyScalar(15);
      const blocked = this._move(vel, dt, world);
      if (Math.random() < 0.7) this.manager.effects.spawnBurst(this.pos.x, this.pos.y - 0.5, this.pos.z, this.T.color, 2, 2, 0.3, 6);
      if (!this.chargeHit && dist < this.radius + 1.4) {
        this.chargeHit = true;
        this.manager.onEnemyAttack(this, 30);
        this.manager.game.player.shake(0.4, 0.03);
      }
      if (this.stateT <= 0 || blocked) { this.state = 'walk'; this.chargeCd = 4.5; this.matEye.emissiveIntensity = 2.6; }
    }
  }
}

/* ---------- PHANTOM: blinks next to you, then lunges ---------- */
class Phantom extends Enemy {
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.5, { transparent: true, opacity: 0.8, color: 0x1a1030 });
    this.matEye = this._mat(this.T.color, 2.6, { color: 0x111111 });
    const body = new THREE.Mesh(g.shard, this.matBody);
    body.scale.set(0.7 * s, 1.3 * s, 0.4 * s);
    this.mesh.add(body);
    const eye = new THREE.Mesh(g.eye, this.matEye);
    eye.position.set(0, 0.15, -0.22 * s);
    eye.scale.setScalar(0.9);
    this.mesh.add(eye);
    this.shards = [];
    for (let i = 0; i < 5; i++) {
      const sh = new THREE.Mesh(g.smallShard, this.matBody);
      this.mesh.add(sh);
      this.shards.push(sh);
    }
    this.blinkCd = 2.5;
    this.fade = 1;
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    this.blinkCd -= dt;
    if (this.blinkCd <= 0 && dist > 7) {
      // teleport to a point 4–6m from the player
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 2;
        const nx = playerPos.x + Math.cos(a) * r, nz = playerPos.z + Math.sin(a) * r;
        const res = world.collide(nx, nz, this.radius);
        if (!res.hit && Math.abs(nx) < 32 && Math.abs(nz) < 32) {
          this.manager.effects.spawnBurst(this.pos.x, this.pos.y, this.pos.z, this.T.color, 18, 4, 0.5, 7);
          this.pos.x = nx; this.pos.z = nz;
          this.manager.effects.spawnBurst(nx, this.pos.y, nz, this.T.color, 18, 4, 0.5, 7);
          this.manager.audio.blink();
          this.fade = 0;
          break;
        }
      }
      this.blinkCd = 3.5 + Math.random();
    }
    this.fade = Math.min(1, this.fade + dt * 2.5);
    this.matBody.opacity = 0.25 + 0.55 * this.fade;
    for (let i = 0; i < this.shards.length; i++) {
      const a = t * 2 + (i / this.shards.length) * Math.PI * 2;
      this.shards[i].position.set(Math.cos(a) * 0.8, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 0.8);
      this.shards[i].rotation.set(a, a * 0.7, 0);
    }
    const vel = this._steer(playerPos, enemies, this.fade < 1 ? this.speed * 0.3 : this.speed);
    this._move(vel, dt, world);
    this._tryMelee(dist, dt, 1.4, 0.9);
  }
}

/* ---------- WARDEN: boss. Orbits, fires spreads, summons scouts ---------- */
class Warden extends Enemy {
  constructor(type, x, z, manager, opts) {
    super(type, x, z, manager, opts);
    this.isBoss = true;
    this.hoverY = 2.4;
    this.fireCd = 3;
    this.summonCd = 9;
    this.orbitDir = 1;
    this.manager.ui.setBoss(this.T.name, 1);
  }
  _buildMesh() {
    const g = geos(), s = this.T.scale;
    this.matBody = this._mat(this.T.color, 0.25, { metalness: 0.85, roughness: 0.3, color: 0x2a1a16 });
    this.matEye = this._mat(0xffffff, 2.6, { color: 0x111111 });
    const matSpike = this._mat(this.T.color, 1.2, { color: 0x1a1410 });
    const body = new THREE.Mesh(g.dodeca, this.matBody);
    body.scale.setScalar(s);
    this.mesh.add(body);
    for (const [ex, ey] of [[-0.3, 0.1], [0.3, 0.1], [0, 0.4]]) {
      const eye = new THREE.Mesh(g.eye, this.matEye);
      eye.position.set(ex * s, ey * s, -0.55 * s);
      eye.scale.setScalar(1.1);
      this.mesh.add(eye);
    }
    this.crown = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(g.spike, matSpike);
      sp.position.set(Math.cos(a) * 1.0 * s, 0.9 * s, Math.sin(a) * 1.0 * s);
      sp.rotation.z = -Math.cos(a) * 0.5;
      sp.rotation.x = Math.sin(a) * 0.5;
      sp.scale.setScalar(s * 1.2);
      this.crown.add(sp);
    }
    this.mesh.add(this.crown);
    this.rings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(g.ring, matSpike);
      ring.scale.setScalar(s * (1.4 + i * 0.4));
      ring.rotation.x = Math.PI / 2 + i * 0.6;
      this.mesh.add(ring);
      this.rings.push(ring);
    }
    this.light = new THREE.PointLight(this.T.color, 8, 16, 2);
    this.light.position.set(0, 0.5, 0);
    this.mesh.add(this.light);
  }
  behave(dt, t, playerPos, enemies, world, dist) {
    const enraged = this.hp < this.maxHp * 0.5;
    this.crown.rotation.y += dt * (enraged ? 2.5 : 0.8);
    this.rings[0].rotation.z += dt * 1.2;
    this.rings[1].rotation.z -= dt * 0.9;
    this.light.intensity = 8 + Math.sin(t * 6) * 2 + (enraged ? 4 : 0);

    // orbit at ~12m
    const to = new THREE.Vector3(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z).normalize();
    const vel = this._steer(playerPos, enemies, 0);
    const spd = this.speed * (enraged ? 1.5 : 1);
    if (dist > 14) vel.addScaledVector(to, spd);
    else if (dist < 9) vel.addScaledVector(to, -spd);
    vel.x += -to.z * spd * 0.9 * this.orbitDir;
    vel.z += to.x * spd * 0.9 * this.orbitDir;
    if (this._move(vel, dt, world)) this.orbitDir *= -1;

    this.fireCd -= dt;
    if (this.fireCd < 0.4) this.matEye.emissiveIntensity = 9;
    if (this.fireCd <= 0) {
      this.fireCd = enraged ? 1.9 : 3.0;
      const origin = this.pos.clone();
      for (const off of enraged ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.2, 0, 0.2]) {
        this.manager.fireProjectile(origin, playerPos, 17, 12, this.T.color, off);
      }
      this.manager.audio.wardenFire();
    }
    this.matEye.emissiveIntensity = Math.max(2.6, this.matEye.emissiveIntensity - dt * 14);

    this.summonCd -= dt;
    if (this.summonCd <= 0) {
      this.summonCd = enraged ? 9 : 12;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        this.manager.spawnAt('scout', this.pos.x + Math.cos(a) * 3, this.pos.z + Math.sin(a) * 3);
      }
      this.manager.effects.shockwave(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), this.T.color, 5, 0.5);
      this.manager.ui.killToast('WARDEN SUMMONS REINFORCEMENTS', 0, true);
    }
    this._tryMelee(dist, dt, 1.4, 1.2);
  }
}

const CLASSES = { scout: Scout, sentinel: Sentinel, spitter: Spitter, brute: Brute, phantom: Phantom, warden: Warden };

/* ---------- manager: waves, modes, projectiles, pickups ---------- */
export class EnemyManager {
  constructor(scene, world, effects, audio, ui, game) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.ui = ui;
    this.game = game;
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.pendingSpawns = [];
    this.spawnTimer = 0;
    this.wave = 0;
    this.waveState = 'idle';
    this.intermissionT = 0;
    this.kills = 0;
    this.mode = MODES.siege;
    this.timeLeft = null;
    this.elapsed = 0;
    this.surge = 1;
    this.streak = 0;
    this.streakT = 0;
    this.multiplier = 1;
    this._pickupGeo = new THREE.OctahedronGeometry(0.32);
  }

  reset() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.pickups) this._removePickup(p);
    this.pickups.length = 0;
    for (const pr of this.projectiles) this.effects.releaseProjectile(pr.mesh);
    this.projectiles.length = 0;
    this.pendingSpawns.length = 0;
    this.wave = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.surge = 1;
    this.streak = 0;
    this.streakT = 0;
    this.multiplier = 1;
    this.bossSurge = 0;
    this.waveState = 'idle';
    this.ui.setWave(0, 0);
    this.ui.setBoss(null);
    this.ui.setMultiplier(1);
  }

  startGame(modeId = 'siege') {
    this.reset();
    this.mode = MODES[modeId] || MODES.siege;
    this.timeLeft = this.mode.timer;
    this.ui.setTimer(this.timeLeft);
    if (this.mode.id === 'blitz') {
      this.waveState = 'continuous';
      this.wave = 1;
      this.spawnTimer = 0.8;
      this.ui.waveBanner('BLITZ', 'SURVIVE TO EXTRACTION');
      this.audio.waveStart();
    } else {
      this.nextWave();
    }
  }

  /* ---- composition ---- */
  _pickType(n, allowBoss = false) {
    const pool = [['scout', 10]];
    if (n >= 2) pool.push(['sentinel', 5 + n]);
    if (n >= 3) pool.push(['spitter', 4 + n]);
    if (n >= 4) pool.push(['brute', 2 + n * 0.8]);
    if (n >= 5) pool.push(['phantom', 2 + n * 0.8]);
    let total = 0;
    for (const p of pool) total += p[1];
    let r = Math.random() * total;
    for (const [type, w] of pool) { r -= w; if (r <= 0) return type; }
    return 'scout';
  }

  nextWave() {
    this.wave++;
    const n = this.wave;
    this.waveState = 'spawning';
    this.audio.waveStart();

    if (this.mode.id === 'overlord') {
      this.pendingSpawns.push({ type: 'warden', hpMult: 1 + (n - 1) * 0.35, speedMult: 1 + (n - 1) * 0.05 });
      const escorts = 2 + n * 2;
      for (let i = 0; i < escorts; i++) this.pendingSpawns.push({ type: this._pickType(n + 2) });
      this.ui.waveBanner(`WARDEN ${n}`, 'OVERLORD INCOMING');
      this.spawnTimer = 0.4;
      return;
    }

    if (n % 5 === 0) {
      this.pendingSpawns.push({ type: 'warden', hpMult: 1 + (n / 5 - 1) * 0.5 });
      for (let i = 0; i < n; i++) this.pendingSpawns.push({ type: 'scout' });
      this.ui.waveBanner(`WAVE ${n}`, 'WARDEN DETECTED');
    } else {
      const count = 4 + n * 2;
      for (let i = 0; i < count; i++) this.pendingSpawns.push({ type: this._pickType(n) });
      this.ui.waveBanner(`WAVE ${n}`, 'INCOMING');
    }
    this.spawnTimer = 0.6;
  }

  _spawnFromGate(spec) {
    const gate = this.world.pickGate(this.game.player.pos, 14);
    const jitter = () => (Math.random() - 0.5) * 2.5;
    const x = gate.x + (gate.nx === 0 ? jitter() : 0);
    const z = gate.z + (gate.nz === 0 ? jitter() : 0);
    gate.ring.scale.setScalar(1.3);
    this.spawnAt(spec.type, x, z, spec);
  }

  spawnAt(type, x, z, opts = {}) {
    const Cls = CLASSES[type] || Scout;
    const e = new Cls(type, x, z, this, opts);
    this.scene.add(e.mesh);
    this.enemies.push(e);
    this.effects.spawnBurst(x, 1.2, z, TYPES[type].color, type === 'warden' ? 60 : 14, 3, 0.5, 7);
    return e;
  }

  /* ---- projectiles ---- */
  fireProjectile(origin, targetPos, speed, dmg, color, angleOffset = 0) {
    const dir = new THREE.Vector3(targetPos.x - origin.x, (targetPos.y - 0.2) - origin.y, targetPos.z - origin.z).normalize();
    if (angleOffset) {
      const c = Math.cos(angleOffset), s = Math.sin(angleOffset);
      const x = dir.x * c - dir.z * s, z = dir.x * s + dir.z * c;
      dir.x = x; dir.z = z;
    }
    const mesh = this.effects.acquireProjectile(color);
    mesh.position.copy(origin);
    this.projectiles.push({ mesh, pos: origin.clone(), vel: dir.multiplyScalar(speed), dmg, color, life: 4 });
  }

  _updateProjectiles(dt, playerPos) {
    const player = this.game.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.scale.setScalar(1 + Math.sin(p.life * 30) * 0.15);
      let done = p.life <= 0 || p.pos.y < 0;
      // world hit: anything whose top is above the projectile is a wall
      if (!done) {
        const r = this.world.resolve(p.pos.x, p.pos.z, 0.2, p.pos.y, 0);
        if (r.hit || Math.abs(p.pos.x) > 34 || Math.abs(p.pos.z) > 34) done = true;
      }
      if (!done) {
        const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z, dy = p.pos.y - (playerPos.y - 0.6);
        if (dx * dx + dz * dz < 0.75 * 0.75 && Math.abs(dy) < 1.3) {
          player.damage(p.dmg);
          this.audio.enemyAttack();
          done = true;
        }
      }
      if (done) {
        this.effects.impact(p.pos, p.color);
        this.effects.releaseProjectile(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /* ---- pickups ---- */
  _maybeDrop(pos, isBoss) {
    const r = Math.random();
    const healthChance = this.mode.id === 'overlord' ? 0.26 : 0.15;
    if (isBoss) { this._spawnPickup(pos, 'health'); return; }
    if (r < healthChance) this._spawnPickup(pos, 'health');
    else if (r < healthChance + 0.16) this._spawnPickup(pos, 'ammo');
  }
  _spawnPickup(pos, kind) {
    const m = new THREE.Mesh(this._pickupGeo, new THREE.MeshStandardMaterial({
      color: 0x0c1622, emissive: kind === 'health' ? 0x39ff6e : 0x29e6ff, emissiveIntensity: 2.2,
    }));
    const g = this.world.collide(pos.x, pos.z, 0.3).ground;
    m.position.set(pos.x, g + 0.75, pos.z);
    this.scene.add(m);
    this.pickups.push({ mesh: m, mat: m.material, kind, t: Math.random() * Math.PI * 2, baseY: g + 0.75 });
  }
  _removePickup(p) {
    p.mesh.removeFromParent();
    p.mat.dispose();
  }

  /* ---- events ---- */
  onEnemyKilled(enemy) {
    this.kills++;
    this.streak++;
    this.streakT = 4;
    if (this.mode.id === 'blitz') {
      this.multiplier = Math.min(4, 1 + Math.floor(this.streak / 5) * 0.5);
      this.ui.setMultiplier(this.multiplier);
    }
    const score = Math.round(enemy.value * this.multiplier);
    const coins = Math.round(enemy.coins * this.mode.coinMult);
    this.game.addScore(score);
    this.game.addCoins(coins);
    this.ui.killToast(`+${score}`, coins, enemy.isBoss);
    this._maybeDrop(enemy.mesh.position, enemy.isBoss);
  }

  onEnemyAttack(enemy, dmg) {
    this.game.player.damage(dmg != null ? dmg : enemy.T.dmg);
    this.audio.enemyAttack();
  }

  /* ---- per-frame ---- */
  update(dt, t) {
    if (this.game.modeId === 'duel') return;
    const playerPos = this.game.player.pos;
    this.elapsed += dt;

    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) { this.streak = 0; if (this.mode.id === 'blitz') { this.multiplier = 1; this.ui.setMultiplier(1); } }
    }

    if (this.waveState === 'continuous') {
      // BLITZ: timer, surges, continuous spawns
      this.timeLeft -= dt;
      this.ui.setTimer(Math.max(0, this.timeLeft));
      if (this.timeLeft <= 0) { this.game.extract(); return; }
      const surge = 1 + Math.floor(this.elapsed / 20);
      if (surge !== this.surge) {
        this.surge = surge;
        this.wave = surge;
        this.ui.waveBanner(`SURGE ${surge}`, 'HOSTILE DENSITY RISING');
        this.audio.waveStart();
        this.game.addCoins(Math.round(3 * this.mode.coinMult));
      }
      this.spawnTimer -= dt;
      const maxAlive = 10 + surge * 2;
      if (this.spawnTimer <= 0 && this.enemies.length < maxAlive) {
        this.spawnTimer = Math.max(0.45, 1.5 - surge * 0.12);
        // a lighter Warden crashes the party at surges 4 and 7
        let type = this._pickType(surge + 1);
        if ((surge === 4 || surge === 7) && this.bossSurge !== surge) {
          this.bossSurge = surge;
          type = 'warden';
          this.ui.waveBanner('WARDEN', 'BREACHING THE GRID');
        }
        this._spawnFromGate({ type, hpMult: type === 'warden' ? 0.6 : 1 });
      }
    } else if (this.waveState === 'spawning' || this.waveState === 'active') {
      if (this.pendingSpawns.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = Math.max(0.25, 1.1 - this.wave * 0.05);
          this._spawnFromGate(this.pendingSpawns.shift());
        }
        this.waveState = 'spawning';
      } else if (this.waveState === 'spawning') {
        this.waveState = 'active';
      }
    }

    if (this.waveState === 'active' && this.enemies.length === 0) {
      this.waveState = 'intermission';
      this.intermissionT = this.mode.id === 'overlord' ? 4.5 : 3.5;
      this.game.addScore(250 + this.wave * 50);
      const bonus = Math.round((5 + this.wave * 2) * this.mode.coinMult);
      this.game.addCoins(bonus);
      this.ui.waveBanner(this.mode.id === 'overlord' ? `WARDEN ${this.wave}` : `WAVE ${this.wave}`, `CLEARED  +${bonus} COINS`);
      this.audio.waveClear();
    } else if (this.waveState === 'intermission') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) this.nextWave();
    }

    for (const e of this.enemies) e.update(dt, t, playerPos, this.enemies, this.world);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    this.ui.setWave(this.wave, this.enemies.length + this.pendingSpawns.length, this.mode.id === 'blitz');

    this._updateProjectiles(dt, playerPos);

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = p.baseY + Math.sin(p.t * 2.5) * 0.12;
      const d = Math.hypot(p.mesh.position.x - playerPos.x, p.mesh.position.z - playerPos.z);
      const dy = Math.abs(p.mesh.position.y - (playerPos.y - 1.0));
      if (d < 1.3 && dy < 1.8) {
        if (p.kind === 'health') {
          this.game.player.heal(25);
          this.ui.killToast('+25 INTEGRITY', 0);
        } else {
          this.game.player.ammo = Math.min(90, this.game.player.ammo + 30);
          if (this.game.player.overdriveT <= 0) this.ui.setAmmo(this.game.player.ammo, 30);
          this.ui.killToast('+30 AMMO', 0);
        }
        this.audio.pickup();
        this._removePickup(p);
        this.pickups.splice(i, 1);
      }
    }
  }
}
