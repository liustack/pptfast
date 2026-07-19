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
| `render <target> -o <out.pptx> [--theme <id>] [--style <file>] [--draft]` | 校验并渲染成 `.pptx`——`target` 可以是 IR JSON 文件、deck 项目目录，或裸名（见「Deck 项目」） |
| `validate <target>` | 校验 IR，输出带页码的错误信息——`target` 形式同 `render` |
| `audit <target> [--json]` | 确定性几何审查（溢出/越界/低对比度/重叠）——`target` 形式同 `render`，一旦发现问题 exit 1（见「审查」） |
| `spec validate <spec.json>` | 校验 deck spec 是否符合 schema 与随 strategy 变化的硬门（见「Deck 项目」） |
| `assemble <dir\|name> [-o <file>]` | 把 deck 项目目录合并成单个 IR JSON 文件 |
| `disassemble <ir.json> -o <dir>` | 把 IR JSON 文件拆成 deck 项目目录 |
| `schema [--style \| --spec]` | 输出 IR 的 JSON Schema（或 style 覆盖 schema，或 deck spec schema） |
| `themes [--json]` | 列出 13 个内置主题 |
| `narratives [--json]` | 列出具名叙事预设（strategy/pacing/audience 轴 + theme 推荐） |
| `preview <target> -o <dir> [--html]` | 逐页渲染为独立 SVG（`--html` 额外写出一个自包含的 `preview.html`）——`target` 形式同 `render`，永远不受占位页拦截 |
| `migrate <input> -o <output>` | 把 v3 IR 文件转成 v4，或把 `deck.plan.json` 项目目录转成 `deck.spec.json`——确定性转换，不调模型（见「IR」与「Deck 项目」） |
| `init` | 生成 `pptfast.config.json` 模板 |
| `check-update` / `self-update` | 检查 npm 上的新版本 / 更新全局安装 |

## IR

运行 `node dist/cli.js schema` 获取完整 JSON Schema——让模型写 IR 之前先读它。一份 deck（`PptxIR`）包含 `version`（现为 `"4"`，且省略时默认就是它）、`filename`、一个可选的 `narrative`（预设 id 字符串，或部分轴对象——详见下文「叙事」一节）、`theme`（`id` 加可选的 `style`/`brand` 覆盖）、`meta`、`assets`——均可省略、有默认值——另外还有一个独立的可选 `brand`（logo 位置）字段，以及必填的有序 `slides` 列表。每张 slide 有一个 `type`（`cover`、`chapter`、`content`、`ending`）、一个可选的 `layout`（显式指定页面版式 id，一经设置恒生效、优先于自动选型——省略则由 pptfast 自动选型，详见下文「版式选型」）、一个可选的 `arrangement`（content slide 正文的排布方式，如 `two_column`、`kpi_focus`），以及一组带类型的 `components`（`bullets`、`kpi_cards`、`image`、`chart` 等）。`assets` 的形状是 `{ images: { [id]: { src, alt? } } }`，component 通过 `asset_id` 引用图片，同一张图可以在多页复用而不必重复内嵌。

一份 deck 还可以携带一个可选的 `seed`（整数，让自动选型的版式在多次修订之间保持稳定——省略时如何生成，详见下文「版式选型」）。任意 slide 都可以设置一个稳定的 `id`（spec 的页面和校验报错都靠它引用）、`placeholder: true`（还没有内容的占位 slide——由 `assemble` 为 spec 里没人填写的页面注入，内容质量检查会跳过它，`render` 也会因它拒绝导出，除非加 `--draft`），以及一个可选的 `notes`（同义词 `note`/`speaker_notes`/`speakerNotes`），导出为原生 PowerPoint 演讲者备注——只是给主讲人自己看的内容，不会画到幻灯片画布上，也从不计入任何版式容量。模型输出里容易和 schema 对不上的字段名（跨 component 类型共 40 组同义词，例如 kpi 的 `title`→`label`、quote 的 `content`→`text`、swot 的 `strength`→`strengths`、bmc 的 `partners`→`key_partners`）会在校验时静默改写成规范名——`validate`/`render`/`preview` 会打印一条改了什么的提示，从不因此报错。同一套救援机制也覆盖了标着 v4 却仍在写旧词汇的文档（用 `scenario` 而不是 `narrative`，用 `mode`/`delivery` 而不是 `strategy`/`pacing`，或者轴值还停留在旧的 `narrative`/`text`/`presentation`）——同样会被改写成当前拼法并打印提示，不会硬报错。显式写 `version: "3"`（或 `"2"`）不在这套救援范围内，会直接硬拒绝并给出迁移指引——见下文 `pptfast migrate`。

