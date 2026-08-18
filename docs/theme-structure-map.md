---
summary: 'Working allocation map for the theme redesign: current structural state of all 17 themes, the target grid to fill, and the shared cover-layout pool'
read_when:
  - running a theme-redesign session (Claude Design or human) that must not reproduce the sameness disease
  - deciding which structural territory a theme owns before drawing anything
  - translating a settled allocation back into layoutTendencies
---

# Theme structure map

Working document for the theme redesign. Stage 1 allocates structural
territory across all 17 themes at once; stage 2 designs one theme per
session, each inside its allocated cell. Skipping stage 1 and designing
themes one at a time is how the sameness disease gets reproduced at the
set level. Hard design constraints live in `designing-themes.md`.

**Fill rule: no two themes may share all four values of heading-axis,
meta-placement, decoration-weight and whitespace-scale.** That is the
testable definition of "structurally distinguishable".

Allowed values — heading axis: left / center / right. Meta placement:
bottom-left / bottom-right / top-band / side-rail. Decoration weight:
none / light / medium / heavy. Whitespace: tight / medium / airy.
Cover pool: pick 1-3 from the pool below (a new construction is new
code and needs its own decision). Verdict: keep / merge-into-X / cut.

## Allocation grid

Current state read from `src/themes/definitions.ts` (tendency = a 3:1
soft weight, not a lock; NONE = selection is blind to this theme).
Target columns are to be filled by the redesign.

| theme | current cover tendency | motif | flags | → heading axis | → meta | → decor weight | → whitespace | → cover picks | → verdict |
|---|---|---|---|---|---|---|---|---|---|
| consulting | banner-title, left-anchor | banner | collision target | | | | | | |
| enterprise | NONE | enterprise | fully blind | | | | | | |
| academic | left-anchor | rail | | | | | | | |
| insight | poster-center | poster | collision target | | | | | | |
| campaign | NONE | campaign | fully blind | | | | | | |
| bloom | NONE | bloom | fully blind | | | | | | |
| classroom | NONE | classroom | fully blind | | | | | | |
| ink | NONE | ink | fully blind, collision target | | | | | | |
| tech | constellation | constellation | collision target | | | | | | |
| runway | fashion-masthead | (no motif) | missing motif | | | | | | |
| journal | editorial-masthead | corner-ornament | | | | | | | |
| luxe | NONE | luxe | fully blind, twin of heritage | | | | | | |
| heritage | NONE | heritage | fully blind, twin of luxe | | | | | | |
| pulse | split-diagonal | pulse | | | | | | | |
| terra | tone-adaptive-header | terra | | | | | | | |
| ember | (chapter/ending only) | ember | cover undeclared | | | | | | |
| vermilion | (chapter/ending only) | vermilion | cover undeclared | | | | | | |

Flags: "collision target" = the audit's decor-on-text findings
(ink 1.07:1, tech 1.70:1, consulting 3.26:1, insight 1.37:1 — four of
five sit in tone-adaptive-header's bottom-right slot). "Fully blind" =
no layoutTendencies at all, so any two such themes render identical
structure under the same seed. "Twin" = the measured identical pair.

## Cover pool (8 constructions, shared)

| layout | composition | current leaners |
|---|---|---|
| banner-title | full-width dark band on top, heading inside the band | consulting |
| left-anchor | left vertical accent, heading upper-left | consulting, academic |
| poster-center | kicker + heading centered | insight |
| split-diagonal | diagonal division, heading left | pulse |
| constellation | dark field, scattered dots, left accent bar | tech |
| editorial-masthead | double rules on top, serif masthead | journal |
| fashion-masthead | oversized heading upper-left, sparse | runway |
| tone-adaptive-header | org top-left, badge top-right, rule near bottom, date bottom-right | terra, plus every blind theme under seed 22 (de facto). Bottom-right slot is the known collision zone |

## Second front, out of scope here

Content-page structure is theme-blind for all 17 themes (nobody
declares content tendencies). This map allocates cover identity first;
content allocation follows the same method once covers land.
