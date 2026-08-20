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

Six phases: read the vocabulary, spec and confirm, fill pages in batches, render, self-check, revise. For a very small deck (a handful of slides), skip the spec and write a single IR file directly, validating with `pptfast validate` — everything below still applies with "the deck project directory" read as "the IR file", minus phase 2's spec step.

### Phase 1 — Read the vocabulary (do this fresh every session)

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

Never write IR or a spec from memory of a previous session or from this file — the schema evolves and `schema`/`narratives`/`themes` output always wins.

**Boundary-page rule — learn this now, it is the single most common mistake:** `cover`, `chapter`, and `ending` pages never render `components` or `footnote`, on any layout, no exceptions. Put that content on a `content` page instead. Getting this wrong at spec time means rewriting real content later — `validate` catches it with `"<type>" slides do not render components/footnote — move this content to a content slide or remove it`, but by then you have already drafted content that has to move.

```json
// pages/closing.json — spec type "ending" — WRONG: components never render on an ending page
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/wrap-up.json — spec type "content", inserted right before the ending page — CORRECT
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/closing.json — spec type "ending" — stays bare, nothing to move here
{}
```

`docs/deck-projects.md`'s boundary-page render surface table has the full per-type accounting.

### Phase 2 — Spec and confirm

Propose and confirm before writing any page content:

- Narrative first: pick a named preset (or override individual axes) from `narratives` output that matches the deck's purpose and audience — this is a decision layer above theme, not a visual choice
- Theme id next, from the chosen narrative's `themeRecommendations` (or pick from `themes` output to match the deck's tone if none fit — a recommendation, never a constraint). If the user supplied a company template, extract it into a custom theme first — see Brand themes below
- Draft `deck.spec.json`: one entry per page (`id`, `type`, `heading`, optionally `beat`/`focus`/`summary`) — opens on `cover`, closes on `ending`, everything in between is `content` or `chapter`
- Run `pptfast spec validate deck.spec.json` and fix whatever it reports until it prints `OK` — the hard gates (boundary pages, heading length, beat rotation, page count vs. pacing) all fire here, before a single page is written
- Once `spec validate` prints `OK`, set a `seed` (any integer) in `deck.spec.json` for revision stability — write one now, or run `pptfast assemble` once in phase 3 and copy the `generated seed …` value it prints into the spec. Without a persisted seed, editing one page's heading later can reshuffle every other page's auto-picked layout

**After the user confirms the validated spec, do not re-spec.** Restructuring a confirmed spec (reordering, retyping, dropping pages) silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first, then re-run `spec validate`.

### Phase 3 — Fill pages in batches of at most 4, validate immediately

For each page in the confirmed spec, write `pages/<page-id>.json` with its content (`components`, and optionally `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes` — never `type`/`heading`, those are locked by the spec). Remember Phase 1's boundary-page rule while drafting `cover`/`chapter`/`ending` pages — do not give them `components` or `footnote` and then have to move it. `notes` is speaker notes prose for whoever presents the deck — writing a good speaking script is a model strength, so draft it whenever the page's content calls for a spoken walkthrough beyond what's on the slide.

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

Fix whatever either command reports as an error and re-run until both print `OK`. `validate` can print `OK` alongside `warning:` lines (e.g. a long heading or a dense slide) — tighten those too when practical, they read better, but they do not block. Only an error stops `OK` from printing. A spec page with no page file yet is a placeholder (heading only) — assemble and validate both accept that. Leaving some pages as placeholders between batches is normal, not an error. `assemble` also prints `note: N layouts auto-selected into deck.json` whenever a page's `layout` was left to auto-selection — informational, not an error. Pin `layout` in a page file only when a specific pick needs to be locked — a `pinOnly` layout like `quote-stage` needs this pin every single time, since it never comes up through auto-selection at all (see Quote-stage below).

### Phase 4 — Render

```bash
pptfast render deck-dir/ -o deck.pptx
```