四种 component 类型是「满幅」的：`swot`（strengths/weaknesses/opportunities/threats 四象限）、`bmc`（九宫格商业模式画布）、`waterfall`（运行合计瀑布图）、`gantt`（共享数轴上的甘特条形图）。各自独占整张 slide 的内容区域，必须是该 slide 唯一的 component——混入其他 component 会在校验时报错，而不是静默丢弃。

v4 IR schema 自 0.4.0 起冻结——后续演进只走加法（新增可选字段、新增枚举值），任何破坏性变更都会启用新的顶层 `version` 值，并沿用 v3 那套硬拒绝 + 迁移提示的处理方式。`pptfast migrate <v3-file.json> -o <out.json>` 能确定性地把一份 v3 文件转成 v4（只做字段改名——theme、版式选型、内容预算与视觉输出都不变）——`deck.plan.json` → `deck.spec.json` 的姊妹转换见下文「Deck 项目」。

## 主题

主题（theme）打包了 style（设计 tokens）、brand（品牌标识元素）与每个页型各自的版式（layout）集合——以下是 13 个内置主题。每个内置主题默认对每个页型都开放全部已注册版式（每个 archetype 都会按主题的实际背景色自适应取色，所以全集在任何主题下都保持可读）。收窄集合是主题作者的主动选择，不是常态——13 个主题里只有 3 个排除了单个 chapter 版式（一款 runway 专属设计，在这三个主题的强调色上对比度不够）。覆盖 style（`--style`）即可为某个主题重新配色。

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

## 叙事

叙事（narrative）是三条独立于主题（视觉风格）之外的轴，用来定编辑纪律：`strategy`（论证方式——`pyramid`、`storytelling`、`instructional`、`showcase`、`briefing`）、`pacing`（内容密度——`dense`、`balanced`、`spacious`）、`audience`（语气锚点——`executive`、`technical`、`customer`、`public`，目前无渲染效果）。把 IR 顶层的 `narrative` 设为具名预设字符串（如 `"boardroom-report"`），或部分轴对象（如 `{ "pacing": "spacious" }`）——省略任意一轴、或整个省略 `narrative` 字段，均回落到 `general` 预设（`briefing` × `balanced` × `public`）。未知的预设名或轴值会硬报错并列出可用项。

`pacing` 驱动内容质量门，也驱动正文字号基线（仅 paragraph/bullets/callout 三件套——其余组件各自的字阶与标题体系不受影响）：每页的 component 数预算与 bullets 预算（条目数与单条长度上限）都随 `pacing` 从 `dense` 向 `spacious` 收紧，正文字号则反向增长——密度上限还会再叠加所选 layout 的容量，取两者中更紧的一个。

| pacing | 正文字号 | 每页 component 数 | bullets |
|---|---|---|---|
| `dense` | 20px | 5 | 至多 6 条，每条约 48 字 |
| `balanced`（默认） | 24px | 4 | 至多 5 条，每条约 40 字 |
| `spacious` | 32px | 3 | 至多 4 条，每条约 30 字 |

bullets 需要时会在各自档位基线之下收缩以适配空间，最低到 14px 地板，再触发溢出处理。`pptfast validate` 会报出每页实际生效的具体数值。

运行 `pptfast narratives [--json]` 查看全部具名预设（各自带一份软性 theme 推荐表——仅供参考，从不构成约束）及三轴的原始数据表。

## 版式选型

当某页省略 `layout` 时，pptfast 按四个确定性步骤自动选型：该页型的全部注册版式 → 主题该页型的版式集合（默认全集，见上文「主题」）→ 叙事的 `strategy` 对一小撮适配该 strategy 的 content 版式做 ×3 软加权，其余维持 ×1 底权（cover/chapter/ending 三个页型永不加权——它们的个性来自主题，不来自 strategy）→ 按 seed 加权取样，若命中结果与紧邻的上一页版式相同则确定性地换成次优候选。显式 `layout` 恒优先，跳过以上全部步骤。内容装不装得下由 `validate` 的密度门单独把关，从不参与选型——因此改一页的内容不会悄悄翻转它的版式。

