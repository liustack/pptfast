import type { StyleTokens } from "./tokens";

/**
 * heritage（典藏传承）——第 8 主题（2026-07-10 用户从视觉伴侣六方向中
 * 追加拍板「勃艮第×焦糖也不错，再加一个」）。轻奢老钱质感，面向品牌传承/
 * 周年庆典/文化品鉴/高端定制场景。
 * 与 magazine 暖纸的区分：主色勃艮第酒红大面积出现（banner/巨号数字）vs
 * magazine 黑标题+砖红点缀。
 * **零版式代码**：沿用原 retail v1 验证过的浅底混搭（creative 家族
 * cover/chapter + consulting 家族 content/ending + two-column 轮换）。
 *
 * **暖纸组皮肤重设计（2026-08-19，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group2-warm-boards.dc.html` 里 heritage 的色板角色表 + 封面样例）**：
 * 暖纸四家共用「暖底浅纸」地基但语域要全岔，heritage 拿到的语域是藏书票
 * ——灰调本白纸 × 压深的勃艮第 × 只走线的焦糖。逐条来历：
 *   - `bg` `#F6F2EC` → `#F4EDE2`：粉调 putty → 灰调本白。putty 的粉在四家
 *     纸色阶梯里与 vermilion 的公文米白（`#F6EFE3`）几乎分不开，灰调本白
 *     把它推到旧籍纸那一端，四档纸色（灰本白/沙/米白/暖白）才互不混淆。
 *   - `surface` `#FFFFFF` → `#FBF6EC`：纯白面板在暖纸上是一块冷斑，衬页米
 *     让卡片读成夹在书里的衬纸。
 *   - `primary` `#7D2A3C` → `#6E1F2A`：勃艮第压深一档。实测压各自 bg 从
 *     8.30:1 抬到 9.54:1——正文级可读，酒红因此能直接当字用，不只当色块。
 *   - `accent` `#C98A4B` → `#B8742C`：焦糖压深。实测 2.61:1 → 3.24:1，跨过
 *     大字/装饰 3:1 线（仍不承正文，纪律不变：焦糖只给线与纹饰）。
 *   - `text` `#33262A` → `#2E2119`：深酒褐 → 烟褐墨，脱开酒红色相，13.40:1。
 *   - `muted` `#786961` → `#6F5F51`：旧墨注脚，5.26:1，仍清 4.5:1 正文门槛。
 *   - `border` `#E8DFD3` → `#DCCDB8`：纸纹线，比旧值再深一档才在灰本白上看得见。
 *   - `chartPalette` 换成古籍四件套：酒红 / 焦糖 / 墨蓝 / 橄榄褐。旧表里的
 *     `#4A6670`/`#A3A38C` 是与藏书票无关的灰青。
 *   - `fonts.heading` 改衬线：设计板的组内互检明写「heritage 衬线、其余
 *     sans」，封面样例的标题是 Songti SC 一路的宋体。首位必须是 Windows
 *     安全面（`svg/fonts.ts` 的 `SAFE_FONTS`，`resolveFontFace` 只取栈里第
 *     一个命中的），所以 `SimSun` 在前、设计稿点名的 `Songti SC`/`STSong`
 *     作 macOS 预览回退。`body` 仍是雅黑无衬线——衬线标题压无衬线正文是
 *     ink v3/luxe v2 已经走过的配法，不是本轮新造。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#F4EDE2`；四页型都是同一个纯色底）：primary 9.54:1、accent 3.24:1、
 * text 13.40:1、muted 5.26:1、chart 酒红 7.31:1 / 焦糖 3.24:1 / 墨蓝 6.89:1 /
 * 橄榄褐 4.49:1。设计板自查写的 primary 9.7 / accent 3.3 / text 13 /
 * muted 5.5 / chart 8·3.3·7·4 与实测各差 0.1-0.7，以实测为准。
 *
 * 装饰见 `src/svg/motifs/motif-heritage-motif.tsx`（藏书票纹饰：顶缘双线 +
 * 两角小角花 + 底缘细线带中点金菱）。
 */
export const HERITAGE_TOKENS: StyleTokens = {
  id: "heritage",
  colors: {
    bg: "#F4EDE2", // 灰调本白（旧籍纸）
    surface: "#FBF6EC", // 衬页米
    primary: "#6E1F2A", // 勃艮第压深一档（9.54:1，可作正文级）
    accent: "#B8742C", // 焦糖只给线与纹饰（3.24:1，不承字）
    text: "#2E2119", // 烟褐墨（13.40:1）
    muted: "#6F5F51", // 旧墨注脚（5.26:1）
    border: "#DCCDB8", // 纸纹线
    danger: "#A32A22", // 古籍朱（6.70:1）——比勃艮第 primary 更红更亮，才叫得响
    warning: "#9A6120", // 焦糖压深（4.75:1）
    success: "#3F6647", // 瓶绿（6.09:1），旧纸上的沉绿
    chartPalette: ["#8A2A38", "#B8742C", "#3F5361", "#7C6A4A"], // 酒红/焦糖/墨蓝/橄榄褐
  },
  fonts: {
    // 藏书票衬线：SimSun/宋体 是 SAFE_FONTS 里的 CJK 衬线，放首位保导出；
    // Songti SC/STSong 是设计稿点名的面，留作 macOS 预览回退。
    heading: ["SimSun", "宋体", "Songti SC", "STSong", "serif"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: {
    radius: 4,
    gapScale: 1.05, // 传统装帧微圆+沉稳
    cover: { textAnchor: "start" },
  },
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F4EDE2" },
    chapter: { kind: "color", value: "#F4EDE2" },
    content: { kind: "color", value: "#F4EDE2" },
    ending: { kind: "color", value: "#F4EDE2" },
  },
};
