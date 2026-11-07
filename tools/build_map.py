"""Gera js/mapdata.js (mapa do bairro São Francisco, São Luís/MA) em METROS reais.

Fontes:
  - Geometria (ruas, água, praças, prédios): © OpenStreetMap contributors (ODbL).
  - Print de referência do jogador: usado para recortar a área exata, alinhar a escala
    (zoom/offset em Web Mercator) e posicionar os marcadores (casa, trabalho, etc).

Uso: python tools/build_map.py <print.png> <osm.json> <georef.json> js/mapdata.js
"""
import json, math, sys, random
import numpy as np, cv2
from PIL import Image
from shapely.geometry import LineString, Polygon, MultiPolygon, Point, box, GeometryCollection
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree
from shapely import affinity

IMG, OSM, GEO, OUT = sys.argv[1:5]
DEBUG = OUT.replace('.js', '_debug.png') if len(sys.argv) < 6 else sys.argv[5]
random.seed(42)
img = np.array(Image.open(IMG).convert('RGB')).astype(int)
HP, WP = img.shape[:2]
geo = json.load(open(GEO)); Z = geo['zoom']; GX = geo['gx']; GY = geo['gy']; MPP = geo['mpp']
WM, HM = WP * MPP, HP * MPP
BOX = box(0, 0, WM, HM); BIG = box(-300, -300, WM + 300, HM + 300)
print(f'mapa {WM:.0f} x {HM:.0f} m  ({MPP:.4f} m/px)')

def tom(lat, lon):
    s = 256 * 2 ** Z
    x = (lon + 180) / 360 * s
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * s
    return ((x - GX) * MPP, (y - GY) * MPP)

def near(c, tol): return np.abs(img - np.array(c)).sum(axis=2) <= tol
WATER_PX = near((144, 217, 237), 30)
STREET_PX = near((206, 216, 225), 14) | near((202, 213, 220), 10) | near((215, 224, 229), 8) | near((138, 164, 190), 30)
STREET_PX = cv2.dilate(STREET_PX.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
BEIGE_PX = near((244, 239, 227), 6)

def px_at(mask, x, z):
    u, v = int(x / MPP), int(z / MPP)
    return 0 <= u < WP and 0 <= v < HP and bool(mask[v, u])

def frac_in(poly, mask, n=300):
    minx, miny, maxx, maxy = poly.bounds; hit = tot = 0
    for _ in range(n * 4):
        x, z = random.uniform(minx, maxx), random.uniform(miny, maxy)
        if not (0 <= x < WM and 0 <= z < HM): continue
        if not poly.contains(Point(x, z)): continue
        tot += 1; hit += px_at(mask, x, z)
        if tot >= n: break
    return hit / tot if tot else None

els = json.load(open(OSM, encoding='utf8'))['elements']
def geom_pts(g): return [tom(p['lat'], p['lon']) for p in g]
def polys_of(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)): return [p for p in g.geoms if isinstance(p, Polygon)]
    return []

# ---------------------------------------------------------------- água
water = []
for e in els:
    t = e.get('tags', {})
    if e['type'] == 'relation' and t.get('natural') == 'water':
        outer = [LineString(geom_pts(m['geometry'])) for m in e['members'] if m['type'] == 'way' and m.get('role') == 'outer' and m.get('geometry')]
        inner = [LineString(geom_pts(m['geometry'])) for m in e['members'] if m['type'] == 'way' and m.get('role') == 'inner' and m.get('geometry')]
        op = unary_union(list(polygonize(unary_union(outer)))) if outer else Polygon()
        ip = unary_union(list(polygonize(unary_union(inner)))) if inner else Polygon()
        water.append(op.difference(ip))
    elif e['type'] == 'way' and t.get('natural') == 'water' and e.get('geometry') and len(e['geometry']) > 3:
        water.append(Polygon(geom_pts(e['geometry'])).buffer(0))
coast = [LineString(geom_pts(e['geometry'])) for e in els if e['type'] == 'way' and e.get('tags', {}).get('natural') == 'coastline' and e.get('geometry')]
if coast:
    lines = unary_union([c.intersection(BIG) for c in coast] + [BIG.exterior])
    for f in polygonize(lines):
        fr = frac_in(f.intersection(BOX), WATER_PX) if f.intersection(BOX).area > 50 else None
        if fr is not None and fr > 0.5: water.append(f)
