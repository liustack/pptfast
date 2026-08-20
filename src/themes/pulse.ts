import type { StyleTokens } from "./tokens";

/**
 * pulse（医疗健康/生命科学）——2026-07-28 themes-16 wave task T1（第 14
 * 主题）。用户拍板方向：13 个内置主题里没有一个青绿清洁诊疗气质，覆盖
 * 体检报告/医院介绍/生物医药 BD 场景。极浅薄荷白底 + 深青绿主色，气质
 * 一句话：清洁、可信、生命力（.issues/2026-07-28-themes-16/plan.md 裁定 1）。
 *
 * **冷调组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group3-cool-boards.dc.html` 里 pulse 的色板角色表 + 封面样例）**：
 * pulse 在冷调三家里拿到的语域是「清洁诊疗」——诊室晨光的薄荷白，全程冷
 * 配角。这一轮最要紧的一件事是拆青绿双胞胎：pulse 与 academic 的 primary
 * 肉眼几乎同色，板上的解法是底色与配角系统反向拉开（pulse 偏蓝 + 全冷
 * 配角、薄荷冷底；academic 偏绿 + 学者金暖配角、象牙暖底）。逐条来历：
 *   - `bg` `#F4F9F8` → `#F2F7F4`：薄荷白往绿里挪半档。旧值偏蓝灰，新值是
 *     诊室晨光；与 academic 的暖象牙 `#F5F3EC` 色温相反，这是双胞胎拆分的
 *     第一处可辨点。
 *   - `surface` `#FFFFFF` → `#FBFDFC`：净白面板。纯白在薄荷底上显硬，压
 *     半档之后卡与墙才是同一间屋子里的两样东西。
 *   - `primary` `#0E6E66` → `#0E6B5C`：深青绿偏蓝一档，实测压 bg 5.92:1
 *     （板上自标 5.5:1）。与 academic 的 `#0E6245`（偏绿）分家。
 *   - `accent` `#F4A259` → `#3D9B82`：暖琥珀 → 浅青。**这是双胞胎拆分的
 *     主要手段**：pulse 从此全程冷配角，暖色一律不出场；academic 那边反过来
 *     用学者金作暖配角。浅青只给线与点，实测 3.12:1（板上自标 3.1:1）。
 *   - `text` `#10312E` → `#1E2B27`：墨青 → 墨绿黑，13.56:1。
 *   - `muted` `#5A6E6A` → `#5A6C66`：手术服灰。**设计板给的是 `#5C6E68`，
 *     实测压 bg 4.99:1、压 surface 5.29:1 都过，但压 `content-matrix` 组件
 *     的 accent tone 混合格底（`mixHex(surface, accent, 0.16)` 混出的
 *     `#DDEDE8`，`components/matrix.tsx` 的 `toneFill`）只有 4.47:1——跌破
 *     4.5:1 正文门槛，`full-matrix-contrast.test.ts` 的 `colors.muted
 *     component-type coverage` 实测报红。按同色相压暗一档到 `#5A6C66`
 *     （consulting muted `#6C6C6C`→`#6B6B6B`、terra `#6B675A`→`#656155`
 *     的同一条校准先例）：压 bg 5.14:1、压 surface 5.45:1、压三档 tone
 *     格底 4.60/4.84/4.90:1，全部过线——5.14 正是设计板自己写的「5:1」，
 *     板上的 hex 与板上的数字对不上时按数字走。
 *   - `border` `#D9E6E3` → `#D5E2DC`：病历线。
 *   - `chartPalette` 换成板上的临床冷静序列：青绿 / 浅青 / 静脉蓝 / 警示褐。
 *     实测压 bg 5.92 / 3.12 / 3.88 / 3.52:1，四格全过 3.0 装饰线。旧表的
 *     琥珀 `#F4A259` 随 accent 一并退役（暖色不再出场），砂灰 `#B8AD98`
 *     压新底只有 2.06:1，是旧四色里唯一读不出来的一格。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#F2F7F4`）：primary 5.92:1、accent 3.12:1、text 13.56:1、muted 5.14:1
 * （压 surface 5.45:1）、chart 青绿 5.92 / 浅青 3.12 / 静脉蓝 3.88 / 警示褐
 * 3.52。设计板自查写的 5.5 / 3.1 / 13 / 5 / 5.5·3.1·4·3.5 与实测同向
 * （静脉蓝一格实测 3.88 略低于板上 4，仍过 3.0 装饰线），以实测为准。
 *   - chapter 底色取 primary（同 academic/consulting/terra 先例），白字对
 *     primary 6.41:1，`readableOn` 自适应两墨取优后稳态可读。
 *
 * 装饰见 `src/svg/motifs/motif-pulse-motif.tsx`（脉搏线 v2：顶缘一条极细
 * 心电线 + 右缘细胞轮廓点簇）。
 */
export const PULSE_TOKENS: StyleTokens = {
  id: "pulse",
  colors: {
    bg: "#F2F7F4", // 薄荷白，诊室晨光
    surface: "#FBFDFC", // 净白面板
    primary: "#0E6B5C", // 深青绿偏蓝（5.92:1）——与 academic 的绿分家
    accent: "#3D9B82", // 浅青（3.12:1，只给线与点，不作正文色）
    text: "#1E2B27", // 墨绿黑（13.56:1）
    muted: "#5A6C66", // 手术服灰（5.14:1），校准记录见文件头注释
    border: "#D5E2DC", // 病历线
    danger: "#B3282B", // 诊室红（6.32:1）
    warning: "#B9722F", // 警示褐，与 chartPalette 同一枚（3.73:1，只作线与图标）
    success: "#157A52", // 青绿偏绿（5.22:1），与 primary 同族
    chartPalette: ["#0E6B5C", "#3D9B82", "#4A7FB5", "#B9722F"], // 青绿/浅青/静脉蓝/警示褐
  },
  // Microsoft YaHei first (not Segoe UI): resolveFontFace picks the first
  // SAFE_FONTS match, and only Georgia/Microsoft YaHei carry an exact
  // per-character width table (`hasExactWidthTable`, `src/lib/svg-text-
  // layout.ts`) — every other builtin's body face already resolves to one
  // of those two, and `definitions.test.ts`'s registerTheme console.warn
  // regression test pins that invariant across all builtins. Segoe UI stays
  // in the stack as the clean-sans flavor cue (brief's own example), just
  // not first.
  fonts: {
    heading: ["Microsoft YaHei", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Segoe UI", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 8, gapScale: 1 }, // 圆润可亲（体检报告/诊所品牌的亲和感）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F2F7F4" },
    chapter: { kind: "color", value: "#0E6B5C" },
    content: { kind: "color", value: "#F2F7F4" },
    ending: { kind: "color", value: "#F2F7F4" },
  },
};
