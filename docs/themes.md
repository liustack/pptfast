---
summary: 'The 21 built-in themes (22 ids), extracting your own brand from a PowerPoint template, and style overrides via CLI flag, IR, or project config'
read_when:
  - picking a theme, or looking up a theme id
  - making the output look like your own company (`pptfast brand extract`)
  - re-coloring a theme without forking it
---

# Themes

A theme bundles a style (design tokens), a brand (identity chrome: logo, footer, page number), and a layout set for each page type. There are 21 built-ins — 22 theme ids, since `bloom` is a pure recolor of `classroom`.

| id | label |
|---|---|
| `consulting` | Business Consulting |
| `enterprise` | Enterprise |
| `academic` | Academic |
| `insight` | Financial Insight |
| `campaign` | Marketing Campaign |
| `bloom` | Soft Bloom (a recolor of `classroom`) |
| `classroom` | Classroom |
| `ink` | Ink Wash |
| `tech` | Tech |
| `runway` | Fashion Runway |
| `journal` | Editorial Journal |
| `luxe` | Luxe |
| `heritage` | Heritage |
| `pulse` | Health & Life Science |
| `terra` | Sustainability & ESG |
| `ember` | Startup Pitch |
| `vermilion` | Official Report |
| `crayon` | Kids Education |
| `arena` | Esports & Entertainment |
| `museum` | Museum |
| `stage` | Keynote Stage |
| `swiss` | Swiss Institutional |

`pptfast themes [--json]` prints the same list from the installed version.

Every built-in points each page type at the full set of registered layouts. Every layout adapts its text color to the theme's actual background, so the full set stays readable everywhere. Narrowing that set is a theme author's deliberate choice, and none of them narrows anything today.

What each theme *does* narrow is its preference: every built-in names the covers it leans toward, so two themes rendering the same deck under the same seed usually pick different covers. It stays a preference, not a lock — pin `slide.layout` when a cover has to be exactly one thing.

`bloom` is `classroom` with five colors swapped — and nothing else. Same structure, same fonts, same corner radius, same decoration geometry, drawn in its own palette. Pick `bloom` for the cherry-blossom paper and dry rose, `classroom` for the misty-blue lecture paper; the same deck picks the same layouts under either. That makes 22 theme ids and 21 distinct designs.

## Your own brand

The fastest way to make the output look like *your company* instead of a built-in theme is to extract the brand from a template you already have. `pptfast brand extract` reads colors and fonts out of a `.thmx` theme, `.potx` template, or `.pptx` presentation and writes a pptfast theme file. It runs **entirely locally — the file never leaves your machine** (verified against all 39 Office themes that ship with a macOS PowerPoint install).

```bash
pptfast brand extract corp-template.pptx -o my-brand.theme.json
pptfast render deck.json -o deck.pptx --theme-file my-brand.theme.json
```

`--theme-file` works on `render`, `validate`, `audit`, `preview`, and `serve`. In a deck project directory, drop the file in as `theme.json` and it auto-loads on every command — reference its id from `deck.spec.json`, no flag needed.

The 12 OOXML color slots map almost 1:1 onto pptfast's tokens, with the six accent colors becoming the chart palette. The one derived token, `muted`, is stepped toward the background only as far as it can go while still clearing a 4.5:1 contrast ratio.

Loading enforces the same contrast floor every registered theme faces: a palette whose text and background are too close is refused, naming the failing token, the measured ratio, and the background. It is never rendered unreadable. A custom theme can never shadow a built-in id.

Extraction internals are in [`brand-extraction.md`](./brand-extraction.md), the contrast machinery in [`contrast-system.md`](./contrast-system.md).

## Style overrides and project config

To re-color a theme without forking it, write a style JSON (schema: `pptfast schema --style`) and pass it per render (`--style brand.json`), or pin it project-wide in a `pptfast.config.json` (found by walking up from the current directory — `pptfast init` scaffolds one).

```json
{ "theme": "consulting", "style": { "colors": { "primary": "#0B5FFF", "accent": "#FF6A00" } } }
```

Precedence: CLI flag > project config file > user config file > IR. The IR can carry the same override in `theme.style` for a fully self-contained deck. The full four-layer chain is in [`ir.md`](./ir.md#deck-projects).
