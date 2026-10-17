"""Build dist/cell/proteome.json: the E. coli K-12 MG1655 proteome as the whole-cell layer draws it.

Inputs (downloaded into a cache directory, never committed):
  * PaxDb integrated whole-organism abundance for taxon 511145 (ppm), Wang et al. 2015.
  * UniProt reviewed proteome UP000000625: locus tags, mass, subcellular location, names.
  * AlphaFold DB models (CC-BY 4.0) for the most abundant species.

Output: species with copies per cell, compartment, size, diffusion coefficient, colour, and coarse-grained
bead shapes at 48 and 12 beads (k-means on confident C-alpha atoms). Ribosomal proteins are folded into a
ribosome count instead of being placed as free proteins.

Usage: python scripts/build-proteome.py <cache-dir> [--species 700]
"""
import json, math, os, re, sys, time, urllib.request
import numpy as np

UA = {'User-Agent': 'Mozilla/5.0 (molecular-lab proteome build; research visualization)'}
PAXDB = 'https://pax-db.org/downloads/latest/datasets/511145/511145-WHOLE_ORGANISM-integrated.txt'
UNIPROT = ('https://rest.uniprot.org/uniprotkb/stream?query=proteome:UP000000625+AND+reviewed:true'
           '&fields=accession,gene_primary,gene_oln,length,mass,cc_subcellular_location,protein_name&format=tsv')
CELL_VOLUME_UM3 = 0.79          # capsule drawn in the app: 2.2 µm long, 0.8 µm wide (cytoplasm + envelope)
PROTEINS_PER_UM3 = 3.0e6        # Milo 2013
GFP_D, GFP_R_NM = 7.7, 0.066 * 26900 ** (1 / 3)  # Elowitz et al. 1999; GFP radius from the same mass formula

_connections = {}
def _get(url):
    """GET over one persistent HTTPS connection per host (many short-lived sockets exhaust Windows' socket buffers)."""
    import http.client, urllib.parse
    u = urllib.parse.urlsplit(url)
    for attempt in range(5):
        try:
            conn = _connections.get(u.netloc) or http.client.HTTPSConnection(u.netloc, timeout=60)
            _connections[u.netloc] = conn
            conn.request('GET', u.path + ('?' + u.query if u.query else ''), headers=UA | {'Connection': 'keep-alive'})
            r = conn.getresponse(); body = r.read()
            if r.status == 200:
                return body
            raise RuntimeError(f'HTTP {r.status}')
        except Exception as e:
            _connections.pop(u.netloc, None); err = e; time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'download failed: {url}: {err}')

def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 200:
        return path
    with open(path + '.part', 'wb') as f:
        f.write(_get(url))
    os.replace(path + '.part', path)
    return path

def compartment(text):
    """UniProt lists the primary location first; use whichever recognised location is named earliest."""
    t = text.lower()
    keys = (('cell outer membrane', 'om'), ('periplasm', 'peri'), ('cell inner membrane', 'im'), ('cell membrane', 'im'), ('cytoplasm', 'cyto'),
            ('secreted', 'out'), ('flagellum', 'out'), ('fimbri', 'out'), ('cell surface', 'out'))
    hits = [(t.find(k), label) for k, label in keys if k in t]
    return min(hits)[1] if hits else 'cyto'

