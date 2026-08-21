import type { StyleTokens } from "./tokens";

/**
 * stage（黑场）——2026-08-21 新增第 21 个 theme id（第 20 个结构身份。
 * bloom 仍是 classroom 的换色）。性格：灯灭之后只剩一句话。
 * 目标场景：产品发布会、主题演讲、keynote 式叙事。极简版式家族
 * statement / pull-quote 的天然宿主（版式本轮不动，倾向只用现有池）。
 *
 * 深底第六色温：insight 暖黑终端 `#0F1216` / tech 蓝黑 `#0A0F1E` / luxe
 * 真黑 `#0B0908` / arena 紫黑 `#120B22` / museum 棕黑厅堂 `#211A12` 之后，
 * stage 青灰黑 `#141C22`（RGB 20,28,34，H 205.7）。真黑位已被 luxe 占，
 * stage 用投影还开着时的黑场，缩略图里是青灰的那一块黑。
 *
 * 无框：不注册 motif。runway 已占 L / bottom-left / none / airy，stage
 * 走 C / bottom-right / none / airy，heading 与 meta 都岔开。luxe 是
 * C / bottom-right / light / airy，两家只在 decor 分叉（无框对请柬框）。
 *
 * 逐条来历（Jobs / keynote 黑场只作起点，hex 自推，本仓库 `svg/ink.ts`
 * 的 `contrastRatio` 压 `bg #141C22` 实测）：
 *   - `bg` `#141C22`：青灰黑。
 *   - `surface` `#1C262E`：一档抬升。深底不出白卡。
 *   - `primary` `#222C34`：深色块，让冰蓝唱主角。白字压 primary 14.21:1。
 *   - `accent` `#6BB7E8`：冰蓝聚光（H 203.5）。避开 luxe 香槟金 / museum
 *     铜金 / insight 琥珀 / tech 瓷青 / arena 电光绿。压 bg 7.85:1，
 *     可直接承大标题。
 *   - `text` `#F2F4F6`：冷白（15.63:1）。
 *   - `muted` `#9AA7B2`：冷灰注脚（7.01:1）。
 *   - `border` `#2C3840`：暗缝。
 *   - `chartPalette` 四色：冰蓝 / 冷银 / 青 / 冷石板。accent 已是 vivid
 *     blue，四格无一格 vivid orange，不进蓝橙禁忌。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#E07080`：冷玫瑰（4.98:1），H 351，不进橙带。
 *   - `warning` `#A8B8C4`：冰灰（7.55:1），只作线与图标，不进金家族。
 *   - `success` `#5AAA8A`：闷海绿（5.53:1），不是 arena 电光绿。
 *
 * 字体：sans，发布会语域。Microsoft YaHei 打头保导出无 tofu。圆角 0 +
 * gapScale 1.3（airy 档，ink / museum 同值）。
 *
 * 装饰：无。`THEME_DEFINITIONS.stage.motif` 留空，照 runway 先例。
 * 无框就是身份，一件极轻的框都会把黑场读成 luxe / museum 的亲戚。
 *
 * 可拉伸性：冰蓝即参数（品牌发布会可换成品牌色，仍避开金 / 琥珀 / 瓷青）。
 * none 不升级成 motif。黑场可再收，但不抢 luxe 的 `#0B0908`。
 */
export const STAGE_TOKENS: StyleTokens = {
  id: "stage",
  colors: {
    bg: "#141C22", // 青灰黑——H 205.7，与 insight 终端暖黑 / luxe 真黑岔开
    surface: "#1C262E", // 一档抬升
    primary: "#222C34", // 深色块（让 accent 唱主角，白字 14.21:1）
    accent: "#6BB7E8", // 冰蓝聚光（7.85:1）——避开金 / 琥珀 / 瓷青 / 电光绿
    text: "#F2F4F6", // 冷白（15.63:1）
    muted: "#9AA7B2", // 冷灰注脚（7.01:1）
    border: "#2C3840", // 暗缝
    danger: "#E07080", // 冷玫瑰（压 surface 4.98:1）
    warning: "#A8B8C4", // 冰灰（7.55:1），只作线与图标
    success: "#5AAA8A", // 闷海绿（5.53:1）
    chartPalette: ["#6BB7E8", "#C5D0D8", "#4A9AAA", "#8B9EAA"], // 冰蓝/冷银/青/冷石板
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 0, gapScale: 1.3 }, // keynote 直角 + airy 黑场留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#141C22" },
    chapter: { kind: "color", value: "#141C22" },
    content: { kind: "color", value: "#141C22" },
    ending: { kind: "color", value: "#141C22" },
  },
};
