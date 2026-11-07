import * as THREE from 'three';
import { Nav } from './nav.js';
import { mat, makeLabel } from './char.js';

export const W = 64, H = 42;
export const APT = { ox: 4, oz: 6, w: 18, d: 12 };
const APT_MAP = [
  '##################',
  '#......#.........#',
  '#......#.........#',
  '#................#',
  '#......#.........#',
  '#......#.........#',
  '########.........#',
  '#......#.........#',
  '#................#',
  '#......#.........#',
  '#......#.........#',
  '#########.########',
];
const FLOOR_Y = 0.12, OUT_Y = 0.07, WALL_H = 2.6;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const unit = new THREE.BoxGeometry(1, 1, 1);

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a9d8f5');
    this.nav = new Nav(W, H);
    this.objs = {}; this.pickables = []; this.walls = []; this.dirt = []; this.ownedGroups = {};
    this.cam = { target: new THREE.Vector3(14, 0, 14), yaw: Math.PI / 4, yawT: Math.PI / 4, zoom: 11, zoomT: 11, follow: true };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.pitch = 0.74;
    this.winMat = new THREE.MeshLambertMaterial({ color: '#7fa8c9', emissive: '#ffd37a', emissiveIntensity: 0 });
    this.lampMat = new THREE.MeshLambertMaterial({ color: '#fff4c2', emissive: '#ffd37a', emissiveIntensity: 0 });
    this.setupLights();
    this.build();
    this.resize();
    this.setTime(7 * 60);
    window.addEventListener('resize', () => this.resize());
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight('#ffffff', '#6a7a5a', 0.7); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.0);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.roomLight = new THREE.PointLight('#ffd9a0', 0, 22, 1.4); this.roomLight.position.set(APT.ox + 11, 2.3, APT.oz + 6);
    this.roomLight2 = new THREE.PointLight('#ffd9a0', 0, 12, 1.4); this.roomLight2.position.set(APT.ox + 3.5, 2.3, APT.oz + 3);
    this.roomLight3 = new THREE.PointLight('#ffd9a0', 0, 10, 1.4); this.roomLight3.position.set(APT.ox + 3.5, 2.3, APT.oz + 9);
    this.scene.add(this.roomLight, this.roomLight2, this.roomLight3);
  }

  // ---------- helpers ----------
  P(parent, w, h, d, color, x, y, z, opt = {}) {
    const m = new THREE.Mesh(unit, opt.material || mat(color, opt.extra));
    m.scale.set(w, h, d); m.position.set(x + w / 2, y + h / 2, z + d / 2);
    m.castShadow = opt.noShadow ? false : true; m.receiveShadow = opt.receive !== false;
    parent.add(m); return m;
  }
  groundY(x, z) {
    return (x >= APT.ox && x < APT.ox + APT.w && z >= APT.oz && z < APT.oz + APT.d) ? FLOOR_Y : OUT_Y;
  }
  register(o, group, pickable = true) {
    o.group = group; this.objs[o.id] = o;
    if (pickable) group.traverse(m => { if (m.isMesh) { m.userData.iid = o.id; this.pickables.push(m); } });
    return o;
  }

  // ---------- construção ----------
  build() {
    const S = this.scene, P = this.P.bind(this), r = rng(7);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat('#8cc17e')); ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; S.add(ground);
    this.groundMesh = ground;
    // calçadas e ruas
    P(S, W, 0.06, 4, '#cfcdc6', 0, 0, 18, { noShadow: true }); P(S, W, 0.06, 4, '#cfcdc6', 0, 0, 24, { noShadow: true });
    P(S, 2, 0.06, H, '#cfcdc6', 26, 0, 0, { noShadow: true }); P(S, 2, 0.06, H, '#cfcdc6', 30, 0, 0, { noShadow: true });
    P(S, W, 0.07, 2, '#4b4f57', 0, 0, 22, { noShadow: true }); P(S, 2, 0.07, H, '#4b4f57', 28, 0, 0, { noShadow: true });
    for (let x = 1; x < W; x += 4) if (x < 27 || x > 31) P(S, 1.6, 0.08, 0.14, '#e8e4c8', x, 0, 22.93, { noShadow: true });
    for (let z = 1; z < H; z += 4) if (z < 21 || z > 25) P(S, 0.14, 0.08, 1.6, '#e8e4c8', 28.93, 0, z, { noShadow: true });
    for (let i = 0; i < 6; i++) { P(S, 0.5, 0.085, 2, '#f0f0f0', 28.2 + i * 0.33, 0, 20.5, { noShadow: true }); }
    // apartamento
    this.buildApartment();
    // prédios
    this.addBuilding('bar', 'Bar do Zé', { x: 34, z: 8, w: 10, d: 9, h: 3.4, wall: '#d9a35f', roof: '#7a3b2e', face: 's', door: 38, icon: '🍺', hours: [11, 24] });
    this.addBuilding('julia_home', 'Casa da Júlia', { x: 47, z: 9, w: 10, d: 8, h: 3.0, wall: '#f2b5c4', roof: '#a8465e', face: 's', door: 51, icon: '💕', hours: [0, 24] });
    this.addBuilding('lucia_home', 'Casa da Dona Lúcia', { x: 22, z: 11, w: 4, d: 6, h: 2.8, wall: '#c9d6a3', roof: '#6b7f3a', face: 's', door: 23, icon: '🏡', hours: [0, 24] });
    this.addBuilding('market', 'Mercadinho', { x: 4, z: 29, w: 12, d: 9, h: 3.4, wall: '#a8d0e6', roof: '#2e6f95', face: 'n', door: 9, icon: '🛒', hours: [7, 22] });
    this.addBuilding('gym', 'Academia', { x: 18, z: 29, w: 8, d: 9, h: 3.6, wall: '#c7b8e6', roof: '#5b3f9a', face: 'n', door: 21, icon: '🏋️', hours: [6, 23] });
    this.addBuilding('office', 'Escritório', { x: 34, z: 29, w: 12, d: 10, h: 7, wall: '#b9c4d0', roof: '#4a5568', face: 'n', door: 39, icon: '💼', hours: [7, 19] });
    // decorativos ao norte
    const decor = [[4, 1, 8, 5], [14, 1, 7, 4], [33, 1, 9, 6], [44, 0, 8, 5], [54, 1, 8, 5]];
    const cols = ['#e3c6a0', '#b6c9d9', '#d9b3b3', '#c1d8b3', '#e0d3a2'];
    decor.forEach(([x, z, w, d], i) => {
      const g = new THREE.Group(); S.add(g);
      P(g, w, 3 + (i % 3) * 1.5, d, cols[i], x, 0, z); P(g, w + 0.3, 0.2, d + 0.3, '#7b7f87', x - 0.15, 3 + (i % 3) * 1.5, z - 0.15);
      this.nav.block(x, z, w, d);
      for (let k = 0; k < w - 1; k += 2) P(g, 0.9, 0.9, 0.06, null, x + 0.6 + k, 1.4, z + d, { material: this.winMat, noShadow: true });
    });
    this.buildPark();
    // árvores
    const trees = [[2, 3], [24, 3], [20, 4], [25, 8], [31, 5], [46, 14], [58, 14], [60, 6], [2, 14], [22, 1], [26, 15], [32, 17], [45, 18.2], [1, 29], [1, 36], [17, 38], [28, 39], [31, 33], [46, 38], [3, 40], [10, 40], [20, 40], [62, 20]];
    trees.forEach(([x, z]) => this.tree(Math.floor(x), Math.floor(z), r));
    // postes
    for (let x = 3; x < W; x += 10) if (x < 26 || x > 31) { this.lamp(x, 21); this.lamp(x + 5, 24); }
    // carros estacionados
    [[8, 22, '#c0392b'], [40, 23, '#2c7be5'], [14, 23, '#f1c40f']].forEach(([x, z, c]) => {
      const g = new THREE.Group(); S.add(g);
      P(g, 2.2, 0.55, 1, c, x, 0.12, z); P(g, 1.2, 0.45, 0.9, c, x + 0.5, 0.67, z + 0.05); P(g, 1.0, 0.3, 0.92, '#9fd3ee', x + 0.6, 0.72, z + 0.04);
      [[0.3, 0], [1.6, 0]].forEach(([dx]) => { P(g, 0.4, 0.4, 1.05, '#222', x + dx, 0.0, z - 0.02); });
    });
    // bairro: muros leves ao redor da casa da Lúcia / jardim
    this.nav.block(0, 0, 0, 0);
  }

  tree(x, z, r) {
    const g = new THREE.Group(); this.scene.add(g);
    this.P(g, 0.3, 1.1, 0.3, '#7a5230', x + 0.35, 0, z + 0.35);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 + r() * 0.3, 0), mat(['#3f9a4b', '#4aa85a', '#2f8a46'][Math.floor(r() * 3)]));
    m.position.set(x + 0.5, 1.9, z + 0.5); m.castShadow = true; m.rotation.y = r() * 3; g.add(m);
    this.nav.block(x, z);
  }
  lamp(x, z) {
    const g = new THREE.Group(); this.scene.add(g);
    this.P(g, 0.12, 2.4, 0.12, '#40444c', x + 0.44, 0, z + 0.44);
    this.P(g, 0.36, 0.2, 0.36, null, x + 0.32, 2.4, z + 0.32, { material: this.lampMat, noShadow: true });
    this.nav.block(x, z);
  }

  addBuilding(id, name, o) {
    const g = new THREE.Group(); this.scene.add(g); const P = this.P.bind(this);
    P(g, o.w, o.h, o.d, o.wall, o.x, 0, o.z);
    P(g, o.w + 0.5, 0.25, o.d + 0.5, o.roof, o.x - 0.25, o.h, o.z - 0.25);
    const south = o.face === 's', dz = south ? o.z + o.d : o.z - 0.08;
    P(g, 1.3, 1.9, 0.12, '#3a2a20', o.door - 0.15, 0, south ? o.z + o.d - 0.02 : o.z - 0.1);
    P(g, 1.9, 0.15, 0.7, o.roof, o.door - 0.45, 2.0, south ? o.z + o.d : o.z - 0.7);
    for (let k = 0; k < o.w - 2; k += 2) { const wx = o.x + 0.9 + k; if (Math.abs(wx - o.door) < 1.6) continue; P(g, 0.9, 1.0, 0.06, null, wx, 1.1, south ? o.z + o.d : o.z - 0.05, { material: this.winMat, noShadow: true }); }
    P(g, 0.06, 1.0, 0.9, null, o.x + o.w, 1.1, o.z + o.d / 2, { material: this.winMat, noShadow: true });
    this.nav.block(o.x, o.z, o.w, o.d);
    const approach = south ? [o.door, o.z + o.d] : [o.door, o.z - 1];
    const lbl = makeLabel(`${o.icon} ${name}`, { size: 30, scale: 0.0105 }); lbl.position.set(o.x + o.w / 2, o.h + 1.3, o.z + o.d / 2); this.scene.add(lbl);
    this.register({ id, name, type: id, kind: 'building', approach, hours: o.hours, icon: o.icon, center: [o.x + o.w / 2, o.h, o.z + o.d / 2] }, g);
  }

  buildPark() {
    const S = this.scene, P = this.P.bind(this);
    const g = new THREE.Group(); S.add(g);
    P(g, 15, 0.05, 13, '#79c26f', 48, 0, 28.5, { noShadow: true });
    P(g, 15, 0.06, 1.2, '#e7dcc0', 48, 0, 33.5, { noShadow: true }); P(g, 1.2, 0.06, 13, '#e7dcc0', 53, 0, 28.5, { noShadow: true });
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.08, 20), mat('#5aa9d6')); pond.position.set(58, 0.05, 36); pond.receiveShadow = true; g.add(pond);
    for (let x = 54; x < 63; x++) for (let z = 32; z < 41; z++) if (Math.hypot(x + 0.5 - 58, z + 0.5 - 36) < 2.9) this.nav.block(x, z);
    this.register({ id: 'park', name: 'Parque Central', type: 'park', kind: 'zone', approach: [50, 31], icon: '🌳', rect: [49, 29, 61, 40] }, g);
    [[49, 29], [61, 29], [49, 39], [51, 36], [60, 31], [61, 40]].forEach(([x, z]) => this.tree(x, z, rng(x * z)));
    const label = makeLabel('🌳 Parque', { size: 30, scale: 0.0105 }); label.position.set(55, 3.2, 30); S.add(label);
    [{ id: 'bench1', x: 51, z: 31, name: 'Banco do parque' }, { id: 'bench2', x: 55, z: 38, name: 'Banco do parque' }].forEach(b => {
      const bg = new THREE.Group(); S.add(bg);
      P(bg, 2, 0.1, 0.6, '#9a6b3f', b.x, 0.45, b.z + 0.25); P(bg, 2, 0.5, 0.1, '#9a6b3f', b.x, 0.6, b.z + 0.2); P(bg, 0.1, 0.45, 0.5, '#444', b.x + 0.1, 0, b.z + 0.3); P(bg, 0.1, 0.45, 0.5, '#444', b.x + 1.8, 0, b.z + 0.3);
      this.nav.block(b.x, b.z, 2, 1);
      this.register({ id: b.id, name: b.name, type: 'bench', kind: 'furn', approach: [b.x, b.z + 1], seat: { x: b.x + 0.6, z: b.z + 0.55, rot: 0, y: 0.3, pose: 'sit' }, seat2: { x: b.x + 1.4, z: b.z + 0.55, rot: 0, y: 0.3 } }, bg);
    });
  }

  buildApartment() {
    const S = this.scene, P = this.P.bind(this), { ox, oz, w, d } = APT;
    const base = new THREE.Group(); S.add(base);
    P(base, w, FLOOR_Y, d, '#8d8f94', ox, 0, oz);
    const floor = (c1, r1, cw, rd, col) => P(base, cw, 0.01, rd, col, ox + c1, FLOOR_Y, oz + r1, { noShadow: true });
    floor(1, 1, 6, 5, '#c9a67a'); floor(1, 7, 6, 4, '#b9d3df'); floor(7, 1, 10, 10, '#d9bb8d'); floor(7, 3, 1, 1, '#d9bb8d'); floor(7, 8, 1, 1, '#d9bb8d');
    floor(8, 1, 9, 2, '#e8e0d0');
    P(base, 1, 0.015, 0.6, '#7a5230', ox + 9, FLOOR_Y, oz + 11.2, { noShadow: true });
    // paredes
    for (let r = 0; r < APT_MAP.length; r++) for (let c = 0; c < APT_MAP[r].length; c++) {
      const wx = ox + c, wz = oz + r;
      if (APT_MAP[r][c] === '#') {
        this.nav.block(wx, wz);
        const m = new THREE.Mesh(unit, mat('#e9dfcc')); m.castShadow = true; m.receiveShadow = true;
        m.geometry = this.wallGeo || (this.wallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
        m.position.set(wx + 0.5, FLOOR_Y, wz + 0.5); S.add(m);
        let nx = 0, nz = 0; if (r === 0) nz = -1; if (r === APT.d - 1) nz = 1; if (c === 0) nx = -1; if (c === APT.w - 1) nx = 1;
        const perim = nx || nz; m.scale.set(1.0, perim ? WALL_H : 1.1, 1.0);
        if (perim) this.walls.push({ m, nx, nz, cur: WALL_H });
        if (!perim) m.material = mat('#f1e8d6');
      }
    }
    this.nav.block(ox + 9, oz + 11, 1, 1, 0); // porta
    this.nav.blocked[(oz + 11) * W + ox + 9] = 0;
    const F = (id, name, type, cx, cz, fw, fd, approach, build, extra = {}) => {
      const g = new THREE.Group(); g.position.set(ox + cx, FLOOR_Y, oz + cz); S.add(g); build(g);
      if (!extra.pass) this.nav.block(ox + cx, oz + cz, fw, fd);
      const o = { id, name, type, kind: 'furn', approach: [ox + approach[0], oz + approach[1]], cells: [ox + cx, oz + cz, fw, fd], ...extra };
      if (o.seatLocal) { o.seat = { x: ox + o.seatLocal[0], z: oz + o.seatLocal[1], rot: o.seatLocal[2], y: o.seatLocal[3], pose: o.seatLocal[4] || 'sit' }; }
      return this.register(o, g, extra.pick !== false);
    };
    const PP = (g, ...a) => P(g, ...a);
    // quarto
    F('bed', 'Cama', 'bed', 1, 1, 2, 3, [3, 3], g => {
      PP(g, 2, 0.3, 3, '#8a5a3b', 0, 0, 0); PP(g, 1.84, 0.22, 2.7, '#f4f4f8', 0.08, 0.3, 0.25); PP(g, 2, 0.85, 0.12, '#6b4328', 0, 0, 0);
      PP(g, 0.75, 0.12, 0.45, '#ffffff', 0.12, 0.52, 0.28); PP(g, 0.75, 0.12, 0.45, '#ffffff', 1.13, 0.52, 0.28); PP(g, 1.88, 0.08, 1.7, '#4f7bd9', 0.06, 0.52, 1.1);
    }, { seatLocal: [1.5, 2.55, 0, 0.62, 'sleep'], seat2: { x: ox + 2.5, z: oz + 3.4, rot: 0, y: 0.62, pose: 'sleep' } });
    F('wardrobe', 'Guarda-roupa', 'wardrobe', 5, 1, 2, 1, [5, 2], g => { PP(g, 2, 1.9, 0.9, '#b88b5e', 0, 0, 0); PP(g, 0.04, 1.8, 0.04, '#7a5a3a', 1, 0.05, 0.9); PP(g, 0.1, 0.3, 0.05, '#333', 0.82, 0.9, 0.9); PP(g, 0.1, 0.3, 0.05, '#333', 1.08, 0.9, 0.9); });
    F('bedside', 'Criado-mudo', 'decor', 3, 1, 1, 1, [3, 2], g => { PP(g, 0.8, 0.5, 0.8, '#8a5a3b', 0.1, 0, 0.1); PP(g, 0.2, 0.35, 0.2, '#f5e6b0', 0.4, 0.5, 0.4); }, { pick: false });
    F('pc', 'Computador', 'pc', 5, 5, 2, 1, [6, 4], g => {
      PP(g, 2, 0.06, 1, '#c9a073', 0, 0.72, 0); PP(g, 0.08, 0.72, 0.08, '#6b5a47', 0.05, 0, 0.05); PP(g, 0.08, 0.72, 0.08, '#6b5a47', 1.87, 0, 0.05); PP(g, 0.08, 0.72, 0.08, '#6b5a47', 0.05, 0, 0.87); PP(g, 0.08, 0.72, 0.08, '#6b5a47', 1.87, 0, 0.87);
      PP(g, 0.8, 0.5, 0.05, '#0f1318', 0.2, 0.95, 0.6); PP(g, 0.72, 0.42, 0.02, null, 0.24, 0.99, 0.57, { material: new THREE.MeshLambertMaterial({ color: '#4aa3df', emissive: '#2a6fb0', emissiveIntensity: 0.7 }) }); PP(g, 0.1, 0.2, 0.1, '#333', 0.55, 0.78, 0.6); PP(g, 0.5, 0.03, 0.2, '#ddd', 0.25, 0.78, 0.25);
      PP(g, 0.6, 0.08, 0.6, '#2e3138', 0.2, 0.42, -0.85); PP(g, 0.6, 0.5, 0.08, '#2e3138', 0.2, 0.42, -0.92); PP(g, 0.1, 0.4, 0.1, '#222', 0.45, 0, -0.6);
    }, { seatLocal: [5.5, 4.55, 0, 0.35], pass: false });
    this.nav.block(ox + 5, oz + 4, 1, 1, 0);
    // banheiro
    F('toilet', 'Vaso sanitário', 'toilet', 1, 7, 1, 1, [1, 8], g => { PP(g, 0.5, 0.4, 0.65, '#f4f6f8', 0.25, 0, 0.25); PP(g, 0.5, 0.65, 0.2, '#f4f6f8', 0.25, 0, 0.02); }, { seatLocal: [1.5, 7.55, 0, 0.3] });
    F('bsink', 'Pia do banheiro', 'bsink', 3, 7, 1, 1, [3, 8], g => { PP(g, 0.8, 0.8, 0.5, '#e9edf0', 0.1, 0, 0.02); PP(g, 0.8, 0.06, 0.5, '#ffffff', 0.1, 0.8, 0.02); PP(g, 0.6, 0.6, 0.04, '#a8d5e6', 0.2, 1.1, 0.01); });
    F('shower', 'Chuveiro', 'shower', 5, 9, 2, 2, [4, 9], g => {
      PP(g, 2, 0.08, 2, '#dfe6ea', 0, 0, 0); const glass = { extra: { transparent: true, opacity: 0.3 }, noShadow: true };
      PP(g, 0.04, 1.9, 2, '#9fd6ee', 0, 0, 0, glass); PP(g, 2, 1.9, 0.04, '#9fd6ee', 0, 0, 0, glass); PP(g, 0.4, 0.06, 0.4, '#bbb', 1.3, 1.9, 1.3); PP(g, 0.06, 1.9, 0.06, '#bbb', 1.9, 0, 1.9);
    }, { seatLocal: [5.5, 9.5, 0, 0.14, 'shower'] });
    // sala / cozinha
    F('fridge', 'Geladeira', 'fridge', 8, 1, 1, 1, [8, 2], g => { PP(g, 0.96, 1.75, 0.96, '#e9eef2', 0.02, 0, 0.02); PP(g, 0.9, 0.03, 0.02, '#9aa4ad', 0.05, 1.05, 0.98); PP(g, 0.05, 0.4, 0.05, '#555', 0.85, 1.15, 0.98); PP(g, 0.05, 0.5, 0.05, '#555', 0.85, 0.45, 0.98); });
    F('ksink', 'Pia da cozinha', 'ksink', 9, 1, 1, 1, [9, 2], g => { PP(g, 1, 0.85, 1, '#cfa77a', 0, 0, 0); PP(g, 1, 0.06, 1, '#dfe3e6', 0, 0.85, 0); PP(g, 0.6, 0.02, 0.6, '#8fa5b5', 0.2, 0.91, 0.2); PP(g, 0.08, 0.28, 0.08, '#c0c8d0', 0.46, 0.91, 0.08); });
    F('stove', 'Fogão', 'stove', 10, 1, 1, 1, [10, 2], g => { PP(g, 1, 0.85, 1, '#59616b', 0, 0, 0); [[0.15, 0.15], [0.6, 0.15], [0.15, 0.6], [0.6, 0.6]].forEach(([x, z]) => PP(g, 0.25, 0.03, 0.25, '#1b1b1b', x, 0.85, z)); PP(g, 0.8, 0.4, 0.03, '#23272c', 0.1, 0.2, 0.97); PP(g, 0.6, 0.04, 0.04, '#bbb', 0.2, 0.62, 0.99); });
    F('counter', 'Bancada', 'decor', 11, 1, 1, 1, [11, 2], g => { PP(g, 1, 0.85, 1, '#cfa77a', 0, 0, 0); PP(g, 1, 0.06, 1, '#dfe3e6', 0, 0.85, 0); PP(g, 0.3, 0.2, 0.3, '#c0392b', 0.2, 0.91, 0.3); }, { pick: false });
    F('table', 'Mesa de jantar', 'decor', 13, 3, 2, 2, [12, 3], g => {
      PP(g, 1.8, 0.08, 1.6, '#a97c50', 0.1, 0.72, 0.2); [[0.2, 0.3], [1.6, 0.3], [0.2, 1.5], [1.6, 1.5]].forEach(([x, z]) => PP(g, 0.1, 0.72, 0.1, '#6b4a2b', x, 0, z));
      [[0.4, -0.1], [1.2, -0.1], [0.4, 1.7], [1.2, 1.7]].forEach(([x, z]) => PP(g, 0.4, 0.45, 0.4, '#7e5a3a', x, 0, z, { noShadow: false })); PP(g, 0.3, 0.2, 0.3, '#e74c3c', 0.85, 0.8, 0.85);
    }, { pick: false });
    F('tvunit', 'Rack da TV', 'decor', 10, 5, 3, 1, [11, 6], g => {
      PP(g, 3, 0.45, 1, '#4b3a2c', 0, 0, 0); PP(g, 1.7, 0.95, 0.1, '#0e0e10', 0.6, 0.7, 0.4);
      this.tvScreen = PP(g, 1.55, 0.8, 0.02, null, 0.67, 0.77, 0.5, { material: new THREE.MeshLambertMaterial({ color: '#1b2a40', emissive: '#1b3a66', emissiveIntensity: 0.25 }) });
    }, { pick: false });
    F('sofa', 'Sofá', 'sofa', 10, 8, 3, 1, [11, 7], g => {
      PP(g, 3, 0.45, 1, '#6b8fb5', 0, 0, 0); PP(g, 3, 0.55, 0.25, '#5c7ea3', 0, 0.45, 0.75); PP(g, 0.25, 0.3, 0.75, '#5c7ea3', 0, 0.45, 0); PP(g, 0.25, 0.3, 0.75, '#5c7ea3', 2.75, 0.45, 0);
      PP(g, 0.8, 0.12, 0.7, '#7aa0c8', 0.35, 0.45, 0.05); PP(g, 0.8, 0.12, 0.7, '#7aa0c8', 1.15, 0.45, 0.05); PP(g, 0.8, 0.12, 0.7, '#7aa0c8', 1.95, 0.45, 0.05);
    }, { seatLocal: [10.7, 8.5, Math.PI, 0.32], seat2: { x: ox + 12.3, z: oz + 8.5, rot: Math.PI, y: 0.32, pose: 'sit' } });
    // itens comprados
    this.ownedGroups.console = (() => { const g = new THREE.Group(); g.position.set(ox + 10, FLOOR_Y + 0.45, oz + 5); S.add(g); PP(g, 0.5, 0.08, 0.38, '#25272b', 0.15, 0, 0.3); PP(g, 0.06, 0.03, 0.03, '#3df06b', 0.25, 0.09, 0.66, { noShadow: true }); PP(g, 0.2, 0.05, 0.1, '#444', 2.2, 0, 0.5); return g; })();
    this.ownedGroups.tapete = (() => { const g = new THREE.Group(); g.position.set(ox + 9, FLOOR_Y, oz + 6); S.add(g); PP(g, 5, 0.02, 2, '#c97b5a', 0, 0, 0, { noShadow: true }); PP(g, 4.6, 0.025, 1.6, '#e0a37f', 0.2, 0, 0.2, { noShadow: true }); return g; })();
    const est = F('estante', 'Estante', 'estante', 16, 5, 1, 3, [15, 6], g => {
      PP(g, 0.45, 1.9, 3, '#8a5a3b', 0.55, 0, 0); const rr = rng(3);
      for (let s = 0; s < 4; s++) for (let i = 0; i < 9; i++) PP(g, 0.3, 0.3 + rr() * 0.15, 0.2, ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'][Math.floor(rr() * 5)], 0.5, 0.1 + s * 0.45, 0.1 + i * 0.3);
    });
    this.ownedGroups.estante = est.group; est.owned = 'estante';
    const pl = F('planta', 'Planta', 'planta', 16, 1, 1, 1, [15, 1], g => {
      PP(g, 0.5, 0.35, 0.5, '#b5651d', 0.25, 0, 0.25); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('#2f9a4a')); m.position.set(0.5, 0.85, 0.5); m.castShadow = true; g.add(m);
      const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat('#3fb35a')); m2.position.set(0.65, 1.2, 0.4); m2.castShadow = true; g.add(m2);
    });
    this.ownedGroups.planta = pl.group; pl.owned = 'planta';
    F('broom', 'Vassoura e balde', 'broom', 16, 9, 1, 1, [15, 9], g => { PP(g, 0.4, 0.35, 0.4, '#e1b12c', 0.3, 0, 0.3); PP(g, 0.06, 1.3, 0.06, '#9b7653', 0.72, 0, 0.35); PP(g, 0.22, 0.12, 0.12, '#c9a24a', 0.64, 0, 0.32); });
    // sujeira
    const rr2 = rng(11);
    for (let i = 0; i < 10; i++) {
      const dm = new THREE.Mesh(new THREE.CircleGeometry(0.28 + rr2() * 0.25, 7), new THREE.MeshBasicMaterial({ color: '#5b4632', transparent: true, opacity: 0.55 }));
      dm.rotation.x = -Math.PI / 2; dm.position.set(ox + 8.5 + rr2() * 7.5, FLOOR_Y + 0.02, oz + 3 + rr2() * 7); S.add(dm); this.dirt.push(dm);
    }
    // janelas decorativas (brilham à noite)
    [[3, 0], [11, 0], [14, 0]].forEach(([c]) => P(S, 1.6, 1.0, 0.06, null, ox + c, 1.1, oz - 0.04, { material: this.winMat, noShadow: true }));
    // objeto 'apartment' para sim
    this.objs.apartment = { id: 'apartment', name: 'Apartamento', kind: 'zone', approach: [ox + 9, oz + 12] };
    this.setOwned({});
  }

  setOwned(owned) {
    for (const k in this.ownedGroups) this.ownedGroups[k].visible = !!owned[k];
    ['estante', 'planta'].forEach(k => { const o = this.objs[k]; if (o) this.nav.block(o.cells[0], o.cells[1], o.cells[2], o.cells[3], owned[k] ? 1 : 0); });
    for (const k of ['estante', 'planta']) this.objs[k].hidden = !owned[k];
  }
  setDirt(clean) {
    const n = Math.round(Math.max(0, (100 - clean) / 100) * this.dirt.length);
    this.dirt.forEach((d, i) => d.visible = i < n);
  }
  setTv(on) { if (this.tvScreen) this.tvScreen.material.emissiveIntensity = on ? 0.9 : 0.2; }

  // ---------- tempo ----------
  setTime(min) {
    const h = (min % 1440) / 60;
    const day = smooth(5.2, 7.4, h) * (1 - smooth(17.6, 19.6, h));
    const dusk = Math.max(smooth(5, 6.5, h) * (1 - smooth(6.5, 8, h)), smooth(16.5, 18.2, h) * (1 - smooth(18.2, 20, h)));
    const night = new THREE.Color('#0d1433'), dayC = new THREE.Color('#a9d8f5'), warm = new THREE.Color('#f2a171');
    const sky = night.clone().lerp(dayC, day).lerp(warm, dusk * 0.55);
    this.scene.background.copy(sky);
    this.sun.intensity = 0.12 + day * 1.05;
    this.sun.color.set('#ffffff').lerp(new THREE.Color('#ffb072'), dusk * 0.7).lerp(new THREE.Color('#7f94ff'), (1 - day) * 0.6);
    this.hemi.intensity = 0.33 + day * 0.5; this.hemi.color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.5);
    const a = Math.max(0, Math.min(1, (h - 6) / 12.5)) * Math.PI;
    this.sunDir = new THREE.Vector3(-Math.cos(a) * 32, Math.sin(a) * 40 + 12, 16);
    const lit = 1 - day;
    this.roomLight.intensity = lit * 1.1; this.roomLight2.intensity = lit * 0.8; this.roomLight3.intensity = lit * 0.7;
    this.winMat.emissiveIntensity = lit * 0.9; this.lampMat.emissiveIntensity = lit * 1.6;
  }

  // ---------- câmera ----------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.aspect = w / h;
  }
  updateCamera(dt, focus) {
    const c = this.cam;
    c.yaw += (c.yawT - c.yaw) * Math.min(1, dt * 7); c.zoom += (c.zoomT - c.zoom) * Math.min(1, dt * 9);
    if (c.follow && focus) { c.target.x += (focus.x - c.target.x) * Math.min(1, dt * 4); c.target.z += (focus.z - c.target.z) * Math.min(1, dt * 4); }
    c.target.x = Math.max(0, Math.min(W, c.target.x)); c.target.z = Math.max(0, Math.min(H, c.target.z));
    const cam = this.camera, z = c.zoom, d = 70, cp = Math.cos(this.pitch);
    cam.left = -z * this.aspect; cam.right = z * this.aspect; cam.top = z; cam.bottom = -z; cam.updateProjectionMatrix();
    cam.position.set(c.target.x + d * cp * Math.sin(c.yaw), d * Math.sin(this.pitch), c.target.z + d * cp * Math.cos(c.yaw));
    cam.lookAt(c.target.x, 0, c.target.z);
    const tx = Math.sin(c.yaw), tz = Math.cos(c.yaw);
    for (const w of this.walls) {
      const f = w.nx * tx + w.nz * tz, tgt = f > 0.25 ? 0.3 : WALL_H;
      w.cur += (tgt - w.cur) * Math.min(1, dt * 8); w.m.scale.y = w.cur;
    }
    this.sun.position.set(c.target.x + this.sunDir.x, this.sunDir.y, c.target.z + this.sunDir.z); this.sun.target.position.set(c.target.x, 0, c.target.z);
    this.sun.target.updateMatrixWorld();
  }
  render() { this.renderer.render(this.scene, this.camera); }

  // converte tela -> {iid, cell}
  pick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const rc = this.rc || (this.rc = new THREE.Raycaster()); rc.setFromCamera(ndc, this.camera);
    const hits = rc.intersectObjects(this.pickables.filter(m => !this.objs[m.userData.iid].hidden && m.visible !== false), false);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3();
    rc.ray.intersectPlane(plane, pt);
    return { iid: hits.length ? hits[0].object.userData.iid : null, cell: pt ? [Math.floor(pt.x), Math.floor(pt.z)] : null };
  }
  pickCharacters(cx, cy, walkers) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const rc = this.rc || (this.rc = new THREE.Raycaster()); rc.setFromCamera(ndc, this.camera);
    let best = null, bd = 1e9;
    for (const [id, w] of Object.entries(walkers)) {
      if (!w.visible) continue;
      const hit = rc.intersectObject(w.c.rig, true);
      if (hit.length && hit[0].distance < bd) { bd = hit[0].distance; best = id; }
    }
    return best;
  }
}
