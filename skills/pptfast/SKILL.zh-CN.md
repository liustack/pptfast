---
summary: 'skills/pptfast/SKILL.md 的中文阅读镜像，仅供人工审阅该 skill 会指示 agent 做什么'
mirror_of: skills/pptfast/SKILL.md
---

# pptfast — deck 生成操作手册

> 本文件是 [`skills/pptfast/SKILL.md`](./SKILL.md) 的中文阅读镜像，供中文使用者审阅这个 skill 会指示 agent 执行的内容。agent 始终加载并执行英文版 `SKILL.md`——本文件不含 `name` 字段，从不注册为一个独立的 skill，也从不被 agent 读取。两个文件如有出入，以英文版 `SKILL.md` 为准。修改任一文件时，必须把改动同步镜像到另一文件。

pptfast 把一份 JSON IR（intermediate representation，中间表示）转换成原生 DrawingML 格式的 `.pptx`——每个图形在 PowerPoint 里都保持可编辑。内容模型由你掌控，layout、style 与动效由工具掌控。你从不绘制 SVG，也从不给任何东西定位：从受控词汇表里挑选，装不下的内容交给 validate 关卡去拦。

## 准备工作

```bash
pptfast --version || npm install -g @liustack/pptfast
pptfast check-update   # stay current — the schema and themes evolve
```

## 工作流程

六个阶段：读词汇表、定 spec 并确认、分批填页面、渲染、自查、修订。对于很小的 deck（页数屈指可数），可以跳过 spec，直接写一个单独的 IR 文件，用 `pptfast validate` 校验——下文所有内容依然适用，只需把「deck 项目目录」读作「这个 IR 文件」，并跳过阶段二的 spec 步骤。

### Phase 1 — 读词汇表（每个 session 都要重新读一遍）

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

永远不要凭上一个 session 的记忆、或凭这份文件本身的记忆去写 IR 或 spec——schema 会演进，`schema`/`narratives`/`themes` 的实际输出永远优先。

**边界页规则——现在就记住，这是最常见的错误：** `cover`、`chapter`、`ending` 三种页面，不论用哪个 archetype，永远不渲染 `components` 或 `footnote`，没有例外。这类内容要放到 `content` 页面上。在 spec 阶段就弄错，意味着之后要重写已经写好的真实内容——`validate` 会用 `"<type>" slides do not render components/footnote — move this content to a content slide or remove it` 这条报错抓到它，但那时你已经把内容写完了，还得再搬一次。

```json
// pages/closing.json — spec type "ending" — WRONG: components never render on an ending page
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/wrap-up.json — spec type "content", inserted right before the ending page — CORRECT
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/closing.json — spec type "ending" — stays bare, nothing to move here
{}
```

`docs/deck-projects.md` 里的边界页渲染面表（boundary-page render surface table）有按页型划分的完整对照。

### Phase 2 — 定 spec 并确认

写任何页面内容之前，先提议并确认：

- 先定 narrative：从 `narratives` 输出里挑一个匹配这份 deck 目的与受众的具名预设（或单独覆盖某几条轴）——这是位于 theme 之上的一层决策，不是视觉选择
- 再定 theme id：从选定 narrative 的 `themeRecommendations` 里挑（如果都不合适，就从 `themes` 输出里挑一个贴合这份 deck 调性的——这只是推荐，从不构成约束）
- 起草 `deck.spec.json`：每页一条记录（`id`、`type`、`heading`，可选加 `beat`/`focus`/`summary`）——以 `cover` 开篇，以 `ending` 收尾，中间的每一页都是 `content` 或 `chapter`
- 跑 `pptfast spec validate deck.spec.json`，把它报出的问题都修掉，直到打印 `OK`——边界页、标题长度、beat 轮换、页数是否匹配 pacing 这些硬门都在这一步触发，早于任何一页正文的写作
- `spec validate` 打印 `OK` 之后，在 `deck.spec.json` 里设一个 `seed`（任意整数）以保证修订稳定——现在就写一个，或者在阶段三跑一次 `pptfast assemble`，把它打印出的 `generated seed …` 值抄进 spec。没有固化的 seed，之后改一页的标题就可能打乱其余每一页自动选出的 layout

**用户确认过校验通过的 spec 之后，不要再重新定 spec。** 改动一份已确认的 spec（调整顺序、改页型、删页）会悄悄浪费用户已经做过的审阅。如果确有新信息迫使必须改动，先说明理由并重新取得确认，再重新跑一次 `spec validate`。