选型本身完全确定——同一份 IR 永远选出同一个结果，预览与最终渲染绝不会不一致。但要在**多次修订之间**保持稳定（改一页不搅动其余页的自动选型），还需要一个持久化的 `seed`，按以下顺序解析：

1. 显式 `ir.seed`——完全修订稳定，恒优先
2. deck 项目自己的 seed：spec 省略 `seed` 时，`pptfast assemble` 首次运行会用 spec 的 filename + 页面 id 列表派生一个，并打印提示——把这个值写进 `deck.spec.json` 的 `seed` 字段即可固化
3. 以上均未设置：回落到 `filename` + 每页 `heading` 的内容哈希（向后兼容旧行为）——改动任何一页标题都会重排全 deck 的自动选型

`pptfast assemble` 还会把每一页的自动选型结果写回合并后的 `deck.json`（页面文件里已显式指定的 `layout` 不受影响）——CLI 会提示本次填写了多少页。

## Style 覆盖与项目配置

不必分叉主题即可覆盖内置色板：写一份 style JSON（结构见 `pptfast schema --style`），按次渲染传入（`--style brand.json`），或固化在项目级 `pptfast.config.json` 里（自 cwd 向上查找，用 `pptfast init` 生成模板）。优先级：CLI flag > 项目配置文件 > 用户配置文件 > IR（完整的四层链见下文「Deck 项目」）。IR 自身也可以在 `theme.style` 携带同样的覆盖，做到单文件自包含。

```json
{ "theme": "consulting", "style": { "colors": { "primary": "#0B5FFF", "accent": "#FF6A00" } } }
```

## Deck 项目

一份 deck 有两种写法，接受 IR 的每个命令两种都认：单个 **IR JSON 文件**（如上文所述），或者一个 **deck 项目目录**——把同样的内容拆到多个文件里，方便 agent 先规划整体结构，再逐页撰写和修订，而不必把一份不断增长的 JSON 塞进上下文。

```
my-deck/
  deck.spec.json         锁定的 spec：每一页的顺序、type、heading
  pages/<page-id>.json   每个已填页面一个文件（components/layout/arrangement/background/image_side/footnote）
  assets/                本地图片，按文件名自动注册（图片 id = 去掉扩展名的文件名）
```

`deck.spec.json` 可以在任何页面填写之前单独校验：`pptfast spec validate deck.spec.json` 会检查 schema，以及一组随 strategy 变化的硬门（边界页类型、标题长度、beat 轮换、页数是否匹配 pacing）。spec 里某一页如果没有对应的 `pages/<id>.json`，会成为一个**占位页**——只有标题、不算缺失——所以写到一半的 deck 也能正常 assemble 和预览。`pptfast render` 遇到未填的占位页会拒绝导出，除非加 `--draft`。`pptfast preview` 则永远不会因占位页被拦。目录里如果还留着改名前的 `deck.plan.json` 而不是 `deck.spec.json`，不会被直接读取——用 `pptfast migrate <dir> -o <dir>` 原地转换（会在旁边写出 `deck.spec.json`，不覆盖、也不删除原文件——确认新文件无误后自己删掉 `deck.plan.json`）。目录里两个文件同时存在会硬报错，绝不猜测优先级。

`pptfast assemble <dir>` 把 spec + pages + assets 合并成一个 IR JSON 文件（默认写到 `deck.json`）。`pptfast disassemble <ir.json> -o <dir>` 做反向操作（有据可查的有损转换——`beat`/`focus` 这类只属于 spec 的字段在 IR 里没有对应位置，无法还原）。`render`/`validate`/`preview` 也都能直接接受一个目录，会先在内存里 assemble 一遍。

Deck 项目目录可以用裸名代替路径引用——`pptfast render my-deck -o out.pptx` 在本地找不到同名文件或目录时，会到 `$PPTFAST_HOME/decks` 下找 `my-deck`（`$PPTFAST_HOME` 缺省是 `~/.pptfast`）。所有 deck 默认值按四层优先级解析，从高到低：CLI flag > 项目级 `pptfast.config.json` > 用户级 `~/.pptfast/config.json` > deck 自身的值。两个配置层都可以设置 `decksDir` 来重定向裸名的解析位置——项目层的值相对该配置文件自身所在目录解析（给想把 deck 项目入库的团队用），用户层的值相对 `$PPTFAST_HOME` 解析，两者都设置时项目层优先。

## 审查

