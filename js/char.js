import * as THREE from 'three';
import { patch } from './fx.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
export function mat(c, extra) {
  const k = c + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, patch(new THREE.MeshLambertMaterial({ color: c, ...extra })));
  return matCache.get(k);
}

export function makeChar(o) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const part = (w, h, d, c, x, y, z, parent = rig) => {
    const m = new THREE.Mesh(boxGeo, mat(c));
    m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const mkLimb = (x, y, w, h, c, hand) => {
    const l = new THREE.Group(); l.position.set(x, y, 0); rig.add(l);
    part(w, h, w, c, 0, -h / 2, 0, l);
    if (hand) part(w, 0.1, w, hand, 0, -h + 0.03, 0, l);
    return l;
  };
  const legL = mkLimb(-0.1, 0.5, 0.17, 0.5, o.pants), legR = mkLimb(0.1, 0.5, 0.17, 0.5, o.pants);
  part(0.44, 0.5, 0.26, o.shirt, 0, 0.75, 0);
  const armL = mkLimb(-0.28, 1.0, 0.12, 0.45, o.shirt, o.skin), armR = mkLimb(0.28, 1.0, 0.12, 0.45, o.shirt, o.skin);
  const head = new THREE.Group(); head.position.y = 1.15; rig.add(head);
  part(0.32, 0.32, 0.32, o.skin, 0, 0, 0, head);
  part(0.34, 0.12, 0.34, o.hair, 0, 0.19, 0, head);
  part(0.34, 0.22, 0.1, o.hair, 0, 0.04, -0.14, head);
  if (o.long) { part(0.34, 0.3, 0.1, o.hair, 0, -0.08, -0.15, head); part(0.05, 0.3, 0.12, o.hair, -0.17, -0.06, -0.08, head); part(0.05, 0.3, 0.12, o.hair, 0.17, -0.06, -0.08, head); }
  part(0.05, 0.05, 0.02, '#1b1b1b', -0.08, 0.02, 0.165, head);
  part(0.05, 0.05, 0.02, '#1b1b1b', 0.08, 0.02, 0.165, head);
  const shirtMeshes = [];
  rig.traverse(m => { if (m.isMesh && m.material.color.getStyle && m.material === mat(o.shirt)) shirtMeshes.push(m); });
  const bubble = makeBubble(); bubble.position.y = 1.95; g.add(bubble);
  return { group: g, rig, legL, legR, armL, armR, head, bubble, shirtMeshes };
}

export function setShirt(c, color) { c.shirtMeshes.forEach(m => { m.material = mat(color); }); }

export function applyPose(c, pose, t) {
  const { rig, legL, legR, armL, armR } = c;
  rig.rotation.set(0, 0, 0); rig.position.set(0, 0, 0);
  legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0); armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
  const s = Math.sin(t * 9) * 0.7;
  switch (pose) {
    case 'walk': legL.rotation.x = s; legR.rotation.x = -s; armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8; rig.position.y = Math.abs(Math.sin(t * 9)) * 0.04; break;
    case 'run': { const r = Math.sin(t * 14) * 1.0; legL.rotation.x = r; legR.rotation.x = -r; armL.rotation.x = -r; armR.rotation.x = r; rig.position.y = Math.abs(Math.sin(t * 14)) * 0.08; break; }
    case 'sit': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.23; armL.rotation.x = armR.rotation.x = -0.5; break;
    case 'tv': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.23; armL.rotation.x = armR.rotation.x = -0.3; break;
    case 'work': legL.rotation.x = legR.rotation.x = -1.5; rig.position.y = -0.23; armL.rotation.x = -1.2 + Math.sin(t * 8) * 0.12; armR.rotation.x = -1.2 + Math.cos(t * 7) * 0.12; break;
    case 'sleep': rig.rotation.x = -Math.PI / 2; rig.position.y = 0.16; break;
    case 'phone': armR.rotation.x = -2.3; armR.rotation.z = -0.2; break;
    case 'exercise': { const e = Math.sin(t * 6); armL.rotation.x = armR.rotation.x = -Math.PI * 0.6 + e * 1.0; rig.position.y = Math.abs(e) * 0.12; legL.rotation.x = legR.rotation.x = e * 0.3; break; }
    case 'shower': armL.rotation.x = armR.rotation.x = -2.7; rig.position.y = 0; break;
    case 'eat': armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.7; break;
    case 'talk': armL.rotation.x = -0.6 + Math.sin(t * 4) * 0.5; armR.rotation.x = -0.6 + Math.cos(t * 3.4) * 0.5; break;
    case 'clean': armL.rotation.x = armR.rotation.x = -0.9 + Math.sin(t * 7) * 0.5; rig.rotation.x = 0.15; break;
    default: armL.rotation.z = 0.05; armR.rotation.z = -0.05; rig.position.y = Math.sin(t * 2) * 0.008;
  }
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
    g.position.set(this.x, this.seatY !== null ? this.seatY : this.world.groundY(this.x, this.z), this.z);
    g.rotation.y = this.rot; g.visible = this.visible;
  }
  render(t, speedMul = 1) {
    this.sync();
    const pose = this.moving ? (this.pose === 'run' ? 'run' : 'walk') : this.pose;
    applyPose(this.c, pose, t);
  }
}
