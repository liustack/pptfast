---
summary: 'skills/pptfast/references/components.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/components.md
---

# 组件指南

何时读：碰到形态相近的组件，或要看字段与上下限时。

`steps` 和 `flowchart` 是最常见的混用：只要分支路径从不出现，就是 `steps`。`flowchart` 和 `cycle` 是次常见的：这个流程最终走到一个终点，还是转回自己的起点？把一个闭环硬塞进 `flowchart`，那条收尾的回边会被画成一条横跨整张图的迷路线段或大弧线——这不是画图的 bug，是选错了 component；只要最后一个阶段的箭头是指回第一个阶段，就该换成 `cycle`。`roadmap` 和 `gantt` 是再下一个：`roadmap` 把多条工作线分组进泳道，没有共享的数值坐标轴，`gantt` 则把带日期的条形画在一根所有条目共同比对的共享坐标轴上。`pest` 和 `swot` 是再下一个：`pest` 只看外部宏观环境因素（没有内部优势/劣势这条轴），永远是同样命名的四个类别——一份内部对外部的战略评估仍然是 `swot`。`sankey` 和 `flowchart`/funnel `chart` 是再下一个：`sankey` 在分支/汇合的路径上守恒并拆分一个数量（带宽本身就承载意义），`flowchart` 是没有数量含义的决策/流程分支，funnel `chart` 则永远只沿一条线收窄，从不分支也不汇合。`data_table` 和 `chart` 和 `comparison` 是最后一组：受众要逐行读的精确数字用 `data_table`，一眼看出趋势/对比形态的用 `chart`，没有精确数字、只做定性并排属性对比的用 `comparison`。

`chart` 内部，子型就是数据的形态。两根轴都是数值量时用 `scatter`（给每个点加可选 `size` 就成了气泡图）。线下方的填充区要读作累积或体量时用 `area`。部分对整体的占比用 `donut`，中心可选把总值放大居中（`center_total: true`）。单个指标对目标的完成度用 `gauge`。`gauge` 和 `kpi_cards` 最要分清：`gauge` 是单个完成度指标，画成一段填充的半环（例如 62% 达标），`kpi_cards` 则是多个各自独立的头条数字并排陈列，所以别在该用 `kpi_cards` 的地方摆一排 gauge。`scatter` 和 `line` 的区别：`scatter` 需要数值 x（两根轴都是真实坐标），x 轴是类目标签的仍然是 `line`。

`architecture` 的 `layers` 数组默认从上到下画（`layers[0]` 是最顶层的那条带）——这是自顶向下撰写系统分层（表现层在前、基础设施在后）的自然顺序。如果是一个自底向上的叙事（成熟度阶梯、基础优先的能力模型），就按它自己从低到高的自然顺序撰写，并在 component 上设 `direction: "bottom_up"`，让 `layers[0]` 改画在最底部——不要手动把数组倒过来伪造这个效果，这个字段存在的意义正是让数组始终保持叙事顺序。

`swot`/`bmc`/`waterfall`/`gantt`/`pest`/`five_forces`/`heatmap`/`sankey` 是「满幅」（full-body）组件：各自占满整张 slide，且必须是该 slide 唯一的 component——见 `references/density.md`。

### cycle vs. flowchart

两者都是用箭头把一串阶段连起来，区别在于这个流程有没有终点。`flowchart` 面向一个从某处开始、到某处结束的流程，哪怕中途有分支；硬要用它画一个闭环，做法只能是从最后一个节点拉一条边指回第一个节点，而 `flowchart` 的排布引擎并不知道这条边有什么特殊——画出来就是一条横跨整张图的迷路线段或大弧线，读起来像画错了，不像「这个流程会重复」。`cycle` 面向没有终点、总会转回自己起点的流程（PDCA、产品生命周期、飞轮、季节性循环、「设计 → 构建 → 复盘 → 设计」）。判断标准很直接：最后一个阶段的箭头，指向的是一个新东西，还是指回第一个阶段？指回第一个阶段，就用 `cycle`，不用再犹豫。

字段：`items`（3-8 项，每项必填 `label`，可选 `description`），可选的整体 `title`。`cycle` 不接受 `direction` 字段（阶段固定按顺时针排布，`items` 就按这个阅读顺序撰写），也没有中心文字槽——把内容留给阶段本身，别的信息放进 slide 周围的文字里。3 是硬下限（2 个阶段视觉上闭不成一个环，该用 `flowchart` 或 `steps`），8 是硬上限（第 9 个节点会把环挤到 1280x720 slide 上不够清楚的程度，超过就拆成多张 `cycle` slide，不要硬塞进一个环里）。

