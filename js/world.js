import * as THREE from 'three';

export const ARENA_HALF = 34;
export const WALL_H = 6;
export const STEP_HEIGHT = 1.1; // how high the player can step up without jumping

/* ---------- procedural textures (pure canvas, no external assets) ---------- */
function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1017';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * 8) * 64;
    const y = Math.floor(Math.random() * 8) * 64;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(20,32,46,0.6)' : 'rgba(8,13,20,0.8)';
    ctx.fillRect(x, y, 64, 64);
  }
  ctx.strokeStyle = 'rgba(41,230,255,0.38)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(512, i * 64); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,245,255,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#141e2b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.strokeStyle = 'rgba(41,230,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 216, 216);
  ctx.fillStyle = 'rgba(41,230,255,0.35)';
  for (const [x, y] of [[28, 28], [228, 28], [28, 228], [228, 228]]) {
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, color, sub) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#06090f';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 1004, 236);
  ctx.font = 'bold 150px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillText(text, 512, sub ? 108 : 128, 940);
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = '38px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(216,230,242,0.8)';
    ctx.fillText(sub, 512, 205);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHazardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffb020';
  for (let x = -64; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 64); ctx.lineTo(x + 32, 64); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, 0);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- world ---------- */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x, z, hx, hz, top}
    this.raycastTargets = [];
    this.gates = [];      // enemy spawn gates {x, z, nx, nz}
    this.animated = [];   // {obj, fn}
    this._build();
  }

  _addCollider(x, z, hx, hz, top) {
    this.colliders.push({ x, z, hx, hz, top });
  }

  _box(w, h, d, mat, x, y, z, { collide = true, raycast = true, ry = 0 } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    if (raycast) this.raycastTargets.push(m);
    if (collide) this._addCollider(x, z, w / 2, d / 2, y + h / 2);
    return m;
  }

  _build() {
    const scene = this.scene;
    const H = ARENA_HALF;

    /* materials */
    const M = this.M = {
      floor: new THREE.MeshStandardMaterial({
        map: makeGridTexture(), roughness: 0.8, metalness: 0.25, color: 0xbfd4e6,
        emissive: new THREE.Color(0x0e3a4c), emissiveIntensity: 0.55,
      }),
      wall: new THREE.MeshStandardMaterial({ color: 0x121c2a, roughness: 0.6, metalness: 0.5 }),
      plate: new THREE.MeshStandardMaterial({ map: makePlateTexture(), color: 0x8fa6ba, roughness: 0.6, metalness: 0.5, emissive: 0x1b2a3c, emissiveIntensity: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.5, metalness: 0.6 }),
      crate: new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.7, metalness: 0.3 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x29e6ff, emissiveIntensity: 1.1, roughness: 0.4 }),
      magenta: new THREE.MeshStandardMaterial({ color: 0x0c1622, emissive: 0xff2e6b, emissiveIntensity: 1.1 }),
      amber: new THREE.MeshStandardMaterial({ color: 0x0c1622, emissive: 0xffb020, emissiveIntensity: 1.0 }),
      hazard: new THREE.MeshStandardMaterial({ map: makeHazardTexture(), roughness: 0.8, metalness: 0.2, emissive: 0x3a2808, emissiveIntensity: 0.4 }),
    };

    /* floor */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    scene.add(floor);
    this.raycastTargets.push(floor);

    /* perimeter walls + neon + signage */
    const wallLen = H * 2 + 2;
    const wallDefs = [
      { x: 0, z: -H - 0.5, w: wallLen, d: 1, nx: 0, nz: 1 },
      { x: 0, z: H + 0.5, w: wallLen, d: 1, nx: 0, nz: -1 },
      { x: -H - 0.5, z: 0, w: 1, d: wallLen, nx: 1, nz: 0 },
      { x: H + 0.5, z: 0, w: 1, d: wallLen, nx: -1, nz: 0 },
    ];
    for (const w of wallDefs) {
      this._box(w.w, WALL_H, w.d, M.wall, w.x, WALL_H / 2, w.z);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w.w === 1 ? 0.15 : wallLen, 0.12, w.d === 1 ? 0.15 : wallLen), M.cyan);
      strip.position.set(w.x, WALL_H - 0.4, w.z);
      scene.add(strip);
      // hazard chevron band near the floor
      const band = new THREE.Mesh(new THREE.BoxGeometry(w.w === 1 ? 0.12 : wallLen, 0.6, w.d === 1 ? 0.12 : wallLen), M.hazard);
      band.position.set(w.x + w.nx * 0.5, 0.9, w.z + w.nz * 0.5);
      scene.add(band);
    }
    const signs = [
      { tex: makeSignTexture('SECTOR 07', '#ff2e6b', 'ORBITAL DEFENSE PROTOCOL'), x: 0, z: -H + 0.02, ry: 0 },
      { tex: makeSignTexture('SHOOT CLANKERS', '#29e6ff', 'HOLD THE GRID'), x: 0, z: H - 0.02, ry: Math.PI },
      { tex: makeSignTexture('EAST GATE', '#ffb020', 'HOSTILE INGRESS'), x: H - 0.02, z: 0, ry: -Math.PI / 2 },
      { tex: makeSignTexture('WEST GATE', '#ffb020', 'HOSTILE INGRESS'), x: -H + 0.02, z: 0, ry: Math.PI / 2 },
    ];
    for (const s of signs) {
      const mat = new THREE.MeshStandardMaterial({ map: s.tex, emissive: 0xffffff, emissiveMap: s.tex, emissiveIntensity: 0.9, roughness: 0.6 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), mat);
      m.position.set(s.x, 3.6, s.z);
      m.rotation.y = s.ry;
      scene.add(m);
    }

    /* spawn gates: portal rings set into the walls */
    const gateGeo = new THREE.TorusGeometry(1.6, 0.14, 8, 28);
    const gateDefs = [
      [-12, -H], [12, -H], [-12, H], [12, H], [-H, -12], [-H, 12], [H, -12], [H, 12],
    ];
    for (const [gx, gz] of gateDefs) {
      const nx = gx === -H ? 1 : gx === H ? -1 : 0;
      const nz = gz === -H ? 1 : gz === H ? -1 : 0;
      const ring = new THREE.Mesh(gateGeo, M.magenta);
      ring.position.set(gx + nx * 0.3, 1.9, gz + nz * 0.3);
      ring.rotation.y = nx !== 0 ? Math.PI / 2 : 0;
      scene.add(ring);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(1.45, 24), new THREE.MeshBasicMaterial({ color: 0x3a0a1a, transparent: true, opacity: 0.85 }));
      inner.position.copy(ring.position);
      inner.rotation.y = nx !== 0 ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (nz > 0 ? 0 : Math.PI);
      scene.add(inner);
      this.gates.push({ x: gx + nx * 2.6, z: gz + nz * 2.6, nx, nz, ring });
      this.animated.push({ obj: ring, fn: (o, dt, t) => { o.scale.setScalar(1 + Math.sin(t * 2.2 + gx) * 0.05); } });
    }

    /* central dais: two steppable tiers + energy core */
    this._box(16, 1.0, 16, M.plate, 0, 0.5, 0);
    this._trim(16.1, 1.02, 16.1, M.cyan, 0, 1.0, 0);
    this._box(8, 1.0, 8, M.plate, 0, 1.5, 0);
    this._trim(8.1, 2.02, 8.1, M.magenta, 0, 2.0, 0);
    for (const [px, pz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
      this._box(0.4, 4.4, 0.4, M.dark, px, 4.2, pz);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), M.magenta);
      tip.position.set(px, 6.5, pz);
      scene.add(tip);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), M.magenta);
    core.position.set(0, 6.4, 0);
    scene.add(core);
    this.core = core;
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 40), M.cyan);
    coreRing.position.copy(core.position);
    scene.add(coreRing);
    this.animated.push({ obj: coreRing, fn: (o, dt) => { o.rotation.x += dt * 0.9; o.rotation.y += dt * 0.4; } });
    const coreLight = new THREE.PointLight(0xff2e6b, 30, 26, 1.8);
    coreLight.position.set(0, 7.2, 0);
    scene.add(coreLight);

    /* quadrant bastions: raised platforms with a cover wall on top */
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = sx * 19, bz = sz * 17;
      this._box(10, 1.0, 8, M.plate, bx, 0.5, bz);
      this._trim(10.1, 1.02, 8.1, M.amber, bx, 1.0, bz);
      // cover wall facing the center
      this._box(4.5, 1.5, 0.6, M.dark, bx - sx * 1.5, 1.75, bz - sz * 2.6);
      const coverTrim = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.7), M.cyan);
      coverTrim.position.set(bx - sx * 1.5, 2.52, bz - sz * 2.6);
      scene.add(coverTrim);
      // corner light mast
      this._box(0.5, 7, 0.5, M.dark, sx * (H - 2.5), 3.5, sz * (H - 2.5));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), sx * sz > 0 ? M.magenta : M.cyan);
      lamp.position.set(sx * (H - 2.5), 7.2, sz * (H - 2.5));
      scene.add(lamp);
      const pl = new THREE.PointLight(sx * sz > 0 ? 0xff2e6b : 0x29e6ff, 45, 44, 1.8);
      pl.position.set(sx * (H - 4), 6.5, sz * (H - 4));
      scene.add(pl);
    }

    /* neon arches on the four lanes */
    for (const [ax, az, rot] of [[0, -25, 0], [0, 25, 0], [-25, 0, Math.PI / 2], [25, 0, Math.PI / 2]]) {
      const ox = rot === 0 ? 2.8 : 0, oz = rot === 0 ? 0 : 2.8;
      this._box(0.8, 4.6, 0.8, M.dark, ax - ox, 2.3, az - oz);
      this._box(0.8, 4.6, 0.8, M.dark, ax + ox, 2.3, az + oz);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 0.9), M.dark);
      lintel.position.set(ax, 4.9, az);
      lintel.rotation.y = rot;
      scene.add(lintel);
      this.raycastTargets.push(lintel);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.1, 0.5), M.cyan);
      glow.position.set(ax, 4.58, az);
      glow.rotation.y = rot;
      scene.add(glow);
    }

    /* energy conduits on the floor (decor) */
    for (const [cx, cz, w, d] of [[0, 20, 0.35, 24], [0, -20, 0.35, 24], [20, 0, 24, 0.35], [-20, 0, 24, 0.35]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), M.cyan);
      c.position.set(cx, 0.025, cz);
      scene.add(c);
    }

    /* mid-lane barriers (cover) */
    const barriers = [
      [9.5, -9.5, 3.4, 0.6, 0], [-9.5, -9.5, 3.4, 0.6, 0], [9.5, 9.5, 3.4, 0.6, 0], [-9.5, 9.5, 3.4, 0.6, 0],
      [16, 0, 0.6, 3.4, 0], [-16, 0, 0.6, 3.4, 0], [0, 15, 3.4, 0.6, 0], [0, -15, 3.4, 0.6, 0],
    ];
    for (const [bx, bz, w, d] of barriers) {
      this._box(w, 2.2, d, M.dark, bx, 1.1, bz);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.08, d + 0.05), M.amber);
      t.position.set(bx, 2.24, bz);
      scene.add(t);
    }

    /* crates (jump-on-able) and a few stacks */
    const cratePos = [
      [-7, -12], [7, -12], [-7, 12], [7, 12], [-13, -5], [13, -5], [-13, 5], [13, 5],
      [-27, -6], [27, 6], [6, -28], [-6, 28],
    ];
    for (const [x, z] of cratePos) {
      this._box(1.7, 1.7, 1.7, M.crate, x, 0.85, z, { ry: (x * 7 + z * 3) % 1.2 });
    }
    for (const [x, z] of [[-27, 6], [27, -6]]) {
      this._box(1.7, 1.7, 1.7, M.crate, x, 0.85, z);
      this._box(1.5, 1.5, 1.5, M.crate, x, 2.45, z, { ry: 0.4 });
    }

    /* lights */
    scene.add(new THREE.HemisphereLight(0x4a5f80, 0x101820, 1.05));
    const dir = new THREE.DirectionalLight(0xcfe8ff, 1.5);
    dir.position.set(18, 30, 10);
    scene.add(dir);

    /* sky: stars, floating hex panels, distant planet */
    const starGeo = new THREE.BufferGeometry();
    const starCount = 400;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = 30 + Math.random() * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.6, sizeAttenuation: true, fog: false })));

    const hexGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.2, 6);
    const hexMat = new THREE.MeshStandardMaterial({ color: 0x0c1622, emissive: 0x29e6ff, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.6, fog: false });
    const hexGroup = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 46 + (i % 3) * 5;
      const m = new THREE.Mesh(hexGeo, hexMat);
      m.position.set(Math.cos(a) * r, 16 + (i % 4) * 4, Math.sin(a) * r);
      m.rotation.set(0.3, a, 0.2);
      hexGroup.add(m);
    }
    scene.add(hexGroup);
    this.animated.push({ obj: hexGroup, fn: (o, dt) => { o.rotation.y += dt * 0.02; } });

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(16, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1030, emissive: 0x3a1a5a, emissiveIntensity: 0.6, roughness: 0.9, fog: false })
    );
    planet.position.set(-70, 40, -90);
    scene.add(planet);
    const planetRing = new THREE.Mesh(
      new THREE.TorusGeometry(24, 1.4, 4, 64),
      new THREE.MeshBasicMaterial({ color: 0xff2e6b, transparent: true, opacity: 0.45, fog: false })
    );
    planetRing.position.copy(planet.position);
    planetRing.rotation.x = Math.PI / 2.4;
    scene.add(planetRing);

    scene.fog = new THREE.Fog(0x0a1018, 45, 150);
    scene.background = new THREE.Color(0x070b12);
  }

  // Emissive edge band around a platform: four thin bars hugging the sides,
  // with the top of the band just below the platform surface so the glowing
  // material never covers the walkable top face.
  _trim(w, y, d, mat, x, _y, z) {
    const group = new THREE.Group();
    const h = 0.14, th = 0.08;
    const topY = y - 0.08; // y is the trim centre passed by callers (~top of tier)
    const bars = [
      [w, th, x, z + d / 2 - th / 2],
      [w, th, x, z - d / 2 + th / 2],
      [th, d - th * 2, x + w / 2 - th / 2, z],
      [th, d - th * 2, x - w / 2 + th / 2, z],
    ];
    for (const [bw, bd, bx, bz] of bars) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), mat);
      b.position.set(bx, topY - h / 2, bz);
      group.add(b);
    }
    this.scene.add(group);
    return group;
  }

  update(dt, t) {
    if (this.core) {
      this.core.rotation.y += dt * 0.8;
      this.core.rotation.x += dt * 0.3;
    }
    for (const a of this.animated) a.fn(a.obj, dt, t);
  }

  /* Pick a spawn gate at least minDist from the player */
  pickGate(playerPos, minDist = 14) {
    const far = this.gates.filter((g) => Math.hypot(g.x - playerPos.x, g.z - playerPos.z) >= minDist);
    const pool = far.length ? far : this.gates;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Resolve a vertical cylinder (radius, feet at feetY) against the world.
   * Colliders whose top is within `step` of the feet become walkable ground;
   * taller ones push the cylinder out horizontally.
   * Returns {x, z, ground, hit}.
   */
  resolve(px, pz, radius, feetY, step = STEP_HEIGHT) {
    let hit = false;
    for (const c of this.colliders) {
      if (c.top - feetY <= step) continue; // walkable: handled below
      const dx = px - c.x;
      const dz = pz - c.z;
      const ox = c.hx + radius - Math.abs(dx);
      const oz = c.hz + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        hit = true;
        if (ox < oz) px += dx > 0 ? ox : -ox;
        else pz += dz > 0 ? oz : -oz;
      }
    }
    let ground = 0;
    for (const c of this.colliders) {
      if (c.top - feetY > step) continue;
      const dx = Math.abs(px - c.x);
      const dz = Math.abs(pz - c.z);
      // use a slightly smaller footprint so you can't stand on thin air at the edge
      if (dx < c.hx + radius * 0.5 && dz < c.hz + radius * 0.5 && c.top > ground) ground = c.top;
    }
    return { x: px, z: pz, ground, hit };
  }

  /* Legacy 2D helper (used by enemies that hover): treats everything above `step` as a wall */
  collide(px, pz, radius, step = 2.6) {
    const r = this.resolve(px, pz, radius, 0, step);
    return { x: r.x, z: r.z, hit: r.hit, ground: r.ground };
  }
}
