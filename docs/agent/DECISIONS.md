# Decisions

2026-10-15: Build a browser-local, buildless Three.js experience with vendored dependencies. Render molecular beads with instanced depth-writing sphere impostors, structured motor parts with meshes and beads, and selected proteins with bounded SDF raymarching. A shared depth buffer drives screen-space occlusion. Animation is illustrative, not atomistic dynamics or a validated biological model. The reference video is kept outside the application and is not published.

2026-10-15: New Sites publication is owner-private. Static output is the tracked dist directory. No analytics, external runtime requests, accounts, or storage are needed by the simulation.

2026-10-15: Visual fidelity revision replaces generic lobed protein spheres with solvent-exposed atom templates derived from RCSB PDB 1LYZ, 1UBQ, 1ATP, and 1GZX. The templates are transformed illustrative shape references, not bacterial protein identities or validated assemblies. Keep provenance in the app and README. The offline preparation script accepts downloaded PDB files; its compact output is vendored. Random spatial rejection replaces visible grid packing. The motor has a hollow cup, dense surface detail, and repeated subunits. Use a fullscreen viewer with floating controls and an optional three-view tour. Depth shading reconstructs view-space positions and normals, with depth-aware background softening.

2026-10-15: Activity/color revision lifts diffuse and fill illumination, uses a more saturated palette, reduces haze and background blur, and retains localized occlusion. Fine molecular batches use four small sphere surfaces per source atom via repeated base geometry, avoiding duplicated instance attributes. Performance mode disables these sub-surfaces and retains its one-third atom subset. Motion uses deterministic simulation-time GPU transforms: independent two-axis tumbling and bounded drift, small conformational changes, flexible exterior strands, lipid jitter, anchored local machinery rotations, and continuous approach/dwell/release cargo paths. Added stylized ion flow, metabolites, coiled nucleic-acid-like strands, and visible rotating motor ribs/spokes. These are artistic animation, not validated mechanisms or dynamics. All motion freezes with playback, including reduced-motion startup. Default playback is 1x. Version the app entry URL to refresh the renderer after publication.

2026-10-15: Add a separate depth-tested, soft translucent suspension layer matching the reference's floating white specks. Cap their projected size and keep them out of the ambient-occlusion depth buffer. Add a shared organic deformation field to motor meshes and molecular surfaces, irregular shaft/collar coats, and curved granular internal links, keeping the motor axis and anchors coherent.

2026-10-15: Sound is opt-in and interpretive. The browser-local Web Audio mixer crossfades fluid, motor, and membrane textures by camera distance, with low-pass filtering, stereo placement, visibility-aware layers, volume control, and silence on pause/hidden tabs. Ship procedural preview audio because no ElevenLabs connection or environment key is configured. The local ElevenLabs generator is an explicit paid --generate operation; its default prints briefs without requests. It reads ELEVENLABS_API_KEY only from process memory and writes static MP3 stems plus a manifest after all generations succeed. Visitors never receive a provider key or invoke the provider. The mixer loads and level-matches generated local stems when available, with procedural fallback for absent/incomplete sets. Never describe the current procedural preview as ElevenLabs-generated audio.

2026-10-15: Reference-fidelity revision 5. Replace the straight beaded flagellum with a GPU-positioned filament: flagellin subunits follow the measured one-start helix (65.45° and 0.47 nm rise per subunit, giving 11 protofilaments). Each subunit has an inner core and a tangentially skewed outer knob, producing the reference's diagonal grooves. The centerline is a rigid supercoiled helix rotated by the rotor angle, so reversing the motor reverses the travelling wave, plus a lean and slow sway. The hook is a flared, woven FlgE sleeve. Stator units are MotA pentamers that spin about their own axes against the rotor. Membranes, porins, LPS and embedded machines share one undulation field that fades near the motor. Crowded proteins add a domain-hinge flex. CheY-P messengers travel from receptor stand-ins to the C ring. Every structure has an annotation pin and a field-guide entry with role, model simplifications and Crossref-checked DOI citations (dist/annotations.js). Annotations start on.