water = unary_union([w.buffer(0) for w in water]).intersection(BIG)
land = BOX.difference(water).buffer(0)
# validação contra o print
wm = np.zeros((HP, WP), np.uint8)
for p in polys_of(water):
    cv2.fillPoly(wm, [np.array([[x / MPP, z / MPP] for x, z in p.exterior.coords], np.int32)], 1)
    for hole in p.interiors: cv2.fillPoly(wm, [np.array([[x / MPP, z / MPP] for x, z in hole.coords], np.int32)], 0)
iou = (wm.astype(bool) & WATER_PX).sum() / max(1, (wm.astype(bool) | WATER_PX).sum())
print(f'água OSM x print: IoU={iou:.3f}')

# ---------------------------------------------------------------- ruas
W_ROAD = {  # (largura da pista, calçada de cada lado)
    'trunk': (12, 3), 'primary': (12, 3), 'secondary': (10, 2.5), 'tertiary': (8.5, 2.5),
    'residential': (7, 2.2), 'unclassified': (6.5, 2), 'living_street': (5, 1.5), 'pedestrian': (6, 0),
    'trunk_link': (6, 1), 'primary_link': (6, 1), 'secondary_link': (6, 1), 'tertiary_link': (6, 1), 'service': (4.5, 1),
}
MAIN = {'trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
roads = []
for e in els:
    t = e.get('tags', {}); hw = t.get('highway')
    if e['type'] != 'way' or hw not in W_ROAD or not e.get('geometry'): continue
    if t.get('area') == 'yes': continue
    ls = LineString(geom_pts(e['geometry'])).intersection(BOX.buffer(40))
    parts = [ls] if isinstance(ls, LineString) else [g for g in getattr(ls, 'geoms', []) if isinstance(g, LineString)]
    for part in parts:
        if part.length < 3: continue
        # só as ruas que aparecem no print
        n = max(2, int(part.length / 2)); hits = sum(px_at(STREET_PX, *part.interpolate(i / n, normalized=True).coords[0]) for i in range(n + 1))
        inside = sum(1 for i in range(n + 1) if BOX.contains(part.interpolate(i / n, normalized=True)))
        cov = hits / max(1, inside) if inside else 1
        if hw not in MAIN and cov < 0.5: continue
        if hw in ('service', 'living_street', 'pedestrian') and cov < 0.7: continue
        w, sw = W_ROAD[hw]
        oneway = t.get('oneway') in ('yes', '1', '-1')
        if oneway and hw in ('trunk', 'primary', 'secondary'): w = w * 0.62
        lanes = t.get('lanes')
        if lanes and lanes.isdigit() and hw not in ('service',): w = max(w, int(lanes) * 3.3)
        roads.append({'t': hw, 'n': t.get('name', ''), 'w': round(w, 1), 'sw': sw, 'o': 1 if oneway else 0, 'b': 1 if t.get('bridge') == 'yes' else 0,
                      'line': part})
print('ruas:', len(roads), 'extensão total %.1f km' % (sum(r['line'].length for r in roads) / 1000))
road_buf = [r['line'].buffer(r['w'] / 2 + r['sw'], cap_style='flat' if r['t'] in MAIN else 'round', join_style='round') for r in roads]
road_tree = STRtree(road_buf)
def hits_road(g, pad=0):
    gg = g.buffer(pad) if pad else g
    return any(road_buf[i].intersects(gg) for i in road_tree.query(gg))

# ---------------------------------------------------------------- áreas verdes, prédios OSM
parks, veg, pitches, bld = [], [], [], []
for e in els:
    t = e.get('tags', {})
    if e['type'] != 'way' or not e.get('geometry') or len(e['geometry']) < 4: continue
    pts = geom_pts(e['geometry'])
    if pts[0] != pts[-1]: continue
    poly = Polygon(pts).buffer(0)
    if not poly.is_valid or poly.area < 4: continue
    cl = poly.intersection(BOX)
    if cl.is_empty: continue
    if t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'recreation_ground', 'village_green'):
        for p in polys_of(cl): parks.append((p, t.get('name', '')))
    elif t.get('leisure') == 'pitch':
        for p in polys_of(cl): pitches.append(p)
    elif t.get('natural') in ('wood', 'scrub', 'wetland') or t.get('landuse') == 'forest':
        for p in polys_of(cl.difference(water)): veg.append((p, t.get('natural', 'wood')))
    elif 'building' in t:
        lv = t.get('building:levels', '')
        levels = int(float(lv)) if lv.replace('.', '').isdigit() else {'apartments': 4, 'commercial': 2, 'church': 3, 'public': 2}.get(t['building'], 1 + (poly.area > 300))
        for p in polys_of(cl): bld.append((p.simplify(0.3), max(1, min(levels, 20)), t.get('building')))
