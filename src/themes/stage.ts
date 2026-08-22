import type { StyleTokens } from "./tokens";

/**
 * stage（黑场）——2026-08-21 新增第 21 个 theme id（第 20 个结构身份）。
 * 性格：灯灭之后只剩一句话。
 * 目标场景：产品发布会、主题演讲、keynote 式叙事。极简版式家族
 * statement / pull-quote 的天然宿主（版式本轮不动，倾向只用现有池）。
 *
 * v2b 重肤（2026-08-21，设计定稿 `theme-wave7/Main.dc.html`）：冷玄黑
 * 单色系，旧 v1 冰蓝 `#6BB7E8` 全线退役。结构行不动（C / bottom-right /
 * none / airy，封面 poster-center / tone-adaptive-header，无 motif）。
 *
 * 与 luxe 分家（同是深底、同是 C / bottom-right，不能塌成一家）：
 *   - 底：stage 冷玄黑 `#0F0F12`（15,15,18，B ≥ R）对 luxe 暖真黑
 *     `#0B0908`（11,9,8，R > B）。RGB 距离 12.3，缩略图里是冷的那一块。
 *   - 字族：stage 标题雅黑无衬线，luxe 标题 SimSun 衬线。
 *   - 强调色：stage 哑银金属灰（H ~39、S ~0.11），luxe 香槟金
 *     `#C6A15B`（H 39.3、S 0.48）。色相近但饱和度差一截，不是金。
 *
 * 板上「然后呢」斜体气口词是封面排印签名。引擎现无 heading 内混排
 * 机制，记录为不做，不硬造。板上 heading 100 细字重落地为不加粗
 *（导出只有粗/不粗两档），版式各自写 `fontWeight`（poster-center 仍
 * 是 800，statement 已是 500）。本轮不新开 headingWeight 杠杆。
 *
 * 逐条来历（本仓库 `svg/ink.ts` 的 `contrastRatio` 压 `bg #0F0F12`
 * 实测，语义三色压 `surface`）：
 *   - `bg` `#0F0F12`：冷玄黑。
 *   - `surface` `#1A1A1F`：一档冷抬升。深底不出白卡。
 *   - `primary` `#1E1E22`：深色块，让哑银唱主角。白字压 primary 14.49:1。
 *   - `accent` `#C4BFB6`：哑银（10.46:1），可直接承大标题。
 *   - `text` `#F3EFE7`：暖纸白（16.69:1），板上正文色。
 *   - `muted` `#B0A694`：暖砂注脚。板上 `#8E8778` 压 bg 5.36:1，但
 *     matrix 格子的 tone 混合底 `#353437` 上只有 3.47:1，过不了 4.5。
 *     同色相提亮后压 bg 7.95:1、压最深格子 5.14:1。更深一档 `#6F6A61`
 *     （3.56:1）只作层次注释，不另开 token。
 *   - `border` `#4A463F`：发丝线。
 *   - `chartPalette` 四色：哑银 `#C4BFB6`（10.46:1）/ 暖砂 `#B8A888`
 *     （8.20:1）/ 石墨 `#6F6A61`（3.56:1，板上第二档 muted）/ 钢灰
 *     `#8A96A2`（6.35:1）。全低饱和，无一格饱和彩，不进蓝橙禁忌。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#B88880`：铁锈（5.67:1）。
 *   - `warning` `#C4B49A`：暖砂（8.54:1），只作线与图标。
 *   - `success` `#8A9480`：钢青苔（5.47:1）。
 *
 * 字体：sans，发布会语域。Microsoft YaHei 打头保导出无 tofu。圆角 0 +
 * gapScale 1.3（airy 档）+ typeScale 1.5（标题/展示级，fit 仍兜底缩字）。
 *
 * 装饰：无。`THEME_DEFINITIONS.stage.motif` 留空，照 runway 先例。
 * 无框就是身份，一件极轻的框都会把黑场读成 luxe / museum 的亲戚。
 */
export const STAGE_TOKENS: StyleTokens = {
  id: "stage",
  colors: {
    bg: "#0F0F12", // 冷玄黑——B≥R，与 luxe 暖真黑 #0B0908 分家
    surface: "#1A1A1F", // 一档冷抬升
    primary: "#1E1E22", // 深色块（让 accent 唱主角，白字 14.49:1）
    accent: "#C4BFB6", // 哑银（10.46:1）——旧冰蓝 #6BB7E8 退役
    text: "#F3EFE7", // 暖纸白（16.69:1）
    muted: "#B0A694", // 暖砂注脚（7.95:1，板上 #8E8778 在 matrix 格子上不够）
    border: "#4A463F", // 发丝线
    danger: "#B88880", // 铁锈（压 surface 5.67:1）
    warning: "#C4B49A", // 暖砂（8.54:1），只作线与图标
    success: "#8A9480", // 钢青苔（5.47:1）
    chartPalette: ["#C4BFB6", "#B8A888", "#6F6A61", "#8A96A2"], // 哑银/暖砂/石墨/钢灰
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 0, gapScale: 1.3, typeScale: 1.5 }, // keynote 直角 + airy + 标题 1.5×
  defaultBackgrounds: {
    cover: { kind: "color", value: "#0F0F12" },
    chapter: { kind: "color", value: "#0F0F12" },
    content: { kind: "color", value: "#0F0F12" },
    ending: { kind: "color", value: "#0F0F12" },
  },
};
