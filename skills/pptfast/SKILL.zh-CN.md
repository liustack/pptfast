---
summary: 'skills/pptfast/SKILL.md 的中文阅读镜像，仅供人工审阅该 skill 会指示 agent 做什么'
mirror_of: skills/pptfast/SKILL.md
---

# pptfast — deck 生成操作手册

> 本文件是 [`skills/pptfast/SKILL.md`](./SKILL.md) 的中文阅读镜像，供中文使用者审阅这个 skill 会指示 agent 执行的内容。agent 始终加载并执行英文版 `SKILL.md`——本文件不含 `name` 字段，从不注册为一个独立的 skill，也从不被 agent 读取。两个文件如有出入，以英文版 `SKILL.md` 为准。修改任一文件时，必须把改动同步镜像到另一文件。

pptfast 把一份 JSON IR（intermediate representation，中间表示）转换成原生 DrawingML 格式的 `.pptx`——每个图形在 PowerPoint 里都保持可编辑。内容模型由你掌控，layout、style 与动效由工具掌控。你从不绘制 SVG，也从不给任何东西定位：从受控词汇表里挑选，装不下的内容交给 validate 关卡去拦。

## 怎么跑

这份操作手册里的每一步都走 CLI：schema、spec/assemble、validate、render、audit、preview、serve、品牌提取。这些命令一律通过本 skill 自带的启动器执行，由它替你解析出一个可用的运行时。把 `<skill-dir>` 换成这份 SKILL.md 所在的目录：

```bash
bash <skill-dir>/scripts/run.sh <args>                                       # macOS / Linux
powershell -ExecutionPolicy Bypass -File <skill-dir>\scripts\run.ps1 <args>  # Windows
```

它按顺序尝试：PATH 上版本兼容的 `pptfast`、`npx`、`bunx`，参数与退出码原样透传。不需要预先安装任何东西，跑到的版本被钉死在这份 skill 上。退出码 78 表示没有任何可用运行时：把它 stderr 里 JSON 的 `nextSteps` 转告用户，不要重试。

下文凡是写 `pptfast <args>` 的地方，都通过这个启动器执行。

刚装完，以及任何时候某条命令的表现不对、错误信息又解释不清时，先跑 `pptfast doctor`。它会报告运行时、机器上每一份已安装的 skill 副本及其是否过期、dsh 插件版本、可选能力是否具备，以及一次自检渲染。把它说的原样转达，不要靠猜。

如果你的 harness 不允许执行脚本，就按同样的顺序自己判断，用第一条成立的：

1. PATH 上有 `pptfast`，且主版本号与下面的钉版本相同、版本不低于它：`pptfast <args>`。
2. 否则，有 `npx` 就用：`npx --yes --package @liustack/pptfast@0.20.0 pptfast <args>`。
3. 否则，有 `bunx` 就用：`bunx --bun @liustack/pptfast@0.20.0 <args>`。
4. 都没有就告诉用户机器上找不到 JavaScript 运行时，下一步是装 Node 22.19+（https://nodejs.org）或 Bun（https://bun.sh）。不要说成是 pptfast 本身坏了。

## 工作流程

访谈 → spec → pages → validate → audit → render。改动从能承载它的最小一步重新进入。很小的 deck（页数屈指可数）可以跳过 spec 文件，直接写一份 IR，仍用 `pptfast validate` 校验。永远不要凭上一个 session 的记忆、或凭这份文件本身的记忆去写 IR 或 spec。每个 session 都重新跑：

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

动手问人之前，先扫工作区。已有确认过的 `deck.spec.json` 已经锁死 narrative、theme、品牌框：不要重做访谈，改那份 deck。已有 `theme.json`、项目 `pptfast.config.json` 钉死的 theme、用户点名的 theme id、或用户递来的 `.thmx` / `.potx` / 带品牌 `.pptx`，都是品牌信号：抽取或沿用。不要再问有没有模板。

**边界页规则：** `chapter` 和 `ending` 永远不渲染 `components` 或 `footnote`。`cover` 永远不渲染 `footnote`。封面只有在锁定版式声明了对应槽位时才能带 `components`。今天这只发生在 `verdict-index`（consulting）：它读第一个 `bullets` 块，画成最多三条编号论据。其余封面版式仍会丢掉 components。正文放到 `content` 页，除非你在填 consulting 封面那三列论据。对错 JSON 和 spec 写法：`references/spec.md`。

