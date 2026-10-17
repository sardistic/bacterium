// Generates whole-cell tiles on demand: real E. coli species at their measured abundance, placed in the thin
// layer behind the cutaway plane. Deterministic per tile, so revisiting a tile rebuilds the same molecules.
let P = null, aliasCyto = null, aliasIm = null, aliasOm = null, aliasPeri = null, densities = null;
const TOP = -35, BOTTOM = -175, MID = -105;
const pinch = y => 3.5 * Math.exp(-(((y - MID) / 7) ** 2));
const radiusAt = (r, y) => (y < TOP && y > BOTTOM ? r - pinch(y) : r);
const inSlab = (x, y, z) => Math.abs(x) < 21.5 && y > -13.4 && z > -12.5 && z < 5;
const inZSlot = y => Math.abs(y - MID) < 4.5;
const nucleoids = [[0, -72, 0], [0, -138, 0]], nucR = [17, 26, 17];
const inNucleoid = (x, y, z, s = 1) => nucleoids.some(c => ((x - c[0]) / nucR[0]) ** 2 + ((y - c[1]) / nucR[1]) ** 2 + ((z - c[2]) / nucR[2]) ** 2 < s * s);
const axisDistance = (x, y, z) => { const yy = Math.min(TOP, Math.max(BOTTOM, y)); return Math.hypot(x, y - yy, z); };
const inCytoplasm = (x, y, z, margin) => axisDistance(x, y, z) < radiusAt(36.3, y) - margin;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function hash(a, b, c) { let h = 2166136261 ^ a; h = Math.imul(h ^ b, 16777619); h = Math.imul(h ^ c, 16777619); return h >>> 0; }
// Walker alias table: O(1) sampling of species by copy number.
function alias(weights) {
  const n = weights.length, total = weights.reduce((a, b) => a + b, 0), prob = new Float64Array(n), al = new Int32Array(n), small = [], large = [];
  weights.forEach((w, i) => { prob[i] = w * n / total; (prob[i] < 1 ? small : large).push(i); });
  while (small.length && large.length) { const s = small.pop(), l = large.pop(); al[s] = l; prob[l] -= 1 - prob[s]; (prob[l] < 1 ? small : large).push(l); }
  return r => { const i = Math.floor(r() * n), u = r(); return u < prob[i] ? i : al[i]; };
}
function rotate(q, v) { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; }
function randomQuat(r) { const u1 = r(), u2 = r() * 6.2832, u3 = r() * 6.2832, a = Math.sqrt(1 - u1), b = Math.sqrt(u1); return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)]; }

onmessage = ({ data }) => {
  if (data.type === 'init') {
    P = data.proteome;
    const by = comp => { const idx = P.species.map((s, i) => [s, i]).filter(([s]) => s.comp === comp); return { idx: idx.map(([, i]) => i), sample: alias(idx.map(([s]) => s.copies)), total: idx.reduce((a, [s]) => a + s.copies, 0) }; };
    aliasCyto = by('cyto'); aliasIm = by('im'); aliasOm = by('om'); aliasPeri = by('peri');
    // Densities per unit³ / unit² from total copies over the drawn compartments (1 unit = 10 nm).
    const cytoVol = Math.PI * 36.3 ** 2 * 140 + 4 / 3 * Math.PI * 36.3 ** 3, imArea = 2 * Math.PI * 36.7 * 140 + 4 * Math.PI * 36.7 ** 2, omArea = 2 * Math.PI * 39.9 * 140 + 4 * Math.PI * 39.9 ** 2;
    const periVol = (2 * Math.PI * 38 * 140 + 4 * Math.PI * 38 ** 2) * 1.7;
    densities = { cyto: aliasCyto.total / cytoVol, ribo: P.ribosomes / cytoVol, im: aliasIm.total / imArea, om: aliasOm.total / omArea, peri: aliasPeri.total / periVol };
    postMessage({ type: 'ready', densities });
    return;
  }
  if (data.type === 'tile') postTile(data);
};

