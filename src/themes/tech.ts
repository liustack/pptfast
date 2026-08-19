import type { StyleTokens } from "./tokens";

/**
 * **深底组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group1-dark-boards.dc.html` 色板角色表 + 封面样例）**：深底三家共用
 * 一张脸是本轮的反面基线，tech 的处方是往深空工程走——蓝黑底配青瓷青光，
 * 装饰从「满场随机散点」收编成右缘星座节点链。逐条来历：
 *   - `bg` `#060A13` → `#0A0F1E`：近黑 → 蓝黑深空。与 insight 的暖黑拉开
 *     色温，三家并排时第一眼就能分开。
 *   - `surface` `#0A101C` → `#121A30`：舱内面板蓝，抬升一档（bento 卡底）。
 *   - `primary` `#2DD4E6` → `#14294A`：此前 primary 与 accent 是同一个电光
 *     青（单 accent 重设计的遗留），横幅因此整块发光、`readableOn` 只能靠
 *     深色字勉强站住。primary 退成深蓝，横幅重新承得起反白。
 *   - `accent` `#2DD4E6` → `#53E0D2`：电光青 → 青瓷青光。保住 tech 的色相
 *     记忆，但离开刺眼的纯 cyan。
 *   - `text` `#F2F6FA` → `#EAF1FA`、`muted` `#8A94A6` → `#93A5C0`：冷白与
 *     舱灰，跟着蓝黑底一起偏蓝。
 *   - `border` `#2C3140` → `#24304A`：界格即星轨——motif 的节点连线取的就是
 *     这个角色，界格与装饰同色是这套语言的一部分。
 *   - `chartPalette` 从 5 色（青/绿/橙/紫/灰）收成 4 色冷序列 + 一个告警位：
 *     青 / 蓝 / 紫 / 警示琥珀。灰色 `#4A5568` 在深底上本就接近隐形，删。
 *     motif 的节点也从这条色序取蓝/紫两位，图表与装饰同源。
 *   - `defaultBackgrounds` 四页型统一成设计稿的对角渐变（`#0E1630` →
 *     `#070B16`，封面样例的 `techbg`）。此前 content 与其余三型用的是两组
 *     不同的渐变，设计稿只给一组，不再自造差异。
 *
 * 对比度实测（本仓库 `svg/ink.ts` 的 `contrastRatio`，压渐变起点 `#0E1630`
 * 这个更严的一端——`registerTheme` 的 3:1 硬闸按 `resolveBackgroundHex` 取
 * 渐变 `from`）：text 15.70:1、muted 7.13:1、accent 11.02:1。
 * 压 `bg` `#0A0F1E` 则为 text 16.78:1、muted 7.62:1、accent 11.78:1。
 * 设计板自查写的 muted 6.5:1 低于实测 7.62:1，以实测为准。
 *
 * 装饰见 `src/svg/motifs/motif-constellation-motif.tsx`（星座链 v2：右缘
 * 节点链 + 顶带疏星 + cover/chapter 双轨道弧）。
 */
export const TECH_TOKENS: StyleTokens = {
  id: "tech",
  colors: {
    bg: "#0A0F1E", // 蓝黑深空
    // No `panel` override (Task 1, electric-cyan single-accent redesign):
    // the old lighter-than-surface "card-on-card" tier read as a muddy
    // blue-grey that fought the new near-black system, so bento now falls
    // back to `colors.surface` for its card fill like most of the other
    // theme token files already do (only `custom` sets a distinct `panel`).
    surface: "#121A30", // 舱内面板蓝
    primary: "#14294A", // 横幅深蓝（承 readableOn 反白）
    accent: "#53E0D2", // 青瓷青光
    text: "#EAF1FA", // 冷白
    muted: "#93A5C0", // 舱灰注脚（压 bg 7.62:1，压渐变起点 7.13:1）
    border: "#24304A", // 界格即星轨（motif 连线同色）
    chartPalette: ["#53E0D2", "#5B8CFF", "#9A7CFF", "#FFC14D"], // 冷序列三位 + 警示琥珀
  },
  fonts: {
    // Microsoft YaHei 前置：导出的 pptx 单字体无法回退，纯拉丁 sans 无 CJK
    // 字形会渲染成豆腐块。雅黑承担 tech 的科技感无衬线气质。
    heading: ["Microsoft YaHei", "Helvetica Neue", "Helvetica", "Inter", "Arial", "system-ui"],
    body: [
      "Microsoft YaHei",
      "Helvetica Neue",
      "Helvetica",
      "Inter",
      "Arial",
      "system-ui",
    ],
    mono: ["Consolas", "Courier New"],
  },
  shape: { radius: 10, gapScale: 1 }, // bento 圆润（科技卡片感）
  defaultBackgrounds: {
    cover: { kind: "gradient", from: "#0E1630", to: "#070B16", direction: "diagonal" },
    chapter: { kind: "gradient", from: "#0E1630", to: "#070B16", direction: "diagonal" },
    content: { kind: "gradient", from: "#0E1630", to: "#070B16", direction: "diagonal" },
    ending: { kind: "gradient", from: "#0E1630", to: "#070B16", direction: "diagonal" },
  },
};