### Phase 3 — 分批填页面（每批至多 4 页），随填随 validate

对已确认 spec 里的每一页，写一个 `pages/<page-id>.json` 存放它的内容（`components`，以及可选的 `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes`——绝不写 `type`/`heading`，这两个字段被 spec 锁定）。撰写 `cover`/`chapter`/`ending` 页面时记住 Phase 1 的边界页规则——不要先给它们塞 `components` 或 `footnote`，然后再回头搬走。`notes` 是给主讲人看的演讲稿——写一份好的讲稿是模型的强项，只要页面内容需要一段超出幻灯片本身的口头讲解，就应该动笔写。

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

把两个命令报出的错误都修掉，重新跑，直到两者都打印 `OK`。`validate` 可能在打印 `OK` 的同时带着 `warning:` 行（比如标题太长、某页太密）——条件允许时也应该收紧，读起来会更好，但它们不拦渲染。只有 error 才会让 `OK` 打印不出来。spec 里某一页如果还没有对应的页面文件，就是一个占位页（只有标题）——assemble 和 validate 都接受这种情况。分批之间留一些占位页是正常状态，不是错误。只要某一页的 `layout` 被留给自动选型，`assemble` 也会打印 `note: N layouts auto-selected into deck.json`——这只是提示，不是错误。只有当某个具体选型结果需要被锁定时，才在页面文件里显式钉死 `layout`。

### Phase 4 — 渲染

```bash
pptfast render deck-dir/ -o deck.pptx
```

`--theme <id>` 在不改动 spec 的前提下覆盖 deck 的 theme。`--style <path>` 在其上叠加一层 style-token 覆盖（不用分叉 theme 就能重新配色，schema 见 `pptfast schema --style`）。deck 里还有未填的占位页时，render 会拒绝导出，除非加上 `--draft`——只有当用户明确想在所有页面都写完之前先看一眼时，才用它。

如果项目里有 `pptfast.config.json`，它的 theme/style 就是项目默认值——除非用户要求，不要用 `--theme` 跟它对着干。阶段三里写的任何页面 `notes` 都会导出成原生 PowerPoint 演讲者备注（PowerPoint/Keynote 里的 View → Notes）——从不会画到幻灯片本身上。

### Phase 5 — 审查，可选的视觉自查

所有页面都填完（没有占位页剩下）之后，跑一次确定性几何审查：

```bash
pptfast audit deck-dir/
```

零 token、零方差——它离屏渲染每一页，检查溢出（overflow）、越界（out-of-bounds）、低对比度（low-contrast）、重叠（overlap）、内容截断（content-truncated，省略号截掉了真实文字）、内容丢失（content-dropped，一个「+N more」标记隐藏了某个条目或整个 component），发现问题就 exit 1（干净则是 0）。每条 finding 都标出所在页面（和 id），并带一个修法。修那一页被标出的内容——和处理 `validate` 报错一样遵循「重组，不要删除」的纪律——然后单独重跑一次 `pptfast audit deck-dir/`（不用重新渲染）直到 exit 0。这是这份 deck 的视觉 QA。不要用肉眼看截图来代替它。

如果有页面用了 cover/chapter 照片背景，加上 `--pixels`——它会把该页光栅化并采样真实像素，抓住文字直接压在一张没有遮罩的照片上的情况，这是上面纯 SVG 检查唯一看不到的一种。

```bash
pptfast preview deck-dir/ -o preview/ --html
```

为每张 slide 各写一个独立 SVG，外加一个自包含的 `preview.html`，永远不受占位页拦截。交付之前自己读几个 SVG（它们就是纯文本文件），核对 layout 与密度是否合理，图片较多的 deck 尤其要看——把 `preview.html`（缩略图条、键盘翻页、占位页角标）交给用户自己看，而不是代替这一步。所有页面都填完时，`preview.html` 还会叠加同一份 `audit` 检查结果（每页一个角标 + 一个 findings 面板），让审查者不用打开终端就能看到问题——deck 里如果还有占位页，则改为显示一行「audit skipped」的提示。审查者可以直接在 `preview.html` 里给每页写自由文本批注，并导出为 `revision-request.json`——只读，从不直接改动 deck 本身——等它交回给你时，走阶段六的流程处理。

### Phase 6 — 修订：改一页，重新 assemble

一次修订，只改能承载这次改动的最小那份文件：

