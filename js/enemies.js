import * as THREE from 'three';
import { ARENA_HALF } from './world.js';

const TYPES = {
  scout: { hp: 34, speed: 5.4, dmg: 8, radius: 0.55, value: 100, scale: 0.8, color: 0xff2e6b },
  grunt: { hp: 70, speed: 3.6, dmg: 14, radius: 0.75, value: 175, scale: 1.0, color: 0xff2e6b },
  brute: { hp: 190, speed: 2.3, dmg: 24, radius: 1.1, value: 400, scale: 1.5, color: 0xffb020 },
};

/* Shared geometries (created once) */
let G = null;
function geos() {
  if (!G) {
    G = {
      body: new THREE.IcosahedronGeometry(0.55, 0),
      eye: new THREE.SphereGeometry(0.16, 10, 8),
      fin: new THREE.BoxGeometry(0.5, 0.1, 0.16),
      ring: new THREE.TorusGeometry(0.72, 0.05, 6, 18),
    };
  }
  return G;
}

class Enemy {
  constructor(type, x, z, manager) {
    const T = TYPES[type];
    this.type = type;
    this.T = T;
    this.manager = manager;
    this.hp = T.hp;
    this.maxHp = T.hp;
    this.speed = T.speed * (0.92 + Math.random() * 0.16);
    this.radius = T.radius;
    this.value = T.value;
    this.alive = true;
    this.pos = new THREE.Vector3(x, 1.35, z);
    this.bobPhase = Math.random() * Math.PI * 2;
    this.attackCd = 1.0;
    this.hitFlash = 0;
    this.knock = new THREE.Vector3();
    this.hoverY = 1.1 + T.scale * 0.35;

    this._buildMesh();
  }

