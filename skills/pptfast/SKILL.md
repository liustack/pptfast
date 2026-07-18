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
pptfast schema             # IR JSON Schema: the single source of truth
pptfast scenarios --json   # named scenario presets (mode/delivery/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

Never write IR from memory of a previous session or from this file — the schema evolves and `schema`/`scenarios`/`themes` output always wins.

### Step 2 — Align the outline with the user

Propose and confirm before writing any IR:

- Scenario first: pick a named preset (or override individual axes) from `scenarios` output that matches the deck's purpose and audience — this is a decision layer above theme, not a visual choice
- Theme id next, from the chosen scenario's `themeRecommendations` (or pick from `themes` output to match the deck's tone if none fit — a recommendation, never a constraint)
- Slide count and narrative rhythm (cover → chapters → content runs → ending)
- What source material maps to which slides

**After the user confirms, do not re-plan.** Restructuring a confirmed outline silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first.

### Step 3 — Write IR in batches of at most 6 slides, validate each batch

Grow one IR JSON file incrementally. After each batch:

```bash
pptfast validate deck.json
```

Every error carries a 1-based page number and a concrete fix. Fix the IR and re-validate until it prints `OK`. Do not argue with the gate — some limits are hard render geometry (headings that overflow, a layout's physical capacity) and some are editorial budgets that scale with the deck's `delivery` axis (see Capacity below). The error message names which side is binding — restructure the content, or revisit the scenario with the user if the delivery budget is the constraint.

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

### Component selection

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

Declare images once in `assets.images` and reference them by `asset_id` — double-check every `asset_id` spelling, a wrong key renders a silent placeholder instead of failing. An explicit `layout` id always wins over pptfast's auto-selection, which otherwise picks from the theme's curated set — for a slide built around an image, set `layout` to one of the image takeovers: `image-split` (half-page image + side text, `image_side: left|right`), `image-top` (full-bleed top image + text columns below), `image-bottom` (text above, image below), `image-annotate` (center image + radiating callouts taken from the first 4 bullets). **With any image layout, the first component must be an `image` component** — it is the image source.

### Capacity

A slide is a fixed-size canvas. Draft to fit on the first pass: few components per slide, short assertive headings, bullet items within about two lines. Component and bullets budgets scale with the deck's `delivery` axis (tightest for `presentation`, loosest for `text`) — `validate` reports the exact numbers that applied, not a flat constant. When in doubt, split into two slides — writing to fit beats fix-up loops.

### Decor

Set slide `decor` only when the user explicitly asks for decorative flourish. Default is none — themes already carry their own motifs.

## Rules

- Never edit or post-process the generated `.pptx`
- Never bypass a `validate` error by deleting the content it flagged — restructure it (split the slide, tighten the heading, pick a denser component type)
- Public deck text follows the user's language, IR structural fields are always the English enum values from the schema
