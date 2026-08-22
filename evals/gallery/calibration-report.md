# Gallery evals calibration report

Date: 2026-08-22.
Pre-fix SHA: `321748d` (the `fix/gallery-review-r1` workspace HEAD at review time).
Human set: 44 `rework` page ids restored from `.issues/2026-08-22-gallery-review-r1/fix-list.md`, not a localStorage export. Mapping: every id exists exactly at that SHA.
L2 model: local `grok` CLI, `--no-subagents`, `--json-schema` `pptfast-gallery-verdicts/3`.
Raw L2: `evals/gallery/calibration/pre-fix-l2.json`.

This auditor does **not** replace a human pass. Combined hit rate is 70.5% (31/44), below the 80% bar. Thresholds were not moved to inflate the number.

## Scores

| Gate | Result |
| --- | --- |
| L1 on pre-fix SVGs | 12/44 (27%) |
| L2 on pre-fix SVGs | 31/44 (70.5%) |
| Combined (L1 or L2 flags rework/limit) | **31/44 (70.5%)** |
| L2 dual-run classification drift (3 pages × 2) | 0/3 (0%), under 5% |
| Pre-fix clone | `git clone --shared` into `/tmp/pptfast-gallery-cal-321748d`, not a worktree |
| Fixture bytes | 0.82MB (budget 15MB) |
| Branch blob growth | ~1.1MB (budget 20MB) |
| Offline render | corpus assets are `data:` JPEGs, `findRemoteAssetRef` is null |

L1 hits are a subset of L2 hits. Adding L1 does not raise combined recall.

## What L2 catches

Almost every hit names the same motif: a five-dot row, one filled and four hollow (the progress-dot taboo). That rule fires on academic p01, asymmetric-triptych, callout, crayon p04/p07, banner-heading, quote-stage, corner-wedge, image-split, five-forces, people-cards, quote, row-cards, and rail-numbered. It is a real banned decoration at SHA `321748d`, and the vision pass sees it.

A few hits are other rules: vermilion p07 rides the footer divider (edge-stick, L1 agrees), two-column en still prints `+N` (L1 overflow-marker), petal-wheel labels sit under 12px (L1 font-size), crayon p01 is scored `limit` for a missing crayon identity.

## Misses (13)

These 13 human rework pages came back `pass`. Reasons from the model notes, not from a threshold tweak.

| Page | Human issue (fix-list) | L2 said |
| --- | --- | --- |
| theme--enterprise--zh--p01 | banner top-right pale square | pass, note admits it did not inspect the image |
| component--comparison-pill-panels (zh/en/mixed) | vermilion rounded chips on square cards | pass, praised even inner padding |
| theme--playbill--zh--p01 | date chip text not rotated with the sticker | pass |
| layout--banner-chapter (zh/en/mixed) | underline drawn through the title (strikethrough) | pass, called the gold line an underline |
| theme--arena--zh--p01 | title overlapping the wedge | pass |
| layout--image-top--en | English text overflow | pass |
| theme--ember--zh--p05 | left content dropped, block not centered | pass |
| theme--lecture--zh--p04 | cards overflowing | pass, one note still says "awaiting visual inspection" |
| component--cycle-hub-spoke--zh | spoke lines wrong | pass |

Pattern: L2 is strong on a repeated, high-contrast motif (the five dots) and weak on geometry the human actually filed (underline y, overlap, overflow, missing column, chip radius, text rotate). Two of the thirteen notes never looked at the PNG. That is a runner/prompt failure, not a close call.

## Current HEAD (not a clean "fixed" set)

The r1 fix wave is not fully merged. Current renders of the same 44 ids still trip L1 font-size / edge-stick on vermilion p07, banner-heading en, two-column en, ember p05, five-forces en, people-cards, and rail-numbered. Those are leftover defects or an L1 12px floor that tags captions and kickers. They are not evidence of systematic false positives on pages that are already clean. A later replay after the r1 fixes land should re-score the "fixed" column.

## Dual-run

Three pre-fix pages, two L2 calls each, pass vs rework/limit:

- `layout--two-column--en` rework/rework
- `component--cycle-petal-wheel--zh` rework/rework
- `component--people-cards--zh` rework/rework

0/3 drifted. Sample is small. It does not contradict the ≤5% rule.

## Gap to 80%

Need 35 hits. Have 31. The four extra would have to come from the miss list above. Raising L1's font-size net would add HEAD false positives, not those misses (the miss pages were L1-clean). Lowering L2 to treat "progress dots nearby" as enough would not help pages that do not have that motif. The honest next work is teaching L2 the actual miss classes (underline-as-strikethrough, overflow, overlap, chip radius, rotated type) with planted PNGs, then replaying. Not moving 80% to 70%.

## CI

`pnpm check` runs L1 unit tests (planted SVG defects) and the live-corpus "L1 completes" smoke. L2 is skipped when `CI=true`, with reason `CI=true`. Replay L2 with `CI= pnpm exec tsx evals/gallery/calibration/l2-pass.mts`.