  _buildMesh() {
    const g = geos();
    const matBody = new THREE.MeshStandardMaterial({
      color: 0x24313f, roughness: 0.4, metalness: 0.7,
      emissive: new THREE.Color(this.T.color),
      emissiveIntensity: 0.18,
    });
    const matEye = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: this.T.color, emissiveIntensity: 2.6,
    });
    const matFin = new THREE.MeshStandardMaterial({
      color: 0x141d29, roughness: 0.5, metalness: 0.6,
      emissive: new THREE.Color(this.T.color), emissiveIntensity: 0.5,
    });

    const grp = new THREE.Group();
    const body = new THREE.Mesh(g.body, matBody);
    body.scale.setScalar(this.T.scale);
    grp.add(body);
    const eye = new THREE.Mesh(g.eye, matEye);
    eye.position.set(0, 0.08, -0.42 * this.T.scale);
    eye.scale.setScalar(this.T.scale);
    grp.add(eye);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(g.fin, matFin);
      fin.position.set(side * 0.5 * this.T.scale, -0.1 * this.T.scale, 0);
      fin.rotation.z = side * -0.3;
      fin.scale.setScalar(this.T.scale);
      grp.add(fin);
    }
    const ring = new THREE.Mesh(g.ring, matFin);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(this.T.scale);
    grp.add(ring);

    grp.position.copy(this.pos);
    this.mesh = grp;
    this.matBody = matBody;
    this.matEye = matEye;
    this.matFin = matFin;
    this.eyeMesh = eye;
    this.ringMesh = ring;
    grp.userData.enemyRef = this;
  }

  hit(dmg, point, dir) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.hitFlash = 0.09;
    this.knock.addScaledVector(dir, 1.6);
    this.manager.effects.impact(point, this.T.color);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    const p = this.mesh.position;
    this.manager.effects.explosion(p.x, p.y, p.z, this.T.color);
    this.manager.audio.enemyDeath();
    this.manager.onEnemyKilled(this);
    this.dispose();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.matBody.dispose();
    this.matEye.dispose();
    this.matFin.dispose();
  }

  update(dt, t, playerPos, enemies, world) {
    if (!this.alive) return;

    // hit flash
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.matBody.emissive.setHex(0xffffff);
      this.matBody.emissiveIntensity = 1.2;
    } else {
      this.matBody.emissive.setHex(this.T.color);
      this.matBody.emissiveIntensity = 0.18;
    }

    // steering toward player
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();

    const vel = toPlayer.clone().multiplyScalar(this.speed);
    // separation from other enemies
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
    // knockback decay
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));

    let nx = this.pos.x + vel.x * dt;
    let nz = this.pos.z + vel.z * dt;
    const res = world.collide(nx, nz, this.radius);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // hover bob
    this.bobPhase += dt * 2.4;
    this.pos.y = this.hoverY + Math.sin(this.bobPhase) * 0.18;

    this.mesh.position.copy(this.pos);
    // face player
    this.mesh.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z) + Math.PI;
    // spin the ring
    this.ringMesh.rotation.z += dt * 1.5;

    // attack
    this.attackCd -= dt;
    if (dist < this.radius + 1.5 && this.attackCd <= 0) {
      this.attackCd = 1.0;
      this.manager.onEnemyAttack(this);
      // telegraph flash
      this.matEye.emissiveIntensity = 6;
    }
    this.matEye.emissiveIntensity = Math.max(2.6, this.matEye.emissiveIntensity - dt * 10);
  }
}

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
    this.pendingSpawns = [];
    this.spawnTimer = 0;
    this.wave = 0;
    this.waveState = 'idle'; // idle | spawning | active | intermission
    this.intermissionT = 0;
    this.kills = 0;
    this._pickupGeo = new THREE.OctahedronGeometry(0.32);
  }

  reset() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.pickups) this._removePickup(p);
    this.pickups.length = 0;
    this.pendingSpawns.length = 0;
    this.wave = 0;
    this.kills = 0;
    this.waveState = 'idle';
    this.ui.setWave(0, 0);
  }

  startGame() {
    this.reset();
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    const n = this.wave;
    this.ui.waveBanner(this.wave);
    this.audio.waveStart();
    this.waveState = 'spawning';

    const count = 4 + n * 2;
    for (let i = 0; i < count; i++) {
      let type = 'scout';
      if (n >= 2 && i % 3 === 1) type = 'grunt';
      if (n >= 4 && i % 5 === 4) type = 'brute';
      this.pendingSpawns.push(type);
    }
    this.spawnTimer = 0.6;
  }

  _spawn(type) {
    // pick edge position away from player
    const p = this.game.player.pos;
    let x, z, tries = 0;
    do {
      const edge = Math.floor(Math.random() * 4);
      const along = (Math.random() - 0.5) * 2 * (ARENA_HALF - 3);
      if (edge === 0) { x = along; z = -ARENA_HALF + 2.5; }
      else if (edge === 1) { x = along; z = ARENA_HALF - 2.5; }
      else if (edge === 2) { x = -ARENA_HALF + 2.5; z = along; }
      else { x = ARENA_HALF - 2.5; z = along; }
      tries++;
    } while (tries < 12 && Math.hypot(x - p.x, z - p.z) < 14);

    const e = new Enemy(type, x, z, this);
    this.scene.add(e.mesh);
    this.enemies.push(e);
    // spawn burst
    this.effects.spawnBurst(x, 1.2, z, TYPES[type].color, 14, 3, 0.5, 7);
  }

  _maybeDrop(pos) {
    const r = Math.random();
    if (r < 0.16) this._spawnPickup(pos, 'health');
    else if (r < 0.34) this._spawnPickup(pos, 'ammo');
  }

  _spawnPickup(pos, kind) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0c1622,
      emissive: kind === 'health' ? 0x39ff6e : 0x29e6ff,
      emissiveIntensity: 2.2,
    });
    const m = new THREE.Mesh(this._pickupGeo, mat);
    m.position.set(pos.x, 0.75, pos.z);
    this.scene.add(m);
    const pickup = { mesh: m, mat, kind, t: Math.random() * Math.PI * 2 };
    this.pickups.push(pickup);
  }

  _removePickup(p) {
    p.mesh.removeFromParent();
    p.mat.dispose();
  }

  onEnemyKilled(enemy) {
    this.kills++;
    this.game.addScore(enemy.value);
    this.ui.killToast(`+${enemy.value}`);
    this._maybeDrop(enemy.mesh.position);
  }

  onEnemyAttack(enemy) {
    this.game.player.damage(enemy.T.dmg, enemy.pos);
    this.audio.enemyAttack();
  }

  update(dt, t) {
    // wave spawning
    if (this.waveState === 'spawning' || this.waveState === 'active') {
      if (this.pendingSpawns.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = Math.max(0.25, 1.1 - this.wave * 0.05);
          this._spawn(this.pendingSpawns.shift());
        }
        this.waveState = 'spawning';
      } else if (this.waveState === 'spawning') {
        this.waveState = 'active';
      }
    }

    // wave complete?
    if (this.waveState === 'active' && this.enemies.length === 0) {
      this.waveState = 'intermission';
      this.intermissionT = 3.5;
      this.game.addScore(250 + this.wave * 50);
      this.ui.waveBanner(this.wave, 'CLEARED');
      this.audio.waveClear();
    } else if (this.waveState === 'intermission') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) this.nextWave();
    }

    // enemies
    const playerPos = this.game.player.pos;
    for (const e of this.enemies) e.update(dt, t, playerPos, this.enemies, this.world);
    // remove dead
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }
    this.ui.setWave(this.wave, this.enemies.length + this.pendingSpawns.length);

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = 0.75 + Math.sin(p.t * 2.5) * 0.12;
      const d = Math.hypot(p.mesh.position.x - playerPos.x, p.mesh.position.z - playerPos.z);
      if (d < 1.2) {
        if (p.kind === 'health') {
          this.game.player.heal(25);
          this.ui.killToast('+25 INTEGRITY');
        } else {
          this.game.player.ammo = Math.min(90, this.game.player.ammo + 30);
          this.ui.setAmmo(this.game.player.ammo, 30);
          this.ui.killToast('+30 AMMO');
        }
        this.audio.pickup();
        this._removePickup(p);
        this.pickups.splice(i, 1);
      }
    }
  }
}
