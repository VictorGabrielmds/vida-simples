// Som ambiente sintetizado (sem arquivos): mar, vento, trânsito, pássaros, grilos e cliques da interface
const KEY = 'vida-simples-som';

export class Ambience {
  constructor() {
    let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* ok */ }
    this.on = saved !== '0'; this.ctx = null; this.state = { day: 1, water: 0, near: 1 };
  }
  ensure() {
    if (!this.on) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); this.build(); } catch (e) { this.ctx = null; }
  }
  noise(seconds, brown) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w; }
    return b;
  }
  loop(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; }
  lfo(freq, depth, target, type = 'sine') { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = depth; o.connect(g).connect(target); o.start(); return o; }
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    this.master.gain.setTargetAtTime(0.55, c.currentTime, 0.8);
    const brown = this.noise(4, true), white = this.noise(3, false);
    const chain = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } return n; };
    const filt = (type, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // mar: ruído marrom com "ondas" lentas
    const swell = c.createGain(); swell.gain.value = 0.55; this.lfo(0.085, 0.45, swell.gain);
    this.gWaves = c.createGain(); this.gWaves.gain.value = 0;
    chain(this.loop(brown), filt('lowpass', 620), swell, this.gWaves, this.master);
    const hiss = c.createGain(); hiss.gain.value = 0.25; this.lfo(0.085, 0.22, hiss.gain);
    chain(this.loop(white), filt('highpass', 2500), filt('lowpass', 6000), hiss, this.gWaves);
    // trânsito distante
    this.gTraffic = c.createGain(); this.gTraffic.gain.value = 0;
    chain(this.loop(brown), filt('lowpass', 200), this.gTraffic, this.master);
    // vento
    const gust = c.createGain(); gust.gain.value = 0.5; this.lfo(0.05, 0.4, gust.gain);
    this.gWind = c.createGain(); this.gWind.gain.value = 0;
    chain(this.loop(white), filt('bandpass', 520, 0.5), gust, this.gWind, this.master);
    // grilos (noite)
    this.gCrickets = c.createGain(); this.gCrickets.gain.value = 0; this.gCrickets.connect(this.master);
    for (const [f, rate, burst] of [[4400, 27, 0.33], [4950, 31, 0.27]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const am = c.createGain(); am.gain.value = 0.5; this.lfo(rate, 0.5, am.gain, 'square');
      const bu = c.createGain(); bu.gain.value = 0.5; this.lfo(burst, 0.5, bu.gain, 'square');
      chain(o, am, bu, this.gCrickets); o.start();
    }
    // pássaros (dia): cantos curtos aleatórios
    this.birdTimer = setInterval(() => this.maybeBird(), 650);
  }
  maybeBird() {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const { day, near } = this.state;
    if (Math.random() > day * near * 0.33) return;
    const c = this.ctx, t0 = c.currentTime + Math.random() * 0.2, base = 2300 + Math.random() * 2200, notes = 2 + Math.floor(Math.random() * 4);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.master); }
    for (let k = 0; k < notes; k++) {
      const o = c.createOscillator(), g = c.createGain(), t = t0 + k * (0.09 + Math.random() * 0.06), d = 0.06 + Math.random() * 0.05;
      o.type = 'sine'; o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t); o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.4), t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(pan || this.master); o.start(t); o.stop(t + d + 0.02);
    }
  }
  // day: 0..1, water: 0..1 (proximidade da água), near: 0..1 (1 = câmera perto do chão)
  update(day, water, near) {
    this.state = { day, water, near };
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 1.2;
    this.gWaves.gain.setTargetAtTime((0.08 + water * 0.55) * (0.4 + 0.6 * near), t, k);
    this.gTraffic.gain.setTargetAtTime((0.05 + day * 0.12) * (0.5 + 0.5 * near), t, k);
    this.gWind.gain.setTargetAtTime(0.03 + (1 - near) * 0.05, t, k);
    this.gCrickets.gain.setTargetAtTime(Math.max(0, 1 - day * 1.6) * 0.03 * near, t, k);
  }
  blip(f0 = 560, f1 = 840, dur = 0.07, vol = 0.05, type = 'sine') {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.08);
  }
  click() { this.blip(620, 900, 0.05, 0.04); }
  good() { this.blip(660, 990, 0.09, 0.045); setTimeout(() => this.blip(880, 1320, 0.1, 0.04), 90); }
  warn() { this.blip(420, 300, 0.12, 0.04, 'triangle'); }
  toggle() {
    this.on = !this.on; try { localStorage.setItem(KEY, this.on ? '1' : '0'); } catch (e) { /* ok */ }
    if (this.on) { this.ensure(); if (this.master) this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4); }
    else if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    return this.on;
  }
}
