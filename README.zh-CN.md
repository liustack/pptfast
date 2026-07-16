# pptfast

面向 AI agent 的稳定、可编辑 PPTX 生成工具：输入语义化 IR，输出原生 DrawingML。

[English](./README.md) | [简体中文]

## 为什么

自由绘制 SVG/HTML 再转 PPTX 的链路上限很高，但下限不稳定——弱模型（或强模型状态不好时）画出来的往往是版式错乱、脱离品牌规范、甚至无法阅读的产物。pptfast 用受控词汇取代自由绘制：一份语义化 IR（zod schema）、由 design tokens 驱动的 13 个内置主题、带 seed 多样性的 archetype/block 版式库，以及每个图形都保持可编辑的原生 DrawingML 输出——不是贴上去的一张图。

一份 PPT 本质上是五件事：内容模型、二维布局、视觉样式、动效、叙事。pptfast 负责后四项，内容模型交给你（或你的 agent）通过写 IR 来掌控。

## 安装

尚未发布到 npm（列在 v0.2 路线图里，见下方 Roadmap）。目前请从源码构建：

```bash
git clone https://github.com/liustack/pptfast.git
cd pptfast && pnpm install && pnpm build
node dist/cli.js --help
```

## 快速开始

```bash
node dist/cli.js validate examples/basic.json
# → OK — 5 slides, theme "consulting"
node dist/cli.js render examples/basic.json -o out/basic.pptx
# → wrote out/basic.pptx (5 slides, ~29 KB)
node dist/cli.js render examples/basic.json -o out/basic-tech.pptx --theme tech
node dist/cli.js preview examples/basic.json -o out/svgs   # 每页一张 SVG，供人工目检
```

也可以直接调用 SDK（Node 环境下渲染前需先调用一次 `installNodePlatform()`，CLI 内部已经帮你调过）：

```ts
import { installNodePlatform } from "pptfast/node"
import { generatePptx } from "pptfast"

installNodePlatform()
const bytes = await generatePptx(ir) // Uint8Array，可直接写成 .pptx 文件
```

## CLI

| 命令 | 作用 |
|---|---|
| `render <ir.json> -o <out.pptx> [--theme <id>]` | 校验并渲染成 `.pptx` |
| `validate <ir.json>` | 校验 IR，输出带页码的错误信息 |
| `schema` | 输出 IR 的 JSON Schema |
| `themes [--json]` | 列出 13 个内置主题 |
| `preview <ir.json> -o <dir>` | 逐页渲染为独立 SVG |

## IR

运行 `node dist/cli.js schema` 获取完整 JSON Schema——让模型写 IR 之前先读它。一份 deck（`PptxIR`）由必填的 `filename`、`version`、`theme`、`meta`、`assets`、可选的 `brand`，和一个有序的 `slides` 列表组成。每张 slide 有一个 `type`（`cover`、`chapter`、`content`、`ending`），content 类型的 slide 还带一组带类型的 `blocks`（`bullets`、`kpi_cards`、`image`、`chart` 等）。`assets` 的形状是 `{ images: { [id]: { src, alt? } } }`，block 通过 `asset_id` 引用图片，同一张图可以在多页复用而不必重复内嵌。

## 主题

每个主题是一组 token（配色、字体、motif）加一份 manifest（声明允许使用哪些 archetype）——主题本身从不涉及布局代码。

| id | label |
|---|---|
| `consulting` | Business Consulting |
| `enterprise` | Enterprise |
| `academic` | Academic |
| `insight` | Financial Insight |
| `campaign` | Marketing Campaign |
| `bloom` | Soft Bloom |
| `classroom` | Classroom |
| `ink` | Ink Wash |
| `tech` | Tech |
| `runway` | Fashion Runway |
| `journal` | Editorial Journal |
| `luxe` | Luxe |
| `heritage` | Heritage |

## 面向 AI agent

推荐给 agent 的生成回路：先读 `pptfast schema` 学词汇表，写出 IR JSON，跑 `pptfast validate` 并根据报错自纠（错误信息带页码和可直接照抄的修正方式，目的就是让这个回路不必依赖人工介入），再执行 `pptfast render`。`pptfast preview` 能让 agent 在正式渲染前先看一遍 SVG，自查版式是否合理。把这套回路封装成 skill 的 Claude Code plugin 计划在 v0.2 落地（见 Roadmap）。

## 路线图

- **v0.2**——封装该回路的 Claude Code plugin + skills、design token 覆盖（`--tokens`）、首次发布到 npm。
- **v0.3**——主题定制 skill（品牌色 → tokens）、自定义 manifest 插槽、1.0 版本。
- **v0.4**——更丰富的动效（更多入场动画）、Office 真机实测、web playground。

## 致谢

图标原语抽取自 [lucide](https://lucide.dev)（ISC License）。pptfast 本身从一套生产环境的 AI 出 PPT 系统中抽取而来，从第一天起就针对 CJK 排版做了优化（全角标点宽度、中文换行、雅黑优先字体栈）。

## License

[MIT](./LICENSE)
