"""Prepare representative molecular shape templates; not a bacterial inventory.

Usage: python scripts/prepare-molecules.py INPUT_PDB_DIRECTORY
Source coordinates: RCSB PDB 1LYZ, 1UBQ, 1ATP, 1GZX.
Coordinates are centered and rescaled for illustration. Waters, alternate
conformers and hydrogens are excluded. Buried atoms are culled using a small
solvent-accessibility sampling kernel; retained radii are illustrative.
"""
import json
import math
from pathlib import Path
import sys

directions = []
for i in range(18):
    y = 1 - 2 * (i + .5) / 18
    r = math.sqrt(1-y*y)
    directions.append((r*math.cos(i*2.399963), y, r*math.sin(i*2.399963)))
templates = []
for code in ['1LYZ', '1UBQ', '1ATP', '1GZX']:
    atoms = []
    for line in (Path(sys.argv[1]) / f'{code}.pdb').read_text().splitlines():
        if line.startswith('ENDMDL'): break
        if not line.startswith('ATOM  ') or line[16] not in ' A': continue
        if line[76:78].strip() in ('H', 'D'): continue
        atoms.append(tuple(float(line[k:k+8]) for k in (30, 38, 46)))
    center = [(min(p[j] for p in atoms)+max(p[j] for p in atoms))/2 for j in range(3)]
    scale = max(math.dist(p, center) for p in atoms)
    grid = {}
    for i, p in enumerate(atoms): grid.setdefault(tuple(math.floor(v/5) for v in p), []).append(i)
    points = []
    for i, p in enumerate(atoms):
        cell = tuple(math.floor(v/5) for v in p)
        neighbors = [atoms[k] for dx in (-1,0,1) for dy in (-1,0,1) for dz in (-1,0,1)
                     for k in grid.get((cell[0]+dx,cell[1]+dy,cell[2]+dz),[]) if k != i and math.dist(p,atoms[k]) < 5.8]
        exposed = 0
        for d in directions:
            q = tuple(p[j]+d[j]*3.1 for j in range(3))
            if all(math.dist(q,n)>2.95 for n in neighbors): exposed += 1
        if exposed:
            points.extend([*[round((p[j]-center[j])/scale,4) for j in range(3)],round(1.94/scale,4),round(.48+.52*min(exposed/9,1),3)])
    templates.append({'pdb':code,'source':f'https://www.rcsb.org/structure/{code}','atoms':points})
    print(code, len(atoms), 'atoms ->',len(points)//5,'surface atoms')
out = Path(__file__).resolve().parents[1]/'dist/assets/molecules.json'
out.write_text(json.dumps(templates,separators=(',',':')))
