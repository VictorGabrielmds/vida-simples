// Carros circulando pelas ruas reais (decorativo: anda em tempo real, mão direita)
import * as THREE from 'three';
import { gradBox } from './fx.js';

const DRIVE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified']);
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const COLORS = ['#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#c0c4cc', '#22223b', '#ffffff', '#8d99ae', '#d62828', '#3a86ff', '#ffbe0b'];

export class Traffic {
  constructor(scene, roads, lampMat, n = 90) {
    this.roads = [];
    const key = p => `${Math.round(p[0])}|${Math.round(p[1])}`;
    this.nodes = new Map();
    for (const r of roads) {
      if (!DRIVE.has(r.t) || r.p.length < 2) continue;
      const cum = [0]; for (let i = 1; i < r.p.length; i++) cum.push(cum[i - 1] + Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]));
      const R = { ...r, cum, len: cum[cum.length - 1], id: this.roads.length };
      if (R.len < 8) continue;
      this.roads.push(R);
      for (const [end, p] of [[0, r.p[0]], [1, r.p[r.p.length - 1]]]) { const k = key(p); if (!this.nodes.has(k)) this.nodes.set(k, []); this.nodes.get(k).push({ R, end }); }
    }
    this.key = key;
    const weighted = []; for (const R of this.roads) { const w = MAIN.has(R.t) ? 6 : 1; for (let i = 0; i < w; i++) weighted.push(R); }
    this.cars = [];
    for (let i = 0; i < n; i++) {
      const R = weighted[Math.floor(Math.random() * weighted.length)];
      const dir = R.o ? 1 : (Math.random() < 0.5 ? 1 : -1);
      this.cars.push({ R, s: Math.random() * R.len, dir, v: MAIN.has(R.t) ? 11 + Math.random() * 5 : 6 + Math.random() * 3 });
    }
    // malhas instanciadas
    const N = this.cars.length;
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
    this.body = new THREE.InstancedMesh(gradBox(0.55), white, N);
    this.cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#2b3a4a' }), N);
    this.wheels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#1d1d1f' }), N);
    this.lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lampMat, N);
    this.tail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.tailMat = new THREE.MeshLambertMaterial({ color: '#7a1010', emissive: '#ff2a2a', emissiveIntensity: 0 }), N);
    const c = new THREE.Color();
    this.cars.forEach((car, i) => this.body.setColorAt(i, c.set(COLORS[i % COLORS.length])));
    for (const m of [this.body, this.cabin, this.wheels, this.lights, this.tail]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sv = new THREE.Vector3();
    this.update(0);
  }
  pointAt(R, s) {
    const cum = R.cum; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = R.p[i - 1], b = R.p[i], seg = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }
  nextRoad(car) {
    const endP = car.dir > 0 ? car.R.p[car.R.p.length - 1] : car.R.p[0];
    const opts = (this.nodes.get(this.key(endP)) || []).filter(o => o.R !== car.R && !(o.R.o && o.end === 1));
    if (!opts.length) { if (car.R.o) { car.s = 0; return; } car.dir = -car.dir; return; } // retorno no fim da rua
    const pref = opts.filter(o => MAIN.has(o.R.t) === MAIN.has(car.R.t));
    const pool = pref.length && Math.random() < 0.7 ? pref : opts;
    const o = pool[Math.floor(Math.random() * pool.length)];
    car.R = o.R; car.dir = o.end === 0 ? 1 : -1; car.s = o.end === 0 ? 0.01 : o.R.len - 0.01;
    car.v = MAIN.has(o.R.t) ? 11 + Math.random() * 5 : 6 + Math.random() * 3;
  }
  update(dt, night = 0) {
    const { m4, q, e, v, sv } = this;
    this.cars.forEach((car, i) => {
      car.s += car.dir * car.v * dt;
      if (car.s > car.R.len || car.s < 0) { const over = car.s > car.R.len ? car.s - car.R.len : -car.s; this.nextRoad(car); car.s = Math.max(0, Math.min(car.R.len, car.s + car.dir * over)); }
      const [x, z, tx, tz] = this.pointAt(car.R, car.s);
      const dx = tx * car.dir, dz = tz * car.dir;
      const lane = car.R.o ? (car.R.w > 6 ? (i % 2 ? 1 : -1) * car.R.w * 0.18 : 0) : car.R.w * 0.24;
      const px = x - dz * lane, pz = z + dx * lane;
      const yaw = Math.atan2(dx, dz); q.setFromEuler(e.set(0, yaw, 0));
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.body.setMatrixAt(i, m4.compose(v.set(px, 0.32, pz), q, sv.set(1.8, 0.62, 4.1)));
      this.cabin.setMatrixAt(i, m4.compose(v.set(px - fx * 0.25, 0.92, pz - fz * 0.25), q, sv.set(1.58, 0.55, 2.1)));
      this.wheels.setMatrixAt(i, m4.compose(v.set(px, 0.08, pz), q, sv.set(1.92, 0.42, 3.0)));
      this.lights.setMatrixAt(i, m4.compose(v.set(px + fx * 2.06, 0.62, pz + fz * 2.06), q, sv.set(1.5, 0.16, 0.06)));
      this.tail.setMatrixAt(i, m4.compose(v.set(px - fx * 2.06, 0.66, pz - fz * 2.06), q, sv.set(1.5, 0.14, 0.06)));
    });
    for (const m of [this.body, this.cabin, this.wheels, this.lights, this.tail]) m.instanceMatrix.needsUpdate = true;
    this.tailMat.emissiveIntensity = 0.4 + night * 1.6;
  }
}
