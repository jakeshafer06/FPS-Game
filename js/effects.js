import * as THREE from 'three';

const MAX_PARTICLES = 500;

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // --- particle pool (Points) ---
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pColor = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pBaseSize = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pNext = 0;

    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pColor, 3));
    this.pGeo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    this.pPoints = new THREE.Points(this.pGeo, this.makePointsMaterial());
    this.pPoints.frustumCulled = false;
    scene.add(this.pPoints);
    // park dead particles far below
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -999;

    // --- tracer pool ---
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: 0x8ef3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, maxLife: 0.07 });
    }

    // --- shockwave rings ---
    this.rings = [];
    const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 48);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x29e6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, maxLife: 0.5, maxRadius: 9 });
    }

    // --- enemy projectiles ---
    this.projGeo = new THREE.SphereGeometry(0.22, 10, 8);
    this.projPool = [];

    // --- explosion light ---
    this.boomLight = new THREE.PointLight(0xffaa33, 0, 14, 2);
    scene.add(this.boomLight);
    this.boomLife = 0;
  }

  makePointsMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (180.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
  }

  spawnBurst(x, y, z, color, count, speed, life, size, drag = 2.5) {
    const col = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = Math.cos(a) * Math.cos(b) * s;
      this.pVel[i * 3 + 1] = Math.sin(b) * s + speed * 0.3;
      this.pVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.pLife[i] = life * (0.6 + Math.random() * 0.4);
      this.pMaxLife[i] = this.pLife[i];
      this.pColor[i * 3] = col.r; this.pColor[i * 3 + 1] = col.g; this.pColor[i * 3 + 2] = col.b;
      this.pBaseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.pSize[i] = this.pBaseSize[i];
      this.pDrag[i] = drag;
    }
  }

  impact(point, color) {
    this.spawnBurst(point.x, point.y, point.z, color, 10, 3.5, 0.35, 6);
  }

  explosion(x, y, z, color) {
    this.spawnBurst(x, y, z, color, 34, 6, 0.7, 9, 1.6);
    this.spawnBurst(x, y, z, 0xffffff, 8, 2.5, 0.3, 12, 1.2);
    this.boomLight.position.set(x, y + 0.5, z);
    this.boomLight.intensity = 60;
    this.boomLife = 0.35;
  }

  tracer(from, to, color = 0x8ef3ff) {
    let t = null;
    for (const tr of this.tracers) {
      if (!tr.mesh.visible) { t = tr; break; }
    }
    if (!t) t = this.tracers[0];
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    t.mesh.position.copy(from).addScaledVector(dir, 0.5);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.9;
    t.life = t.maxLife = 0.07;
  }

  /* Expanding shockwave ring (ability / boss telegraph) */
  shockwave(pos, color = 0x29e6ff, maxRadius = 9, life = 0.5) {
    let r = null;
    for (const ring of this.rings) if (!ring.mesh.visible) { r = ring; break; }
    if (!r) r = this.rings[0];
    r.mesh.position.set(pos.x, pos.y, pos.z);
    r.mesh.material.color.setHex(color);
    r.mesh.visible = true;
    r.life = r.maxLife = life;
    r.maxRadius = maxRadius;
    this.spawnBurst(pos.x, pos.y, pos.z, color, 40, 9, 0.5, 8, 2.0);
  }

  /* Projectile pool for ranged enemies: returns a mesh you own until release() */
  acquireProjectile(color) {
    let m = this.projPool.pop();
    if (!m) {
      m = new THREE.Mesh(this.projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      this.scene.add(m);
    }
    m.material.color.setHex(color);
    m.visible = true;
    return m;
  }
  releaseProjectile(m) {
    m.visible = false;
    this.projPool.push(m);
  }

  update(dt) {
    // particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.pPos[i * 3 + 1] = -999;
        continue;
      }
      const k = 1 - this.pDrag[i] * dt;
      this.pVel[i * 3] *= k;
      this.pVel[i * 3 + 1] = this.pVel[i * 3 + 1] * k - 9 * dt;
      this.pVel[i * 3 + 2] *= k;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      // shrink toward end of life
      const f = this.pLife[i] / this.pMaxLife[i];
      this.pSize[i] = this.pBaseSize[i] * f;
    }
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
    this.pGeo.attributes.size.needsUpdate = true;

    // tracers
    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.life -= dt;
      if (tr.life <= 0) { tr.mesh.visible = false; continue; }
      tr.mesh.material.opacity = 0.9 * (tr.life / tr.maxLife);
    }

    // rings
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const f = 1 - r.life / r.maxLife;
      const rad = Math.max(0.05, r.maxRadius * Math.sqrt(f));
      r.mesh.scale.set(rad, rad, 1);
      r.mesh.material.opacity = 0.9 * (1 - f);
    }

    // boom light
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      this.boomLight.intensity = 60 * Math.max(0, this.boomLife / 0.35);
    } else {
      this.boomLight.intensity = 0;
    }
  }
}
