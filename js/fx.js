// Efeitos visuais: ruído procedural, sombras de nuvens, água animada, texturas do chão, areia/espuma da orla
import * as THREE from 'three';

export const U = { uDay: { value: 1 }, uTime: { value: 0 }, uNoise: { value: null }, uCloudOff: { value: new THREE.Vector2() }, uCloudAmt: { value: 0.2 } };

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function valueNoise(S, cells, seed) {
  const r = rng(seed), g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(S * S), sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * cells, fy = (y / S) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const x1 = (ix + 1) % cells, y1 = (iy + 1) % cells;
    const a = g[iy * cells + ix], b = g[iy * cells + x1], c = g[y1 * cells + ix], d = g[y1 * cells + x1];
    out[y * S + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }
  return out;
}
export function noiseTexture() {
  const S = 256, a = valueNoise(S, 4, 1), b = valueNoise(S, 8, 2), c = valueNoise(S, 16, 3), d = valueNoise(S, 32, 4), e = valueNoise(S, 64, 5);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.min(255, (a[i] * 0.5 + b[i] * 0.28 + c[i] * 0.15 + d[i] * 0.07) * 255);
    data[i * 4 + 1] = Math.min(255, (c[i] * 0.3 + d[i] * 0.4 + e[i] * 0.3) * 255);
    data[i * 4 + 2] = Math.min(255, (a[i] * 0.6 + b[i] * 0.4) * 255);
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  U.uNoise.value = t; return t;
}

const WXZ_VERT = `#include <project_vertex>
{ vec4 wq = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  wq = instanceMatrix * wq;
#endif
  vWXZ = ( modelMatrix * wq ).xz; }`;

// Sombras de nuvens passando sobre a cidade (aplicado em todos os materiais Lambert)
export function patch(m) {
  if (!m || m.userData.fxPatched || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || (m.isMeshBasicMaterial && m.userData.ground))) return m;
  m.userData.fxPatched = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uNoise = U.uNoise; sh.uniforms.uCloudOff = U.uCloudOff; sh.uniforms.uCloudAmt = U.uCloudAmt;
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', WXZ_VERT);
    sh.fragmentShader = 'uniform sampler2D uNoise; uniform vec2 uCloudOff; uniform float uCloudAmt; varying vec2 vWXZ;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { float cl = texture2D( uNoise, vWXZ / 520.0 + uCloudOff ).r;
        gl_FragColor.rgb *= 1.0 - uCloudAmt * smoothstep( 0.52, 0.74, cl ); }`);
  };
  m.customProgramCacheKey = () => 'fx-cloud-1';
  return m;
}

export function waterMaterial() {
  const m = new THREE.MeshPhongMaterial({ color: '#46b1dc', specular: '#3a6d85', shininess: 30 });
  m.userData.fxPatched = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uNoise = U.uNoise; sh.uniforms.uTime = U.uTime; sh.uniforms.uDay = U.uDay; sh.uniforms.uCloudOff = U.uCloudOff; sh.uniforms.uCloudAmt = U.uCloudAmt;
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', WXZ_VERT);
    sh.fragmentShader = 'uniform sampler2D uNoise; uniform float uTime; uniform float uDay; uniform vec2 uCloudOff; uniform float uCloudAmt; varying vec2 vWXZ;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { vec2 p = vWXZ;
        float n1 = texture2D( uNoise, p / 55.0 + vec2( uTime * 0.006, uTime * 0.003 ) ).g;
        float n2 = texture2D( uNoise, p / 37.0 - vec2( uTime * 0.004, -uTime * 0.005 ) ).g;
        float sp = smoothstep( 0.33, 0.41, n1 * n2 );
        float big = texture2D( uNoise, p / 900.0 ).b;
        gl_FragColor.rgb *= mix( 0.86, 1.1, big );
        gl_FragColor.rgb += vec3( 0.85, 0.95, 1.0 ) * sp * ( 0.03 + 0.13 * uDay );
        float cl = texture2D( uNoise, p / 520.0 + uCloudOff ).r;
        gl_FragColor.rgb *= 1.0 - uCloudAmt * smoothstep( 0.52, 0.74, cl ); }`);
  };
  m.customProgramCacheKey = () => 'fx-water-1';
  return m;
}

