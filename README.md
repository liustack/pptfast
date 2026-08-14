<p align="center"><img src="assets/banner.jpg" alt="pptfast — semantic IR in, native DrawingML out" width="100%"></p>

<h1 align="center">pptfast</h1>

<p align="center"><b>Stable, editable PPTX generation for AI agents: semantic IR in, native DrawingML out.</b></p>

<p align="center">🎯 <b>Deterministic to the byte: same IR, same seed, same PPTX</b> 🎯</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./INSTALL.md">Install (hand it to your AI)</a> ·
  <a href="./docs/cli.md">Commands</a> ·
  <a href="./docs/ir.md">IR</a> ·
  <a href="./docs/themes.md">Themes</a> ·
  <a href="./skills/pptfast/SKILL.md">Agent skill</a> ·
  <a href="https://github.com/liustack/modlens">ModLens (vision)</a>
</p>

<p align="center">
  <a href="https://x.com/liustack"><img src="https://img.shields.io/badge/follow-%40liustack-black?style=flat-square&logo=x&logoColor=white" alt="Follow @liustack on X"></a>
  <a href="https://www.npmjs.com/package/@liustack/pptfast"><img src="https://img.shields.io/npm/v/@liustack/pptfast?style=flat-square&label=npm&color=cb3837" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@liustack/pptfast?style=flat-square" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Not%20backed%20by-Y%20Combinator-FF6600?style=flat-square&logo=ycombinator&logoColor=white" alt="Not backed by Y Combinator">
  <img src="https://img.shields.io/badge/same%20seed-same%20bytes-4c1?style=flat-square" alt="Same seed, same bytes">
</p>

## Highlights

**🎯 Deterministic to the byte.** Rendering is a pure function: the same IR and seed pick the same layouts, draw the same geometry, and write the same bytes to disk. Preview never disagrees with the final render, and editing one page cannot reshuffle the rest of the deck.

**✏️ Every shape stays editable.** Native DrawingML out, not a picture pasted onto a slide: headings, bullets, chart bars, and table cells are real PowerPoint objects you can select, restyle, and retype. 17 built-in themes, and `pptfast brand extract` pulls your company's colors and fonts out of a `.pptx`/`.potx`/`.thmx` entirely locally.

**🔌 Installs into the agent you already use.** One command puts pptfast into DeepSeek Harness, Claude Code, or any agent that reads a skill folder (Codex and friends), and it knows how to build a deck the moment it lands.

**🔁 A review loop built for agents.** schema → validate → audit → render, with errors that carry page numbers and copy-paste fixes. `pptfast serve` opens a live preview that reloads on every change, and reviewer annotations land back on disk as `revision-request.json` for the agent to act on.

**🔒 Zero config, fully local.** No API key, no account, no network at render time: Node >= 18 is the whole prerequisite.

## Why

Freeform SVG/HTML-to-PPTX pipelines have a high ceiling and an unstable floor: a weak model, or a strong one having an off turn, produces a deck that is broken, off-brand, or unreadable.

pptfast hands the model a fixed vocabulary instead of a blank canvas. You (or your agent) write an IR — a JSON file describing the whole deck — and pptfast picks the layouts, applies one of 17 themes, and writes native DrawingML: PowerPoint's own shape format, where every element is directly editable in PowerPoint.

Charts and tables are drawn as shapes and text. PowerPoint cannot re-plot them from new numbers — to change the numbers, edit the IR and render again. Everything else on a slide is a normal PowerPoint object: select it, restyle it, retype it.

## Install

**Step 1, hand it to your AI.** Send it this line:

> Install the pptfast deck skill following https://raw.githubusercontent.com/liustack/pptfast/main/INSTALL.md, then run the health check and tell me the result.

There is no step 2. pptfast renders entirely locally: no API key, no account, nothing to configure. The only prerequisite is Node >= 18.

### Manual install

```bash
npm install -g @liustack/pptfast
pptfast --help
```

Node >= 18. Or build from source: `git clone https://github.com/liustack/pptfast.git && cd pptfast && pnpm install && pnpm build`.

### As a Claude Code plugin

The repo doubles as a Claude Code plugin that ships the deck-generation skill:

```
/plugin marketplace add liustack/pptfast
/plugin install pptfast@pptfast
/reload-plugins
```

The skill drives the CLI, so install the CLI too (`npm install -g @liustack/pptfast`).

### As a DSH plugin

pptfast is also a DeepSeek Harness (DSH) plugin. One command installs it into a DSH profile:

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@0.18.0
```

Name the version. Without it, the install quietly lands on an older release and you miss the newest plugin features. `npm view @liustack/pptfast version` prints the current one.

The plugin card shows up as "pptfast" and registers the deck-generation skill into DSH's skill system. The CLI it drives ships inside the plugin package, so there is nothing else to install. Uninstalling the plugin removes the skill with no residue.

### Other agents (Codex, etc.)

[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md) is a self-contained Markdown playbook. Reference it from your agent's context (for example `AGENTS.md`) and it teaches the same schema → outline → validate → render loop.

## Quick start

Write a minimal deck, then run the validate → render → preview loop:

```bash
cat > deck.json <<'EOF'
{
  "filename": "hello.pptx",
  "theme": { "id": "consulting" },
  "slides": [
    { "type": "cover", "heading": "Hello pptfast", "subheading": "A first deck in ten minutes" },
    { "type": "content", "heading": "Why it works", "components": [
      { "type": "bullets", "items": ["Semantic IR in", "Native DrawingML out", "Every shape stays editable"] } ] },
    { "type": "ending", "heading": "Thanks" }
  ]
}
EOF
pptfast validate deck.json                              # → OK — 3 slides, theme "consulting"
pptfast render deck.json -o out/hello.pptx              # → wrote out/hello.pptx (3 slides, ~24 KB)
pptfast render deck.json -o out/tech.pptx --theme tech  # same deck, different theme
pptfast preview deck.json -o out/svgs                   # SVG per slide, for a visual self-check
```

One shape rule: `cover`/`chapter`/`ending` slides are heading + subheading only, components live on `content` slides. `validate` says exactly this if you mix them up.

No install at all also works: `npx -y @liustack/pptfast validate deck.json`. In a source checkout, `node dist/cli.js` replaces `pptfast`, and `examples/` has ready-made IR files to try.

The commands you will reach for most:

| Command | Does |
|---|---|
| `validate <target>` | Check the IR, with page numbers on every error |
| `render <target> -o <out.pptx> [--theme <id>]` | Render a `.pptx` |
| `preview <target> -o <dir> [--html]` | One SVG per slide, plus a self-contained review page |
| `serve <target>` | Live preview that reloads on every change, with reviewer annotations |
| `audit <target>` | Geometry review: overflow, out-of-bounds, low contrast, overlap |
| `themes` | List the 17 built-in themes |

Full reference: [`docs/cli.md`](./docs/cli.md).

## What's public

The supported surface is deliberately small: the **CLI**, the **IR schema** it speaks (`pptfast schema`), the **deck project format**, the **agent skill** ([`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)), and the **DSH plugin**.

The IR is the product's API. An agent talks JSON and the command line, it does not `import` anything.

There is no public JS API: the package's JS internals ship for the package's own use and carry no semantic-versioning promise (see [`docs/internal-api.md`](./docs/internal-api.md)).

## Credits

Icon primitives are extracted from [lucide](https://lucide.dev) (ISC License). pptfast itself was extracted from a production AI-deck-generation system and CJK-typography-tuned (full-width punctuation width, Chinese line breaking, a Chinese-first font stack, explicit east-asian font-slot declarations) from day one.

## License

[MIT](./LICENSE)