print('praças/verde:', len(parks), 'vegetação:', len(veg), 'campos:', len(pitches), 'prédios OSM:', len(bld))

# ---------------------------------------------------------------- locais do jogo
def mpix(u, v): return (u * MPP, v * MPP)
reserved = []  # polígonos onde não pode ter casa procedural
def free_rect(cx, cz, w, d, pad=1.5):
    r = box(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)
    return land.buffer(-0.5).contains(r) and not hits_road(r, pad) and not any(r.intersects(p.buffer(pad)) for p in reserved) and not any(r.intersects(b[0]) for b in bld)

def place_near(tx, tz, w, d, maxr=60):
    for r in range(0, maxr, 1):
        for k in range(max(1, r * 6)):
            a = 2 * math.pi * k / max(1, r * 6)
            cx, cz = tx + r * math.cos(a), tz + r * math.sin(a)
            if free_rect(cx, cz, w, d): return cx, cz
    return None

def nearest_face(cx, cz, w, d):
    """Escolhe a fachada (n/s/e/w) voltada para a rua mais próxima."""
    best = None
    for face, (fx, fz) in {'n': (cx, cz - d / 2), 's': (cx, cz + d / 2), 'w': (cx - w / 2, cz), 'e': (cx + w / 2, cz)}.items():
        p = Point(fx, fz); dist = min(road_buf[i].distance(p) for i in road_tree.query(p.buffer(60))) if len(road_tree.query(p.buffer(60))) else 99
        if best is None or dist < best[0]: best = (dist, face)
    return best[1]

places = {}
def add_place(pid, name, target, w, d, h, wall, roof, icon, hours, face=None):
    w0, d0 = w, d
    while True:
        got = place_near(target[0], target[1], w, d)
        if got: break
        w, d = max(8, round(w * 0.88)), max(8, round(d * 0.88))
        if w == 8 and d == 8 and not got: raise SystemExit(f'sem lugar para {name}')
    if (w, d) != (w0, d0): print(f'  ({name}: reduzido de {w0}x{d0} para {w}x{d} para caber no quarteirão)')
    cx, cz = got
    f = face or nearest_face(cx, cz, w, d)
    x0, z0 = round(cx - w / 2), round(cz - d / 2)
    places[pid] = {'name': name, 'x': x0, 'z': z0, 'w': w, 'd': d, 'h': h, 'wall': wall, 'roof': roof, 'icon': icon, 'hours': hours, 'face': f}
    reserved.append(box(x0, z0, x0 + w, z0 + d))
    print(f'  {name}: ({x0},{z0}) {w}x{d} fachada {f}  alvo {target[0]:.0f},{target[1]:.0f}')

# casa do jogador: apartamento 18x12 com a porta na parede SUL -> lote ao norte da rua do marcador vermelho
home_px = (95.6, 261.1); hx, hz = mpix(*home_px)
APT_W, APT_D = 18, 12
home = None
for dz in np.arange(0, 40, 0.5):
    for dx in sorted(np.arange(-30, 31, 0.5), key=abs):
        x0, z0 = round(hx + dx - APT_W / 2), round(hz - dz - APT_D)
        r = box(x0, z0, x0 + APT_W, z0 + APT_D)
        front = box(x0 + 8, z0 + APT_D, x0 + 11, z0 + APT_D + 3)   # calçada em frente à porta
        if land.buffer(-0.5).contains(r) and not hits_road(r, 0.5) and hits_road(front):
            home = (x0, z0); break
    if home: break