def kmeans(points, k, seed=7, iters=25):
    rng = np.random.default_rng(seed)
    k = min(k, len(points))
    centers = points[[rng.integers(len(points))]]
    while len(centers) < k:  # k-means++ seeding
        d2 = ((points[:, None, :] - centers[None]) ** 2).sum(-1).min(1)
        centers = np.vstack([centers, points[rng.choice(len(points), p=d2 / d2.sum())]])
    for _ in range(iters):
        lab = ((points[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
        centers = np.array([points[lab == i].mean(0) if (lab == i).any() else centers[i] for i in range(k)])
    lab = ((points[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
    radii = np.array([np.sqrt(((points[lab == i] - centers[i]) ** 2).sum(-1).mean()) if (lab == i).any() else 2.0 for i in range(k)])
    return centers, radii

def shape(pdb_path, k):
    ca, plddt = [], []
    for line in open(pdb_path, encoding='utf-8', errors='ignore'):
        if line.startswith('ATOM') and line[12:16].strip() == 'CA':
            ca.append([float(line[30:38]), float(line[38:46]), float(line[46:54])]); plddt.append(float(line[60:66]))
    ca, plddt = np.array(ca), np.array(plddt)
    keep = plddt >= 50 if (plddt >= 50).sum() >= 24 else np.ones(len(ca), bool)  # drop disordered tails
    pts = ca[keep] - ca[keep].mean(0)
    centers, radii = kmeans(pts, k)
    # Scene units: 1 unit = 10 nm = 100 Å. Bead radius covers its cluster plus a residue's half-width.
    return [[round(float(c[0]) / 100, 4), round(float(c[1]) / 100, 4), round(float(c[2]) / 100, 4), round(float(r + 3.2) / 100, 4)] for c, r in zip(centers, radii)]

def main():
    cache = sys.argv[1]; os.makedirs(os.path.join(cache, 'af'), exist_ok=True)
    n_species = int(sys.argv[sys.argv.index('--species') + 1]) if '--species' in sys.argv else 700
    pax = {}
    for line in open(fetch(PAXDB, os.path.join(cache, 'paxdb.txt')), encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        parts = line.rstrip('\n').split('\t')
        pax[parts[1].split('.')[-1]] = float(parts[2])
    rows = open(fetch(UNIPROT, os.path.join(cache, 'uniprot.tsv')), encoding='utf-8').read().splitlines()[1:]
    total = CELL_VOLUME_UM3 * PROTEINS_PER_UM3
    species, ribosomal = [], []
    for row in rows:
        acc, gene, oln, length, mass, loc, name = (row.split('\t') + [''] * 7)[:7]
        bnum = next((t for t in oln.split() if re.fullmatch(r'b\d{4}', t)), None)
        ppm = pax.get(bnum, 0)
        if not ppm:
            continue
        copies = ppm * 1e-6 * total
        if re.fullmatch(r'rp[lsm][A-Z]\d*|rps[A-Z]|rpl[A-Z]', gene or ''):
            ribosomal.append((gene, copies)); continue
        comp = compartment(loc)
        if comp == 'out':
            continue
        m = float(mass or 0)
        r_nm = 0.066 * m ** (1 / 3)  # Erickson 2009: minimal radius of a globular protein of mass M (Da)
        species.append({'acc': acc, 'gene': gene, 'name': name.split(' (')[0][:80], 'copies': copies, 'comp': comp,
                        'mass': int(m), 'len': int(length or 0), 'r': round(r_nm / 10, 4), 'D': round(GFP_D * GFP_R_NM / max(r_nm, .5), 3)})
    species.sort(key=lambda s: -s['copies'])
    ribo_small = [c for g, c in ribosomal if g.startswith('rps')]
    ribosomes = float(np.median(ribo_small)) if ribo_small else 20000.0
    top = species[:n_species]
    covered = sum(s['copies'] for s in top) / sum(s['copies'] for s in species)
    print(f'{len(species)} placed species, ribosomes ≈ {ribosomes:.0f}, top {len(top)} cover {covered:.1%} of molecules', flush=True)
    for i, s in enumerate(top):
        meta = json.loads(_get(f"https://alphafold.ebi.ac.uk/api/prediction/{s['acc']}")) if not os.path.exists(os.path.join(cache, 'af', s['acc'] + '.pdb')) else None
        path = os.path.join(cache, 'af', s['acc'] + '.pdb')
        if meta:
            fetch(meta[0]['pdbUrl'], path)
        s['lod0'] = shape(path, 48); s['lod1'] = shape(path, 12)
        if i % 50 == 0:
            print(f'  shapes {i}/{len(top)}', flush=True)
    palette = {'cyto': ['#51c8d6', '#8cdee0', '#42bacb', '#5acbd3', '#51b5d2', '#83c9ed', '#9bbbf2', '#7fb0ec', '#76d4c6', '#b1a7ef', '#ed95d6', '#f2b5de', '#c57dd3'],
               'im': ['#5fcfb9', '#3fb6a0', '#69c7b2', '#8ed8c6'], 'om': ['#3fb69c', '#57c9ab', '#7fdcbc'], 'peri': ['#ddbd57', '#e7cf79', '#d9b24a']}
    out_species = []
    for i, s in enumerate(species):
        shaped = top[min(range(len(top)), key=lambda j: abs(top[j]['r'] - s['r']))] if 'lod0' not in s else s
        colors = palette[s['comp']]
        out_species.append({k: s[k] for k in ('acc', 'gene', 'name', 'comp', 'mass', 'len', 'r', 'D')} |
                           {'copies': round(s['copies']), 'color': colors[i % len(colors)], 'shape': top.index(shaped), 'own': 'lod0' in s})
    doc = {'source': {'abundance': 'PaxDb 511145 WHOLE_ORGANISM integrated (Wang et al. 2015)', 'proteome': 'UniProt UP000000625 reviewed',
                      'structures': 'AlphaFold DB (Varadi et al. 2022), CC-BY 4.0', 'built': time.strftime('%Y-%m-%d')},
           'totalProteins': round(sum(s['copies'] for s in species)), 'ribosomes': round(ribosomes), 'coverage': round(covered, 4),
           'species': out_species, 'shapes': [{'acc': s['acc'], 'lod0': s['lod0'], 'lod1': s['lod1']} for s in top]}
    os.makedirs(os.path.join('dist', 'cell'), exist_ok=True)
    with open(os.path.join('dist', 'cell', 'proteome.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, separators=(',', ':'))
    print('wrote dist/cell/proteome.json', os.path.getsize(os.path.join('dist', 'cell', 'proteome.json')) // 1024, 'KB')

if __name__ == '__main__':
    main()
