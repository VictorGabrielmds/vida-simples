import * as THREE from 'three';
import { patch, toon, merge, blobTexture, shadowMaterial } from './fx.js';

const matCache = new Map();
export function mat(c, extra) {
  const k = c + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, toon({ color: c, ...extra }));
  return matCache.get(k);
}

// geometrias compartilhadas por todos os personagens (estilo "chibi" arredondado)
const G = {};
function geos() {
  if (G.head) return G;
  const M = (x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));
  G.head = new THREE.SphereGeometry(0.27, 18, 14);
  G.hairTop = new THREE.SphereGeometry(0.288, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
  G.hairBack = new THREE.SphereGeometry(0.288, 14, 8, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.25, Math.PI * 0.45).rotateY(Math.PI);
  G.tuft = new THREE.SphereGeometry(0.12, 10, 6);
  G.long = new THREE.CapsuleGeometry(0.2, 0.24, 4, 12);
  G.lock = new THREE.CapsuleGeometry(0.075, 0.24, 4, 8);
  G.torso = new THREE.CapsuleGeometry(0.2, 0.2, 5, 14);
  G.hips = new THREE.CylinderGeometry(0.19, 0.175, 0.14, 14);
  G.leg = new THREE.CapsuleGeometry(0.085, 0.2, 4, 10);
  G.shoe = new THREE.SphereGeometry(0.1, 12, 8);
  G.sleeve = new THREE.CapsuleGeometry(0.068, 0.18, 4, 10);
  G.hand = new THREE.SphereGeometry(0.075, 10, 8);
  const eye = new THREE.SphereGeometry(0.042, 12, 10), shine = new THREE.SphereGeometry(0.014, 6, 5);
  G.eyes = merge([
    { geo: eye, m: M(-0.095, 0, 0, 0.85, 1.2, 0.5), color: '#2b2b3a' }, { geo: eye, m: M(0.095, 0, 0, 0.85, 1.2, 0.5), color: '#2b2b3a' },
    { geo: shine, m: M(-0.083, 0.02, 0.02), color: '#ffffff' }, { geo: shine, m: M(0.107, 0.02, 0.02), color: '#ffffff' },
  ]);
  const cheek = new THREE.SphereGeometry(0.05, 10, 8);
  G.face = merge([
    { geo: cheek, m: M(-0.155, -0.065, 0.205, 1, 0.6, 0.35), color: '#ff9fb2' }, { geo: cheek, m: M(0.155, -0.065, 0.205, 1, 0.6, 0.35), color: '#ff9fb2' },
    { geo: new THREE.TorusGeometry(0.045, 0.013, 6, 14, Math.PI), m: M(0, -0.075, 0.252, 1, 0.8, 1, Math.PI), color: '#8a3b45' },
  ]);
  G.blob = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  G.faceMat = toon({ vertexColors: true });
  G.shoeMat = mat('#3b3f52');
  G.blobMat = shadowMaterial(blobTexture(), 0.34);
  return G;
}

