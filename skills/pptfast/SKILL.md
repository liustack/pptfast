---
name: pptfast
description: Generate a native, editable PPTX deck from an outline, notes, or a document using the pptfast CLI (semantic IR → validate → render). Use when the user asks to create a PPT, deck, presentation, or slides (做PPT/生成PPT/制作演示文稿/幻灯片) and wants a stable, editable, brand-consistent result rather than freeform drawn slides.
---

# pptfast — deck generation playbook

pptfast turns a JSON IR (intermediate representation) into a native DrawingML `.pptx` — every shape stays editable in PowerPoint. You own the content model. The tool owns layout, style, and motion. You never draw SVG or position anything: pick from a controlled vocabulary and let the validate gate catch what will not fit.

## Prerequisites

```bash
pptfast --version || npm install -g @liustack/pptfast
pptfast check-update   # stay current — the schema and themes evolve
```

## Workflow

### Step 1 — Read the vocabulary (do this fresh every session)

```bash
pptfast schema          # IR JSON Schema: the single source of truth
pptfast themes --json   # built-in themes (id + label)
```

Never write IR from memory of a previous session or from this file — the schema evolves and `schema` output always wins.

### Step 2 — Align the outline with the user

Propose and confirm before writing any IR:

- Slide count and narrative rhythm (cover → chapters → content runs → ending)
- Theme id (pick from `themes` output to match the deck's tone)
- What source material maps to which slides

**After the user confirms, do not re-plan.** Restructuring a confirmed outline silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first.

### Step 3 — Write IR in batches of at most 6 slides, validate each batch

Grow one IR JSON file incrementally. After each batch:

```bash
pptfast validate deck.json
```

Every error carries a 1-based page number and a concrete fix. Fix the IR and re-validate until it prints `OK`. Do not argue with the gate — its limits come from real render geometry (headings that overflow, blocks that cannot fit), not style preference.

### Step 4 — Render

```bash
pptfast render deck.json -o deck.pptx
```

`--theme <id>` overrides the deck theme without editing the IR. `--style <path>` layers a style-token override on top (re-color without forking a theme, schema: `pptfast schema --style`).

If the project has a `pptfast.config.json`, its theme/style are project defaults — do not fight them with `--theme` unless the user asks.

### Step 5 — Optional visual self-check

```bash
pptfast preview deck.json -o preview/
```

Writes one standalone SVG per slide. Read a few (they are plain text files) to sanity-check layout and density before delivering, especially for image-heavy decks.

## Content methodology

### Block selection

| Content shape | Use | Not |
|---|---|---|
| 2–5 headline metrics | `kpi_cards` | `chart` |
| Series data (trend, comparison, share) | `chart` (`bar`/`line`/`pie`/`funnel`/`dumbbell`) | numbers buried in `bullets` |
| Linear process, no branches | `steps` | `flowchart` |
| Branching or looping process | `flowchart` | `steps` |
| Two-sided contrast | `comparison` | two bullet lists |
| Dated milestones | `timeline` | `bullets` with dates |
| Phased plan with workstreams | `roadmap` | `timeline` |
| One verdict or takeaway sentence | `verdict_banner` or `callout` | `paragraph` |

`steps` vs `flowchart` is the most common miss: if the edges never branch, it is `steps`.

### Image slides

Declare images once in `assets.images` and reference them by `asset_id` — double-check every `asset_id` spelling, a wrong key renders a silent placeholder instead of failing. For a slide built around an image, pick a variant from the catalog: `image_split` (half-page image + side text, `image_side: left|right`), `image_top` (full-bleed top image + text columns below), `image_bottom` (text above, image below), `image_annotate` (center image + radiating callouts taken from the first 4 bullets). **On any image variant, the first block must be an `image` block** — it is the image source.

### Capacity

A slide is a fixed-size canvas. Draft to fit on the first pass: few blocks per slide, short assertive headings, bullet items within about two lines. When in doubt, split into two slides — `validate` reports the exact limits when you exceed them, but writing to fit beats fix-up loops.

### Decor

Set slide `decor` only when the user explicitly asks for decorative flourish. Default is none — themes already carry their own motifs.

## Rules

- Never edit or post-process the generated `.pptx`
- Never bypass a `validate` error by deleting the content it flagged — restructure it (split the slide, tighten the heading, pick a denser block type)
- Public deck text follows the user's language, IR structural fields are always the English enum values from the schema
