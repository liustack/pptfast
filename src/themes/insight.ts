// insight（深度洞察）——原 creative 改名（2026-07-10 用户裁决：深底红金
// 气质其实是 Bloomberg/Economist 财经信息图风，不配叫 creative；真正的
// 创意子类由 doodle/ink 两新主题承接）。
import type { StyleTokens } from "./tokens";

/**
 * **深底组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group1-dark-boards.dc.html` 色板角色表 + 封面样例）**：深底三家
 * （insight / tech / luxe）此前共用「深底 + 左竖条 + 左上标题」一张脸，
 * covers-review 把它记成反面基线。insight 的处方是往行情屏走——暖黑终端底
 * 配终端琥珀，装饰换成「行情语汇」。逐条来历：
 *   - `bg` `#0A0A0C` → `#0F1216`：中性死黑 → 暖黑终端底。死黑没有色温，
 *     三家并排时分不出谁是谁；暖黑与 tech 的蓝黑、luxe 的真黑各占一档。
 *   - `surface` `#14141A` → `#171C22`：数据面板跟着底色转暖，仍只抬一档，
 *     深底主题不出白卡。
 *   - `primary` `#E63946` → `#16202B`：正红 → 墨蓝。红色横幅在深底上抢走
 *     所有注意力，accent 反而没了位置；primary 退成墨蓝色块，让琥珀唱主角。
 *   - `accent` `#D4A57C` → `#F0A63C`：奶茶褐 → 终端琥珀。琥珀是行情屏的
 *     行业记忆色，也是这套装饰语言（刻度齿 / 基线面积线）的唯一着色。
 *   - `text` `#F5F5F5` → `#F2EFE8`：冷白 → 暖纸白，跟着底色的色温走。
 *   - `muted` `#93939C` → `#9AA7B4`：中性灰 → 青灰，注脚也进色温体系。
 *   - `border` `#2A2A2E` → `#2A3440`：行情表格线，暗而可辨；motif 顶缘
 *     双细线取的就是这个角色。
 *   - `chartPalette` 全换：琥珀主序 + 涨绿 + 跌红 + 中性青灰——财经图表的
 *     涨跌语义直接进色序，不再是「红/褐/灰/白」的无语义排列。
 *   - `defaultBackgrounds` 四页型从纯色改成竖向渐变（`#151B23` → `#0C1016`，
 *     封面样例的 `insbg`）：`full-slide-svg.tsx` 真正画的是这四条，`bg`
 *     token 只喂组件——两者都要改，只改一个等于没改（ink v3 同一条教训）。
 *
 * 对比度实测（本仓库 `svg/ink.ts` 的 `contrastRatio`，压渐变起点 `#151B23`
 * 这个更严的一端；`registerTheme` 的 3:1 硬闸按 `resolveBackgroundHex` 取
 * 渐变 `from`，所以这一列才是闸门实际读的数）：
 * text 15.08:1、muted 7.06:1、accent 8.43:1。压 `bg` `#0F1216` 则为
 * text 16.35:1、muted 7.65:1、accent 9.14:1。
 * 设计板自查写的 muted 7.8:1 略高于实测 7.65:1，以实测为准，仍远高于 4.5:1。
 *
 * 装饰见 `src/svg/motifs/motif-poster-motif.tsx`（行情语汇 v4：整套收进顶缘
 * y<34 空带——上檐线 + 行情轴 + 骑在轴上的走线与刻度齿，另加封面幽灵季度
 * 水印，下半页一件不留）。
 */
export const INSIGHT_TOKENS: StyleTokens = {
  id: "insight",
  colors: {
    bg: "#0F1216", // 暖黑终端底
    surface: "#171C22", // 数据面板（抬一档）
    primary: "#16202B", // 墨蓝色块（让 accent 唱主角）
    accent: "#F0A63C", // 终端琥珀
    text: "#F2EFE8", // 暖纸白
    muted: "#9AA7B4", // 青灰注脚（压 bg 7.65:1，压渐变起点 7.06:1）
    border: "#2A3440", // 行情表格线
    danger: "#D95D4E", // 跌红，与 chartPalette 同一枚（压 surface 4.59:1）
    warning: "#E0863A", // 深琥珀（6.23:1），与终端琥珀 accent 拉开一档
    success: "#2FA97C", // 涨绿，与 chartPalette 同一枚（5.78:1）
    chartPalette: ["#F0A63C", "#2FA97C", "#D95D4E", "#7E93A8"], // 琥珀 / 涨绿 / 跌红 / 中性青灰
  },
  fonts: {
    heading: ["Lora", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Inter", "system-ui"],
  },
  shape: { radius: 2, gapScale: 0.95 }, // 信息图利落+数据密度
  defaultBackgrounds: {
    cover: { kind: "gradient", from: "#151B23", to: "#0C1016", direction: "tb" },
    chapter: { kind: "gradient", from: "#151B23", to: "#0C1016", direction: "tb" },
    content: { kind: "gradient", from: "#151B23", to: "#0C1016", direction: "tb" },
    ending: { kind: "gradient", from: "#151B23", to: "#0C1016", direction: "tb" },
  },
};