export function makeChar(o) {
  const g0 = geos();
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const shirtMat = toon({ color: o.shirt });
  const add = (geo, material, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; };
  // pernas (pivô no quadril)
  const leg = x => { const l = new THREE.Group(); l.position.set(x, 0.45, 0); rig.add(l); add(g0.leg, mat(o.pants), l, 0, -0.19, 0); add(g0.shoe, g0.shoeMat, l, 0, -0.4, 0.035, 1, 0.55, 1.4); return l; };
  const legL = leg(-0.095), legR = leg(0.095);
  add(g0.hips, mat(o.pants), rig, 0, 0.5, 0, 1, 1, 0.85);
  add(g0.torso, shirtMat, rig, 0, 0.72, 0, 1, 1, 0.82);
  // braços (pivô no ombro)
  const arm = (x, side) => { const a = new THREE.Group(); a.position.set(x, 0.93, 0); rig.add(a); add(g0.sleeve, shirtMat, a, side * 0.01, -0.13, 0); add(g0.hand, mat(o.skin), a, side * 0.015, -0.31, 0); return a; };
  const armL = arm(-0.255, -1), armR = arm(0.255, 1);
  // cabeça
  const head = new THREE.Group(); head.position.y = 1.2; rig.add(head);
  add(g0.head, mat(o.skin), head);
  const hm = mat(o.hair);
  add(g0.hairTop, hm, head, 0, 0.035, -0.02);
  add(g0.hairBack, hm, head, 0, 0.02, -0.01);
  if (o.long) {
    add(g0.long, hm, head, 0, -0.14, -0.15, 1.18, 1, 0.55);
    add(g0.lock, hm, head, -0.235, -0.12, 0.02, 1, 1, 0.8); add(g0.lock, hm, head, 0.235, -0.12, 0.02, 1, 1, 0.8);
  }
  else add(g0.tuft, hm, head, 0.04, 0.235, 0.11, 1.5, 0.55, 0.9);
  const eyes = add(g0.eyes, g0.faceMat, head, 0, 0.025, 0.235);
  add(g0.face, g0.faceMat, head);
  // sombrinha no chão
  const blob = add(g0.blob, g0.blobMat, g, 0, 0.03, 0, 0.95, 1, 0.95); blob.renderOrder = 1;
  const bubble = makeBubble(); bubble.position.y = 1.95; g.add(bubble);
  return { group: g, rig, legL, legR, armL, armR, head, eyes, blob, bubble, shirtMat, blinkOff: Math.random() * 4 };
}

export function setShirt(c, color) { c.shirtMat.color.set(color); }

export function applyPose(c, pose, t) {
  const { rig, legL, legR, armL, armR, head } = c;
  rig.rotation.set(0, 0, 0); rig.position.set(0, 0, 0); head.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0); armL.rotation.set(0, 0, 0.08); armR.rotation.set(0, 0, -0.08);
  const s = Math.sin(t * 9) * 0.7;
  let closed = ((t + c.blinkOff) % 3.7) < 0.13;
  switch (pose) {
    case 'walk': legL.rotation.x = s; legR.rotation.x = -s; armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8; rig.position.y = Math.abs(Math.sin(t * 9)) * 0.045; head.rotation.z = Math.sin(t * 4.5) * 0.04; break;
    case 'run': { const r = Math.sin(t * 14) * 1.0; legL.rotation.x = r; legR.rotation.x = -r; armL.rotation.x = -r; armR.rotation.x = r; rig.position.y = Math.abs(Math.sin(t * 14)) * 0.09; break; }
    case 'sit': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.2; armL.rotation.x = armR.rotation.x = -0.5; break;
    case 'tv': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.2; armL.rotation.x = armR.rotation.x = -0.3; head.rotation.z = Math.sin(t * 0.7) * 0.05; break;
    case 'work': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.2; armL.rotation.x = -1.2 + Math.sin(t * 8) * 0.12; armR.rotation.x = -1.2 + Math.cos(t * 7) * 0.12; head.rotation.x = 0.12; break;
    case 'sleep': rig.rotation.x = -Math.PI / 2; rig.position.y = 0.16; closed = true; break;
    case 'phone': armR.rotation.x = -2.3; armR.rotation.z = -0.2; head.rotation.z = 0.12; break;
    case 'exercise': { const e = Math.sin(t * 6); armL.rotation.x = armR.rotation.x = -Math.PI * 0.6 + e * 1.0; rig.position.y = Math.abs(e) * 0.12; legL.rotation.x = legR.rotation.x = e * 0.3; break; }
    case 'shower': armL.rotation.x = armR.rotation.x = -2.7; closed = true; break;
    case 'eat': armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.7; break;
    case 'talk': armL.rotation.x = -0.6 + Math.sin(t * 4) * 0.5; armR.rotation.x = -0.6 + Math.cos(t * 3.4) * 0.5; head.rotation.z = Math.sin(t * 3) * 0.08; break;
    case 'clean': armL.rotation.x = armR.rotation.x = -0.9 + Math.sin(t * 7) * 0.5; rig.rotation.x = 0.15; break;
    default: rig.position.y = Math.sin(t * 2) * 0.008; head.rotation.z = Math.sin(t * 0.9 + c.blinkOff) * 0.035;
  }
  c.eyes.scale.y = closed ? 0.12 : 1;
}