print('  Casa (apê alugado):', home)
reserved.append(box(home[0] - 1, home[1] - 1, home[0] + APT_W + 1, home[1] + APT_D + 1))
add_place('lucia_home', 'Casa da Dona Lúcia', (home[0] + APT_W + 7, home[1] + 6), 10, 11, 3.0, '#c9d6a3', '#6b7f3a', '🏡', [0, 24])
add_place('julia_home', 'Casa da Júlia', mpix(138.2, 94.8), 10, 11, 3.2, '#f2b5c4', '#a8465e', '💕', [0, 24])
# trabalho: o prédio marcado em azul (contorno do marcador no print)
bm = (np.abs(img - np.array((25, 113, 194))).sum(axis=2) < 60)
ys, xs = np.where(bm[360:400, 270:320]); xs = xs + 270; ys = ys + 360
ow, od = round((xs.max() - xs.min() + 1) * MPP), round((ys.max() - ys.min() + 1) * MPP)
add_place('office', 'Escritório', mpix(xs.mean(), ys.mean()), ow, od, 16, '#9fb4d9', '#3a4a6a', '💼', [7, 19])
add_place('fabrica', 'Fábrica de Salgados', mpix(204.4, 449.8), 22, 16, 5, '#e8c07a', '#a4572a', '🥟', [7, 17])
mateus = [e for e in els if e.get('tags', {}).get('name') == 'Mateus Food Service' and e.get('geometry')]
mt = Polygon(geom_pts(mateus[0]['geometry'])).centroid if mateus else Point(*mpix(432, 260))
add_place('market', 'Supermercado', (mt.x, mt.y), 34, 24, 6, '#a8d0e6', '#2e6f95', '🛒', [7, 22])
add_place('gym', 'Academia', mpix(352, 318), 16, 12, 6, '#c7b8e6', '#5b3f9a', '🏋️', [6, 23])
add_place('bar', 'Bar do Zé', mpix(232, 620), 12, 10, 4, '#d9a35f', '#7a3b2e', '🍺', [11, 24])

# praça do jogo = Praça Pôr do Sol (OSM)
psol = [p for p, n in parks if n == 'Praça Pôr do Sol']
psol = max(psol, key=lambda p: p.area) if psol else Point(*mpix(92, 353)).buffer(25)
print('  Praça Pôr do Sol: área %.0f m²' % psol.area)

