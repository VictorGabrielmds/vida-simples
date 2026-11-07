import { NEEDS, ITEMS, ITEM_QTY, FURNITURE, MONTHS, WEEKDAYS, WANTS, NPC_DEFS, MIN_PER_SEC, emotionOf, moodOf, fmt, clamp, rnd, pick, hhmm } from './data.js';
import { Walker, setShirt, makeBubble } from './char.js';
import { APT } from './world.js';

const SAVE_KEY = 'vida-simples-save-v1';
const EDGE_L = [0, 19], EDGE_R = [63, 19];
const WANDER = { park: [49, 29, 61, 40], street: [2, 18, 60, 21], lucia: [14, 18, 25, 21], rafa: [2, 24, 60, 27] };
const RENT = 1300;

export function newState() {
  return {
    day: 0, min: 7 * 60, money: 2800, health: 100,
    needs: { fome: 62, sede: 68, energia: 88, banheiro: 72, higiene: 80, ambiente: 85, social: 55, diversao: 55, romance: 72, calma: 72 },
    moodlets: [], inv: { mantimentos: 3, lanche: 1, agua: 2, refri: 0, chocolate: 0, kit: 4, limpeza: 2, flores: 0, marmita: 0 },
    owned: {}, skills: { culinaria: 5, forma: 10, carreira: 10 },
    job: { employed: true, wage: 160, level: 1, perfRecent: 0.6, pending: 0, workedToday: false, absences: 0, warnings: 0, lastRaise: -30, workMin: 0, perfAcc: 0 },
    bills: { rentDue: false, rentLate: 0, rentAmt: RENT, utilDue: false, utilLate: 0, utilAmt: 240 },
    wants: [], wantsDone: 0, deliveries: [], flags: { broke: false, annivDone: false, lowRelDays: 0, lastEvent: -999, jobHuntDays: 0 },
    log: [], npcs: {}, over: null,
  };
}

export class Sim {
  constructor(world) {
    this.world = world; this.ui = null; this.speed = 1; this.paused = false; this.modalOpen = 0; this.autonomy = false; this.autoAccel = true;
    this.acc = 0; this.timeSec = 0; this.tasks = []; this.cur = null; this.lastLoggedHour = -1; this.inFF = false;
    this.s = newState(); this.moodVal = 65; this.moodletSum = 0; this.insideId = null;
    const [sx, sz] = [APT.ox + 12.5, APT.oz + 9.5];
    this.player = new Walker(world, { skin: '#e0ac82', shirt: '#3d7dd8', pants: '#2c3550', hair: '#2a1a10' }, sx, sz);
    this.shirtColor = '#3d7dd8';
    this.present = {}; // placeId -> Set
    this.insideBubble = makeBubble(); this.insideBubble.visible = false; this.insideBubble.scale.set(0.9, 0.9, 1); world.scene.add(this.insideBubble);
    this.npcs = {};
    for (const id in NPC_DEFS) this.makeNpc(id);
    this.syncWorld();
  }

  // ====================== utilidades ======================
  get abs() { return this.s.day * 1440 + this.s.min; }
  get hour() { return this.s.min / 60; }
  get date() { return (this.s.day % 30) + 1; }
  get weekday() { return this.s.day % 7; }
  get isWorkday() { return this.weekday < 5; }
  get monthName() { return MONTHS[Math.floor(this.s.day / 30) % 12]; }
  get power() { return this.s.bills.utilLate < 10; }
  get mood() { return this.moodVal; }
  get emotion() { return emotionOf(this.s.needs, this.moodVal, { debt: this.s.bills.rentLate > 3 || this.s.bills.utilLate > 5 || this.s.money < 0 }); }
  isOpen(hours) { return !hours || (this.hour >= hours[0] && this.hour < hours[1]); }
  pres(id) { return this.present[id] || (this.present[id] = new Set()); }
  log(msg, cls = '') { this.s.log.unshift({ t: `${WEEKDAYS[this.weekday].slice(0, 3)} ${hhmm(this.s.min)}`, msg, cls }); if (this.s.log.length > 80) this.s.log.pop(); this.ui && this.ui.logChanged(); }
  toast(msg, cls = '') { this.log(msg, cls); this.ui && this.ui.toast(msg, cls); }
  addMoodlet(id, label, val, hours) {
    const m = this.s.moodlets.find(x => x.id === id), until = this.abs + hours * 60;
    if (m) { m.until = until; m.val = val; m.label = label; } else this.s.moodlets.push({ id, label, val, until });
  }
  need(k, d) { const n = this.s.needs; n[k] = clamp(n[k] + d); }
  spend(c) { this.s.money -= c; }
  syncWorld() { this.world.setOwned(this.s.owned); this.world.setDirt(this.s.needs.ambiente); this.world.setTime(this.s.min); }

