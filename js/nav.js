// Grade de navegação + A*
export class Nav {
  constructor(w, h) { this.w = w; this.h = h; this.blocked = new Uint8Array(w * h); }
  inb(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  ok(x, z) { return this.inb(x, z) && !this.blocked[z * this.w + x]; }
  block(x, z, w = 1, d = 1, v = 1) {
    for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) if (this.inb(i, j)) this.blocked[j * this.w + i] = v;
  }
  nearestFree(x, z) {
    if (this.ok(x, z)) return [x, z];
    for (let r = 1; r < 10; r++)
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
        if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.ok(x + dx, z + dz)) return [x + dx, z + dz];
    return null;
  }
  find(sx, sz, gx, gz) {
    const s = this.nearestFree(sx, sz), g = this.nearestFree(gx, gz);
    if (!s || !g) return null;
    const W = this.w, N = W * this.h;
    const gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (x, z) => { const dx = Math.abs(x - g[0]), dz = Math.abs(z - g[1]); return dx + dz + (1.414 - 2) * Math.min(dx, dz); };
    const si = s[1] * W + s[0], gi = g[1] * W + g[0];
    gS[si] = 0; push(h(s[0], s[1]), si);
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue; closed[i] = 1;
      if (i === gi) break;
      const x = i % W, z = (i / W) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!this.ok(nx, nz)) continue;
        if (dx && dz && (!this.ok(x + dx, z) || !this.ok(x, z + dz))) continue;
        const ni = nz * W + nx, c = gS[i] + (dx && dz ? 1.414 : 1);
        if (c < gS[ni]) { gS[ni] = c; from[ni] = i; push(c + h(nx, nz), ni); }
      }
    }
    if (from[gi] < 0 && gi !== si) return null;
    const path = []; let c = gi;
    while (c !== si) { path.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]); c = from[c]; }
    return path.reverse();
  }
}
