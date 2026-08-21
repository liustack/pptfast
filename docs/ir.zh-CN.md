---
summary: 'IR 详解：deck 与 slide 的字段、满幅组件、叙事三轴、版式选型与 seed，以及 deck 项目目录格式'
read_when:
  - 手写 IR，或要教模型写 IR
  - 某个字段名或版本号在校验时被拒
  - 在单文件 IR 和 deck 项目目录之间做选择
  - 某页选到了意外的版式，或者版式在多次修订之间乱跳
---

# IR

IR 是一份描述整份 PPT 内容的 JSON 文件：有哪些页、每页上有什么、整体用哪个主题。agent 写的就是它，`pptfast render` 需要的输入也只有它。

运行 `pptfast schema` 获取完整 JSON Schema，让模型写 IR 之前先把它喂进去。

## 一份 deck

一份 deck（`PptxIR`）包含：

- `version`：现为 `"4"`，省略时默认就是它。
- `filename`。
- `narrative`：预设 id 字符串，或部分轴对象（见[叙事](#叙事)）。
- `theme`：`id` 加可选的 `style`/`brand` 覆盖。
- `meta` 与 `assets`。
- `brand`：logo 位置。
- `chrome`：品牌页脚和 logo 出现在哪些页。`"full"` 是今天的页脚和 logo。`"cover-only"` 只留在 cover 和 chapter 页，content 和 ending 页不画页脚细线、meta 和 logo。`"minimal"` 关掉内容页的页脚细线和 meta，logo 留下。省略等于 `"full"`。版式 `chrome: "none"` 仍优先。主题 motif 不受这个字段影响。演讲 deck 写 `"cover-only"`。阅读 deck 省略。
- `slides`：必填，有序。

除 `slides` 外都可省略，且都有合理默认值。

`assets` 的形状是 `{ images: { [id]: { src, alt? } } }`。component 通过 `asset_id` 引用图片，同一张图可以在多页复用而不必重复内嵌。`alt` 一旦设置，会落进导出 PPTX 里该图片的标准无障碍描述槽位，也就是 PowerPoint「编辑替换文字」面板读写的那一栏。资产没写 `alt` 的 `image` 组件，导出结果和这个字段存在之前完全一致。

一份 deck 还可以携带 `seed`：一个整数，让自动选型的版式在多次修订之间保持稳定（见[版式选型](#版式选型)）。

## 一张 slide

每张 slide 有：

- `type`：`cover`、`chapter`、`content`、`ending`。
- `layout`：显式指定的页面版式 id，恒优先于自动选型。省略则由 pptfast 自动选。
- `arrangement`：content 页正文的排布方式，例如 `two_column`、`kpi_focus`。
- `components`：填充页面的带类型单元（`bullets`、`kpi_cards`、`image`、`chart` 等）。

任意 slide 还可以设置稳定的 `id`（spec 的页面和校验报错都靠它引用）、`placeholder: true`（还没有内容的占位页，由 `assemble` 为 spec 里没人填写的页面注入，内容质量检查会跳过它，`render` 也会因它拒绝导出，除非加 `--draft`），以及 `notes`（同义词 `note`/`speaker_notes`/`speakerNotes`），导出为原生 PowerPoint 演讲者备注。备注只给主讲人自己看，不会画到幻灯片画布上，也不计入任何版式容量。演讲 deck 的讲稿写进 `notes`。agent 操作手册里的演讲密度合同（`skills/pptfast/SKILL.md`）是这条规则。

## 会漂移的字段名

跨 component 类型共 55 组同义词，例如 kpi 的 `title`→`label`、quote 的 `content`→`text`、swot 的 `strength`→`strengths`、bmc 的 `partners`→`key_partners`，都会在校验时静默改写成规范名。`validate`/`render`/`preview` 会打印一条改了什么的提示，从不因此报错。

这套救援只覆盖弱模型的同义词漂移，不覆盖 v4 之前的旧词汇。标着 v4 却仍写 `scenario`（而不是 `narrative`）、`mode`/`delivery`（而不是 `strategy`/`pacing`）、或轴值还停留在旧的 `narrative`/`text`/`presentation` 的文档，会直接硬报错，并列出当前正确的名称和取值。显式写 `version: "3"`（或 `"2"`）同样硬拒绝，并给出迁移指引。

## 满幅组件

八种 component 类型独占整张 slide 的内容区域，必须是该页唯一的 component：

- `swot`：strengths/weaknesses/opportunities/threats 四象限。
- `bmc`：九宫格商业模式画布。
- `waterfall`：运行合计瀑布图。
- `gantt`：共享数轴上的甘特条形图。
- `pest`：政治/经济/社会/技术宏观环境扫描。
- `five_forces`：波特五力竞争结构轮辐图。
- `heatmap`：值驱动色阶网格。
- `sankey`：分层且量值成比例的流向图，导出为原生可编辑矢量，而不是这类图表在别处常见的栅格图片。

混入其他 component 会在校验时报错，而不是静默丢弃。

## schema 稳定性

v4 IR schema 自 0.4.0 起冻结，后续演进只走加法：新增可选字段、新增枚举值。任何破坏性变更都会启用新的顶层 `version` 值，并沿用 v3 那套硬拒绝加迁移提示的处理方式。

`pptfast migrate <v3-file.json> -o <out.json>` 确定性地把 v3 文件转成 v4，只做字段改名，theme、版式选型、内容预算与视觉输出都不变。`deck.plan.json` → `deck.spec.json` 的姊妹转换见 [Deck 项目](#deck-项目)。

## 叙事

叙事（narrative）是三条轴，独立于主题的视觉风格，用来定编辑纪律：

- `strategy`：论证方式，`pyramid`、`storytelling`、`instructional`、`showcase`、`briefing`。
- `pacing`：内容密度，`dense`、`balanced`、`spacious`。
- `audience`：语气锚点，`executive`、`technical`、`customer`、`public`，目前无渲染效果。

把 IR 顶层的 `narrative` 设为具名预设字符串（如 `"boardroom-report"`），或部分轴对象（如 `{ "pacing": "spacious" }`）。省略任意一轴、或整个省略 `narrative` 字段，均回落到 `general` 预设（`briefing` × `balanced` × `public`）。未知的预设名或轴值会硬报错并列出可用项。

`pacing` 驱动内容质量门，也驱动正文字号基线（仅 paragraph/bullets/callout 三件套，其余组件各自的字阶与标题体系不受影响）。每页的 component 数预算与 bullets 预算随 `pacing` 从 `dense` 向 `spacious` 收紧，正文字号则反向增长。密度上限还会再叠加所选 layout 的容量，取两者中更紧的一个。

| pacing | 正文字号 | 每页 component 数 | bullets |
|---|---|---|---|
| `dense` | 20px | 5 | 至多 6 条，每条约 48 字 |
| `balanced`（默认） | 24px | 4 | 至多 5 条，每条约 40 字 |
| `spacious` | 32px | 3 | 至多 4 条，每条约 30 字 |

这些是编辑性指导，不是硬限制，`validate` 只报成警告，仍然校验通过。真正能拦下生成的只有渲染安全上限。

bullets 需要时会在各自档位基线之下收缩以适配空间，最低到 14px 地板，再触发溢出处理。`default`、`plain`、`divided`、`numbered`、`checklist` 五种要点样式一视同仁：一条要点长到在这个地板字号下仍然放不下，会是一条硬校验错误。它比上面按 pacing 分档的长度指导更宽，触发理由也不同：这种情况在渲染时会真的被省略号截掉文字。

`pptfast validate` 会报出每页实际生效的具体数值。`pptfast narratives [--json]` 列出全部具名预设（各自带一份软性 theme 推荐，仅供参考，不构成约束）及三轴的原始数据表。

## 版式选型

当某页省略 `layout` 时，pptfast 按四个确定性步骤自动选型：

1. 该页型的全部注册版式。
2. 收窄到主题为该页型准备的版式集合（默认全集，见[主题](./themes.zh-CN.md)）。
3. 叙事的 `strategy` 对一小撮适配它的 content 版式做 ×3 软加权，其余维持 ×1 底权。cover、chapter、ending 三个页型永不参与这层加权，它们的个性来自主题。
4. 按 seed 加权取样，若命中结果与紧邻的上一页版式相同，则确定性地换成次优候选。

显式 `layout` 恒优先，跳过以上四步。内容装不装得下由 `validate` 的密度门单独标记，从不参与选型，所以改一页的内容不会悄悄翻转它的版式。

选型本身完全确定：同一份 IR 永远选出同一个结果，预览与最终渲染绝不会不一致。但要在**多次修订之间**保持稳定（改一页不搅动其余页的自动选型），还需要一个持久化的 `seed`，按以下顺序解析：

1. 显式 `ir.seed`，完全修订稳定，恒优先。
2. deck 项目自己的 seed。spec 省略 `seed` 时，`pptfast assemble` 首次运行会用 spec 的 filename 加页面 id 列表派生一个并打印出来，把这个值写进 `deck.spec.json` 的 `seed` 字段即可固化。
3. 以上均未设置：回落到 `filename` 加每页 `heading` 的内容哈希。改动任何一页标题都会重排全 deck 的自动选型。

`pptfast assemble` 还会把每一页的自动选型结果写回合并后的 `deck.json`（页面文件里已显式指定的 `layout` 不受影响），CLI 会提示本次填写了多少页。

这套机制的实现细节见 [`selection-and-seed.md`](./selection-and-seed.md)（英文）。

## Deck 项目

一份 deck 有两种写法，接受 IR 的每个命令两种都认：单个 **IR JSON 文件**（如上文所述），或者一个 **deck 项目目录**，把同样的内容拆到多个文件里，方便 agent 先规划整体结构，再逐页撰写和修订，而不必把一份不断增长的 JSON 塞进上下文。

```
my-deck/
  deck.spec.json         锁定的 spec：每一页的顺序、type、heading
  pages/<page-id>.json   每个已填页面一个文件（components/layout/arrangement/background/image_side/footnote）
  assets/                本地图片，按文件名自动注册（图片 id = 去掉扩展名的文件名）
```

`deck.spec.json` 可以在任何页面填写之前单独校验：`pptfast spec validate deck.spec.json` 检查 schema，以及一组随 strategy 变化的硬门（边界页类型、标题长度、beat 轮换、页数是否匹配 pacing）。

spec 里某一页如果没有对应的 `pages/<id>.json`，会成为一个**占位页**，只有标题，不算缺失，所以写到一半的 deck 也能正常 assemble 和预览。`pptfast render` 遇到未填的占位页会拒绝导出，除非加 `--draft`。`pptfast preview` 则永远不会因占位页被拦。

目录里如果还留着改名前的 `deck.plan.json` 而不是 `deck.spec.json`，不会被直接读取。用 `pptfast migrate <dir> -o <dir>` 原地转换：会在旁边写出 `deck.spec.json`，不覆盖也不删除原文件，确认新文件无误后自己删掉 `deck.plan.json`。目录里两个文件同时存在会硬报错，绝不猜测优先级。

`pptfast assemble <dir>` 把 spec、pages、assets 合并成一个 IR JSON 文件（默认写到 `deck.json`）。`pptfast disassemble <ir.json> -o <dir>` 做反向操作，是有据可查的有损转换：`beat`/`focus` 这类只属于 spec 的字段在 IR 里没有对应位置，无法还原。`render`/`validate`/`preview` 也都能直接接受一个目录，会先在内存里 assemble 一遍。

deck 项目目录可以用裸名代替路径引用。`pptfast render my-deck -o out.pptx` 在本地找不到同名文件或目录时，会到 `$PPTFAST_HOME/decks` 下找 `my-deck`（`$PPTFAST_HOME` 缺省是 `~/.pptfast`）。

所有 deck 默认值按四层优先级解析，从高到低：CLI flag > 项目级 `pptfast.config.json` > 用户级 `~/.pptfast/config.json` > deck 自身的值。两个配置层都可以设置 `decksDir` 来重定向裸名的解析位置：项目层的值相对该配置文件自身所在目录解析（给想把 deck 项目入库的团队用），用户层的值相对 `$PPTFAST_HOME` 解析，两者都设置时项目层优先。

格式的更多细节见 [`deck-projects.md`](./deck-projects.md)（英文）。
