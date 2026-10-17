// Generates the whole cell on demand, at the same molecular detail as the hand-built window wherever the camera goes:
// real E. coli species at measured abundance, nucleoid DNA as a double helix, and the outer surface with lipids, LPS and
// outer-membrane proteins. Deterministic per tile, so revisiting a place rebuilds the same molecules.
//
// Detail levels: 0 = 96-bead proteins + DNA double helix, 1 = 48 beads, 2 = 12 beads, 3 = one bead per molecule.
let P = null, pick = {}, densities = null, dna = null, dnaBuckets = null, atlas = null, napSpecies = [], blockers = [], discs = [], motorAxes = [];
const TOP = -35, BOTTOM = -175, MID = -105, TILE = 12;
const pinch = y => 3.5 * Math.exp(-(((y - MID) / 7) ** 2));
const radiusAt = (r, y) => (y < TOP && y > BOTTOM ? r - pinch(y) : r);
const inSlab = (x, y, z) => Math.abs(x) < 21.5 && y > -13.4 && z > -12.5 && z < 5;
const inZSlot = y => Math.abs(y - MID) < 4.5;
const nucleoids = [[0, -72, 0], [0, -138, 0]], nucR = [17, 26, 17];
const inNucleoid = (x, y, z, s = 1) => nucleoids.some(c => ((x - c[0]) / nucR[0]) ** 2 + ((y - c[1]) / nucR[1]) ** 2 + ((z - c[2]) / nucR[2]) ** 2 < s * s);
const axisDistance = (x, y, z) => { const yy = Math.min(TOP, Math.max(BOTTOM, y)); return Math.hypot(x, y - yy, z); };
const inCytoplasm = (x, y, z, margin) => axisDistance(x, y, z) < radiusAt(36.3, y) - margin;
const SPECIAL = { ribosome: 65000, dna: 65001, lipid: 65002, lps: 65003, wall: 65004, imLipid: 65005 }, PATCH = 1.6;
// Hand-built machines in the top window: cytoplasm spheres [x,y,z,r] and the motor column keep streamed molecules out;
// membrane discs [x,z,r] (porins, efflux pumps, motor bushings) keep lipids out.
const blocked = (x, y, z) => (Math.hypot(x - 2.1, z - .1) < 3.55 && y > -4.1) || blockers.some(b => (x - b[0]) ** 2 + (y - b[1]) ** 2 + (z - b[2]) ** 2 < b[3] * b[3]);
// Body motors: keep envelope beads off the column around each motor axis (rings, rod and hook pass through every layer).
const nearMotor = (x, y, z) => motorAxes.some(a => { const dx = x - a[0], dy = y - a[1], dz = z - a[2], t = dx * a[3] + dy * a[4] + dz * a[5]; return dx * dx + dy * dy + dz * dz - t * t < 1.45 * 1.45 && t > 30; });
const inDisc = (x, y, z) => (y > -16 && discs.some(d => (x - d[0]) ** 2 + (z - d[1]) ** 2 < d[2] * d[2])) || nearMotor(x, y, z);

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function hash(a, b, c) { let h = 2166136261 ^ a; h = Math.imul(h ^ b, 16777619); h = Math.imul(h ^ c, 16777619); return h >>> 0; }
function alias(weights) {
  const n = weights.length, total = weights.reduce((a, b) => a + b, 0), prob = new Float64Array(n), al = new Int32Array(n), small = [], large = [];
  weights.forEach((w, i) => { prob[i] = w * n / total; (prob[i] < 1 ? small : large).push(i); });
  while (small.length && large.length) { const s = small.pop(), l = large.pop(); al[s] = l; prob[l] -= 1 - prob[s]; (prob[l] < 1 ? small : large).push(l); }
  return r => { const i = Math.floor(r() * n), u = r(); return u < prob[i] ? i : al[i]; };
}
function rotate(q, v) { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; }
function randomQuat(r) { const u1 = r(), u2 = r() * 6.2832, u3 = r() * 6.2832, a = Math.sqrt(1 - u1), b = Math.sqrt(u1); return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)]; }
const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];

onmessage = ({ data }) => {
  if (data.type === 'init') { blockers = data.blockers || []; discs = data.discs || []; motorAxes = data.motorAxes || []; init(data.proteome); return; }
  if (data.type === 'tile') postTile(data);
  if (data.type === 'surface') postEnvelope(data);
};