2026-10-15: Reference-fidelity revision 6 (lighting, envelope realism, live processes).
- Rendering: the scene renders to a two-attachment target (color plus screen-space velocity encoded as vel*12+.5). Bead, mesh and SDF shaders all write the velocity output, and dust writes zero alpha, so blending preserves what is beneath it. Rotor, stator and filament velocities come from a virtual shutter (rotor omega × 0.09 s).
- Post-processing adds motion blur, golden-angle depth of field focused on the orbit target, ambient occlusion, screen-space contact shadows toward the key light, and a cool-shadow/warm-highlight grade. Performance quality disables the extra effects.
- Bead lighting uses a wrapped warm key, hemispheric sky/ground ambient, sheen and a colored rim.
- Envelope: lipid bilayers with tails, LPS core beads and dense O-antigen tufts, woven peptidoglycan strands with peptide stems, a periplasmic proton pool, and AcrAB–TolC efflux pumps with expelled drugs.
- Interior:
  - The teal trees are reassigned as fibrous chemoreceptor arrays, and CheY-P leaves from their tips.
  - The lime blobs are relabelled as respiratory-complex stand-ins.
  - Six ATP synthases have a rotating c-ring and central stalk.
  - DNA is double-stranded with bound NAPs and a coherent polymer wiggle.
  - Three polysomes show mRNA sliding through ribosomes while nascent chains grow and release.
  - Large assemblies reserve packing space before the crowd fills in, and a dim backdrop wall replaces black gaps.
- Events: automatic chemotaxis run/tumble switching with eased rotor speed, a status pill, and a toggle; the idle camera drifts slowly while playing. Field guide: 31 entries and 33 Crossref-checked citations.

2026-10-15: Whole-cell revision 7.
- Envelope geometry: the slab's layers are now concentric spheres around (0,-35,0) (`surf`/`surfY`). This lets the detailed window sit at the top pole of a true-scale E. coli-like capsule: radius 40, caps centred at y=-35 and y=-175, and a 3.5-unit division pinch at y=-105.
- Coarse whole-cell layer, one sphere per macromolecule:
  - Lathed envelope shells with a hole where the window sits.
  - A section rim (kind 16) that follows the cutaway plane.
  - LPS tufts and type 1 pili as swaying hairs (kind 15).
  - Two segregating random-walk nucleoids, ribosomes excluded from them, and a protein crowd in a band behind the cut.
  - A treadmilling FtsZ ring (kind 18) seen through a clear midcell slot, and pole-to-pole MinD oscillation (kind 19).
  - Six peritrichous flagella wrapping into a rotating helical bundle that splays during tumbles (kind 17, `uTumble`).
- Rendering: camera far is 1600. Fog, ambient occlusion and contact-shadow scales follow orbit distance. Level of detail is reciprocal: the window thins to a third when the camera is more than 150 units away, and the coarse layer thins when close.
- Navigation and labels: camera flights interpolate distance in log space for large scale changes. A Cell view is added, and the tour is motor → envelope → interior → cell. Labels are scale-aware (whole-cell pins only when the orbit distance is over 110). The field guide has 38 entries and 41 Crossref-checked citations.

2026-10-15: Revision 8 (organic motion, blending, more machines and information).
- Motion: protein drift is now a Catmull-Rom wander through hashed random keyframes plus a small tremor, so speed and heading change irregularly. Metabolites and periplasmic protons diffuse farther and faster (kind 20). LPS sway comes in gusts that sweep across the surface.
- Blending: the post shader adds a depth-weighted 8-tap smoothing that merges neighbouring atoms of one molecule while keeping silhouettes.
- New machines:
  - RNA polymerase on a DNA template at the head of each polysome (expressome).
  - EF-Tu·tRNA ternary complexes that travel to ribosomes, dock and release (kind 22).
  - GroEL/GroES chaperonins whose lid caps, lifts away and returns (kind 21).
- Information:
  - A narrated tour of 11 stops, each opening its field-guide card.
  - A live scale bar.
  - A "By the numbers" panel of 7 cited facts.
  - Headings follow the flown-to structure.
- Field guide: 41 entries and 47 Crossref-checked citations.

