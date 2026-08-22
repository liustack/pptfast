import type { StyleTokens } from "./tokens";

/**
 * consulting（先结论报告）——藏青 + 一线黄的咨询报告腔。
 *
 * **编辑组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group5-editorial-boards.dc.html` 里 `section#g5` consulting 的色板
 * 角色表 + 封面样例）**：编辑组三家都靠排印立身、装饰预算全组最低，
 * consulting 拿到的语域是「先结论的报告腔」——藏青承结构，黄只当一把高亮
 * 尺，全页只许亮一次。逐条来历：
 *   - `bg` `#F7F7F2` → `#F7F6F2`：报告纸白，几乎不动，只把绿味收掉半档
 *     （旧值偏绿，与新藏青同框时纸面发青）。
 *   - `surface` `#FFFFFF` 不变：图表卡仍是纯白，与纸底拉开一档。
 *   - `primary` `#051C2C` → `#1E2A4A`：近黑墨蓝 → 藏青。旧值黑到分不出
 *     色相，横幅、色块、图表首格全靠它，读起来是「黑」不是「藏青」；
 *     提亮偏蓝之后色相立住，实测压 bg 13.07:1（板上自标 12:1），横幅承
 *     白字 14.14:1。
 *   - `accent` `#FFC72C` → `#F5C518`：一线黄压深半档。它的角色本轮写死：
 *     **只作色块与下划，永不承字**——实测压 bg 1.51:1（板上自标 1.6:1），
 *     两个数都远在任何文字门槛之下，这一格是设计意图不是缺陷。
 *   - `text` `#051C2C` → `#1C1E23`：正文从「与 primary 同一格」拆出来。
 *     旧表 text 与 primary 是同一个值，等于正文与结构色不分家；拆开之后
 *     正文是中性墨黑 15.42:1（板上自标 15:1），primary 专职结构。
 *   - `muted` `#6B6B6B` → `#5B6069`：脚注灰脱开纯中性，跟着藏青偏一点蓝。
 *     实测压 bg 5.85:1、压 surface 6.32:1（板上自标 5.5:1）。
 *   - `border` `#D5D5CB` → `#DDDCD4`：表格线，跟着纸底走。
 *   - `chartPalette` 换成板上的四色：藏青 / 高亮黄 / 数据蓝 / 中性灰
 *     ——「黄永远只标一个『所以呢』」。实测 13.07 / 1.51 / 4.47 / 3.81:1。
 *
 * **板上 hex 与板上自标数字矛盾时以数字为准**（本组纪律，前四组同）：
 * chartPalette 两格照数字改了 hex，其余一律留板上的 hex、把实测差记在这里
 * （primary 13.07 vs 12、accent 1.51 vs 1.6、text 15.42 vs 15、muted 5.85
 * vs 5.5）。改的两格：
 *   - **中性灰 `#8B909A` → `#797D86`**：板上 hex 实测压 bg 只有 2.96:1，
 *     落在 3.0 装饰可见度线**之下**，而板上自标 3.8:1。保色相压明度解到
 *     3.81:1。
 *   - **数据蓝 `#3E7CB1` → `#3B76A8`**：这一格不是压 bg 出的事，是压它
 *     自己。`people-cards.tsx` 拿 chartPalette 当头像徽章底、在上面写姓名
 *     首字，墨色走 `readableOn(fill)` 两墨取优——而 `#3E7CB1` 正落在明度
 *     谷底：白压它 4.45:1、近黑压它 4.35:1，**两条路都过不了 4.5:1**，
 *     全库审计因此新增 3 条 low-contrast。压深一档到 `#3B76A8` 之后白墨
 *     4.84:1，压 bg 4.47:1（板上自标 4:1，实测高 0.47，方向安全）。
 *
 * chapter 底色仍取 primary（同 academic/pulse/terra 先例），白字压藏青
 * 14.14:1，`readableOn` 两墨取优后稳态可读。
 *
 * 装饰见 `src/svg/motifs/motif-banner-motif.tsx`（批注线 v2：顶缘藏青细线
 * + 左上黄色高亮块 + 底缘页码线）——consulting 的锚点 motif 是
 * `banner-motif`，academic / enterprise 两家在各自的候选集里也借它，本轮
 * 换血因此波及那两家的借用页（归因见编辑组报告）。
 *
 * 第八波（2026-08-22）：封面锁 `verdict-index`，用 `shape.cover` 的
 * verdict* knobs 把几何收到板上（kicker y150、标题 y304/60、论据
 * y560/592、底线 y640、落款 y676）。色板本轮不动。
 */
export const CONSULTING_TOKENS: StyleTokens = {
  id: "consulting",
  colors: {
    bg: "#F7F6F2", // 报告纸白
    surface: "#FFFFFF", // 图表卡纯白
    primary: "#1E2A4A", // 藏青（13.07:1），横幅承白字 14.14:1
    accent: "#F5C518", // 一线黄（1.51:1）——只作色块与下划，永不承字
    text: "#1C1E23", // 正文黑（15.42:1）
    muted: "#5B6069", // 脚注灰（5.85:1）
    border: "#DDDCD4", // 表格线
    danger: "#B3261E", // 报告红（6.54:1）
    warning: "#9A7404", // 一线黄压到能承线的重量（4.31:1；accent 的 1.51:1 连装饰线都过不了）
    success: "#1F6B52", // 克制森绿（6.40:1）——本板唯一的绿，只给语义
    // 藏青 / 高亮黄 / 数据蓝 / 中性灰。末格照板上自标的 3.8:1 解出，
    // 板上 hex `#8B909A` 实测 2.96:1 过不了 3.0 装饰线——见文件头。
    chartPalette: ["#1E2A4A", "#F5C518", "#3B76A8", "#797D86"],
  },
  fonts: {
    heading: ["Bower", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Bower", "Georgia", "Source Han Serif SC", "serif"],
  },
  shape: {
    radius: 2,
    gapScale: 1, // 微圆克制（咨询报告利落，全推广批次 2026-07-10）
    cover: {
      verdictTitleY: 304,
      verdictTitleSize: 60,
      verdictKickerY: 150,
      verdictColNumY: 560,
      verdictColBodyY: 592,
      verdictFootY: 676,
      verdictFootRule: true,
    },
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F7F6F2" },
    chapter: { kind: "color", value: "#1E2A4A" },
    content: { kind: "color", value: "#F7F6F2" },
    ending: { kind: "color", value: "#F7F6F2" },
  },
};
