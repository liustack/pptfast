---
summary: Product direction beyond the current release — v0.3 concept realignment (Keynote-style themes, scenario-driven selection) and the theme-registry ecosystem
read_when:
  - planning v0.3+ work
  - deciding whether a capability belongs in the core engine or the theme ecosystem
---

# Roadmap

## v0.3 — concept realignment (in design)

Realign the vocabulary around a Keynote-style, no-master model and re-home structural selection onto narrative scenarios:

- **theme** = the distributable, top-level unit: `style` + `brand` + a curated set of layouts — the 13 built-ins become themes, and a style override re-colors a theme
- **theme.style** = pure design tokens (color/type/radius/icon flavor/spacing scale) — aligned with both the PPTX theme and the shadcn theme
- **theme.brand** = identity chrome (logo/footer/page number/watermark/cover signature), filled into a layout's optional slots. No slideMaster concept: a layout with no slot for a given brand element simply omits it (graceful degradation) — chrome has always been drawn straight into the flat per-slide SVG, so the model now matches the implementation
- **layout** = page-level template with named slots — shipped as an explicit registry (30 archetypes + 4 image takeovers), replacing the old archetype/variant split. **component** = the atomic units that fill slots — shipped for content (the IR's `components`, renamed from `blocks`). Unifying decoration/media/icon elements under the same concept is still ahead
- **scenario** = narrative axes (mode × delivery × audience) — shipped in the IR as an optional field: a named preset string (e.g. `boardroom-report`) or a partial axes object, 7 presets each carrying soft theme recommendations, an omitted axis or the whole field defaulting to `general`. `delivery` now scales the content-quality gate's density and bullets budgets. Still ahead: weighting `mode`'s layout/component tendencies into structural selection — a theme's curated layouts stay the hard boundary (what this theme supports), scenario only weights inside it, never a hard whitelist
- Plan artifact (`deck.plan.json`) shipped as a CLI-gated first-class citizen: `pptfast plan validate` enforces mode-aware hard gates (boundary pages, heading length, rhythm rotation, page count vs. delivery), and `assembleDeck`/`disassembleDeck` (SDK) plus `assemble`/`disassemble` (CLI) materialize a deck project directory (`deck.plan.json` + `pages/<id>.json` + `assets/`) to and from IR — enabling page-level generation and revision without holding a whole deck in context. Still ahead: a static HTML preview bundle

## Theme ecosystem (v0.4+)

Distribute themes the way shadcn distributes registry items: a theme is a JSON bundle installable from a registry URL via the CLI (`pptfast theme add <url>`). Community registries stay open. Style and curated layouts open first, brand chrome opens later. A curated premium theme marketplace and brand-VI-to-theme services are potential commercial channels — the engine itself stays MIT (open-core).
