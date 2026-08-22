# 文本

字必须能读，且待在自己的格子里。

## 不重叠

两段可见文本的墨水包围盒不得相交。装饰线不得穿过字形（与 gravity 的下划条相接）。

看什么：标题与副题、标题与 meta、两栏文字的墨盒。封面即使没有 `data-audit-box`，也要按字形墨盒来看。

怎么算 rework：两段字的墨盒相交，较小盒被压住一块，记 `rework`。arena 封面与 corner-wedge 曾把 70px 标题压在 34px 副题上。

正例：两行同字号、行距约 1.07em，中间有气口。70px 标题在 y=360 与 y=435 这种叠行通过。

反例：标题墨盒压副题。种植图 `rubric/examples/overlap-1.png` 与 `rubric/examples/overlap-2.png` 应判 `rework` 或 `limit`。故意的强调叠字（极少，须能读）除外，须写 note。

## 不溢出画布或栏

文本不得画出 1280×720 画布，不得画出所属栏或卡的内盒。

看什么：栏宽、卡壳、页边。没有 `data-audit-box` 时，仍要看同一组里的卡片 rect。卡壳底边越过页底也算。

怎么算 rework：字形越过页边，或越过栏、卡内边超过约 6px，记 `rework`。设计 bleed 豁免只认 `evals/gallery/bbox-exemptions.ts` 里按版式加文本登记的条目，未登记的溢出仍报。

正例：英文标题留在栏内。卡落在黑板框里，底边不穿出 1280×720。

反例：英文标题画出栏（image-top），卡画出框（lecture p04）。种植图 `rubric/examples/overflow-1.png` 与 `rubric/examples/overflow-2.png` 应判 `rework` 或 `limit`。

## 不贴分割线

标题、kicker、栏头与主分割线之间要留得出一口气。贴线、骑线都算失败。

判定：文本盒与主水平分割线的间距小于 4px，或与页边小于 4px（bleed 豁免同上）。banner-heading 的 kicker 贴线、quote-stage 标题压线走本条。

## 字号地板

正文常见 ≥14px，说明/来源/caption ≥12px。装饰字（`data-decor`）不受此限。

判定：可读文本 `font-size` 数值小于 12，记 `rework`。小于 14 的正文（不是 caption、不是页脚 meta）记 `limit`。组件徽章、角标、刻度若小于 12 且不是 `data-decor`，仍报。