`--theme <id>` overrides the deck theme without editing the spec. `--style <path>` layers a style-token override on top (re-color without forking a theme, schema: `pptfast schema --style`). Render refuses a deck with unfilled placeholder pages unless you add `--draft` — reach for that only when the user explicitly wants a look before every page is done. It also refuses a deck where a page holds more than fits, so the layout left blocks out with nothing on the slide to say so: the error names the pages and how many blocks each lost. Fix it by shortening that page or splitting it in two, and re-render — `--allow-dropped-content` ships the file with the content missing, so only pass it if the user says to.

If the project has a `pptfast.config.json`, its theme/style are project defaults — do not fight them with `--theme` unless the user asks. Any page `notes` you wrote in phase 3 export as native PowerPoint speaker notes (View → Notes in PowerPoint/Keynote) — never drawn onto the slide itself.

### Phase 5 — Audit and optional visual self-check

Once every page is filled (no placeholders left), run the deterministic geometry audit:

```bash
pptfast audit deck-dir/
```

Zero-token, zero-variance — it renders each page off-screen and checks overflow, out-of-bounds, low-contrast, overlap, content-truncated (an ellipsis cut real text), and content-dropped (a "+N …" marker hiding an item or a whole component), exiting 1 when it finds anything (0 when clean). Each finding names its page (and id) and carries a fix. Fix the flagged page's content — same "restructure, don't delete" discipline as a `validate` error — then re-run `pptfast audit deck-dir/` alone (no need to re-render) until it exits 0. This is the deck's visual QA. Do not rely on eyeballing a screenshot instead.

If any page has a cover/chapter photo background, add `--pixels` — it rasterizes the page and samples real pixels to catch text sitting directly on an unscrimmed photo, the one case the SVG-only checks above can't see.

```bash
pptfast preview deck-dir/ -o preview/ --html
```

Writes one standalone SVG per slide plus a self-contained `preview.html`, never gated on placeholder pages. Read a few SVGs yourself (they are plain text files) to sanity-check layout and density before delivering, especially for image-heavy decks — hand `preview.html` (thumbnail strip, keyboard navigation, placeholder badges) to the user for their own look instead. When every page is filled, `preview.html` also overlays the same `audit` findings (per-page badges + a findings panel) so the reviewer sees them without a terminal — a deck with any placeholder page shows a one-line "audit skipped" notice instead. `preview.html` is read-only: it shows the deck, it never edits it. When the reviewer wants something changed, they tell you in the conversation — a screenshot of the page in question is the fastest way for both of you — and you route it through phase 6.

### Showing the deck to the user

How you hand a deck over depends on what the harness can render, and the two options are not equivalent — take the first one that is available.

**If a `pptfast_preview` tool exists, call it.** It renders the deck and puts a real slide preview in the conversation: a thumbnail strip in the tool card, full size on click, arrow keys to page. The user sees the deck without leaving the thread and without opening anything. Never fall back to handing over a URL when this tool is present — that is the experience it was built to replace. The tool reports only a summary line back to you (page count, audit state); that is deliberate, the deck itself goes to the user's screen, not into your context.

**Otherwise, serve it.** Most harnesses have no way to draw a slide in the transcript, so the review happens in the user's own browser. Never try to substitute by pasting a thumbnail or a screenshot of one page into the conversation. Serve the whole thing and let the user page through it at full size. Start the server as a background task (in DSH, follow the background-job convention and note the job id so you can stop it later):

```bash
pptfast serve deck-dir/ --no-open
```

Then run the round in this order:

1. Always pass `--no-open`. There is no browser to auto-open in an agent environment.
2. Report the exact localhost URL it prints (default `http://127.0.0.1:4400`) to the user, so they can open it themselves. That one line is the whole handoff.
3. The user pages through the deck and tells you what needs changing, in the conversation. A screenshot of the offending page is the fastest hand-off — you see exactly what they see.
4. Route each request through phase 6's revision flow. The page live-reloads on every file you save, so each revision lands in the tab the user already has open. No new link, no re-export, nothing for them to click.
5. Stay in the loop while they keep looking. When the round is over, stop the serve process (kill the background job). Never leave it running after the task ends.

### Phase 6 — Revision: edit one page, re-assemble

A revision touches the smallest file that captures it:

