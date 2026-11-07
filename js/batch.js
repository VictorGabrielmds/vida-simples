// Agrupa milhares de objetos repetidos em InstancedMesh por BLOCO da cidade.
// Cada bloco tem sua própria esfera envolvente, então o Three.js só desenha
// (na cena e no mapa de sombras) os blocos que estão realmente visíveis.
import * as THREE from 'three';

const _c = new THREE.Color();

export class Batch {
  constructor(size = 240) { this.size = size; this.kinds = new Map(); this.meshes = []; }
  kind(name, geo, material, o = {}) {
    this.kinds.set(name, { geo, material, cast: !!o.cast, receive: o.receive !== false, lod: o.lod || 0, order: o.order, chunks: new Map(), colored: false });
    return this;
  }
  add(name, m4, color) {
    const k = this.kinds.get(name), e = m4.elements;
    const key = Math.floor(e[12] / this.size) + ',' + Math.floor(e[14] / this.size);
    let c = k.chunks.get(key); if (!c) k.chunks.set(key, (c = { m: [], c: [] }));
    for (let i = 0; i < 16; i++) c.m.push(e[i]);
    if (color !== undefined) { _c.set(color); c.c.push(_c.r, _c.g, _c.b); k.colored = true; }
  }
  build(groups) {
    for (const k of this.kinds.values()) for (const c of k.chunks.values()) {
      const n = c.m.length / 16, im = new THREE.InstancedMesh(k.geo, k.material, n);
      im.instanceMatrix.array.set(c.m); im.instanceMatrix.needsUpdate = true;
      if (k.colored) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c.c), 3);
      im.castShadow = k.cast; im.receiveShadow = k.receive; if (k.order !== undefined) im.renderOrder = k.order;
      im.computeBoundingSphere(); im.matrixAutoUpdate = false; im.updateMatrix();
      groups[k.lod].add(im); this.meshes.push(im);
    }
    this.kinds.clear();
  }
}
