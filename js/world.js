import * as THREE from 'three';
import { Nav } from './nav.js';
import { mat, makeLabel } from './char.js';
import MAP from './mapdata.js';

export const W = MAP.W, H = MAP.H;
export const APT = { ox: MAP.home.ox, oz: MAP.home.oz, w: 18, d: 12 };
export const SPOTS = MAP.spots;
export const ATTRIBUTION = MAP.attribution;
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
    this.objs = {}; this.pickables = []; this.walls = []; this.dirt = []; this.ownedGroups = {}; this.labels = [];
    this.cam = { target: new THREE.Vector3(APT.ox + 9, 0, APT.oz + 6), yaw: Math.PI / 4, yawT: Math.PI / 4, zoom: 14, zoomT: 14, follow: true };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
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
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 1400; this.shadowSize = 30;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
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

  // ---------- construção da cidade (mapa real, 1 unidade = 1 metro) ----------
  build() {
    this.rasterNav();
    this.buildGround();
    this.buildRoads();
    this.buildStreetLabels();
    this.buildOsmBuildings();
    this.buildHouses();
    this.buildTrees();
    this.buildApartment();
    for (const [id, p] of Object.entries(MAP.places)) this.addBuilding(id, p);
    this.buildPark();
    const ap = this.objs.apartment.approach;
    this.prunedCells = this.nav.pruneUnreachable(ap[0], ap[1]);
  }
  shapeOf(rings) {
    const sh = new THREE.Shape(rings[0].map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of rings.slice(1)) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    return sh;
  }
  flat(polys, color, y, opt = {}) {
    if (!polys.length) return null;
    const g = new THREE.ShapeGeometry(polys.map(p => this.shapeOf(p)), 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, opt.material || mat(color)); m.position.y = y; m.receiveShadow = true; this.scene.add(m); return m;
  }
  rasterNav() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const path = rings => { g.beginPath(); for (const r of rings) { r.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); } };
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    for (const p of MAP.land) { path(p); g.fill('evenodd'); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of MAP.roads) { g.lineWidth = r.w + 2 * r.sw; g.beginPath(); r.p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke(); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000';
    for (const b of MAP.buildings) { path(b.p); g.fill('evenodd'); }
    for (const [cx, cz, w, d, ang] of MAP.houses) { g.save(); g.translate(cx, cz); g.rotate(-ang); g.fillRect(-w / 2, -d / 2, w, d); g.restore(); }
    for (const p of Object.values(MAP.places)) g.fillRect(p.x, p.z, p.w, p.d);
    for (const [x, z] of MAP.trees) g.fillRect(Math.floor(x), Math.floor(z), 1, 1);
    for (const [x, z] of MAP.lamps) g.fillRect(Math.floor(x), Math.floor(z), 1, 1);
    const data = g.getImageData(0, 0, W, H).data, B = this.nav.blocked;
    for (let i = 0, n = W * H; i < n; i++) B[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  }
  buildGround() {
    const S = this.scene;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 5, H * 5), mat('#6fbfe3'));
    water.rotation.x = -Math.PI / 2; water.position.set(W / 2, -0.5, H / 2); water.receiveShadow = true; S.add(water);
    const lg = new THREE.ExtrudeGeometry(MAP.land.map(p => this.shapeOf(p)), { depth: 0.6, bevelEnabled: false, curveSegments: 1 });
    lg.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(lg, mat('#a7c58f')); land.position.y = -0.6; land.receiveShadow = true; S.add(land);
    this.flat(MAP.parks.map(p => p.p), '#7cc46f', 0.02);
    this.flat(MAP.veg.map(v => v.p), '#9fbf86', 0.022);
    this.flat(MAP.pitches, '#4fa65a', 0.025);
  }
  buildRoads() {
    const L = { side: [], minor: [], main: [], mark: [] };
    const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
    const quad = (arr, a, b, w, y) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, nx = (-dz / len) * w / 2, nz = (dx / len) * w / 2;
      arr.push(a[0] + nx, y, a[1] + nz, b[0] + nx, y, b[1] + nz, b[0] - nx, y, b[1] - nz, a[0] + nx, y, a[1] + nz, b[0] - nx, y, b[1] - nz, a[0] - nx, y, a[1] - nz);
    };
    const disc = (arr, c, r, y, seg = 10) => {
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        arr.push(c[0], y, c[1], c[0] + Math.cos(a1) * r, y, c[1] + Math.sin(a1) * r, c[0] + Math.cos(a0) * r, y, c[1] + Math.sin(a0) * r);
      }
    };
    const ribbon = (arr, pts, w, y) => { for (let i = 0; i < pts.length - 1; i++) quad(arr, pts[i], pts[i + 1], w, y); for (const p of pts) disc(arr, p, w / 2, y); };
    for (const r of MAP.roads) {
      const main = MAIN.has(r.t);
      if (r.sw > 0 || r.b) ribbon(L.side, r.p, r.w + 2 * Math.max(r.sw, r.b ? 1.2 : 0), 0.05);
      ribbon(main ? L.main : L.minor, r.p, r.w, main ? 0.08 : 0.07);
      if (main && r.w >= 6) {   // faixas tracejadas
        let carry = 0;
        for (let i = 0; i < r.p.length - 1; i++) {
          const a = r.p[i], b = r.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
          for (let s = carry; s < len; s += 9) { const e = Math.min(len, s + 3); quad(L.mark, [a[0] + dx * s / len, a[1] + dz * s / len], [a[0] + dx * e / len, a[1] + dz * e / len], 0.18, 0.087); carry = s + 9 - len; }
        }
      }
    }
    const mk = (arr, color) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry(), pos = new Float32Array(arr), nor = new Float32Array(arr.length);
      for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(g, mat(color)); m.receiveShadow = true; this.scene.add(m);
    };
    mk(L.side, '#d4d1c8'); mk(L.minor, '#5a5e65'); mk(L.main, '#484d57'); mk(L.mark, '#f1f1ea');
  }
  buildStreetLabels() {
    for (const [name, x, z, ang, w] of MAP.labels) {
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 30;
      g.font = `600 ${fs}px "Segoe UI",Arial,sans-serif`;
      cv.width = Math.ceil(g.measureText(name).width) + 16; cv.height = fs + 12;
      g.font = `600 ${fs}px "Segoe UI",Arial,sans-serif`; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(30,32,38,0.85)'; g.strokeText(name, 8, cv.height / 2 + 1);
      g.fillStyle = '#f4f4ef'; g.fillText(name, 8, cv.height / 2 + 1);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const hh = Math.max(2.2, Math.min(4.2, w * 0.62)), ww = hh * cv.width / cv.height;
      const geo = new THREE.PlaneGeometry(ww, hh); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      m.position.set(x, 0.095, z); m.rotation.y = -ang; m.renderOrder = 2; this.scene.add(m);
    }
  }
  buildOsmBuildings() {
    const col = { apartments: '#ddd6c9', commercial: '#c8d3df', church: '#f1e8d2', public: '#d9cfc0', house: '#efdcc0' };
    for (const b of MAP.buildings) {
      const g = new THREE.ExtrudeGeometry(this.shapeOf(b.p), { depth: b.l * 3.2, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat(col[b.k] || '#e6d6be')); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
  }
  buildHouses() {
    const hs = MAP.houses, n = hs.length, S = this.scene;
    const wall = ['#efe3cf', '#e6d2b5', '#f2c9a6', '#d9e4ec', '#e9d8f0', '#f4e7a8', '#cfe3c6', '#f0d0d0'], wallC = ['#d6dbe2', '#e8e2d6', '#c9d3dc', '#f0e6d8', '#e2d3c3'];
    const tiles = ['#b5562f', '#a64b2a', '#c26a3d', '#9a5a3a'];
    const box1 = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const white = () => new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const nTile = hs.filter((h, i) => !h[7] && i % 3 !== 0).length;
    const body = new THREE.InstancedMesh(box1, white(), n), roofT = new THREE.InstancedMesh(pyr, white(), nTile), roofF = new THREE.InstancedMesh(box1, white(), n - nTile);
    const win = new THREE.InstancedMesh(box1, this.winMat, n), door = new THREE.InstancedMesh(box1, mat('#5b3e2c'), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let it = 0, ifl = 0;
    hs.forEach(([cx, cz, w, d, ang, floors, ci, com], i) => {
      const h = floors * 3 + 0.3;
      q.setFromEuler(e.set(0, ang, 0));
      body.setMatrixAt(i, m4.compose(v.set(cx, 0, cz), q, s.set(w, h, d))); body.setColorAt(i, c.set(com ? wallC[ci % wallC.length] : wall[ci]));
      if (!com && i % 3 !== 0) { roofT.setMatrixAt(it, m4.compose(v.set(cx, h, cz), q, s.set(w + 0.6, Math.min(2.2, w * 0.28), d + 0.6))); roofT.setColorAt(it++, c.set(tiles[ci % 4])); }
      else { roofF.setMatrixAt(ifl, m4.compose(v.set(cx, h, cz), q, s.set(w + 0.3, 0.3, d + 0.3))); roofF.setColorAt(ifl++, c.set(com ? '#9aa1aa' : '#c9c2b6')); }
      const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang), off = d / 2 + 0.04;
      win.setMatrixAt(i, m4.compose(v.set(cx + fx * off + rx * w * 0.12, floors > 1 ? 1.2 : 1.1, cz + fz * off + rz * w * 0.12), q, s.set(w * 0.5, floors > 1 ? h - 2 : 1.0, 0.08)));
      door.setMatrixAt(i, m4.compose(v.set(cx + fx * off - rx * w * 0.32, 0, cz + fz * off - rz * w * 0.32), q, s.set(1.0, 2.1, 0.1)));
    });
    for (const im of [body, roofT, roofF, win, door]) { im.castShadow = im !== win && im !== door; im.receiveShadow = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.instanceMatrix.needsUpdate = true; S.add(im); }
  }
  buildTrees() {
    const ts = MAP.trees, n = ts.length, S = this.scene;
    const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1, 5).translate(0, 0.5, 0), crownG = new THREE.IcosahedronGeometry(1, 0);
    const trunk = new THREE.InstancedMesh(trunkG, mat('#7a5230'), n), crown = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    const greens = [['#3f9a4b', '#4aa85a', '#2f8a46'], ['#2f7d3c', '#3a8a44', '#2b6e36'], ['#3c6e48', '#477a50', '#355f40']];
    ts.forEach(([x, z, k, kind], i) => {
      const th = kind === 2 ? 1.0 * k : 1.9 * k;
      trunk.setMatrixAt(i, m4.compose(v.set(x, 0, z), q.identity(), s.set(k, th, k)));
      q.setFromEuler(e.set(0, i * 1.7, 0));
      crown.setMatrixAt(i, m4.compose(v.set(x, th + 0.9 * k, z), q, kind === 2 ? s.set(1.6 * k, 0.9 * k, 1.6 * k) : s.set(1.3 * k, 1.25 * k, 1.3 * k)));
      crown.setColorAt(i, c.set(greens[kind][i % 3]));
    });
    for (const im of [trunk, crown]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; S.add(im); }
    crown.instanceColor.needsUpdate = true;
    const ls = MAP.lamps, pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 4.6, 0.14).translate(0, 2.3, 0), mat('#40444c'), ls.length);
    const bulb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.22, 0.45), this.lampMat, ls.length);
    ls.forEach(([x, z], i) => { pole.setMatrixAt(i, m4.makeTranslation(x, 0, z)); bulb.setMatrixAt(i, m4.makeTranslation(x, 4.65, z)); });
    pole.castShadow = true; S.add(pole, bulb);
  }
  addBuilding(id, o) {
    const g = new THREE.Group(); this.scene.add(g); const P = this.P.bind(this);
    P(g, o.w, o.h, o.d, o.wall, o.x, 0, o.z);
    P(g, o.w + 0.6, 0.3, o.d + 0.6, o.roof, o.x - 0.3, o.h, o.z - 0.3);
    const f = o.face, cx = o.x + o.w / 2, cz = o.z + o.d / 2;
    const fn = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f], along = fn[0] ? [0, 1] : [1, 0];
    const half = fn[0] ? o.w / 2 : o.d / 2, span = fn[0] ? o.d : o.w;
    const fx = cx + fn[0] * half, fz = cz + fn[1] * half;
    const dw = fn[0] ? 0.15 : 1.6, dd = fn[0] ? 1.6 : 0.15;
    P(g, dw, 2.2, dd, '#3a2a20', fx - dw / 2 + fn[0] * 0.05, 0, fz - dd / 2 + fn[1] * 0.05);
    P(g, fn[0] ? 1.2 : 3, 0.18, fn[0] ? 3 : 1.2, o.roof, fx - (fn[0] ? 0.6 : 1.5) + fn[0] * 0.6, 2.4, fz - (fn[0] ? 1.5 : 0.6) + fn[1] * 0.6);
    const floors = Math.max(1, Math.floor(o.h / 3.2));
    for (let fl = 0; fl < floors; fl++) for (let k = -span / 2 + 1.5; k < span / 2 - 1; k += 3) {
      if (fl === 0 && Math.abs(k) < 2.2) continue;
      const wx = fx + along[0] * k, wz = fz + along[1] * k;
      P(g, fn[0] ? 0.08 : 1.6, 1.2, fn[0] ? 1.6 : 0.08, null, wx - (fn[0] ? 0.04 : 0.8) + fn[0] * 0.04, 1.0 + fl * 3.2, wz - (fn[0] ? 0.8 : 0.04) + fn[1] * 0.04, { material: this.winMat, noShadow: true });
    }
    let ap = [Math.floor(fx + fn[0] * 1.2), Math.floor(fz + fn[1] * 1.2)];
    if (!this.nav.ok(ap[0], ap[1])) ap = this.nav.nearestFree(ap[0], ap[1]) || ap;
    const lbl = makeLabel(`${o.icon} ${o.name}`, { size: 30, scale: 0.02 }); lbl.position.set(cx, o.h + 2.5, cz); this.scene.add(lbl); this.labels.push(lbl);
    this.register({ id, name: o.name, type: id, kind: 'building', approach: ap, hours: o.hours, icon: o.icon, center: [cx, o.h, cz] }, g);
  }
  buildPark() {
    const S = this.scene, P = this.P.bind(this), poly = MAP.park.p[0];
    const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const hit = this.flat([MAP.park.p], null, 0.03, { material: new THREE.MeshLambertMaterial({ color: '#86cc78' }) });
    const [x0, z0, x1, z1] = MAP.spots.park, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ap = this.nav.nearestFree(Math.floor(cx), Math.floor(cz)) || [Math.floor(cx), Math.floor(cz)];
    this.register({ id: 'park', name: MAP.park.name, type: 'park', kind: 'zone', approach: ap, icon: '🌳', rect: MAP.spots.park }, hit);
    const label = makeLabel('🌳 ' + MAP.park.name, { size: 30, scale: 0.02 }); label.position.set(cx, 4, cz); S.add(label); this.labels.push(label);
    // bancos em pontos livres dentro da praça
    const spots = [];
    for (let z = z0; z <= z1 && spots.length < 2; z += 1) for (let x = x0; x <= x1 && spots.length < 2; x += 1) {
      if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 12)) continue;
      if ([0, 1].every(dx => this.nav.ok(x + dx, z) && inside(x + dx + 0.5, z + 0.5)) && this.nav.ok(x, z + 1) && inside(x + 0.5, z + 1.5) && Math.hypot(x - cx, z - cz) < 30) spots.push([x, z]);
    }
    spots.forEach(([bx, bz], i) => {
      const bg = new THREE.Group(); S.add(bg);
      P(bg, 2, 0.1, 0.6, '#9a6b3f', bx, 0.45, bz + 0.25); P(bg, 2, 0.5, 0.1, '#9a6b3f', bx, 0.6, bz + 0.2); P(bg, 0.1, 0.45, 0.5, '#444', bx + 0.1, 0, bz + 0.3); P(bg, 0.1, 0.45, 0.5, '#444', bx + 1.8, 0, bz + 0.3);
      this.nav.block(bx, bz, 2, 1);
      this.register({ id: 'bench' + (i + 1), name: 'Banco da praça', type: 'bench', kind: 'furn', approach: [bx, bz + 1], seat: { x: bx + 0.6, z: bz + 0.55, rot: 0, y: 0.3, pose: 'sit' }, seat2: { x: bx + 1.4, z: bz + 0.55, rot: 0, y: 0.3 } }, bg);
    });
  }
  toggleMap() {
    const c = this.cam;
    if (!this.mapMode) {
      this.mapMode = true; this.saved = { zoom: c.zoomT, yaw: c.yawT };
      c.zoomT = Math.max(W / this.aspect, H) * 0.51; c.follow = false; c.target.set(W / 2, 0, H / 2);
      c.yawT = Math.round(c.yawT / (2 * Math.PI)) * 2 * Math.PI; this.pitchT = 1.535; // vista de cima, norte para cima
    } else {
      this.mapMode = false; c.zoomT = this.saved.zoom; c.yawT = this.saved.yaw; c.follow = true; this.pitchT = 0.74;
    }
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
    this.pitch += ((this.pitchT || 0.74) - this.pitch) * Math.min(1, dt * 6);
    if (c.follow && focus) { c.target.x += (focus.x - c.target.x) * Math.min(1, dt * 4); c.target.z += (focus.z - c.target.z) * Math.min(1, dt * 4); }
    c.target.x = Math.max(0, Math.min(W, c.target.x)); c.target.z = Math.max(0, Math.min(H, c.target.z));
    const cam = this.camera, z = c.zoom, d = 2500, cp = Math.cos(this.pitch);
    cam.left = -z * this.aspect; cam.right = z * this.aspect; cam.top = z; cam.bottom = -z; cam.updateProjectionMatrix();
    cam.position.set(c.target.x + d * cp * Math.sin(c.yaw), d * Math.sin(this.pitch), c.target.z + d * cp * Math.cos(c.yaw));
    cam.lookAt(c.target.x, 0, c.target.z);
    const tx = Math.sin(c.yaw), tz = Math.cos(c.yaw);
    for (const w of this.walls) {
      const f = w.nx * tx + w.nz * tz, tgt = f > 0.25 ? 0.3 : WALL_H;
      w.cur += (tgt - w.cur) * Math.min(1, dt * 8); w.m.scale.y = w.cur;
    }
    const ss = Math.round(Math.min(320, Math.max(28, z * Math.max(1, this.aspect) * 1.15)) / 4) * 4;
    if (ss !== this.shadowSize) { this.shadowSize = ss; const sc = this.sun.shadow.camera; sc.left = -ss; sc.right = ss; sc.top = ss; sc.bottom = -ss; sc.updateProjectionMatrix(); }
    const k = Math.max(1, Math.min(40, z / 16)); for (const l of this.labels) { l.userData.bs = l.userData.bs || l.scale.clone(); l.scale.set(l.userData.bs.x * k, l.userData.bs.y * k, 1); }
    const sd = this.sunDir.clone().normalize().multiplyScalar(600);
    this.sun.position.set(c.target.x + sd.x, sd.y, c.target.z + sd.z); this.sun.target.position.set(c.target.x, 0, c.target.z);
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
