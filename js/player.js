import * as THREE from 'three';

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

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;

    this._buildWeapon();
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, EYE_HEIGHT, 20);
    this.vel = new THREE.Vector3();
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
    this.hurtCooldown = 0;
    this.alive = true;
    this._applyCamera();
    this.ui.setHealth(100);
    this.ui.setAmmo(MAG_SIZE, MAG_SIZE);
  }

  _buildWeapon() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a2634, roughness: 0.35, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x0c1622, emissive: 0x29e6ff, emissiveIntensity: 1.6, roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), mat);
    body.position.set(0, -0.02, -0.1);
    g.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.42);
    g.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), mat);
    grip.position.set(0, -0.13, 0.05);
    g.add(grip);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.03, 0.2), accent);
    core.position.set(0, 0.045, -0.15);
    g.add(core);

    // muzzle flash
    this.muzzleLight = new THREE.PointLight(0x66e6ff, 0, 7, 2);
    this.muzzleLight.position.set(0, 0.015, -0.6);
    g.add(this.muzzleLight);
    this.muzzleFlashT = 0;

    g.position.set(0.24, -0.18, -0.45);
    this.weapon = g;
    this.camera.add(g);

    this.muzzleWorld = new THREE.Vector3();
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

  startFire() {
    this.fireHeld = true;
  }
  stopFire() {
    this.fireHeld = false;
  }
  reload() {
    if (!this.reloading && this.ammo < MAG_SIZE && this.game.phase === 'playing') {
      this.reloading = true;
      this.reloadT = RELOAD_TIME;
      this.ui.setReloading(true);
      this.audio.reload();
    }
  }

  /* ---- damage ---- */
  damage(amount, fromPos) {
    if (!this.alive || this.game.phase !== 'playing') return;
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

    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.fireT -= dt;

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
    if (this.fireHeld && !this.reloading && this.fireT <= 0) {
      if (this.ammo > 0) {
        this.shoot();
        this.fireT = FIRE_INTERVAL;
      } else {
        this.fireT = 0.2;
        this.audio.dryFire();
        this.reload();
      }
    }

    // --- movement ---
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) wish.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) wish.sub(forward);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) wish.add(right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) wish.sub(right);
    const sprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    if (wish.lengthSq() > 0) wish.normalize();
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    // horizontal velocity with acceleration/friction
    const accel = this.onGround ? 42 : 10;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt * 0.25);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt * 0.25);

    // jump + gravity
    if ((this.keys['Space']) && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
    }
    this.vel.y += GRAVITY * dt;

    // integrate horizontal with collision
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const res = this.world.collide(nx, nz, PLAYER_RADIUS);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // vertical
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= EYE_HEIGHT) {
      this.pos.y = EYE_HEIGHT;
      this.vel.y = 0;
      this.onGround = true;
    }

    // head bob
    const moving = wish.lengthSq() > 0 && this.onGround;
    this.bobT += dt * (sprinting ? 13 : 9) * (moving ? 1 : 0);
    const bob = moving ? Math.sin(this.bobT) * 0.035 : 0;

    // recoil recovery
    this.recoil = Math.max(0, this.recoil - dt * 6);
    // muzzle flash decay
    this.muzzleFlashT = Math.max(0, this.muzzleFlashT - dt);
    this.muzzleLight.intensity = this.muzzleFlashT > 0 ? 55 * (this.muzzleFlashT / 0.06) : 0;

    // camera shake
    let shx = 0, shy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.35);
      shx = (Math.random() - 0.5) * a * 2;
      shy = (Math.random() - 0.5) * a * 2;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }

    this.camera.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil * 0.5 + shy, this.yaw, 0, 'YXZ');
    this.camera.position.x += shx;
    this.camera.position.y += shy;

    // weapon sway/bob
    this.weapon.position.y = -0.18 + (moving ? Math.sin(this.bobT * 0.5) * 0.012 : 0);
    this.weapon.position.x = 0.24 + (moving ? Math.cos(this.bobT * 0.5) * 0.008 : 0);
    this.weapon.rotation.x = this.recoil * 0.35;
  }

  _applyCamera() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  shoot() {
    this.ammo--;
    this.ui.setAmmo(this.ammo, MAG_SIZE);
    this.ui.crosshairFire();
    this.recoil = Math.min(0.06, this.recoil + 0.02);
    this.pitch += 0.004; // slight vertical kick
    this.muzzleFlashT = 0.06;
    this.audio.shoot();
    this.shake(0.08, 0.002);

    // ray with spread
    const spread = 0.006;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1
    );
    this.raycaster.setFromCamera(new THREE.Vector2(dir.x, dir.y), this.camera);
    // apply spread in world space
    this.raycaster.ray.direction.x += (Math.random() - 0.5) * spread;
    this.raycaster.ray.direction.normalize();

    const targets = this.game.getShootTargets();
    const hits = this.raycaster.intersectObjects(targets, true);
    const muzzle = this.weapon.localToWorld(this.muzzleWorld.set(0, 0.015, -0.6));

    let end = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 80);
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      const enemy = this._findEnemy(h.object);
      if (enemy) {
        const killed = enemy.hit(GUN_DAMAGE, h.point, this.raycaster.ray.direction);
        this.ui.hitmarker(killed);
        this.audio.hit(killed);
      } else {
        this.effects.impact(h.point, 0x8ef3ff);
      }
    }
    this.effects.tracer(muzzle, end);
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
