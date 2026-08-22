---
summary: 'Full CLI command reference, the audit checks, asset briefs, and the recommended agent loop'
read_when:
  - looking for a command the README does not list
  - reading an `audit` finding and wanting to know what the check means
  - generating art for an image slot (`asset-brief`)
  - wiring an agent around the validate → audit → render loop
  - checking whether the install on this machine is healthy (`doctor`)
---

# CLI reference

Every command that takes a `<target>` accepts the same three forms: an IR JSON file, a [deck project directory](./ir.md#deck-projects), or a bare deck name.

| Command | Does |
|---|---|
| `render <target> [-o <out.pptx>] [--theme <id>] [--theme-file <file>] [--style <file>] [--draft] [--allow-dropped-content] [--no-git-ignore]` | Validate + render to a `.pptx`. Without `-o`, writes `<project>/.pptfast/<deck>/<deck>.pptx` |
| `validate <target>` | Check the IR, print page-scoped errors and advisory warnings |
| `audit <target> [--json] [--pixels]` | Deterministic geometry review, exits 1 when it finds anything (see [Auditing](#auditing)) |
| `asset-brief <target> [--json]` | Image-generation brief for every `image` component (see [Asset briefs](#asset-briefs)) |
| `spec validate <spec.json>` | Check a deck spec against the schema and the strategy-aware hard gates |
| `assemble <dir\|name> [-o <file>]` | Materialize a deck project directory into a single IR JSON file |
| `disassemble <ir.json> -o <dir>` | Split an IR JSON file into a deck project directory |
| `schema [--style \| --spec]` | Print the IR JSON Schema (or the style-override schema, or the deck spec schema) |
| `themes [--json]` | List the built-in themes |
| `brand extract <file> -o <out.theme.json> [--id] [--label]` | Extract brand colors and fonts from a `.thmx`/`.potx`/`.pptx` into a theme file, entirely locally (see [Themes](./themes.md#your-own-brand)) |
| `narratives [--json]` | List named narrative presets (strategy/pacing/audience axes + theme recommendations) |
| `preview <target> [-o <dir>] [--html] [--no-git-ignore]` | Render each slide to a standalone SVG (`--html` also writes a self-contained `preview.html`), never gated on placeholder pages. Without `-o`, writes `<project>/.pptfast/<deck>/` |
| `serve <target> [--port 4400] [--no-open]` | Live-preview server: the same review page as `preview --html`, auto-reloading on source changes |
| `migrate <input> -o <output>` | Convert a v3 IR file to v4, rewrite chrome to branding, bloom to classroom, or logo_wall to image_grid, or convert a `deck.plan.json` project directory to `deck.spec.json`. Deterministic, no model call |
| `init` | Scaffold `pptfast.config.json` |
| `config set <key> [value]` / `config show` | Store Pexels/Pixabay/Openverse credentials and generator switches in `$PPTFAST_HOME/config.json`. Omit the value for an apiKey or clientSecret to enter it hidden. `show` masks secrets and labels `(file)` / `(env)` |
| `images search <query> [--orientation] [--color] [--min-width] [--min-height]` | Search Pexels, then Pixabay if keyed, then Openverse (cc0/pdm). Prints attribution lines |
| `images fetch <provider>:<id> --deck <dir> --as <asset_id>` | Download a photo into `.pptfast/<deck>/assets/` with a sidecar |
| `images list --deck <dir>` | List pinned stock photos for a deck |
| `images generate --deck <dir> --as <asset_id> [--prompt]` | Generate with a local CLI (off until enabled) and pin into `.pptfast/<deck>/assets/` |
| `doctor [--json]` | Diagnose this machine's install: skill copies, dsh plugin, runtime, optional capabilities, self-test render, stock-photo keys, and local image generators (see [Doctor](#doctor)) |
| `check-update` / `self-update` | Check npm for a newer release / update the global install |

`--theme-file` works on `render`, `validate`, `audit`, `preview`, and `serve`.

Omit `-o` and `render`/`preview` write under `.pptfast/<deck>/` at the project root (the directory that holds `pptfast.config.json`, or cwd if there is no project config). The command always prints the absolute path. The first time that directory is created, the CLI appends `.pptfast/` to `.git/info/exclude` so the artifacts stay local. `--no-git-ignore` skips that. A project config `outDir` replaces `.pptfast` wholesale and also skips the exclude line. An explicit `-o` still wins, and that path is never pruned or ignored on the tool's behalf.

`render` refuses to hand you a file that is quietly incomplete. A deck with unfilled placeholder pages needs `--draft`. A deck where a page holds more than its content area can fit — so the layout leaves blocks out, with nothing on the slide to tell a reader — needs `--allow-dropped-content`; the error names the pages and how many blocks each lost. Shortening the page or splitting it in two is the real fix, and `audit` will point at the same pages. Both flags are for the case where you already know and want the file anyway. Neither gate touches `preview` or `serve` — looking at work in progress is what those are for.

## Auditing

`pptfast audit <target> [--json]` renders every page off-screen and runs a deterministic geometry review — no screenshots for a model to squint at, no variance between runs.

Six checks:

- **overflow** — text past its own box or column.
- **out-of-bounds** — anything past the page edge.
- **low-contrast** — the WCAG luminance ratio between text and its resolved background.
- **overlap** — two components' regions substantially colliding.
- **content-truncated** — text the renderer had to cut short with an ellipsis to fit (`data-truncated="1"`).
- **content-dropped** — a card list trimmed to what fits, or a whole component the page had no room for. The renderer stamps silent `data-dropped` (page-level also `data-dropped-silent`). The slide does not show "+N …".

Audit is advisory, not a hard gate. `validate` already rejects a structurally invalid or over-dense deck. Audit catches what a *valid* deck can still get wrong at render time: an author-chosen text color that sits too close to the background, two components whose combined content collides, a card list that had to drop an item.

Add `--pixels` (Node only, needs the optional `sharp` dependency) to also catch text sitting directly on an unscrimmed photo background, by rasterizing the page and sampling real pixels. Every response carries a `checks` field (`{ svg: "completed", pixels: "not-requested" | "completed" }`) so a caller can tell a skipped check from a passed one. The pixel layer's own determinism caveat is in [`contrast-system.md`](./contrast-system.md).

Run it once every page is filled. Human output groups findings by page (`page 3 (p-kpi): [low-contrast] …`, each message carrying a fix suggestion) plus a summary line. `--json` prints the full machine-readable report. The exit code alone is enough for an agent to judge: `0` clean, `1` when it finds anything. Fix the flagged page and re-run `audit` alone, no need to re-render. Skipped placeholder pages are noted in the summary.

```bash
pptfast audit examples/basic.json
# → audited 5 pages, 0 skipped, 0 findings
```

## Asset briefs

`pptfast asset-brief <target> [--json]` writes the brief an image-generation prompt needs and a caller cannot see: the real rendered frame of every `image` component, not the layout's nominal slot.

For each `image` component the brief carries the rendered `frame` (x/y/w/h plus aspect ratio, measured in an off-screen render pass, never a hand-copied constant), the `fit` mode with a crop-safe-zone note, `suggested_pixels` (2× the frame), the resolved theme's `palette` and `mood`, and a paste-ready English `suggested_prompt`.

An `asset_id` with nothing usable in `assets.images` still gets a full entry, marked `missing: true` — that is the generation to-do list. A component the selected layout never draws is reported as `rendered: false` rather than silently dropped.

The brief is purely informational: no exit-code gate, no change to the rendering pipeline, no generation API call.

```bash
pptfast asset-brief my-deck/
# → page 3 (content, p-hero) — pic (missing)
#     frame: 613x307 @ (571,203), aspect 2:1, cover
#     suggested pixels: 1226x614
#     ...
```

## Doctor

`pptfast doctor [--json]` diagnoses the install on this machine. It reads local state only: nothing is written, no network call is made. Rendering a PPTX still needs no credentials. The images section reports whether Pexels/Pixabay/Openverse credentials are present and whether they came from the file or the env. It never prints the value. A following generators section reports whether grok, codex, and antigravity were found on PATH and whether each is enabled.

Eight sections, in the order the report prints them:

- **Installed skill copies.** An installed skill is a *copy* — [`INSTALL.md`](../INSTALL.md) step 2 copies the folder into the harness's skill directory, and that copy keeps its install-time launcher forever. Upgrading the CLI never touches it, so a machine can sit on a months-old version while `pptfast --version` reports something much newer. Doctor scans `~/.claude/skills`, `~/.codex/skills`, and `~/.agents/skills` (Pi and OpenCode both read the last one) for a `pptfast/` folder, reads the `PINNED` version out of each copy's `scripts/run.sh`, and names any copy behind the running CLI as stale, with the clone-and-copy line that refreshes it in place ([`INSTALL.md`](../INSTALL.md) step 2's own command, aimed at that copy). Finding no copy at all is normal, not a problem: on dsh the skill ships inside the plugin, and the CLI works on its own. A copy with no `run.sh`, or a `run.sh` with no `PINNED` line, is reported as "version unknown" rather than failing the scan.
- **DSH plugin.** When `~/.dsh/` exists, every profile directory under `~/.dsh/profiles/` is checked for `@liustack/pptfast` — read from the profile's own `node_modules` (what would really load), falling back to the version its `package.json` declares. A profile behind the CLI gets the pinned install command, `npx -y @deepseek-ai/dsh plugin --profile <profile> add @liustack/pptfast@<version>`, the version named on purpose because dsh installs through a pnpm that holds back fresh releases and silently resolves `@latest` to an older one. No `~/.dsh/` means the check does not apply, which is not the same as failing it.
- **Runtime.** Node against the `engines` floor (22.19), plus Bun's own version when running under Bun.
- **Optional capabilities.** Whether `sharp` is importable and whether `soffice` is on PATH. Without sharp, preview rasterization and `audit --pixels` are unavailable — plain SVG preview and `.pptx` rendering are unaffected. Without soffice, the PDF export path is unavailable, likewise with no effect on the main flow.
- **Self-test render.** A tiny built-in deck goes through the real pipeline in memory — validate, render a slide to SVG, generate the `.pptx` bytes — with nothing written to disk. The report says how many milliseconds it took. Every other check is an observation about the environment; this one proves the thing actually works.
- **Workspace artifacts.** The project root doctor resolved from cwd, the absolute `.pptfast/` (or configured `outDir`) path, and whether git already ignores it. Informational: it never fails the run and never writes an exclude line.
- **Images.** Optional stock-photo search. Each provider is present or missing, with source `(file)` / `(env)`. Missing keys are informational, never a hard error. On POSIX, a user config file that is group/other-readable is a warning (`chmod 600`). The value is never printed.
- **Image generators.** Optional local CLIs (grok, codex, antigravity). Each is found or not found, enabled or disabled. Missing or disabled generators are informational, never a warning or a hard error. Enable with `pptfast config set images.generators.<id>.enabled true`.

The exit code is `1` only for a hard failure: a Node below the floor, or a self-test render that did not complete. Skill drift, a stale dsh plugin, missing optional capabilities, and missing stock-photo keys are warnings and still exit `0` — the main write-IR → validate → render flow keeps working through all of them. `--json` prints the full structured report (`skills.copies[]`, `dsh.profiles[]`, `capabilities[]`, `selfTest`, `workspace`, `images`, `generators`, and the `errors`/`warnings` arrays the exit code is derived from).

```bash
pptfast doctor
# → Installed skill copies (a copy keeps its install-time version forever)
#     [!] Codex: /Users/me/.codex/skills/pptfast — pins 0.14.0 (stale)
#         fix: rm -rf /tmp/pptfast-src && git clone --depth 1 https://github.com/liustack/pptfast.git /tmp/pptfast-src && cp -R /tmp/pptfast-src/skills/pptfast/. /Users/me/.codex/skills/pptfast/
#   ...
#   Self-test render (a built-in deck through the real pipeline, in memory)
#     [ok] 2 slides validated, rendered, and packed into 20952 bytes in 244ms
#
#   0 errors, 1 warning
```

## The agent loop

The loop an agent should run when it generates a deck:

1. `pptfast schema` — read the vocabulary before writing anything.
2. Write the IR JSON.
3. `pptfast validate` and fix what it reports. Errors carry a page number and a message that can be applied in place, so the loop closes without a human.
4. `pptfast asset-brief` before generating art for any image slot. The real rendered frame and crop mode are not visible in the IR, and a mismatched aspect ratio is the most common reason a generated image looks wrong once it is placed.
5. `pptfast audit` for the same kind of feedback on what a valid deck can still get wrong at render time. The exit code alone says whether it is clean.
6. `pptfast preview` to write SVG files the agent can look at and self-check the layout.
7. `pptfast render`.

`pptfast preview --html` also writes a self-contained `preview.html` for a human reviewer: keyboard navigation, placeholder badges, zero network calls once it is open in a tab (a remote-URL image asset stays remote, the one gap in self-containment). When every page is filled, that page also overlays the same `audit` findings — per-page badges plus a findings panel, click to jump to the page. A deck with any placeholder page shows a one-line "audit skipped" notice instead.

`preview.html` is read-only: it shows the deck and never writes to it. A reviewer who wants something changed says so in the conversation — a screenshot of the page is the fastest hand-off — and the agent routes it through `pages/*.json`. `pptfast serve <target>` runs the same page live: a browser tab that auto-reloads on every source change, so each revision lands in the tab the reviewer already has open.

Alongside `preview.html`, `preview --html` also writes `manifest.json`: a flat page list with stable ids, the SVG file each page lives in, the canvas size, and the audit findings per page. That is the half a *program* can read — a harness with its own UI draws the deck from it, one without opens the HTML instead, and neither has to re-render the deck to do it.

The skill wraps this loop for an agent ([`skills/pptfast/SKILL.md`](../skills/pptfast/SKILL.md)), whether it was installed as a skill folder or as the DSH plugin. An internal, model-agnostic benchmark (`tests/bench/`, not published to npm) scores how well a model follows that skill on a fixed question bank — see `tests/bench/README.md`.

## More

- [`ir.md`](./ir.md) — what goes in the IR, narratives, layout selection, deck projects.
- [`themes.md`](./themes.md) — the 24 built-in themes (24 ids), brand extraction, style overrides.
- [`concepts.md`](./concepts.md) — the theme/layout/component/narrative model.
- [`deck-projects.md`](./deck-projects.md) — the deck project format in depth.