function init(proteome) {
  P = proteome;
  const by = comp => { const idx = P.species.map((s, i) => [s, i]).filter(([s]) => s.comp === comp); return { idx: idx.map(([, i]) => i), sample: alias(idx.map(([s]) => s.copies)), total: idx.reduce((a, [s]) => a + s.copies, 0) }; };
  pick = { cyto: by('cyto'), im: by('im'), om: by('om'), peri: by('peri') };
  napSpecies = ['hupA', 'hupB', 'hns', 'fis', 'ihfA', 'ihfB', 'dps'].map(g => P.species.findIndex(s => s.gene === g)).filter(i => i >= 0);
  const cytoVol = Math.PI * 36.3 ** 2 * 140 + 4 / 3 * Math.PI * 36.3 ** 3, imArea = 2 * Math.PI * 36.7 * 140 + 4 * Math.PI * 36.7 ** 2, omArea = 2 * Math.PI * 39.9 * 140 + 4 * Math.PI * 39.9 ** 2;
  const periVol = (2 * Math.PI * 38 * 140 + 4 * Math.PI * 38 ** 2) * 1.7;
  densities = { cyto: pick.cyto.total / cytoVol, ribo: P.ribosomes / cytoVol, im: pick.im.total / imArea, om: pick.om.total / omArea, peri: pick.peri.total / periVol };

  // Nucleoid DNA: two segregating chromosome copies as confined random walks (0.55-unit steps), bucketed by band tile.
  const r = rng(77);
  dna = []; dnaBuckets = new Map();
  for (const c of nucleoids) {
    const p = [c[0], c[1], -2 + r() * 4];
    for (let i = 0; i < 26000; i++) {
      let q = null;
      for (let t = 0; t < 12 && !q; t++) { const a = r() * 6.2832, b = Math.acos(r() * 2 - 1), n = [p[0] + Math.sin(b) * Math.cos(a) * .55, p[1] + Math.cos(b) * .55, p[2] + Math.sin(b) * Math.sin(a) * .55]; if (inNucleoid(...n) && n[2] > -10 && n[2] < 5.5) q = n; }
      if (!q) continue;
      p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
      const k = dna.length; dna.push([q[0], q[1], q[2], i ? 1 : 0]);
      const key = Math.floor((q[0] + 42) / TILE) + ',' + Math.floor((q[1] + 218) / TILE);
      if (!dnaBuckets.has(key)) dnaBuckets.set(key, []); dnaBuckets.get(key).push(k);
    }
  }
  // Surface atlas: patch centres on an even grid (rings × columns on the body, golden-angle spirals on the caps) with outward
  // normals, so square patches of lipids tile the outer membrane without gaps. Bucketed in 12-unit cubes.
  atlas = new Map();
  const add = (p, n, axis, pin) => { const key = [Math.floor(p[0] / TILE), Math.floor(p[1] / TILE), Math.floor(p[2] / TILE)].join(','); if (!atlas.has(key)) atlas.set(key, []); atlas.get(key).push({ axis, n, pin }); };
  const side = PATCH, cols = Math.round(2 * Math.PI * 40 / side);
  for (let y = TOP; y > BOTTOM; y -= side) { const rr = radiusAt(40, y); for (let c = 0; c < cols; c++) { const a = (c + (Math.round((TOP - y) / side) % 2) * .5) * 2 * Math.PI / cols, n = [Math.cos(a), 0, Math.sin(a)]; add([n[0] * rr, y, n[2] * rr], n, [0, y, 0], 40 - rr); } }
  const capCount = Math.round(2 * Math.PI * 40 * 40 / (side * side));
  for (const top of [true, false]) for (let i = 0; i < capCount; i++) {
    const h = (i + .5) / capCount, a = i * 2.39996, s2 = Math.sqrt(1 - h * h), n = [s2 * Math.cos(a), top ? h : -h, s2 * Math.sin(a)];
    add([n[0] * 40, (top ? TOP : BOTTOM) + n[1] * 40, n[2] * 40], n, [0, top ? TOP : BOTTOM, 0], 0);
  }
  postMessage({ type: 'ready', densities, surfaceCubes: [...atlas.keys()], dnaPoints: dna.length });
}

