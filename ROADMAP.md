# jokercad roadmap

Phase 1 is built (design intent, geometric self-check, conversational editing
with undo/redo, the geometry inspector, kernel-backed measurement, and the
execution boundary around model-written code). What follows is not built. Each
phase leans on the one before it, and the dependency is named in each case
rather than implied, because most of these are cheap once the earlier
architecture exists and very expensive without it.

Two constraints run through all of it. Everything has to keep working on free
infrastructure — Vercel's Hobby plan and free-tier LLM APIs — so anything
requiring a persistent server process, a paid database, or per-seat licensing
is out of scope by definition. And deterministic engineering results must never
come from a language model: a model may choose a formula or explain a result,
but the number itself comes from code that can be tested.

---

## Phase 2 — A real parametric experience

**Depends on:** Phase 1's intent spec being persisted per version, and on the
measurement pass that reads features back off the solid.

**Feature tree with genuine metadata.** Today a part is a flat script plus a
declared spec. A feature tree means each operation — this pad, that hole
pattern, this fillet — is a stored object with its own parameters, its own
identity, and a parent it depends on, with the script generated from the tree
rather than the tree being inferred from the script. The hard part is not
drawing the tree; it is that the model currently writes free-form code, so
either it must emit operations rather than statements, or the code must be
parsed back into operations reliably enough that editing the tree and
re-running never silently loses work the tree didn't model. The intent spec is
the seed of this: it already names features and dimensions, and extending it
into an ordered, addressable graph is the natural next step.

**Engineering constraints as stored relationships.** Concentric, parallel,
symmetric, tangent, coincident — recorded as relationships between named
features, not as a one-off arithmetic coincidence in generated code. Phase 1
already checks one of these (symmetry of a hole pattern) after the fact; the
difference here is that a constraint would be *maintained*, so moving a boss
carries its hole with it. This needs the feature tree first, because a
constraint has to reference something stable; a constraint against a line of
code is worthless the moment the model rewrites it.

**Contextual selection-based editing.** Clicking a face and saying "make this
5 mm deeper" already exists in a limited form. With a feature tree, the click
resolves to the *operation* that created the face, so the edit changes that
operation's parameter instead of asking a model to rewrite the script and hoping
the rest survives. This is where the tree starts paying for itself.

**Version history, diffing and restore.** Versions, restore, undo/redo and a
line-by-line code diff exist now. What is missing is a *model* diff: given two
versions, report that the plate got 20 mm longer and gained two holes, derived
from the feature trees and the measured geometry rather than from the text of
the code. Phase 1's measurement pass supplies half of this already; comparing
two measurement sets is a small step, comparing two trees is the complete one.

---

## Phase 3 — Engineering judgement

**Depends on:** Phase 2's feature metadata for anything that needs to know what
a face *is* (a wall, a rib, a boss) rather than merely where it is.

**Printability and manufacturability checks per process.** A print check exists
(overhangs, thin walls, bed fit, rough cost). Extending it per process — FDM,
CNC, laser, sheet metal — means encoding each process's real constraints: tool
access and internal radii for milling, kerf and closed contours for laser,
bend radius and relief for sheet metal. Each is a deterministic geometric test.
They need feature metadata to be useful rather than noisy: "this pocket has no
tool access" requires knowing there is a pocket.

**Material database.** Density, modulus, yield and a rough cost for common
materials, used by the mass estimate and the calculators below. It must be
scoped honestly as indicative: real material properties vary by supplier, heat
treatment and print orientation, and the interface should say so rather than
implying certified data.

**Deterministic engineering calculators.** Beam deflection, shaft torsion, bolt
preload and clamp load, spring rate. These are formula-driven code with unit
tests, never model output — a plausible-sounding wrong number is worse here
than no number. The model's role is limited to choosing which calculator fits
the question and explaining the result in context.

**Design review that separates its sources.** One panel, three clearly distinct
kinds of statement: facts measured from the geometry, warnings from the
deterministic rule checks above, and suggestions from a model. Phase 1
established the pattern by separating what the user asked for from what the AI
assumed, and by marking checks it could not make as skipped rather than passed;
the review should extend the same discipline instead of blending all three into
one confident-sounding voice.

---

