# pptfast benchmark

A model-agnostic evaluation of how well a model follows `skills/pptfast/SKILL.md` to turn a
plain-English deck request into a working pptfast artifact. Zero API calls, zero model
dependency: this directory is a fixed question bank plus a run protocol. Scoring (Task 2 of
this wave) is entirely mechanical — it consumes the artifact files a model produces, never the
model itself, and applies no subjective quality dimension.

`tests/bench/` is tracked in git but excluded from the published npm package — see "Package
exclusion" below.

## Directory layout

```
tests/bench/
  questions/q01..q20/
    prompt.md   the request handed to the model-under-test, verbatim
    meta.json   coverage annotation — never shown to the model, descriptive only
  results/<model-tag>/<question-id>/
    ...         the model-under-test's artifact (created by a run, not checked in here)
    meta.json   optional self-reported run stats (tokens/duration/model), pass-through only
  README.md     this file
```

## Run protocol

For each question:

1. Give the model-under-test exactly two things: `skills/pptfast/SKILL.md` and that question's
   `prompt.md`. Nothing else — no `meta.json`, no other question's prompt, no hints about which
   component or layout the question is aiming at.
2. Let the model run the SKILL's workflow to completion: narrative/theme choice, spec (or a
   direct bare IR file for a small deck, per the SKILL's own "skip the spec" allowance),
   `pages/*.json`, `assemble`, `validate`, `render`, `audit` — whatever phases the model
   actually reaches.
3. Save the resulting artifact into `tests/bench/results/<model-tag>/<question-id>/`:
   - a bare IR file (any `.json` filename), or
   - a full deck project directory (`deck.spec.json` + `pages/` + optional `assets/`), for
     questions that asked for the spec-then-fill workflow.
4. Optionally drop a `meta.json` alongside it with self-reported `{ tokens?, duration_seconds?,
   model? }`. This is passed through into reports verbatim — it is never scored, never used to
   adjust any pass/fail outcome.

**Hard rule: no manual touch-ups after generation.** Whatever the model produced on its own is
what gets scored — no hand-editing a `pages/*.json` to fix a `validate` error, no re-running a
single failed step in isolation after inspecting the failure, no swapping in a better asset.
First-shot quality under the SKILL's own self-check loop (the model's own `validate`/`audit`
iterations, run by the model itself as part of its normal workflow) is the thing this benchmark
measures — a human correcting the output after the fact would measure the human, not the model.

### Harness role

The harness plays the user for any turn where the model-under-test stops and waits on a human
reply. `skills/pptfast/SKILL.md` Phase 2 asks the model to propose a spec and confirm it before
writing page content — a single-shot harness has no human to supply that confirmation, so the
harness scripts it instead, with exactly two fixed lines, used verbatim:

- If the model-under-test's turn is asking for confirmation of a spec it just proposed (the
  Phase 2 "propose and confirm" gate), reply: `Spec confirmed, proceed.`
- For any other clarifying question the model asks, reply: `Proceed with your best judgment.`

