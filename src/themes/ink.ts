import type { StyleTokens } from "./tokens";

/**
 * ink（水墨国风）——2026-07-10 用户裁决新增的「真创意」子类之二（用户
 * 点名的古风/中国风例子）。宣纸米底 + 墨黑 + 朱砂红 + 楷体标题（KaiTi
 * 在 CJK 导出安全白名单内），面向传统文化/节日/国潮/茶酒场景。
 *
 * **v3 重设计（2026-08-18，`.issues/2026-08-18-theme-redesign/ink/decisions.md`
 * 的 1a「素」方向，马远式克制）**：色板整体提亮半档、把墨压到焦墨、把
 * 留白拉开。逐条来历：
 *   - `bg` `#F5F0E6` → `#F7F2E7`：宣纸底再亮一点，给焦墨标题让出对比空间。
 *     `defaultBackgrounds` 四页型同步（这四条本来就是 `bg` 的复制，
 *     `full-slide-svg.tsx` 真正画的是它们，改 `bg` 不同步等于没改）。
 *   - `surface` `#FBF8F1` → `#FCF9F2`：面板比纸底再白一档，卡片边界靠明度
 *     差而不是描边说话。也是 InkMotif 印章内嵌白描边取的色。
 *   - `primary` `#2B2B2B` → `#1F1C18`：中性炭灰 → 带暖调的焦墨。水墨的黑
 *     从来不是纯灰，偏暖才像墨。
 *   - `border` `#DED5C2` → `#DCD2BD`：分隔线随纸底一起压暗半档，免得在更亮
 *     的底上糊掉。
 *   - `chartPalette` 首色跟着 `primary` 走（`#2B2B2B` → `#1F1C18`），其余
 *     三色不动——它们本来就是这个主题的墨/朱砂/褐/黄土四色序列。
 *   - `shape.gapScale` 1.15 → 1.3：分配表给 ink 的留白档位是 airy
 *     （`structure-map.md` 定稿分配表），1.15 只到 medium。
 *   - `text` `#262421` 与 `accent` `#C3272B` **不动**：焦墨正文与朱砂在 1a
 *     方向里原样保留。
 *
 * 对比度实测（新底 `#F7F2E7`，`registerTheme` 的 3:1 硬闸与
 * `full-matrix-contrast.test.ts` 的 4.5:1 muted 线都要过）：
 * text 13.86:1、muted 5.54:1、primary 15.20:1、accent 5.16:1。
 *
 * 装饰见 `src/svg/motifs/motif-ink-motif.tsx`（v3：右缘落款列 + 一角残山），
 * 封面见 `src/svg/layouts/cover-colophon.tsx`。
 */
export const INK_TOKENS: StyleTokens = {
  id: "ink",
  colors: {
    bg: "#F7F2E7", // 宣纸米（v3 提亮半档）
    surface: "#FCF9F2",
    primary: "#1F1C18", // 焦墨（v3：中性炭灰 → 暖调焦墨）
    accent: "#C3272B", // 朱砂
    text: "#262421",
    muted: "#686056", // post-v0.3 W8 fix round补测（backlog 5a，content-matrix 色调混合格底色缺口，task-2 审校发现）：明度再下调校准 4.5:1（原 #756C60 为首轮校准值，更早为 #8A8071，保色相/饱和度）。v3 换底后复测 5.54:1，仍过线，不动。
    border: "#DCD2BD",
    chartPalette: ["#1F1C18", "#C3272B", "#8A8071", "#B5A36F"],
  },
  fonts: {
    heading: ["KaiTi", "楷体", "SimSun", "宋体", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 8, gapScale: 1.3 }, // 圆角柔和（水墨无锋，用户裁决）+ v3 留白拉到 airy 档
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F7F2E7" },
    chapter: { kind: "color", value: "#F7F2E7" },
    content: { kind: "color", value: "#F7F2E7" },
    ending: { kind: "color", value: "#F7F2E7" },
  },
};
