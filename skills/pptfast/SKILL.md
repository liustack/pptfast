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

Also scan the workspace before asking anyone anything. Facts the files can answer are not questions:

- An existing confirmed `deck.spec.json` already locks narrative, theme, and chrome. Do not re-interview. Route follow-ups through phase 6.
- A `theme.json`, a pinned `pptfast.config.json` theme, a user-named theme id, or a supplied `.thmx` / `.potx` / branded `.pptx` is a brand signal. Extract or honor it. Do not ask whether a template exists.
- Request text that already names the audience, argument style, or density has derived that axis. Do not re-ask it.

A brand signal answers what the deck should look like, never how it should argue. Turning "this company's palette looks like a consulting firm" into a narrative is a guess wearing a fact's clothes, and it is how a deck ends up arguing in a shape nobody chose.

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

Propose and confirm before writing any page content.

- Lock a narrative package first: named preset (or explicit axes), theme id, chrome posture, and a type-scale band (how large cover / chapter / speech headings render: `regular` omit/1, `display` 1.3, `hero` 1.5). This is a decision layer above theme, not a visual choice. Use the Narrative interview below when any axis is still unknown and a user is present. Do not silently pick a preset in that case.
- Density (leave air vs pack the page) is decided in that interview (or derived). Follow the Sparse-page contract below when you pin climax, quote, and evidence layouts and write `notes`. `pacing` does not grow a fourth value for this.
- Theme id comes from the chosen narrative's `themeRecommendations` in `narratives --json` (or from `themes` output if none fit — a recommendation, never a constraint). If the interview's brand question returned a template, extract it first — see Brand themes below.
- Write the confirmed `narrative`, `theme`, and `chrome` into `deck.spec.json` as soon as the user agrees, before drafting any page. Do not hold them in the conversation and reconstruct them once pages exist.
- Draft `deck.spec.json`: one entry per page (`id`, `type`, `heading`, optionally `beat`/`focus`/`summary`) — opens on `cover`, closes on `ending`, everything in between is `content` or `chapter`. Write `narrative` as a preset id string when the three axes match a preset exactly, otherwise as `{strategy, pacing, audience}`. Never write `{id, pacing}` mixed shapes. Omit `chrome` by default. Write `chrome: "full"` only when every content page needs the brand footer (and whenever `meta.confidentiality` is `confidential` or `restricted`). Do not invent a `typeScale` field on the spec — it does not exist. The band is a recommendation. Only a bare IR (spec skipped) may put `theme.style.shape.typeScale` on the IR itself.
- Run `pptfast spec validate deck.spec.json` and fix whatever it reports until it prints `OK` — the hard gates (boundary pages, heading length, beat rotation, page count vs. pacing) all fire here, before a single page is written
- Once `spec validate` prints `OK`, set a `seed` (any integer) in `deck.spec.json` for revision stability — write one now, or run `pptfast assemble` once in phase 3 and copy the `generated seed …` value it prints into the spec. Without a persisted seed, editing one page's heading later can reshuffle every other page's auto-picked layout

**After the user confirms the validated spec, do not re-spec.** Restructuring a confirmed spec (reordering, retyping, dropping pages) silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first, then re-run `spec validate`.

### Narrative interview (at most one round)

When a user is present and any of audience, how it is told / strategy, or pacing is still unknown, relay the unresolved questions below in **one** message, then stop. Do not fill them in. Do not say "I'll assume". If the harness has a multiple-choice question tool, use it and pass the options verbatim.

Open that message with one sentence naming the deck you are about to build: who it is for, how the argument is told, how full a page runs, which theme, footer on or off. Build that sentence only out of what the request and the workspace actually said. Where a signal is missing, say it is missing and name the ★ option as a default, not as a read of their situation. Never dress a default as a conclusion about their meeting. Keep axis names (`pyramid`, `spacious`, `executive`) out of that sentence and out of the options. Close the message with the three ways out: take it as-is, change an option, or say none of these fit.

Skip the whole interview (zero questions) when: a confirmed spec already exists; the user said to skip questions / just generate / batch; there is nobody in this run at all; or the request already locks audience, argument style, and density. A complete brief still gets a one-line narrative package before you write the spec — that is the existing spec confirmation, not a second interview round.

Having no multiple-choice tool is not the same as having no user. In a plain conversation the user is present: the questions are the entire message and the stop still applies. Only a run with nobody in it (CI, batch, a script with no conversation) skips the pause, and there you still put the package, the reason, and what would change it in the visible output, then proceed on it. A later objection reopens the choice, and you re-run `spec validate` after changing it.

Skip only the derived axes. An empty workspace (no spec, no `theme.json`, no pinned config theme, nothing derivable in the request) asks Q1–Q4 together. A workspace with no brand signal asks Q4 even if it is not otherwise empty.

