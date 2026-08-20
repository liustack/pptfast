import type { StyleTokens } from "./tokens";

/**
 * journal（人文期刊）——原 magazine 主题纯改名（2026-07-10 用户裁决拆分：
 * 「现在的人文叙事/年度回顾风格配色和版式根本不是人们潜意识里对杂志的
 * 印象」——暖纸+砖红+宋体报头其实是人文期刊气质，magazine 名字腾给新的
 * 时尚杂志主题）。存量 editorial-serif/anthropic-clay 旧 deck 的 legacy
 * 链随迁指向本主题。
 *
 * **编辑组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group5-editorial-boards.dc.html` 里 `section#g5` journal 的色板角色表
 * + 封面样例）**：journal 拿到的语域是「人文期刊」——主色就是铅字的墨，
 * 配角是木刻藏书章的赭红，整本单色调版画感。这一轮同时给 heritage 让路：
 * 两家都是印刷品语域，此前 journal 的砖红 `#C0392B` 与 heritage 的暖调
 * 撞在同一格；journal 改赭红、装饰改通栏报头双线，heritage 留角花与徽记
 * （分家的另一半在 `motif-corner-ornament-motif.tsx` 的文件头）。逐条来历：
 *   - `bg` `#FAF7F2` → `#EFEBE1`：近白暖纸 → 期刊纸，比 heritage 的灰本白
 *     多一分黄。旧值几乎是白，宋体报头压上去像打印稿不像期刊。
 *   - `surface` `#FFFFFF` → `#F8F5EC`：内页白，跟着纸底暖半档，卡片不再是
 *     纸上贴的一块纯白。
 *   - `primary` `#1A1A1A` → `#2C2C2A`：纯黑 → 铅字黑（略带暖灰）。期刊的
 *     主色就是墨，不是印刷机的绝对黑。实测压 bg 11.75:1（板上自标 12:1），
 *     承白字 13.99:1。
 *   - `accent` `#C0392B` → `#8C4A3C`：砖红 → 赭红（木刻藏书章色），给首
 *     字母与章号。实测压 bg 5.58:1（板上自标 6:1，实测低 0.42 仍在 4.5:1
 *     正文门槛的正确一侧，按本组纪律留板上 hex、把差记在这里）。
 *   - `text` `#1F1F1F` → `#26261F`：油墨（12.79:1，板上自标 13:1），衬线
 *     承字。
 *   - `muted` `#6E6259` → `#626159`：铅灰脱开偏红的暖色相，走中性暖灰。
 *     板上给的 hex 是 `#66655C`，压 bg 只有 4.93:1，而板上自标 5:1——照
 *     「数字赢」压深到 `#626159`（压 bg 5.23:1、压 surface 5.71:1）。压深
 *     的硬理由不是那 0.07，是 `content-matrix` 的三档 tone 混合格底：
 *     `#66655C` 压最难的一档（accent 混 16%，`#e7dad0`）只有 4.28:1，正文
 *     4.5:1 门槛失守，`full-matrix-contrast.test.ts` 的 muted sweep 当场报
 *     红；压深之后三档实测 4.55 / 4.94 / 5.13:1 全过。
 *   - `border` `#E4DCD0` → `#D9D3C2`：栏线压深，栏与栏之间才分得开。
 *   - `chartPalette` 换成板上的单色调版画四色：铅字黑 / 赭红 / 苔绿 /
 *     亚麻灰。实测 11.75 / 5.58 / 5.83 / 3.50:1。
 *
 * **板上 hex 与板上自标数字矛盾时以数字为准**（本组纪律）：亚麻灰板上给
 * 的 hex 是 `#9A927E`，实测压 bg 只有 2.60:1，落在 3.0 装饰可见度线**之
 * 下**，而板上自标 3.5:1。按「数字赢」保色相压明度解到 `#827C6B`（实测
 * 3.50:1），这是 journal 唯一一处照数字改 hex 的格子。
 *
 * chapter 底色仍与正文同纸（`#EFEBE1`），journal 的章节页靠排印分段不靠
 * 满版色块——这也是 `motif-corner-ornament-motif.tsx` 在 journal 上四页型
 * 全画得出的原因（借用它的 luxe/heritage 各自的 chapter 底色不同，见该
 * 文件的 chapter 分支）。
 *
 * 装饰见 `src/svg/motifs/motif-corner-ornament-motif.tsx`（报头双线 v2：
 * 顶缘文武双线 + 底缘单线 + 线上中点期号）——journal 的锚点 motif 是
 * `corner-ornament-motif`，academic / luxe / heritage 三家在各自的候选集里
 * 也借它，本轮换血因此波及那三家的借用页（归因见编辑组报告）。
 */

export const JOURNAL_TOKENS: StyleTokens = {
  id: "journal",
  colors: {
    bg: "#EFEBE1", // 期刊纸——比 heritage 灰本白多一分黄
    surface: "#F8F5EC", // 内页白
    primary: "#2C2C2A", // 铅字黑（11.75:1）——期刊的主色就是墨
    accent: "#8C4A3C", // 赭红（5.58:1），木刻藏书章色，给首字母与章号
    text: "#26261F", // 油墨（12.79:1），衬线承字
    muted: "#626159", // 铅灰（5.23:1）——照板上自标的 5:1 压深，见文件头
    border: "#D9D3C2", // 栏线
    // 铅字黑 / 赭红 / 苔绿 / 亚麻灰——单色调版画感。末格照板上自标的
    // 3.5:1 解出，板上 hex `#9A927E` 实测 2.60:1 过不了 3.0 装饰线。
    chartPalette: ["#2C2C2A", "#8C4A3C", "#4E5E4A", "#827C6B"],
  },
  fonts: {
    // SimSun 前置：导出的 pptx 单字体无法回退。Georgia/serif 是纯拉丁衬线，
    // 无 CJK 字形，中文标题会渲染成豆腐块。CJK 安全衬线白名单里唯一合适
    // 的是 SimSun/宋体，用它承担期刊的报题气质。
    heading: ["SimSun", "宋体", "Georgia", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
    mono: ["Consolas", "Courier New"],
  },
  shape: { radius: 6, gapScale: 1.1 }, // 期刊温和+杂志留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#EFEBE1" },
    chapter: { kind: "color", value: "#EFEBE1" },
    content: { kind: "color", value: "#EFEBE1" },
    ending: { kind: "color", value: "#EFEBE1" },
  },
};
