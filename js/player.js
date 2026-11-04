import * as THREE from 'three';
import { getSkin } from './skins.js';
import { cheats, findAimTarget, aimAt, GUNS, cheatGun } from './cheats.js';

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 6.4;
const SPRINT_SPEED = 9.2;
const GRAVITY = -24;
const JUMP_VEL = 8.4;

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
    this.gun = GUNS.rifle;

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
    this.ammo = this.gun.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.spin = 0;
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
    this.ui.setAmmo(this.gun.mag, this.gun.mag);
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
    this.rifleParts = [barrel, shroud, muzzleRing];
    this.gunModels = this._buildGunModels(g, mat, accent);

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

  _buildGunModels(g, mat, accent) {
    const M = {};
    const add = (grp, geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz; grp.add(o); return o; };
    const cyl = (r, l, seg = 10) => new THREE.CylinderGeometry(r, r, l, seg);
    const H = Math.PI / 2;
    // minigun: spinning 6-barrel cluster
    M.minigun = new THREE.Group();
    const spinner = new THREE.Group(); spinner.position.set(0, 0.015, -0.42); M.minigun.add(spinner);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(spinner, cyl(0.011, 0.5, 6), mat, Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.05, H); }
    add(spinner, new THREE.TorusGeometry(0.045, 0.01, 6, 14), accent, 0, 0, -0.27);
    add(spinner, new THREE.TorusGeometry(0.045, 0.01, 6, 14), accent, 0, 0, 0.12);
    add(M.minigun, new THREE.BoxGeometry(0.12, 0.09, 0.14), mat, 0, -0.1, -0.12);
    M.minigun.userData.spinner = spinner; M.minigun.userData.muzzle = -0.74;
    // scattergun: fat double barrel + pump
    M.shotgun = new THREE.Group();
    for (const x of [-0.026, 0.026]) add(M.shotgun, cyl(0.025, 0.44), mat, x, 0.02, -0.4, H);
    add(M.shotgun, new THREE.BoxGeometry(0.1, 0.05, 0.16), accent, 0, -0.035, -0.36);
    add(M.shotgun, new THREE.TorusGeometry(0.06, 0.008, 6, 16), accent, 0, 0.02, -0.6);
    M.shotgun.userData.muzzle = -0.63;
    // railgun: long split rails with glowing coils
    M.railgun = new THREE.Group();
    for (const x of [-0.034, 0.034]) add(M.railgun, new THREE.BoxGeometry(0.014, 0.03, 0.72), mat, x, 0.015, -0.5);
    add(M.railgun, new THREE.BoxGeometry(0.03, 0.012, 0.66), accent, 0, 0.015, -0.5);
    for (let i = 0; i < 4; i++) add(M.railgun, new THREE.TorusGeometry(0.05, 0.007, 6, 14), accent, 0, 0.015, -0.28 - i * 0.14);
    M.railgun.userData.muzzle = -0.86;
    // rocket launcher: big tube
    M.rocket = new THREE.Group();
    add(M.rocket, cyl(0.065, 0.78, 14), mat, 0, 0.06, -0.38, H);
    add(M.rocket, new THREE.TorusGeometry(0.068, 0.012, 6, 18), accent, 0, 0.06, -0.77);
    add(M.rocket, new THREE.TorusGeometry(0.068, 0.012, 6, 18), accent, 0, 0.06, -0.05);
    add(M.rocket, new THREE.BoxGeometry(0.03, 0.05, 0.1), accent, 0, 0.14, -0.3);
    M.rocket.userData.muzzle = -0.8;
    // chain zapper: tesla coils + orb
    M.zapper = new THREE.Group();
    add(M.zapper, cyl(0.016, 0.36), mat, 0, 0.015, -0.4, H);
    for (let i = 0; i < 3; i++) add(M.zapper, new THREE.TorusGeometry(0.04 - i * 0.006, 0.009, 6, 14), accent, 0, 0.015, -0.3 - i * 0.1);
    const orb = add(M.zapper, new THREE.SphereGeometry(0.04, 12, 10), accent, 0, 0.015, -0.62);
    M.zapper.userData.orb = orb; M.zapper.userData.muzzle = -0.64;
    for (const k in M) { M[k].visible = false; g.add(M[k]); }
    return M;
  }

  setGun(id) {
    const G = GUNS[id] || GUNS.rifle;
    this.gun = G;
    cheatGun.id = G.id;
    for (const k in this.gunModels) this.gunModels[k].visible = k === G.id;
    for (const p of this.rifleParts) p.visible = G.id === 'rifle';
    const mz = this.gunModels[G.id] ? this.gunModels[G.id].userData.muzzle : -0.6;
    this.muzzleZ = mz;
    this.muzzleLight.position.set(0, 0.015, mz);
    this.reloading = false;
    this.ui.setReloading(false);
    this.ammo = G.mag;
    this.fireT = Math.min(this.fireT || 0, 0.15);
    this.ui.setAmmo(this.overdriveT > 0 ? '∞' : G.mag, G.mag);
    const wn = document.getElementById('weapon-name');
    if (wn) wn.textContent = G.name;
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
    if (!this.reloading && this.ammo < this.gun.mag && this.game.phase === 'playing') {
      this.reloading = true;
      this.reloadT = this.gun.reload;
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
      const enemies = (this.game.enemies ? this.game.enemies.enemies : []).slice();
      if (this.game.duel && this.game.duel.avatarTarget) enemies.push(this.game.duel.avatarTarget);
      if (this.game.duel) this.game.duel.onLocalShock(origin, this.skin.accent);
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
      this.ammo = this.gun.mag;
      this.ui.setAmmo('∞', this.gun.mag);
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
    // online: you can still be shot while paused or tabbed out — the match doesn't stop for you
    const online = !!(this.game.duel && this.game.duel.inMatch);
    if (!this.alive || (this.game.phase !== 'playing' && !online)) return;
    if (this.invuln > 0 || cheats.god) return;
    this.health -= amount;
    this.ui.setHealth(Math.max(0, this.health));
    this.ui.damageFlash();
    this.shake(0.35, 0.012);
    this.audio.hurt();
    if (this.health <= 0) {
      this.alive = false;
      this.fireHeld = false;
      if (this.game.onPlayerDeath && this.game.onPlayerDeath()) return; // online duel: respawn instead
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
    if (!this.alive) return;

    this.fireT -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    for (const k in this.cd) this.cd[k] = cheats.noCooldown ? 0 : Math.max(0, this.cd[k] - dt);

    // aimbot: while the trigger is held, lock onto the best visible clanker
    this.aimTarget = null;
    if (cheats.aimbot && this.fireHeld && this.game.enemies) {
      const pool = this.game.enemies.enemies.slice();
      const rival = this.game.duel && this.game.duel.avatarTarget;
      if (rival) pool.push(rival);
      const t = findAimTarget(this, pool, this.world);
      if (t) { aimAt(this, t, dt); this.aimTarget = t; this._applyCamera(); }
    }
    if (this.overdriveT > 0) {
      this.overdriveT -= dt;
      if (this.overdriveT <= 0) {
        this.overdriveT = 0;
        this.ui.setOverdrive(false);
        this.ui.setAmmo(this.ammo, this.gun.mag);
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
        this.ammo = this.gun.mag;
        this.ui.setAmmo(this.gun.mag, this.gun.mag);
        this.ui.setReloading(false);
      }
    }

    // firing
    const interval = this.gun.interval * (this.overdriveT > 0 ? 0.5 : 1) * (cheats.rapidFire ? 0.33 : 1);
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

    const gm = this.gunModels[this.gun.id];
    if (gm && gm.userData.spinner) { this.spin = this.fireHeld ? Math.min(1, this.spin + dt * 4) : Math.max(0, this.spin - dt * 1.5); gm.userData.spinner.rotation.z += this.spin * dt * 40; }
    if (gm && gm.userData.orb) gm.userData.orb.scale.setScalar(1 + Math.sin(performance.now() * 0.02) * 0.15);

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
      const accel = this.onGround || cheats.fly ? 42 : 10;
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt * 0.25);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt * 0.25);
    }

    if (cheats.fly) {
      const up = this.keys['Space'] ? 1 : 0;
      const down = this.keys['KeyC'] || this.keys['KeyZ'] ? 1 : 0;
      const target = (up - down) * (sprinting ? 16 : 10) * (cheats.speed ? 1.6 : 1);
      this.vel.y += (target - this.vel.y) * Math.min(1, dt * 10);
    } else {
      if (this.keys['Space'] && this.onGround && this.dashT <= 0) {
        this.vel.y = JUMP_VEL * (cheats.superJump ? 2.6 : 1);
        this.onGround = false;
      }
      this.vel.y += GRAVITY * dt;
    }

    // integrate horizontal with collision (feet height decides what is a step vs a wall)
    const feet = this.pos.y - EYE_HEIGHT;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    let res;
    if (cheats.noclip) {
      const lim = 80;
      res = { x: Math.max(-lim, Math.min(lim, nx)), z: Math.max(-lim, Math.min(lim, nz)), ground: 0 };
    } else res = this.world.resolve(nx, nz, PLAYER_RADIUS, feet);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // vertical
    let newFeet = Math.min(60, feet + this.vel.y * dt);
    if (newFeet <= res.ground) {
      newFeet = res.ground;
      if (this.vel.y < -14 && !cheats.fly) this.shake(0.12, 0.006);
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
    const G = this.gun;
    if (!od && !cheats.infAmmo) {
      this.ammo--;
      this.ui.setAmmo(this.ammo, G.mag);
    }
    this.ui.crosshairFire();
    this.recoil = Math.min(0.12, this.recoil + G.kick);
    if (G.id !== 'minigun') this.pitch += 0.004 * (G.kick / 0.02);
    else this.pitch += 0.0015;
    this.muzzleFlashT = 0.06;
    this.audio.gunShot ? this.audio.gunShot(G.id, od) : this.audio.shoot(od);
    this.shake(0.08 + G.kick, 0.002 + G.kick * 0.05);

    const muzzle = this.weapon.localToWorld(this.muzzleWorld.set(0, 0.015, this.muzzleZ || -0.6)).clone();
    const color = this.skin.animated ? this.accentMat.emissive.getHex() : this.skin.tracer;
    const targets = this.game.getShootTargets();
    const baseDmg = cheats.oneShot ? 99999 : G.dmg * (od ? 1.3 : 1);
    let anyHit = false, anyKill = false;

    for (let p = 0; p < G.pellets; p++) {
      const sp = this.aimTarget && G.pellets === 1 ? 0 : (G.spread || 0) * (od ? 2 : 1);
      this.raycaster.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp), this.camera);
      this.raycaster.ray.direction.x += (Math.random() - 0.5) * sp;
      this.raycaster.ray.direction.y += (Math.random() - 0.5) * sp * (G.pellets > 1 ? 1 : 0);
      this.raycaster.ray.direction.normalize();
      const dir = this.raycaster.ray.direction.clone();
      const hits = this.raycaster.intersectObjects(targets, true);
      let end = this.raycaster.ray.origin.clone().addScaledVector(dir, 80);

      if (G.pierce) {
        // railgun: punch through every clanker and wall on the line
        end = this.raycaster.ray.origin.clone().addScaledVector(dir, 110);
        const done = new Set();
        for (const h of hits) {
          const e = this._findEnemy(h.object);
          if (!e || done.has(e)) continue;
          done.add(e);
          const k = e.hit(baseDmg, h.point, dir, 'gun');
          anyHit = true; anyKill = anyKill || k;
        }
        this.effects.tracer(muzzle, end, color, 5, 0.35);
        this.effects.tracer(muzzle, end, 0xffffff, 1.6, 0.25);
        this._netShot(muzzle, end, color, 5, 0.35);
        if (hits.length) this.effects.impact(hits[hits.length - 1].point, color);
        continue;
      }

      let hitEnemy = null, hitPoint = null;
      if (hits.length > 0) {
        const h = hits[0];
        end = h.point.clone();
        hitPoint = h.point.clone();
        hitEnemy = this._findEnemy(h.object);
        if (hitEnemy) {
          const k = hitEnemy.hit(baseDmg, h.point, dir, 'gun');
          anyHit = true; anyKill = anyKill || k;
        } else if (!G.splash && !cheats.explosive) {
          this.effects.impact(h.point, color);
        }
      }

      if (G.id === 'rocket') {
        this.effects.tracer(muzzle, end, 0xffaa33, 3.5, 0.18);
        this._netShot(muzzle, end, 0xffaa33, 3.5, 0.18);
      } else if (G.id === 'zapper') {
        this._zapLine(muzzle, end, color);
      } else {
        const w = G.id === 'minigun' ? 0.8 : 1;
        this.effects.tracer(muzzle, end, color, w);
        this._netShot(muzzle, end, color, w, 0.07);
      }

      if (G.chain && hitEnemy) {
        const r = this._chain(hitEnemy, G.chain, baseDmg * 0.8, color);
        anyKill = anyKill || r;
      }
      if (G.splash) {
        const r = this._explode(end, G.splash, cheats.oneShot ? 99999 : G.splashDmg, 0xff8a2a, hitEnemy);
        anyHit = anyHit || r.hit; anyKill = anyKill || r.kill;
      } else if (cheats.explosive && hitPoint) {
        const r = this._explode(end, 3.5, cheats.oneShot ? 99999 : 45, 0xffb347, hitEnemy);
        anyHit = anyHit || r.hit; anyKill = anyKill || r.kill;
      }
    }
    if (anyHit) { this.ui.hitmarker(anyKill); this.audio.hit(anyKill); }
  }

  _netShot(from, to, color, w = 1, life = 0.07) {
    if (this.game.duel) this.game.duel.onLocalShot(from, to, color, w, life);
  }

  _zapLine(a, b, color) {
    // jagged lightning: 4 short segments with random offsets
    const segs = 4;
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      this.effects.tracer(prev, p, color, 2.2, 0.12);
      prev = p;
    }
    this._netShot(a, b, color, 2.2, 0.12);
  }

  _targetsInPlay() {
    const list = (this.game.enemies ? this.game.enemies.enemies : []).filter((e) => e.alive);
    const rival = this.game.duel && this.game.duel.avatarTarget;
    if (rival && rival.alive) list.push(rival);
    return list;
  }

  _chain(first, count, dmg, color) {
    const hitSet = new Set([first]);
    let cur = first, killed = false;
    for (let i = 0; i < count; i++) {
      let best = null, bd = 9;
      for (const e of this._targetsInPlay()) {
        if (hitSet.has(e)) continue;
        const d = e.pos.distanceTo(cur.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hitSet.add(best);
      this._zapLine(cur.pos.clone(), best.pos.clone(), color);
      const dir = best.pos.clone().sub(cur.pos).normalize();
      killed = best.hit(dmg, best.pos.clone(), dir, 'zap') || killed;
      cur = best;
      dmg *= 0.85;
    }
    return killed;
  }

  _explode(point, radius, dmg, color, direct) {
    this.effects.explosion(point.x, point.y, point.z, color);
    this.effects.shockwave(point, color, radius, 0.4);
    this.audio.boom ? this.audio.boom() : this.audio.shockwave();
    if (this.game.duel) this.game.duel.onLocalBoom(point, color, radius);
    const dPlayer = point.distanceTo(this.pos);
    if (dPlayer < radius + 4) this.shake(0.3, 0.015);
    let hit = false, kill = false;
    for (const e of this._targetsInPlay()) {
      const d = e.pos.distanceTo(point);
      if (d > radius + 0.6) continue;
      const f = 1 - Math.min(1, d / (radius + 0.6)) * 0.6;
      const dir = e.pos.clone().sub(point); dir.y = 0;
      if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
      dir.normalize();
      if (e.knock) e.knock.addScaledVector(dir, 10 * f);
      const k = e.hit(dmg * f * (e === direct ? 0.6 : 1), e.pos.clone(), dir, 'splash');
      hit = true; kill = kill || k;
    }
    return { hit, kill };
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
