import type { StyleTokens } from "./tokens";

/**
 * ember（创业路演/暖色能量）——2026-07-28 themes-16 wave task T3（第 16、
 * 本波最后一个主题）。用户拍板方向：13 个内置主题里橙色主色完全空缺，
 * pitch deck 要暖、亮、友好——campaign 太闹、tech 太暗、consulting 太冷
 * （.issues/2026-07-28-themes-16/plan.md 场景空档论证）。暖白底 + 火橙
 * 主色 + 琥珀强调色，气质一句话：明快、上升、热身好了就开讲（plan
 * 裁定 1）。
 *
 * **暖纸组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group2-warm-boards.dc.html` 里 ember 的色板角色表 + 封面样例）**：
 * ember 在暖纸四家里拿到的语域是路演纸，纸色阶梯里最亮的一档。逐条来历：
 *   - `bg` `#FFFBF5` → `#FBF5EE`：暖白往下压一丝。旧值几乎是纯白，压一档
 *     才与 surface 的近白面板分得开，也才读得出「纸」。
 *   - `surface` `#FFFFFF` → `#FFFDF9`：近白面板。
 *   - `primary` `#E4572E` → `#BC4620`：火橙压红一档。**设计板给的是
 *     `#D14E24`，不能用**——它正落在两墨的谷底：near-black 墨压它 4.44:1、
 *     白字压它 4.35:1，**两墨都不到 4.5:1**，而 rail-numbered 的编号、
 *     split-band 的副标题、heatmap 的格值、roadmap/steps 的徽记数字全都是
 *     画在 primary 色块上的小字，`full-matrix-contrast.test.ts` 逐条报红。
 *     一个要承正文小字的色块色不能停在这个明度上——这不是板上数字与实测
 *     差 0.5 的问题，是那枚 hex 本身选在了最坏的一档。板自己写的意图是
 *     「压红一档（5:1）——现状亮橙承不了白字，这个能」，而 `#D14E24` 实测
 *     压 bg 4.02:1、白字 4.35:1，两条都不成立。沿同一色相（H≈14.5°）继续
 *     压到 `#BC4620`，板上这两句话才真的成立：压 bg 4.81:1（板称 5:1）、
 *     白字压它 5.20:1（`readableOn` 因此稳态选白字，chapter 整版橙上的
 *     反白从旧值的 3.68:1 抬到 5.20:1）。**纪律仍不变：primary 只用于
 *     大字标题/色块，正文与小字一律用 text**——4.81:1 虽已跨过 4.5，
 *     但它是「文字画在纸上」的读数，本主题真正的风险面是「文字画在
 *     primary 色块上」，那一面由 `readableOn`/`accessibleInk` 兜。
 *   - `accent` `#FFC145` → `#E8A13C`：火焰黄 → 琥珀。实测 1.57:1 → 2.02:1，
 *     仍低于 3.0 装饰门槛，**accent 只给点与线，绝不当任何文字色**（除非
 *     深底反白走 `readableOn`）——`ending-constellation-ending.tsx` 的
 *     accent 句点在本主题上仍回落到 text 墨，那条回退路径不变。
 *   - `text` `#26221E` → `#2E241E`：炭墨，13.98:1。
 *   - `muted` `#6E6259` → `#6E6156`：烬灰，5.53:1，仍清 4.5:1 正文门槛。
 *   - `border` `#F0DEC5` → `#E8DCCB`：暖沙线。
 *   - `chartPalette`：火橙 / 琥珀 / 余烬紫 / 烬灰。沿革两步：旧表的藏青
 *     `#2B3A55` 压 bg 11.08:1，在一张暖表里黑得像另一套配色，先换成天蓝
 *     `#3E7CB1` 4.11:1（当时的理由是「增长图要有一个冷色说真话」）。
 *     **第四轮评审推翻了这一格**：用户把蓝配橙定为禁忌（原话在
 *     enterprise p09/p10：「不要蓝配橙，超级丑」），而 ember 是暖调主题，
 *     天蓝在这张表里正是那个外来的蓝。换成余烬紫 `#6B3F5C` 7.79:1——
 *     炭火熄灭时橙→红→紫灰的那一档，仍在暖色语系内。
 *     不选深苔绿的原因是实测而非口味：绿与火橙 `#BC4620` 在红绿色盲
 *     （protanopia）模拟下 ΔE 只有 6-12，两根柱子会糊成一根；余烬紫最近的
 *     一格是烬灰，deuteranopia ΔE 20.8 / protanopia 26.8，安全。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#FBF5EE`）：primary 4.81:1、accent 2.02:1、text 13.98:1、muted 5.53:1、
 * chart 火橙 4.81:1 / 琥珀 2.02:1 / 余烬紫 7.79:1 / 烬灰 4.82:1；白字压
 * primary 5.20:1、near-black 墨压 primary 3.72:1（`readableOn` 取白字）。
 * 设计板自查写的 accent 3 / chart 3·4·4.5 高于实测，**以实测为准**：
 * accent 2.02:1 未达 3.0 装饰门槛，因此只给点与线、不承字——这条纪律与
 * 旧值时期完全一致，未因板上数字放宽。primary 一格是唯一按板上**数字**
 * 而非板上 hex 落地的（见上）。
 *
 * 装饰见 `src/svg/motifs/motif-ember-motif.tsx`（上升火星：右缘自下而上
 * 渐大的点列 + 顶缘一枚斜引线）。
 */
export const EMBER_TOKENS: StyleTokens = {
  id: "ember",
  colors: {
    bg: "#FBF5EE", // 暖白（本组最亮一档）
    surface: "#FFFDF9", // 近白面板
    primary: "#BC4620", // 火橙（4.81:1；白字压它 5.20:1），校准记录见文件头
    accent: "#E8A13C", // 琥珀火星（2.02:1，只给点与线，绝不当文字色）
    text: "#2E241E", // 炭墨（13.98:1）
    muted: "#6E6156", // 烬灰（5.53:1）
    border: "#E8DCCB", // 暖沙线
    danger: "#A62617", // 余烬红（7.10:1）——比火橙 primary 更深更红
    warning: "#A85A16", // 焦琥珀（4.99:1），与 accent 琥珀拉开明度
    success: "#4A7538", // 苔藓绿（5.31:1），暖调压得住火
    chartPalette: ["#BC4620", "#E8A13C", "#6B3F5C", "#756B5E"], // 火橙/琥珀/余烬紫/烬灰
  },
  // Microsoft YaHei first (not Verdana/Segoe UI): resolveFontFace picks the
  // first SAFE_FONTS match, and only Georgia/Microsoft YaHei carry an exact
  // per-character width table (`hasExactWidthTable`, `src/lib/svg-text-
  // layout.ts`) — every builtin's body face must resolve to one of those two
  // (`definitions.test.ts`'s registerTheme console.warn regression test pins
  // this invariant across all builtins). Verdana stays second in the stack
  // as the brief's own "modern sans" flavor cue (a wide, geometric,
  // startup-web-native face), Segoe UI third as the other named option —
  // both are real SAFE_FONTS members, just not first.
  fonts: {
    heading: ["Microsoft YaHei", "Verdana", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Verdana", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 10, gapScale: 1 }, // 友好圆润（创业路演的亲和感，介于 pulse 的 8 与更方正的既有主题之间）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FBF5EE" },
    chapter: { kind: "color", value: "#BC4620" },
    content: { kind: "color", value: "#FBF5EE" },
    ending: { kind: "color", value: "#FBF5EE" },
  },
};