If the user skips an option, answers "anything", or replies off-list: fill the missing axis with the ★ default, name that fill in the recommendation reason, and do not follow up. "None of these fit" gets exactly one question back — which single axis is wrong — and nothing else. A veto of the package gets the prepared second candidate, not a new interview.

<!-- Maintainer note, not an instruction to relay: Q1 earns its place today only through the lookup below and the tone of the prose. The `audience` axis still changes nothing on the render surface. If a future wave stops reading `audience` in that lookup, delete Q1 rather than keep asking a question whose answer changes no deliverable. -->

**Q1 — Who is this for?** `executive` board / VP (conclusion first) · `technical` engineers who will check the numbers · `customer` ★ buyers, users, a pitch room · `public` mixed or public.

**Q2 — How should it be told?** This is the reading of the deck. Q1 and Q3 only tune it. `talk-pyramid` ★ one conclusion per page (`pyramid`) · `talk-showcase` one image or number per page (`showcase`) · `read-brief` a packed brief, evidence first (`briefing`) · `teach` a training walkthrough (`instructional`). Derive `storytelling` from 年报 / brand-film / situation-to-resolution language. Do not add it as a fifth option.

**Q3 — Sparse or packed?** `spacious` ★ leave air, few words per page · `balanced` a normal mix · `dense` pack the evidence, the page stands alone.

**Q4 — Brand template?** Only when there is no brand signal. `extract` yes, they will hand over a `.thmx` / `.potx` / branded `.pptx` · `builtin` ★ no, use a built-in theme · `later` built-in now, brand later (treat as `builtin`, do not open a second round). Whether a `theme.json` is already in the workspace is something you check, never something you ask.

End that message with this block, verbatim, one line per axis, a derived value filled in and every unresolved axis left as `?`:

```
NARRATIVE_INTERVIEW
audience: ?
tell: ?
pacing: ?
brand: ?
```

The block is the gate, not your self-discipline: while any line still reads `?`, you may not create or edit `deck.spec.json`, a page file, or a bare IR. Only the user's reply clears a `?` — or, once they have replied, the ★ default for an axis they left open. In a run with nobody in it, fill every line yourself and print the block with `(no user in this run)` on the first line, so the choice is visible and reversible.

After the reply, emit one package and one backup, one sentence of reason, one clause for what would change it, then wait for confirmation:

`recommend: <preset-or-axes> × <theme> × chrome omit|full × typeScale regular|display|hero`
`what would change it: <one clause>` — most often: this will be forwarded without a speaker, so put the extra words in notes, or recommend a PDF instead of packing the slide.

Lookup (theme = first `themeRecommendations` entry from `narratives --json` for that preset, or for the nearest preset when writing axes). Omit the field by default. Write `"full"` when `meta.confidentiality` is `confidential` or `restricted`, or every content page needs the brand footer. `customer` + `talk-pyramid` + `spacious` → `pitch` / omit / display. `executive` + `talk-pyramid` + `spacious` → `boardroom-report` / omit / display. `customer` + `talk-showcase` + `spacious` → `product-launch` / omit / display. `technical` + `teach` + `balanced` → `training` / omit / regular. `technical` + `read-brief` + `dense` → `weekly-brief` / omit / regular. `executive` + `read-brief` + `dense` → axes `{pyramid, dense, executive}` / omit / regular, theme from `boardroom-report`. `public` + storytelling + `balanced` → `annual-review` / omit / regular. Else write the axes object and take the nearest preset's theme list: `pyramid`+`executive` → `boardroom-report`, `pyramid`+`customer` → `pitch`, `showcase` → `product-launch`, `instructional` → `training`, `briefing`+`dense` → `weekly-brief`, `storytelling` → `annual-review`, else `general`.

Type-scale band: `regular` when `dense` or `balanced`. `display` when `spacious`. `hero` only on a repaint that switches the theme to `stage`. Do not retarget a boardroom deck to `stage` just to enlarge titles. Do not write `typeScale` onto `deck.spec.json`. Do not edit a repo-root `pptfast.config.json` for one deck. On a bare IR (spec skipped) a non-`regular` band may be written as `theme.style.shape.typeScale` 1.3 or 1.5.

The second candidate ships with the package, prepared in advance, and it has to differ in mechanism: flip density (`spacious` ↔ `dense`, type-scale follows), or flip what leads the argument (`pitch` ↔ `product-launch`, `training` ↔ the same material as a dense handout). The same three axes in a different theme is a repaint, not a candidate — offer that only when the user rejected the look, and say the narrative did not move. `stage` × `hero` is the repaint for a showcase that wanted bigger titles. Do not flip all three axes at once.

This interview settles the three narrative axes, not whether the request should be a deck at all. If that larger question is open, say so plainly and let the user answer it before you spec.

