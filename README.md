# Micro — Molecular Lab

Interactive, illustrative bacterial cutaway inspired by the supplied reference video. A rotating flagellar motor sits inside a layered envelope and crowded molecular interior. Molecular identities, dimensions, timing, and pathways are schematic.

Run locally with Python 3:

```powershell
python -m http.server 8080 --directory dist
```

Open http://localhost:8080. All runtime dependencies are vendored; no package install or build is needed. Three.js 0.180.0 is distributed under the MIT license in dist/vendor/THREE-LICENSE.txt.

Drag to orbit, scroll or pinch to zoom, right-drag to pan, Space to pause, R to reset, and H to hide the controls. Rendering uses instanced sphere impostors with analytic depth, bounded SDF raymarching for selected molecular complexes, and a depth-based ambient occlusion composite. Cutaway and quality controls are interactive. Balanced quality is the starting setting; reduce quality on slower devices.

The original reference video is not included in the site. Sites identity and static hosting configuration are in .openai/hosting.json. Source synchronization and publication use the Sites skill's workflow helper.
