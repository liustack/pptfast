import type { StyleTokens } from "./tokens";

/**
 * luxe（高端品牌）——原 retail 主题改名+黑金重定位（2026-07-10 用户视觉
 * 伴侣裁决：配色选「高级黑金」方向，且 retail 名字不够高级）。
 * 奢侈品/美妆大牌/年会盛典气质。存量 retail deck 经 LEGACY_THEME_MAP
 * 兜底解析到本主题。
 * **零版式代码**：全部借用 creative 家族深底版式（poster 系）+ 共享
 * two-column/split-diagonal。
 * 对比度约束：banner-heading 的横幅文字是 baked 白字，金色横幅上白字
 * 不可读——manifest 的 content 集**禁配 banner-heading**，用深底安全的
 * stacked-poster/two-column。
 *
 * **深底组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group1-dark-boards.dc.html` 色板角色表 + 封面样例）**：深底三家共用
 * 一张脸是本轮的反面基线，luxe 的处方是往请柬走——真黑烫金 + 衬线标题 +
 * 双层金框。逐条来历：
 *   - `bg` `#161310` → `#0B0908`：深炭 → 暖调真黑。炭灰不够黑，请柬的
 *     底必须黑到让金线自己发光；暖调（而非中性黑）与 insight 的暖黑终端底
 *     仍有区别，后者偏青。
 *   - `surface` `#211D18` → `#14110E`：丝绒面板，抬升几不可察。奢侈品
 *     不靠卡片边界说话。
 *   - `primary` `#D4B876` → `#171310`：此前 primary 是亮金、accent 是深铜金
 *     ——两个金撞在一起，色块一铺就是一片俗气的金面。primary 退到与底
 *     几乎同黑，金色只留给线与字。
 *   - `accent` `#A67B45` → `#C6A15B`：深铜金 → 香槟金。压 bg 实测 8.19:1，
 *     够格直接写大标题，深铜金原本只有 4.4:1，做标题勉强。
 *   - `text` `#F4EDDF` → `#F5EFE3`、`muted` `#9C9386` → `#A89A82`：象牙白
 *     与旧金注脚，跟着真黑底微调。
 *   - `border` `#3A342C` → `#2E2822`：暗檀分隔——表格里金线只留给合计行，
 *     普通分隔不许用 accent。
 *   - `chartPalette` 全换成单色系渐层：香槟 / 象牙纱 / 古铜 / 灰蓝。
 *     图表也守请柬的静，不再出现 `#8C9A8E` 那种与金毫无关系的灰绿。
 *   - `fonts.heading` 改衬线（`SimSun`/`宋体` 打头）：设计稿的标题是
 *     Songti SC 一路的宋体气质。首位必须是 Windows 安全面（`svg/fonts.ts`
 *     的 `SAFE_FONTS`，`resolveFontFace` 只取栈里第一个命中的），所以
 *     `SimSun` 在前、设计稿点名的 `Songti SC`/`STSong` 作 macOS 预览回退。
 *     `body` 仍是雅黑无衬线——衬线标题压无衬线正文是 ink v3 已经走过的
 *     配法（`ink.ts`：heading KaiTi / body 雅黑），不是本轮新造。
 *
 * 对比度实测（本仓库 `svg/ink.ts` 的 `contrastRatio`，压 `bg` `#0B0908`；
 * 四页型都是纯色底，`resolveBackgroundHex` 读到的就是这个值）：
 * text 17.35:1、muted 7.20:1、accent 8.19:1、chart 古铜 4.23:1、
 * chart 灰蓝 4.98:1。设计板自查写的古铜 3.6:1 / 灰蓝 4.4:1 低于实测，
 * accent 8:1 与 muted 7:1 与实测一致，以实测为准。
 *
 * 装饰见 `src/svg/motifs/motif-luxe-motif.tsx`（请柬金框：双层金框 + 框顶
 * 金菱）。
 */
export const LUXE_TOKENS: StyleTokens = {
  id: "luxe",
  colors: {
    bg: "#0B0908", // 暖调真黑
    surface: "#14110E", // 丝绒面板（抬升几不可察）
    primary: "#171310", // 与底几乎同黑——奢侈品不用色块喊话
    accent: "#C6A15B", // 香槟金（压 bg 8.19:1，可作大标题）
    text: "#F5EFE3", // 象牙白
    muted: "#A89A82", // 旧金注脚（7.20:1）
    border: "#2E2822", // 暗檀分隔
    chartPalette: ["#C6A15B", "#E5DAC2", "#8C6F45", "#77808E"], // 香槟 / 象牙纱 / 古铜 / 灰蓝
  },
  fonts: {
    // 请柬衬线：SimSun/宋体 是 SAFE_FONTS 里的 CJK 衬线，放首位保导出；
    // Songti SC/STSong 是设计稿点名的面，留作 macOS 预览回退。
    heading: ["SimSun", "宋体", "Songti SC", "STSong", "serif"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 1.1 }, // 黑金直角凌厉+呼吸感（spec 提案，2026-07-10）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#0B0908" },
    chapter: { kind: "color", value: "#0B0908" },
    content: { kind: "color", value: "#0B0908" },
    ending: { kind: "color", value: "#0B0908" },
  },
};