A very small deck may still skip the spec file and write a single IR. It may not skip this interview when axes are unknown. Write the same decisions onto the IR's `narrative` / `theme` / `chrome`.

### Phase 3 — Fill pages in batches of at most 4, validate immediately

For each page in the confirmed spec, write `pages/<page-id>.json` with its content (`components`, and optionally `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes` — never `type`/`heading`, those are locked by the spec). Remember Phase 1's boundary-page rule while drafting `cover`/`chapter`/`ending` pages — do not give them `components` or `footnote` and then have to move it. `notes` is speaker notes prose for whoever presents the deck — writing a good speaking script is a model strength. Draft `notes` whenever the page needs a spoken walkthrough beyond what is on the slide (Sparse-page contract). That is the default, not optional.

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

Fix whatever either command reports as an error and re-run until both print `OK`. `validate` can print `OK` alongside `warning:` lines (e.g. a long heading or a dense slide) — tighten those too when practical, they read better, but they do not block. Only an error stops `OK` from printing. A spec page with no page file yet is a placeholder (heading only) — assemble and validate both accept that. Leaving some pages as placeholders between batches is normal, not an error. `assemble` also prints `note: N layouts auto-selected into deck.json` whenever a page's `layout` was left to auto-selection — informational, not an error. Pin `layout` in a page file only when a specific pick needs to be locked — a `pinOnly` layout like `quote-stage`, `statement`, `pull-quote`, or `verse-chapter` needs this pin every single time, since it never comes up through auto-selection at all (see Pin-only layouts below). Climax, quote, and evidence pages pin those by default (see Sparse-page contract).

### Phase 4 — Render

```bash
pptfast render deck-dir/
```

The `.pptx` lands in `.pptfast/<deck>/`. The command prints the absolute path. Report that line to the user.

`--theme <id>` overrides the deck theme without editing the spec. `--style <path>` layers a style-token override on top (re-color without forking a theme, schema: `pptfast schema --style`). Render refuses a deck with unfilled placeholder pages unless you add `--draft` — reach for that only when the user explicitly wants a look before every page is done. It also refuses a deck where a page holds more than fits, so the layout left blocks out with nothing on the slide to say so: the error names the pages and how many blocks each lost. Fix it by shortening that page or splitting it in two, and re-render — `--allow-dropped-content` ships the file with the content missing, so only pass it if the user says to.

If the project has a `pptfast.config.json`, its theme/style are project defaults — do not fight them with `--theme` unless the user asks. Any page `notes` you wrote in phase 3 export as native PowerPoint speaker notes (View → Notes in PowerPoint/Keynote) — never drawn onto the slide itself.

### Phase 5 — Audit and optional visual self-check

Once every page is filled (no placeholders left), run the deterministic geometry audit:

```bash
pptfast audit deck-dir/
```

Zero-token, zero-variance — it renders each page off-screen and checks overflow, out-of-bounds, low-contrast, overlap, content-truncated (an ellipsis cut real text), and content-dropped (an item or whole component silently clamped out, tagged data-dropped in the SVG), exiting 1 when it finds anything (0 when clean). Each finding names its page (and id) and carries a fix. Fix the flagged page's content — same "restructure, don't delete" discipline as a `validate` error — then re-run `pptfast audit deck-dir/` alone (no need to re-render) until it exits 0. This is the deck's visual QA. Do not rely on eyeballing a screenshot instead.

If any page has a cover/chapter photo background, add `--pixels` — it rasterizes the page and samples real pixels to catch text sitting directly on an unscrimmed photo, the one case the SVG-only checks above can't see.

```bash
pptfast preview deck-dir/ --html
```

Writes one standalone SVG per slide plus a self-contained `preview.html` into `.pptfast/<deck>/`, never gated on placeholder pages. The command prints the absolute path. Report that line to the user. Read a few SVGs yourself (they are plain text files) to sanity-check layout and density before delivering, especially for image-heavy decks. Hand `preview.html` (thumbnail strip, keyboard navigation, placeholder badges) to the user for their own look instead. When every page is filled, `preview.html` also overlays the same `audit` findings (per-page badges + a findings panel) so the reviewer sees them without a terminal. A deck with any placeholder page shows a one-line "audit skipped" notice instead. `preview.html` is read-only: it shows the deck, it never edits it. When the reviewer wants something changed, they tell you in the conversation. A screenshot of the page in question is the fastest way for both of you, and you route it through phase 6.

### Showing the deck to the user

How you hand a deck over depends on what the harness can render. Take the first one that applies.

**If a `pptfast_preview` tool exists, call it.** It renders the deck and puts a real slide preview in the conversation: a thumbnail strip in the tool card, full size on click, arrow keys to page. The user sees the deck without leaving the thread and without opening anything. Never fall back to handing over a file path or a URL when this tool is present. That is the experience it was built to replace. The tool reports only a summary line back to you (page count, audit state). That is deliberate: the deck itself goes to the user's screen, not into your context.

