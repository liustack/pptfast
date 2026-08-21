import type { StyleTokens } from "./tokens";

/**
 * swiss（冷白制度）——2026-08-21 新增第 22 个 theme id（第 21 个结构身份。
 * bloom 仍是 classroom 的换色）。性格：机构年报的封面，红只在页缘亮一下。
 * 目标场景：机构年报、政策汇报、审计交付。
 *
 * 三家报告语域分腔，不是换色：
 *   - consulting = 报告腔（藏青承结构，黄只当一把高亮尺）
 *   - vermilion  = 公文腔（米白纸 + 正红成面，红头承白字）
 *   - swiss      = 制度腔（冷白纸 + 硬黑即正文即色块，瑞士红成边）
 *
 * **红三家纪律**（与 vermilion / memo 并立，本主题只执行自己那一条）：
 *   vermilion 红成面 `#B02318` / memo 红成线 `#A63A2B` / swiss 红成边 `#D7282F`。
 *   swiss 的红只出现在页缘边条与小色块，永不承字成横幅。封面倾向的
 *   left-anchor / split-diagonal 色块走 primary 硬黑，不走 accent。
 *
 * 四轴 L / bottom-right / light / tight。最近邻 tech（L / BR / medium /
 * tight），岔在装饰轴：tech 是右缘星座链的 medium，swiss 是顶边 12px 红条
 * + 右缘三格灰刻度的 light。enterprise 也是 L / tight，但 meta 在 top-band、
 * 装饰是 IKB 方块的 medium，两轴都岔开。
 *
 * 逐条来历（设计定稿板 `theme-wave7/Swiss.dc.html` 给死五格，surface 与
 * chart 四色自推，本仓库 `svg/ink.ts` 的 `contrastRatio` 压 `bg #F7F7F5`
 * 实测）：
 *   - `bg` `#F7F7F5`：冷白纸。板上原值。
 *   - `surface` `#FFFFFF`：制度卡纯白，从冷白纸上抬一档（consulting 同形）。
 *   - `primary` `#101010`：硬黑。即正文即色块。压 bg 17.74:1，白字压它
 *     19.03:1。横幅、斜切、章节整版都走它，不走红。
 *   - `accent` `#D7282F`：瑞士红（4.62:1）。只给页缘边条与小色块，永不承字
 *     成横幅。白字压它 4.96:1，刚过 4.5，但本主题纪律禁止把它当成横幅底。
 *   - `text` `#101010`：与 primary 同一格，制度腔就是「墨即结构」。
 *   - `muted` `#5F5F5C`：注脚灰（5.97:1 / 压 surface 6.41:1）。
 *   - `border` `#E3E3E0`：网格线，跟着纸底走。
 *   - `chartPalette` 四色：瑞士红 / 硬黑 / 中灰 / 冷蓝灰。无橙，不进蓝橙
 *     禁忌。冷蓝灰 `#4A7A8A` 饱和度 0.30，未过 vivid-blue 的 0.35 线。
 *     实测压 bg 4.62 / 17.74 / 5.97 / 4.41:1，四格全过 3.0 装饰线。
 *     白墨压四格 4.96 / 19.03 / 6.41 / 4.73:1，people-cards 徽章首字站得住。
 *     两两 ΔE：红对三格 88 / 77 / 95，黑对灰 35.6、黑对蓝灰 47.4，灰对蓝灰
 *     20.8（刚过分类色板的 20 线，靠色相分开，不是靠明度）。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#C41F26`：瑞士红压深一档（5.88:1）。accent 的 4.96:1 刚过
 *     线，箭头小字要更沉才压得住。
 *   - `warning` `#6B5A3A`：墨青铜（6.67:1），饱和度 0.30，不进 vivid orange
 *     带。只作线与图标，不进 chartPalette。
 *   - `success` `#2F6B52`：克制森绿（6.28:1）。
 *
 * 字体：heading 加粗 sans。板上 Archivo 900 落地为 Microsoft YaHei 族
 * （字重导出只有粗/不粗两档，900 → 加粗）。圆角 0 + gapScale 1（tight，
 * 与 tech 同档）。
 *
 * 装饰见 `../svg/motifs/motif-swiss-motif.tsx`（顶边 12px 红条 + 右缘三格
 * 灰刻度。light 档，四页型同一张）。板上封面那根 x852 整高裸格线**不进
 * motif**：纵穿正文区 (96,200,1040×420)，违反五个保护区。
 *
 * chapter 默认底取 primary 硬黑（consulting / vermilion 先例：章节整版是
 * 结构色块）。红条压黑底 3.84:1，灰刻度压黑底 2.97:1，都过 motif 可见度
 * 地板 1.02，chapter 不退让。
 */
export const SWISS_TOKENS: StyleTokens = {
  id: "swiss",
  colors: {
    bg: "#F7F7F5", // 冷白纸
    surface: "#FFFFFF", // 制度卡纯白
    primary: "#101010", // 硬黑（17.74:1）。即正文即色块，白字 19.03:1
    accent: "#D7282F", // 瑞士红（4.62:1）——只给页缘边条与小色块，永不承字成横幅
    text: "#101010", // 与 primary 同一格
    muted: "#5F5F5C", // 注脚灰（5.97:1）
    border: "#E3E3E0", // 网格线
    danger: "#C41F26", // 瑞士红压深（压 surface 5.88:1）
    warning: "#6B5A3A", // 墨青铜（6.67:1），只作线与图标
    success: "#2F6B52", // 克制森绿（6.28:1）
    // 瑞士红 / 硬黑 / 中灰 / 冷蓝灰。无橙。冷蓝灰 sat 0.30，不是 vivid blue。
    chartPalette: ["#D7282F", "#101010", "#5F5F5C", "#4A7A8A"],
  },
  fonts: {
    // 板上 Archivo 900 → YaHei 族加粗 sans。Microsoft YaHei 打头保导出无 tofu，
    // 也是有精确字宽表的两张脸之一（`hasExactWidthTable`）。
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 1 }, // 制度直角 + tight（与 tech 同档）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F7F7F5" },
    chapter: { kind: "color", value: "#101010" }, // 硬黑整版（红身份来自页缘边条，不来自整版红）
    content: { kind: "color", value: "#F7F7F5" },
    ending: { kind: "color", value: "#F7F7F5" },
  },
};
