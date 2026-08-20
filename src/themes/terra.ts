import type { StyleTokens } from "./tokens";

/**
 * terra（可持续/ESG/大地色）——2026-07-28 themes-16 wave task T2（第 15
 * 主题）。用户拍板方向：13 个内置主题里没有大地色系，ESG 年报是企业刚需
 * 场景（.issues/2026-07-28-themes-16/plan.md 场景空档论证）。沙色底 +
 * 橄榄绿主色 + 赭石强调色，气质一句话：朴素、根系、长期主义（plan 裁定 1）。
 *
 * **暖纸组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group2-warm-boards.dc.html` 里 terra 的色板角色表 + 封面样例）**：
 * terra 在暖纸四家里拿到的语域是田野纸——沙色压灰、橄榄、赭石，一整片
 * 地貌里挖出来的色。逐条来历：
 *   - `bg` `#F5F1E8` → `#EFE9DC`：沙色压灰。旧值偏奶油甜感，压灰之后才是
 *     「土」，也把它与 heritage 的灰调本白、vermilion 的公文米白拉开档。
 *   - `surface` `#FBF8F1` → `#F7F3E8`：浅沙面板，跟着底色下沉一档。
 *   - `primary` `#4A5D3A` → `#4D5D39`：橄榄绿提亮半档，chapter 整版橄榄底
 *     不再闷成一块黑绿。**设计板给的是 `#55663F`，实测压 bg 只有 5.17:1，
 *     而板自己标的是 5.9:1**——差的这 0.7 不只是数字：`fashion-ending`
 *     在整版 primary 上画 `readableOn` 白字并叠 0.72 不透明度，`#55663F`
 *     的混合读数 4.14:1 跌破 4.5:1 正文门槛，全版式扫描多出一条 finding。
 *     沿同色相回压到 `#4D5D39`（压 bg **实测 5.90:1**，与板上数字对到小数
 *     位），该混合读数回到 4.64:1，finding 消失，白字压它也从 6.25:1 升到
 *     7.14:1。板上 hex 与板上数字对不上时按数字走（同 muted / ember
 *     primary 两处的处理）。
 *   - `accent` `#C96F4A` → `#B25E38`：陶土亮橙 → 赭石。旧值是烧出来的釉色，
 *     赭石是地里挖出来的红，与 ember 的火橙分家。实测 3.18:1 → 3.81:1。
 *   - `text` `#2E2A21` → `#2B2A22`：腐殖土墨，11.91:1（压新底）。
 *   - `muted` `#6B6555` → `#656155`：干草灰。**设计板给的是 `#6B675A`，
 *     实测压 bg 只有 4.68:1、压 matrix 组件的 tone 混合格底（accent 压
 *     surface 混出的 `#ECDBCC`）只有 4.19:1——后者跌破 4.5:1 正文门槛，
 *     `full-matrix-contrast.test.ts` 的 `colors.muted component-type
 *     coverage` 实测报红。按同色相压暗一档到 `#656155`（consulting muted
 *     `#6C6C6C`→`#6B6B6B`、pulse `#5A6E6A` 的同一条校准先例）：压 bg
 *     5.11:1、压 surface 5.58:1、压混合格底 4.59:1，三处全过——且 5.11:1
 *     正是设计板自己写的「5:1」，板上的 hex 与板上的数字对不上时按数字走。
 *   - `border` `#E6DCC5` → `#D8D0BC`：沙纹线，压灰底上要再深一档才看得见。
 *   - `chartPalette` 全序列取自同一片地貌：橄榄 / 赭石 / 深湖 / 沙褐。旧表
 *     里的麦黄 `#C9A24B` 压 bg 只有 2.13:1，是四色里唯一读不出来的一格。
 *   - `fonts` Georgia 衬线 → 雅黑无衬线：设计板的组内互检明写「heritage
 *     衬线、其余 sans」，封面样例的标题也是无衬线。terra 的朴素不再靠
 *     衬线的书卷气说话，靠底色与等高线本身说话。首位仍必须是有精确字宽表
 *     的面（`hasExactWidthTable`，`src/lib/svg-text-layout.ts`——Georgia 与
 *     Microsoft YaHei 是仅有的两个），故取 Microsoft YaHei。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#EFE9DC`）：primary 5.90:1、accent 3.81:1、text 11.91:1、muted 5.11:1
 * （压 surface 5.58:1）、chart 橄榄 5.90:1 / 赭石 3.81:1 / 深湖 4.98:1 /
 * 沙褐 3.42:1。设计板自查写的 primary 5.9 / accent 4 / text 13 / muted 5 /
 * chart 5.9·4·5.5·3.5 逐格略高于实测（muted 一格例外，见上），以实测为准
 * ——每一格仍守着它自己的门槛（primary/muted 过 4.5 正文线，accent/chart
 * 过 3.0 装饰线）。
 *   - chapter 底色取 primary（同 academic/consulting/pulse 先例），白字对
 *     primary 7.14:1，`readableOn` 自适应两墨取优后稳态可读。
 *
 * 装饰见 `src/svg/motifs/motif-terra-motif.tsx`（等高线 v3：左上顶缘的
 * 等高线簇 + 右缘种子点列，chapter 整版橄榄底上完全不画）。
 */
export const TERRA_TOKENS: StyleTokens = {
  id: "terra",
  colors: {
    bg: "#EFE9DC", // 沙色压灰
    surface: "#F7F3E8", // 浅沙面板
    primary: "#4D5D39", // 橄榄绿（5.90:1），校准记录见文件头注释
    accent: "#B25E38", // 赭石（3.81:1，装饰/图表/大字，不作正文色）
    text: "#2B2A22", // 腐殖土墨（11.91:1）
    muted: "#656155", // 干草灰（5.11:1），校准记录见文件头注释
    border: "#D8D0BC", // 沙纹线
    danger: "#9E3A1F", // 陶红（6.15:1）——比赭石 accent 更红更深
    warning: "#96661C", // 深土黄（4.49:1）
    success: "#456B36", // 叶绿（5.56:1），橄榄 primary 提饱和
    chartPalette: ["#4D5D39", "#B25E38", "#3E6B63", "#8C7B54"], // 橄榄/赭石/深湖/沙褐
  },
  // Microsoft YaHei first: resolveFontFace picks the first SAFE_FONTS match,
  // and only Georgia/Microsoft YaHei carry an exact per-character width table
  // (`hasExactWidthTable`, `src/lib/svg-text-layout.ts`) — the invariant
  // `definitions.test.ts`'s registerTheme console.warn regression test pins
  // across all builtins. The warm-group board moved terra off Georgia's serif
  // register (see the file header's own note), so YaHei is now the face that
  // both satisfies that invariant and matches the board.
  fonts: {
    heading: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 4, gapScale: 1 }, // 朴实无华（ESG 年报/可持续报告的克制感）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#EFE9DC" },
    chapter: { kind: "color", value: "#4D5D39" },
    content: { kind: "color", value: "#EFE9DC" },
    ending: { kind: "color", value: "#EFE9DC" },
  },
};
