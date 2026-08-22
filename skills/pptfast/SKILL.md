---
name: pptfast
description: Generate a native, editable PPTX deck from an outline, notes, or a document using the pptfast CLI (semantic IR → validate → render). Use when the user asks to create a PPT, deck, presentation, or slides (做PPT/生成PPT/制作演示文稿/幻灯片) and wants a stable, editable, brand-consistent result rather than freeform drawn slides.
---

# pptfast — deck generation playbook

pptfast turns a JSON IR (intermediate representation) into a native DrawingML `.pptx` — every shape stays editable in PowerPoint. You own the content model. The tool owns layout, style, and motion. You never draw SVG or position anything: pick from a controlled vocabulary and let the validate gate catch what will not fit.

## Run it

Everything in this playbook runs through the CLI: schema, spec/assemble, validate, render, audit, preview, serve, brand extract. Every one of those commands goes through the launcher bundled with this skill, which resolves a working runtime for you. Replace `<skill-dir>` with the directory this SKILL.md lives in:

```bash
bash <skill-dir>/scripts/run.sh <args>                                       # macOS / Linux
powershell -ExecutionPolicy Bypass -File <skill-dir>\scripts\run.ps1 <args>  # Windows
```

It tries a compatible `pptfast` on `PATH` first, then `npx`, then `bunx`, forwarding your arguments and its exit code unchanged. Nothing to install first, and the version it runs is pinned to this skill. Exit 78 means no runtime at all: relay the `nextSteps` from its stderr JSON instead of retrying.

Wherever this playbook writes `pptfast <args>`, run it through that launcher.

Right after an install, and any time a command misbehaves in a way the error message does not explain, run `pptfast doctor` before anything else. It reports the runtime, every installed skill copy and whether one is stale, the dsh plugin's version, which optional capabilities are present, and a self-test render. Relay what it says instead of guessing.

If your harness forbids running scripts, work down the same order by hand and use the first line that applies:

1. A `pptfast` on `PATH` at the same major version as the pin below and no older: `pptfast <args>`.
2. Otherwise, if `npx` exists: `npx --yes --package @liustack/pptfast@0.20.0 pptfast <args>`.
3. Otherwise, if `bunx` exists: `bunx --bun @liustack/pptfast@0.20.0 <args>`.
4. Otherwise tell the user no JavaScript runtime was found, and that installing Node 22.19+ (https://nodejs.org) or Bun (https://bun.sh) is the next step. Do not report pptfast itself as broken.

## Workflow

Interview → spec → pages → validate → audit → render. Re-enter at the smallest step that captures a change. A very small deck (a handful of slides) may skip the spec file and write a single IR, still validating with `pptfast validate`. Never write IR or a spec from memory of a previous session or from this file. Run these fresh every session:

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

Also scan the workspace before asking anyone anything. A confirmed `deck.spec.json` already locks narrative, theme, and branding: do not re-interview, revise that deck instead. A `theme.json`, pinned `pptfast.config.json` theme, user-named theme id, or supplied `.thmx` / `.potx` / branded `.pptx` is a brand signal: extract or honor it. Do not ask whether a template exists.

**Boundary-page rule:** `chapter` and `ending` pages never render `components` or `footnote`. `cover` pages never render `footnote`. A `cover` may carry `components` only when its locked layout declares a slot for them. Today that is `verdict-index` (consulting), which reads the first `bullets` block as up to three numbered arguments. Every other cover layout still drops components. Put body content on a `content` page unless you are filling that consulting argument row. Wrong/right JSON and spec writing: `references/spec.md`.

1. **Interview** (at most one round) when a user is present and any of audience, how it is told, or pacing is still unknown. Relay unresolved questions in **one** message, then stop. Do not fill them in. Q1–Q4, ★ defaults, lookup, `NARRATIVE_INTERVIEW` gate: `references/spec.md`.
2. **Spec and confirm** before any page content. Write `deck.spec.json` (opens on `cover`, closes on `ending`, everything in between is `content` or `chapter`). Run `pptfast spec validate` until `OK`, then persist a `seed`. Do not re-spec a confirmed spec. How to write it: `references/spec.md`. Branding posture: `references/branding.md`.
3. **Pages** in batches of at most 4. Write `pages/<id>.json` (`components`, optional `layout`/`notes`). Never write `type`/`heading`. Pin-only and sparse climax layouts: `references/layouts.md`. Component forms: `references/components.md`. Density, beat, capacity: `references/density.md`. Images: `references/images.md`.
4. **Validate** after every batch: `pptfast assemble deck-dir/` then `pptfast validate deck-dir/` until both print `OK`. Restructure flagged content, never delete it. The assemble/validate/audit/preview/serve loop: `references/validate.md`.
5. **Audit** once every page is filled: `pptfast audit deck-dir/` until exit 0. Do not substitute a screenshot. Then hand the deck over (`pptfast_preview`, else `preview --html`, else `serve --no-open`): `references/validate.md`.
6. **Render:** `pptfast render deck-dir/`. Report the absolute path it prints. `--draft` and `--allow-dropped-content` only when the user says so.

Follow-up: edit a page → steps 3–6 on that file only. A new deck → step 1. Unrelated → do not invoke pptfast.

## Component selection

| Content shape | Use | Not |
|---|---|---|
| 2–5 headline metrics | `kpi_cards` | `chart` |
| Series data (trend, comparison, share) | `chart` (`bar`/`line`/`pie`/`funnel`/`dumbbell`/`scatter`/`area`/`donut`/`gauge`) | numbers buried in `bullets` |
| Exact figures the audience reads row-by-row (price list, spec sheet, metrics-by-period grid) | `data_table` | `chart` |
| Linear process, no branches | `steps` | `flowchart` |
| Branching process that reaches an endpoint | `flowchart` | `steps` |
| Cyclical process with no endpoint — loops back to its own start (PDCA, a product lifecycle, a flywheel, a seasonal cycle) | `cycle` | `flowchart` |
| Two-sided contrast | `comparison` | two bullet lists |
| System/organizational layering (a stack of bands, e.g. tech-stack layers or a maturity ladder) | `architecture` | `bullets` |
| Dated milestones | `timeline` | `bullets` with dates |
| Phased plan with workstreams | `roadmap` | `timeline` |
| Phased plan with dated bars on a shared axis | `gantt` | `roadmap` |
| One verdict or takeaway sentence | `verdict_banner` or `callout` | `paragraph` |
| 2×2 strategic assessment (strengths/weaknesses/opportunities/threats) | `swot` | `matrix` |
| 9-block business model canvas | `bmc` | separate `bullets`/`row_cards` |
| Cumulative bridge/variance breakdown | `waterfall` | `chart` |
| 2×2 macro-environment scan (political/economic/social/technological) | `pest` | `swot` |
| Competitive-structure analysis (rivalry + 4 surrounding forces) | `five_forces` | `matrix` |
| Two-axis value grid with color-coded cells (e.g. region × quarter) | `heatmap` | `matrix` |
| Proportional flow/quantity distribution across stages (e.g. budget allocation, energy mix) | `sankey` | `chart` (funnel) or `flowchart` |
| A product/software screenshot that the slide needs to read as "this is real, running software" (an app dashboard, a live product UI) | `device_mockup` | `image` |
| A roster of people (team, speaker lineup, judging panel, author list) needing an identity anchor with no photo available | `people_cards` | `row_cards`/`icon_cards` |
| A set of short parallel labels (a tech stack, capabilities, keywords, certifications) — labels, not described items | `tag_row` | `bullets`/`row_cards` |

Lookalike pairs, field notes, and full-body types: `references/components.md`.

## Rules

- Never edit or post-process the generated `.pptx`
- Never bypass a `validate` error by deleting the content it flagged — restructure it (split the slide, tighten the heading, pick a denser component type)
- Public deck text follows the user's language, IR structural fields are always the English enum values from the schema
- Never tell a user that a `chart`'s or `data_table`'s numbers are editable inside PowerPoint: those components render as grouped shapes and text, fully restylable and retypable, but with no native chart part or `<a:tbl>` behind them. To change the numbers, edit the IR and re-render.

## Read when

- `references/spec.md` — writing `deck.spec.json`, choosing page types, or running the narrative interview
- `references/layouts.md` — pinning a layout, including climax, quote, and evidence sparse pages
- `references/components.md` — a lookalike pair or a component's fields and limits
- `references/density.md` — pacing budgets, `beat`, capacity warnings, or slide `decor`
- `references/branding.md` — extracting a company template, or whether to write `branding: "full"`
- `references/images.md` — declaring assets, searching stock, or generating art
- `references/validate.md` — assemble / validate / audit / preview / serve, or revising a page