// Shared output buffers and emitters.
function makeOut() { return { center: [], offset: [], radius: [], color: [], seed: [], shade: [], species: [], molecules: 0 }; }
function emitter(out, r) {
  const colorCache = new Map(), col = c => { if (!colorCache.has(c)) colorCache.set(c, hex(c)); return colorCache.get(c); };
  return {
    // A molecule: its beads share a centre, a random orientation and a jiggle amplitude set by D (stored in aSeed's fraction).
    molecule(pos, id, beads, color, D, scale = 1) {
      const amp = Math.min(.98, .12 + Math.sqrt(D) * .22), seed = (out.molecules++ % 60000) + amp, q = randomQuat(r), c = col(color);
      for (const b of beads) {
        const o = rotate(q, b), cc = b[4] ? col('#d58bd8') : c;
        out.center.push(pos[0], pos[1], pos[2]); out.offset.push(o[0] * scale, o[1] * scale, o[2] * scale); out.radius.push(b[3] * scale);
        out.color.push(cc[0], cc[1], cc[2]); out.seed.push(seed); out.shade.push(.72 + .28 * r()); out.species.push(id + 1);
      }
    },
    // A single static bead (lipid head, DNA backbone, sugar).
    bead(pos, radius, color, id, shade = 1) { const c = col(color); out.center.push(pos[0], pos[1], pos[2]); out.offset.push(0, 0, 0); out.radius.push(radius); out.color.push(c[0], c[1], c[2]); out.seed.push(out.molecules++ % 60000); out.shade.push(shade); out.species.push(id + 1); },
  };
}
function send(type, key, lod, out) {
  const buf = k => new Float32Array(out[k]);
  const arrays = { center: buf('center'), offset: buf('offset'), radius: buf('radius'), color: buf('color'), seed: buf('seed'), shade: buf('shade'), species: buf('species') };
  postMessage({ type, key, lod, count: out.radius.length, molecules: out.molecules, arrays }, Object.values(arrays).map(a => a.buffer));
}
const HYDRATED = 1.25;
const shapeOf = (s, lod) => lod === 3 ? [[0, 0, 0, s.r * HYDRATED * 1.2]] : P.shapes[s.shape][['lodU', 'lod0', 'lod1'][lod]];

// Cut-face tile: ribosomes, cytoplasmic and envelope proteins, and nucleoid DNA in the layer behind the cutaway.
function postTile({ key, x0, x1, y0, y1, z0, z1, lod }) {
  const r = rng(hash(Math.round(x0), Math.round(y0), Math.round(z0 * 10) + lod * 7919)), out = makeOut(), e = emitter(out, r);
  const scale = lod === 3 ? 1 : HYDRATED, vol = (x1 - x0) * (y1 - y0) * (z1 - z0);
  const ribosomeShape = lod === 3 ? [[0, 0, 0, 1.05]] : ribosomeBeads([[60, 36], [40, 24], [12, 8]][lod]);
  const ribos = [];
  for (let i = 0, n = Math.round(densities.ribo * vol * 1.45); i < n; i++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), z0 + r() * (z1 - z0)];
    if (!inCytoplasm(...p, 1.3) || blocked(...p) || inZSlot(p[1]) || inNucleoid(...p, .95)) continue;
    ribos.push(p); e.molecule(p, SPECIAL.ribosome, ribosomeShape, ['#9a4fb5', '#b061c4', '#8b45a8'][i % 3], .04);
  }
  const spacing = Math.cbrt(1 / densities.cyto);
  for (let gx = Math.ceil(x0 / spacing); gx * spacing < x1; gx++) for (let gy = Math.ceil(y0 / spacing); gy * spacing < y1; gy++) for (let gz = Math.ceil(z0 / spacing); gz * spacing < z1; gz++) {
    const p = [(gx + (r() - .5) * .7) * spacing, (gy + (r() - .5) * .7) * spacing, (gz + (r() - .5) * .7) * spacing];
    if (!inCytoplasm(...p, .5) || blocked(...p) || inZSlot(p[1])) continue;
    if (inNucleoid(...p) && r() > .3) continue;
    if (ribos.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 < 1.4)) continue;
    const si = pick.cyto.idx[pick.cyto.sample(r)], s = P.species[si];
    e.molecule(p, si, shapeOf(s, lod), s.color, s.D, scale);
  }
  emitDNA(e, key, x0, x1, y0, y1, z0, z1, lod);
  send('tile', key, lod, out);
}

