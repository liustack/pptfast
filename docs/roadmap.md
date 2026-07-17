---
summary: Product direction beyond the current release — v0.3 concept realignment and the style-registry ecosystem
read_when:
  - planning v0.3+ work
  - deciding whether a capability belongs in the core engine or the style ecosystem
---

# Roadmap

## v0.3 — concept realignment (in design)

Realign the vocabulary to the PPTX spec and re-home structural selection:

- **theme** = pure design tokens (color/type/radius/icon flavor/spacing scale) — aligned with both the PPTX theme and the shadcn theme
- **master** = brand chrome (logo/footer/page number/watermark/cover signature) — aligned with the PPTX slideMaster
- **style** = the distributable bundle: theme + master + style-affinity tags. The 13 built-ins become styles, and a tokens swap re-colors a style
- **block** = page-level layout with named slots (absorbs today's archetype + variant pair), **component** = composable units that fill slots (today's content blocks, decorations, icons)
- **scenario** = narrative axes (mode × delivery × audience) that own structural selection sets — styles only carry a soft affinity, never a hard whitelist
- Plan artifact (`deck.plan.json`) as a CLI-gated first-class citizen, page-level generation and revision, static HTML preview bundle

## Style ecosystem (v0.4+)

Distribute styles the way shadcn distributes registry items: a style is a JSON bundle installable from a registry URL via the CLI. Community registries stay open. A curated premium style marketplace and brand-VI-to-style services are potential commercial channels — the engine itself stays MIT (open-core).