**If the harness has a built-in browser (VS Code, Cursor, and similar), preview to a file.** Run `pptfast preview deck-dir/ --html`. The command prints the absolute path of `preview.html`. Give the user that path so they can open it in the built-in browser. Re-run the same command after each revision: the path does not change, they refresh. No port, no background process.

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
pptfast render deck-dir/     # theme.json auto-loads; set "theme": "acme" in deck.spec.json
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

### Stock photos

Run `pptfast asset-brief <target>` first so the frame, crop, and palette are known.

Query rules: short concrete nouns, English 2–4 words (`office desk`, `wind farm`). Chinese is a variant, not the only query. No mood or quality words (`beautiful`, `4k`, `cinematic`). No negative keywords (`not office`, `no people`).

Search order is Pexels, then Pixabay if a key is set, then Openverse (cc0/pdm, commercial filter).

```bash
pptfast config set pexels.apiKey
pptfast images search "office desk" --orientation landscape
```

Do not auto-pick the first result. A person or a vision model picks from the ~8 thumbs. Then download:

```bash
pptfast images fetch pexels:123 --deck <dir> --as hero
pptfast images list --deck <dir>
pptfast images generate --deck <dir> --as <asset_id>
```

Local generators stay off until enabled:

```bash
pptfast config set images.generators.grok.enabled true
pptfast config set images.generators.codex.enabled true
pptfast config set images.generators.antigravity.enabled true
```

The file lands in `.pptfast/<deck>/assets/<asset_id>.jpg` with a sidecar next to it. Reference that `asset_id` from the page. Do not delete `.pptfast/` wholesale to "rerun". That drops pinned photos.

No key: leave the slot `missing` (grey frame). Do not invent a photo. Do not scrape. Do not use Unsplash. This is a local client fetching with the user's own key. Commercial use in a presentation is allowed. Do not resell the photo standalone. Print attribution in the terminal, not on the slide by default.

### Pin-only layouts

These layouts never appear through auto-selection. Set `layout` explicitly every time you want one. `validate` hard-errors if a pin-only content layout carries more components than its declared capacity (an ordinary layout pinned over capacity only warns).

`quote-stage` is a thesis page on a content slide: one short, powerful heading is the entire visual, with at most one short attribution component (a source, a name, a one-line follow-up). Zero components is legitimate — a pure quote needs no attribution. This one still draws the theme's brand footer and motif.

`statement` is a whole-page verse or epigram on a content slide. At most one component, rendered as a small source line (quote / paragraph / citation), never as a card. Optional kicker from the preceding chapter. Brand footer and logo stay off. The theme motif still paints. The face is theme-specific (a boarded theme is not the generic italic 500 lines).

`pull-quote` is a quotation page on a content slide: heading, source line, optional muted paragraph. Source comes from a quote component's `attribution` when present, otherwise `subheading`. Brand footer and logo stay off. The theme motif still paints.

`verse-chapter` is a centered verse as a chapter open (`type: "chapter"`). Tracking chapter-index kicker, 2-line heading, optional italic subheading. No watermark numeral, no body, no footnote — the usual chapter boundary still applies. Logo stays off. The theme motif still paints.

### Sparse-page contract

A deck is for speaking. Extra words that will not fit on the slide go in `slide.notes`. If the file must stand alone as a document, recommend a PDF rather than packing the canvas.

This is not a new `pacing` value. The enum stays `dense` / `balanced` / `spacious`. The contract is pin-only layouts, `notes`, and deck `chrome`.

Climax, quote, and evidence pages pin a sparse pin-only layout when the theme offers it. Name it: `statement`, `pull-quote`, `verse-chapter`, `stat-hero`, `one-evidence`, `mono-bleed`. Do not leave those pages to auto-selection. A page that truly is one sentence still gets this pin even when pacing is `dense`. crayon, classroom (including bloom), enterprise, pulse, runway, and ember do not offer these layouts. If `validate` warns that the pin is not a sparse page this theme offers, drop the pin and write a regular content page.

When the interview or request chose `spacious`: tighten the on-slide budget. Heading is the visual. At most one body component on a pinned sparse page (a source line, a single number, a single chart or table). Zero bullets on those pages. Split instead of stacking.

When `balanced` or `dense`: write to the pacing budget. Still pin a sparse layout when a page is one sentence, one number, one quote, or one piece of evidence.

The spoken script goes in `slide.notes`. `render` exports it as native PowerPoint speaker notes (View → Notes, Presenter View). Never draw the script onto the canvas.

Leave `chrome` off the spec and the IR unless every content page needs the brand footer. Write `chrome: "full"` whenever `meta.confidentiality` is `confidential` or `restricted`, or the file needs an organization colophon. Confidentiality and date then appear on the cover. They stay off every other posture.

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