// Nucleoid DNA in a tile: one bead per step far away, a twisting double helix (3.4 nm pitch) with bound HU/H-NS/Fis up close.
function emitDNA(e, key, x0, x1, y0, y1, z0, z1, lod) {
  const ids = dnaBuckets.get(key.split('|')[0].replace(/^c:/, ''));
  if (!ids) return;
  const inBox = p => p[0] >= x0 && p[0] < x1 && p[1] >= y0 && p[1] < y1 && p[2] >= z0 && p[2] < z1;
  for (const k of ids) {
    const p = dna[k];
    if (!inBox(p)) continue;
    if (lod >= 2) { if (lod === 3 && k % 2) continue; e.bead(p, lod === 3 ? .3 : .2, k % 40 < 20 ? '#f3c63a' : '#e9a637', SPECIAL.dna); continue; }
    const q = dna[k + 1];
    if (!q || !q[3]) continue;
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], len = Math.hypot(...d), t = d.map(v => v / len);
    const n0 = Math.abs(t[1]) < .9 ? [0, 1, 0] : [1, 0, 0], nx = [t[1] * n0[2] - t[2] * n0[1], t[2] * n0[0] - t[0] * n0[2], t[0] * n0[1] - t[1] * n0[0]], nl = Math.hypot(...nx), n = nx.map(v => v / nl);
    const b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]], step = lod === 0 ? .06 : .11;
    for (let u = 0; u < len; u += step) {
      const a = (k * len + u) * 18.5;
      for (const [shift, color] of [[0, '#f3c63a'], [2.4, '#e9a637']]) {
        const c = Math.cos(a + shift), s = Math.sin(a + shift);
        e.bead([p[0] + d[0] * u / len + (n[0] * c + b[0] * s) * .07, p[1] + d[1] * u / len + (n[1] * c + b[1] * s) * .07, p[2] + d[2] * u / len + (n[2] * c + b[2] * s) * .07], lod === 0 ? .036 : .05, color, SPECIAL.dna);
      }
    }
    if (napSpecies.length && k % 5 === 0) { const si = napSpecies[k % napSpecies.length], s = P.species[si]; e.molecule([p[0] + n[0] * .2, p[1] + n[1] * .2, p[2] + n[2] * .2], si, shapeOf(s, lod), '#f08a3c', s.D * .05, HYDRATED); }
  }
}

