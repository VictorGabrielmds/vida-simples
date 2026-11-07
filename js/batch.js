// Agrupa milhares de objetos repetidos em InstancedMesh por BLOCO da cidade.
// - De perto: um InstancedMesh por bloco (só os blocos visíveis são desenhados).
// - De longe (opção far): um único InstancedMesh para a cidade inteira, com geometria
//   opcionalmente mais simples. Assim a visão do mapa usa pouquíssimos "draw calls".
import * as THREE from 'three';

const _c = new THREE.Color();

export class Batch {
  constructor(size = 240) { this.size = size; this.kinds = new Map(); this.meshes = []; }
  kind(name, geo, material, o = {}) {
    this.kinds.set(name, { geo, material, cast: !!o.cast, receive: o.receive !== false, lod: o.lod || 0, order: o.order, far: o.far, farGeo: o.farGeo, chunks: new Map(), colored: false });
    return this;
  }
  add(name, m4, color) {
    const k = this.kinds.get(name), e = m4.elements;
    const key = Math.floor(e[12] / this.size) + ',' + Math.floor(e[14] / this.size);
    let c = k.chunks.get(key); if (!c) k.chunks.set(key, (c = { m: [], c: [] }));
    for (let i = 0; i < 16; i++) c.m.push(e[i]);
    if (color !== undefined) { _c.set(color); c.c.push(_c.r, _c.g, _c.b); k.colored = true; }
  }
  make(k, geo, m, c, group) {
    const n = m.length / 16, im = new THREE.InstancedMesh(geo, k.material, n);
    im.instanceMatrix.array.set(m); im.instanceMatrix.needsUpdate = true;
    if (k.colored) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c), 3);
    im.castShadow = k.cast; im.receiveShadow = k.receive; if (k.order !== undefined) im.renderOrder = k.order;
    im.computeBoundingSphere(); im.matrixAutoUpdate = false; im.updateMatrix();
    group.add(im); this.meshes.push(im); return im;
  }
  build(groups) {
    for (const k of this.kinds.values()) {
      for (const c of k.chunks.values()) this.make(k, k.geo, c.m, c.c, groups[k.lod]);
      if (k.far !== undefined) {
        const M = [], C = [];
        for (const c of k.chunks.values()) { for (const x of c.m) M.push(x); for (const x of c.c) C.push(x); }
        this.make(k, k.farGeo || k.geo, M, C, groups[k.far]);
      }
    }
    this.kinds.clear();
  }
}