function canvasTex(S, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); draw(g, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.repeat.set(repeat, repeat); return t;
}
function speckle(g, S, n, cols, rmin, rmax, r) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = rmin + r() * (rmax - rmin); g.fillStyle = cols[Math.floor(r() * cols.length)];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, y + oy, rad, 0, 7); g.fill(); }
  }
}
export function grassTexture() {
  const r = rng(11);
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    speckle(g, S, 900, ['rgba(120,150,90,0.10)', 'rgba(255,255,230,0.14)', 'rgba(90,130,70,0.08)'], 3, 9, r);
    speckle(g, S, 2600, ['rgba(70,110,50,0.22)', 'rgba(255,255,220,0.25)', 'rgba(110,150,70,0.2)'], 0.6, 1.6, r);
  }, 1 / 9);
}
export function pavingTexture() {
  const r = rng(5);
  return canvasTex(128, (g, S) => {
    g.fillStyle = '#b9b4aa'; g.fillRect(0, 0, S, S);
    const n = 4, c = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 218 + Math.floor(r() * 16); g.fillStyle = `rgb(${v},${v - 3},${v - 9})`; g.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3); }
    speckle(g, S, 300, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.12)'], 0.5, 1.4, r);
  }, 1 / 2);
}
export function asphaltTexture() {
  const r = rng(9);
  return canvasTex(128, (g, S) => {
    g.fillStyle = '#6a6e75'; g.fillRect(0, 0, S, S);
    speckle(g, S, 1400, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.10)', 'rgba(40,40,40,0.15)'], 0.4, 1.2, r);
    speckle(g, S, 30, ['rgba(0,0,0,0.06)'], 6, 14, r);
  }, 1 / 5);
}
export function glowTexture(inner = 'rgba(255,214,140,1)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Faixas ao longo da costa: areia (para dentro da terra) e espuma (para a água)
export function coastStrips(land, W, H, sandW = 5, foamW = 2.6) {
  const sand = [], foam = [];
  const onBorder = (a, b) => (Math.abs(a[0]) < 0.8 && Math.abs(b[0]) < 0.8) || (Math.abs(a[1]) < 0.8 && Math.abs(b[1]) < 0.8) || (Math.abs(a[0] - W) < 1.6 && Math.abs(b[0] - W) < 1.6) || (Math.abs(a[1] - H) < 1.6 && Math.abs(b[1] - H) < 1.6);
  const strip = (arr, pts, nrm, d0, d1, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      if (onBorder(pts[i], pts[i + 1])) continue;
      const a = pts[i], b = pts[i + 1], na = nrm[i], nb = nrm[i + 1];
      const A0 = [a[0] + na[0] * d0, a[1] + na[1] * d0], A1 = [a[0] + na[0] * d1, a[1] + na[1] * d1], B0 = [b[0] + nb[0] * d0, b[1] + nb[1] * d0], B1 = [b[0] + nb[0] * d1, b[1] + nb[1] * d1];
      arr.push(A0[0], y, A0[1], B0[0], y, B0[1], B1[0], y, B1[1], A0[0], y, A0[1], B1[0], y, B1[1], A1[0], y, A1[1]);
    }
  };
  for (const poly of land) poly.forEach((ring, ri) => {
    const pts = [...ring, ring[0]];
    let area = 0; for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    const left = (area > 0) === (ri === 0); // lado da terra
    const segN = []; for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dz) || 1; segN.push(left ? [-dz / L, dx / L] : [dz / L, -dx / L]); }
    const nrm = pts.map((_, i) => { const a = segN[(i - 1 + segN.length) % segN.length], b = segN[i % segN.length]; let x = a[0] + b[0], z = a[1] + b[1]; const L = Math.hypot(x, z) || 1; x /= L; z /= L; const k = Math.min(2, 1 / Math.max(0.5, x * b[0] + z * b[1])); return [x * k, z * k]; });
    strip(sand, pts, nrm, 0, sandW, 0.012);
    strip(foam, pts, nrm, -0.3, -foamW, -0.46);
  });
  return { sand, foam };
}

export function geomFrom(arr, uvScale = 1) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(arr), nor = new Float32Array(arr.length), uv = new Float32Array((arr.length / 3) * 2);
  for (let i = 0, j = 0; i < arr.length; i += 3, j += 2) { nor[i + 1] = 1; uv[j] = arr[i] * uvScale; uv[j + 1] = arr[i + 2] * uvScale; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// mescla várias geometrias (posições/normais) em uma só, aplicando matrizes
export function merge(parts) {
  const P = [], N = [], C = [];
  for (const { geo, m, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array; P.push(...p); N.push(...n);
    const c = new THREE.Color(color || '#ffffff'); for (let i = 0; i < p.length / 3; i++) C.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
// caixa com base mais escura (oclusão ambiente "fake")
export function gradBox(bottom = 0.72) {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) { const v = bottom + (1 - bottom) * Math.min(1, p.getY(i) * 1.6); c.push(v, v, v); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
}

// ---------- estilo cartoon ----------
let GRAD = null;
export function toonGradient() {
  if (GRAD) return GRAD;
  GRAD = new THREE.DataTexture(new Uint8Array([168, 206, 236, 255]), 4, 1, THREE.RedFormat);
  GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.generateMipmaps = false; GRAD.needsUpdate = true;
  return GRAD;
}
// material "toon" (sombreamento em faixas suaves) já com as sombras de nuvem
export function toon(params = {}) {
  const p = { ...params }; delete p.flatShading;
  return patch(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...p }));
}
// material de chão SEM cálculo de luz (o chão é plano: a luz é igual em todo ele).
// A cor é multiplicada por um "tom do dia" atualizado em setTime. Bem mais barato por pixel.
export const groundMats = [];
export function ground(params = {}) {
  const m = new THREE.MeshBasicMaterial(params); m.userData.ground = true; m.userData.base = m.color.clone();
  groundMats.push(m); return patch(m);
}
export function tintGround(tint) { for (const m of groundMats) m.color.copy(m.userData.base).multiply(tint); }
// sombrinhas desenhadas (bem mais leves que sombras em tempo real)
function alphaTex(draw, S = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); draw(g, S);
  const t = new THREE.CanvasTexture(cv); return t;
}
let BLOB = null, RECT = null;
export function blobTexture() {
  return BLOB || (BLOB = alphaTex((g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, 64));
}
export function rectShadowTexture() {
  return RECT || (RECT = alphaTex((g, S) => { g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = S * 0.07; g.shadowOffsetX = S * 4; g.fillStyle = '#fff'; g.fillRect(S * 0.13 - S * 4, S * 0.13, S * 0.74, S * 0.74); }));
}
export function shadowMaterial(tex, opacity = 0.35) {
  return new THREE.MeshBasicMaterial({ map: tex, color: '#283062', transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
