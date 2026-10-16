# Micro — Molecular Lab

Interactive, illustrative bacterial cutaway inspired by the supplied reference video. A rotating flagellar motor sits inside a layered envelope and crowded molecular interior. Molecular identities, dimensions, timing, and pathways are schematic.

Run locally with Python 3:

```powershell
python -m http.server 8080 --directory dist
```

Open http://localhost:8080. All runtime dependencies are vendored; no package install or build is needed. Three.js 0.180.0 is distributed under the MIT license in dist/vendor/THREE-LICENSE.txt.

Drag to orbit, scroll or pinch to zoom, right-drag to pan, Space to pause, R to reset, and H to hide the controls. Rendering uses instanced sphere impostors with analytic depth, bounded SDF raymarching for selected molecular complexes, and a depth-based ambient occlusion composite. Cutaway and quality controls are interactive. Balanced quality is the starting setting; reduce quality on slower devices.

The original reference video is not included in the site. Sites identity and static hosting configuration are in .openai/hosting.json. Source synchronization and publication use the Sites skill's workflow helper.

The fullscreen viewer starts with controls closed. Open Controls for layer and playback settings, or use the floating camera presets. Tour cycles through the three views; dragging the camera or choosing a preset stops it.

The active scene combines independent protein tumbling/drift, flexible surface strands, small membrane movements, anchored local machinery motion, and stylized cargo/ion transport. Every animated subsystem uses simulation time and freezes when paused. Fine surfaces add procedural granules around source atoms; these are visual detail, not extra measured atoms. Performance mode disables the extra granules, thins source atoms across the scene, and reduces resolution.

Molecular shape data comes from transformed surface atoms in RCSB PDB entries [1LYZ](https://www.rcsb.org/structure/1LYZ), [1UBQ](https://www.rcsb.org/structure/1UBQ), [1ATP](https://www.rcsb.org/structure/1ATP), and [1GZX](https://www.rcsb.org/structure/1GZX). These are representative shape templates, including non-bacterial proteins, not a claim that these molecules belong in this cell or motor. Atom radii, scale, packing, and animation are illustrative. Source coordinates are not fetched at runtime. Regenerate the compact surface-atom library by downloading those four .pdb files from files.rcsb.org/download into a local directory, then running `python scripts/prepare-molecules.py <directory>`.
