# pptfast

面向 AI agent 的稳定、可编辑 PPTX 生成工具：输入语义化 IR，输出原生 DrawingML。

[English](./README.md) | [简体中文]

## 为什么

自由绘制 SVG/HTML 再转 PPTX 的链路上限很高，但下限不稳定——弱模型（或强模型状态不好时）画出来的往往是版式错乱、脱离品牌规范、甚至无法阅读的产物。pptfast 用受控词汇取代自由绘制：一份语义化 IR（zod schema）、13 个内置主题（各自打包一套 style 设计 tokens 与 brand 品牌标识元素）、带 seed 多样性的 layout/component 版式库，以及每个图形都保持可编辑的原生 DrawingML 输出——不是贴上去的一张图。

一份 PPT 本质上是五件事：内容模型、二维布局、视觉样式、动效、叙事。pptfast 负责后四项，内容模型交给你（或你的 agent）通过写 IR 来掌控。

## 安装

```bash
npm install -g @liustack/pptfast
pptfast --help
```

需要 Node >= 18。也可从源码构建：`git clone https://github.com/liustack/pptfast.git && cd pptfast && pnpm install && pnpm build`。

### 作为 Claude Code 插件

本仓库同时是一个 Claude Code 插件，内置整套生成流程的 skill：

```
/plugin marketplace add liustack/pptfast
/plugin install pptfast@pptfast
/reload-plugins
```

skill 依赖 CLI 驱动，请一并安装 CLI（`npm install -g @liustack/pptfast`）。

### 其他 agent（Codex 等）

[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md) 是一份自包含的 Markdown 操作手册——把它引入你的 agent 上下文（例如在 `AGENTS.md` 里引用），即可复用同一套 schema → 大纲 → validate → render 回路。

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
import { installNodePlatform } from "@liustack/pptfast/node"
import { generatePptx } from "@liustack/pptfast"

installNodePlatform()
const bytes = await generatePptx(ir) // Uint8Array，可直接写成 .pptx 文件
```

## CLI

| 命令 | 作用 |
|---|---|
| `render <ir.json> -o <out.pptx> [--theme <id>] [--style <file>]` | 校验并渲染成 `.pptx` |
| `validate <ir.json>` | 校验 IR，输出带页码的错误信息 |
| `schema [--style]` | 输出 IR 的 JSON Schema（或 style 覆盖 schema） |
| `themes [--json]` | 列出 13 个内置主题 |
| `scenarios [--json]` | 列出具名场景预设（mode/delivery/audience 轴 + theme 推荐） |
| `preview <ir.json> -o <dir>` | 逐页渲染为独立 SVG |
| `init` | 生成 `pptfast.config.json` 模板 |
| `check-update` / `self-update` | 检查 npm 上的新版本 / 更新全局安装 |

## IR

运行 `node dist/cli.js schema` 获取完整 JSON Schema——让模型写 IR 之前先读它。一份 deck（`PptxIR`）包含 `version`（现为 `"3"`）、`filename`、一个可选的 `scenario`（预设 id 字符串，或部分轴对象——详见下文「场景」一节）、`theme`（`id` 加可选的 `style`/`brand` 覆盖）、`meta`、`assets`——均可省略、有默认值——另外还有一个独立的可选 `brand`（logo 位置）字段，以及必填的有序 `slides` 列表。每张 slide 有一个 `type`（`cover`、`chapter`、`content`、`ending`）、一个可选的 `layout`（显式指定页面版式 id，一经设置恒生效、优先于自动选型——省略则由 pptfast 在主题的精选版式集合内自动选型）、一个可选的 `arrangement`（content slide 正文的排布方式，如 `two_column`、`kpi_focus`），以及一组带类型的 `components`（`bullets`、`kpi_cards`、`image`、`chart` 等）。`assets` 的形状是 `{ images: { [id]: { src, alt? } } }`，component 通过 `asset_id` 引用图片，同一张图可以在多页复用而不必重复内嵌。

## 主题

主题（theme）打包了 style（设计 tokens）、brand（品牌标识元素）与一套精选版式（layout）——以下是 13 个内置主题。覆盖 style（`--style`）即可为某个主题重新配色。

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

## 场景

场景（scenario）是三条独立于主题（视觉风格）之外的叙事轴，用来定编辑纪律：`mode`（论证方式——`pyramid`、`narrative`、`instructional`、`showcase`、`briefing`）、`delivery`（内容密度——`text`、`balanced`、`presentation`）、`audience`（语气锚点——`executive`、`technical`、`customer`、`public`，目前无渲染效果）。把 IR 顶层的 `scenario` 设为具名预设字符串（如 `"boardroom-report"`），或部分轴对象（如 `{ "delivery": "presentation" }`）——省略任意一轴、或整个省略 `scenario` 字段，均回落到 `general` 预设（`briefing` × `balanced` × `public`）。未知的预设名或轴值会硬报错并列出可用项。

`delivery` 驱动内容质量门：每页的 component 数预算与 bullets 预算（条目数与单条长度上限）都随 `delivery` 从 `text` 向 `presentation` 收紧——密度上限还会再叠加所选 layout 的容量，取两者中更紧的一个。`pptfast validate` 会报出每页实际生效的具体数值。

运行 `pptfast scenarios [--json]` 查看全部具名预设（各自带一份软性 theme 推荐表——仅供参考，从不构成约束）及三轴的原始数据表。

## Style 覆盖与项目配置

不必分叉主题即可覆盖内置色板：写一份 style JSON（结构见 `pptfast schema --style`），按次渲染传入（`--style brand.json`），或固化在项目级 `pptfast.config.json` 里（自 cwd 向上查找，用 `pptfast init` 生成模板）。优先级：CLI flag > 配置文件 > IR。IR 自身也可以在 `theme.style` 携带同样的覆盖，做到单文件自包含。

```json
{ "theme": "consulting", "style": { "colors": { "primary": "#0B5FFF", "accent": "#FF6A00" } } }
```

## 面向 AI agent

推荐给 agent 的生成回路：先读 `pptfast schema` 学词汇表，写出 IR JSON，跑 `pptfast validate` 并根据报错自纠（错误信息带页码和可直接照抄的修正方式，目的就是让这个回路不必依赖人工介入），再执行 `pptfast render`。`pptfast preview` 能让 agent 在正式渲染前先看一遍 SVG，自查版式是否合理。上文的 Claude Code 插件已把这套回路封装成 skill（[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)）。

## 路线图

- **v0.2**——封装该回路的 Claude Code plugin + skill（已落地）、design token 覆盖（`--style`）、`init`/自更新命令。
- **v0.3**——主题定制 skill（品牌色 → style）、自定义主题插槽、1.0 版本。
- **v0.4**——更丰富的动效（更多入场动画）、Office 真机实测、web playground。

## 致谢

图标原语抽取自 [lucide](https://lucide.dev)（ISC License）。pptfast 本身从一套生产环境的 AI 出 PPT 系统中抽取而来，从第一天起就针对 CJK 排版做了优化（全角标点宽度、中文换行、雅黑优先字体栈）。

## License

[MIT](./LICENSE)
