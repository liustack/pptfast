# @liustack/pptfast

## 0.5.0

### Minor Changes

- Audit chain, CJK font identity, and text-fit hardening.

  - Package-integrity hard gate on every export (9 OOXML invariants, no opt-out) plus an optional pixel-contrast audit (`pptfast audit --pixels`, Node via sharp and browser via OffscreenCanvas) with an explicit `checks` field — an unchecked pass can never read as a pass.
  - East-asian typeface slots (`a:ea`) declared on every text run, so CJK glyphs under Georgia/Consolas render in a controlled font instead of PowerPoint's silent per-glyph substitution.
  - `validate` moves to dual-threshold severity: editorial budgets warn without blocking, geometric content-loss ceilings block. Long bullet items that render fine no longer fail generation.
  - Exact mono width model for code blocks (measured Consolas metrics), universal bullet wrap budgets across all styles, matrix axis-title fitting, and a heading truncation signal the audit can see.
  - Chart robustness: zero/negative data values, mixed-sign dumbbell domains, and extreme magnitudes all export cleanly. Donut/pie center labels attribute contrast against the real sector geometry, not a bounding box.

## 0.4.0 (2026-07-20)

Narrative vocabulary v4 — `narrative`/`strategy`/`pacing`/`beat`, `deck.spec.json`, IR v4 with a `migrate` command for v3 projects. Benchmark-driven fixes: deterministic exports, audit attribution overhaul, CJK copy cleanup, boundary-page hard gates, truncation visibility markers.

## 0.3.0 (2026-07-19)

Keynote-style flat rendering, weighted deterministic layout selection with seed-stable revisions, 13 themes with a real-contrast ink system, deck-project workflow (spec + pages, assemble/disassemble), deterministic audit, speaker notes, preview overlay with annotation export, 28 components including SWOT/BMC/waterfall/gantt.

## 0.1.0 (2026-07-17)

Initial release — semantic IR to native editable PPTX via an SVG dialect compiler.
