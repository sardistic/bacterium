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