- Content change ("punch up the KPI page") → edit that page's `pages/<id>.json` only, then repeat phase 3's `assemble` + `validate` pair, and phase 5's `audit`, before re-rendering. Never regenerate pages nobody asked you to touch.
- Structural change (reorder, add/remove a page, change a page's type or heading) → edit `deck.spec.json` instead, re-run `pptfast spec validate` first (phase 2's no-respeccing rule still applies: only do this when the user actually asked for a structural change).
- A change the reviewer asked for in conversation (usually with a screenshot of the page) → find that page's `pages/<id>.json` by matching what they described against `deck.spec.json`/`pages/`, and treat their words as a requirement to interpret, not a patch to apply verbatim: they are describing a rendered slide, not writing page-file JSON. Translate it into a concrete content edit, then run the same content-change loop above (`assemble` + `validate` + `audit`) for every page you touched. Preview stays read-only end to end: nothing writes into `pages/*.json` except your own deliberate edit.

## Routing a follow-up request

Once a deck project exists, a follow-up message routes into exactly one of three branches — decide which before doing anything:

1. **Edit a page** ("change slide 3", "make the KPI page punchier", or a screenshot with a note) → phase 6: edit that page's file, re-assemble, re-validate, re-audit. Never touch pages nobody asked about.
2. **A new deck** (a different topic, audience, or an explicit request to start over) → phase 1: a new deck project directory, fresh narrative/theme decision, fresh spec.
3. **Unrelated to deck generation** (a question about the content, anything with no connection to slides) → do not invoke pptfast at all.

## Brand themes — the user's own company template

When the user hands over (or mentions having) a company template — a `.thmx` theme, `.potx` template, or any branded `.pptx` — extract its colors and fonts into a custom theme **before** picking a built-in theme in phase 2. Extraction runs entirely locally; the file never leaves the machine.

```bash
pptfast brand extract corp-template.pptx -o deck-dir/theme.json --id acme
pptfast render deck-dir/ -o deck.pptx     # theme.json auto-loads; set "theme": "acme" in deck.spec.json
```

A `theme.json` sitting in the deck project directory auto-loads on every command (validate/render/audit/preview/serve) — reference its id from `deck.spec.json` and no flag is needed. For a single IR file, pass `--theme-file deck-dir/theme.json` instead (works on the same five commands). Loading enforces a contrast floor: a template whose text/background tones are too close is refused with the failing token and ratio named — relay that message and ask the user whether to adjust the extracted file's colors or fall back to a built-in theme.

## Content methodology

### Component selection

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
| A set of organization/brand logos (sponsors, clients, press/"as seen in", partners) | `logo_wall` | `image_grid` |
| A set of short parallel labels (a tech stack, capabilities, keywords, certifications) — labels, not described items | `tag_row` | `bullets`/`row_cards` |

`steps` vs `flowchart` is the most common miss: if the edges never branch, it is `steps`. `flowchart` vs `cycle` is the next: does the process reach an endpoint, or does it loop back to its own start? Forcing a closed loop into `flowchart` makes the closing edge draw as a stray line/arc crossing the whole diagram — it isn't a diagram bug, it's the wrong component; reach for `cycle` the moment the last stage's arrow points back at the first. `roadmap` vs `gantt` is the next: `roadmap` groups workstreams into swimlanes with no shared numeric axis, `gantt` plots dated bars against one shared axis all items compare against. `pest` vs `swot` is the next: `pest` is external macro-environment factors only (no internal strengths/weaknesses axis), always the same four named categories — an internal-vs-external strategic assessment is still `swot`. `sankey` vs `flowchart`/funnel `chart` is the next: `sankey` conserves and splits a quantity across branching/merging paths (the band width itself carries meaning), `flowchart` is decision/process branching with no quantity, and a funnel `chart` only ever narrows in one line, never branches or merges. `data_table` vs `chart` vs `comparison` is the last: exact figures the audience reads row-by-row is `data_table`, a trend/comparison shape meant to be read at a glance is `chart`, qualitative side-by-side attributes with no exact figures is `comparison`.

