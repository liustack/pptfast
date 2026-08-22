import type { StyleTokens } from "./tokens";

/**
 * crayon（蜡笔卡纸）——2026-08-21 第 18 主题（场景审计低龄教育立项，
 * 设计源 `design-project/skin-boards.html` 的 crayon 板 + `new-themes-brief.md`
 * 第六组）。面向 K12 课件与家长会 / 兴趣班与培训机构招生 / 亲子活动与夏令营 /
 * 绘本与科普分享。性格：一盒蜡笔画在卡纸上——亮而不吵，圆角与手绘线，没有
 * 一处冷灰。
 *
 * 与 classroom（讲义雾蓝、拍纸簿）场景切分：classroom 是「亲和的教与学」，
 * crayon 是更低龄的「蜡笔卡纸」。两家四轴最近邻（L / top-band / · / medium），
 * 装饰浓度岔开——classroom 是 medium 的打孔排，crayon 是 heavy 的页缘蜡笔描边。
 * 底色隔开一个色温段：classroom 雾蓝 `#ECF0F2`、crayon 卡纸奶油
 * `#FFF6E9`。
 *
 * 逐条来历（板上数字 vs 本仓库 `svg/ink.ts` 的 `contrastRatio`，压 `bg`
 * `#FFF6E9`）：
 *   - `bg` `#FFF6E9`：卡纸奶油，暖黄段。
 *   - `surface` `#FFFDF6`：图画纸白。
 *   - `primary` `#2B59C3`：蜡笔蓝。压 bg 实测 5.91:1（板 5.8:1），白字压
 *     primary 6.33:1（板 4.7:1）——板书带承白字。
 *   - `accent` `#E4572E`：蜡笔橘红。压 bg 实测 3.44:1（板 3.9:1）。角色写死：
 *     只给太阳涂鸦、星贴纸与一个强调词，不作大段正文。
 *   - `text` `#2E2A25`：蜡笔黑，不是纯黑。13.30:1（板 13:1）。
 *   - `muted` `#6E655A`：铅笔灰。5.34:1（板 5.2:1），压 surface 5.62:1。
 *   - `border` `#F1E3C8`：卡纸折线。
 *   - `chartPalette` 一盒四色蜡笔：蜡笔蓝 / 橘红 / 草绿 `#2E933C`（压 bg
 *     3.66:1，板 4.4:1）/ 向日黄 `#F5B700`（压 bg 1.68:1，板 1.9:1）。
 *     **向日黄仅色块永不承字**——1.68:1 跌破任何文字线，写进这条角色约束，
 *     谁也不能拿它去填字。
 *
 * 设计板自查整体同向、同序，以实测为准，七个 token 与四格 chart 一字未改。
 *
 * 语义三色不在设计板色表里，按 classroom 同款「从角色色压深、属于这盒蜡笔」
 * 派生，压 `surface` 校准（kpi 箭头是 20px 字、callout 是线与图标）：
 *   - `danger` `#C43A1F`：橘红压深（5.19:1），比 accent 更红更重。
 *   - `warning` `#A67C00`：向日黄压深（3.75:1），只作线与图标——原黄永不承字。
 *   - `success` `#278035`：草绿压深（4.88:1），过 4.5:1 正文线。
 *
 * chapter 底色取 primary 蜡笔蓝（classroom/academic/consulting 同款
 * per-type 深底约定）：白字压 primary 6.33:1，`readableOn` 取优后稳态可读。
 *
 * 字体跟 classroom 同一套 CJK 安全字面（heading 经 resolveFontFace 落到
 * Microsoft YaHei）。圆角 12 + gapScale 1.1，全主题最圆润档（课堂亲和那一档），
 * 蜡笔卡纸要的就是这个圆。
 *
 * 装饰见 `../svg/motifs/motif-crayon-motif.tsx`（蜡笔描边：顶缘蜡笔涂边 +
 * 右上太阳涂鸦 + 底带彩虹短划 + 左下角星贴纸。密页降为顶涂边＋底彩虹划）。
 *
 * 可拉伸性：四色蜡笔即参数（K12 学科课换学科色组、亲子活动 bg 可提饱和至
 * `#FFF1D6`）。heavy→medium 只撤太阳与星，涂边与彩虹划几何不动。向日黄永不承字。
 */
export const CRAYON_TOKENS: StyleTokens = {
  id: "crayon",
  colors: {
    bg: "#FFF6E9", // 卡纸奶油——暖黄段，与 classroom 雾蓝隔开色温
    surface: "#FFFDF6", // 图画纸白
    primary: "#2B59C3", // 蜡笔蓝（压 bg 5.91:1，白字 6.33:1）——板书带承白字
    accent: "#E4572E", // 蜡笔橘红（3.44:1）——只给太阳涂鸦、星贴纸与一个强调词
    text: "#2E2A25", // 蜡笔黑（13.30:1），不是纯黑
    muted: "#6E655A", // 铅笔灰（5.34:1）
    border: "#F1E3C8", // 卡纸折线
    danger: "#C43A1F", // 橘红压深（压 surface 5.19:1）——比 accent 更红更重
    warning: "#A67C00", // 向日黄压深（压 surface 3.75:1），只作线与图标
    success: "#278035", // 草绿压深（压 surface 4.88:1）
    // 一盒四色蜡笔。第四格向日黄 1.68:1，仅色块永不承字。
    chartPalette: ["#2B59C3", "#E4572E", "#2E933C", "#F5B700"],
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 12, gapScale: 1.1 }, // 与 classroom 同档：最圆润 + 呼吸感
  defaultBackgrounds: {
    cover: { kind: "color", value: "#FFF6E9" },
    // chapter 走 primary 蜡笔蓝底（rail-chapter 标题是白字，classroom 同款
    // per-type 深底约定——浅底会白字不可见）
    chapter: { kind: "color", value: "#2B59C3" },
    content: { kind: "color", value: "#FFF6E9" },
    ending: { kind: "color", value: "#FFF6E9" },
  },
};
