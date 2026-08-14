<p align="center"><img src="assets/banner.jpg" alt="pptfast：输入语义化 IR，输出原生 DrawingML" width="100%"></p>

<h1 align="center">pptfast</h1>

<p align="center"><b>面向 AI agent 的稳定、可编辑 PPTX 生成工具：输入语义化 IR，输出原生 DrawingML。</b></p>

<p align="center">🎯 <b>字节级确定性：同一份 IR、同一个 seed，渲染出同一份 PPTX</b> 🎯</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./INSTALL.md">安装（转发给你的 AI）</a> ·
  <a href="./docs/cli.zh-CN.md">命令</a> ·
  <a href="./docs/ir.zh-CN.md">IR</a> ·
  <a href="./docs/themes.zh-CN.md">主题</a> ·
  <a href="./skills/pptfast/SKILL.zh-CN.md">Agent skill</a> ·
  <a href="https://github.com/liustack/modlens">ModLens（视觉）</a>
</p>

<p align="center">
  <a href="https://x.com/liustack"><img src="https://img.shields.io/badge/follow-%40liustack-black?style=flat-square&logo=x&logoColor=white" alt="Follow @liustack on X"></a>
  <a href="https://www.npmjs.com/package/@liustack/pptfast"><img src="https://img.shields.io/npm/v/@liustack/pptfast?style=flat-square&label=npm&color=cb3837" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@liustack/pptfast?style=flat-square" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Not%20backed%20by-Y%20Combinator-FF6600?style=flat-square&logo=ycombinator&logoColor=white" alt="Not backed by Y Combinator">
  <img src="https://img.shields.io/badge/same%20seed-same%20bytes-4c1?style=flat-square" alt="Same seed, same bytes">
</p>

## 亮点

**🎯 字节级确定性。** 渲染是纯函数：同一份 IR、同一个 seed，选出同样的版式、画出同样的几何、落盘同样的字节。预览与最终渲染永不打架，改一页也不会搅动其余页面。

**✏️ 每个图形都保持可编辑。** 输出原生 DrawingML，不是贴上去的一张图：标题、要点、图表柱子、表格单元格都是 PowerPoint 里可选中、可改样式、可改文字的真实对象。只有图表和表格里的数字是例外，它们是画出来的图形而不是活数据，换数字要改 IR 重新渲染。17 个内置主题，`pptfast brand extract` 还能完全在本地从 `.pptx`/`.potx`/`.thmx` 里抽出你公司的配色与字体。

**🔌 装进你正在用的 agent。** 一条命令装进 DeepSeek Harness、Claude Code，或任何读 skill 文件夹的 agent（Codex 等），装完就会用。

**🔁 为 agent 而生的审阅回路。** schema → validate → audit → render，报错带页码和可直接照抄的修法。`pptfast serve` 打开随改动自动刷新的实时预览，审阅者的批注直接落盘为 `revision-request.json`，交回 agent 处理。

**🔒 零配置、全本地。** 不要 API key、不用注册、渲染时不联网。唯一前置是 Node 22.19+（或 Bun）。

## 安装

**第一步，交给你的 AI。** 把这行话发给它：

> 按照 https://raw.githubusercontent.com/liustack/pptfast/main/INSTALL.md 安装 pptfast deck 技能，装完跑一遍健康检查，把结果告诉我。

没有第二步。你的 AI 会把 skill 文件夹放到你这个 harness 读取的位置，skill 自带钉死版本的启动器，不需要你手动装 CLI。pptfast 完全在本地渲染：不要 API key、不用注册、无需任何配置，唯一前置是 Node 22.19+（或 Bun）。

**在 DeepSeek Harness 上换成一条命令。** 那里 pptfast 是原生 DSH 插件，不走 skill 文件夹：

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@0.18.0
```

版本号要点名。不点名的话，安装会静默落到一个更旧的版本，拿不到最新能力。`npm view @liustack/pptfast version` 可查当前版本。插件卡片显示为「pptfast」，把整套生成流程的 skill 注册进 DSH 技能系统，驱动的 CLI 就在插件包自己里面。卸载即移除，不留残余。

## 快速开始

IR 就是一份描述整份 PPT 内容的 JSON 文件。写一个最小的，跑一遍 validate → render → preview 回路：

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
pptfast render deck.json -o out/tech.pptx --theme tech  # 同一份 deck，换个主题
pptfast preview deck.json -o out/svgs                   # 每页一张 SVG，供人工目检
```

只有一条形状规则：`cover`/`chapter`/`ending` 页只有 heading + subheading，组件都放在 `content` 页上。写混了 `validate` 会原话告诉你。

不想安装也行：`npx -y @liustack/pptfast validate deck.json`。源码仓库里则用 `node dist/cli.js` 代替 `pptfast`，`examples/` 下有现成的 IR 文件可以直接试。

最常用的几条命令：

| 命令 | 作用 |
|---|---|
| `validate <target>` | 校验 IR，每条报错都带页码 |
| `render <target> -o <out.pptx> [--theme <id>]` | 渲染出 `.pptx` |
| `preview <target> -o <dir> [--html]` | 每页一张 SVG，外加一个自包含的审阅页 |
| `serve <target>` | 随改动自动刷新的实时预览，带批注面板 |
| `audit <target>` | 几何审查：溢出、越界、低对比度、重叠 |
| `themes` | 列出 17 个内置主题 |

完整命令表见 [`docs/cli.zh-CN.md`](./docs/cli.zh-CN.md)。

## 对外承诺的边界

对外支持面刻意收得很小：**CLI**、它说的 **IR schema**（`pptfast schema`）、**deck 项目格式**、**agent skill**（[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)），以及 **DSH 插件**。

IR 才是这个产品的 API。agent 说 JSON 和命令行，不需要 `import` 任何东西。

没有公开的 JS API：包里的 JS 内部实现只服务于包自身，不做语义化版本承诺（见 [`docs/internal-api.md`](./docs/internal-api.md)）。

## 致谢

图标原语抽取自 [lucide](https://lucide.dev)（ISC License）。pptfast 本身从一套生产环境的 AI 出 PPT 系统中抽取而来，从第一天起就针对 CJK 排版做了优化（全角标点宽度、中文换行、雅黑优先字体栈、显式东亚字体槽声明）。

## License

[MIT](./LICENSE)
