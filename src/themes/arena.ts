import type { StyleTokens } from "./tokens";

/**
 * arena（竞技场紫黑）——2026-08-21 新增第 18 个内置主题（娱乐电竞）。
 * 性格：开赛前一秒的场馆，紫黑灯灭，电光绿是唯一亮着的 HUD。
 * 目标场景：电竞赛事发布与战报、战队/俱乐部汇报、游戏版本发布与直播活动。
 * 拉伸覆盖音乐演出（场景审计 #28）：accent 电光绿可换成电光紫 `#B48CFF`
 * 或舞台金 `#FFD84D`，速度线束改声波弧（同带同参数），HUD 括弧改圆角即从
 * 「赛场」变「演出」。chart 红蓝对抗位在演出场景退化为双主色。色板角色化，
 * 气质不焊死在 hex 上。
 *
 * 深底第四色温：insight 暖黑 `#0F1216` / tech 蓝黑 `#0A0F1E` / luxe 真黑
 * `#0B0908` 之后，arena 紫黑 `#120B22`。比 campaign `#2A1E3F` 深两档，是
 * 灯灭不是幕布。撞脸自查：arena vs campaign（紫黑灯灭 vs 深紫幕布、HUD
 * 括弧 vs 纸屑场），arena vs tech（速度线 vs 星座链、绿 vs 青）。
 *
 * 逐条来历（设计源 `design-project/skin-boards` 的 arena 板）：
 *   - `bg` `#120B22`：紫黑灯灭。账面上与深底三家互差 ≥1 位色相通道。
 *   - `surface` `#1B1233`：选手席面板，一档抬升。深底主题不出白卡。
 *   - `primary` `#241847`：色块深紫，让电光绿唱主角。横幅/斜楔吃这个角色，
 *     封面上的品红斜楔是 split-diagonal 的 layout 件（layout 零 baked hex，
 *     由 token 上色），不属 motif。
 *   - `accent` `#52F2A8`：电光绿。全部主题中唯一绿系 accent，可直接承大标题。
 *   - `text` `#F2F3F7`：灯光白。
 *   - `muted` `#A79FC4`：观众席紫灰。
 *   - `border` `#3A2D63`：HUD 界线。motif 底能量条后三段取的就是这个角色。
 *   - `chartPalette` 四色：电光绿 / 品红 / 冰蓝 / 电金。红蓝对抗＋金牌位，
 *     胜负语义入图。
 *
 * 对比度实测（本仓库 `svg/ink.ts` 的 `contrastRatio`，压 `bg` `#120B22`。
 * 四页型都是纯色底，`resolveBackgroundHex` 读到的就是这个值）：
 * accent 13.34:1、text 17.27:1、muted 7.66:1（压 surface 7.11:1）、chart
 * 电光绿 13.34 / 品红 6.20 / 冰蓝 9.63 / 电金 13.84。设计板自查写的
 * 12 / 16 / 6.2 / 12·5.5·9·11 与实测同向、略低于实测，以实测为准，
 * 七个 token 与四格 chart 一字未改。
 *
 * `primary` 压 bg 只有 1.18:1 是设计意图，不是缺陷：它是色块底，不是画在
 * bg 上的字。画在 primary 上的字由 `readableOn`/`accessibleInk` 自适应取墨。
 *
 * 装饰见 `../svg/motifs/motif-arena-motif.tsx`（HUD 括弧＋速度线：四角括弧、
 * 左右页缘斜速度线束、底带能量分段条。密页降档撤速度线，只留括弧与能量条）。
 */
export const ARENA_TOKENS: StyleTokens = {
  id: "arena",
  colors: {
    bg: "#120B22", // 紫黑，灯灭
    surface: "#1B1233", // 选手席面板，一档抬升
    primary: "#241847", // 色块深紫（让 accent 唱主角）
    accent: "#52F2A8", // 电光绿（13.34:1）——可直接承大标题
    text: "#F2F3F7", // 灯光白（17.27:1）
    muted: "#A79FC4", // 观众席紫灰（7.66:1）
    border: "#3A2D63", // HUD 界线
    danger: "#FF4D9D", // 品红，与 chartPalette 同一枚（压 surface 5.76:1）
    warning: "#FFD84D", // 电金，与 chartPalette 同一枚（12.86:1）
    success: "#52F2A8", // 电光绿，与 accent 同一枚（12.38:1）
    chartPalette: ["#52F2A8", "#FF4D9D", "#4DC3FF", "#FFD84D"], // 电光绿/品红/冰蓝/电金
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: {
    radius: 10,
    gapScale: 0.9, // HUD 卡片圆角 + tight 留白（比 campaign 的 1.0 再收一档）
    cover: { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 },
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#120B22" },
    chapter: { kind: "color", value: "#120B22" },
    content: { kind: "color", value: "#120B22" },
    ending: { kind: "color", value: "#120B22" },
  },
};
