import * as THREE from 'three';
import { Nav } from './nav.js';
import { mat, makeLabel } from './char.js';
import MAP from './mapdata.js';
import { U, patch, noiseTexture, waterMaterial, grassTexture, pavingTexture, asphaltTexture, glowTexture, coastStrips, geomFrom, merge, gradBox } from './fx.js';
import { Traffic } from './traffic.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.hq = !(window.innerWidth < 760 || /Mobi|Android/i.test(navigator.userAgent));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.hq ? 1.75 : 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1.05;
    noiseTexture();
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
    this.traffic = new Traffic(this.scene, MAP.roads, this.lampMat, this.hq ? 110 : 60);
    this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch); });
    if (this.hq) this.setupPost();
    this.resize();
    this.setTime(7 * 60);
    window.addEventListener('resize', () => this.resize());
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight('#ffffff', '#9aa77a', 0.7); this.scene.add(this.hemi);
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

  setupPost() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.6, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  buildGulls() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.15, -0.15, 0, 0, -0.25, 0, 0, 0.25, 0.9, 0.15, -0.15, 0, 0, -0.25], 3)); g.computeVertexNormals();
    this.gulls = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 14);
    this.gullData = Array.from({ length: 14 }, (_, i) => ({ r: 18 + Math.random() * 40, a: Math.random() * 6.28, w: (0.12 + Math.random() * 0.12) * (i % 2 ? 1 : -1), h: 14 + Math.random() * 10, f: Math.random() * 6 }));
    this.gulls.frustumCulled = false; this.scene.add(this.gulls);
  }
  // animações contínuas (água, nuvens, espuma, trânsito, gaivotas)
  tick(dt, running) {
    U.uTime.value += dt;
    U.uCloudOff.value.x += dt * 0.0011; U.uCloudOff.value.y += dt * 0.0005;
    if (this.foamMat) this.foamMat.opacity = 0.32 + 0.2 * Math.sin(U.uTime.value * 0.9);
    if (this.traffic) this.traffic.update(running ? dt : 0, this.lit || 0);
    if (this.gulls) {
      const m4 = this.m4g || (this.m4g = new THREE.Matrix4()), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const c = this.cam.target, show = (this.day || 0) > 0.4 && this.cam.zoom < 120;
      this.gulls.visible = show;
      if (show) this.gullData.forEach((b, i) => {
        if (running) b.a += b.w * dt;
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(U.uTime.value * 5 + b.f));
        const x = c.x + Math.cos(b.a) * b.r, z = c.z + Math.sin(b.a) * b.r;
        q.setFromEuler(e.set(0, -b.a + (b.w > 0 ? 0 : Math.PI), Math.sin(U.uTime.value + b.f) * 0.2));
        this.gulls.setMatrixAt(i, m4.compose(v.set(x, b.h, z), q, s.set(1.4, flap * 1.4, 1.4)));
      });
      this.gulls.instanceMatrix.needsUpdate = true;
    }
  }
  waterNear(x, z) {
    const g = this.waterCoarse; if (!g) return 0;
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8), R = 9; let n = 0, w = 0;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { if (i * i + j * j > R * R) continue; const X = cx + i, Z = cz + j; n++; if (X < 0 || Z < 0 || X >= g.w || Z >= g.h || g.d[Z * g.w + X]) w++; }
    return Math.min(1, (w / n) * 2.2);
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
    const cw = Math.ceil(W / 8), ch = Math.ceil(H / 8), c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.scale(1 / 8, 1 / 8); g2.fillStyle = '#000';
    for (const p of MAP.land) { g2.beginPath(); for (const r of p) { r.forEach(([x, z], i) => (i ? g2.lineTo(x, z) : g2.moveTo(x, z))); g2.closePath(); } g2.fill('evenodd'); }
    const d2 = g2.getImageData(0, 0, cw, ch).data, wd = new Uint8Array(cw * ch); for (let i = 0; i < wd.length; i++) wd[i] = d2[i * 4 + 3] < 128 ? 1 : 0;
    this.waterCoarse = { w: cw, h: ch, d: wd };
    const data = g.getImageData(0, 0, W, H).data, B = this.nav.blocked;
    for (let i = 0, n = W * H; i < n; i++) B[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  }
  buildGround() {
    const S = this.scene;
    this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 5, H * 5), waterMaterial());
    this.waterMesh.rotation.x = -Math.PI / 2; this.waterMesh.position.set(W / 2, -0.5, H / 2); this.waterMesh.receiveShadow = true; S.add(this.waterMesh);
    const grass = grassTexture(); this.grassTex = grass;
    const lg = new THREE.ExtrudeGeometry(MAP.land.map(p => this.shapeOf(p)), { depth: 0.6, bevelEnabled: false, curveSegments: 1 });
    lg.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: '#b5d49a', map: grass })); land.position.y = -0.6; land.receiveShadow = true; S.add(land);
    const tex = (c) => new THREE.MeshLambertMaterial({ color: c, map: grass });
    this.flat(MAP.parks.map(p => p.p), null, 0.02, { material: tex('#93d47f') });
    this.flat(MAP.veg.map(v => v.p), null, 0.022, { material: tex('#a6cc8c') });
    this.flat(MAP.pitches, null, 0.025, { material: tex('#62bd5f') });
    const { sand, foam } = coastStrips(MAP.land, W, H);
    const sm = new THREE.Mesh(geomFrom(sand), new THREE.MeshLambertMaterial({ color: '#f0dfae', map: grass, side: THREE.DoubleSide })); sm.receiveShadow = true; S.add(sm);
    this.foamMat = new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    S.add(new THREE.Mesh(geomFrom(foam), this.foamMat));
  }
  buildRoads() {
    const L = { side: [], minor: [], main: [], mark: [], zebra: [] };
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
    const nodes = new Map(), key = p => `${Math.round(p[0])}|${Math.round(p[1])}`;
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
      if (r.t !== 'service' && r.t !== 'pedestrian') for (const end of [0, 1]) { const p = end ? r.p[r.p.length - 1] : r.p[0], k = key(p); if (!nodes.has(k)) nodes.set(k, []); nodes.get(k).push({ r, end }); }
    }
    // faixas de pedestre nos cruzamentos
    for (const list of nodes.values()) {
      if (list.length < 3) continue;
      const wmax = Math.max(...list.map(o => o.r.w));
      for (const { r, end } of list) {
        if (r.w < 5) continue;
        const p = end ? r.p[r.p.length - 1] : r.p[0], q = end ? r.p[r.p.length - 2] : r.p[1];
        const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz); if (len < wmax / 2 + 6) continue;
        const tx = dx / len, tz = dz / len, nx = -tz, nz = tx, d0 = wmax / 2 + 1.2, d1 = d0 + 2.6;
        for (let o = -r.w / 2 + 0.55; o <= r.w / 2 - 0.5; o += 1.0) {
          quad(L.zebra, [p[0] + tx * d0 + nx * o, p[1] + tz * d0 + nz * o], [p[0] + tx * d1 + nx * o, p[1] + tz * d1 + nz * o], 0.5, 0.088);
        }
      }
    }
    const pav = pavingTexture(), asp = asphaltTexture();
    const mk = (arr, material) => { if (!arr.length) return; const m = new THREE.Mesh(geomFrom(arr), material); m.receiveShadow = true; this.scene.add(m); };
    mk(L.side, new THREE.MeshLambertMaterial({ color: '#ffffff', map: pav }));
    mk(L.minor, new THREE.MeshLambertMaterial({ color: '#eceef2', map: asp }));
    mk(L.main, new THREE.MeshLambertMaterial({ color: '#c8ccd4', map: asp }));
    mk(L.mark, mat('#f7f4e8')); mk(L.zebra, mat('#f4f2ea'));
  }
  buildStreetLabels() {
    for (const [name, x, z, ang, w] of MAP.labels) {
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 30;
      g.font = `700 ${fs}px "Nunito","Segoe UI",Arial,sans-serif`;
      cv.width = Math.ceil(g.measureText(name).width) + 16; cv.height = fs + 12;
      g.font = `700 ${fs}px "Nunito","Segoe UI",Arial,sans-serif`; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(40,44,52,0.7)'; g.strokeText(name, 8, cv.height / 2 + 1);
      g.fillStyle = '#fffdf6'; g.fillText(name, 8, cv.height / 2 + 1);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const hh = Math.max(2.2, Math.min(4.2, w * 0.62)), ww = hh * cv.width / cv.height;
      const geo = new THREE.PlaneGeometry(ww, hh); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.9 }));
      (this.streetLabelMats || (this.streetLabelMats = [])).push(m.material);
      m.position.set(x, 0.095, z); m.rotation.y = -ang; m.renderOrder = 2; this.scene.add(m);
    }
  }
  buildOsmBuildings() {
    const col = { apartments: '#f0e6d6', commercial: '#d6e2ee', church: '#fbf3df', public: '#e9ddc9', house: '#f6dfc2', school: '#f3d9a6', yes: '#efe2cf' };
    for (const b of MAP.buildings) {
      const hgt = b.l * 3.2, g = new THREE.ExtrudeGeometry(this.shapeOf(b.p), { depth: hgt, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const v = 0.74 + 0.26 * Math.min(1, p.getY(i) / Math.min(hgt, 4)); c.push(v, v, v); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col[b.k] || col.yes, vertexColors: true })); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
  }
  buildHouses() {
    const hs = MAP.houses, n = hs.length, S = this.scene;
    const wall = ['#f6d6a8', '#f4b8a0', '#a8d8c8', '#f7e48c', '#b9d4f0', '#e8c4e8', '#c8e6a0', '#f2a7a7', '#fde2c4', '#9fd3c7', '#ffd28a', '#d4c4f0'];
    const wallC = ['#e3e8ee', '#efe7d9', '#d5e0ea', '#f4ead9', '#e8d9c7', '#dfe9e1'];
    const tiles = ['#c45c33', '#b14f2c', '#d1703f', '#a65a3a', '#c9643c'], muroC = ['#f6f1e7', '#ece6da', '#f3e5cf', '#e4ecee', '#f1e9e0'];
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const box1 = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), boxC = new THREE.BoxGeometry(1, 1, 1);
    const lam = (o = {}) => new THREE.MeshLambertMaterial({ color: '#ffffff', ...o });
    const isTile = (h, i) => !h[7] && i % 3 !== 0;
    const nTile = hs.filter(isTile).length, nMuro = hs.filter(h => !h[7] && h[8] > 1.3).length;
    const nLit = Math.ceil(n * 0.6);
    const I = (geo, m, count) => new THREE.InstancedMesh(geo, m, Math.max(1, count));
    const body = I(gradBox(0.7), lam({ vertexColors: true }), n), roofT = I(pyr, lam(), nTile), roofF = I(gradBox(0.85), lam({ vertexColors: true }), n - nTile);
    const tank = I(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 10).translate(0, 0.47, 0), mat('#2f82d4'), n - nTile);
    const winL = I(boxC, this.winMat, nLit), winD = I(boxC, this.darkGlass = new THREE.MeshLambertMaterial({ color: '#5f7e96' }), n - nLit);
    const frame = I(boxC, mat('#fbfbf7'), n), door = I(box1, mat('#7b5236'), n);
    const muro = I(gradBox(0.8), lam({ vertexColors: true }), nMuro), gate = I(box1, mat('#3f5f55'), nMuro);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let it = 0, ifl = 0, il = 0, id = 0, im = 0;
    hs.forEach((hh, i) => {
      const [cx, cz, w, d, ang, floors, ci, com, setback = 0] = hh;
      const h = floors * 3 + 0.3;
      q.setFromEuler(e.set(0, ang, 0));
      const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang), off = d / 2;
      body.setMatrixAt(i, m4.compose(v.set(cx, 0, cz), q, s.set(w, h, d))); body.setColorAt(i, c.set(com ? wallC[ci % wallC.length] : wall[(ci * 7 + i) % wall.length]));
      if (isTile(hh, i)) { roofT.setMatrixAt(it, m4.compose(v.set(cx, h, cz), q, s.set(w + 0.7, Math.min(2.4, w * 0.3), d + 0.7))); roofT.setColorAt(it++, c.set(tiles[(ci + i) % tiles.length])); }
      else {
        roofF.setMatrixAt(ifl, m4.compose(v.set(cx, h, cz), q, s.set(w + 0.3, 0.35, d + 0.3))); roofF.setColorAt(ifl, c.set(com ? '#b9bfc8' : '#e2dccf'));
        tank.setMatrixAt(ifl, m4.compose(v.set(cx + rx * w * 0.22 - fx * d * 0.2, h + 0.35, cz + rz * w * 0.22 - fz * d * 0.2), q, s.set(1, 1, 1))); ifl++;
      }
      const wy = floors > 1 ? 1.2 : 1.1, wh = floors > 1 ? h - 2.1 : 1.0, wx = cx + fx * off + rx * w * 0.12, wz = cz + fz * off + rz * w * 0.12;
      frame.setMatrixAt(i, m4.compose(v.set(wx + fx * 0.02, wy + wh / 2, wz + fz * 0.02), q, s.set(w * 0.5 + 0.35, wh + 0.35, 0.06)));
      const wm = m4.compose(v.set(wx + fx * 0.05, wy + wh / 2, wz + fz * 0.05), q, s.set(w * 0.5, wh, 0.08));
      if ((i * 7) % 10 < 6 && il < nLit) winL.setMatrixAt(il++, wm); else if (id < n - nLit) winD.setMatrixAt(id++, wm); else winL.setMatrixAt(il++, wm);
      door.setMatrixAt(i, m4.compose(v.set(cx + fx * (off + 0.05) - rx * w * 0.32, 0, cz + fz * (off + 0.05) - rz * w * 0.32), q, s.set(1.0, 2.1, 0.1)));
      if (!com && setback > 1.3) {
        const mo = off + setback - 0.3;
        muro.setMatrixAt(im, m4.compose(v.set(cx + fx * mo, 0, cz + fz * mo), q, s.set(w + 1, 1.25, 0.2))); muro.setColorAt(im, (i % 3 === 0) ? c.set(muroC[(i + ci) % muroC.length]) : c.set(wall[(ci * 7 + i) % wall.length]).offsetHSL(0, 0.06, -0.04));
        gate.setMatrixAt(im++, m4.compose(v.set(cx + fx * (mo + 0.05) - rx * w * 0.32, 0, cz + fz * (mo + 0.05) - rz * w * 0.32), q, s.set(1.5, 1.2, 0.24)));
      }
    });
    winL.count = il; winD.count = id; muro.count = im; gate.count = im;
    for (const x of [body, roofT, roofF, tank, winL, winD, frame, door, muro, gate]) {
      x.castShadow = [body, roofT, roofF, tank, muro].includes(x); x.receiveShadow = true;
      if (x.instanceColor) x.instanceColor.needsUpdate = true; x.instanceMatrix.needsUpdate = true; S.add(x);
    }
  }
  buildTrees() {
    const ts = MAP.trees, n = ts.length, S = this.scene, B = this.nav;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0), mat('#8a5a36'), n);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    const crown2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    const greens = [['#4caf50', '#5cbf5a', '#3fa34d', '#6cc35e'], ['#2f8f44', '#3a9a4c', '#2f7d3c'], ['#3f7a4c', '#4a875a', '#386d45']];
    ts.forEach(([x, z, k, kind], i) => {
      const th = kind === 2 ? 1.0 * k : 1.9 * k;
      trunk.setMatrixAt(i, m4.compose(v.set(x, 0, z), q.identity(), s.set(k, th, k)));
      q.setFromEuler(e.set(0, i * 1.7, 0));
      crown.setMatrixAt(i, m4.compose(v.set(x, th + 0.9 * k, z), q, kind === 2 ? s.set(1.6 * k, 0.9 * k, 1.6 * k) : s.set(1.3 * k, 1.2 * k, 1.3 * k)));
      const g = greens[kind][i % greens[kind].length]; crown.setColorAt(i, c.set(g));
      crown2.setMatrixAt(i, m4.compose(v.set(x + 0.35 * k, th + 1.75 * k, z - 0.25 * k), q, s.set(0.75 * k, 0.7 * k, 0.75 * k)));
      crown2.setColorAt(i, c.set(g).offsetHSL(0.02, 0.05, 0.08));
    });
    // coqueiros na beira-mar (Av. Ferreira Gullar)
    const palms = [];
    for (const r of MAP.roads) {
      if (!/Ferreira Gullar/i.test(r.n)) continue;
      let carry = 6;
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.1) continue;
        const nx = -dz / len, nz = dx / len, o = r.w / 2 + r.sw + 1.2;
        for (let t = carry; t < len; t += 15) {
          for (const sd of [1, -1]) {
            const px = a[0] + dx * t / len + nx * o * sd, pz = a[1] + dz * t / len + nz * o * sd;
            if (B.ok(Math.floor(px), Math.floor(pz)) && Math.abs(px - (APT.ox + 9)) + Math.abs(pz - (APT.oz + 6)) > 25) { palms.push([px, pz]); B.block(Math.floor(px), Math.floor(pz)); }
          }
          carry = t + 15 - len;
        }
      }
    }
    if (palms.length) {
      const pt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.22, 1, 7).translate(0, 0.5, 0), mat('#a07a52'), palms.length);
      const leaves = [];
      for (let k = 0; k < 9; k++) {
        const lm = new THREE.Matrix4().makeRotationY((k / 9) * Math.PI * 2).multiply(new THREE.Matrix4().makeRotationX(0.55 + (k % 3) * 0.12)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.35));
        leaves.push({ geo: new THREE.BoxGeometry(0.55, 0.05, 2.8), m: lm, color: k % 2 ? '#3f9b45' : '#55b04f' });
      }
      leaves.push({ geo: new THREE.IcosahedronGeometry(0.35, 0), m: new THREE.Matrix4().makeTranslation(0, -0.25, 0), color: '#7a5a2a' });
      const pc = new THREE.InstancedMesh(merge(leaves), new THREE.MeshLambertMaterial({ vertexColors: true }), palms.length);
      palms.forEach(([x, z], i) => {
        const hgt = 6 + ((i * 37) % 10) / 3, tilt = (((i * 13) % 7) - 3) * 0.03;
        q.setFromEuler(e.set(tilt, 0, -tilt * 0.7)); pt.setMatrixAt(i, m4.compose(v.set(x, 0, z), q, s.set(1, hgt, 1)));
        const top = new THREE.Vector3(0, hgt, 0).applyQuaternion(q);
        q.setFromEuler(e.set(tilt, i * 2.3, -tilt * 0.7)); pc.setMatrixAt(i, m4.compose(v.set(x + top.x, top.y, z + top.z), q, s.set(1, 1, 1)));
      });
      for (const x of [pt, pc]) { x.castShadow = true; x.receiveShadow = true; S.add(x); }
    }
    // arbustos e flores nas praças
    const bushes = [];
    const inPoly = (poly, x, z) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
    const r0 = rng(21);
    for (const p of MAP.parks) {
      const ring = p.p[0]; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      const want = Math.min(400, ((x1 - x0) * (z1 - z0)) / 70);
      for (let k = 0; k < want * 3 && bushes.length < 3000; k++) {
        const x = x0 + r0() * (x1 - x0), z = z0 + r0() * (z1 - z0);
        if (inPoly(ring, x, z) && B.ok(Math.floor(x), Math.floor(z))) bushes.push([x, z, 0.5 + r0() * 0.6, r0()]);
      }
    }
    if (bushes.length) {
      const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), bushes.length);
      const flowers = ['#f28bb4', '#f6d55c', '#ffffff', '#ef6f6f', '#c39bf0', '#ffa94d'];
      bushes.forEach(([x, z, k, t], i) => {
        bm.setMatrixAt(i, m4.compose(v.set(x, 0.25 * k, z), q.identity(), s.set(k * 1.1, k * 0.75, k * 1.1)));
        bm.setColorAt(i, c.set(t < 0.38 ? flowers[i % flowers.length] : ['#4cae4f', '#5fbf55', '#3e9e4a'][i % 3]));
      });
      bm.castShadow = true; bm.receiveShadow = true; bm.instanceColor.needsUpdate = true; S.add(bm);
    }
    for (const x of [trunk, crown, crown2]) { x.castShadow = true; x.receiveShadow = true; x.instanceMatrix.needsUpdate = true; S.add(x); }
    crown.instanceColor.needsUpdate = true; crown2.instanceColor.needsUpdate = true;
    // postes com luminária + poça de luz à noite
    const ls = MAP.lamps;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6).translate(0, 2.3, 0), mat('#4a5059'), ls.length);
    const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.42, 0.28, 8), mat('#3a3f47'), ls.length);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), this.lampMat, ls.length);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffcf8a' });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), this.poolMat, ls.length);
    ls.forEach(([x, z], i) => { pole.setMatrixAt(i, m4.makeTranslation(x, 0, z)); head.setMatrixAt(i, m4.makeTranslation(x, 4.72, z)); bulb.setMatrixAt(i, m4.makeTranslation(x, 4.52, z)); pool.setMatrixAt(i, m4.makeTranslation(x, 0.1, z)); });
    pole.castShadow = true; head.castShadow = true; pool.renderOrder = 3; S.add(pole, head, bulb, pool);
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
    const night = new THREE.Color('#1c2a5e'), dayC = new THREE.Color('#bfe7ff'), warm = new THREE.Color('#ffb48a');
    const sky = night.clone().lerp(dayC, day).lerp(warm, dusk * 0.55);
    this.scene.background.copy(sky);
    this.sun.intensity = 0.26 + day * 1.17; this.day = day;
    this.sun.color.set('#fff3dc').lerp(new THREE.Color('#ffa868'), dusk * 0.75).lerp(new THREE.Color('#8fa2ff'), (1 - day) * 0.65);
    this.hemi.intensity = 0.55 + day * 0.42; this.hemi.color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.45); this.hemi.groundColor.set('#a3ae7c').lerp(new THREE.Color('#334066'), 1 - day);
    const a = Math.max(0, Math.min(1, (h - 6) / 12.5)) * Math.PI;
    this.sunDir = new THREE.Vector3(-Math.cos(a) * 32, Math.sin(a) * 40 + 12, 16);
    const lit = 1 - day;
    this.roomLight.intensity = lit * 1.1; this.roomLight2.intensity = lit * 0.8; this.roomLight3.intensity = lit * 0.7;
    this.winMat.emissiveIntensity = lit * 1.15; this.lampMat.emissiveIntensity = 0.2 + lit * 2.2; this.lit = lit;
    if (this.poolMat) this.poolMat.opacity = lit * 0.6;
    if (this.streetLabelMats) for (const m of this.streetLabelMats) m.color.setScalar(1 - lit * 0.6);
    U.uCloudAmt.value = 0.2 * day;
    U.uDay.value = day;
    if (this.bloom) { this.bloom.strength = 0.1 + lit * 0.75; this.bloom.threshold = 0.86 - lit * 0.2; }
    this.renderer.toneMappingExposure = 1.05 + lit * 0.15;
  }

  // ---------- câmera ----------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.aspect = w / h;
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
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
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }

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
