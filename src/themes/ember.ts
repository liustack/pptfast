import type { StyleTokens } from "./tokens";

/**
 * ember（融资路演 / 炭黑火橙）——第八波批 1 把暖纸路演翻成炭黑路演。
 * 设计板 `.issues/design-boards/wave8/b1/Ember.dc.html`：炭黑底、米白字、
 * 火橙只亮一处（角楔 / 巨号 / 钮）。
 *
 * 逐条来历：
 *   - `bg` `#FBF5EE` → `#241B14`：暖白纸换成炭黑舞台。四页
 *     `defaultBackgrounds` 一律同色，chapter 不再整版 primary。
 *   - `surface` `#FFFDF9` → `#2C221A`：炭卡，比底亮一档（板上三卡底）。
 *   - `primary` / `accent` 都落到板上火橙 `#E56A2C`。白字压它只有
 *     3.27:1，**小字 4.5 不够**。近黑墨 `#0A0E14` 压它 5.92:1，
 *     `readableOn` 稳态选深墨，色块上的编号 / 钮字走这条路。火橙压炭黑
 *     5.18:1，大字标题（3:1）和 19px 级（4.5）都站住，不必沿色相再压。
 *     旧值 `#BC4620` 是浅底上「白字压色块」的解，深底上那条约束反过来了。
 *   - `text` `#2E241E` → `#F2E9DF`：米白，压 bg 14.09:1。
 *   - `muted` `#6E6156` → `#C4AE97`：板上 kicker / 脚注那档暖灰，压 bg
 *     7.93:1、压 surface 7.29:1。板上更暗的 caption `#8A7663` 压 bg 只有
 *     3.91:1，承不住 4.5 小字，不采用。
 *   - `border` `#E8DCCB` → `#6B5648`：深底暖界，只给线。
 *   - `chartPalette`：火橙 / 琥珀 / 浅余烬紫 / 暖沙。旧余烬紫 `#6B3F5C`
 *     压炭黑只有 2.01:1，深底上抬到 `#C48AA8` 6.08:1。不进蓝（蓝配橙禁忌
 *     仍在）。
 *
 * 对比度实测（`svg/ink.ts` 的 `contrastRatio`，压 `bg` `#241B14`）：
 * primary/accent 5.18:1、text 14.09:1、muted 7.93:1。白字压火橙 3.27:1、
 * 近黑墨压火橙 5.92:1。压 surface `#2C221A`：text 12.95:1、muted 7.29:1、
 * danger 5.56:1、success 7.04:1（kpi 箭头当字，4.5 门槛）。
 * `assertContrastFloor` 扫的是浅字压深底，四页同炭黑，text / muted 都过 3.0。
 *
 * 封面继续锁 `corner-wedge`。`textAnchor: "start"` 不变。楔收到板上双层：
 * 外 (900,260)、内 (860,212)。内层 knobs 缺省关闭，arena 抽到同一版式时
 * 几何不动。
 *
 * 装饰见 `src/svg/motifs/motif-ember-motif.tsx`（上升火星退役，角楔归版式）。
 */
export const EMBER_TOKENS: StyleTokens = {
  id: "ember",
  colors: {
    bg: "#241B14", // 炭黑舞台
    surface: "#2C221A", // 炭卡，比底亮一档
    primary: "#E56A2C", // 火橙（压 bg 5.18:1，近黑墨压它 5.92:1），校准见文件头
    accent: "#E56A2C", // 与 primary 同一枚火橙，巨号与强调也走它
    text: "#F2E9DF", // 米白（14.09:1）
    muted: "#C4AE97", // 暖灰注脚（7.93:1）
    border: "#6B5648", // 深底暖界
    danger: "#FF6B5C", // 亮余烬红（压 surface 5.56:1），kpi 箭头当字
    warning: "#E8A13C", // 琥珀，只给警示线（压 surface 7.10:1）
    success: "#8FBB70", // 暖苔绿（压 surface 7.04:1），不进蓝
    chartPalette: ["#E56A2C", "#E8A13C", "#C48AA8", "#A89888"], // 火橙/琥珀/浅余烬紫/暖沙
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
  shape: {
    radius: 10,
    gapScale: 1, // 友好圆润（创业路演的亲和感，介于 pulse 的 8 与更方正的既有主题之间）
    cover: {
      textAnchor: "start",
      wedgePeakY: 260,
      wedgeStartX: 900,
      wedgeInnerStartX: 860,
      wedgeInnerPeakY: 212,
    },
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#241B14" },
    chapter: { kind: "color", value: "#241B14" },
    content: { kind: "color", value: "#241B14" },
    ending: { kind: "color", value: "#241B14" },
  },
};