1. **访谈**（最多一轮）：用户在场，且受众、怎么讲、pacing 任一轴仍未知时，把未决的问放进**一条**消息，然后停。不要自己填。Q1–Q4、★ 默认、查表、`NARRATIVE_INTERVIEW` 闸：`references/spec.md`。
2. **定 spec 并确认**，再写任何页面。写 `deck.spec.json`（以 `cover` 开篇，以 `ending` 收尾，中间是 `content` 或 `chapter`）。跑 `pptfast spec validate` 直到 `OK`，然后固化 `seed`。已确认的 spec 不要重定。写法：`references/spec.md`。品牌框姿态：`references/branding.md`。
3. **填页面**，每批至多 4 页。写 `pages/<id>.json`（`components`，可选 `layout`/`notes`）。绝不写 `type`/`heading`。Pin-only 与稀排高潮页：`references/layouts.md`。组件形态：`references/components.md`。密度、beat、容量：`references/density.md`。配图：`references/images.md`。
4. **Validate** 每批之后：`pptfast assemble deck-dir/`，再 `pptfast validate deck-dir/`，直到两者都打印 `OK`。重组被标出的内容，不要删。assemble / validate / audit / preview / serve 回路：`references/validate.md`。
5. **Audit** 所有页面填完后：`pptfast audit deck-dir/` 直到 exit 0。不要用截图代替。然后把 deck 交给用户（有 `pptfast_preview` 就调它，否则 `preview --html`，再否则 `serve --no-open`）：`references/validate.md`。
6. **渲染：** `pptfast render deck-dir/`。把打印的绝对路径报给用户。`--draft` 和 `--allow-dropped-content` 只有用户明确要求时才用。

后续请求：改一页 → 只对那一页走步骤 3–6。一份新 deck → 步骤 1。和 deck 生成无关 → 不要调用 pptfast。

## 组件选型

| 内容形态 | 用 | 不用 |
|---|---|---|
| 2–5 项头条指标 | `kpi_cards` | `chart` |
| 系列数据（趋势、对比、占比） | `chart`（`bar`/`line`/`pie`/`funnel`/`dumbbell`/`scatter`/`area`/`donut`/`gauge`） | 埋在 `bullets` 里的数字 |
| 受众要逐行读的精确数字（价目表、规格表、按周期分列的指标网格） | `data_table` | `chart` |
| 线性流程，无分支 | `steps` | `flowchart` |
| 有分支、且最终走到终点的流程 | `flowchart` | `steps` |
| 循环往复、没有终点的流程（首尾相连回到起点，如 PDCA、产品生命周期、飞轮、季节性循环） | `cycle` | `flowchart` |
| 双方对比 | `comparison` | 两份 bullet 列表 |
| 系统/组织分层（一叠层带，例如技术栈分层或成熟度阶梯） | `architecture` | `bullets` |
| 有日期的里程碑 | `timeline` | 带日期的 `bullets` |
| 分阶段计划，带多条工作线 | `roadmap` | `timeline` |
| 分阶段计划，在共享坐标轴上画出带日期的条形 | `gantt` | `roadmap` |
| 一句结论或要点 | `verdict_banner` 或 `callout` | `paragraph` |
| 2×2 战略评估（优势/劣势/机会/威胁） | `swot` | `matrix` |
| 9 宫格商业模式画布 | `bmc` | 拆开的 `bullets`/`row_cards` |
| 累计合计的桥接/差异拆解 | `waterfall` | `chart` |
| 2×2 宏观环境扫描（政治/经济/社会/技术） | `pest` | `swot` |
| 竞争结构分析（竞争强度 + 周边 4 种力量） | `five_forces` | `matrix` |
| 双轴数值网格，按颜色编码单元格（例如地区 × 季度） | `heatmap` | `matrix` |
| 跨阶段的比例流量/数量分布（例如预算分配、能源结构） | `sankey` | `chart`（funnel）或 `flowchart` |
| 产品/软件截图，这张 slide 要让人一眼认出「这是真实、正在运行的软件」（App 仪表盘、真实产品界面） | `device_mockup` | `image` |
| 一份人员名单（团队、讲者阵容、评委阵容、作者名单），需要一个无照片可用的身份锚点 | `people_cards` | `row_cards`/`icon_cards` |
| 一组短平行标签（技术栈、能力清单、关键词、资质认证）——是标签，不是带描述的条目 | `tag_row` | `bullets`/`row_cards` |

形态对照、字段说明、满幅组件：`references/components.md`。

## 规则

- 从不编辑或后处理生成出来的 `.pptx`
- 从不通过删除 `validate` 报错所指的内容来绕过它——去重组它（拆分 slide、收紧标题、换一个更紧凑的 component 类型）
- 面向用户的 deck 文本跟随用户使用的语言，IR 的结构性字段永远用 schema 里的英文枚举值
- 从不告诉用户 `chart`、`data_table` 里的数字可以在 PowerPoint 里直接编辑。这两类组件渲染出来是成组的图形加文字，样式和文字都能自由改，但背后没有原生的图表部件，也没有 `<a:tbl>`。要改数字，去改 IR 再重新渲染

## 何时去读

- `references/spec.md` — 写 `deck.spec.json`、选页型、或做叙事访谈时
- `references/layouts.md` — 钉 layout，包括高潮页、金句页、证据页稀排版式时
- `references/components.md` — 碰到形态相近的组件，或要看字段与上下限时
- `references/density.md` — 处理 pacing 预算、`beat`、容量警告、或 slide `decor` 时
- `references/branding.md` — 抽取公司模板，或决定要不要写 `branding: "full"` 时
- `references/images.md` — 声明资产、搜图库、或生图时
- `references/validate.md` — 跑 assemble / validate / audit / preview / serve，或修订某一页时