- 内容改动（「把 KPI 那页写得更有冲击力」）→ 只改那一页的 `pages/<id>.json`，然后重复阶段三的 `assemble` + `validate` 组合，以及阶段五的 `audit`，再重新渲染。没人要求你改的页面，绝不重新生成。
- 结构性改动（调整顺序、增删页面、改某页的 type 或 heading）→ 改 `deck.spec.json`，先重新跑一次 `pptfast spec validate`（阶段二的「不要重新定 spec」规则依然适用：只有在用户确实要求结构性改动时才这么做）。
- 交回一份 `revision-request.json`（阶段五 `preview.html` 里「Export revision requests」按钮导出的）→ 把 `requests` 里的每一条按 `pageId` 分流到对应页面的 `pages/<id>.json`。`pageId` 有 slide id 时就是那个 id，没有时是它的 1-based 页码——没有 id 时，对照 `deck.spec.json`/`pages/` 找到正确的文件。把 `annotation` 当成一条需要你去理解的需求，而不是可以照抄的补丁：它是审查者看着渲染出的 slide 写下的自由文本，不是合法的页面文件 JSON——你自己要把它翻译成具体的内容改动，然后对每一页被请求触及的页面跑上面同一套内容改动流程（`assemble` + `validate` + `audit`）。preview 全程只读：这条流程里除了你自己主动做出的编辑之外，没有任何环节会写入 `pages/*.json`。

## 后续请求怎么分流

一旦 deck 项目已经存在，后续消息恰好分流进三条分支之一——动手之前先判断走哪一条：

1. **改一页**（「改一下第 3 页」「把 KPI 那页写得更有冲击力」，或交回一份 `revision-request.json`）→ 走阶段六：改那一页的文件，重新 assemble、重新 validate、重新 audit。没人问起的页面绝不去碰。
2. **一份新 deck**（不同的主题、不同的受众，或明确要求重新开始）→ 走阶段一：新建一个 deck 项目目录，重新决定 narrative/theme，重新起一份 spec。
3. **和 deck 生成无关**（关于内容本身的问题，或任何和 slides 没有关联的事）→ 完全不要调用 pptfast。

## 内容方法论

### 组件选型

| 内容形态 | 用 | 不用 |
|---|---|---|
| 2–5 项头条指标 | `kpi_cards` | `chart` |
| 系列数据（趋势、对比、占比） | `chart`（`bar`/`line`/`pie`/`funnel`/`dumbbell`） | 埋在 `bullets` 里的数字 |
| 受众要逐行读的精确数字（价目表、规格表、按周期分列的指标网格） | `data_table` | `chart` |
| 线性流程，无分支 | `steps` | `flowchart` |
| 有分支或循环的流程 | `flowchart` | `steps` |
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

`steps` 和 `flowchart` 是最常见的混用：只要分支路径从不出现，就是 `steps`。`roadmap` 和 `gantt` 是次常见的：`roadmap` 把多条工作线分组进泳道，没有共享的数值坐标轴，`gantt` 则把带日期的条形画在一根所有条目共同比对的共享坐标轴上。`pest` 和 `swot` 是再下一个：`pest` 只看外部宏观环境因素（没有内部优势/劣势这条轴），永远是同样命名的四个类别——一份内部对外部的战略评估仍然是 `swot`。`sankey` 和 `flowchart`/funnel `chart` 是再下一个：`sankey` 在分支/汇合的路径上守恒并拆分一个数量（带宽本身就承载意义），`flowchart` 是没有数量含义的决策/流程分支，funnel `chart` 则永远只沿一条线收窄，从不分支也不汇合。`data_table` 和 `chart` 和 `comparison` 是最后一组：受众要逐行读的精确数字用 `data_table`，一眼看出趋势/对比形态的用 `chart`，没有精确数字、只做定性并排属性对比的用 `comparison`。

`architecture` 的 `layers` 数组默认从上到下画（`layers[0]` 是最顶层的那条带）——这是自顶向下撰写系统分层（表现层在前、基础设施在后）的自然顺序。如果是一个自底向上的叙事（成熟度阶梯、基础优先的能力模型），就按它自己从低到高的自然顺序撰写，并在 component 上设 `direction: "bottom_up"`，让 `layers[0]` 改画在最底部——不要手动把数组倒过来伪造这个效果，这个字段存在的意义正是让数组始终保持叙事顺序。

`swot`/`bmc`/`waterfall`/`gantt`/`pest`/`five_forces`/`heatmap`/`sankey` 是「满幅」（full-body）组件：各自占满整张 slide，且必须是该 slide 唯一的 component——见下文「容量」。

### 图片页