Both lines are fixed and verbatim across every harness implementation and every question — no
paraphrasing, no tailoring to the specific question, no improvised detail. This scripted
exchange is part of the standard run protocol, not a manual touch-up: it stands in for the one
human turn the SKILL's own workflow expects, injected mechanically rather than by a person
reading the model's output and deciding how to respond. The five deck-project questions (q03,
q06, q08, q13, q17) additionally tell the model directly, inside the prompt itself, that its
plan is pre-approved once it validates (the prompts' own wording — plain-English "plan", not the
schema term — left as written per this file's "prompts stay untouched" discipline), so a harness
with no scripted-reply turn at all (a true single-shot, no-second-message harness) still gets a
runnable question.

## Question bank schema (`meta.json`)

```jsonc
{
  "id": "q01",
  "title": "Q2 Budget Performance Review",
  "coverage": {
    "strategy": "pyramid",          // one of the 5 narrative strategies (src/narrative)
    "pacing": "spacious",           // one of the 3 pacing tiers
    "expects_components": ["kpi_cards", "waterfall", "verdict_banner"],
    "workflow": "bare-ir",          // "bare-ir" | "deck-project" — which path the prompt asks for
    "image_deck": false             // true if the prompt attaches image material
  },
  "lang": "en"                      // "en" | "zh"
}
```

`coverage` is descriptive annotation only, consumed by the scorer's `coverageHits` reporting
(Task 2). It never penalizes a model for landing on a different component or layout than
`expects_components` names — a model that solves the same brief with an equally valid component
choice is not wrong. `workflow` and `image_deck` are additive fields beyond the wave brief's
base shape, added so the scorer can report the deck-project-workflow and image-asset coverage
cells without re-deriving them from prompt text.

## Answer-leak discipline

No `prompt.md` names a pptfast component type, layout id, or narrative/schema vocabulary word
(`swot`, `bmc`, `gantt`, `waterfall`, `roadmap`, `matrix`, `timeline`, `bullets`, `kpi_cards`,
`asset_id`, `layout`, `narrative`, `pyramid`/`storytelling`/`instructional`/`showcase`/`briefing`,
etc.). Every question is written as a working business ask in plain language — a strategy
question describes strengths/weaknesses/opportunities/threats sitting together on one slide, a
schedule question describes dated bars sharing one calendar axis — the same shape the SKILL's
own component-selection table maps to a specific type, without the prompt ever naming that type.
`coverage.expects_components` in `meta.json` is the only place the real component ids appear,
and `meta.json` is never handed to the model-under-test (see run protocol above).

## Coverage matrix

5 strategies × 3 pacings × 4 new components (each ≥1 natural-narrative question) × ≥2 image decks ×
≥3 deck-project-directory questions × 2-3 Chinese questions, across 20 questions — every cell
met, several by the same question:

| id | title | strategy | pacing | lang | workflow | image | expects_components |
|---|---|---|---|---|---|---|---|
| q01 | Q2 Budget Performance Review | pyramid | spacious | en | bare-ir | | kpi_cards, waterfall, verdict_banner |
| q02 | Aria Pro Launch Keynote | showcase | spacious | en | bare-ir | yes | kpi_cards, image, verdict_banner |
| q03 | New-Hire Onboarding Curriculum | instructional | balanced | en | deck-project | | numbered_cards, row_cards |
| q04 | Leadership Offsite Strategy Slide | pyramid | spacious | en | bare-ir | | swot |
| q05 | Weekly Engineering Status Update | briefing | dense | en | bare-ir | | bullets, row_cards |
| q06 | Year-in-Review All-Hands Story | storytelling | balanced | en | deck-project | | timeline, quote, image |
| q07 | 新业务方向内部评审 | pyramid | balanced | zh | bare-ir | | bmc |
| q08 | Data Center Migration Runbook | instructional | dense | en | deck-project | | gantt |
| q09 | Checkout Outage Postmortem | briefing | dense | en | bare-ir | | bullets, row_cards |
| q10 | Brazil Market Entry Recommendation | pyramid | spacious | en | bare-ir | | chart, matrix, verdict_banner |
| q11 | Open Enrollment Reference Guide | instructional | dense | en | bare-ir | | numbered_cards, row_cards |
| q12 | Annual Impact Report | storytelling | balanced | en | bare-ir | yes | image, kpi_cards, quote |
| q13 | Seed Round Pitch Deck | pyramid | spacious | en | deck-project | | kpi_cards, chart, comparison |
| q14 | 一线安全培训课程 | instructional | balanced | zh | bare-ir | | numbered_cards, row_cards |
| q15 | University Recruiting Keynote | showcase | spacious | en | bare-ir | yes | image_grid, kpi_cards, image |
| q16 | Weekly Support Metrics Brief | briefing | dense | en | bare-ir | | kpi_cards, row_cards |
| q17 | H2 Engineering Planning Review | pyramid | balanced | en | deck-project | | roadmap |
| q18 | 内部工程师认证课程手册 | instructional | dense | zh | bare-ir | | numbered_cards |
| q19 | Annual Shareholder Meeting Keynote | storytelling | spacious | en | bare-ir | | quote, verdict_banner |
| q20 | Analytics Dashboard Launch Readiness Review | showcase | balanced | en | bare-ir | | kpi_cards, row_cards |

Totals: strategy — pyramid 6, instructional 5, briefing 3, storytelling 3, showcase 3 (all ≥3).
pacing — spacious 7, balanced 7, dense 6 (all ≥5). New components — swot ×1 (q04), bmc ×1
(q07), waterfall ×1 (q01), gantt ×1 (q08) (all ≥1). Image decks — 3 (q02, q12, q15, ≥2).
Deck-project-directory — 5 (q03, q06, q08, q13, q17, ≥3). Chinese — 3 (q07, q14, q18, within
2-3).

## Scoring (`tests/bench/score.mts`)

```
pnpm bench:score [questionsDir] [resultsDir]
# defaults to `tests/bench/questions` / `tests/bench/results`, both resolved against cwd
```

Walks `<resultsDir>/<model-tag>/<question-id>/` for every model directory found, scores each
question in the fixed `<questionsDir>` question bank against it, and writes:

- a per-model `<resultsDir>/<model-tag>/report.md` — one row per question plus an aggregates
  section
- a cross-model `<resultsDir>/summary.md` — one row per model (pass rates, mean findings,
  determinism rate), sorted alphabetically by model tag

Every metric is purely mechanical, computed off the SDK the render chain already exposes
(`validateIr`/`auditDeck`/`generatePptx`, `src/index.ts`):

- **validate first-pass**: does the produced artifact (or its assembled IR, for a deck project —
  read via `readDeckDir`, `src/cli/deck-dir.ts`, the same seam `pptfast validate`/`render` use)
  pass `validateIr` — pass/fail plus the raw error count
- **audit findings**: `auditDeck` finding count (overflow, out-of-bounds, low-contrast, overlap, plus the advisory content-truncated and content-dropped codes — all six count) —
  only computed when validate passed (an invalid IR has nothing well-formed enough to audit)
- **render success**: does `generatePptx` produce a well-formed `.pptx` without throwing
- **determinism**: render the same artifact twice and compare the two `.pptx` files byte for
  byte via `normalizedPptxSha1` (`tests/bench/score.mts`), with the one known clock-dependent exclusion
  the render chain already carries — `docProps/core.xml` (pptxgenjs bakes
  `new Date().toISOString()` into it on every call — same exclusion the `normalizedZipMap`
  precedent in `src/pptx/generate-notes-export.test.ts` establishes). Every other zip part is
  read as a binary buffer (not a lossy UTF-8-decoded string) and hashed — a genuine byte
  comparison, including embedded binary image assets, not a structural or stringified diff.
  `null` when the render itself failed (nothing to compare)
- **coverage hits**: which of `meta.json`'s `expects_components` actually appear in the
  produced IR's top-level `slides[].components[].type` — reported for a human reader, never fed
  back into `validatePass`/`renderOk`/any other pass-fail decision

**Validate semantics changed 2026-07-21** (borrow wave, Task 2 — `validateIr` dual-threshold
severity recalibration, `src/api.ts`): `ok`/`errors` now reflect only error-severity
`checkIrQuality` findings (an empty deck, a bullet item past the render-safety ceiling) — the
editorial-budget findings (missing/long heading, density, bullets count/length) moved to a
separate `warnings` array and no longer fail `ok`. `validatePass`/`validateErrorCount` above read
straight off `v.ok`/`v.errors.length` and never inspected `checkIrQuality` severity directly, so
`score.mts` needed no code change — "only an error counts as a validate fail" already matches the
new semantics automatically. Cross-round comparability note: a `report.md`/`summary.md` generated
before this date used the pre-recalibration semantics (any content-quality finding, warn or
error, failed `validatePass`), so a `validatePass` rate from before this date is not directly
comparable to one from after — some answers that used to fail purely on an editorial finding
(no structural or render-safety problem) now pass.

A missing result directory, malformed JSON, an ambiguous artifact (more than one candidate `.json`
file), or a `readDeckDir`/`assembleDeck` structural error scores as a fail for that question with
a `reason` in the report's notes column, without aborting the rest of the batch. Self-reported
`meta.json` (`{ tokens?, duration_seconds?, model? }`, run protocol step 4) passes through into
the report's `tokens`/`duration_s` columns verbatim when present, blank otherwise — never scored.
Both `report.md` files and `summary.md` are byte-identical across two scoring runs of the same
result set — no timestamps or other non-deterministic content in the report body.

## Testing the scorer

`tests/bench/score.test.ts` (vitest, run by `pnpm check` like every other suite) exercises the scorer
against `tests/bench/fixtures/`: `tests/bench/fixtures/questions/{fx01,fx02,fx03}` (a 3-question fixture bank,
one bare-IR question, one deck-project question, one audit-sensitive question) scored against
`tests/bench/fixtures/results/green-model/` (all three questions validate clean, audit clean, render
deterministically) and `tests/bench/fixtures/results/degraded-model/` (one malformed-JSON artifact, one
validate-failing IR — an unknown theme id, one validate-clean but audit-positive IR — a real
low-contrast finding from `luxe` theme + `kpi_cards` `delta: "down"`, the same source
`src/svg/audit/deck-audit.test.ts` pins). The suite asserts exact metric values per fixture
question, report shape, and — the scorer-reproducibility requirement — that two independent
`runScoring` calls over the same fixture tree produce byte-identical report content, plus a
`normalizedPptxSha1` unit suite proving the determinism hash both ignores a
`docProps/core.xml`-only difference and is sensitive to any other single-byte change (text or
binary), so the double-run assertion is a genuine byte comparison rather than a vacuous
always-equal check.

Two more `loadArtifact` failure branches, standalone `fx97`/`fx98` results not part of the
3-question fixture bank (same pattern as the `fx99` "missing directory" fixture — kept out of
`tests/bench/fixtures/questions` so they don't shift the bank's aggregate counts), are also covered: a
deck-project directory whose `pages/p-cover.json` redeclares the spec-locked `heading` field
(`readDeckDir`/`assembleDeck` structural-assembly failure), and a result directory with two
candidate `*.json` files (the "ambiguous artifact" branch). Both score as a fail with a `reason`,
never a thrown exception. Every `reason`/error string that would otherwise embed an absolute
filesystem path is rewritten repo-root-relative before it reaches the report's `notes` column
(`relativizeToRepoRoot` in `score.mts`) — same-machine byte-identical reproducibility never
depended on this, but it also makes two reports from two different checkouts of the same fixture
tree comparable.

## Package exclusion

`package.json`'s `files` whitelist is `["dist", "README.zh-CN.md"]` — `tests/bench/` is not listed, so
`npm pack` never includes it. Verified by running `npm pack --dry-run` from the repo root and
confirming no `tests/bench/` entry appears in the file list it prints.

## Single-shot API run mode (`run.mts`)

The second sanctioned run mode next to the agentic protocol above: `pnpm bench:run <prefix> [qids...]` drives an external OpenAI-compatible model through ONE completion per question — the prompt carries SKILL.md, the live vocabulary (`schema` / `narratives --json` / `themes --json`), and the question, and the model must answer with a bare IR JSON document. No tool loop, no self-check iterations, so this measures first-shot floor quality (stricter than agentic mode — expect lower validate pass rates). Credentials come from the repo-root `.env` (gitignored): `<PREFIX>_BASE_URL` / `<PREFIX>_API_KEY` / `<PREFIX>_MODEL`. Artifacts land in `tests/bench/results/<model>/<qid>/` with `meta.json` recording `mode: "single-shot"`, so `score.mts` consumes both modes identically — compare runs of the same mode against each other, not across modes.

`run.mts` also takes optional `--questions-dir=<dir>` / `--results-dir=<dir>` flags (default: `tests/bench/questions` / `tests/bench/results`, unchanged) so a second question bank — the probe bank below — can be run without touching the main bank's result history: `pnpm bench:run <prefix> --questions-dir=tests/bench/questions-probe --results-dir=tests/bench/results-probe`. Question ids are auto-discovered from whichever `questionsDir` is in effect (`/^[a-z]\d\d$/`, matches both `q01`- and `p01`-style ids). `score.mts` already took `[questionsDir] [resultsDir]` positional args before this wave (`pnpm bench:score tests/bench/questions-probe tests/bench/results-probe`) — no scorer code changed for the probe bank.

## Probe bank (`questions-probe/`)

A second, separate question bank — `tests/bench/questions-probe/p01..p08`, its own id namespace, the main `questions/q01..q20` bank untouched — built for exactly one purpose: **evidence-gate input for the candidate component pool** (`.issues/specs/2026-07-24-pptfast-layout-component-roadmap.md` §5/§7), not model benchmarking. The gate requires ≥2 distinct-scenario cases per candidate of "the model wanted to express X and the existing 32-component pool could not carry it" before that candidate gets built. The 2026-07-24 rerun (`.issues/notes/2026-07-24-bench-rerun.md`) found the main bank structurally incapable of producing this evidence — it was authored around the existing pool, so no question in it ever puts a model in a position where only a missing component would do. The probe bank exists to put the model in exactly that position, once per candidate.

**Scores from this bank are diagnostic, not comparative.** There is no "probe bank pass rate" worth tracking release over release — the deliverable is the qualitative read of what a model tried to do when the pool couldn't carry its intent, produced by a human (or an agent doing the analysis pass, not the run itself) reading each artifact.

### Candidates and prompts

One question per candidate, chosen from the roadmap's §7 candidate pool:

| id | candidate | scenario |
|---|---|---|
| p01 | hierarchy | a three-level, asymmetric reporting-line announcement (a flat list would lose the who-reports-to-whom grouping) |
| p02 | cycle | a four-stage support routine that explicitly closes the loop and repeats indefinitely |
| p03 | agenda | a six-section meeting deck's opening slide, one section marked as currently active |
| p04 | tier_stack | a four-rung capability-maturity ladder, deliberately without per-rung counts/percentages (kept out of funnel territory) |
| p05 | people_cards | five new executives introduced by name/title/one-line background/current remit, initials in place of photos |
| p06 | logo_wall | a twelve-name, equal-weight customer/partner proof slide for an investor deck |
| p07 | venn | two teams' responsibilities where the overlap itself (three shared duties) is the argument being made |
| p08 | device_mockup | a real attached product screenshot that needs to read as "a phone in someone's hand," not a floating image (materials pattern follows q02/q12) |

### `meta.json` fields

Same schema as the main bank (`coverage.strategy`/`pacing`/`expects_components`/`workflow`/`image_deck`, `lang`), plus two probe-only fields — `meta.json` is never shown to the model-under-test, same as the main bank:

```jsonc
{
  "probe": true,               // marks this question as belonging to the probe bank
  "probe_candidate": "hierarchy" // which §7 candidate component this question targets
}
```

`expects_components` here does **not** name the candidate (the candidate does not exist yet) — it names the existing-pool component(s) a model would most plausibly reach for while hard-fitting the scenario into the current 32, e.g. hierarchy → `architecture`/`flowchart`, venn → `rings`/`comparison`, agenda → `numbered_cards`/`row_cards`. The rationale for each pairing lives here (JSON has no comment syntax to carry it inline):

- **p01 hierarchy** → `architecture` (nearest node-and-connection shape), `flowchart` (branching-process shape, sometimes mis-reached-for even without a decision to branch on)
- **p02 cycle** → `steps` (linear-process shape, no native loop-back), `flowchart` (branching shape, sometimes forced into a loop)
- **p03 agenda** → `numbered_cards`/`row_cards` (list shapes with no way to mark one item as "current" without extra text)
- **p04 tier_stack** → `comparison` (side-by-side shape, not stacked/ordered), `matrix` (2×2 grid, wrong axis count for an n-rung ladder)
- **p05 people_cards** → `row_cards`/`icon_cards` (nearest per-person card shapes, no dedicated person/avatar semantics)
- **p06 logo_wall** → `image_grid` (nearest equal-weight grid shape, built for photos not marks/wordmarks), `icon_cards`
- **p07 venn** → `rings` (nearest circular-comparison shape, no true set-intersection region), `comparison` (side-by-side, no overlap region at all)
- **p08 device_mockup** → `image` (plain image, no frame semantics), `image_compare` (two-image shape, not a device-frame shape)

### How to run

Single-shot mode against the four weak test-account models (`.env` prefixes `DSPRO`/`DEEPSEEK`/`QWEN35`/`QWEN`, same accounts the main bank rerun used), one probe result tree kept separate from the main bank's:

```bash
for p in DSPRO DEEPSEEK QWEN35 QWEN; do
  pnpm bench:run "$p" --questions-dir=tests/bench/questions-probe --results-dir=tests/bench/results-probe
done
pnpm bench:score tests/bench/questions-probe tests/bench/results-probe
```

`tests/bench/results-probe/` is gitignored (same as `tests/bench/results/`) — nothing under it is ever committed, only the question bank and code that produced it.

### Analysis protocol

The mechanical scores (`validatePass`/`auditFindingCount`/`renderOk`/`coverageHits`) are a starting filter, not the finding. For every produced artifact, read it and classify what actually happened using the same buckets the 2026-07-24 rerun's gap analysis used (`.issues/notes/2026-07-24-bench-rerun.md`'s failure-attribution table):

