import * as THREE from 'three';
import { Nav } from './nav.js';
import { mat, makeLabel } from './char.js';

export const W = 76, H = 78;
export const APT = { ox: 13, oz: 17, w: 18, d: 12 };
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
    const S = this.scene, P = this.P.bind(this), r = rng(7), N = this.nav, px = v => v / 9;
    this.landMask = new Uint8Array(W * H); this.roadMask = new Uint8Array(W * H);
    // água e terra (península inspirada no bairro São Francisco, São Luís/MA)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat('#7cc7e8')); water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -0.14, H / 2); water.receiveShadow = true; S.add(water);
    const poly = [[70, 150], [120, 75], [235, 10], [330, 12], [430, 50], [520, 45], [600, 10], [800, 0], [800, 720], [285, 720], [270, 655], [200, 590], [130, 510], [95, 420], [82, 300], [72, 215]].map(([x, y]) => [px(x), px(y)]);
    const mkLand = (scale, color, y) => {
      const sh = new THREE.Shape(), cx = W / 2, cz = H / 2;
      poly.forEach(([x, z], i) => { const X = cx + (x - cx) * scale, Z = cz + (z - cz) * scale; if (i) sh.lineTo(X, Z); else sh.moveTo(X, Z); });
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }), mat(color)); m.rotation.x = Math.PI / 2; m.position.y = y; m.receiveShadow = true; S.add(m);
    };
    mkLand(1.05, '#ead9a4', -0.02); mkLand(1, '#8cc17e', 0);
    const inPoly = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (inPoly(x + 0.5, z + 0.5)) this.landMask[z * W + x] = 1;
    // ruas
    const road = (pts, w, h = 0.075, color = '#4b4f57') => {
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = px(pts[i][0]), z1 = px(pts[i][1]), x2 = px(pts[i + 1][0]), z2 = px(pts[i + 1][1]);
        const L = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1);
        const add = (ww, hh, c) => { const m = new THREE.Mesh(unit, mat(c)); m.scale.set(L + 0.01, hh, ww); m.position.set((x1 + x2) / 2, hh / 2, (z1 + z2) / 2); m.rotation.y = -ang; m.receiveShadow = true; S.add(m); };
        add(w + 1.8, 0.06, '#cfcdc6'); add(w, h, color);
        const steps = Math.ceil(L * 2);
        for (let k = 0; k <= steps; k++) { const t = k / steps, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t; for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (Math.hypot(dx, dz) <= w / 2 + 1.4) { const cx = Math.floor(x + dx), cz = Math.floor(z + dz); if (cx >= 0 && cz >= 0 && cx < W && cz < H) this.roadMask[cz * W + cx] = 1; } }
      }
    };
    road([[240, 0], [290, 150], [312, 260], [312, 420], [300, 720]], 3.2, 0.082, '#3f4c60');
    road([[318, 268], [480, 215], [685, 150], [800, 110]], 3, 0.082, '#3f4c60');
    road([[100, 112], [100, 250], [104, 400], [150, 520], [230, 600], [300, 628], [420, 608], [540, 590], [700, 590]], 2);
    [[[100, 262], [300, 262]], [[100, 128], [280, 128]], [[100, 395], [525, 395]], [[110, 437], [310, 437]], [[115, 485], [760, 485]], [[330, 300], [525, 300]], [[330, 350], [525, 350]],
      [[125, 395], [125, 540]], [[165, 395], [165, 540]], [[200, 395], [200, 540]], [[235, 395], [235, 540]], [[270, 395], [270, 540]], [[370, 300], [370, 540]], [[440, 300], [440, 540]], [[510, 300], [510, 540]], [[580, 350], [580, 540]]]
      .forEach(p => road(p, 1.8));
    // apartamento (casa alugada)
    this.buildApartment();
    for (let z = APT.oz - 1; z <= APT.oz + APT.d + 1; z++) for (let x = APT.ox - 1; x <= APT.ox + APT.w; x++) this.roadMask[z * W + x] = 1; // área reservada
    // locais (posições a partir do mapa)
    this.addBuilding('julia_home', 'Casa da Júlia', { x: 14, z: 5, w: 7, d: 6, h: 3.0, wall: '#f2b5c4', roof: '#a8465e', face: 's', door: 17, icon: '💕', hours: [0, 24] });
    this.addBuilding('lucia_home', 'Casa da Dona Lúcia', { x: 25, z: 9, w: 6, d: 6, h: 2.8, wall: '#c9d6a3', roof: '#6b7f3a', face: 's', door: 27, icon: '🏡', hours: [0, 24] });
    this.addBuilding('office', 'Escritório', { x: 25, z: 36, w: 8, d: 7, h: 7, wall: '#9fb4d9', roof: '#3a4a6a', face: 's', door: 28, icon: '💼', hours: [7, 19] });
    this.addBuilding('fabrica', 'Fábrica de Salgados', { x: 19, z: 49, w: 8, d: 5, h: 3.4, wall: '#e8c07a', roof: '#a4572a', face: 'n', door: 22, icon: '🥟', hours: [7, 17] });
    this.addBuilding('market', 'Mercado', { x: 42, z: 24, w: 10, d: 7, h: 3.4, wall: '#a8d0e6', roof: '#2e6f95', face: 's', door: 46, icon: '🛒', hours: [7, 22] });
    this.addBuilding('gym', 'Academia', { x: 40, z: 39, w: 8, d: 4, h: 3.6, wall: '#c7b8e6', roof: '#5b3f9a', face: 's', door: 43, icon: '🏋️', hours: [6, 23] });
    this.addBuilding('bar', 'Bar do Zé', { x: 56, z: 34, w: 9, d: 4, h: 3.4, wall: '#d9a35f', roof: '#7a3b2e', face: 's', door: 60, icon: '🍺', hours: [11, 24] });
    this.buildPark();
    // bloqueia a água
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (!this.landMask[z * W + x]) N.block(x, z);
    // casas do bairro e árvores
    const free = (x, z, w, d, m) => { for (let i = x - m; i < x + w + m; i++) for (let j = z - m; j < z + d + m; j++) { if (i < 0 || j < 0 || i >= W || j >= H) return false; const k = j * W + i; if (!this.landMask[k] || this.roadMask[k] || N.blocked[k]) return false; } return true; };
    const hc = ['#e9c9a0', '#c9d8e8', '#e8b9b0', '#cfe3bd', '#f0dca0', '#d7c3e6'], rc = ['#a5523a', '#7a4a3a', '#8a6a4a', '#5a6a7a'];
    for (let z = 2; z < H - 5; z++) for (let x = 2; x < W - 6; x++) {
      if (r() > 0.04) continue;
      const w = 4 + Math.floor(r() * 3), d = 4 + Math.floor(r() * 2);
      if (!free(x, z, w, d, 1)) continue;
      const g = new THREE.Group(); S.add(g); const hh = 2 + r() * 1.2;
      P(g, w, hh, d, hc[Math.floor(r() * hc.length)], x, 0, z); P(g, w + 0.4, 0.25, d + 0.4, rc[Math.floor(r() * rc.length)], x - 0.2, hh, z - 0.2);
      for (let k = 0; k < w - 1; k += 2) P(g, 0.8, 0.8, 0.06, null, x + 0.6 + k, 1, z + d, { material: this.winMat, noShadow: true });
      N.block(x, z, w, d);
    }
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (r() < 0.025 && free(x, z, 1, 1, 0)) this.tree(x, z, r);
    // postes junto às portas
    Object.values(this.objs).filter(o => o.kind === 'building').forEach(o => { const lx = o.approach[0] + 2, lz = o.approach[1]; if (N.ok(lx, lz)) this.lamp(lx, lz); });
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
    P(g, 9, 0.05, 8, '#79c26f', 13, 0, 33.5, { noShadow: true });
    P(g, 9, 0.06, 1.1, '#e7dcc0', 13, 0, 36.5, { noShadow: true }); P(g, 1.1, 0.06, 8, '#e7dcc0', 17, 0, 33.5, { noShadow: true });
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.08, 20), mat('#5aa9d6')); pond.position.set(20, 0.05, 38.8); pond.receiveShadow = true; g.add(pond);
    for (let x = 17; x < 24; x++) for (let z = 36; z < 42; z++) if (Math.hypot(x + 0.5 - 20, z + 0.5 - 38.8) < 1.9) this.nav.block(x, z);
    this.register({ id: 'park', name: 'Praça Pôr do Sol', type: 'park', kind: 'zone', approach: [17, 35], icon: '🌳', rect: [13, 34, 21, 40] }, g);
    [[13, 34], [21, 34], [13, 41], [21, 41]].forEach(([x, z]) => this.tree(x, z, rng(x * z)));
    const label = makeLabel('🌳 Praça Pôr do Sol', { size: 30, scale: 0.0105 }); label.position.set(17.5, 3.2, 34); S.add(label);
    [{ id: 'bench1', x: 14, z: 35, name: 'Banco da praça' }, { id: 'bench2', x: 18, z: 40, name: 'Banco da praça' }].forEach(b => {
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