# ---------------------------------------------------------------- casas ao longo das ruas
HOUSE_ROADS = {'residential', 'unclassified', 'tertiary', 'secondary', 'living_street', 'primary'}
occupied = STRtree([b[0] for b in bld] + reserved + [p for p, _ in parks] + pitches + [p for p, _ in veg]) if True else None
occ_list = [b[0] for b in bld] + reserved + [p for p, _ in parks] + pitches + [p for p, _ in veg]
grid = {}
def gkey(x, z): return (int(x // 25), int(z // 25))
def grid_hit(poly):
    minx, miny, maxx, maxy = poly.bounds
    for i in range(int(minx // 25) - 1, int(maxx // 25) + 2):
        for j in range(int(miny // 25) - 1, int(maxy // 25) + 2):
            for q in grid.get((i, j), ()):
                if q.intersects(poly): return True
    return False
land_in = land.buffer(-0.8)
houses = []
for r in roads:
    if r['t'] not in HOUSE_ROADS: continue
    line = r['line']; L = line.length
    off0 = r['w'] / 2 + r['sw']
    for side in (1, -1):
        s = random.uniform(2, 8)
        while s < L - 4:
            f = random.choice([8, 9, 10, 10, 11, 12, 12, 14])
            p0 = line.interpolate(s); p1 = line.interpolate(min(L, s + 1))
            tx, tz = p1.x - p0.x, p1.y - p0.y; n = math.hypot(tx, tz) or 1; tx, tz = tx / n, tz / n
            nx, nz = -tz, tx
            commercial = px_at(BEIGE_PX, p0.x, p0.y) or r['t'] in ('primary', 'secondary')
            d = random.uniform(10, 18) if not commercial else random.uniform(14, 24)
            setback = random.uniform(1.0, 3.5) if not commercial else random.uniform(0.3, 1.5)
            mid = s + f / 2
            pm = line.interpolate(min(L, mid))
            cx = pm.x + side * nx * (off0 + setback + d / 2); cz = pm.y + side * nz * (off0 + setback + d / 2)
            ang = math.atan2(-tz, tx) + (math.pi if side == 1 else 0)
            rect = affinity.rotate(box(-(f - 1) / 2, -d / 2, (f - 1) / 2, d / 2), -math.degrees(ang), origin=(0, 0))
            rect = affinity.translate(rect, cx, cz)
            ok = land_in.contains(rect) and not hits_road(rect, 0.3) and not grid_hit(rect) and not any(occ_list[i].intersects(rect) for i in occupied.query(rect))
            if ok:
                floors = random.choice([1, 1, 1, 2]) if not commercial else random.choice([1, 2, 2, 3, 4])
                houses.append([round(cx, 2), round(cz, 2), round(f - 1, 2), round(d, 2), round(ang, 4), floors, random.randrange(8), 1 if commercial else 0])
                grid.setdefault(gkey(cx, cz), []).append(rect.buffer(0.6))
            s += f
print('casas geradas:', len(houses))

# ---------------------------------------------------------------- árvores e postes
trees = []
def scatter(poly, dens, kind, cap=4000):
    n = min(cap, int(poly.area / dens)); minx, miny, maxx, maxy = poly.bounds; k = 0
    for _ in range(n * 6):
        if k >= n: break
        x, z = random.uniform(minx, maxx), random.uniform(miny, maxy)
        pt = Point(x, z)
        if not poly.contains(pt) or hits_road(pt, 1.2) or grid_hit(pt.buffer(1.2)): continue
        trees.append([round(x, 1), round(z, 1), round(random.uniform(0.8, 1.4), 2), kind]); k += 1
for p, _ in parks: scatter(p, 120, 0)
for p, k in veg: scatter(p, 45, 2 if k == 'wetland' else 1)
# quintais: pontos aleatórios em terra livre
minx, miny, maxx, maxy = BOX.bounds; yard = 0
for _ in range(60000):
    if yard >= 2500: break
    x, z = random.uniform(minx, maxx), random.uniform(miny, maxy); pt = Point(x, z)
    if not land_in.contains(pt) or hits_road(pt, 3) or grid_hit(pt.buffer(1.5)) or any(occ_list[i].intersects(pt.buffer(1.5)) for i in occupied.query(pt.buffer(1.5))): continue
    trees.append([round(x, 1), round(z, 1), round(random.uniform(0.7, 1.3), 2), 0]); yard += 1
lamps = []
for r in roads:
    if r['t'] in ('service', 'pedestrian') or r['b']: continue
    L = r['line'].length; s = 12
    while s < L:
        p = r['line'].interpolate(s); q = r['line'].interpolate(min(L, s + 1)); tx, tz = q.x - p.x, q.y - p.y; n = math.hypot(tx, tz) or 1
        o = r['w'] / 2 + r['sw'] * 0.6
        lx, lz = p.x - tz / n * o, p.y + tx / n * o
        if BOX.contains(Point(lx, lz)) and land_in.contains(Point(lx, lz)): lamps.append([round(lx, 1), round(lz, 1)])
        s += 38
print('árvores:', len(trees), 'postes:', len(lamps))

# ---------------------------------------------------------------- nomes das ruas
labels = []
byname = {}
for r in roads:
    if r['n'] and r['t'] not in ('service',): byname.setdefault(r['n'], []).append(r)
for name, rs in byname.items():
    segs = []
    for r in rs:
        c = list(r['line'].coords)
        for a, b in zip(c, c[1:]):
            seg = LineString([a, b])
            if BOX.buffer(-30).contains(seg.centroid): segs.append((seg.length, a, b, r['w']))
    segs.sort(reverse=True)
    used = []
    for L, a, b, w in segs[:6]:
        if L < 45: break
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if any(math.hypot(mx - u, mz - v) < 260 for u, v in used): continue
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        if ang > math.pi / 2: ang -= math.pi
        if ang < -math.pi / 2: ang += math.pi
        labels.append([name, round(mx, 1), round(mz, 1), round(ang, 4), round(min(w, 7), 1)])
        used.append((mx, mz))
print('rótulos de ruas:', len(labels))

# ---------------------------------------------------------------- spots para NPCs
def rect_of(poly, pad=0):
    a, b, c, d = poly.bounds; return [math.floor(a + pad), math.floor(b + pad), math.floor(c - pad), math.floor(d - pad)]
hb = box(home[0], home[1], home[0] + APT_W, home[1] + APT_D)
spots = {
    'park': rect_of(psol, 2),
    'street': [home[0] - 40, home[1] + APT_D + 1, home[0] + APT_W + 40, home[1] + APT_D + 9],
    'lucia': [home[0] - 20, home[1] + APT_D + 1, home[0] + APT_W + 30, home[1] + APT_D + 9],
    'rafa': rect_of(box(*[v for v in (places['office']['x'] - 200, places['office']['z'] - 60, places['office']['x'] + 260, places['office']['z'] + 160)])),
}
def road_end(pt):  # ponto de rua mais próximo de um ponto da borda
    best = None
    for r in roads:
        if r['t'] not in MAIN: continue
        for c in (r['line'].coords[0], r['line'].coords[-1]):
            dd = math.hypot(c[0] - pt[0], c[1] - pt[1])
            if best is None or dd < best[0]: best = (dd, c)
    x, z = best[1]; return [min(max(int(x), 2), int(WM) - 3), min(max(int(z), 2), int(HM) - 3)]
spots['edgeL'] = road_end(mpix(300, 698))   # ponte ao sul
spots['edgeR'] = road_end(mpix(685, 150))   # avenida a nordeste

# ---------------------------------------------------------------- saída
def ring(c): return [[round(x, 1), round(z, 1)] for x, z in list(c)[:-1]]
def poly_out(p, tol=0.5):
    p = p.simplify(tol)
    if p.is_empty or not isinstance(p, Polygon): return None
    return [ring(p.exterior.coords)] + [ring(h.coords) for h in p.interiors]
out = {
    'attribution': '© OpenStreetMap contributors (ODbL)',
    'mpp': MPP, 'W': math.ceil(WM), 'H': math.ceil(HM),
    'home': {'ox': home[0], 'oz': home[1]},
    'land': [q for q in (poly_out(p, 0.8) for p in polys_of(land)) if q],
    'roads': [{'t': r['t'], 'n': r['n'], 'w': r['w'], 'sw': r['sw'], 'o': r['o'], 'b': r['b'], 'p': [[round(x, 1), round(z, 1)] for x, z in r['line'].simplify(0.25).coords]} for r in roads],
    'parks': [{'n': n, 'p': q} for p, n in parks for q in [poly_out(p)] if q],
    'veg': [{'k': k, 'p': q} for p, k in veg for q in [poly_out(p)] if q],
    'pitches': [q for q in (poly_out(p) for p in pitches) if q],
    'buildings': [{'l': lv, 'k': k, 'p': q} for p, lv, k in bld for q in [poly_out(p, 0.2)] if q],
    'places': places, 'park': {'name': 'Praça Pôr do Sol', 'p': poly_out(psol)},
    'houses': houses, 'trees': trees, 'lamps': lamps, 'labels': labels, 'spots': spots,
}
js = '// Gerado por tools/build_map.py — não edite à mão.\n// Dados geográficos © OpenStreetMap contributors, licença ODbL (https://www.openstreetmap.org/copyright).\nexport default ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(OUT, 'w', encoding='utf8').write(js)
print('gravado', OUT, '%.0f KB' % (len(js.encode('utf8')) / 1024))

# ---------------------------------------------------------------- imagem de conferência (mesma escala do print)
dbg = (img.copy()).astype(np.uint8)
ov = np.zeros_like(dbg)
for p in polys_of(water): cv2.fillPoly(ov, [np.array([[x / MPP, z / MPP] for x, z in p.exterior.coords], np.int32)], (40, 90, 220))
for r in roads: cv2.polylines(ov, [np.array([[x / MPP, z / MPP] for x, z in r['line'].coords], np.int32)], False, (255, 0, 0), max(1, int(r['w'] / MPP)))
for h in houses:
    rect = affinity.translate(affinity.rotate(box(-h[2] / 2, -h[3] / 2, h[2] / 2, h[3] / 2), -math.degrees(h[4]), origin=(0, 0)), h[0], h[1])
    cv2.fillPoly(ov, [np.array([[x / MPP, z / MPP] for x, z in rect.exterior.coords], np.int32)], (120, 120, 120))
for pid, p in places.items(): cv2.rectangle(ov, (int(p['x'] / MPP), int(p['z'] / MPP)), (int((p['x'] + p['w']) / MPP), int((p['z'] + p['d']) / MPP)), (0, 200, 0), -1)
cv2.rectangle(ov, (int(home[0] / MPP), int(home[1] / MPP)), (int((home[0] + 18) / MPP), int((home[1] + 12) / MPP)), (255, 0, 255), -1)
mix = cv2.addWeighted(dbg, 0.55, ov, 0.45, 0)
Image.fromarray(mix).save(DEBUG)
print('debug', DEBUG)