// ---------- balões de emoji e rótulos ----------
const texCache = {};
export function emojiTexture(e) {
  if (texCache[e]) return texCache[e];
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.arc(48, 46, 40, 0, 7); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3; x.stroke();
  x.font = '50px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(e, 48, 52);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[e] = t);
}
export function makeBubble() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🙂'), depthTest: false, transparent: true }));
  s.scale.set(0.62, 0.62, 1); s.renderOrder = 20;
  s.setEmoji = e => { if (s.userData.e !== e) { s.userData.e = e; s.material.map = emojiTexture(e); s.material.needsUpdate = true; } };
  return s;
}
export function makeLabel(text, { bg = 'rgba(20,24,40,0.8)', fg = '#fff', size = 34, scale = 0.012 } = {}) {
  const cv = document.createElement('canvas'), x = cv.getContext('2d');
  x.font = `bold ${size}px "Segoe UI",Arial,sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + 36, h = size + 22;
  cv.width = w; cv.height = h;
  x.font = `bold ${size}px "Segoe UI",Arial,sans-serif`;
  x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, w, h, 16); x.fill();
  x.fillStyle = fg; x.textBaseline = 'middle'; x.fillText(text, 18, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w * scale, h * scale, 1); s.renderOrder = 15;
  return s;
}

// ---------- Walker: entidade que anda pela grade ----------
export class Walker {
  constructor(world, charOpts, x, z) {
    this.world = world; this.c = makeChar(charOpts);
    this.x = x; this.z = z; this.y = 0; this.rot = 0; this.path = []; this.moving = false;
    this.speed = 75; this.pose = 'idle'; this.visible = true; this.seatY = null; this.seated = false;
    world.scene.add(this.c.group); this.sync();
  }
  get cx() { return Math.floor(this.x); }
  get cz() { return Math.floor(this.z); }
  setPos(x, z) { this.x = x; this.z = z; this.path = []; this.moving = false; this.sync(); }
  goTo(cx, cz) {
    const p = this.world.nav.find(this.cx, this.cz, cx, cz);
    if (!p) { this.path = []; return false; }
    this.path = p; this.moving = p.length > 0; return true;
  }
  stop() { this.path = []; this.moving = false; }
  remaining() { let d = 0, px = this.x, pz = this.z; for (const [x, z] of this.path) { d += Math.hypot(x - px, z - pz); px = x; pz = z; } return d; }
  face(tx, tz) { this.rot = Math.atan2(tx - this.x, tz - this.z); }
  update(dtMin) {
    if (this.seated) { this.moving = false; return; }
    let d = this.speed * dtMin;
    this.moving = this.path.length > 0;
    while (d > 0 && this.path.length) {
      const [px, pz] = this.path[0], dx = px - this.x, dz = pz - this.z, dist = Math.hypot(dx, dz);
      if (dist <= d) { this.x = px; this.z = pz; this.path.shift(); d -= dist; }
      else {
        this.x += (dx / dist) * d; this.z += (dz / dist) * d; d = 0;
        const target = Math.atan2(dx, dz); let diff = target - this.rot;
        while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        this.rot += diff * Math.min(1, dtMin * 3 + 0.3);
      }
    }
    if (!this.path.length) this.moving = false;
  }
  sync() {
    const g = this.c.group;
    const gy = this.world.groundY(this.x, this.z), y = this.seatY !== null ? this.seatY : gy;
    g.position.set(this.x, y, this.z);
    g.rotation.y = this.rot; g.visible = this.visible;
    this.c.blob.position.y = gy - y + 0.03; this.c.blob.visible = this.pose !== 'sleep';
  }
  render(t, speedMul = 1) {
    this.sync();
    const pose = this.moving ? (this.pose === 'run' ? 'run' : 'walk') : this.pose;
    applyPose(this.c, pose, t);
  }
}
