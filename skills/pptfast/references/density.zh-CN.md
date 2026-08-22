---
summary: 'skills/pptfast/references/density.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/density.md
---

# 密度与 beat

何时读：处理 pacing 预算、`beat`、容量、或 slide `decor` 时。

### 容量

一张 slide 是一块固定尺寸的画布。第一遍起草就要考虑装得下：每张 slide 少放几个 component，标题简短有力，bullet 条目控制在约两行以内。component 数和 bullets 预算随这份 deck 的 `pacing` 轴变化（`spacious` 最紧，`dense` 最松）——`validate` 会报出实际生效的具体数值，不是一个写死的常数。这些是警告，不是硬错误——值得为了让 deck 更紧凑而修，但从不拦住 `render`。正文字号则反过来变化：`spacious` 渲染出的正文字号最大（32px，相对 `balanced` 的 24px 和 `dense` 的 20px），即便它允许的 component 数最少——所以一张 `spacious` 的 slide 需要更少、更短的条目，而不只是更紧凑。不论 pacing 是什么，一条长到在渲染安全字号地板下仍然溢出的 bullet 条目，*就是*一条硬 `validate` 错误，五种 bullet 样式（`default`/`plain`/`divided`/`numbered`/`checklist`）一视同仁——否则它会被省略号真的截掉一段真实文字。把「bullet 条目要短」当成一条不分样式都成立的硬约束。拿不准的时候就拆成两张 slide——一遍写对，好过事后反复修补。

有八种 component 类型独占整张 slide，而不是与其他组件共享：`swot`、`bmc`、`waterfall`、`gantt`、`pest`、`five_forces`、`heatmap`、`sankey`。各自必须是所在 slide 唯一的 component——`validate` 会在一张 slide 把其中之一和 `bullets` 或其他任何组件混在一起时硬报错，绝不会静默丢弃那个「陪衬」的 component。

### Beat（节奏标记）

一张 content 页面上可选的 `beat`（`anchor`、`dense` 或 `breathing`）现在不只是 `spec validate` 的节奏检查——它还会影响 `render` 给这一页自动选出哪个 layout：`anchor` 偏向单一的强断言式 layout，`dense` 偏向可见条目更多的高密度 layout，`breathing` 偏向最舒展的单栏 layout。它是一个软权重，不是钉死的选择——显式的 `layout` 依然会完全覆盖它，未设置的 `beat` 则毫无影响。要有意识地声明它，按每一页在论证里的实际角色各给一个值（「重磅揭示」的那页是 `anchor`，数据密集的对比页是 `dense`，两个高密度段落之间的换气页是 `breathing`），而不是每一页都盖同一个章——`spec validate` 自己的 beat 轮换门已经会对期望有变化的 strategy 标出一连串相同 beat 的问题，而且到处盖同一个值本来就会抵消这个字段存在的目的：给 layout 增加变化。

### Decor（装饰）

只有当用户明确要求装饰性点缀时，才设置 slide 的 `decor`。默认不设——theme 本身已经带着自己的视觉母题。
