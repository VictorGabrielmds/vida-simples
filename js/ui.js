import { NEEDS, NEED_ICON, NEED_LABEL, ITEMS, ITEM_QTY, FURNITURE, WEEKDAYS, NPC_DEFS, fmt, hhmm, clamp } from './data.js';
import { gfxPref, setGfxPref } from './world.js';
const GFX_LABEL = { auto: 'Automático', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const col = v => (v < 20 ? 'var(--bad)' : v < 45 ? 'var(--warn)' : 'var(--good)');

export class UI {
  constructor(sim) {
    this.sim = sim; sim.ui = this;
    this.root = $('#ui'); this.tab = 'pessoas'; this.lastHtml = {};
    this.root.innerHTML = `
      <div id="topbar">
        <div class="chip" id="clock">--</div>
        <div class="chip" id="money">R$ 0</div>
        <div class="chip emo" id="emo">🙂</div>
        <div class="grow"></div>
        <div class="speeds" id="speeds"><button data-s="0" title="Pausar (espaço)">⏸</button><button data-s="1">1×</button><button data-s="3">3×</button><button data-s="8">8×</button><button data-s="20">20×</button></div>
        <label class="chip tgl" title="O personagem toma decisões sozinho"><input type="checkbox" id="auto"> 🤖<span class="lbl"> Autonomia</span></label>
        <label class="chip tgl" title="Acelera sozinho durante ações longas"><input type="checkbox" id="accel" checked> ⏩<span class="lbl"> Acelerar</span></label>
        <button class="chip btn" id="mapBtn" title="Ver o bairro inteiro (M)">🗺️<span class="lbl"> Mapa</span></button>
        <button class="chip btn mobonly" id="statBtn">📊</button>
        <button class="chip btn" id="phoneBtn" title="Celular (P)">📱<span class="lbl"> Celular</span></button>
        <button class="chip btn" id="soundBtn" title="Som ambiente">🔊</button>
        <button class="chip btn" id="menuBtn">☰</button>
      </div>
      <div id="left" class="panel"></div>
      <div id="right" class="panel"><div class="tabs" id="tabs">
        <button data-t="pessoas">👥 Pessoas</button><button data-t="perfil">📋 Perfil</button><button data-t="diario">📖 Diário</button></div><div id="tabBody"></div></div>
      <div id="actionbar"></div>
      <div id="hint">Clique em objetos, prédios e pessoas • Arraste: mover • Roda: zoom • Q/E: girar • M: mapa • Espaço: pausar<br><span class="osm">Mapa: São Francisco, São Luís/MA • dados © OpenStreetMap contributors</span></div>
      <div id="menu" class="popup hidden"></div>
      <div id="toasts"></div>
      <div id="tooltip" class="hidden"></div>
      <div id="modal" class="hidden"><div class="box"></div></div>`;
    this.tabs = $('#tabs'); this.tabBody = $('#tabBody');
    this.tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { this.tab = b.dataset.t; this.refreshTabs(); this.lastHtml = {}; this.updateTab(true); } });
    $('#speeds').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.setSpeed(+b.dataset.s); });
    $('#auto').addEventListener('change', e => { sim.autonomy = e.target.checked; this.toast(sim.autonomy ? '🤖 Autonomia ligada: o personagem decide sozinho.' : 'Autonomia desligada.'); });
    $('#accel').addEventListener('change', e => { sim.autoAccel = e.target.checked; });
    $('#phoneBtn').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); this.openPhone(r.left, r.bottom + 6); });
    $('#menuBtn').addEventListener('click', () => this.systemMenu());
    $('#statBtn').addEventListener('click', () => { $('#left').classList.toggle('show'); });
    $('#mapBtn').addEventListener('click', () => sim.world.toggleMap());
    $('#soundBtn').addEventListener('click', () => { if (!this.sound) return; const on = this.sound.toggle(); $('#soundBtn').textContent = on ? '🔊' : '🔇'; });
    this.root.addEventListener('click', e => { if (e.target.closest('button') && e.target.id !== 'soundBtn' && this.sound) { this.sound.ensure(); this.sound.click(); } });
    this.refreshTabs(); this.setSpeed(1);
    this.leftBuilt = false;
  }
  setSound(s) { this.sound = s; $('#soundBtn').textContent = s.on ? '🔊' : '🔇'; }
  setSpeed(s) {
    const sim = this.sim;
    if (s === 0) sim.paused = !sim.paused; else { sim.paused = false; sim.speed = s; }
    this.refreshSpeed();
  }
  refreshSpeed() { const sim = this.sim; document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', sim.paused ? +b.dataset.s === 0 : +b.dataset.s === sim.speed)); }
  refreshTabs() { this.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === this.tab)); }

  // ---------- toasts & menus ----------
  toast(msg, cls = '') {
    const t = el('div', 'toast ' + cls, msg); $('#toasts').appendChild(t);
    if (this.sound) { if (cls === 'good') this.sound.good(); else if (cls === 'warn' || cls === 'bad') this.sound.warn(); }
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 4200); setTimeout(() => t.remove(), 4700);
  }
  logChanged() { this.lastHtml.diario = null; }
  hideMenu() { $('#menu').classList.add('hidden'); }
  menu(title, sub, items, x, y) {
    const m = $('#menu'); m.innerHTML = '';
    m.appendChild(el('div', 'mh', `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`));
    if (!items.length) m.appendChild(el('div', 'mi dis', '<span>Nada para fazer aqui agora.</span>'));
    for (const it of items) {
      const row = el('div', 'mi' + (it.reason ? ' dis' : ''));
      row.innerHTML = `<span class="ic">${it.icon}</span><span class="tx"><b>${it.label}</b><small>${it.reason ? '🚫 ' + it.reason : it.sub}</small></span>`;
      if (!it.reason) row.addEventListener('click', () => { this.sound && this.sound.click(); it.fn(); });
      m.appendChild(row);
    }
    m.classList.remove('hidden');
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + 'px'; m.style.top = Math.max(50, Math.min(window.innerHeight - h - 8, y)) + 'px';
  }
  fxText(def) {
    const parts = [];
    const add = (k, v) => { if (Math.abs(v) >= 1 && NEED_ICON[k]) parts.push(`${NEED_ICON[k]}${v > 0 ? '+' : ''}${Math.round(v)}`); };
    for (const k in def.fx) add(k, def.fx[k]);
    if (def.rate) for (const k in def.rate) add(k, def.rate[k] * Math.min(def.mins, 480));
    if (def.cost) parts.unshift(`💰-${def.cost}`);
    const mins = def.sleep ? 'até acordar' : def.mins >= 60 ? `${(def.mins / 60).toFixed(def.mins % 60 ? 1 : 0)}h` : `${def.mins}min`;
    return `${def.id === 'work' ? 'até 18h' : def.id === 'work2' ? 'até 16h' : mins} · ${parts.join(' ')}`;
  }
  openFor(target, x, y) {
    const sim = this.sim; let title, sub = '';
    if (target.kind === 'npc') { const n = sim.npcs[target.id], e = sim.npcEmotion(n); title = `${n.def.emoji} ${n.def.name}`; sub = `${e.emoji} ${e.label} • relação ${Math.round(n.rel)}%`; }
    else { title = target.obj.name; if (target.obj.hours) sub = `${target.obj.icon || ''} ${sim.isOpen(target.obj.hours) ? 'aberto' : 'fechado'} (${target.obj.hours[0]}h–${target.obj.hours[1] === 24 ? '24' : target.obj.hours[1]}h)`; }
    const acts = sim.actionsFor(target).map(a => ({ icon: a.icon, label: a.label, sub: this.fxText(a), reason: sim.canDo(a), fn: () => sim.perform(target, a) }));
    if (target.kind === 'obj' && target.obj.type !== 'decor' && target.obj.approach) acts.push({ icon: '🚶', label: 'Ir até lá', sub: '', reason: null, fn: () => { this.hideMenu(); sim.clickWalk(target.obj.approach[0], target.obj.approach[1]); } });
    this.menu(title, sub, acts, x, y);
  }
  openPhone(x, y) {
    const sim = this.sim;
    const acts = sim.phoneActions().map(a => ({ icon: a.icon, label: a.label, sub: this.fxText(a), reason: sim.canDo(a), fn: () => sim.perform({ kind: 'phone' }, a) }));
    this.menu('📱 Celular', 'Júlia, família e delivery', acts, x, y);
  }
  systemMenu() {
    const sim = this.sim, r = $('#menuBtn').getBoundingClientRect();
    this.menu('Menu', '', [
      { icon: '💾', label: 'Salvar agora', sub: 'O jogo também salva a cada dia', fn: () => { sim.save(); this.hideMenu(); this.toast('Jogo salvo 💾'); } },
      { icon: '🎨', label: `Gráficos: ${GFX_LABEL[gfxPref()]}`, sub: `Agora: ${sim.world.Q.label} · resolução ${Math.round(sim.world.dpr * 100)}%`, fn: () => { this.hideMenu(); this.graphicsMenu(r); } },
      { icon: '❓', label: 'Como jogar', sub: '', fn: () => { this.hideMenu(); this.help(); } },
      { icon: '🔄', label: 'Novo jogo', sub: 'Apaga o progresso salvo', fn: () => { this.hideMenu(); this.confirm('Começar um novo jogo? O progresso salvo será apagado.', () => { sim.newGame(); this.toast('Novo jogo iniciado!'); }); } },
    ], r.left - 200, r.bottom + 6);
  }
  graphicsMenu(r) {
    const cur = gfxPref(), pick = v => { if (v === cur) return; setGfxPref(v); this.sim.save(); try { sessionStorage.setItem('vida-simples-continuar', '1'); } catch (e) { /* ok */ } location.reload(); };
    const opt = (v, icon, sub) => ({ icon, label: `${GFX_LABEL[v]}${v === cur ? '  ✓' : ''}`, sub, fn: () => pick(v) });
    this.menu('🎨 Qualidade gráfica', 'O jogo salva e recarrega para aplicar', [
      opt('auto', '✨', 'Recomendado: ajusta a resolução sozinho'),
      opt('alto', '🌟', 'Sombras suaves e brilho noturno (bloom)'),
      opt('medio', '⚖️', 'Sombras normais, sem bloom'),
      opt('baixo', '🐢', 'Sem sombras, menos carros, mais leve'),
    ], r.left - 200, r.bottom + 6);
  }

  // ---------- modais ----------
  modal(html, buttons = [], opts = {}) {
    const m = $('#modal'), box = m.querySelector('.box'); box.innerHTML = html;
    const bar = el('div', 'btns'); buttons.forEach(b => { const x = el('button', 'mbtn ' + (b.cls || ''), b.label); x.addEventListener('click', () => { if (b.keep !== true) this.closeModal(); b.fn && b.fn(); }); bar.appendChild(x); }); box.appendChild(bar);
    if (!this.modalIsOpen) { this.sim.modalOpen++; this.modalIsOpen = true; }
    m.classList.remove('hidden'); this.hideMenu(); return box;
  }
  closeModal() { $('#modal').classList.add('hidden'); if (this.modalIsOpen) { this.sim.modalOpen = Math.max(0, this.sim.modalOpen - 1); this.modalIsOpen = false; } }
  confirm(text, ok) { this.modal(`<h2>Confirmar</h2><p>${text}</p>`, [{ label: 'Cancelar' }, { label: 'Confirmar', cls: 'pri', fn: ok }]); }
  help() {
    this.modal(`<h2>Como jogar</h2><div class="help">
      <p>Você controla um personagem comum em uma vida comum: mora num <b>apartamento alugado</b>, trabalha, namora a <b>Júlia</b> e precisa dar conta das <b>necessidades</b> do dia a dia.</p>
      <ul><li><b>Clique</b> em um objeto, prédio, pessoa ou no parque para ver as ações. Clique no chão para andar.</li>
      <li>Mantenha as <b>necessidades</b> em dia (barras à esquerda). Se zerarem, sua saúde e humor sofrem.</li>
      <li><b>Trabalhe</b> de segunda a sexta (7h–17h para chegar). O salário cai no <b>dia 5</b>; aluguel vence <b>dia 10</b>; contas <b>dia 15</b>; mêsversário da Júlia <b>dia 20</b> 💞.</li>
      <li>As <b>emoções</b> vêm das necessidades e de "moodlets" (fatos recentes). Pessoas também têm humor: converse, elogie, apoie, presenteie.</li>
      <li>Cumpra <b>desejos</b> para ganhar bônus de humor.</li>
      <li><b>Câmera:</b> arraste = mover, roda = zoom, Q/E = girar, C = recentralizar. Velocidade: 1–4, espaço pausa.</li>
      <li>Ative <b>🤖 Autonomia</b> para ver o personagem viver sozinho.</li></ul></div>`, [{ label: 'Entendi!', cls: 'pri' }]);
  }
  shopModal() {
    const sim = this.sim, cart = {}; const items = Object.entries(ITEMS).filter(([, v]) => !v.noShop);
    const box = this.modal('', [{ label: 'Sair', fn: () => { } }, { label: 'Pagar', cls: 'pri', keep: true, fn: () => { if (sim.buyItems(cart)) { this.closeModal(); } } }]);
    const draw = () => {
      const total = items.reduce((s, [k, v]) => s + v.price * (cart[k] || 0), 0);
      box.querySelector('.shop').innerHTML = `<div class="money">Saldo: <b>${fmt(sim.s.money)}</b> • Total: <b>${fmt(total)}</b></div>` + items.map(([k, v]) => `<div class="row"><span class="ic">${v.icon}</span><span class="tx"><b>${v.label}</b><small>${v.desc} • você tem ${Math.floor(sim.s.inv[k] || 0)}</small></span><span class="pr">${fmt(v.price)}</span><button data-k="${k}" data-d="-1">−</button><b class="q">${cart[k] || 0}</b><button data-k="${k}" data-d="1">+</button></div>`).join('');
    };
    box.insertAdjacentHTML('afterbegin', '<h2>🛒 Mercadinho</h2><div class="shop"></div>'); draw();
    box.querySelector('.shop').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; cart[k] = Math.max(0, (cart[k] || 0) + +b.dataset.d); draw(); });
  }
  billsModal() {
    const sim = this.sim, b = sim.s.bills;
    const draw = () => {
      const box = $('#modal .box .bl'); if (!box) return;
      box.innerHTML = `<div class="money">Saldo: <b>${fmt(sim.s.money)}</b></div>` +
        `<div class="row"><span class="ic">🏠</span><span class="tx"><b>Aluguel</b><small>${b.rentDue ? `Vencido há ${b.rentLate} dia(s)` : 'Em dia (vence dia 10)'}</small></span><span class="pr">${b.rentDue ? fmt(b.rentAmt) : '—'}</span><button data-p="rent" ${b.rentDue && sim.s.money >= b.rentAmt ? '' : 'disabled'}>Pagar</button></div>` +
        `<div class="row"><span class="ic">💡</span><span class="tx"><b>Luz, água e internet</b><small>${b.utilDue ? `Vencida há ${b.utilLate} dia(s)` : 'Em dia (vence dia 15)'}</small></span><span class="pr">${b.utilDue ? fmt(b.utilAmt) : '—'}</span><button data-p="util" ${b.utilDue && sim.s.money >= b.utilAmt ? '' : 'disabled'}>Pagar</button></div>`;
    };
    const box = this.modal('<h2>💳 Contas</h2><div class="bl"></div>', [{ label: 'Fechar', cls: 'pri' }]); draw();
    box.querySelector('.bl').addEventListener('click', e => { const t = e.target.closest('button'); if (t && sim.pay(t.dataset.p)) draw(); });
  }
  furnModal() {
    const sim = this.sim;
    const draw = () => {
      const box = $('#modal .box .fl'); if (!box) return;
      box.innerHTML = `<div class="money">Saldo: <b>${fmt(sim.s.money)}</b></div>` + Object.entries(FURNITURE).map(([k, f]) => `<div class="row"><span class="ic">${f.icon}</span><span class="tx"><b>${f.label}</b><small>${f.desc}</small></span><span class="pr">${fmt(f.price)}</span>${sim.s.owned[k] ? '<em>comprado</em>' : `<button data-k="${k}" ${sim.s.money >= f.price ? '' : 'disabled'}>Comprar</button>`}</div>`).join('');
    };
    const box = this.modal('<h2>🛋️ Loja online</h2><div class="fl"></div>', [{ label: 'Fechar', cls: 'pri' }]); draw();
    box.querySelector('.fl').addEventListener('click', e => { const t = e.target.closest('button'); if (t && sim.buyFurniture(t.dataset.k)) draw(); });
  }
  eventModal(ev) {
    const buttons = ev.choices.map((c, i) => ({ label: c.label, cls: i === 0 ? 'pri' : '', fn: c.fn }));
    this.modal(`<div class="ev"><div class="bigemo">${ev.emoji}</div><h2>${ev.title}</h2><p>${ev.text}</p></div>`, buttons);
  }
  gameOver(msg) {
    this.modal(`<div class="ev"><div class="bigemo">🏚️</div><h2>Fim de jogo</h2><p>${msg}</p><p class="mut">Você sobreviveu ${this.sim.s.day} dia(s).</p></div>`, [{ label: 'Jogar de novo', cls: 'pri', fn: () => { this.sim.newGame(); } }]);
  }

  // ---------- painéis ----------
  buildLeft() {
    const L = $('#left');
    L.innerHTML = `<div class="who"><div class="face" id="face">🙂</div><div><b id="emoName">Tranquilo</b><small id="moodTxt"></small></div></div>
      <div class="mood"><div class="bar"><i id="moodBar"></i></div></div>
      <h3>Necessidades</h3><div id="needs">${NEEDS.map(n => `<div class="need" data-n="${n.id}" title="${n.label}"><span>${n.icon}</span><div class="bar"><i></i></div><em>0</em></div>`).join('')}</div>
      <div class="need health" title="Saúde"><span>🩺</span><div class="bar"><i id="hpBar"></i></div><em id="hpTxt">100</em></div>
      <h3>Humor (moodlets)</h3><div id="moodlets"></div>
      <h3>Desejos ✨</h3><div id="wants"></div>`;
    this.leftBuilt = true; this.needEls = {}; L.querySelectorAll('.need[data-n]').forEach(e => { this.needEls[e.dataset.n] = { bar: e.querySelector('i'), num: e.querySelector('em') }; });
  }
  refreshTabContent(force) { this.updateTab(force); }
  update() {
    const sim = this.sim, s = sim.s;
    if (!this.leftBuilt) this.buildLeft();
    const bills = (s.bills.rentDue ? ' 🏠!' : '') + (s.bills.utilDue ? ' 💡!' : '');
    $('#clock').textContent = `${WEEKDAYS[sim.weekday]}, ${sim.date} ${sim.monthName.slice(0, 3)} • ${hhmm(s.min)} ${sim.hour >= 6 && sim.hour < 18 ? '☀️' : '🌙'}`;
    $('#money').innerHTML = `${fmt(s.money)}<small>${bills}</small>`; $('#money').classList.toggle('neg', s.money < 0);
    const emo = sim.emotion; $('#emo').textContent = emo.emoji; $('#face').textContent = emo.emoji; $('#emoName').textContent = emo.label;
    $('#moodTxt').textContent = `Humor ${Math.round(sim.moodVal)}% • ${sim.moodletSum >= 0 ? '+' : ''}${Math.round(sim.moodletSum)} de moodlets`;
    const mb = $('#moodBar'); mb.style.width = sim.moodVal + '%'; mb.style.background = col(sim.moodVal);
    for (const n of NEEDS) { const e = this.needEls[n.id], v = s.needs[n.id]; e.bar.style.width = v + '%'; e.bar.style.background = col(v); e.num.textContent = Math.round(v); }
    $('#hpBar').style.width = s.health + '%'; $('#hpBar').style.background = col(s.health); $('#hpTxt').textContent = Math.round(s.health);
    const ml = s.moodlets.map(m => `<div class="ml ${m.val >= 0 ? 'pos' : 'neg'}"><span>${m.label}</span><b>${m.val > 0 ? '+' : ''}${Math.round(m.val)}</b></div>`).join('') || '<small class="mut">Nada de especial no momento.</small>';
    this.setHtml('#moodlets', ml);
    this.setHtml('#wants', s.wants.map(w => `<div class="want ${w.done ? 'done' : ''}">${w.done ? '✅' : '⭐'} ${w.text}</div>`).join('') || '<small class="mut">Sem desejos por agora.</small>');
    this.updateActionBar(); this.updateTab();
    if (!this.lastSpeedSync || this.lastSpeedSync !== sim.speed + '|' + sim.paused) { this.lastSpeedSync = sim.speed + '|' + sim.paused; this.refreshSpeed(); }
    $('#auto').checked = sim.autonomy;
  }
  setHtml(sel, html) { if (this.lastHtml[sel] !== html) { this.lastHtml[sel] = html; $(sel).innerHTML = html; } }
  updateActionBar() {
    const sim = this.sim, c = sim.cur, bar = $('#actionbar');
    let html;
    if (c) {
      let pct = (1 - c.left / c.total) * 100;
      if (c.def.sleep) pct = sim.s.needs.energia;
      html = `<span class="ic">${c.def.icon}</span><div class="ab"><b>${c.def.label}</b><div class="bar"><i style="width:${clamp(pct)}%"></i></div></div><button id="cancelAct">Cancelar</button>`;
    } else if (sim.tasks.length || sim.player.moving) {
      const t = sim.tasks.find(x => x.t === 'act');
      html = `<span class="ic">🚶</span><div class="ab"><b>${t ? 'Indo: ' + t.def.label : 'Andando...'}</b><small>${sim.insideId ? 'dentro de um prédio' : ''}</small></div><button id="cancelAct">Parar</button>`;
    } else html = `<span class="ic">🧍</span><div class="ab"><b>Livre</b><small>${sim.autonomy ? '🤖 decidindo...' : 'Clique em algo no mundo'}</small></div>`;
    if (this.lastHtml.ab !== html) { this.lastHtml.ab = html; bar.innerHTML = html; const b = $('#cancelAct'); if (b) b.addEventListener('click', () => sim.cancelAction(false)); }
  }
  updateTab(force) {
    const sim = this.sim, s = sim.s; let html = '';
    if (this.tab === 'pessoas') {
      html = Object.values(sim.npcs).map(n => {
        const e = sim.npcEmotion(n);
        return `<div class="person"><div class="pf">${e.emoji}</div><div class="pi"><b>${n.def.name}</b><small>${n.def.role} • ${e.label} • ${sim.locLabel(n)}</small>
        <div class="mini"><span title="Humor">😊</span><div class="bar"><i style="width:${Math.round(n.mood)}%;background:${col(n.mood)}"></i></div></div>
        <div class="mini"><span title="Relação com você">🤝</span><div class="bar"><i style="width:${Math.round(n.rel)}%;background:var(--pink)"></i></div></div></div></div>`;
      }).join('') + (s.flags.broke ? '<p class="mut">💔 Você e a Júlia terminaram.</p>' : '');
    } else if (this.tab === 'perfil') {
      const sk = s.skills, j = s.job, b = s.bills;
      html = `<div class="kv"><h4>💼 Trabalho</h4>
        <p>${j.employed ? `Escritório • diária <b>${fmt(j.wage)}</b> • nível ${j.level}` : '<b class="neg">Desempregado</b> (procure vagas no computador)'}</p>
        <p>🥟 Fábrica de salgados (sáb/dom): diária <b>${fmt(s.job2.wage)}</b></p>
        <p>A receber no dia 5: <b>${fmt(j.pending)}</b></p><p>Advertências: <b>${j.warnings}/3</b> • Faltas no mês: <b>${j.absences}/3</b></p>
        <h4>📈 Habilidades</h4>
        <p>🍳 Culinária <b>${Math.floor(sk.culinaria)}</b> • 💪 Forma física <b>${Math.floor(sk.forma)}</b> • 📊 Carreira <b>${Math.floor(sk.carreira)}</b></p>
        <h4>🧾 Contas</h4>
        <p>🏠 Aluguel: ${b.rentDue ? `<b class="neg">${fmt(b.rentAmt)} (atrasado ${b.rentLate}d)</b>` : 'em dia'}</p>
        <p>💡 Luz/água/net: ${b.utilDue ? `<b class="neg">${fmt(b.utilAmt)} (atrasado ${b.utilLate}d)</b>` : 'em dia'}</p>
        <h4>🎒 Mochila / casa</h4>
        <p>${Object.entries(s.inv).filter(([, v]) => v >= 1).map(([k, v]) => `${ITEMS[k].icon} ${ITEMS[k].label}: <b>${Math.floor(v)}</b>`).join(' • ') || 'vazio'}</p>
        <p class="mut">Desejos realizados: ${s.wantsDone} • Dias de vida: ${s.day}</p></div>`;
    } else {
      html = s.log.map(l => `<div class="lg ${l.cls}"><time>${l.t}</time> ${l.msg}</div>`).join('') || '<small class="mut">Nada aconteceu ainda.</small>';
    }
    const key = 'tab' + this.tab;
    if (force || this.lastHtml[key] !== html) { this.lastHtml[key] = html; this.tabBody.innerHTML = html; }
  }
  tooltip(text, x, y) {
    const t = $('#tooltip'); if (!text) { t.classList.add('hidden'); return; }
    t.textContent = text; t.classList.remove('hidden'); t.style.left = x + 14 + 'px'; t.style.top = y + 14 + 'px';
  }
}
