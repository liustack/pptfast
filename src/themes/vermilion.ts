import type { StyleTokens } from "./tokens";

/**
 * vermilion（庄重公务汇报——工作汇报/述职/年度总结语域）——2026-08-06 gov-theme
 * wave（第 17 个内置主题，也是第一个从立项就以中文语域为主的主题，plan
 * `.issues/2026-08-06-gov-theme/plan.md`）。现有 16 主题无一覆盖庄重红金公务
 * 语域（ink 是文人水墨、heritage 是酒红典藏西式、campaign 是营销紫）。正红
 * #C8102E 主色 + 金黄 #D4A017 强调 + 暖米白底 + SimSun 霸屏大标题，气质一句话：
 * 庄重、提气、汇报体。专属 vermilion-motif 画旗帜感绸带弧线 + 金色光芒细线
 * （抽象传达提气感，刻意不用五角星等政治符号——过线风险，plan 裁定 2）。
 *
 * **背景裁定（plan 裁定 1 起点为「cover/chapter 可用正红整版」，实现期依
 * pptfast 对比度架构收敛为「仅 chapter 正红整版」）**：`assertContrastFloor`
 * （`definitions.ts`）对 cover/content/ending 三页型逐一实测 text/muted 与该
 * 页型默认背景的对比度，要求 ≥3.0——且 text/muted 是全主题单值 token。若
 * cover 取正红 #C8102E，则 text #2B2020 对红仅 ~2.68:1、muted 对红 ~1.0-1.3:1，
 * 双双跌破 3.0 地板（chapter 因八个 chapter layout 全部走
 * `readableOn`/`accessibleInk` 自适应取墨，被 `CONTRAST_CHECKED_SLIDE_TYPES`
 * 刻意豁免，故可整版红）。而 content/ending 必须是浅底（正文可读性，plan
 * 裁定 1「正文页不可整版红」），浅底又要求 text/muted 是深墨——同一对 token
 * 不可能既在红底达标又在浅底达标。结论：**cover 随 content/ending 取暖米白**，
 * 封面的庄重红金身份改由红色结构型 layout（banner-title 的红强调条、
 * left-anchor 的 40% 红色块、split-diagonal 的红斜切块——后两者走 readableOn
 * 反白，banner-title 则是浅底上的红标题+红条，靠 primary·bg 5.51:1 直接达标）
 * + 红金 motif 承载（红作结构色，正是裁定 1「红作结构色」的落地）。这与
 * ember/academic/consulting/pulse/terra 先例一致（封面浅、章节饱和）。
 *
 * **色彩校准（逐值实测记录，consulting-muted 先例）**——实测均对 bg
 * #FBF7F0 / surface #FFFFFF：
 *   - primary #C8102E 正红：对 bg ~5.51:1、对 surface ~5.88:1，达 3:1 大字
 *     （≥24px bold）门槛但不足 4.5:1 正文门槛，故 **primary 只用于大字标题/
 *     结构色块，正文小字一律用 text**。起点 hex 未改（已达大字门槛）。
 *   - accent #D4A017 金黄：对 bg ~2.22:1、对 red ~2.48:1，均低于文字门槛——
 *     **accent 只作装饰/序号/图表/大字强调色块，绝不当任何文字色**（除非深底
 *     反白走 readableOn）。本主题任何 tokens 消费点（motif/chartPalette）均
 *     未把 accent 用作文字填色。
 *   - text #2B2020 暖墨：对 bg ~14.8:1、对 surface ~15.8:1，远超门槛。
 *   - muted #6E5A50 暖灰（同色相家族，非中性灰）：对 bg ~6.07:1、对 surface
 *     ~6.48:1，双双清 4.5:1 正文门槛（`colors.muted contrast` 套件要求），
 *     起点即达标，无需二次校准。
 *   - chapter 底色取 primary 正红：白字对 red ~5.88:1（≥4.5），text 墨对 red
 *     ~2.68:1——`readableOn` 两墨取优，chapter layout 稳态选中白字，大字
 *     可读；正是 chapter 被对比度地板豁免、可整版红的原因。
 */
export const VERMILION_TOKENS: StyleTokens = {
  id: "vermilion",
  colors: {
    bg: "#FBF7F0", // 暖米白（正文页不可整版红，红作结构色）
    surface: "#FFFFFF",
    primary: "#C8102E", // 正红（标题/结构条/章节整版底，校准见文件头）
    accent: "#D4A017", // 金黄（点缀线、序号、徽记感，绝不当文字色）
    text: "#2B2020", // 暖墨
    muted: "#6E5A50", // 暖灰调，校准记录见文件头注释
    border: "#E7DCC8", // 深一档的暖米白描边，同色相家族
    chartPalette: ["#C8102E", "#D4A017", "#1F3A5F", "#8A7A6A"], // 正红/金黄/藏青/暖灰
  },
  // heading 走 SimSun 霸屏大标题（读 journal/ink 的中文衬线先例）：导出的
  // pptx 单字体无法回退，Georgia/serif 无 CJK 字形会渲染成豆腐块，CJK 安全
  // 衬线白名单里唯一合适的是 SimSun/宋体，用它承担汇报体的庄重报题气质。
  // SimSun 无精确字宽表（`hasExactWidthTable` 返回 false，同 journal/ink/
  // bloom/runway），但内置主题从不走 registerTheme（THEME_DEFINITIONS 直接由
  // THEME_STYLES 构造），故 `warnUnmeasuredFace` 的 console.warn 结构上永不
  // 触发——`definitions.test.ts` 的 nonExactHeadingBuiltins 回归锁把 vermilion
  // 列入这一豁免集合。body 走 Microsoft YaHei（有精确字宽表），混排规矩。
  fonts: {
    heading: ["SimSun", "宋体", "Georgia", "Times New Roman", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 2, gapScale: 1 }, // 庄重利落（方正克制，汇报体不求圆润）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FBF7F0" }, // 浅底（红身份来自结构型 layout + motif，见文件头背景裁定）
    chapter: { kind: "color", value: "#C8102E" }, // 正红整版（白字走 readableOn，chapter 被对比度地板豁免）
    content: { kind: "color", value: "#FBF7F0" },
    ending: { kind: "color", value: "#FBF7F0" },
  },
};