## Phase 4 — Assemblies that mean something

**Depends on:** Phase 2's feature tree, so a joint can attach to a named feature
(this bore, that face) and survive the part being edited.

Multi-part projects, positioning, rigid/revolute/prismatic joints, a motion
preview and an overlap check all exist today, but they are anchored to picked
mesh locations. Re-anchoring them to features is what makes an assembly durable:
today, editing a part can leave its joints pointing at geometry that has moved.

**Interference and clearance.** The current check is a vertex-in-mesh test,
which can miss thin shells passing through each other. A real check tests the
solids, and reports clearance as a number — not just a red highlight — including
through a motion range rather than only at rest.

**A parametric standard-component library.** Bolts, nuts, washers and bearings
already generate from parameters; this extends the same treatment to a broader
catalogue and makes each component carry its designation, so a bill of materials
can be produced from the assembly rather than transcribed by hand.

**BOM generation and export.** Straightforward once components carry
designations and quantities: a table, a CSV, and a line on the drawing.

---

## Phase 5 — The AI as a designer, not a transcriber

**Depends on:** Phase 1's intent spec (the place a partly-specified design is
recorded) and Phase 3's calculators (so a requirement can be checked rather than
guessed at).

**Image and sketch to CAD that asks instead of assuming.** Building from a photo
exists. What is missing is the discipline to *stop*: when a critical dimension
can't be read off the picture, ask for it rather than inventing one. Phase 1
made assumptions visible, which is the groundwork — the next step is to treat a
load-bearing assumption as a question rather than a footnote.

**Requirements to CAD.** Extract material, load, envelope and mounting from a
written brief, list what is missing, ask only about that, and then design to it.
This is the intent spec used as an input rather than an output.

**Multiple measurable concepts.** On request, produce several distinct designs
and compare them on measured criteria — mass, stiffness proxy, part count,
estimated cost — so the choice belongs to the user and rests on numbers rather
than on a model's opinion of which is best.

**Deterministic drawings.** Orthographic views, dimensions and a title block
already generate from the geometry. The remaining work is dimensioning that
reflects design intent — dimensioning the features a person would, from the
datums that matter — which needs the feature tree to know what those are.

---

## Phase 6 — Platform

**Depends on:** everything above having a stable stored form; syncing a design
graph is only worth doing once the graph exists.

**Cloud projects that store the design, not the output.** Sync exists and stores
parts, versions and geometry. A project should persist the full spec, feature
graph, parameters and history, so a project opened elsewhere can be *edited*
rather than merely viewed — and so a model editing it starts from intent rather
than re-reading a script.

**Collaboration.** Sharing a project, and more than one person working on it.
The current merge is last-write-wins on whole projects, which is honest but
crude; anything better needs the design stored as a graph so two edits to
different features can both survive.

**A public, remixable gallery.** Share links already carry a part's code, so the
mechanism exists; a gallery is that plus discovery, attribution and moderation.
Worth noting that opening someone else's design executes model-written code on
the server, so this depends on the execution boundary being hardened further —
see below.

**APIs.** Generating and fetching parts programmatically, for people who want
jokercad as a step in their own pipeline.

---

## Carried over from the Phase 1 audit

**Real isolation for generated code.** Phase 1 replaced a substring blocklist
with an AST allowlist, added CPU, file-size and process limits, and stripped
secrets from the child environment. That is defence in depth, not a sandbox:
escaping a Python allowlist is a known art, and the current design assumes an
attacker who is unmotivated rather than unable. Genuine isolation needs a
different execution substrate — a container per run with no network and a
read-only filesystem, gVisor or Firecracker, or moving execution into
WebAssembly in the browser. None of these fit Vercel's free tier today, which
is precisely why a public gallery (Phase 6) should not ship before this does.

**A frontend that can carry Phase 2.** `frontend/app.js` is about 4,600 lines
with substantial shared mutable state. Phase 1 worked within it deliberately, to
avoid a rewrite whose only visible result would be regressions. A feature tree
with contextual editing is a large addition to exactly the parts of that file
that are already densest, so splitting the viewer, the part model and the panels
into separate modules is worth doing first — as preparation for Phase 2, with
tests, rather than as a tidy-up for its own sake.
