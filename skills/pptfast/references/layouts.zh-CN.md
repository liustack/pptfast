---
summary: 'skills/pptfast/references/layouts.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/layouts.md
---

# 版式与写死

何时读：钉 `layout`，包括高潮页、金句页、证据页稀排版式时。

### Pin-only 版式

这些版式从不出现在自动选型里。每次要用都得显式设置 `layout`。pin-only 的 content 版式超出声明容量时 `validate` 会硬报错（普通版式钉住超容量只给警告）。

`quote-stage` 是 content 页上的论断页：一句短而有力的标题是整页主视觉，最多再配一个短附注 component（出处、署名、一句补充）。0 个 component 合法。这一页仍会画主题的品牌页脚和 motif。

`statement` 是 content 页上的整页诗行或金句。最多一个 component，渲成出处小字（quote / paragraph / citation），不走卡片。可选 kicker 来自上一章。品牌页脚和 logo 不画。主题 motif 仍画。脸是主题专属的（已定稿的主题不是通用斜体 500 行）。

`pull-quote` 是 content 页上的引言页：标题、出处小字、可选 muted 散文。出处优先 quote 的 `attribution`，否则 `subheading`。品牌页脚和 logo 不画。主题 motif 仍画。

`verse-chapter` 是居中诗行章首（`type: "chapter"`）。tracking 章号眉、两行标题、可选斜体副题。没有水印大数字，没有 body，没有 footnote，chapter 页的既有边界照旧。logo 不画。主题 motif 仍画。

### 稀排页合同

一份 deck 是拿来讲的。幻灯片装不下的字写进 `slide.notes`。如果文件必须作为文档独立站住，建议用 PDF，不要把画布塞满。

这不是新的 `pacing` 档。枚举仍是 `dense` / `balanced` / `spacious`。合同靠版式点名、`notes` 和 deck `branding` 实现。

高潮页、金句页、证据页，在主题提供这些版式时显式钉 pinOnly 极简版式。点名：`statement`、`pull-quote`、`verse-chapter`、`stat-hero`、`one-evidence`、`mono-bleed`。不要把这些页交给自动选型。某一页真的只剩一句话时，即使 pacing 是 `dense` 也仍然钉。crayon、classroom、enterprise、pulse、runway、ember 不提供这些版式。如果 `validate` 警告这个钉子不是该主题提供的稀排页，就去掉钉子，改写普通内容页。

访谈或请求选了 `spacious`：收紧页上预算。标题就是主视觉。钉住的极简页最多一个 body component（一行出处、一个数字、一张图或一张表）。这些页零 bullet。装不下就拆页。

`balanced` 或 `dense`：按 pacing 预算写。某一页是一句话、一个数字、一句引语或一条证据时，仍然钉极简版式。

讲稿写进 `slide.notes`。`render` 导出成原生 PowerPoint 演讲者备注（View → Notes，演讲者视图可见）。讲稿从不画到画布上。

品牌框 omit/full 写在 `references/branding.md`。
