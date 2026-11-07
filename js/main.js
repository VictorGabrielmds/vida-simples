import * as THREE from 'three';
import { World } from './world.js';
import { Sim } from './sim.js';
import { UI } from './ui.js';

const canvas = document.getElementById('c');
const world = new World(canvas);
const sim = new Sim(world);
const ui = new UI(sim);
window.game = { world, sim, ui, THREE };

// ---------- tela inicial ----------
const intro = document.getElementById('intro');
const hasSave = Sim.hasSave();
if (hasSave) document.getElementById('btnContinue').classList.remove('hidden');
let started = false;
function start(cont) {
  if (cont && sim.load()) ui.toast('Jogo carregado 💾'); else { Sim.clearSave(); if (sim.s.day || sim.s.min !== 7 * 60) sim.newGame(); }
  sim.paused = false; ui.refreshSpeed();
  intro.classList.add('hidden'); started = true;
  world.cam.target.set(sim.player.x, 0, sim.player.z); world.cam.yaw = world.cam.yawT = Math.PI / 4;
  if (!cont) setTimeout(() => ui.help(), 400);
}
document.getElementById('btnNew').addEventListener('click', () => start(false));
document.getElementById('btnContinue').addEventListener('click', () => start(true));
sim.newGame(false); // estado inicial para o fundo da tela inicial (não apaga o save)
sim.paused = true;

// ---------- entrada ----------
let drag = null, down = null;
const keys = new Set();
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  down = { x: e.clientX, y: e.clientY, moved: false, button: e.button, tx: world.cam.target.x, tz: world.cam.target.z };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!started) return;
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved) {
      const c = world.cam, k = (c.zoom * 2) / canvas.clientHeight, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      // direção "direita" e "para frente" no plano
      const rx = cy, rz = -sy, fx = -sy, fz = -cy;
      const sdx = -dx * k, sdy = dy * k / Math.sin(world.pitch);
      c.target.x = down.tx + rx * sdx + fx * -sdy * -1; c.target.z = down.tz + rz * sdx + fz * -sdy * -1;
      c.follow = false; ui.tooltip(null);
    }
    return;
  }
  hover(e);
});
canvas.addEventListener('pointerup', e => {
  if (!started || !down) return;
  const d = down; down = null;
  if (d.moved) return;
  click(e);
});
function npcAt(e) {
  const map = {}; for (const id in sim.npcs) map[id] = sim.npcs[id].walker;
  return world.pickCharacters(e.clientX, e.clientY, map);
}
function hover(e) {
  const nid = npcAt(e);
  if (nid) { const n = sim.npcs[nid]; ui.tooltip(`${n.def.emoji} ${n.def.name} — ${sim.npcEmotion(n).label}`, e.clientX, e.clientY); canvas.style.cursor = 'pointer'; return; }
  const p = world.pick(e.clientX, e.clientY);
  if (p.iid) { const o = world.objs[p.iid]; ui.tooltip(o.name, e.clientX, e.clientY); canvas.style.cursor = 'pointer'; }
  else { ui.tooltip(null); canvas.style.cursor = 'default'; }
}
function click(e) {
  ui.hideMenu();
  const nid = npcAt(e);
  if (nid) { ui.openFor({ kind: 'npc', id: nid }, e.clientX, e.clientY); return; }
  const p = world.pick(e.clientX, e.clientY);
  if (p.iid && world.objs[p.iid].type !== 'decor') { ui.openFor({ kind: 'obj', obj: world.objs[p.iid] }, e.clientX, e.clientY); return; }
  if (p.cell) { sim.clickWalk(p.cell[0], p.cell[1]); }
}
canvas.addEventListener('wheel', e => { e.preventDefault(); const c = world.cam; c.zoomT = Math.max(5, Math.min(26, c.zoomT * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
window.addEventListener('keydown', e => {
  if (!started || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (k === 'q') world.cam.yawT += Math.PI / 2;
  else if (k === 'e') world.cam.yawT -= Math.PI / 2;
  else if (k === ' ') { e.preventDefault(); ui.setSpeed(0); }
  else if (k === '1') ui.setSpeed(1); else if (k === '2') ui.setSpeed(3); else if (k === '3') ui.setSpeed(8); else if (k === '4') ui.setSpeed(20);
  else if (k === 'c') world.cam.follow = true;
  else if (k === 'escape') ui.hideMenu();
  else if (k === 'p') ui.openPhone(window.innerWidth - 300, 60);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('beforeunload', () => { if (started) sim.save(); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu') && !e.target.closest('.chip.btn') && e.target.id !== 'c') ui.hideMenu(); });

// ---------- loop ----------
let last = performance.now(), uiAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (started) {
    const c = world.cam, sp = c.zoom * 1.2 * dt;
    let mx = 0, mz = 0;
    if (keys.has('w') || keys.has('arrowup')) mz -= 1; if (keys.has('s') || keys.has('arrowdown')) mz += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (mx || mz) { const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw); c.target.x += (mx * cy + mz * sy) * sp; c.target.z += (-mx * sy + mz * cy) * sp; c.follow = false; }
    sim.advance(dt);
  } else { sim.timeSec += dt; sim.render(dt); world.cam.yawT += dt * 0.08; world.cam.yaw = world.cam.yawT; }
  const f = sim.player.visible ? sim.player : sim.player;
  world.updateCamera(dt, started ? (sim.player.visible ? { x: sim.player.x, z: sim.player.z } : { x: world.objs[sim.insideId].center[0], z: world.objs[sim.insideId].center[2] }) : { x: 22, z: 23 });
  world.render();
  uiAcc += dt; if (uiAcc > 0.2) { uiAcc = 0; if (started) ui.update(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