function postTile({ key, x0, x1, y0, y1, z0, z1, lod }) {
  const r = rng(hash(Math.round(x0), Math.round(y0), Math.round(z0 * 10) + lod * 7919));
  const out = { center: [], offset: [], radius: [], color: [], seed: [], shade: [], species: [] };
  let local = 0;
  const hex = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
  const colorCache = new Map(), col = c => { if (!colorCache.has(c)) colorCache.set(c, hex(c)); return colorCache.get(c); };
  // Emit one molecule: a single bead far away, or its coarse-grained AlphaFold shape up close.
  function emit(pos, speciesIndex, beads, color, D, scale = 1) {
    const amp = Math.min(.98, .12 + Math.sqrt(D) * .22), seed = (local++ % 60000) + amp, q = randomQuat(r), c = col(color);
    for (const b of beads) {
      const o = rotate(q, b);
      out.center.push(pos[0], pos[1], pos[2]); out.offset.push(o[0] * scale, o[1] * scale, o[2] * scale); out.radius.push(b[3] * scale);
      const cc = b[4] ? col('#d58bd8') : c; out.color.push(cc[0], cc[1], cc[2]); out.seed.push(seed); out.shade.push(.72 + .28 * r()); out.species.push(speciesIndex + 1);
    }
  }
  // Erickson's radius is the minimal dense sphere; hydrated proteins are ~25% larger (and fill ~20-30% of cytoplasm), so draw them that size.
  const HYDRATED = 1.25, shapeFor = s => lod === 2 ? [[0, 0, 0, s.r * HYDRATED * 1.2]] : P.shapes[s.shape][lod === 0 ? 'lod0' : 'lod1'];
  const ribosomeShape = lod === 2 ? [[0, 0, 0, 1.05]] : ribosomeBeads(lod === 0 ? [40, 24] : [12, 8]);
  const vol = (x1 - x0) * (y1 - y0) * (z1 - z0);
  // Ribosomes first (kept out of the nucleoids), then cytoplasmic proteins on a jittered grid that avoids them.
  const ribos = [];
  const nRibo = Math.round(densities.ribo * vol * 1.45);
  for (let i = 0; i < nRibo; i++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), z0 + r() * (z1 - z0)];
    if (!inCytoplasm(...p, 1.3) || inSlab(...p) || inZSlot(p[1]) || inNucleoid(...p, .95)) continue;
    ribos.push(p); emit(p, 65000, ribosomeShape, ['#9a4fb5', '#b061c4', '#8b45a8'][i % 3], .04);
  }
  const spacing = Math.cbrt(1 / densities.cyto);
  for (let gx = Math.ceil(x0 / spacing); gx * spacing < x1; gx++) for (let gy = Math.ceil(y0 / spacing); gy * spacing < y1; gy++) for (let gz = Math.ceil(z0 / spacing); gz * spacing < z1; gz++) {
    const p = [(gx + (r() - .5) * .7) * spacing, (gy + (r() - .5) * .7) * spacing, (gz + (r() - .5) * .7) * spacing];
    if (!inCytoplasm(...p, .5) || inSlab(...p) || inZSlot(p[1])) continue;
    if (inNucleoid(...p) && r() > .35) continue;
    if (ribos.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 < 1.4)) continue;
    const si = aliasCyto.idx[aliasCyto.sample(r)], s = P.species[si];
    emit(p, si, shapeFor(s), s.color, s.D, lod === 2 ? 1 : HYDRATED);
  }
  // Envelope: proteins on the inner and outer membranes, and in the periplasm, inside this tile's slice of the band.
  const shell = (radius, count, pick, thick = 0) => {
    for (let i = 0; i < count; i++) {
      const y = y0 + r() * (y1 - y0), z = z0 + r() * (z1 - z0), rr = radiusAt(radius + (thick ? r() * thick : 0), y);
      const cap = y > TOP ? y - TOP : y < BOTTOM ? y - BOTTOM : 0, h2 = rr * rr - cap * cap - z * z;
      if (h2 <= 0) continue;
      const x = (r() < .5 ? -1 : 1) * Math.sqrt(h2);
      if (x < x0 || x > x1 || inSlab(x, y, z)) continue;
      const si = pick.idx[pick.sample(r)], s = P.species[si];
      emit([x, y, z], si, shapeFor(s), s.color, s.D * .2, lod === 2 ? 1 : HYDRATED);
    }
  };
  const span = (y1 - y0) * (z1 - z0) * 2;
  shell(36.72, Math.round(densities.im * span), aliasIm);
  shell(39.86, Math.round(densities.om * span), aliasOm);
  shell(37.2, Math.round(densities.peri * span * 1.7), aliasPeri, 1.7);

  const buf = k => new Float32Array(out[k]);
  const arrays = { center: buf('center'), offset: buf('offset'), radius: buf('radius'), color: buf('color'), seed: buf('seed'), shade: buf('shade'), species: buf('species') };
  postMessage({ type: 'tile', key, lod, count: out.radius.length, molecules: local, arrays }, Object.values(arrays).map(a => a.buffer));
}

// 70S ribosome: large (50S) and small (30S) subunits as two lumpy clusters, ~21 nm across.
function ribosomeBeads([nLarge, nSmall]) {
  const r = rng(424242), beads = [];
  const lump = (n, c, rad, br, small) => { for (let i = 0; i < n; i++) { const a = r() * 6.2832, b = Math.acos(r() * 2 - 1), d = Math.cbrt(r()) * rad; beads.push([c[0] + Math.sin(b) * Math.cos(a) * d * 1.05, c[1] + Math.cos(b) * d * .9, c[2] + Math.sin(b) * Math.sin(a) * d, br * (.8 + r() * .4), small]); } };
  lump(nLarge, [-.18, -.05, 0], .62, nLarge > 20 ? .26 : .4, 0); lump(nSmall, [.52, .2, .08], .42, nSmall > 12 ? .22 : .32, 1);
  return beads;
}