Inside `chart`, the subtype is the shape of the data. `scatter` when both axes are quantities (give each point an optional `size` to make it a bubble chart). `area` when a line's filled region should read as accumulation or volume. `donut` for a part-to-whole share, with an optional total printed big in its center (`center_total: true`). `gauge` for one value's progress toward a target. `gauge` vs `kpi_cards` is the one to get right: a `gauge` is a single completion metric drawn as a filled half-ring (62% of goal), while `kpi_cards` is several independent headline numbers set side by side, so never build a row of gauges where `kpi_cards` belongs. `scatter` vs `line`: `scatter` needs a numeric x (a real coordinate on both axes), a category-labelled x-axis is still `line`.

`architecture`'s `layers` array paints top-to-bottom by default (`layers[0]` is the topmost band) — the natural order for a system stack authored top-down (presentation layer first, infrastructure last). Author a bottom-up narrative (a maturity ladder, a foundation-first capability model) in its own natural low-to-high order and set `direction: "bottom_up"` on the component to paint `layers[0]` at the bottom instead — do not hand-reverse the array to fake it, the field exists precisely so the array stays in narrative order.

`swot`/`bmc`/`waterfall`/`gantt`/`pest`/`five_forces`/`heatmap`/`sankey` are *full-body*: each fills the entire slide and must be the slide's only component — see Capacity below.

### Cycles vs. flowcharts

Both draw a sequence of stages connected by arrows — the split is whether the process has an endpoint. `flowchart` is for a process that starts somewhere and finishes somewhere, even if it branches on the way; forcing a closed loop through it means adding an edge from the last node back to the first, and `flowchart`'s layout engine has no notion that this edge is special — it draws as a long stray line or arc crossing the whole diagram, reading like a mistake, not "this repeats". `cycle` is for a process that has no endpoint: it always returns to its own start (PDCA, a product lifecycle, a flywheel, a seasonal cycle, "design → build → review → design"). The test: does the last stage's arrow point at something new, or at the first stage again? Pointing at the first stage again is `cycle`, full stop.