在 `assets.images` 里统一声明图片，用 `asset_id` 引用——务必逐个核对 `asset_id` 拼写，写错 key 只会渲染出一个静默的占位符，不会报错。显式的 `layout` id 永远优先于 pptfast 的自动选型，否则自动选型会从该页型对应的 theme layout 集合里挑（默认是全部已注册版式，除非 theme 主动收窄）——对于以图片为核心的 slide，把 `layout` 设成某个 image takeover：`image-split`（半页图片 + 侧边文字，`image_side: left|right`）、`image-top`（顶部通版图片 + 下方文字分栏）、`image-bottom`（上方文字，下方图片）、`image-annotate`（居中图片 + 从前 4 条 bullets 取出的放射状标注）。**每个 image layout 都需要 `components` 里至少有一个 `image` component**——不论它在数组里的位置，pptfast 都会用找到的第一个作为图片来源，其余的 component 全部成为该 layout 的文字正文。

给任何 `asset_id` 还没有真实文件的 `image` component 生成美术之前，先跑一遍 `pptfast asset-brief <target>`——它会真的渲染一遍 deck，报告每个图片位实际的渲染框（不是版式的名义槽位尺寸）、带安全区说明的裁切模式、建议的生成像素、主题色板，以及一段可直接粘贴的提示词。宽高比和色调对上了，生成的图片摆上去才会显得是设计好的，而不是被拉伸、裁错或跑色。

### 容量

一张 slide 是一块固定尺寸的画布。第一遍起草就要考虑装得下：每张 slide 少放几个 component，标题简短有力，bullet 条目控制在约两行以内。component 数和 bullets 预算随这份 deck 的 `pacing` 轴变化（`spacious` 最紧，`dense` 最松）——`validate` 会报出实际生效的具体数值，不是一个写死的常数。这些是警告，不是硬错误——值得为了让 deck 更紧凑而修，但从不拦住 `render`。正文字号则反过来变化：`spacious` 渲染出的正文字号最大（32px，相对 `balanced` 的 24px 和 `dense` 的 20px），即便它允许的 component 数最少——所以一张 `spacious` 的 slide 需要更少、更短的条目，而不只是更紧凑。不论 pacing 是什么，一条长到在渲染安全字号地板下仍然溢出的 bullet 条目，*就是*一条硬 `validate` 错误，五种 bullet 样式（`default`/`plain`/`divided`/`numbered`/`checklist`）一视同仁——否则它会被省略号真的截掉一段真实文字。把「bullet 条目要短」当成一条不分样式都成立的硬约束。拿不准的时候就拆成两张 slide——一遍写对，好过事后反复修补。

有八种 component 类型独占整张 slide，而不是与其他组件共享：`swot`、`bmc`、`waterfall`、`gantt`、`pest`、`five_forces`、`heatmap`、`sankey`。各自必须是所在 slide 唯一的 component——`validate` 会在一张 slide 把其中之一和 `bullets` 或其他任何组件混在一起时硬报错，绝不会静默丢弃那个「陪衬」的 component。

### Beat（节奏标记）

一张 content 页面上可选的 `beat`（`anchor`、`dense` 或 `breathing`）现在不只是 `spec validate` 的节奏检查——它还会影响 `render` 给这一页自动选出哪个 layout：`anchor` 偏向单一的强断言式 layout，`dense` 偏向可见条目更多的高密度 layout，`breathing` 偏向最舒展的单栏 layout。它是一个软权重，不是钉死的选择——显式的 `layout` 依然会完全覆盖它，未设置的 `beat` 则毫无影响。要有意识地声明它，按每一页在论证里的实际角色各给一个值（「重磅揭示」的那页是 `anchor`，数据密集的对比页是 `dense`，两个高密度段落之间的换气页是 `breathing`），而不是每一页都盖同一个章——`spec validate` 自己的 beat 轮换门已经会对期望有变化的 strategy 标出一连串相同 beat 的问题，而且到处盖同一个值本来就会抵消这个字段存在的目的：给 layout 增加变化。

### Decor（装饰）

只有当用户明确要求装饰性点缀时，才设置 slide 的 `decor`。默认不设——theme 本身已经带着自己的视觉母题。

## 规则

- 从不编辑或后处理生成出来的 `.pptx`
- 从不通过删除 `validate` 报错所指的内容来绕过它——去重组它（拆分 slide、收紧标题、换一个更紧凑的 component 类型）
- 面向用户的 deck 文本跟随用户使用的语言，IR 的结构性字段永远用 schema 里的英文枚举值
