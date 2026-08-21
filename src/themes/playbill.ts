import type { StyleTokens } from "./tokens";

/**
 * playbill（荧光嗓门）——2026-08-21 第七波新主题。性格：开演前十分钟的
 * 节目单，荧光黄整版就是装饰，硬黑特粗字是嗓门。目标场景：活动宣发、
 * 招募、音乐节目单。定位 10 页内活动件，不是长汇报。
 *
 * 全仓唯一黄底。crayon 的向日黄 `#F5B700` 只活在 chart 第四格（卡纸奶油
 * 底上的色块，1.68:1，永不承字）。playbill 把荧光黄 `#F4DD1B` 铺成整版
 * 纸，图表里不再出现任何黄。两家不是深浅号，是角色不同。
 *
 * 四轴 C / top-band / heavy / medium。最近邻 vermilion（C / top-band /
 * medium / medium），岔在装饰轴。heavy 的量在字重与满版底色，零粒子零
 * 贴纸。motif 只有右上一方小黑贴片，heavy 不必然等于 motif 重。
 *
 * 逐条来历（设计板 `Playbill.dc.html`，本仓库 `svg/ink.ts` 的
 * `contrastRatio` 压 `bg` `#F4DD1B` 实测）：
 *   - `bg` `#F4DD1B`：荧光黄。整版即装饰。
 *   - `surface` `#FFFFFF`：票根白。板上四色之一，给卡面，不当图表色
 *     （白压黄 1.38:1，色块也看不见）。
 *   - `primary` `#131313`：硬黑。压 bg 13.45:1（板写 12:1 起步，实测更高）。
 *     白字压它 18.58:1。反贴（黑底黄字）吃的就是这枚。
 *   - `accent` `#8B6914`：焦茶。黄纸上的第二嗓门，暖褐一类，不是 crayon
 *     向日黄。压 bg 3.68:1，只给强调词与色块，不作正文。fashion-chapter
 *     满版吃 accent，水印是 accent 与 readableOn 的 22% 实色混合，硬黑
 *     当 accent 时这层混合测得 2.00:1，落在该 layout 已裁定的淡水印带
 *     [1.2, 1.8] 之外。焦茶测得 1.53:1，落在带内。
 *   - `text` `#131313`：同硬黑（13.45:1）。
 *   - `muted` `#6B5E4A`：沥青（4.57:1，压 surface 6.32:1）。
 *   - `border` `#131313`：硬票根线。
 *   - `chartPalette` 四色：反贴黑 / 深灰 / 暖褐 / 焦茶。白只做 surface，
 *     不进图表（1.38:1）。焦茶与 accent 同枚，不是 crayon 向日黄。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#8C1810`：深朱（9.32:1）。
 *   - `warning` `#7A5A18`：焦茶压深（6.36:1），只作线与图标。
 *   - `success` `#3D5A32`：闷橄榄（7.76:1）。
 *
 * 字体：heading 特粗 sans，Microsoft YaHei 打头（板上 900 落地为加粗，
 * 导出走粗/不粗两档）。body 同族。圆角 0 + gapScale 1（medium 留白档）。
 *
 * 装饰见 `../svg/motifs/motif-playbill-motif.tsx`（右上黑贴片斜 4°，
 * 贴片内无字符。板上底部 5px 粗收场线不进 motif）。
 *
 * 可拉伸性：荧光黄即参数（音乐节目单可把 bg 收到暖金 `#E8C40A`，招募
 * 海报可把 primary 收到纯黑 `#0A0A0A`）。贴片几何不动。
 */
export const PLAYBILL_TOKENS: StyleTokens = {
  id: "playbill",
  colors: {
    bg: "#F4DD1B", // 荧光黄——全仓唯一黄底，整版即装饰
    surface: "#FFFFFF", // 票根白（1.38:1 压黄，只做卡面不当图表色）
    primary: "#131313", // 硬黑（压 bg 13.45:1）——反贴与特粗字的嗓门
    accent: "#8B6914", // 焦茶（3.68:1）——强调词与色块，fashion-chapter 满版底
    text: "#131313", // 硬黑正文（13.45:1）
    muted: "#6B5E4A", // 沥青（4.57:1）
    border: "#131313", // 硬票根线
    danger: "#8C1810", // 深朱（压 surface 9.32:1）
    warning: "#7A5A18", // 焦茶压深（6.36:1），只作线与图标
    success: "#3D5A32", // 闷橄榄（7.76:1）
    // 反贴黑 / 深灰 / 暖褐 / 焦茶。白只做 surface。焦茶不是 crayon 向日黄。
    chartPalette: ["#131313", "#3D4248", "#6B5E4A", "#8B6914"],
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: {
    radius: 0,
    gapScale: 1, // medium 留白档（airy 是 1.3，tight 是 0.9）
    // typeScale: 1.3 — 并行分支引入本 token，本 worktree 未落地机制。
    // 合并方 rebase 时接上，不要在本主题实现 typeScale。
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F4DD1B" },
    chapter: { kind: "color", value: "#F4DD1B" },
    content: { kind: "color", value: "#F4DD1B" },
    ending: { kind: "color", value: "#F4DD1B" },
  },
};