- **EXPRESSION-GAP** — the artifact this bank exists to surface: the model reached for an existing component and visibly bent its semantics to fit content that component's own contract doesn't cover (e.g. a `flowchart` with no real decision branch standing in for a reporting tree, a `comparison` with more than two sides standing in for a ladder), or the model bullets-dumped the structure into plain text/`bullets` because nothing in the pool fit and it gave up trying to structure it, or — the strongest possible signal — the model invented a `type` string that does not exist in the schema at all (an automatic `validatePass: false`, worth reading regardless of the fail).
- **COMPONENT-CHOICE** — the model picked a real, defensible component that is merely a worse fit than one of the `expects_components` guesses, without visibly abusing its semantics — evidence *against* the gate for that scenario, not for it.
- **SCHEMA / CONTENT / OTHER** — same meaning as the main bank's rerun analysis (schema-shape mistakes, content-quality issues, everything else) — noise relative to this bank's purpose, but still worth tallying so an EXPRESSION-GAP claim isn't cherry-picked out of a batch of otherwise-broken artifacts.

A candidate clears the evidence gate's ≥2-distinct-scenario bar only on **EXPRESSION-GAP** findings, and per §5's own wording, distinct scenario means distinct underlying case, not distinct model — the same p0x prompt hard-fit by two different models is one scenario, not two. This analysis pass is deliberately not performed by the run itself (`run.mts`/`score.mts` stay purely mechanical, no subjective dimension, `AGENTS.md`'s "评审基调") — it is the controller's next dispatch after the artifacts exist.
