import * as THREE from 'three';
import { getSkin } from './skins.js';
import { cheats, findAimTarget, aimAt } from './cheats.js';

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 6.4;
const SPRINT_SPEED = 9.2;
const GRAVITY = -24;
const JUMP_VEL = 8.4;
const MAG_SIZE = 30;
const FIRE_INTERVAL = 0.115;
const RELOAD_TIME = 1.15;
const GUN_DAMAGE = 26;

/* Abilities: key, cooldown, duration */
export const ABILITIES = {
  dash: { key: 'Q', name: 'DASH', cd: 4.0, dur: 0.22, desc: 'Burst forward. Invulnerable while dashing.' },
  shock: { key: 'E', name: 'SHOCKWAVE', cd: 12.0, dur: 0, desc: 'Pulse that damages and hurls back everything nearby.' },
  overdrive: { key: 'F', name: 'OVERDRIVE', cd: 25.0, dur: 6.0, desc: 'Infinite ammo, double fire rate, +damage for 6s.' },
};

export class Player {
  constructor(camera, world, effects, audio, ui, game) {
    this.camera = camera;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.ui = ui;
    this.game = game;

    this.keys = {};
    this.sensitivity = 1.0;
    this.yaw = 0;
    this.pitch = 0;
    this.fireHeld = false;
    this.skin = getSkin('stock');

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;

    this._buildWeapon();
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, EYE_HEIGHT, 21); // south lane, facing the dais
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.health = 100;
    this.ammo = MAG_SIZE;
    this.reloading = false;
    this.reloadT = 0;
    this.fireT = 0;
    this.recoil = 0;
    this.bobT = 0;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.alive = true;
    // abilities
    this.cd = { dash: 0, shock: 0, overdrive: 0 };
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.overdriveT = 0;
    this.invuln = 0;
    this._applyCamera();
    this.ui.setHealth(100);
    this.ui.setAmmo(MAG_SIZE, MAG_SIZE);
    this.ui.setAbilities(this.cd, ABILITIES, { overdrive: 0 });
  }

  /* ---- weapon + skins ---- */
  _buildWeapon() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.35, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x0c1622, emissive: 0x29e6ff, emissiveIntensity: 1.6, roughness: 0.4 });
    this.weaponMat = mat;
    this.accentMat = accent;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), mat);
    body.position.set(0, -0.02, -0.1);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.42);
    g.add(barrel);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.2), mat);
    shroud.position.set(0, 0.015, -0.33);
    g.add(shroud);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), mat);
    grip.position.set(0, -0.13, 0.05);
    g.add(grip);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.03, 0.2), accent);
    core.position.set(0, 0.045, -0.15);
    g.add(core);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.16), accent);
      fin.position.set(side * 0.05, 0.0, -0.36);
      g.add(fin);
    }
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), accent);
    muzzleRing.position.set(0, 0.015, -0.58);
    g.add(muzzleRing);

    this.muzzleLight = new THREE.PointLight(0x66e6ff, 0, 7, 2);
    this.muzzleLight.position.set(0, 0.015, -0.6);
    g.add(this.muzzleLight);
    this.muzzleFlashT = 0;

    g.position.set(0.24, -0.18, -0.45);
    this.weapon = g;
    this.camera.add(g);
    this.muzzleWorld = new THREE.Vector3();
    this.applySkin(this.skin);
  }

  applySkin(skin) {
    this.skin = skin;
    this.weaponMat.color.setHex(skin.body);
    this.weaponMat.metalness = skin.metal;
    this.accentMat.emissive.setHex(skin.accent);
    this.muzzleLight.color.setHex(skin.accent);
    this._skinHue = 0;
  }

  /* ---- input ---- */
  onMouseMove(dx, dy) {
    if (this.game.phase !== 'playing') return;
    const s = 0.0021 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }
  startFire() { this.fireHeld = true; }
  stopFire() { this.fireHeld = false; }
  reload() {
    if (this.overdriveT > 0) return;
    if (!this.reloading && this.ammo < MAG_SIZE && this.game.phase === 'playing') {
      this.reloading = true;
      this.reloadT = RELOAD_TIME;
      this.ui.setReloading(true);
      this.audio.reload();
    }
  }

  /* ---- abilities ---- */
  useAbility(id) {
    if (this.game.phase !== 'playing' || !this.alive) return false;
    if (this.cd[id] > 0) { this.ui.abilityDenied(id); return false; }
    const A = ABILITIES[id];
    if (id === 'dash') {
      const fwd = this._wishDir();
      if (fwd.lengthSq() < 0.01) fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.dashDir.copy(fwd.normalize());
      this.dashT = A.dur;
      this.invuln = Math.max(this.invuln, A.dur + 0.05);
      this.audio.dash();
      this.ui.abilityUsed(id);
    } else if (id === 'shock') {
      const origin = this.pos.clone();
      origin.y -= 0.9;
      this.effects.shockwave(origin, this.skin.accent, 9, 0.55);
      this.audio.shockwave();
      this.shake(0.3, 0.02);
      const enemies = this.game.enemies ? this.game.enemies.enemies : [];
      let hitCount = 0;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d > 9) continue;
        const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
        e.knock.addScaledVector(dir, 14);
        e.hit(cheats.oneShot ? 99999 : 45 * (e.isBoss ? 0.6 : 1), e.pos.clone(), dir, 'shock');
        hitCount++;
      }
      if (hitCount) this.ui.hitmarker(false);
      this.ui.abilityUsed(id);
    } else if (id === 'overdrive') {
      this.overdriveT = A.dur;
      this.reloading = false;
      this.ui.setReloading(false);
      this.ammo = MAG_SIZE;
      this.ui.setAmmo('∞', MAG_SIZE);
      this.ui.setOverdrive(true);
      this.audio.overdrive();
      this.ui.abilityUsed(id);
    }
    this.cd[id] = A.cd;
    return true;
  }

  _wishDir() {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) wish.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) wish.sub(forward);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) wish.add(right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) wish.sub(right);
    return wish;
  }

  /* ---- damage ---- */
  damage(amount) {
    if (!this.alive || this.game.phase !== 'playing') return;
    if (this.invuln > 0 || cheats.god) return;
    this.health -= amount;
    this.ui.setHealth(Math.max(0, this.health));
    this.ui.damageFlash();
    this.shake(0.35, 0.012);
    this.audio.hurt();
    if (this.health <= 0) {
      this.alive = false;
      this.game.gameOver();
    }
  }
  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    this.ui.setHealth(this.health);
  }
  shake(time, amp) {
    this.shakeT = Math.max(this.shakeT, time);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  /* ---- per-frame ---- */
  update(dt) {
    if (this.game.phase !== 'playing') return;

    this.fireT -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    for (const k in this.cd) this.cd[k] = cheats.noCooldown ? 0 : Math.max(0, this.cd[k] - dt);

    // aimbot: while the trigger is held, lock onto the best visible clanker
    this.aimTarget = null;
    if (cheats.aimbot && this.fireHeld && this.game.enemies) {
      const t = findAimTarget(this, this.game.enemies.enemies, this.world);
      if (t) { aimAt(this, t, dt); this.aimTarget = t; this._applyCamera(); }
    }
    if (this.overdriveT > 0) {
      this.overdriveT -= dt;
      if (this.overdriveT <= 0) {
        this.overdriveT = 0;
        this.ui.setOverdrive(false);
        this.ui.setAmmo(this.ammo, MAG_SIZE);
      }
    }
    this.ui.setAbilities(this.cd, ABILITIES, { overdrive: this.overdriveT });

    // prism skin hue cycle
    if (this.skin.animated) {
      this._skinHue = (this._skinHue + dt * 0.25) % 1;
      const c = new THREE.Color().setHSL(this._skinHue, 1, 0.6);
      this.accentMat.emissive.copy(c);
      this.muzzleLight.color.copy(c);
    }

    // reload
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        this.ammo = MAG_SIZE;
        this.ui.setAmmo(MAG_SIZE, MAG_SIZE);
        this.ui.setReloading(false);
      }
    }

    // firing
    const interval = this.overdriveT > 0 ? FIRE_INTERVAL * 0.5 : FIRE_INTERVAL;
    if (this.fireHeld && !this.reloading && this.fireT <= 0) {
      if (this.ammo > 0 || this.overdriveT > 0) {
        this.shoot();
        this.fireT = interval;
      } else {
        this.fireT = 0.2;
        this.audio.dryFire();
        this.reload();
      }
    }

    // --- movement ---
    const wish = this._wishDir();
    const sprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    if (wish.lengthSq() > 0) wish.normalize();
    const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (cheats.speed ? 1.8 : 1);

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * 30;
      this.vel.z = this.dashDir.z * 30;
      this.vel.y = Math.max(this.vel.y, 0);
      if (Math.random() < 0.6) this.effects.spawnBurst(this.pos.x, this.pos.y - 1.2, this.pos.z, this.skin.accent, 2, 1.5, 0.3, 5);
    } else {
      const accel = this.onGround ? 42 : 10;
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt * 0.25);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt * 0.25);
    }

    if (this.keys['Space'] && this.onGround && this.dashT <= 0) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
    }
    this.vel.y += GRAVITY * dt;

    // integrate horizontal with collision (feet height decides what is a step vs a wall)
    const feet = this.pos.y - EYE_HEIGHT;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const res = this.world.resolve(nx, nz, PLAYER_RADIUS, feet);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // vertical
    let newFeet = feet + this.vel.y * dt;
    if (newFeet <= res.ground) {
      newFeet = res.ground;
      if (this.vel.y < -14) this.shake(0.12, 0.006);
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.pos.y = newFeet + EYE_HEIGHT;

    // head bob
    const moving = wish.lengthSq() > 0 && this.onGround;
    this.bobT += dt * (sprinting ? 13 : 9) * (moving ? 1 : 0);
    const bob = moving ? Math.sin(this.bobT) * 0.035 : 0;

    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.muzzleFlashT = Math.max(0, this.muzzleFlashT - dt);
    this.muzzleLight.intensity = this.muzzleFlashT > 0 ? 55 * (this.muzzleFlashT / 0.06) : 0;

    let shx = 0, shy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.35);
      shx = (Math.random() - 0.5) * a * 2;
      shy = (Math.random() - 0.5) * a * 2;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }

    this.camera.position.set(this.pos.x + shx, this.pos.y + bob + shy, this.pos.z);
    const dashRoll = this.dashT > 0 ? -this.dashDir.dot(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))) * 0.05 : 0;
    this.camera.rotation.set(this.pitch + this.recoil * 0.5 + shy, this.yaw, dashRoll, 'YXZ');

    this.weapon.position.y = -0.18 + (moving ? Math.sin(this.bobT * 0.5) * 0.012 : 0);
    this.weapon.position.x = 0.24 + (moving ? Math.cos(this.bobT * 0.5) * 0.008 : 0);
    this.weapon.rotation.x = this.recoil * 0.35;
    this.accentMat.emissiveIntensity = this.overdriveT > 0 ? 3.2 + Math.sin(performance.now() * 0.02) * 0.8 : 1.6;
  }

  _applyCamera() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  shoot() {
    const od = this.overdriveT > 0;
    if (!od && !cheats.infAmmo) {
      this.ammo--;
      this.ui.setAmmo(this.ammo, MAG_SIZE);
    }
    this.ui.crosshairFire();
    this.recoil = Math.min(0.06, this.recoil + 0.02);
    this.pitch += 0.004;
    this.muzzleFlashT = 0.06;
    this.audio.shoot(od);
    this.shake(0.08, 0.002);

    const spread = this.aimTarget ? 0 : (od ? 0.012 : 0.006);
    this.raycaster.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread), this.camera);
    this.raycaster.ray.direction.x += (Math.random() - 0.5) * spread;
    this.raycaster.ray.direction.normalize();

    const targets = this.game.getShootTargets();
    const hits = this.raycaster.intersectObjects(targets, true);
    const muzzle = this.weapon.localToWorld(this.muzzleWorld.set(0, 0.015, -0.6));
    const tracerColor = this.skin.animated ? this.accentMat.emissive.getHex() : this.skin.tracer;

    let end = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 80);
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      const enemy = this._findEnemy(h.object);
      if (enemy) {
        const killed = enemy.hit(cheats.oneShot ? 99999 : GUN_DAMAGE * (od ? 1.3 : 1), h.point, this.raycaster.ray.direction, 'gun');
        this.ui.hitmarker(killed);
        this.audio.hit(killed);
      } else {
        this.effects.impact(h.point, tracerColor);
      }
    }
    this.effects.tracer(muzzle, end, tracerColor);
  }

  _findEnemy(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.enemyRef) return o.userData.enemyRef;
      o = o.parent;
    }
    return null;
  }
}
