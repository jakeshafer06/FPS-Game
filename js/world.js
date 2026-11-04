import * as THREE from 'three';

export const ARENA_HALF = 30;
export const WALL_H = 6;

/* Procedural grid floor texture — pure canvas, no external assets */
function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a1017';
  ctx.fillRect(0, 0, 512, 512);
  // subtle panel variation
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * 8) * 64;
    const y = Math.floor(Math.random() * 8) * 64;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(20,32,46,0.6)' : 'rgba(8,13,20,0.8)';
    ctx.fillRect(x, y, 64, 64);
  }
  // grid lines
  ctx.strokeStyle = 'rgba(41,230,255,0.38)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(512, i * 64); ctx.stroke();
  }
  // bright seams
  ctx.strokeStyle = 'rgba(120,245,255,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x, z, hx, hz} AABBs
    this.raycastTargets = [];
    this._build();
  }

  _addCollider(x, z, hx, hz) {
    this.colliders.push({ x, z, hx, hz });
  }

  _build() {
    const scene = this.scene;

    // --- floor ---
    const floorMat = new THREE.MeshStandardMaterial({
      map: makeGridTexture(),
      roughness: 0.8,
      metalness: 0.25,
      color: 0xbfd4e6,
      emissive: new THREE.Color(0x0e3a4c),
      emissiveIntensity: 0.55,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    scene.add(floor);
    this.raycastTargets.push(floor);

    // --- walls ---
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x121c2a, roughness: 0.6, metalness: 0.5 });
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420, emissive: 0x29e6ff, emissiveIntensity: 2.2, roughness: 0.4,
    });
    const wallLen = ARENA_HALF * 2;
    const wallDefs = [
      { x: 0, z: -ARENA_HALF - 0.5, w: wallLen, d: 1 },
      { x: 0, z: ARENA_HALF + 0.5, w: wallLen, d: 1 },
      { x: -ARENA_HALF - 0.5, z: 0, w: 1, d: wallLen },
      { x: ARENA_HALF + 0.5, z: 0, w: 1, d: wallLen },
    ];
    for (const w of wallDefs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, WALL_H, w.d), wallMat);
      wall.position.set(w.x, WALL_H / 2, w.z);
      scene.add(wall);
      this.raycastTargets.push(wall);
      this._addCollider(w.x, w.z, w.w / 2, w.d / 2);
      // neon strip along wall top
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w.w === 1 ? 0.15 : wallLen, 0.12, w.d === 1 ? 0.15 : wallLen),
        stripMat
      );
      strip.position.set(w.x, WALL_H - 0.4, w.z);
      scene.add(strip);
    }

    // --- obstacles: pillars + crates ---
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.5, metalness: 0.6 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.7, metalness: 0.3 });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0c1622, emissive: 0xff2e6b, emissiveIntensity: 2.0,
    });

    const pillars = [
      [-14, -14], [14, -14], [-14, 14], [14, 14],
      [0, -24], [0, 24], [-18, 0], [18, 0],
    ];
    for (const [x, z] of pillars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.2, 2.4), pillarMat);
      m.position.set(x, 2.6, z);
      scene.add(m);
      this.raycastTargets.push(m);
      this._addCollider(x, z, 1.2, 1.2);
      // glowing core band
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 2.5), stripMat);
      band.position.set(x, 3.4, z);
      scene.add(band);
    }

    // central bunker
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), pillarMat);
    bunker.position.set(0, 1.5, 0);
    scene.add(bunker);
    this.raycastTargets.push(bunker);
    this._addCollider(0, 0, 4, 4);
    const bunkerTrim = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.15, 8.1), stripMat);
    bunkerTrim.position.set(0, 3.05, 0);
    scene.add(bunkerTrim);
    // magenta energy core above the bunker
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), coreMat);
    core.position.set(0, 4.4, 0);
    scene.add(core);
    this.core = core;

    // scattered crates
    const cratePos = [
      [-8, -6], [9, -5], [-6, 8], [7, 9], [-20, -8], [20, 8],
      [-9, -20], [10, 21], [22, -18], [-22, 18],
    ];
    const crateGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    for (const [x, z] of cratePos) {
      const m = new THREE.Mesh(crateGeo, crateMat);
      m.position.set(x, 0.85, z);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
      this.raycastTargets.push(m);
      this._addCollider(x, z, 1.0, 1.0);
    }

    // --- lights ---
    scene.add(new THREE.HemisphereLight(0x4a5f80, 0x101820, 1.05));
    const dir = new THREE.DirectionalLight(0xcfe8ff, 1.6);
    dir.position.set(18, 30, 10);
    scene.add(dir);
    const pt1 = new THREE.PointLight(0x29e6ff, 40, 40, 1.8);
    pt1.position.set(-22, 5, -22);
    scene.add(pt1);
    const pt2 = new THREE.PointLight(0xff2e6b, 40, 40, 1.8);
    pt2.position.set(22, 5, 22);
    scene.add(pt2);

    // --- starfield ---
    const starGeo = new THREE.BufferGeometry();
    const starCount = 300;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 160;
      positions[i * 3 + 1] = 40 + Math.random() * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.6, sizeAttenuation: true, fog: false })
    );
    scene.add(stars);

    // fog + bg
    scene.fog = new THREE.Fog(0x0a1018, 40, 130);
    scene.background = new THREE.Color(0x070b12);
  }

  update(dt, t) {
    if (this.core) {
      this.core.rotation.y += dt * 0.8;
      this.core.rotation.x += dt * 0.3;
    }
  }

  /* circle vs AABB push-out. returns true if collided */
  collide(px, pz, radius) {
    let hit = false;
    for (const c of this.colliders) {
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
    return { x: px, z: pz, hit };
  }
}
