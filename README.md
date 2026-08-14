<p align="center"><img src="assets/banner.jpg" alt="pptfast — ship your deck in minutes, not hours" width="100%"></p>

<h1 align="center">pptfast</h1>

<p align="center"><b>Ship your deck in minutes, not hours.</b></p>

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
  <img src="https://img.shields.io/badge/no%20API%20key-needed-4c1?style=flat-square" alt="No API key needed">
</p>

## Highlights

**⚡ Tell your AI what to cover, get the deck.** You bring the content, the engine handles layout, color, type size, and spacing. The same content renders the same deck every time, so there is nothing to redo and no luck involved.

**✏️ A real deck, not a picture of one.** Every heading, bullet, and chart bar opens in PowerPoint for you to retype and restyle. Chart and table figures are the exception: to change the numbers, have your AI rebuild that page. 17 ready-made styles, and you can pull the colors and fonts out of a deck your company already uses.

**🔌 Installs into the agent you already use.** One command puts pptfast into DeepSeek Harness, Claude Code, or any agent that reads a skill folder (Codex and friends), and it knows how to build a deck the moment it lands.

**🔁 Revisions without describing everything again.** One command opens a preview page in your browser: page through it, write your notes right on the slides, and your AI picks them up and fixes them. The page refreshes itself as each revision lands.

**🔒 No account, no API key, no network.** Install it and it works. Node 22.19+ or Bun is all you need on the machine.

## Install

**Step 1, hand it to your AI.** Send it this line:

> Install the pptfast deck skill following https://raw.githubusercontent.com/liustack/pptfast/main/INSTALL.md, then run the health check and tell me the result.

There is no step 2. Your AI puts the skill folder where your harness reads it, and the skill brings its own version-pinned launcher, so there is no CLI to install by hand. pptfast renders entirely locally: no API key, no account, nothing to configure. The only prerequisite is Node 22.19+ (or Bun).

**On DeepSeek Harness, it is one command instead.** pptfast is a native DSH plugin there, not a skill folder:

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@0.19.0
```

Name the version. Without it, the install quietly lands on an older release and you miss the newest features. `npm view @liustack/pptfast version` prints the current one. The plugin card shows up as "pptfast", registers the deck-generation skill, and carries the CLI inside its own package. Uninstalling removes the skill with no residue.

## Quick start

An IR is one JSON file describing the whole deck. Write a minimal one, then run the validate → render → preview loop:

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
| `doctor` | Check the install: runtime, skill copies, optional capabilities, self-test render |

Full reference: [`docs/cli.md`](./docs/cli.md).

## Credits

Icon primitives are extracted from [lucide](https://lucide.dev) (ISC License). pptfast itself was extracted from a production AI-deck-generation system and CJK-typography-tuned (full-width punctuation width, Chinese line breaking, a Chinese-first font stack, explicit east-asian font-slot declarations) from day one.

## License

[MIT](./LICENSE)