2026-10-16: Revision 9 (live models, shaped whole-cell molecules, cinematic camera).
- New `dist/sim.js` with three models:
  - `MinSim`: the Howard, Rutenberg & de Vet (2001) 1D Min reaction–diffusion model with the published parameters and densities. Verified offline before porting: period about 104 s, and time-averaged total MinD at midcell 0.53× the pole value, matching the paper's midcell minimum. It runs 3.5× faster than display time and is written to row 255 of a float texture that drives MinD/MinE bead visibility.
  - `ChemotaxisSim`: CheY-P as an Ornstein–Uhlenbeck process; the clockwise bias follows the Cluzel et al. (2000) Hill curve (H 10.3, K 3.1 µM) through two-state switching. Tumbles are suppressed for the first 12 s.
  - `BrownianSim`: about 62,000 whole-cell molecules on the CPU. Diffusion comes from Elowitz (GFP 7.7 µm²/s, Stokes–Einstein scaled) and Bakshi (ribosomes 0.04 µm²/s), slowed 2×10⁶. Confinement covers the cell, band, slot, window and nucleoid exclusion for ribosomes; there are no collisions. Positions are stored in a 256×256 RGBA32F texture read by bead kind 24.
- Whole-cell molecules are down-sampled PDB surfaces with 12–18 beads each, which brings the coarse layer to about 1.17M beads.
- Camera flights now use a slerped direction, log-distance with an arc, smootherstep easing, and a duration set by scale change and travel. Entry flights bias toward the open side of the cut. Tour holds add an eased slow orbit and dolly; each stop lasts 11 s.
- Live charts in the panel show the Min membrane profiles and the CheY-P trace with tumble bands. Their palette was validated with the dataviz validator against #0b1519.
- Fixed a pre-existing negative frame delta on the first animation frame, which turned the new noise terms into NaN.

2026-10-17: Revision 10 (real proteome, streaming, 60 fps).
- Organism: E. coli K-12 MG1655, the bacterium with the most data and the closest match to the model (Gram-negative, peritrichous flagella).
- Proteome: `scripts/build-proteome.py` joins PaxDb integrated abundances (by b-number) to UniProt reviewed entries. The compartment is the first UniProt location named. Ribosomal proteins are folded into a ribosome count (the median of S-protein copies, 9,482). The top 700 species (89.3% of molecules) are coarse-grained from AlphaFold v6 models. Sizes come from Erickson's Rmin, and diffusion is scaled from GFP using the same formula. The output is `dist/cell/proteome.json` (about 2 MB). The CPU Brownian layer was removed.
- Streaming: `cellworker.js` places ribosomes (excluded from nucleoids), cytoplasmic proteins on a jittered grid, and inner-membrane, outer-membrane and periplasm proteins in each 12×12 tile within the 5-unit layer behind the cut. Placement is deterministic per tile. Molecules are drawn at hydrated size (1.25× Rmin). The main thread keeps at most 4 requests in flight, nearest first, and keeps the old level of detail visible until its replacement arrives.
- Performance:
  - Beads are point sprites, so a bead or granule is one vertex.
  - The heaviest batches are chunked into 10-unit cells with bounding spheres, so three.js frustum culls them.
  - Chunk tiers by distance: under 16 units, granules; under 34, full atoms; beyond, a third of the atoms enlarged 1.32×.
  - Adaptive resolution runs while playing, with `state.adaptive`; tests disable it.
  - The fragment shader no longer computes a per-fragment matrix inverse and shares its trig terms.
  - Measured headless at 1440×960: motor 62 fps, envelope 82, interior 61–67, cell about 145–165, and about 90 zoomed into the whole-cell layer.
- Picking: a 1-pixel re-render with species ids (background removed, point sizes rescaled) opens a card built from the proteome table.

2026-10-17: Revision 11 (no black flashes, uniform detail, one connected flagellum).
- Flashing: adaptive resolution resized the canvas after a frame was presented, and a resize clears the drawing buffer. All resizes now go through `requestResize()` and run at the top of `frame()`, before drawing. Detail-level changes (`updateLOD`) no longer touch the canvas. Adaptive resolution pauses during interaction and camera flights. Measured: 0 dark frames in 100 captured during drag and zoom, with 3 resolution changes.
- Uniform detail: the worker gains 96-bead AlphaFold shapes (`lodU`) and four levels (96, 48, 12 beads, single bead at d < 10, 24, 70, beyond).
  - Nucleoid DNA is streamed as a double helix (3.4 nm pitch) with bound NAPs (HU, H-NS, Fis, IHF, Dps from the proteome). It replaces the coarse random-walk beads.
  - Outer-surface tiles (an even grid on the capsule with 1.6-unit patches) carry lipid heads, LPS core, O-antigen fronds and outer-membrane proteins at measured density within 20 units of the camera. The coarse LPS tufts fade out near the camera.
  - Three workers share tile generation, with up to 9 requests in flight.
