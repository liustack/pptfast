---
summary: 'Brand extraction (`pptfast brand extract`) and custom-theme loading (`--theme-file`, deck-project `theme.json`): the OOXML slot → token mapping, the muted derivation, the registerTheme contrast gate, id rules, and the known limits (ea fonts, logos, slide-master backgrounds)'
read_when:
  - touching src/themes/brand-extract.ts, src/themes/brand-theme-file.ts, or the CLI's --theme-file / theme.json loading path
  - a user's extracted theme is refused at load time (contrast floor) or renders with unexpected colors
  - extending extraction to new sources (logo, slide master) or new tokens
---

# Brand extraction and custom-theme loading

`pptfast brand extract <file.thmx|.potx|.pptx> -o my-brand.theme.json` reads
the OOXML theme part out of a user's own Office file and writes a pptfast
theme file — **entirely locally**, no network anywhere on the path. The file
is pure data (tokens + label + optional brand config): no layouts curation,
no motif, no layoutTendencies — those default to the full set at load time,
same as any `registerTheme` caller that omits them.

Feasibility was verified against all 39 `.thmx` themes shipped with a macOS
PowerPoint install (39/39 extracted cleanly — reference implementation in
`.issues/notes/brand-extraction-probe.py`). Those files are never committed:
test fixtures are programmatically built minimal zips
(`src/themes/__fixtures__/thmx.ts`).

## Slot → token mapping

| OOXML slot | pptfast token | Note |
|---|---|---|
| `dk1` / `lt1` | `text` / `bg` | Assigned by **measured lightness**, not slot name — whichever is darker becomes `text`. All 39 real themes keep the conventional order; the swap only fires for a producer that put a light color in `dk1` |
| `lt2` | `surface` | Falls back to `bg` when absent |
| `accent1` (else `dk2`) | `primary` | |
| `accent2` (else `primary`) | `accent` | |
| `accent1-6` | `chartPalette` | Structural 1:1 — OOXML has exactly six accent slots |
| — | `muted` | Derived: `text` blended toward `bg` in 20 `mixHex` steps, taking the most-muted step that still clears **4.5:1 against both `bg` and `surface`** (`deriveMuted`, no new color math — the same blend/ratio utilities `metaInk` uses) |
| `<a:majorFont>`/`<a:minorFont>` `<a:latin>` | `fonts.heading`/`fonts.body` | Extracted face leads the stack, followed by a Windows-safe fallback chain matching its serif/sans register (consulting's `Bower → Georgia → …` precedent) |

Extraction is deterministic: same zip bytes → same theme JSON (pinned by a
double-run test). `hlink`/`folHlink` are parsed but unmapped (no hyperlink
token exists). Structural failures (no theme part, no `dk1`/`lt1`, no accent
colors) throw; anything softer degrades with a documented fallback.

## Loading

Loading always goes through `registerTheme` (`src/themes/definitions.ts`) —
there is no second code path — so its 0.9.0 contrast floor is automatically
the quality gate: `colors.text`/`colors.muted` below 3.0:1 against a checked
slide type's background is refused at load time, naming the token, the
measured ratio, and the background. `pptfast brand extract` additionally
pre-checks the same floor and appends a warning to its output when the file
it just wrote would be refused.

Two ways to load, both registering **before** `validateIr` runs:

- `--theme-file <path>` on `render` / `validate` / `audit` / `preview` /
  `serve` — registers the file, then applies its id at CLI-flag precedence
  (an explicit `--theme` still wins the selection). Wired once, in
  `applyDeckConfig` (`src/cli/commands.ts`).
- Deck-project `theme.json` — auto-loads on every deck-directory command
  (including `assemble`, and `spec validate` when the spec file sits next to
  it), registration only: the deck references the theme's id from
  `deck.spec.json`. Zero flags.

Id rules (`registerBrandThemeFile`, `src/themes/brand-theme-file.ts`):
a theme file may never shadow a builtin id (hard error at both extract and
load time — determinism: what `consulting` resolves to must not depend on
which files were loaded). Re-loading an already-registered id is a no-op
(`pptfast serve`'s rebuild loop re-runs the load on every rebuild), which
also means editing a theme file mid-`serve` needs a server restart to apply.

## Known limits

- `<a:ea>` East Asian font slots are empty in nearly every Western Office
  theme — CJK text falls through to `eaFontFaceFor`'s existing fallback
  (`src/svg/fonts.ts`), which is the intended path, not a gap to fix here.
- Logos live in the slide master / media parts, not the theme part — a
  future `brand` subcommand (the command group is reserved for this), out of
  scope for extraction today.
- A theme's real slide background can come from the slide master's own
  `<p:bg>` (e.g. a dark gradient referencing `dk2`) — the theme part alone
  cannot see it, so a visually dark Office theme extracts as its light
  `lt1`-based palette. Hand-adjust the written JSON when the dark look is
  the point.