`pptfast audit <target> [--json]` 会离屏渲染每一页，跑一遍确定性几何审查——不靠 LLM 截图目检，零方差。四类检查：**溢出**（文字超出自己的框或列）、**越界**（超出页面边缘）、**低对比度**（文字与其所在背景的 WCAG 相对亮度对比度不达标）、**重叠**（两个组件的区域大面积相交）。这是建议性工具，不是硬门——`validate` 已经拦住了结构非法或密度超标的 deck，audit 抓的是一份合法 deck 在渲染层仍可能出现的问题（作者选了一个贴近背景色的文字颜色、两个组件的内容恰好撞在一起）。

建议在所有页面填完之后跑一遍，`target` 形式同 `validate`/`render`（文件、deck 项目目录或裸名）。人读输出按页分组报错（`page 3 (p-kpi): [low-contrast] …`，每条消息都带修正建议），末尾附一行汇总。`--json` 输出完整的机器可读报告。exit code 本身即可供 agent 判断：干净是 `0`，发现问题是 `1`——按报错修那一页，再单独重跑一次 `audit` 即可，不必重新渲染。被跳过的占位页会在汇总里注明，和别处「不算缺失、只是还没写」的处理方式一致。

```bash
pptfast audit examples/basic.json
# → audited 5 pages, 0 skipped, 0 findings
```

## 面向 AI agent

推荐给 agent 的生成回路：先读 `pptfast schema` 学词汇表，写出 IR JSON，跑 `pptfast validate` 并根据报错自纠（错误信息带页码和可直接照抄的修正方式，目的就是让这个回路不必依赖人工介入），再跑 `pptfast audit`——同样是可直接照抄的修正反馈，只是针对一份*合法* deck 在渲染层仍可能出现的问题（溢出、低对比度、重叠——exit code 本身就说明干不干净），最后执行 `pptfast render`。`pptfast preview` 能让 agent 在正式渲染前先看一遍 SVG，自查版式是否合理。加上 `--html` 还会额外写出一个自包含的 `preview.html`，供人工审查（键盘翻页、占位页角标——远程 URL 的图片资产仍是远程链接，这是自包含性上唯一的缺口）。当所有页面都已填写时，这份 `preview.html` 还会叠加同一份 `audit` 检查结果（每页一个数量角标，加一个可点击跳转的 findings 面板），让人工审查者不必打开终端就能看到问题——如果 deck 里还有占位页，则显示一行「audit 已跳过」的提示代替。审查者可以直接在 `preview.html` 里给每页写自由文本批注，并导出为 `revision-request.json`（浏览器 Blob 下载，不联网也不写文件——preview 始终只读），交给 agent 通过 `pages/*.json` 回填。上文的 Claude Code 插件已把这套回路封装成 skill（[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)）。这套回路本身由一个模型无关的内部基准测试（`bench/`，不发布到 npm）机械化验证——固定题库，评估模型跟随该 skill 的表现，细节见 `bench/README.md`。

## 路线图

- **v0.2**——封装该回路的 Claude Code plugin + skill（已落地）、design token 覆盖（`--style`）、`init`/自更新命令。
- **v0.3**——叙事驱动的轴（strategy/pacing/audience）、显式 layout + component 注册表与加权 seed 选型、deck spec/assemble 工作流、确定性几何审查、自包含 HTML 预览、六阶段 skill（已落地。这几条轴当时叫 `scenario`/`mode`/`delivery`，在下面 v0.4 的词汇重构里改名为 `narrative`/`strategy`/`pacing`，行为不变）。
- **v0.4**——vocabulary-v4 词汇重构：`scenario`→`narrative`、`mode`→`strategy`、`delivery`→`pacing`、`plan`→`spec`（`deck.plan.json`→`deck.spec.json`）、页面级 `rhythm`→`beat`，新增确定性的 `pptfast migrate` 命令，行为不变（已落地，schema 已冻结，自 0.4.0 起——见上文「IR」一节）。
- **v0.5+**——主题生态（可分发主题注册表、主题定制 skill、自定义品牌插槽）、更丰富的动效（更多入场动画）、Office 真机实测、web playground、1.0 版本。

## 致谢

图标原语抽取自 [lucide](https://lucide.dev)（ISC License）。pptfast 本身从一套生产环境的 AI 出 PPT 系统中抽取而来，从第一天起就针对 CJK 排版做了优化（全角标点宽度、中文换行、雅黑优先字体栈）。

## License

[MIT](./LICENSE)