- Flagellum: one shared `bundlePos()` drives every filament. The detailed lattice now runs 60 units, curving from the hook into its own bundle slot, with its close-up supercoil fading out. A coarse continuation in the same slot picks up exactly where it ends. Bundle members are drawn as filaments with 16 subunits per ring every 0.2 units, so all filaments rotate, wave and splay together during tumbles.
- QA: verify.cjs waits for tile streaming to settle before the pause-hash check (the likely source of the earlier intermittent failure) and allows one frame for deferred resizes.

2026-10-17: Revision 12 (one flagellum system; no hand-built window).
- Flagella: all seven filaments share one flagellin lattice (kind 9): the one leaving the detailed motor (f = 0) and six peritrichous ones. Each rest centerline (hook top or body motor → its bundle slot → 320 units of bundle) is baked to a 7-row RGBA32F texture `uFlag`, one texel per 0.5 units; w is the arc length past the bundle base. `flagCenter` applies the shared `bundlePos` motion, plus the close-up supercoil on f = 0 only. Subunits: two inner beads and a four-bead skewed outer knob, on the 65.45°/0.047 one-start helix. The coarse bundle members and the 60-unit hero lattice were removed.
- Window: the top-pole content that was a separately hand-built slab is gone (lipid sheets, tails, LPS core, peptidoglycan, periplasm clumps, O-antigen strands, the 10.5k-attempt protein crowd, the backdrop wall and the ribbon meshes). The streamer now covers the window with the same recipe as the rest of the cell:
  - `postEnvelope` emits outer-membrane leaflets, LPS core, tails, woven peptidoglycan with stems, O-antigen fronds, the inner-membrane bilayer, and IM/OM/periplasmic proteins at measured density, per atlas patch across the whole capsule.
  - Cytoplasm tiles exclude only the hand-built machines: `blockers` from the packing reservations plus respiratory sites, the motor column, and membrane `discs` for porins, pumps and the motor.
  - Envelope beads (species 65003–65006) ride the shared membrane wave; fronds sway.
  - The coarse whole-cell layers (shell lathes with no hole, rim, LPS tufts, Min dots, rim periplasm clumps) fade out within about 30–45 units of the camera.
- Kept hand-built: the motor, porins, efflux pumps, receptor arrays, ATP synthase, polysomes/RNAP, chaperonins, DNA strands and particles.
- Performance: cut-face detail ranges were tightened (96-bead under 5 units, 48 under 14, 12 under 45). Envelope patches use 48 beads under 16 units and 12 under 36. Adaptive resolution targets 59–64 fps. Measured headless at 1440×960: motor 60, envelope 99, interior 72, cell 154; close-ups 74–165.
- QA: the pause check now compares decoded pixels (fraction differing by more than 32 must stay under 0.05%), because headless rendering varies in roughly 0.15% of pixels by up to 15/255 while paused. Running frames differ by about 49%, so motion is still caught.

2026-10-17: Every flagellum has a full motor. The detailed rotor and stator groups are cloned (sharing geometry and materials) into six body sites, each oriented with local +y along the envelope normal at 35 − pinch(y), so the rings land in the same membranes as at the pole. Clones rotate with the main rotor, and are visible only within 75 units of the camera and inside the view frustum (`updateMotorCopies`). The coarse yellow blobs remain as the far stand-in (kind 26, which fades in beyond 65–80 units). Placement: four motors sit in the cut plane on the left and right edges (around = π, 0), so the cutaway shows them in section like the top motor; two sit on the back wall. Body filaments now start at the hook top (radius 41.6). The streamed cytoplasm and envelope keep clear of each motor (blocker spheres, plus an axis column via `motorAxes` in the worker).
