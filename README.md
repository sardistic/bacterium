# Micro — Molecular Lab

Live: https://bacterium.sardistic.com (GitHub Pages, deployed from `dist/` by `.github/workflows/pages.yml` on every push to `main`).

Interactive, illustrative bacterial cutaway inspired by the supplied reference video. A rotating flagellar motor sits inside a layered envelope and crowded molecular interior. Molecular identities, dimensions, timing, and pathways are schematic.

Run locally with Python 3:

```powershell
python -m http.server 8080 --directory dist
```

Open http://localhost:8080. All runtime dependencies are vendored; no package install or build is needed. Three.js 0.180.0 is distributed under the MIT license in dist/vendor/THREE-LICENSE.txt.

Drag to orbit, scroll or pinch to zoom, right-drag to pan, Space to pause, R to reset, and H to hide the controls. Rendering uses instanced sphere impostors with analytic depth, bounded SDF raymarching for selected molecular complexes, and a depth-based ambient occlusion composite. Cutaway and quality controls are interactive. Balanced quality is the starting setting; reduce quality on slower devices.

The original reference video is not included in the site. Sites identity and static hosting configuration are in .openai/hosting.json. Source synchronization and publication use the Sites skill's workflow helper.

The fullscreen viewer starts with controls closed. Open Controls for layer and playback settings, or use the floating camera presets. Tour cycles through the three views; dragging the camera or choosing a preset stops it.

The Cell view zooms out to the whole bacterium at true scale: an E. coli-like rod about 2.2 µm long, cut open mid-division. It shows its flagellar bundle (which splays apart when the cell tumbles), pili, two separating chromosomes, ribosome-rich cytoplasm, a treadmilling FtsZ division ring and pole-to-pole Min oscillation. The detailed molecular window sits at its top pole.

Whole-cell proteome (revision 10). The whole cell is built from measured E. coli K-12 MG1655 data:
- **Copy numbers:** PaxDb's integrated whole-organism abundances, scaled to about 3 million proteins per µm³ (1.86M proteins and 9,482 ribosomes in this cell).
- **Compartments and names:** UniProt UP000000625.
- **Shapes:** AlphaFold DB models of the 700 most abundant species, which make up 89% of all molecules. Each is coarse-grained to 48 and 12 beads by k-means on confident Cα atoms; rarer species borrow a similar-sized shape.

`python scripts/build-proteome.py <cache-dir>` regenerates `dist/cell/proteome.json`. The downloads are cached outside the repo, and the script reuses one HTTPS connection per host.

At runtime, `dist/cellworker.js` generates 12×12-unit tiles of molecules in the layer behind the cutaway, deterministically and only for tiles in view. Detail depends on camera distance: 48-bead shapes up close, 12-bead at mid range, single beads far away. Click a molecule to identify it.

Rendering holds 60 fps through several techniques:
- point-sprite impostors (one vertex per bead);
- spatially chunked bead batches with frustum culling;
- per-chunk distance tiers;
- level of detail between the window and the whole cell;
- adaptive resolution while running.

AlphaFold models are CC BY 4.0, and UniProt is CC BY 4.0; both are attributed in the app.

Every structure carries an annotation pin. Select a pin, or pick a structure in Controls → Field guide, to see what it does, how this model simplifies it, and its literature sources (DOI links checked against Crossref, defined in dist/annotations.js). The flagellar filament places flagellin subunits on the measured one-start helix and rotates as a supercoiled helix with the motor. The hook is a woven, flared sleeve, and the stators are spinning MotA pentamers.

Revision 6 adds film-style lighting: motion blur on spinning parts, depth of field, ambient occlusion, contact shadows and a color grade. Performance quality turns the extras off. The scene now shows live processes. The motor switches between runs and tumbles when CheY-P docks (the status pill at the top reports each switch, and Controls can turn it off). Ribosomes translate mRNA into growing protein chains, ATP synthase rotors spin, and efflux pumps expel drugs. The envelope shows bilayer tails, a woven cell wall, dense LPS and a periplasmic proton pool.

The active scene combines independent protein tumbling/drift, flexible surface strands, small membrane movements, anchored local machinery motion, and stylized cargo/ion transport. Every animated subsystem uses simulation time and freezes when paused. Fine surfaces add procedural granules around source atoms; these are visual detail, not extra measured atoms. Performance mode disables the extra granules, thins source atoms across the scene, and reduces resolution.

Molecular shape data comes from transformed surface atoms in RCSB PDB entries [1LYZ](https://www.rcsb.org/structure/1LYZ), [1UBQ](https://www.rcsb.org/structure/1UBQ), [1ATP](https://www.rcsb.org/structure/1ATP), and [1GZX](https://www.rcsb.org/structure/1GZX). These are representative shape templates, including non-bacterial proteins, not a claim that these molecules belong in this cell or motor. Atom radii, scale, packing, and animation are illustrative. Source coordinates are not fetched at runtime. Regenerate the compact surface-atom library by downloading those four .pdb files from files.rcsb.org/download into a local directory, then running `python scripts/prepare-molecules.py <directory>`.

Sound starts off. Tap the speaker to enable muted, interpretive sound; camera distance controls blend, filtering, and stereo motor placement. Pause and tab visibility silence the mix. Controls includes volume and a separate floating-white-speck toggle. Procedural preview sounds work fully offline after the app loads.

ElevenLabs replacement workflow: no connection or API key was configured when this version was built, so no provider generation has run. The current sound is procedural. Inspect the sound briefs with:

```powershell
python scripts/generate-soundscape.py
```

After configuring ELEVENLABS_API_KEY in the local process environment (never in source or browser code), explicitly generate the three paid looping stems:

```powershell
python scripts/generate-soundscape.py --generate
```

The generator uses the [ElevenLabs sound-effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), stores fluid/motor/membrane MP3s locally, and switches assets/audio/manifest.json only after all three succeed. Validate playback and publish the same Site to serve them. The mixer level-matches supplied stems and retains the same distance behavior. Missing/incomplete assets fall back to procedural preview. No API key is embedded in the site.

Checks for the current source:

```powershell
npm run check
python -m unittest discover -s tests -v
```

The Python tests mock provider responses and make no paid requests. They cover the no-request default, missing-key guard, complete local asset/manifest assembly, and preservation of existing audio after a partial provider failure.