Fields: `items` (3-8 entries, each a required `label` and an optional `description`), an optional overall `title`. `cycle` accepts no `direction` field (stages always run clockwise — write `items` in that reading order) and no center-text slot; keep the diagram to the stages themselves and put anything else in the surrounding page text. 3 is a hard floor (2 stages can't visually close into a ring — use `flowchart` or `steps` instead) and 8 is a hard ceiling (a 9th node crowds the ring past legible size on a 1280x720 slide — split into multiple `cycle` slides instead of cramming more stages onto one ring).

### Device mockups vs. plain images

`device_mockup` frames an asset inside a themed browser-window or phone chrome instead of a bare bordered rect — it exists for exactly one job: a screenshot that has to be read as "a real product, actually running", not "a picture on a slide". Reach for it when the content is a screenshot of software/an app/a dashboard and the page's own point is that this product is real and working today. Keep plain `image` for everything else — ordinary photos, diagrams, illustrations, or a screenshot used only to illustrate a point in passing, not to assert "this is live". Overusing `device_mockup` on content that isn't actually a product screenshot reads as a strange decorative border, not evidence.

Fields: `device` (`"browser"` or `"phone"`, required — pptfast doesn't guess), `asset_id` (same semantics as `image`), an optional `caption`, and — `browser` only — an optional `url` that renders as the address-bar text (the single strongest "this is really running in a browser" signal available; a `phone` mockup has no address bar, so `validate` hard-rejects `url` set on one). The screen always crops to fill the frame (cover) — there's no `fit` choice, unlike `image`: a real device's screen fills edge to edge. No other decoration options exist on purpose — no tilt/perspective, no dark-chrome toggle, no side-by-side multi-device layout; the theme's own tokens pick the chrome colors.

### People rosters vs. row/icon cards

The test is simple: is every item a *person*? A team roster, a speaker lineup, a judging panel, an author list — `people_cards` lays 2-12 people out on an equal-weight card grid, each card a deterministic initials badge (derived from the person's `name`, no photo asset needed) plus name and optional `role`/`org`. Keep `row_cards`/`icon_cards` for non-person enumerations — features, milestones, product topics — even when they happen to carry the same name/description-shaped fields; those two cap out at 6 items each, `people_cards` at 12, so a list of people that would blow through that cap (a 9-speaker conference lineup, say) is the clearest sign it belongs on `people_cards` instead of forced into two unlabeled row_cards pages.

Fields: `people` (2-12 entries, each a required `name` and optional `role`/`org`), an optional overall `title`. The initials badge is a pure function of `name`: a Latin name takes the first letter of its first two words ("Sarah Chen" → "SC"), a single Latin word takes its own first two letters, and a CJK name takes only its first character — the surname — never two ("王小明" → "王"). There is no photo field on purpose: a slide with real headshots already has `image_grid`, and `people_cards`'s entire reason to exist is the zero-asset initials badge. 2 is a hard floor (a single person's bio doesn't need a grid — use `callout` or plain text) and 12 is a hard ceiling (a larger roster splits across multiple `people_cards` slides instead of cramming a 13th+ card onto one grid).

### Logo walls vs. image grids

A wall of third-party identity marks — sponsors, a client roster, a press/"as seen in" media wall, technology partners — is `logo_wall`, not `image_grid`. It exists because `image_grid` was built for photographs and mishandles logos two ways at once: its cells cover-crop, so a wide wordmark loses its own text to the crop ("Northbridge Robotics" rendered as "NORTHBR"), and it paints no backing behind a real asset, so a transparent single-ink logo — how press kits actually ship them — lets the slide background show straight through and a white-ink logo on a light theme vanishes into an empty box. `logo_wall` draws every logo contain-fit (never cropped) on its own auto-generated neutral backing panel, so both a near-black and a near-white logo stay legible on the same wall whatever the theme. Reach for it whenever the content is a set of logos belonging to *other* organizations. Keep `image_grid` for ordinary photographs that fill their own frame, and `device_mockup` for a single product screenshot framed as running software.

Fields: `items` (4-12 entries, each a required `asset_id` and an optional `label`), an optional overall `title`. Declare each logo once in `assets.images` and reference it by `asset_id`, exactly like `image`. The `label` is the organization's name — it doubles as the logo's accessibility text when the asset carries no `alt`, and as the visible fallback if the asset is missing (never drawn on top of a present logo). There is no grayscale/monochrome option (recoloring someone's logo is a trademark risk), no per-logo link, and no size/weight tiers — every logo gets equal weight. 4 is a hard floor (for 1-3 logos use `image` or `image_grid`) and 12 is a hard ceiling (past 12 each logo shrinks below a legible size — split a larger set across multiple `logo_wall` slides).

### Tag rows vs. bullets and cards

A row of short parallel labels — a technology stack, a capability or skill set, a keyword set, the certifications a vendor holds — is `tag_row`, not `bullets` or `row_cards`. The test is whether every item is a short *label* (a name) rather than a sentence or a described item. `tag_row` lays 2-16 short labels out as a wrapping row of capsule pills, each label measured with its real per-character width so a CJK/Latin-mixed tag wraps correctly, with an optional `emphasis: "first"` that draws the first tag in the theme accent as the primary one among the rest. Keep `bullets` for a real prose list (items that read as sentences or clauses), and `row_cards`/`icon_cards` for items that each carry their own descriptive text — a tag has none.

Fields: `items` (2-16 short strings, each ≤24 chars — a hard cap, because a tag is a label and not a sentence; over it, `validate` points you at `bullets`/`row_cards`), an optional overall `title`, and an optional `emphasis` (`"first"` or `"none"`, default `"none"`). 2 is a hard floor (a single label isn't a row — put it in the heading, a `callout`, or a `verdict_banner`) and 16 is a hard ceiling (past 16 the row reads as an unsorted keyword dump — split into multiple `tag_row` slides or group the tags into labeled sets).

### Image slides

Declare images once in `assets.images` and reference them by `asset_id` — double-check every `asset_id` spelling, a wrong key renders a silent placeholder instead of failing. An explicit `layout` id always wins over pptfast's auto-selection, which otherwise picks from the theme's layout set for that page type (the full registry set by default, unless the theme curates it narrower) — for a slide built around an image, set `layout` to one of the image takeovers: `image-split` (half-page image + side text, `image_side: left|right`), `image-top` (full-bleed top image + text columns below), `image-bottom` (text above, image below), `image-annotate` (center image + radiating callouts taken from the first 4 bullets). **Every image layout needs an `image` component somewhere in `components`** — pptfast uses the first one it finds as the image source regardless of array position, and every other component becomes the layout's text body.

Before generating art for any `image` component whose `asset_id` still has no real file behind it, run `pptfast asset-brief <target>` — it renders the deck for real and reports each slot's actual frame (not the layout's nominal slot size), crop mode with a safe-zone note, suggested generation pixels, the theme's palette, and a paste-ready prompt. Matching the reported aspect ratio and palette is what makes a generated image look intentional once it's placed instead of stretched, cropped wrong, or off-tone.

### Quote-stage

`quote-stage` is a pin-only layout: it never appears through auto-selection, only by setting `layout: "quote-stage"` explicitly on a content page. Reach for it for a genuine thesis or quote moment — one short, powerful heading carrying the entire page as its sole visual, with at most one short attribution component alongside it (a source, a name, a one-line follow-up). Never pin it onto a dense page: its declared capacity is 1, and `validate` hard-errors on anything above that, unlike an ordinary layout pinned over capacity, which only warns. Zero components is a legitimate quote-stage page too — a pure quote needs no attribution.

### Capacity

A slide is a fixed-size canvas. Draft to fit on the first pass: few components per slide, short assertive headings, bullet items within about two lines. Component and bullets budgets scale with the deck's `pacing` axis (tightest for `spacious`, loosest for `dense`) — `validate` reports the exact numbers that applied, not a flat constant. These are warnings, not hard errors — worth fixing for a tighter deck, but they never block `render`. Body text size scales the other way: `spacious` renders the largest body font (32px vs. `balanced`'s 24px and `dense`'s 20px) even though it allows the fewest components, so a `spacious` slide needs fewer and shorter items, not just tighter ones. A bullet item that is long regardless of pacing — long enough to still overflow after shrinking to the render floor — *is* a hard `validate` error, for every bullet style (`default`/`plain`/`divided`/`numbered`/`checklist` alike — it would otherwise lose real text to an ellipsis). Treat "keep bullet items short" as a real constraint regardless of style. When in doubt, split into two slides — writing to fit beats fix-up loops.

Eight component types own the whole slide instead of sharing it: `swot`, `bmc`, `waterfall`, `gantt`, `pest`, `five_forces`, `heatmap`, `sankey`. Each must be its slide's only component — `validate` hard-errors on a slide that mixes one in with `bullets` or anything else, it never silently drops the sibling.

### Beat

A content page's optional `beat` (`anchor`, `dense`, or `breathing`) is more than a `spec validate` rhythm check now — it also nudges which layout `render` auto-picks for that page: `anchor` leans toward a single bold-statement layout, `dense` leans toward a high-density layout with more visible items, `breathing` leans toward the most spacious single-column layout. It is a soft weight, not a pin — an explicit `layout` still overrides it entirely, and an unset `beat` has zero effect. Declare it deliberately, one value per page based on that page's actual role in the argument (the "big reveal" page is `anchor`, a data-heavy comparison page is `dense`, a breather page between two dense sections is `breathing`), not as a rubber stamp on every page — `spec validate`'s own beat-rotation gate already flags a streak of identical declared beats for strategies that expect variation, and stamping the same value everywhere also just cancels out the layout variety this field exists to add.

### Decor

Set slide `decor` only when the user explicitly asks for decorative flourish. Default is none — themes already carry their own motifs.

## Rules

- Never edit or post-process the generated `.pptx`
- Never bypass a `validate` error by deleting the content it flagged — restructure it (split the slide, tighten the heading, pick a denser component type)
- Public deck text follows the user's language, IR structural fields are always the English enum values from the schema
- Never tell a user that a `chart`'s or `data_table`'s numbers are editable inside PowerPoint: those components render as grouped shapes and text, fully restylable and retypable, but with no native chart part or `<a:tbl>` behind them. To change the numbers, edit the IR and re-render.
