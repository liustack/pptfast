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

Six phases: read the vocabulary, spec and confirm, fill pages in batches, render, self-check, revise. For a very small deck (a handful of slides), skip the spec and write a single IR file directly, validating with `pptfast validate` — everything below still applies with "the deck project directory" read as "the IR file", minus phase 2's spec step.

### Phase 1 — Read the vocabulary (do this fresh every session)

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

Never write IR or a spec from memory of a previous session or from this file — the schema evolves and `schema`/`narratives`/`themes` output always wins.

### Phase 2 — Spec and confirm

Propose and confirm before writing any page content:

- Narrative first: pick a named preset (or override individual axes) from `narratives` output that matches the deck's purpose and audience — this is a decision layer above theme, not a visual choice
- Theme id next, from the chosen narrative's `themeRecommendations` (or pick from `themes` output to match the deck's tone if none fit — a recommendation, never a constraint)
- Draft `deck.spec.json`: one entry per page (`id`, `type`, `heading`, optionally `beat`/`focus`/`summary`) — opens on `cover`, closes on `ending`, everything in between is `content` or `chapter`
- Run `pptfast spec validate deck.spec.json` and fix whatever it reports until it prints `OK` — the hard gates (boundary pages, heading length, beat rotation, page count vs. pacing) all fire here, before a single page is written
- Once `spec validate` prints `OK`, set a `seed` (any integer) in `deck.spec.json` for revision stability — write one now, or run `pptfast assemble` once in phase 3 and copy the `generated seed …` value it prints into the spec. Without a persisted seed, editing one page's heading later can reshuffle every other page's auto-picked layout

**After the user confirms the validated spec, do not re-spec.** Restructuring a confirmed spec (reordering, retyping, dropping pages) silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first, then re-run `spec validate`.

### Phase 3 — Fill pages in batches of at most 4, validate immediately