### 设备样机 vs. 普通图片

`device_mockup` 把一份资产框进一个主题化的浏览器窗口或手机机身，而不是一个普通带边框的矩形——它只为一件事存在：一张截图需要被读成「一个真实的产品，正在运行」，而不是「slide 上的一张图」。内容是软件/App/仪表盘的截图，且这一页的论点就是「这个产品是真的、正在正常工作」时用它。除此之外——普通照片、示意图、插画,或者只是顺带用截图说明一个观点而不是断言「这在真实运行」——都用 `image`。把不是产品截图的内容硬套 `device_mockup`，读出来只是个奇怪的装饰边框，不是证据。

字段：`device`（`"browser"` 或 `"phone"`，必填，pptfast 不猜）、`asset_id`（语义同 `image`）、可选 `caption`，以及——仅 `browser` 款——可选的 `url`，渲染为地址栏文字（这是「这是真的在浏览器里跑」这件事上最强的信号）。`phone` 款没有地址栏，`validate` 会硬拒绝在 `phone` 上设置 `url`。屏幕内容永远铺满裁切（cover）——不像 `image` 那样有 `fit` 可选：真实设备的屏幕就是边到边铺满的。故意不提供其它装饰选项——没有倾斜/透视、没有暗色窗框开关、没有多设备并排——窗框配色完全由主题 token 决定。

### 人员卡片 vs. row/icon cards

判据很直接：条目是不是「人」？团队名单、讲者阵容、评委阵容、作者名单，用 `people_cards`：2-12 人的等重卡片网格，每张卡是一个由 `name` 派生的确定性 initials 徽章（不需要照片资源），加姓名和可选的 `role`/`org`。非人条目仍用 `row_cards`/`icon_cards`，哪怕字段形状很像。这两个组件上限都是 6 项，`people_cards` 是 12 项：一份会撑爆 6 上限的人员名单（比如 9 位讲者的大会阵容），就是该换 `people_cards`、而不是硬拆成两页无标签 `row_cards` 的最清楚信号。

字段：`people`（2-12 项，每项必填 `name`，可选 `role`/`org`），可选的整体 `title`。initials 徽章是 `name` 的纯函数：拉丁名取首两词的首字母（"Sarah Chen" → "SC"），单个拉丁词取它自己的前两个字母，CJK 名只取首字符，也就是姓（"王小明" → "王"），不取两个字。这个组件故意没有照片字段：真有头像照片的场景，`image_grid` 已经够用，`people_cards` 存在的全部理由就是这个零资产依赖的 initials 徽章。2 是硬下限（一个人的简介用不上网格，改用 `callout` 或纯文字），12 是硬上限（更大的名单拆成多张 `people_cards` slide，不要硬塞第 13 张卡进一个网格）。

### 标签行 vs. bullets/卡片

一行短平行标签——技术栈、能力或技能清单、关键词、供应商持有的资质——用 `tag_row`，不是 `bullets` 或 `row_cards`。判据是每一项是不是一个短*标签*（一个名词），而不是一句话或一个带描述的条目。`tag_row` 把 2-16 个短标签排成一行会自动换行的胶囊，每个标签按其真实的逐字符宽度测量，所以 CJK/拉丁混排的标签也能正确换行，可选的 `emphasis: "first"` 把首个标签画成主题 accent 色，作为其余标签中的主标签。真正的正文列表（读起来是句子或从句的条目）仍用 `bullets`，每项自带描述文字的条目用 `row_cards`/`icon_cards`——标签没有描述。

字段：`items`（2-16 个短字符串，每个 ≤24 字符——这是硬上限，因为标签是标签、不是句子；超了 `validate` 会把你指向 `bullets`/`row_cards`），可选的整体 `title`，可选的 `emphasis`（`"first"` 或 `"none"`，默认 `"none"`）。2 是硬下限（单个标签不成行——放进标题、`callout` 或 `verdict_banner`），16 是硬上限（超过 16 个后这行读起来就是一堆没排序的关键词——拆成多张 `tag_row` slide，或把标签分成带小标题的组）。
