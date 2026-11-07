// Grade de navegação (1 célula = 1 metro) + A* em janela com caminho suavizado
export class Nav {
  constructor(w, h) { this.w = w; this.h = h; this.blocked = new Uint8Array(w * h); this.cap = 0; }
  inb(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  ok(x, z) { return this.inb(x, z) && !this.blocked[z * this.w + x]; }
  block(x, z, w = 1, d = 1, v = 1) {
    for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) if (this.inb(i, j)) this.blocked[j * this.w + i] = v;
  }
  nearestFree(x, z, maxR = 40) {
    x = Math.floor(x); z = Math.floor(z);
    if (this.ok(x, z)) return [x, z];
    for (let r = 1; r < maxR; r++)
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
        if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.ok(x + dx, z + dz)) return [x + dx, z + dz];
    return null;
  }
  // bloqueia bolsões livres que não se ligam à rede de ruas (quintais fechados etc.)
  pruneUnreachable(sx, sz) {
    const W = this.w, N = W * this.h, B = this.blocked, seen = new Uint8Array(N), q = new Int32Array(N);
    let h = 0, t = 0; const s0 = sz * W + sx; if (B[s0]) return 0;
    seen[s0] = 1; q[t++] = s0;
    while (h < t) {
      const i = q[h++], x = i % W;
      if (x > 0 && !seen[i - 1] && !B[i - 1]) { seen[i - 1] = 1; q[t++] = i - 1; }
      if (x < W - 1 && !seen[i + 1] && !B[i + 1]) { seen[i + 1] = 1; q[t++] = i + 1; }
      if (i >= W && !seen[i - W] && !B[i - W]) { seen[i - W] = 1; q[t++] = i - W; }
      if (i < N - W && !seen[i + W] && !B[i + W]) { seen[i + W] = 1; q[t++] = i + W; }
    }
    let pruned = 0;
    for (let i = 0; i < N; i++) if (!B[i] && !seen[i]) { B[i] = 2; pruned++; }
    return pruned;
  }
  ensure(n) {
    if (n <= this.cap) return;
    this.cap = n; this.gS = new Float32Array(n); this.from = new Int32Array(n); this.st = new Uint8Array(n);
  }
  find(sx, sz, gx, gz) {
    const s = this.nearestFree(sx, sz), g = this.nearestFree(gx, gz);
    if (!s || !g) return null;
    if (s[0] === g[0] && s[1] === g[1]) return [[g[0] + 0.5, g[1] + 0.5]];
    for (const pad of [40, 220]) {
      const x0 = Math.max(0, Math.min(s[0], g[0]) - pad), z0 = Math.max(0, Math.min(s[1], g[1]) - pad);
      const x1 = Math.min(this.w - 1, Math.max(s[0], g[0]) + pad), z1 = Math.min(this.h - 1, Math.max(s[1], g[1]) + pad);
      const p = this.astar(s, g, x0, z0, x1, z1);
      if (p) return this.smooth(p);
      if (x0 === 0 && z0 === 0 && x1 === this.w - 1 && z1 === this.h - 1) break;
    }
    return null;
  }
  astar(s, g, x0, z0, x1, z1) {
    const WW = x1 - x0 + 1, HH = z1 - z0 + 1, N = WW * HH, B = this.blocked, MW = this.w;
    this.ensure(N);
    const gS = this.gS, from = this.from, st = this.st; st.fill(0, 0, N);
    const hk = 1.5; // heurística levemente gulosa: muito mais rápida, caminho quase ótimo
    const hx = g[0] - x0, hz = g[1] - z0;
    const h = (x, z) => { const dx = Math.abs(x - hx), dz = Math.abs(z - hz); return hk * (dx + dz - 0.586 * Math.min(dx, dz)); };
    const hf = [], hi = [];
    const push = (f, i) => { hf.push(f); hi.push(i); let k = hf.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
    const pop = () => { const top = hi[0], lf = hf.pop(), li = hi.pop(); if (hf.length) { hf[0] = lf; hi[0] = li; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === k) break; [hf[m], hf[k]] = [hf[k], hf[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } } return top; };
    const sx = s[0] - x0, sz = s[1] - z0, si = sz * WW + sx, gi = hz * WW + hx;
    gS[si] = 0; st[si] = 1; from[si] = -1; push(h(sx, sz), si);
    const free = (x, z) => x >= 0 && z >= 0 && x < WW && z < HH && !B[(z + z0) * MW + x + x0];
    let found = false, iter = 0;
    while (hf.length) {
      const i = pop();
      if (st[i] === 2) continue; st[i] = 2;
      if (i === gi) { found = true; break; }
      if (++iter > 900000) break;
      const x = i % WW, z = (i / WW) | 0, gi0 = gS[i];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!free(nx, nz)) continue;
        if (dx && dz && (!free(x + dx, z) || !free(x, z + dz))) continue;
        const ni = nz * WW + nx; if (st[ni] === 2) continue;
        const c = gi0 + (dx && dz ? 1.4142 : 1);
        if (st[ni] === 0 || c < gS[ni]) { gS[ni] = c; from[ni] = i; st[ni] = 1; push(c + h(nx, nz), ni); }
      }
    }
    if (!found) return null;
    const path = []; let c = gi;
    while (c !== si && c >= 0) { path.push([(c % WW) + x0, ((c / WW) | 0) + z0]); c = from[c]; }
    path.push([s[0], s[1]]);
    return path.reverse();
  }
  // linha de visão na grade (com folga para o corpo do personagem)
  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) * 2);
    for (let k = 1; k < n; k++) {
      const x = ax + (dx * k) / n, z = az + (dz * k) / n;
      if (!this.ok(Math.floor(x - 0.3), Math.floor(z - 0.3)) || !this.ok(Math.floor(x + 0.3), Math.floor(z + 0.3)) || !this.ok(Math.floor(x - 0.3), Math.floor(z + 0.3)) || !this.ok(Math.floor(x + 0.3), Math.floor(z - 0.3))) return false;
    }
    return true;
  }
  smooth(cells) {
    const pts = cells.map(([x, z]) => [x + 0.5, z + 0.5]);
    const out = []; let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 80);
      while (j > i + 1 && !this.los(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
}