For each page in the confirmed spec, write `pages/<page-id>.json` with its content (`components`, and optionally `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes` — never `type`/`heading`, those are locked by the spec). `cover`/`chapter`/`ending` pages never render `components` or `footnote` — `validate` hard-errors if either is set there (`docs/deck-projects.md`'s boundary-page render surface table has the full per-type accounting). Put that content on a `content` page instead. `notes` is speaker notes prose for whoever presents the deck — writing a good speaking script is a model strength, so draft it whenever the page's content calls for a spoken walkthrough beyond what's on the slide.

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget, unknown theme
```

Fix whatever either command reports and re-run until both print `OK`. A spec page with no page file yet is a placeholder (heading only) — assemble and validate both accept that. Leaving some pages as placeholders between batches is normal, not an error. `assemble` also prints `note: N layouts auto-selected into deck.json` whenever a page's `layout` was left to auto-selection — informational, not an error. Pin `layout` in a page file only when a specific pick needs to be locked.

### Phase 4 — Render

```bash
pptfast render deck-dir/ -o deck.pptx
```

`--theme <id>` overrides the deck theme without editing the spec. `--style <path>` layers a style-token override on top (re-color without forking a theme, schema: `pptfast schema --style`). Render refuses a deck with unfilled placeholder pages unless you add `--draft` — reach for that only when the user explicitly wants a look before every page is done.

If the project has a `pptfast.config.json`, its theme/style are project defaults — do not fight them with `--theme` unless the user asks. Any page `notes` you wrote in phase 3 export as native PowerPoint speaker notes (View → Notes in PowerPoint/Keynote) — never drawn onto the slide itself.

### Phase 5 — Audit and optional visual self-check

Once every page is filled (no placeholders left), run the deterministic geometry audit:

```bash
pptfast audit deck-dir/
```

Zero-token, zero-variance — it renders each page off-screen and checks overflow, out-of-bounds, low-contrast, and overlap, exiting 1 when it finds anything (0 when clean). Each finding names its page (and id) and carries a fix. Fix the flagged page's content — same "restructure, don't delete" discipline as a `validate` error — then re-run `pptfast audit deck-dir/` alone (no need to re-render) until it exits 0. This is the deck's visual QA. Do not rely on eyeballing a screenshot instead.

```bash
pptfast preview deck-dir/ -o preview/ --html
```

Writes one standalone SVG per slide plus a self-contained `preview.html`, never gated on placeholder pages. Read a few SVGs yourself (they are plain text files) to sanity-check layout and density before delivering, especially for image-heavy decks — hand `preview.html` (thumbnail strip, keyboard navigation, placeholder badges) to the user for their own look instead. When every page is filled, `preview.html` also overlays the same `audit` findings (per-page badges + a findings panel) so the reviewer sees them without a terminal — a deck with any placeholder page shows a one-line "audit skipped" notice instead. The reviewer can leave free-text per-page annotations in `preview.html` and export them as `revision-request.json` — read only, never edits the deck itself — route that back through phase 6 when it comes back to you.

### Phase 6 — Revision: edit one page, re-assemble

A revision touches the smallest file that captures it:

- Content change ("punch up the KPI page") → edit that page's `pages/<id>.json` only, then repeat phase 3's `assemble` + `validate` pair, and phase 5's `audit`, before re-rendering. Never regenerate pages nobody asked you to touch.
- Structural change (reorder, add/remove a page, change a page's type or heading) → edit `deck.spec.json` instead, re-run `pptfast spec validate` first (phase 2's no-respeccing rule still applies: only do this when the user actually asked for a structural change).
- `revision-request.json` handed back (exported from `preview.html`'s "Export revision requests" button, phase 5) → route each entry in `requests` by `pageId` to that page's `pages/<id>.json`. `pageId` is the page's slide id when it has one, else its 1-based page number — match it against `deck.spec.json`/`pages/` to find the right file when there is no id. Treat `annotation` as a requirement to interpret, not a patch to apply verbatim: it is free-text from a reviewer looking at the rendered slide, not valid page-file JSON — translate it into a concrete content edit yourself, then run the same content-change loop above (`assemble` + `validate` + `audit`) for every page a request touched. Preview stays read-only end to end: nothing about this flow ever writes into `pages/*.json` except your own deliberate edit.

## Routing a follow-up request

Once a deck project exists, a follow-up message routes into exactly one of three branches — decide which before doing anything:

1. **Edit a page** ("change slide 3", "make the KPI page punchier", or a handed-back `revision-request.json`) → phase 6: edit that page's file, re-assemble, re-validate, re-audit. Never touch pages nobody asked about.
2. **A new deck** (a different topic, audience, or an explicit request to start over) → phase 1: a new deck project directory, fresh narrative/theme decision, fresh spec.
3. **Unrelated to deck generation** (a question about the content, anything with no connection to slides) → do not invoke pptfast at all.

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
| Phased plan with dated bars on a shared axis | `gantt` | `roadmap` |
| One verdict or takeaway sentence | `verdict_banner` or `callout` | `paragraph` |
| 2×2 strategic assessment (strengths/weaknesses/opportunities/threats) | `swot` | `matrix` |
| 9-block business model canvas | `bmc` | separate `bullets`/`row_cards` |
| Cumulative bridge/variance breakdown | `waterfall` | `chart` |

`steps` vs `flowchart` is the most common miss: if the edges never branch, it is `steps`. `roadmap` vs `gantt` is the next: `roadmap` groups workstreams into swimlanes with no shared numeric axis, `gantt` plots dated bars against one shared axis all items compare against.

`swot`/`bmc`/`waterfall`/`gantt` are *full-body*: each fills the entire slide and must be the slide's only component — see Capacity below.

### Image slides

Declare images once in `assets.images` and reference them by `asset_id` — double-check every `asset_id` spelling, a wrong key renders a silent placeholder instead of failing. An explicit `layout` id always wins over pptfast's auto-selection, which otherwise picks from the theme's layout set for that page type (the full registry set by default, unless the theme curates it narrower) — for a slide built around an image, set `layout` to one of the image takeovers: `image-split` (half-page image + side text, `image_side: left|right`), `image-top` (full-bleed top image + text columns below), `image-bottom` (text above, image below), `image-annotate` (center image + radiating callouts taken from the first 4 bullets). **Every image layout needs an `image` component somewhere in `components`** — pptfast uses the first one it finds as the image source regardless of array position, and every other component becomes the layout's text body.

### Capacity

A slide is a fixed-size canvas. Draft to fit on the first pass: few components per slide, short assertive headings, bullet items within about two lines. Component and bullets budgets scale with the deck's `pacing` axis (tightest for `spacious`, loosest for `dense`) — `validate` reports the exact numbers that applied, not a flat constant. Body text size scales the other way: `spacious` renders the largest body font (32px vs. `balanced`'s 24px and `dense`'s 20px) even though it allows the fewest components, so a `spacious` slide needs fewer and shorter items, not just tighter ones. When in doubt, split into two slides — writing to fit beats fix-up loops.

Four component types own the whole slide instead of sharing it: `swot`, `bmc`, `waterfall`, `gantt`. Each must be its slide's only component — `validate` hard-errors on a slide that mixes one in with `bullets` or anything else, it never silently drops the sibling.

### Decor

Set slide `decor` only when the user explicitly asks for decorative flourish. Default is none — themes already carry their own motifs.

## Rules

- Never edit or post-process the generated `.pptx`
- Never bypass a `validate` error by deleting the content it flagged — restructure it (split the slide, tighten the heading, pick a denser component type)
- Public deck text follows the user's language, IR structural fields are always the English enum values from the schema
