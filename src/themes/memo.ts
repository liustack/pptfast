import type { StyleTokens } from "./tokens";

/**
 * memo（打字机决定）——2026-08-21 新增第 22 个 theme id（第 21 个结构身份）。
 * 性格：这不是讨论，是已经写下的决定。
 * 目标场景：决策通报、会后 leave-behind、政策落地。页脚、页码、
 * 机构名这些 branding 在一份给人带走的备忘录上是该在的，与 deck 声明
 * `branding: "full"` 天然搭配。搭配写在本注释与 `docs/themes`，引擎不绑定
 * （branding 仍归 deck 声明，本主题的 `brand` 是空对象）。
 *
 * 暖纸三家分家（纸色 + 红怎么用 + 字族）：
 *   - heritage 灰本白 `#F4EDE2` + 藏书票衬线，motif 是顶缘焦糖双线断口嵌章。
 *   - vermilion 公文米白 `#F6EFE3` + 雅黑无衬线，红成面（chapter 整版
 *     `#B02318`，banner-title 红条承白字）。
 *   - memo 便笺纸 `#F6F1E7` + 宋体标题 + 打字机等宽眉行，红成线与字
 *     （accent `#A63A2B` 永不成面）。
 *
 * 红三家纪律（与 swiss 任务书同一把尺，本主题落地的那一格）：
 * vermilion 红成面 `#B02318` / memo 红成线 `#A63A2B` / swiss 红成边
 * `#D7282F`。memo 的印章红只出现在 motif 双线与「MEMORANDUM」眉字，
 * `primary` 是墨不是红，所以 banner-title 抽到时横幅是墨底白字，不是红条。
 *
 * 四轴：L / bottom-left / light / tight。最近邻 consulting
 * （L / BL / light / medium），岔留白轴。封面倾向 banner-title /
 * editorial-masthead（briefing 已锁 banner-title，editorial-masthead 是
 * 真正的边际权重：报头双线构图吃的是本主题的打字机双线，不是 vermilion
 * 的红条）。
 *
 * 逐条来历（设计板 `theme-wave7/Memo.dc.html` 给死五格，其余自推，本仓库
 * `svg/ink.ts` 的 `contrastRatio` 实测）：
 *   - `bg` `#F6F1E7`：便笺纸。比 heritage 灰本白黄一档、比 vermilion 米白
 *     灰一档，三张纸并排缩略图能分开。
 *   - `surface` `#FBF8F1`：衬页，比纸底抬一档。纯白在便笺上是一块冷斑。
 *   - `primary` `#221E18`：墨。唯一允许成面的深色。压 bg 14.72:1，白字压它
 *     16.58:1。与 `text` 同值是故意的：备忘录的结构色就是打字的墨。
 *   - `accent` `#A63A2B`：印章红（5.72:1），只成线与字，永不成面。
 *   - `text` `#221E18`：墨（14.72:1）。
 *   - `muted` `#675E51`：档案褐注脚。板上给 `#6B6255`，压 bg 5.32:1 过正文
 *     门槛，但压 `content-matrix` 的 accent 混 16% 格底只有 4.44:1。照
 *     journal 先例「数字赢」压深到 `#675E51`（压 mix 4.72 / 压 bg 5.66 /
 *     压 surface 6.01）。
 *   - `border` `#E4DFD2`：便笺栏线。
 *   - `chartPalette` 四色：墨 / 印章红 / 档案蓝灰 / 牛皮褐。蓝灰饱和度
 *     0.15、牛皮褐 0.26，都不进蓝橙禁忌的 vivid 带。实测压 bg 14.72 /
 *     5.72 / 6.50 / 5.09:1。白字压四格全过 4.5（people-cards 徽章底）。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#8B2418`：比印章红更沉的朱（8.38:1）。
 *   - `warning` `#8A6230`：牛皮褐压深（5.12:1），只作线与图标。
 *   - `success` `#3F5E48`：档案绿（6.81:1）。
 *
 * 字体：heading SimSun 族（journal / heritage / museum 先例），Windows 安全
 * 面打头保导出无 tofu。body 雅黑。mono 打头 Courier New：设计板 Courier
 * Prime 不在 `SAFE_FONTS`，白名单里的等宽是 Consolas / Courier New /
 * Lucida Console，打字机头行取 Courier New（Consolas 是编程面）。
 * 等宽并未缺席，无需退化成纯双线。
 *
 * 圆角 2 + gapScale 0.9：咨询报告那一档的微圆，留白收到 tight（consulting
 * 是 1.0 的 medium，本主题在最近邻上只岔这一轴）。
 *
 * 装饰见 `../svg/motifs/motif-memo-motif.tsx`（顶部红双线 + Latin 等宽眉字
 * 「MEMORANDUM」。light 档，四页型同一张，单锚不借用）。
 *
 * 板上不做的两件（文件头记录，不进 motif）：
 *   1. 标题「决定」二字下的重笔划线。跟随内容位置，违反恒位纪律。
 *   2. 封面 FROM / RE 打字机落款。那是封面文案，不是页缘装饰。
 *
 * 四页型都走便笺纸，chapter 不整版红（红永不成面，与 vermilion 分家）。
 */
export const MEMO_TOKENS: StyleTokens = {
  id: "memo",
  colors: {
    bg: "#F6F1E7", // 便笺纸
    surface: "#FBF8F1", // 衬页
    primary: "#221E18", // 墨（14.72:1，白字 16.58:1）——唯一成面的深色
    accent: "#A63A2B", // 印章红（5.72:1），只成线与字，永不成面
    text: "#221E18", // 墨（14.72:1）
    muted: "#675E51", // 档案褐注脚（5.66:1）——板上 #6B6255 压 matrix 混色失守，见文件头
    border: "#E4DFD2", // 便笺栏线
    danger: "#8B2418", // 沉朱（压 surface 8.38:1）
    warning: "#8A6230", // 牛皮褐压深（5.12:1），只作线与图标
    success: "#3F5E48", // 档案绿（6.81:1）
    chartPalette: ["#221E18", "#A63A2B", "#4A5864", "#7A6248"], // 墨/印章红/档案蓝灰/牛皮褐
  },
  fonts: {
    // 打字机决定的报题是宋体。SimSun/宋体 是 SAFE_FONTS 里的 CJK 衬线，
    // 放首位保导出。Songti SC/STSong 留作 macOS 预览回退。
    heading: ["SimSun", "宋体", "Songti SC", "STSong", "serif"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    // 设计板 Courier Prime 不在 SAFE_FONTS。白名单等宽三选一，打字机头行
    // 用 Courier New（Consolas 是编程面，不承担公文眉字）。
    mono: ["Courier New", "Consolas"],
  },
  shape: { radius: 2, gapScale: 0.9 }, // 微圆克制 + tight 留白（consulting 同圆角，留白再收一档）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F6F1E7" },
    chapter: { kind: "color", value: "#F6F1E7" },
    content: { kind: "color", value: "#F6F1E7" },
    ending: { kind: "color", value: "#F6F1E7" },
  },
};