  // ====================== NPCs ======================
  makeNpc(id) {
    const d = NPC_DEFS[id];
    const w = new Walker(this.world, { skin: d.skin, shirt: d.shirt, pants: d.pants, hair: d.hair, long: d.long }, 0, 0);
    w.visible = false; w.speed = 1.2 + Math.random() * 0.3;
    const n = { id, def: d, walker: w, rel: d.rel, mod: 0, needs: { fome: 70, energia: 80, social: 60, diversao: 60, calma: 65 }, loc: 'away', dest: null, busy: false, visit: null, mood: d.mood0, emoteUntil: 0, barDay: false };
    this.npcs[id] = n; return n;
  }
  npcGoal(n) {
    const h = this.hour, wd = this.weekday, id = n.id, wk = wd < 5;
    if (n.visit && this.abs < n.visit.until) return n.visit.loc;
    if (id === 'julia') {
      if (h < 7.5 || h >= 23) return 'julia_home';
      if (wk) return h < 8.4 ? 'julia_home' : h < 17.6 ? 'away' : 'julia_home';
      if (wd === 5 && h >= 11 && h < 12.5) return 'market';
      if (wd === 5 && h >= 15 && h < 17.5) return 'park';
      return 'julia_home';
    }
    if (id === 'marcos') {
      if (wk && h >= 8.7 && h < 18.2) return 'office';
      if (wk && h >= 19 && h < 21.5 && n.barDay) return 'bar';
      if (!wk && h >= 15 && h < 17 && this.s.day % 3 === 0) return 'park';
      return 'away';
    }
    if (id === 'lucia') return ((h >= 8 && h < 12.5) || (h >= 15 && h < 19.5)) ? 'street' : 'lucia_home';
    if (id === 'antonio') return ((h >= 7 && h < 9.5) || (h >= 16 && h < 18.5)) ? 'park' : 'away';
    if (id === 'camila') return (h >= 6 && h < 8) ? 'park' : (h >= 18 && h < 20) ? 'street' : 'away';
    if (id === 'rafa') return (h >= 12 && h < 22) ? 'street' : 'away';
    return 'away';
  }
  wanderCell(n) {
    const r = n.id === 'lucia' ? WANDER.lucia : n.id === 'rafa' ? WANDER.rafa : n.dest === 'park' || n.loc === 'park' ? WANDER.park : WANDER.street;
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rnd(r[0], r[2])), z = Math.floor(rnd(r[1], r[3]));
      if (this.world.nav.ok(x, z)) return [x, z];
    }
    return [r[0], r[1]];
  }
  npcTarget(n, loc) {
    const o = this.world.objs;
    if (loc === 'away') return n.id === 'julia' || n.id === 'marcos' || n.id === 'rafa' ? EDGE_R : EDGE_L;
    if (loc === 'apartment') { const c = pick([[9, 4], [12, 3], [8, 9], [14, 9], [15, 7], [10, 4], [12, 9]]); return [APT.ox + c[0], APT.oz + c[1]]; }
    if (loc === 'park') return this.wanderCell({ id: n.id, dest: 'park', loc: 'park' });
    if (loc === 'street') return this.wanderCell({ id: n.id, dest: 'street', loc: 'street' });
    return o[loc].approach;
  }
  startTravel(n, goal) {
    const w = n.walker;
    if (!w.visible) {
      let spawn;
      if (n.loc === 'away') spawn = this.npcTarget(n, 'away');
      else if (this.world.objs[n.loc] && this.world.objs[n.loc].approach) spawn = this.world.objs[n.loc].approach;
      else spawn = this.npcTarget(n, 'away');
      if (n.loc !== 'away') this.pres(n.loc).delete(n.id);
      w.setPos(spawn[0] + 0.5, spawn[1] + 0.5); w.visible = true;
    }
    n.dest = goal; n.loc = 'travel';
    const t = this.npcTarget(n, goal);
    if (!w.goTo(t[0], t[1])) { w.setPos(t[0] + 0.5, t[1] + 0.5); }
  }
  npcArrive(n) {
    const w = n.walker, loc = n.dest; n.loc = loc; n.dest = null;
    if (loc === 'apartment' || loc === 'park' || loc === 'street') {
      if (loc === 'apartment' && n.id === 'julia') this.toastIfNear('Júlia chegou ao seu apartamento 💕');
      return;
    }
    w.visible = false; w.stop();
    if (loc !== 'away') this.pres(loc).add(n.id);
  }
  toastIfNear(msg) { this.toast(msg, 'good'); }
  npcMinute(n) {
    const w = n.walker, h = this.hour;
    // necessidades simples
    const nd = n.needs, home = ['julia_home', 'lucia_home', 'away'].includes(n.loc);
    const sleepy = h >= 23 || h < 7;
    nd.energia = clamp(nd.energia + (sleepy && home ? 0.2 : -0.05));
    nd.fome = clamp(nd.fome - 0.08 + ((h > 7 && h < 8) || (h > 12 && h < 13) || (h > 19 && h < 20.2) ? 0.35 : 0));
    nd.social = clamp(nd.social - 0.035 + (['bar', 'park', 'street', 'apartment'].includes(n.loc) ? 0.04 : 0));
    nd.diversao = clamp(nd.diversao - 0.05 + (['bar', 'park', 'apartment'].includes(n.loc) ? 0.09 : 0));
    nd.calma = clamp(nd.calma + (n.loc === 'office' || (n.loc === 'away' && this.isWorkday) ? -0.03 : n.loc === 'park' ? 0.06 : 0.03) + (nd.calma > 75 ? -0.02 : 0));
    n.mod *= 0.9985;
    n.mood = clamp(moodOf(nd, 0) + n.mod + (n.rel - 50) * 0.05);
    if (n.busy) return;
    const goal = this.npcGoal(n);
    if (n.dest ? n.dest !== goal : n.loc !== goal) {
      if (n.id === 'julia' && this.s.flags.broke && goal === 'apartment') { /* nada */ }
      this.startTravel(n, goal); return;
    }
    if (!n.dest && w.visible && !w.moving && ['park', 'street'].includes(n.loc) && Math.random() < 0.12) { const c = this.wanderCell(n); w.goTo(c[0], c[1]); }
    if (!n.dest && n.loc === 'apartment' && w.visible && !w.moving && Math.random() < 0.08) { const c = this.npcTarget(n, 'apartment'); w.goTo(c[0], c[1]); }
  }
  locLabel(n) {
    const m = { julia_home: 'Em casa', lucia_home: 'Em casa', away: this.isWorkday && this.hour > 8 && this.hour < 18 ? 'Trabalhando' : 'Fora', office: 'No escritório', bar: 'No bar', park: 'No parque', street: 'Na rua', apartment: 'No seu apê', market: 'No mercado', travel: 'A caminho' };
    return m[n.loc] || '';
  }
  npcEmotion(n) { return emotionOf(n.needs, n.mood); }

  // ====================== ações ======================
  mk(id, label, icon, mins, o = {}) { return { id, label, icon, mins, fx: {}, ...o }; }
  canDo(a) {
    const s = this.s;
    if (a.cost && s.money < a.cost) return `Faltam ${fmt(a.cost - s.money)}`;
    if (a.consume) for (const k in a.consume) if ((s.inv[k] || 0) < a.consume[k]) return `Sem ${ITEMS[k] ? ITEMS[k].label.toLowerCase() : k}`;
    if (a.req) { const r = a.req(); if (r) return r; }
    return null;
  }
  juliaHere(where) { const j = this.npcs.julia; if (this.s.flags.broke) return false; return where === 'apartment' ? (j.loc === 'apartment' && j.walker.visible) : where === 'park' ? (j.loc === 'park' && j.walker.visible) : this.pres(where).has('julia'); }
  actionsFor(target) {
    const s = this.s, A = [], mk = this.mk.bind(this);
    if (target.kind === 'npc') return this.socialActions(target.id);
    const o = target.obj, power = () => (this.power ? null : 'Sem energia elétrica (conta de luz atrasada)');
    const open = (h, name) => () => (this.isOpen(h) ? null : `${name} fechado agora`);
    const seat = true;
    switch (o.type) {
      case 'bed':
        A.push(mk('sleep', 'Dormir', '😴', 720, { rate: { energia: 0.21, calma: 0.04 }, pose: 'sleep', useSeat: seat, sleep: true, trig: 'sleep', req: () => (s.needs.energia > 88 ? 'Sem sono agora' : null), until: () => s.needs.energia >= 100 || (this.isWorkday && s.job.employed && this.s.min >= 7 * 60 + 20 && this.s.min < 9 * 60 && this.sleptMin > 60), onFinish: () => { if (s.needs.energia < 75) { this.addMoodlet('tired', 'Acordou cansado', -8, 5); } else { this.addMoodlet('rested', 'Noite bem dormida', 9, 6); } } }));
        A.push(mk('nap', 'Tirar um cochilo', '💤', 60, { fx: { energia: 14, calma: 3 }, pose: 'sleep', useSeat: seat, sleep: true }));
        break;
      case 'wardrobe': A.push(mk('dress', 'Trocar de roupa', '👕', 5, { fx: { higiene: 3 }, onFinish: () => { this.shirtColor = pick(['#3d7dd8', '#d84a4a', '#3fa66b', '#8e5bd1', '#e0a83a', '#2f3640', '#e87bb0']); setShirt(this.player.c, this.shirtColor); this.addMoodlet('dress', 'Roupa nova', 4, 3); } })); break;
      case 'fridge':
        A.push(mk('lanche', 'Comer um lanche', '🥪', 10, { fx: { fome: 30 }, consume: { lanche: 1 }, pose: 'eat' }));
        A.push(mk('marmita', 'Comer a marmita do delivery', '🍱', 15, { fx: { fome: 62, diversao: 4 }, consume: { marmita: 1 }, pose: 'eat' }));
        A.push(mk('agua', 'Beber água mineral', '🚰', 3, { fx: { sede: 45 }, consume: { agua: 1 }, pose: 'eat' }));
        A.push(mk('refri', 'Beber refrigerante', '🥤', 5, { fx: { sede: 32, diversao: 3, fome: 4 }, consume: { refri: 1 }, pose: 'eat' }));
        A.push(mk('choco', 'Comer chocolate', '🍫', 5, { fx: { fome: 10, diversao: 6, calma: 5 }, consume: { chocolate: 1 }, pose: 'eat' }));
        break;
      case 'ksink': A.push(mk('torneira', 'Beber água da torneira', '💧', 3, { fx: { sede: 40 }, pose: 'eat' })); break;
      case 'stove':
        A.push(mk('cook', 'Cozinhar e comer', '🍳', 50, { fx: { fome: 72, sede: 4, diversao: 6, ambiente: -5 }, consume: { mantimentos: 1 }, pose: 'clean', trig: 'cook', onFinish: () => { s.skills.culinaria += 1.2; this.addMoodlet('meal', 'Refeição caseira', 5 + s.skills.culinaria / 12, 4); } }));
        if (this.juliaHere('apartment')) A.push(mk('cook2', 'Cozinhar um jantar para dois', '🍝', 70, { fx: { fome: 72, romance: 14, social: 10, diversao: 8, ambiente: -6 }, consume: { mantimentos: 2 }, pose: 'clean', partner: 'julia', trig: 'cook', trig2: 'date', onFinish: () => { s.skills.culinaria += 1.5; const j = this.npcs.julia; j.needs.fome = clamp(j.needs.fome + 60); j.mod += 10; j.rel = clamp(j.rel + 4); this.addMoodlet('dinner2', 'Jantar romântico', 10, 6); this.anniv(); } }));
        break;
      case 'toilet': A.push(mk('wc', 'Usar o banheiro', '🚽', 8, { fx: { banheiro: 100, higiene: -3 }, useSeat: seat, pose: 'sit' })); break;
      case 'bsink': A.push(mk('dentes', 'Escovar os dentes', '🪥', 3, { fx: { higiene: 8, calma: 1 } })); break;
      case 'shower': A.push(mk('banho', 'Tomar banho', '🚿', 15, { fx: { higiene: 80, calma: 6 }, consume: null, softItem: 'kit', useSeat: seat, pose: 'shower', trig: 'shower' })); break;
      case 'sofa':
        A.push(mk('tv', 'Assistir TV', '📺', 60, { fx: { diversao: 32, calma: 8, energia: -2 }, useSeat: seat, pose: 'tv', trig: 'tv', req: power, tv: true }));
        A.push(mk('rest', 'Descansar no sofá', '🛋️', 30, { fx: { calma: 12, energia: 5 }, useSeat: seat, pose: 'sit' }));
        if (s.owned.console) A.push(mk('game', 'Jogar videogame', '🎮', 90, { fx: { diversao: 58, energia: -5, calma: -2 }, useSeat: seat, pose: 'tv', trig: 'game', req: power, tv: true }));
        if (this.juliaHere('apartment')) A.push(mk('tv2', 'Assistir algo com a Júlia', '🍿', 90, { fx: { diversao: 34, romance: 16, social: 10, calma: 8 }, useSeat: seat, pose: 'tv', partner: 'julia', partnerSeat: true, tv: true, trig: 'tv', trig2: 'date', req: power, onFinish: () => { const j = this.npcs.julia; j.mod += 8; j.rel = clamp(j.rel + 3); j.needs.diversao = clamp(j.needs.diversao + 30); this.anniv(); } }));
        break;
      case 'pc':
        A.push(mk('net', 'Navegar na internet', '🌐', 45, { fx: { diversao: 20, social: 6, calma: -2 }, useSeat: seat, pose: 'work', req: power }));
        A.push(mk('study', 'Fazer um curso online', '📖', 90, { fx: { diversao: -8, calma: -4, energia: -4 }, useSeat: seat, pose: 'work', trig: 'study', req: power, onFinish: () => { s.skills.carreira += 2.5; this.toast('📈 Carreira +2.5 (curso concluído)'); } }));
        A.push(mk('bills', 'Pagar contas', '💳', 10, { useSeat: seat, pose: 'work', req: power, onStart: () => { if (this.autonomy) { this.pay('rent'); this.pay('util'); } else this.ui.billsModal(); } }));
        A.push(mk('furn', 'Comprar móveis e eletrônicos', '🛋️', 15, { useSeat: seat, pose: 'work', req: power, onStart: () => this.ui.furnModal() }));
        if (!s.job.employed) A.push(mk('jobhunt', 'Procurar emprego', '🔍', 120, { fx: { calma: -5, diversao: -6 }, useSeat: seat, pose: 'work', req: power, onFinish: () => this.jobSearch() }));
        break;
      case 'estante': A.push(mk('read', 'Ler um livro', '📚', 60, { fx: { diversao: 24, calma: 14 }, trig: 'read', pose: 'sit' })); break;
      case 'planta': A.push(mk('water', 'Regar a planta', '🪴', 5, { fx: { calma: 5 }, onFinish: () => this.addMoodlet('plant', 'Plantinha viçosa', 3, 8) })); break;
      case 'broom': A.push(mk('clean', 'Limpar a casa', '🧹', 60, { fx: { ambiente: 100, calma: 3, diversao: -8 }, softItem: 'limpeza', consumeSoft: 1, pose: 'clean', trig: 'clean', onFinish: () => { s.skills.forma += 0.2; this.addMoodlet('clean', 'Casa limpinha', 6, 8); } })); break;
      case 'bench':
        A.push(mk('bench', 'Sentar no banco', '🪑', 30, { fx: { calma: 14, diversao: 6, energia: 2, social: 3 }, useSeat: seat, pose: 'sit' }));
        if (this.juliaHere('park')) A.push(mk('bench2', 'Sentar com a Júlia', '💑', 45, { fx: { romance: 12, social: 10, calma: 10, diversao: 8 }, useSeat: seat, pose: 'sit', partner: 'julia', partnerSeat: true, trig: 'date', onFinish: () => { const j = this.npcs.julia; j.mod += 7; j.rel = clamp(j.rel + 3); this.anniv(); } }));
        break;
      case 'park':
        A.push(mk('walk', 'Caminhar pelo parque', '🚶', 45, { fx: { diversao: 16, calma: 14, energia: -5, fome: -4, sede: -6 }, wander: 'park', trig: 'walk', onFinish: () => { s.skills.forma += 0.4; } }));
        A.push(mk('run', 'Correr', '🏃', 40, { fx: { diversao: 8, calma: 12, energia: -14, fome: -8, sede: -14, higiene: -12 }, wander: 'park', run: true, trig: 'walk', onFinish: () => { s.skills.forma += 1.0; } }));
        if (this.juliaHere('park')) A.push(mk('walk2', 'Passear com a Júlia', '👫', 60, { fx: { romance: 16, social: 12, diversao: 16, calma: 8 }, wander: 'park', partner: 'julia', follow: true, trig: 'walk', trig2: 'date', onFinish: () => { const j = this.npcs.julia; j.mod += 9; j.rel = clamp(j.rel + 3.5); this.anniv(); } }));
        break;
      case 'market': A.push(mk('shop', 'Fazer compras', '🛒', 25, { inside: 'market', fx: { diversao: 2 }, req: open(o.hours, 'Mercadinho'), onStart: () => { if (this.autonomy) this.autoShop(); else this.ui.shopModal(); } })); break;
      case 'gym': A.push(mk('train', 'Treinar (R$ 25)', '🏋️', 75, { inside: 'gym', cost: 25, fx: { energia: -22, fome: -10, sede: -18, higiene: -26, diversao: 10, calma: 14 }, req: open(o.hours, 'Academia'), trig: 'gym', onFinish: () => { s.skills.forma += 1.4; this.addMoodlet('gym', 'Treino feito!', 7, 6); } })); break;
      case 'bar': {
        const rq = open(o.hours, 'Bar');
        A.push(mk('beer', 'Tomar uma cerveja (R$ 15)', '🍺', 40, { inside: 'bar', cost: 15, fx: { diversao: 22, social: 14, banheiro: -12, sede: 8, calma: 8, energia: -2 }, req: rq, trig: 'beer' }));
        A.push(mk('porcao', 'Comer uma porção (R$ 40)', '🍟', 40, { inside: 'bar', cost: 40, fx: { fome: 52, social: 6, diversao: 6 }, req: rq }));
        if (this.pres('bar').has('marcos')) A.push(mk('beerm', 'Beber com o Marcos (R$ 15)', '🍻', 50, { inside: 'bar', cost: 15, partner: 'marcos', hidden: true, fx: { diversao: 22, social: 26, banheiro: -12, calma: 8 }, req: rq, trig: 'beer', trig2: 'marcos', onFinish: () => this.social('marcos', 'talk') }));
        if (this.pres('bar').has('julia')) A.push(mk('dinner', 'Jantar com a Júlia (R$ 140)', '🍷', 90, { inside: 'bar', cost: 140, partner: 'julia', hidden: true, fx: { fome: 60, sede: 20, romance: 22, social: 18, diversao: 22, calma: 8 }, req: rq, trig: 'date', onFinish: () => { const j = this.npcs.julia; j.needs.fome = clamp(j.needs.fome + 60); j.mod += 12; j.rel = clamp(j.rel + 4); this.anniv(); } }));
        break;
      }
      case 'office': {
        const h = this.hour;
        A.push(mk('work', 'Trabalhar até as 18h', '💼', Math.max(30, 18 * 60 - s.min), { inside: 'office', rate: { calma: -0.07, fome: 0.07, sede: 0.08, banheiro: 0.12 }, req: () => !s.job.employed ? 'Você está desempregado' : !this.isWorkday ? 'Hoje não é dia útil' : s.job.workedToday ? 'Você já trabalhou hoje' : (h < 7 || h >= 17) ? 'Fora do expediente (7h–17h)' : null, onStart: () => { this.cur.left = this.cur.total = Math.max(30, 18 * 60 - s.min); s.job.workMin = 0; s.job.perfAcc = 0; s.job.late = s.min > 9 * 60 + 15; if (s.job.late) { this.toast('⏰ Você chegou atrasado...'); this.addMoodlet('late', 'Chegou atrasado', -6, 6); } }, tick: () => { s.job.workMin++; const nn = s.needs, p = 0.45 + this.moodVal / 250 + nn.energia / 400 - ((nn.fome < 15 || nn.sede < 15) ? 0.2 : 0) + s.skills.carreira / 400; s.job.perfAcc += p; }, onEnd: c => this.endWork(c), trig: 'work' }));
        if (this.pres('office').has('marcos')) A.push(mk('talk_m', 'Bater papo com o Marcos', '☕', 25, { inside: 'office', partner: 'marcos', hidden: true, fx: { social: 16, diversao: 6, calma: 3 }, req: open(o.hours, 'Escritório'), trig: 'marcos', onFinish: () => this.social('marcos', 'talk') }));
        A.push(mk('raise', 'Pedir aumento ao chefe', '💰', 20, { inside: 'office', req: () => !s.job.employed ? 'Você está desempregado' : !this.isWorkday || !this.isOpen(o.hours) ? 'Chefe não está' : (this.s.day - s.job.lastRaise < 30) ? 'Peça apenas 1 vez por mês' : s.skills.carreira < 25 * s.job.level ? `Carreira insuficiente (${Math.floor(s.skills.carreira)}/${25 * s.job.level})` : null, onFinish: () => this.askRaise() }));
        break;
      }
      case 'julia_home': {
        const here = this.pres('julia_home').has('julia') && !s.flags.broke, why = () => (s.flags.broke ? 'Vocês terminaram' : here ? null : 'Júlia não está em casa');
        A.push(mk('v_talk', 'Visitar e conversar', '💬', 40, { inside: 'julia_home', partner: 'julia', hidden: true, fx: { romance: 10, social: 16, diversao: 6 }, req: why, onFinish: () => this.social('julia', 'talk') }));
        A.push(mk('v_movie', 'Assistir um filme juntos', '🎬', 120, { inside: 'julia_home', partner: 'julia', hidden: true, fx: { diversao: 30, romance: 18, social: 10, calma: 8 }, req: why, trig: 'date', onFinish: () => { this.social('julia', 'hug'); this.anniv(); } }));
        A.push(mk('v_dinner', 'Jantar na casa dela (R$ 70)', '🍝', 90, { inside: 'julia_home', cost: 70, partner: 'julia', hidden: true, fx: { fome: 60, romance: 16, social: 14, diversao: 8 }, req: why, trig: 'date', onFinish: () => { this.social('julia', 'talk'); this.anniv(); } }));
        A.push(mk('v_flores', 'Entregar flores', '💐', 10, { inside: 'julia_home', partner: 'julia', hidden: true, consume: { flores: 1 }, fx: { romance: 18, social: 6 }, req: why, trig: 'gift', onFinish: () => { this.social('julia', 'gift_flores'); this.anniv(true); } }));
        break;
      }
      case 'lucia_home': {
        const here = this.pres('lucia_home').has('lucia');
        A.push(mk('l_talk', 'Bater na porta e conversar', '☕', 25, { inside: 'lucia_home', partner: 'lucia', hidden: true, fx: { social: 16, diversao: 4 }, req: () => (here ? null : 'Dona Lúcia não está em casa'), onFinish: () => this.social('lucia', 'talk') }));
        A.push(mk('l_rent', `Pagar o aluguel em mãos (${fmt(s.bills.rentAmt)})`, '🏠', 5, { inside: 'lucia_home', partner: 'lucia', hidden: true, req: () => (!s.bills.rentDue ? 'Nada vencido' : here ? (s.money < s.bills.rentAmt ? 'Dinheiro insuficiente' : null) : 'Dona Lúcia não está em casa'), onFinish: () => this.pay('rent') }));
        break;
      }
    }
    return A;
  }
  socialActions(id) {
    const n = this.npcs[id], isJ = id === 'julia', mk = this.mk.bind(this), A = [], s = this.s;
    const brk = () => (isJ && s.flags.broke ? 'Vocês terminaram' : null);
    A.push(mk('talk', 'Conversar', '💬', 30, { partner: id, fx: { social: 24, diversao: 5, ...(isJ ? { romance: 8 } : {}) }, pose: 'talk', req: brk, trig: 'talk_' + id, onFinish: () => this.social(id, 'talk') }));
    A.push(mk('joke', 'Contar uma piada', '😜', 10, { partner: id, fx: { diversao: 6, social: 8 }, pose: 'talk', req: brk, onFinish: () => this.social(id, 'joke') }));
    A.push(mk('comp', 'Fazer um elogio', '🌟', 5, { partner: id, fx: { social: 6, ...(isJ ? { romance: 5 } : {}) }, pose: 'talk', req: brk, onFinish: () => this.social(id, 'compliment') }));
    A.push(mk('vent', 'Desabafar', '🗣️', 20, { partner: id, fx: { calma: 14, social: 12 }, pose: 'talk', req: brk, onFinish: () => this.social(id, 'vent') }));
    A.push(mk('comfort', 'Consolar / dar apoio', '🤗', 15, { partner: id, fx: { social: 10, calma: -3 }, pose: 'talk', req: () => brk() || (n.mood > 55 ? `${n.def.name} está bem, não precisa` : null), onFinish: () => this.social(id, 'comfort') }));
    if (isJ) {
      A.push(mk('hug', 'Dar um abraço', '🫂', 3, { partner: id, fx: { romance: 8, social: 6, calma: 6 }, req: brk, onFinish: () => this.social(id, 'hug') }));
      A.push(mk('kiss', 'Beijar', '💋', 3, { partner: id, fx: { romance: 14, calma: 4 }, req: brk, onFinish: () => this.social(id, 'kiss') }));
      A.push(mk('gflores', 'Dar flores', '💐', 5, { partner: id, consume: { flores: 1 }, fx: { romance: 18 }, req: brk, trig: 'gift', onFinish: () => { this.social(id, 'gift_flores'); this.anniv(true); } }));
      A.push(mk('gchoco', 'Dar chocolate', '🍫', 5, { partner: id, consume: { chocolate: 1 }, fx: { romance: 8 }, req: brk, trig: 'gift', onFinish: () => { this.social(id, 'gift_chocolate'); this.anniv(true); } }));
      if (n.visit && n.loc === 'apartment') A.push(mk('sendoff', 'Se despedir (ela vai embora)', '👋', 2, { partner: id, req: null, onFinish: () => { n.visit = null; this.toast('Júlia se despediu com um beijo 💕'); this.need('romance', 4); } }));
    }
    return A;
  }
  phoneActions() {
    const s = this.s, mk = this.mk.bind(this), j = this.npcs.julia, A = [];
    const asleep = () => (this.hour >= 23.3 || this.hour < 7.2 ? 'Ela está dormindo' : s.flags.broke ? 'Vocês terminaram' : null);
    const busy = () => asleep() || (j.visit && j.loc !== 'julia_home' && j.loc !== 'away' ? null : null);
    const inv = (kind) => () => {
      const a = asleep(); if (a) return a;
      const h = this.hour, wk = this.isWorkday;
      if (wk && h >= 8.4 && h < 17.6 && kind !== 'park') return 'Ela está no trabalho';
      if (wk && h >= 8.4 && h < 17.6) return 'Ela está no trabalho';
      if (kind === 'bar' && s.money < 140) return 'Dinheiro curto para o jantar';
      if (kind === 'home' && !this.world.objs) return null;
      if (j.mood < 22) return 'Ela não está com cabeça para sair';
      if (this.abs < (j.cooldown || 0)) return 'Ela já tem compromisso agora';
      return null;
    };
    const invite = (kind, loc, hrs) => () => {
      j.visit = { loc, until: this.abs + hrs * 60 }; j.cooldown = this.abs + hrs * 60;
      this.toast(`📱 Júlia topou e está indo para ${kind}`, 'good'); if (j.mood > 60) this.addMoodlet('plans', 'Combinou um programa', 4, 3);
      this.need('romance', 3); this.emit('invite');
    };
    A.push(mk('call', 'Ligar para a Júlia', '📞', 20, { pose: 'phone', fx: { romance: 12, social: 10, diversao: 3 }, req: asleep, trig: 'call', onFinish: () => this.social('julia', 'talk') }));
    A.push(mk('msg', 'Mandar mensagem carinhosa', '💌', 5, { pose: 'phone', fx: { romance: 4, social: 3 }, req: asleep, trig: 'call', onFinish: () => { const n = this.npcs.julia; n.mod += 3; n.rel = clamp(n.rel + 0.8); this.emote(n, '😊'); } }));
    A.push(mk('inv_home', 'Chamar a Júlia para vir aqui', '🏠', 3, { pose: 'phone', req: inv('home'), onFinish: invite('o seu apê', 'apartment', 4) }));
    A.push(mk('inv_park', 'Chamar para passear no parque', '🌳', 3, { pose: 'phone', req: inv('park'), onFinish: invite('o parque', 'park', 3) }));
    A.push(mk('inv_bar', 'Convidar para jantar no bar', '🍷', 3, { pose: 'phone', req: inv('bar'), onFinish: invite('o bar', 'bar', 3) }));
    A.push(mk('mom', 'Ligar para a mãe', '👵', 20, { pose: 'phone', fx: { social: 18, calma: 5, diversao: 3 }, req: () => (this.hour >= 23 || this.hour < 7 ? 'Ela está dormindo' : null) }));
    A.push(mk('delivery', 'Pedir delivery (R$ 40)', '🛵', 5, { pose: 'phone', cost: 40, onFinish: () => { s.deliveries.push({ at: this.abs + 35, item: 'marmita', qty: 1 }); this.toast('🛵 Pedido feito: chega em ~35 min'); } }));
    return A;
  }

  // ====================== execução de ações ======================
  perform(target, def) {
    const why = this.canDo(def);
    if (why) { this.ui.toast('⚠️ ' + why, 'warn'); return; }
    if (this.s.over) return;
    this.cancelAction(true);
    const tasks = [];
    if (target.kind === 'obj' && target.obj.approach && def.id !== 'call' && !def.phone) tasks.push({ t: 'go', cell: target.obj.approach, obj: target.obj });
    if (target.kind === 'npc') tasks.push({ t: 'goNpc', id: target.id });
    if (def.inside) tasks.push({ t: 'enter', place: def.inside });
    tasks.push({ t: 'act', def, target });
    this.tasks = tasks; this.ui.hideMenu();
    if (this.player.seated) this.leaveSeat();
  }
  leaveSeat() {
    const p = this.player; p.seated = false; p.seatY = null; p.pose = 'idle';
  }
  cancelAction(silent) {
    if (this.cur) { if (this.cur.def.sleep && this.cur.forced) return; this.finishAction(true); }
    this.tasks = []; this.player.stop();
    if (this.player.seated) this.leaveSeat();
    if (this.insideId) this.exitBuilding();
    for (const id in this.npcs) this.npcs[id].busy = false;
    if (!silent && this.ui) this.ui.toast('Ação cancelada');
  }
  startAct(t) {
    const s = this.s, def = t.def, p = this.player;
    const why = this.canDo(def);
    if (why) { this.ui.toast('⚠️ ' + why, 'warn'); this.tasks = []; if (this.inside) this.exitBuilding(); return; }
    if (def.cost) this.spend(def.cost);
    if (def.consume) for (const k in def.consume) s.inv[k] -= def.consume[k];
    let scale = 1;
    if (def.softItem) { const need = def.consumeSoft || 1; if ((s.inv[def.softItem] || 0) >= need) s.inv[def.softItem] -= need; else { scale = 0.5; this.toast(`Sem ${ITEMS[def.softItem].label.toLowerCase()}... o resultado foi pior`, 'warn'); } }
    this.cur = { def, target: t.target, left: def.mins, total: def.mins, scale, start: this.abs, sleepMin: 0 };
    this.sleptMin = 0;
    const obj = t.target.obj;
    if (def.useSeat && obj && obj.seat) { const st = obj.seat; p.setPos(st.x, st.z); p.rot = st.rot; p.seatY = st.y; p.seated = true; p.pose = def.pose || st.pose; }
    else {
      p.pose = def.pose || 'idle';
      if (obj && obj.cells) p.face(obj.cells[0] + obj.cells[2] / 2, obj.cells[1] + obj.cells[3] / 2);
      else if (obj && obj.group && !def.inside) { /* nada */ }
    }
    if (def.wander) { p.pose = def.run ? 'run' : 'idle'; p.speed = def.run ? 2.4 : 1.4; this.pickWander(); }
    if (def.partner) this.startPartner(def, t.target, obj);
    if (def.tv) this.world.setTv(true);
    if (this.inside) { this.insideBubble.setEmoji(def.icon); this.insideBubble.visible = true; }
    def.onStart && def.onStart();
  }
  startPartner(def, target, obj) {
    const n = this.npcs[def.partner]; if (!n) return;
    n.busy = true; n.walker.stop();
    if (def.hidden) return;
    const p = this.player;
    if (def.partnerSeat && obj && obj.seat2) { const st = obj.seat2; n.walker.setPos(st.x, st.z); n.walker.rot = st.rot; n.walker.seatY = st.y; n.walker.seated = true; n.walker.pose = st.pose || 'sit'; }
    else if (!def.follow && !(target.kind === 'npc')) {
      // posiciona a parceira ao lado do jogador
      const c = this.world.nav.nearestFree(p.cx + 1, p.cz) || [p.cx, p.cz]; n.walker.setPos(c[0] + 0.5, c[1] + 0.5); n.walker.face(p.x, p.z);
    }
    if (target.kind === 'npc') { n.walker.face(p.x, p.z); p.face(n.walker.x, n.walker.z); n.walker.pose = 'talk'; }
  }
  pickWander() {
    const r = WANDER.park, nav = this.world.nav;
    for (let i = 0; i < 25; i++) { const x = Math.floor(rnd(r[0], r[2])), z = Math.floor(rnd(r[1], r[3])); if (nav.ok(x, z)) { this.player.goTo(x, z); return; } }
  }
  tickAction() {
    const c = this.cur; if (!c) return;
    const def = c.def, s = this.s;
    for (const k in def.fx) if (def.mins > 0) this.need(k, (def.fx[k] * c.scale) / def.mins);
    if (def.rate) for (const k in def.rate) this.need(k, def.rate[k]);
    if (def.sleep) { c.sleepMin++; this.sleptMin = c.sleepMin; }
    def.tick && def.tick();
    if (def.wander && !this.player.moving) this.pickWander();
    if (def.follow) { const pn = this.npcs[def.partner].walker; if (Math.hypot(pn.x - this.player.x, pn.z - this.player.z) > 2.2 && !pn.moving) pn.goTo(this.player.cx, this.player.cz); }
    c.left--;
    if (c.left <= 0 || (def.until && c.sleepMin > 10 && def.until())) this.finishAction(false);
    else if (def.rate && def.rate.calma < 0 && !def.sleep) { /* trabalho: nada extra */ }
  }
  finishAction(cancelled) {
    const c = this.cur; if (!c) return; this.cur = null;
    const def = c.def, p = this.player;
    if (def.tv) this.world.setTv(false);
    if (def.onEnd) def.onEnd(cancelled);
    if (!cancelled && def.onFinish) def.onFinish();
    if (!cancelled) { if (def.trig) this.emit(def.trig); if (def.trig2) this.emit(def.trig2); }
    if (def.partner) { const n = this.npcs[def.partner]; n.busy = false; n.walker.seated = false; n.walker.seatY = null; n.walker.pose = 'idle'; if (n.walker.visible && n.loc === 'apartment' && def.partnerSeat) { const cc = this.world.nav.nearestFree(n.walker.cx, n.walker.cz + 1); if (cc) n.walker.setPos(cc[0] + 0.5, cc[1] + 0.5); } }
    if (def.wander) { p.speed = 1.4; p.stop(); }
    p.pose = 'idle';
    this.insideBubble.visible = false;
    if (p.seated) {
      const obj = c.target.obj; p.seated = false; p.seatY = null;
      const ap = obj && obj.approach ? obj.approach : [p.cx, p.cz]; p.setPos(ap[0] + 0.5, ap[1] + 0.5);
    }
    if (this.inside && !this.tasks.length) this.exitBuilding();
    if (!cancelled && this.s.needs.energia <= 0) this.passOut();
  }
  get inside() { return this.insideId; }
  enterBuilding(id) {
    this.insideId = id; this.player.visible = false; this.player.stop(); this.pres(id).add('player');
    const c = this.world.objs[id].center;
    this.insideBubble.position.set(c[0], c[1] + 0.6, c[2]);
  }
  exitBuilding() {
    const id = this.insideId; if (!id) return;
    this.pres(id).delete('player'); this.insideId = null;
    const ap = this.world.objs[id].approach; this.player.setPos(ap[0] + 0.5, ap[1] + 0.5); this.player.visible = true; this.insideBubble.visible = false;
  }
  processTasks() {
    if (this.cur || !this.tasks.length || this.s.over) return;
    const t = this.tasks[0], p = this.player;
    if (t.t === 'go') {
      if (!t.started) { t.started = true; p.seated && this.leaveSeat(); if (!p.goTo(t.cell[0], t.cell[1])) { this.ui.toast('Não consigo chegar até lá', 'warn'); this.tasks = []; return; } }
      if (!p.path.length) { this.tasks.shift(); }
    } else if (t.t === 'goNpc') {
      const n = this.npcs[t.id];
      if (!n.walker.visible) { this.tasks = []; return; }
      const d = Math.hypot(n.walker.x - p.x, n.walker.z - p.z);
      if (d < 1.5) { p.stop(); this.tasks.shift(); n.busy = true; n.walker.stop(); return; }
      if (!t.started || (!p.path.length) || (this.frame % 30 === 0)) { t.started = true; p.goTo(n.walker.cx, n.walker.cz); }
    } else if (t.t === 'enter') {
      this.enterBuilding(t.place); this.tasks.shift();
    } else if (t.t === 'act') {
      this.tasks.shift(); this.startAct(t);
    }
  }
  clickWalk(cx, cz) {
    if (this.s.over) return;
    if (this.cur && this.cur.def.sleep && this.cur.forced) return;
    this.cancelAction(true);
    if (!this.world.nav.inb(cx, cz)) return;
    if (this.player.seated) this.leaveSeat();
    this.tasks = []; if (!this.player.goTo(cx, cz)) this.ui.toast('Não consigo chegar até lá', 'warn');
  }

  // ====================== eventos de jogo ======================
  emit(trig) {
    for (const w of this.s.wants) if (!w.done && w.trig === trig) {
      w.done = true; this.s.wantsDone++;
      this.addMoodlet('want_' + w.id, 'Desejo realizado', 14, 6); this.need('diversao', 8); this.need('calma', 4);
      this.toast(`✨ Desejo realizado: ${w.text}`, 'good'); w.doneAt = this.abs;
    }
  }
  anniv(gift) {
    const s = this.s;
    if (this.date === 20 && !s.flags.annivDone && !s.flags.broke) { s.flags.annivDone = true; this.npcs.julia.mod += 18; this.npcs.julia.rel = clamp(this.npcs.julia.rel + 6); this.toast('💞 Mêsversário comemorado! A Júlia amou o gesto.', 'good'); this.addMoodlet('anniv', 'Mêsversário perfeito', 12, 12); }
  }
  emote(n, e) { n.walker.c.bubble.setEmoji(e); n.emoteUntil = this.timeSec + 4; }
  social(id, kind) {
    const n = this.npcs[id], d = n.def, m = n.mood; let drel = 0, dmod = 0, msg = '', emo = '🙂', good = true;
    switch (kind) {
      case 'talk': if (m < 35 && Math.random() < 0.45) { drel = -1; dmod = -2; msg = `${d.name} não estava num bom dia e a conversa não rendeu.`; emo = '😒'; good = false; } else { drel = 2.5; dmod = 5; msg = `Papo agradável com ${d.name}.`; emo = '😊'; } break;
      case 'joke': if (Math.random() < 0.3 + d.humor * 0.35 + m / 250) { drel = 3; dmod = 9; msg = `${d.name} riu muito da piada!`; emo = '😂'; } else { drel = -2; dmod = -4; msg = `A piada não colou com ${d.name}...`; emo = '😐'; good = false; } break;
      case 'compliment': drel = n.rel < 25 ? 0.5 : 2; dmod = 6; msg = `${d.name} gostou do elogio.`; emo = '😊'; break;
      case 'vent': if (d.empathy > 0.5) { drel = 2; dmod = -2; msg = `${d.name} ouviu com atenção. Você se sentiu aliviado.`; emo = '🥹'; } else { drel = -1; dmod = -5; msg = `${d.name} parece ter cansado do assunto.`; emo = '😮‍💨'; good = false; } break;
      case 'comfort': drel = 4; dmod = 12; msg = `${d.name} ficou mais animado(a) com seu apoio.`; emo = '🥹'; break;
      case 'hug': drel = 2; dmod = 6; msg = 'Um abraço apertado. 🤗'; emo = '🤗'; break;
      case 'kiss': if (n.rel < 35) { drel = -3; dmod = -8; msg = 'Ela se afastou... talvez seja cedo demais.'; emo = '😳'; good = false; } else { drel = 2.5; dmod = 8; msg = 'Que beijo! 💋'; emo = '😘'; } break;
      case 'gift_flores': drel = 6; dmod = 16; msg = `${d.name} adorou as flores!`; emo = '😍'; break;
      case 'gift_chocolate': drel = 3; dmod = 9; msg = `${d.name} adorou o chocolate!`; emo = '😋'; break;
    }
    n.rel = clamp(n.rel + drel); n.mod += dmod; n.needs.social = clamp(n.needs.social + (good ? 18 : 4));
    if (id === 'julia' && !good) this.addMoodlet('badtalk', 'Climão com a Júlia', -6, 3);
    else if (id === 'julia' && ['hug', 'kiss', 'gift_flores', 'gift_chocolate', 'compliment'].includes(kind)) this.addMoodlet('lovely', 'Momento carinhoso', 6, 4);
    else if (!good) this.addMoodlet('badtalk', 'Conversa ruim', -4, 2);
    this.emote(n, emo); this.toast(msg, good ? 'good' : 'warn');
    if (id === 'marcos') { /* amizade influencia trabalho */ if (n.rel > 60) this.addMoodlet('friend', 'Amigo no trabalho', 4, 12); }
  }
  pay(kind) {
    const b = this.s.bills;
    if (kind === 'rent' && b.rentDue && this.s.money >= b.rentAmt) { this.spend(b.rentAmt); b.rentDue = false; b.rentLate = 0; b.rentAmt = RENT; this.toast(`🏠 Aluguel pago: ${fmt(RENT)}`, 'good'); this.npcs.lucia.rel = clamp(this.npcs.lucia.rel + 4); this.addMoodlet('rentpaid', 'Aluguel em dia', 6, 24); return true; }
    if (kind === 'util' && b.utilDue && this.s.money >= b.utilAmt) { this.spend(b.utilAmt); b.utilDue = false; b.utilLate = 0; this.toast(`💡 Contas pagas: ${fmt(b.utilAmt)}`, 'good'); return true; }
    return false;
  }
  buyItems(cart) {
    let total = 0; for (const k in cart) total += ITEMS[k].price * cart[k];
    if (total <= 0) return;
    if (total > this.s.money) { this.ui.toast('Dinheiro insuficiente!', 'warn'); return false; }
    this.spend(total);
    for (const k in cart) { this.s.inv[k] = (this.s.inv[k] || 0) + cart[k] * (ITEM_QTY[k] || 1); }
    this.toast(`🧾 Compras: ${fmt(total)}`);
    return true;
  }
  buyFurniture(k) {
    const f = FURNITURE[k]; if (this.s.owned[k]) return; if (this.s.money < f.price) { this.ui.toast('Dinheiro insuficiente!', 'warn'); return false; }
    this.spend(f.price); this.s.owned[k] = true; this.world.setOwned(this.s.owned); this.toast(`📦 ${f.label} comprado e instalado!`, 'good'); this.emit('buy_' + k); this.addMoodlet('newstuff', 'Compra nova', 8, 10); return true;
  }
  askRaise() {
    const s = this.s, p = 0.4 + s.job.perfRecent * 0.4 + this.moodVal / 300;
    s.job.lastRaise = s.day;
    if (Math.random() < p) { s.job.wage = Math.round(s.job.wage * 1.12); s.job.level++; this.toast(`🎉 Aumento aprovado! Diária agora ${fmt(s.job.wage)}`, 'good'); this.addMoodlet('raise', 'Aumento!', 14, 24); }
    else { this.toast('O chefe disse que ainda não é o momento...', 'warn'); this.addMoodlet('noraise', 'Aumento negado', -6, 8); }
  }
  endWork(cancelled) {
    const j = this.s.job; if (j.workMin < 1) return;
    const avg = j.perfAcc / Math.max(1, j.workMin); j.perfRecent = avg;
    if (j.workMin >= 240 || !cancelled) {
      const mult = clamp(0.85 + avg * 0.4, 0.8, 1.2) * (j.late ? 0.8 : 1) * clamp(j.workMin / 540, 0.4, 1);
      const pay = Math.round(j.wage * mult); j.pending += pay; j.workedToday = true;
      this.s.skills.carreira += 0.6 * avg;
      this.toast(`💼 Expediente concluído: +${fmt(pay)} a receber no dia 5`);
      if (avg < 0.5 && Math.random() < 0.4) { j.warnings++; this.toast('⚠️ O chefe te chamou a atenção pelo baixo rendimento.', 'warn'); this.need('calma', -10); this.checkFire(); }
    } else this.toast('Você saiu mais cedo e não recebeu pelo dia.', 'warn');
  }
  checkFire() {
    const j = this.s.job;
    if (j.employed && (j.warnings >= 3 || j.absences >= 3)) { j.employed = false; j.pending = Math.round(j.pending); this.toast('📦 Você foi demitido! Procure emprego pelo computador.', 'bad'); this.addMoodlet('fired', 'Desempregado', -18, 72); this.need('calma', -25); }
  }
  jobSearch() {
    const s = this.s; s.flags.jobHuntDays++;
    if (Math.random() < 0.3 + s.skills.carreira / 250 + s.flags.jobHuntDays * 0.05) { s.job.employed = true; s.job.warnings = 0; s.job.absences = 0; s.job.wage = Math.round(s.job.wage * 0.92); s.flags.jobHuntDays = 0; this.toast(`🎉 Você conseguiu um emprego! Diária ${fmt(s.job.wage)}`, 'good'); this.addMoodlet('newjob', 'Novo emprego!', 12, 24); }
    else this.toast('Nenhuma vaga por enquanto... tente de novo amanhã.', 'warn');
  }

  // ====================== passagem do tempo ======================
  effSpeed() {
    let sp = this.speed;
    if (this.autoAccel && this.cur && !this.player.moving && this.cur.def.mins >= 15 && !this.cur.def.wander) sp = Math.max(sp, 8);
    return sp;
  }
  advance(dtReal) {
    this.timeSec += dtReal; this.frame = (this.frame || 0) + 1;
    if (this.paused || this.modalOpen > 0 || this.s.over) { this.render(0); return; }
    let dtMin = Math.min(dtReal * MIN_PER_SEC * this.effSpeed(), 25);
    this.player.update(dtMin);
    for (const id in this.npcs) { const n = this.npcs[id]; n.walker.update(dtMin); if (n.dest && !n.walker.moving && !n.walker.path.length) this.npcArrive(n); }
    this.processTasks();
    this.acc += dtMin;
    let guard = 0;
    while (this.acc >= 1 && guard++ < 60) { this.acc -= 1; this.tickMinute(); if (this.s.over) break; }
    this.render(dtReal);
  }
  render(dt) {
    const t = this.timeSec;
    this.player.render(t);
    this.player.c.bubble.setEmoji(this.emotion.emoji); this.player.c.bubble.visible = this.player.visible;
    for (const id in this.npcs) {
      const n = this.npcs[id]; n.walker.render(t);
      if (this.timeSec > n.emoteUntil) n.walker.c.bubble.setEmoji(this.npcEmotion(n).emoji);
    }
    if (this.lastTimeSet !== Math.floor(this.s.min / 2)) { this.lastTimeSet = Math.floor(this.s.min / 2); this.world.setTime(this.s.min); }
  }
  tickMinute() {
    const s = this.s, prevDay = s.day;
    s.min++;
    if (s.min >= 1440) { s.min = 0; s.day++; this.newDay(); }
    const mul = this.cur && this.cur.def.sleep ? 0.35 : 1;
    // decaimento
    for (const nd of NEEDS) {
      if (this.cur && this.cur.def.rate && nd.id in this.cur.def.rate && this.cur.def.sleep) continue;
      let m = mul; if (this.cur && this.cur.def.sleep && (nd.id === 'fome' || nd.id === 'sede')) m = 0.5;
      if (nd.id === 'energia' && this.cur && this.cur.def.sleep) continue;
      this.need(nd.id, -nd.decay * m);
    }
    if (this.s.bills.rentLate > 3 || this.s.bills.utilLate > 3) this.need('calma', -0.012);
    if (this.player.visible && this.world.groundY(this.player.x, this.player.z) > 0.1 && !(this.cur && this.cur.def.inside)) this.need('calma', 0.02); // em casa relaxa
    if (!this.power) this.need('diversao', -0.02);
    if (this.s.needs.calma > 80 && !this.cur) this.s.needs.calma -= 0.005;
    // humor
    const now = this.abs; s.moodlets = s.moodlets.filter(m => m.until > now);
    let sum = 0; for (const m of s.moodlets) sum += m.val;
    const n = s.needs; let extra = 0;
    if (n.ambiente < 35) extra -= 6; if (s.owned.planta) extra += 2; if (s.owned.tapete) extra += 2;
    this.moodVal = moodOf(n, sum + extra);
    this.moodletSum = sum + extra;
    // saúde
    if (n.fome <= 0.5 || n.sede <= 0.5) s.health = clamp(s.health - 0.08);
    else if (n.fome > 30 && n.sede > 30 && n.energia > 25) s.health = clamp(s.health + 0.04);
    if (n.energia <= 0.5 && !this.inFF) this.passOut();
    else if (s.health <= 0 && !this.inFF) this.faint();
    // ação do jogador
    this.tickAction();
    // NPCs
    for (const id in this.npcs) this.npcMinute(this.npcs[id]);
    // horários
    if (s.min === 19 * 60) this.checkAbsence();
    if (s.min % 30 === 0) { this.deliveriesTick(); this.maybeEvent(); this.refillWants(); }
    if (s.min === 8 * 60 && this.date === 20 && !s.flags.broke) this.toast('💞 Hoje é o mêsversário de namoro! Que tal fazer uma surpresa para a Júlia?', 'good');
    if (s.min === 8 * 60 && this.date === 5) this.toast('💵 Hoje é o dia do pagamento!', 'good');
    if (s.min % 5 === 0) { this.world.setDirt(s.needs.ambiente); if (this.autonomy && !this.cur && !this.tasks.length && !this.inFF) this.autoDecide(); }
    if (this.hourWarn !== Math.floor(s.min / 15)) { this.hourWarn = Math.floor(s.min / 15); this.warnings(); }
  }
  warnings() {
    const n = this.s.needs, w = (k, txt) => { if (n[k] < 12 && this.timeSec - (this['w_' + k] || -99) > 20) { this['w_' + k] = this.timeSec; this.ui && this.ui.toast(txt, 'warn'); } };
    w('fome', '🍽️ Você está morrendo de fome!'); w('sede', '💧 Você está com muita sede!'); w('energia', '⚡ Você está exausto!'); w('banheiro', '🚽 Precisa ir ao banheiro urgente!'); w('higiene', '🚿 Você está precisando de um banho...');
  }
  newDay() {
    const s = this.s, d = this.date;
    s.job.workedToday = false; s.flags.annivDone = false;
    for (const id in this.npcs) { this.npcs[id].barDay = Math.random() < 0.45; }
    if (d === 1) { s.job.absences = 0; s.job.warnings = Math.max(0, s.job.warnings - 1); }
    if (d === 5) { if (s.job.pending > 0) { s.money += s.job.pending; this.toast(`💵 Salário recebido: ${fmt(s.job.pending)}`, 'good'); s.job.pending = 0; this.addMoodlet('pay', 'Dia de pagamento', 8, 24); } }
    if (d === 10) { s.bills.rentDue = true; s.bills.rentLate = 0; s.bills.rentAmt = RENT; this.toast(`🏠 Aluguel venceu: ${fmt(RENT)}. Pague pelo computador ou à Dona Lúcia.`, 'warn'); }
    if (d === 15) { s.bills.utilDue = true; s.bills.utilLate = 0; s.bills.utilAmt = Math.round(200 + Math.random() * 110); this.toast(`💡 Chegaram as contas de luz/água/internet: ${fmt(s.bills.utilAmt)}`, 'warn'); }
    if (s.bills.rentDue && d !== 10) { s.bills.rentLate++; if (s.bills.rentLate === 6) { s.bills.rentAmt += 130; this.toast('⚠️ Multa de 10% no aluguel atrasado!', 'bad'); } if (s.bills.rentLate === 12) this.toast('📩 Dona Lúcia ameaça despejo se não pagar logo.', 'bad'); if (s.bills.rentLate >= 24) return this.gameOver('Você foi despejado por falta de pagamento do aluguel. Fim de jogo.'); this.npcs.lucia.mod -= 3; }
    if (s.bills.utilDue && d !== 15) { s.bills.utilLate++; if (s.bills.utilLate === 10) this.toast('🔌 A luz foi cortada! TV, PC e videogame ficam inoperantes.', 'bad'); }
    // relacionamento
    const j = this.npcs.julia;
    if (!s.flags.broke) {
      j.rel = clamp(j.rel - (s.needs.romance < 20 ? 2.2 : s.needs.romance < 45 ? 0.9 : 0.3));
      if (j.rel < 10) s.flags.lowRelDays++; else s.flags.lowRelDays = 0;
      if (s.flags.lowRelDays >= 3) { s.flags.broke = true; this.toast('💔 A Júlia terminou o namoro por falta de atenção...', 'bad'); this.addMoodlet('breakup', 'Fim do namoro', -25, 24 * 10); s.needs.romance = 5; j.visit = null; }
    }
    s.skills.forma = Math.max(0, s.skills.forma - 0.15);
    // desejos antigos expiram
    s.wants = s.wants.filter(w => this.abs < w.until || w.done);
    this.log(`— ${WEEKDAYS[this.weekday]}, ${d} de ${this.monthName} —`, 'day');
    this.save();
  }
  checkAbsence() {
    const j = this.s.job;
    if (this.isWorkday && j.employed && !j.workedToday) { j.absences++; this.toast(`⚠️ Falta no trabalho (${j.absences}/3 no mês).`, 'bad'); this.need('calma', -6); this.checkFire(); }
  }
  deliveriesTick() {
    const s = this.s, now = this.abs, rem = [];
    for (const d of s.deliveries) { if (now >= d.at) { s.inv[d.item] = (s.inv[d.item] || 0) + d.qty; this.toast('🛵 O delivery chegou! Está na geladeira.', 'good'); } else rem.push(d); }
    s.deliveries = rem;
  }
  refillWants() {
    const s = this.s; const active = s.wants.filter(w => !w.done);
    if (active.length >= 3) return;
    if (s.wants.filter(w => w.done && this.abs - w.doneAt < 120).length + active.length >= 4) return;
    const used = new Set(s.wants.map(w => w.id));
    const pool = WANTS.filter(w => !used.has(w.id) && (!w.needs || s.owned[w.needs]) && (!w.notOwned || !s.owned[w.notOwned]) && !(s.flags.broke && ['call', 'gift', 'date'].includes(w.trig)));
    if (!pool.length) { s.wants = s.wants.filter(w => !w.done); return; }
    const w = pick(pool); s.wants.push({ id: w.id, text: w.text, trig: w.trig, until: this.abs + 2 * 1440, done: false });
    s.wants = s.wants.filter(x => !x.done || this.abs - x.doneAt < 240);
  }
  passOut() {
    if (this.inFF) return; this.inFF = true;
    this.cancelAction(true); this.exitBuilding && this.insideId && this.exitBuilding();
    this.toast('😵 Você desmaiou de cansaço e acordou horas depois...', 'bad');
    const bed = this.world.objs.bed;
    this.player.setPos(bed.approach[0] + 0.5, bed.approach[1] + 0.5);
    for (let i = 0; i < 360; i++) { this.s.needs.energia = Math.min(100, this.s.needs.energia + 0.2); this.tickMinute(); if (this.s.over) break; }
    this.s.needs.energia = Math.max(this.s.needs.energia, 55); this.s.health = clamp(this.s.health - 6);
    this.addMoodlet('passout', 'Apagou de exaustão', -8, 8); this.inFF = false;
  }
  faint() {
    if (this.inFF) return; this.inFF = true;
    this.cancelAction(true); this.insideId && this.exitBuilding();
    this.spend(500); this.toast('🏥 Você foi internado por falta de cuidados: -R$ 500.', 'bad');
    const bed = this.world.objs.bed; this.player.setPos(bed.approach[0] + 0.5, bed.approach[1] + 0.5);
    for (let i = 0; i < 480; i++) this.tickMinute();
    this.s.health = 55; this.s.needs.fome = Math.max(this.s.needs.fome, 55); this.s.needs.sede = Math.max(this.s.needs.sede, 60); this.s.needs.energia = Math.max(this.s.needs.energia, 60);
    this.addMoodlet('hospital', 'Susto no hospital', -10, 24); this.inFF = false;
  }
  gameOver(msg) { this.s.over = msg; this.cancelAction(true); this.ui && this.ui.gameOver(msg); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ok */ } }

  // ====================== eventos aleatórios ======================
  maybeEvent() {
    const s = this.s, h = this.hour;
    if (this.modalOpen || this.inFF || s.over || this.abs - s.flags.lastEvent < 840 || h < 8 || h > 22.5 || Math.random() > 0.2) return;
    if (this.cur && this.cur.def.sleep) return;
    const j = this.npcs.julia, evs = [];
    if (!s.flags.broke && j.mood < 45 && h > 17) evs.push('julia_sad');
    if (this.isWorkday && h >= 18 && h < 20 && this.npcs.marcos.barDay && s.money > 40) evs.push('marcos_bar');
    if (s.day - (s.flags.lastLeak ?? -99) >= 12) evs.push('leak');
    if (h >= 21.5) evs.push('neighbor', 'neighbor');
    if (this.weekday === 6 && h < 20) evs.push('mom');
    if (this.isWorkday && s.job.employed && s.job.workedToday && (s.job.perfRecent || 0) > 0.7 && h >= 18) evs.push('praise');
    if (s.bills.rentLate >= 3 && s.bills.rentDue) evs.push('lucia_knock');
    if (!evs.length) return;
    this.triggerEvent(pick(evs));
  }
  triggerEvent(id) {
    const s = this.s; s.flags.lastEvent = this.abs;
    const ev = this.ui.eventModal;
    switch (id) {
      case 'julia_sad': ev.call(this.ui, { title: '📱 Júlia está ligando', emoji: '😢', text: 'Júlia: "Amor... tive um dia horrível no trabalho. Preciso desabafar."', choices: [
        { label: 'Ouvir com carinho (20 min)', fn: () => { this.need('romance', 8); this.need('calma', -3); this.npcs.julia.mod += 14; this.npcs.julia.rel = clamp(this.npcs.julia.rel + 3); this.emit('call'); this.pass(20); this.toast('Você ouviu a Júlia com carinho. Ela se sentiu acolhida. 💕', 'good'); } },
        { label: 'Chamar para vir aqui', fn: () => { const j = this.npcs.julia; j.visit = { loc: 'apartment', until: this.abs + 240 }; j.cooldown = this.abs + 240; j.mod += 8; this.toast('Júlia está a caminho para te encontrar. 🏠', 'good'); } },
        { label: 'Estou ocupado, depois falo', fn: () => { this.npcs.julia.mod -= 10; this.npcs.julia.rel = clamp(this.npcs.julia.rel - 4); this.addMoodlet('ignored', 'Ignorou a Júlia', -6, 6); this.toast('A Júlia ficou chateada... 💔', 'warn'); } }] }); break;
      case 'marcos_bar': ev.call(this.ui, { title: '📱 Marcos mandou mensagem', emoji: '🍻', text: 'Marcos: "Bora tomar uma no Bar do Zé? Tô lá agora!"', choices: [
        { label: 'Bora! (ir ao bar)', fn: () => { const bar = this.world.objs.bar, act = this.actionsFor({ kind: 'obj', obj: bar }).find(a => a.id === 'beerm') || this.actionsFor({ kind: 'obj', obj: bar }).find(a => a.id === 'beer'); if (act) this.perform({ kind: 'obj', obj: bar }, act); } },
        { label: 'Hoje não dá', fn: () => { this.npcs.marcos.rel = clamp(this.npcs.marcos.rel - 2); } }] }); break;
      case 'leak': s.flags.lastLeak = s.day; ev.call(this.ui, { title: '🚰 Vazamento na pia!', emoji: '🔧', text: 'A pia da cozinha começou a vazar e já tem água no chão.', choices: [
        { label: 'Chamar encanador (R$ 150)', fn: () => { this.spend(150); this.need('calma', 4); this.toast('Encanador resolveu o problema.'); } },
        { label: 'Tentar consertar sozinho', fn: () => { if (Math.random() < 0.5 + s.skills.forma / 400) { this.toast('Consertou sozinho! Orgulho de si. 🔧', 'good'); this.addMoodlet('diy', 'Mão na massa', 6, 6); } else { this.spend(250); this.need('calma', -10); this.need('ambiente', -15); this.toast('Piorou o vazamento. Encanador de emergência: R$ 250.', 'bad'); } } },
        { label: 'Ignorar por enquanto', fn: () => { this.need('ambiente', -15); this.need('calma', -6); this.addMoodlet('leak', 'Casa alagando', -5, 10); } }] }); break;
      case 'neighbor': ev.call(this.ui, { title: '🔊 Vizinho com som alto', emoji: '😤', text: 'O vizinho do lado está ouvindo música altíssima e já passa das 22h.', choices: [
        { label: 'Pedir educadamente para baixar', fn: () => { if (Math.random() < 0.6) { this.toast('O vizinho baixou o volume. 🙏', 'good'); } else { this.need('calma', -8); this.toast('Ele não gostou... discussão chata.', 'bad'); } } },
        { label: 'Aguentar de boa', fn: () => { this.need('calma', -6); this.addMoodlet('noise', 'Barulho do vizinho', -5, 6); } }] }); break;
      case 'mom': ev.call(this.ui, { title: '📱 Mãe ligando', emoji: '👵', text: 'Mamãe: "Filho, faz tempo que você não liga! Como estão as coisas?"', choices: [
        { label: 'Atender e conversar (20 min)', fn: () => { this.need('social', 20); this.need('calma', 5); this.pass(20); this.toast('Bom bate-papo com a mamãe. ❤️', 'good'); } },
        { label: 'Ignorar', fn: () => { this.addMoodlet('guilt', 'Culpa por ignorar a mãe', -5, 12); } }] }); break;
      case 'praise': ev.call(this.ui, { title: '💼 Elogio do chefe', emoji: '👏', text: 'O chefe mandou mensagem: "Excelente trabalho hoje! Vou te dar um bônus."', choices: [{ label: 'Agradecer (+R$ 150)', fn: () => { s.money += 150; this.addMoodlet('praise', 'Reconhecimento no trabalho', 10, 24); } }] }); break;
      case 'lucia_knock': ev.call(this.ui, { title: '🚪 Dona Lúcia bateu na porta', emoji: '👵', text: 'Dona Lúcia: "O aluguel está atrasado, meu querido. Preciso receber."', choices: [
        { label: `Pagar agora (${fmt(s.bills.rentAmt)})`, fn: () => { if (!this.pay('rent')) this.toast('Você não tem dinheiro suficiente...', 'bad'); } },
        { label: 'Pedir mais uns dias', fn: () => { const l = this.npcs.lucia; if (l.rel > 45) { l.rel -= 3; this.toast('Dona Lúcia concordou, mas está de olho.'); } else { l.mod -= 8; this.need('calma', -8); this.toast('Dona Lúcia ficou irritada.', 'bad'); } } }] }); break;
    }
  }
  pass(mins) { this.inFF = true; for (let i = 0; i < mins; i++) { this.tickMinute(); if (this.s.over) break; } this.inFF = false; }

  // ====================== autonomia (piloto automático) ======================
  autoShop() {
    const i = this.s.inv, cart = {}; let budget = this.s.money - 250 - (this.s.bills.rentDue ? this.s.bills.rentAmt : 0);
    const want = [['mantimentos', i.mantimentos < 3, 2], ['kit', i.kit < 2, 1], ['limpeza', i.limpeza < 1, 1], ['agua', i.agua < 2, 3], ['lanche', i.lanche < 1, 2]];
    for (const [k, need, q] of want) if (need) { let n = q; while (n > 0 && ITEMS[k].price * n > budget) n--; if (n > 0) { cart[k] = n; budget -= ITEMS[k].price * n; } }
    if (Object.keys(cart).length) this.buyItems(cart);
  }
  findAct(id) {
    const tryT = t => { for (const a of this.actionsFor(t)) if (a.id === id && !this.canDo(a)) return { t, a }; return null; };
    for (const o of Object.values(this.world.objs)) { if (o.hidden || !o.type) continue; const r = tryT({ kind: 'obj', obj: o }); if (r) return r; }
    return null;
  }
  findPhone(id) { for (const a of this.phoneActions()) if (a.id === id && !this.canDo(a)) return a; return null; }
  autoDecide() {
    const s = this.s, n = s.needs, h = this.hour, go = id => { const r = this.findAct(id); if (r) { this.perform(r.t, r.a); return true; } return false; };
    if (s.job.employed && this.isWorkday && !s.job.workedToday && h >= 7.9 && h < 15 && n.energia > 20 && n.fome > 12 && go('work')) return;
    if (!s.job.employed && h > 9 && h < 19 && n.energia > 30 && go('jobhunt')) return;
    if (n.banheiro < 25 && go('wc')) return;
    if (n.fome < 40) { if (go('cook') || go('marmita') || go('lanche')) return; if (!this.cur && this.isOpen([7, 22]) && s.money >= 30 && go('shop')) { return; } }
    if (n.sede < 45 && (go('agua') || go('torneira'))) return;
    if (n.energia < 18 || (h >= 22.5 && n.energia < 85)) { if (go('sleep')) return; if (go('nap')) return; }
    if (n.higiene < 35 && go('banho')) return;
    if (s.bills.rentDue && s.money > s.bills.rentAmt + 100 && h > 9 && h < 22) { this.autoPay = 'rent'; if (go('bills')) return; }
    if (s.bills.utilDue && s.money > s.bills.utilAmt + 100 && h > 9 && h < 22 && go('bills')) return;
    if (s.inv.mantimentos < 1 && s.inv.lanche < 1 && s.money > 120 && this.isOpen([7, 22]) && go('shop')) return;
    if (n.ambiente < 30 && go('clean')) return;
    if (n.romance < 40 && !s.flags.broke && h > 18 && h < 22.5 && this.findPhone('call')) { const a = this.findPhone('call'); this.perform({ kind: 'phone' }, a); return; }
    if (n.social < 30 && go('net')) return;
    if (n.diversao < 35 && (go('game') || go('tv') || go('read') || go('net'))) return;
    if (n.calma < 35 && (go('walk') || go('rest'))) return;
    if (n.energia < 45 && h >= 21 && go('sleep')) return;
  }

  // ====================== persistência ======================
  save() {
    if (this.s.over) return;
    try {
      const npcs = {}; for (const id in this.npcs) { const n = this.npcs[id]; npcs[id] = { rel: n.rel, mod: n.mod, needs: n.needs, loc: n.dest || n.loc, barDay: n.barDay, visit: n.visit, cooldown: n.cooldown || 0 }; }
      const p = this.player;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ s: { ...this.s, log: this.s.log.slice(0, 40) }, npcs, p: { x: p.cx, z: p.cz }, speed: this.speed, auto: this.autonomy, shirt: this.shirtColor }));
    } catch (e) { /* sem armazenamento */ }
  }
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ok */ } }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
      const d = JSON.parse(raw); this.s = { ...newState(), ...d.s, job: { ...newState().job, ...d.s.job }, bills: { ...newState().bills, ...d.s.bills }, flags: { ...newState().flags, ...d.s.flags }, inv: { ...newState().inv, ...d.s.inv }, needs: { ...newState().needs, ...d.s.needs } };
      this.tasks = []; this.cur = null; this.insideId = null; this.present = {};
      this.player.visible = true; this.player.setPos(d.p.x + 0.5, d.p.z + 0.5);
      if (!this.world.nav.ok(d.p.x, d.p.z)) { const f = this.world.nav.nearestFree(d.p.x, d.p.z); this.player.setPos(f[0] + 0.5, f[1] + 0.5); }
      if (d.shirt) { this.shirtColor = d.shirt; setShirt(this.player.c, d.shirt); }
      for (const id in d.npcs) {
        const n = this.npcs[id], sv = d.npcs[id]; if (!n) continue;
        Object.assign(n, { rel: sv.rel, mod: sv.mod, needs: sv.needs, barDay: sv.barDay, visit: sv.visit, cooldown: sv.cooldown });
        n.dest = null; n.busy = false;
        const loc = sv.loc === 'travel' ? 'away' : sv.loc; n.loc = loc;
        n.walker.stop();
        if (['away', 'julia_home', 'lucia_home', 'office', 'bar', 'market'].includes(loc)) { n.walker.visible = false; if (loc !== 'away') this.pres(loc).add(id); }
        else { const t = this.npcTarget(n, loc); n.walker.setPos(t[0] + 0.5, t[1] + 0.5); n.walker.visible = true; }
      }
      this.speed = d.speed || 1; this.autonomy = !!d.auto;
      this.moodVal = 60; this.syncWorld(); return true;
    } catch (e) { console.warn('load falhou', e); return false; }
  }
  newGame(clear = true) {
    if (clear) Sim.clearSave(); this.s = newState(); this.tasks = []; this.cur = null; this.insideId = null; this.present = {};
    this.player.visible = true; this.player.seated = false; this.player.seatY = null; this.player.setPos(APT.ox + 12.5, APT.oz + 9.5);
    for (const id in this.npcs) { const n = this.npcs[id]; n.loc = 'away'; n.dest = null; n.busy = false; n.visit = null; n.rel = n.def.rel; n.mod = 0; n.walker.visible = false; n.needs = { fome: 70, energia: 80, social: 60, diversao: 60, calma: 65 }; }
    for (const id in this.npcs) {
      const n = this.npcs[id], g = this.npcGoal(n), ob = this.world.objs[g];
      if (ob && ob.kind === 'building') { n.loc = g; this.pres(g).add(id); }
      else if (g !== 'away') { n.loc = g; const t = this.npcTarget(n, g); n.walker.setPos(t[0] + 0.5, t[1] + 0.5); n.walker.visible = true; }
    }
    this.moodVal = 65; this.refillWants(); this.refillWants(); this.refillWants(); this.syncWorld();
    this.log('Você acordou no seu apartamento alugado. Mais um dia começa...', 'day');
  }
}