// Envelope tile: for each atlas patch, the full envelope column the window used to hand-build. Outer membrane (lime heads,
// LPS core sugars, tails, dark inner heads), O-antigen fronds, a woven peptidoglycan layer, periplasmic proteins, the inner
// membrane bilayer, and inner/outer membrane proteins at measured density. lod 0 = full lattice with tails, 1 = half-density
// heads, 2 = sparse heads; proteins step 48 → 12 beads.
function postEnvelope({ key, cube, lod, cut }) {
  const seeds = atlas.get(cube), r = rng(hash(...cube.split(',').map(Number)) + 17 + lod), out = makeOut(), e = emitter(out, r);
  if (!seeds) { send('surface', key, lod, out); return; }
  const side = PATCH * 1.04, cell = PATCH * PATCH, step = [.115, .23, .38][lod], head = [.046, .085, .13][lod];
  for (const { axis, n, pin } of seeds) {
    const t1 = Math.abs(n[1]) < .9 ? [-n[2], 0, n[0]] : [1, 0, 0], l1 = Math.hypot(...t1), u = t1.map(v => v / l1), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const at = (rad, a, b) => [axis[0] + n[0] * (rad - pin) + u[0] * a + v[0] * b, axis[1] + n[1] * (rad - pin) + u[1] * a + v[1] * b, axis[2] + n[2] * (rad - pin) + u[2] * a + v[2] * b];
    if (at(40, 0, 0)[2] > cut + 1.2) continue;
    const k = Math.max(1, Math.round(side / step));
    for (let ia = 0; ia < k; ia++) for (let ib = 0; ib < k; ib++) {
      const a = (ia / k - .5) * side + (r() - .5) * .04, b = (ib / k - .5) * side + (r() - .5) * .04, q = at(40, a, b);
      if (inDisc(q[0], q[1], q[2])) continue;
      // Outer membrane: outer leaflet (30% LPS core instead of a plain head), tails toward the midplane, inner leaflet.
      if (r() < .28) e.bead(at(40.09, a, b), head, r() < .5 ? '#f3d84e' : '#e8c43a', SPECIAL.lps);
      else e.bead(at(40 + (r() - .5) * .05, a, b), head * (.85 + r() * .3), '#aaf34b', SPECIAL.lipid, .85 + .15 * r());
      e.bead(at(39.73, a, b), head * 1.05, '#638a41', SPECIAL.lipid);
      if (lod === 0) for (const [rad, rr, col, sh] of [[39.92, .03, '#d9f3a6', .74], [39.81, .03, '#a9c97e', .74]]) e.bead(at(rad, a + (r() - .5) * .02, b), rr, col, SPECIAL.lipid, sh);
      // Inner membrane: pale outer heads, tails, darker cytoplasmic heads.
      e.bead(at(36.85 + (r() - .5) * .05, a, b), head * (.85 + r() * .3), '#a9e7dc', SPECIAL.imLipid);
      e.bead(at(36.58, a, b), head * 1.05, '#639e9e', SPECIAL.imLipid);
      if (lod === 0) for (const [rad, rr, col, sh] of [[36.77, .03, '#d3f1ea', .74], [36.66, .03, '#9fcfca', .74]]) e.bead(at(rad, a + (r() - .5) * .02, b), rr, col, SPECIAL.imLipid, sh);
    }
    // Peptidoglycan: wavy glycan strands with peptide stems.
    if (lod < 2) {
      const lines = lod === 0 ? 8 : 4, beadStep = lod === 0 ? .058 : .116;
      for (let li = 0; li < lines; li++) {
        const b0 = (li / lines - .5) * side + .1, ph = r() * 6.283;
        let m = 0;
        for (let a = -side / 2; a < side / 2; a += beadStep) {
          const b = b0 + Math.sin(a * 1.3 + ph) * .045, q = at(39.02 + Math.sin(a * 2.2 + ph) * .035, a, b);
          if (inDisc(q[0], q[1], q[2])) continue;
          e.bead(q, lod === 0 ? .04 : .07, '#efe7cc', SPECIAL.wall, .86 + .14 * Math.sin(a * 9 + ph));
          if (lod === 0 && ++m % 7 === 0) { const dir = m % 14 === 0 ? 1 : -1; for (let s = 1; s < 4; s++) e.bead(at(39.02 + dir * s * .05, a + s * .01, b + s * .05), .026, '#d9cfa5', SPECIAL.wall, .8); }
        }
      }
    }
    // O-antigen fronds: sugar chains rising from the surface; their beads sway (stored as offsets from the root).
    const fronds = [2, 1, 0][lod] + (r() < .5 ? 1 : 0);
    for (let f = 0; f < fronds; f++) {
      const a = (r() - .5) * side, b = (r() - .5) * side, base = at(40.12, a, b);
      if (inDisc(base[0], base[1], base[2])) continue;
      const len = .9 + r() * 2.6, lean = [r() - .5, r() - .5], pale = r() < .5, stepF = lod === 0 ? .06 : .12;
      for (let s = 0; s < len; s += stepF) {
        const q = at(40.12 + s, a + lean[0] * s * .3 + Math.sin(s * 3 + f) * .05, b + lean[1] * s * .3);
        out.center.push(base[0], base[1], base[2]); out.offset.push(q[0] - base[0], q[1] - base[1], q[2] - base[2]);
        out.radius.push((lod === 0 ? .034 : .05) * (1 - .35 * s / len)); const c = hex(s > len - .14 ? '#f0efb8' : pale ? '#e2eb9c' : '#cfdc86');
        out.color.push(c[0], c[1], c[2]); out.seed.push(out.molecules++ % 60000); out.shade.push(1); out.species.push(SPECIAL.lps + 1);
      }
    }
    // Membrane and periplasmic proteins at their measured densities.
    const shape = s => shapeOf(s, lod === 2 ? 2 : 1);
    const place = (from, expected, radius, thick) => {
      for (let m = 0, count = Math.floor(expected) + (r() < expected % 1 ? 1 : 0); m < count; m++) {
        const si = from.idx[from.sample(r)], s = P.species[si], q = at(radius + r() * thick, (r() - .5) * side, (r() - .5) * side);
        if (inDisc(q[0], q[1], q[2])) continue;
        e.molecule(q, si, shape(s), s.color, s.D * .15, HYDRATED);
      }
    };
    place(pick.om, densities.om * cell, 39.86, 0);
    place(pick.im, densities.im * cell, 36.72, 0);
    place(pick.peri, densities.peri * cell * 1.7, 37.25, 1.5);
  }
  send('surface', key, lod, out);
}

// 70S ribosome: large (50S) and small (30S) subunits as two lumpy clusters, ~21 nm across.
function ribosomeBeads([nLarge, nSmall]) {
  const r = rng(424242), beads = [];
  const lump = (n, c, rad, br, small) => { for (let i = 0; i < n; i++) { const a = r() * 6.2832, b = Math.acos(r() * 2 - 1), d = Math.cbrt(r()) * rad; beads.push([c[0] + Math.sin(b) * Math.cos(a) * d * 1.05, c[1] + Math.cos(b) * d * .9, c[2] + Math.sin(b) * Math.sin(a) * d, br * (.8 + r() * .4), small]); } };
  lump(nLarge, [-.18, -.05, 0], .62, nLarge > 40 ? .2 : nLarge > 20 ? .26 : .4, 0); lump(nSmall, [.52, .2, .08], .42, nSmall > 24 ? .18 : nSmall > 12 ? .22 : .32, 1);
  return beads;
}
