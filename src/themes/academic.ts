import type { StyleTokens } from "./tokens";

/**
 * academic（学术/研究报告）——祖母绿 + 稿纸白的书卷气质。
 *
 * **冷调组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group3-cool-boards.dc.html` 里 academic 的色板角色表 + 封面样例）**：
 * academic 在冷调三家里拿到的语域是「书卷祖母绿」——绿是书脊的绿，不是
 * 实验室的绿，靠一张暖象牙纸压住它的寒气。这一轮与 pulse 一起拆青绿双胞胎
 * （两家 primary 肉眼几乎同色）：academic 走偏绿 + 学者金暖配角 + 暖底，
 * pulse 走偏蓝 + 全冷配角 + 冷底，两家 bg 色温相反。逐条来历：
 *   - `bg` `#FAFAF6` → `#F5F3EC`：近白 → 暖象牙纸。旧值几乎是纸白，绿压
 *     上去发寒；压暖压深之后才是书页而不是实验台，也把它与 pulse 的薄荷
 *     冷底拉到色温的两头。
 *   - `surface` `#FFFFFF` → `#FCFBF6`：稿纸白，跟着底色暖半档。
 *   - `primary` `#006A4E` → `#0E6245`：祖母绿压深偏绿，实测压 bg 6.63:1
 *     （板上自标 6.5:1），色块直接承白字（白压 primary 7.36:1）。
 *   - `accent` `#00A878` → `#A8861D`：亮翡翠 → 学者金。旧值是 primary 的
 *     高饱和亮版，与 primary 同色相、只差明度，等于没有配角；学者金是绿的
 *     暖配角，也是与 pulse 全冷配角形成对照的那一处。只给线与点，不承小字，
 *     实测 3.10:1（板上自标 3.1:1）。
 *   - `text` `#1A2421` → `#23251F`：墨绿黑 → 油墨黑，13.95:1。
 *   - `muted` `#5D6B65` → `#62655B`：铅笔灰（脱开青绿色相，走中性暖灰）。
 *     实测压 bg 5.36:1、压 surface 5.74:1、压 `content-matrix` 的三档 tone
 *     混合格底 4.86/5.09/5.16:1，全部过 4.5:1 正文门槛。
 *   - `border` `#D5D5CB` → `#DDD9C8`：稿纸格线，跟着暖底走。
 *   - `chartPalette` 换成板上的期刊克制四色：祖母绿 / 学者金 / 靛青 /
 *     卵石灰。实测压 bg 6.63 / 3.10 / 6.13 / 3.37:1，四格全过 3.0 装饰线。
 *     旧表后两格直接复用 `muted`/`border`（`#5D6B65`/`#D5D5CB`），其中
 *     border 那一格压 bg 只有 1.29:1，是四色里读不出来的一格。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#F5F3EC`）：primary 6.63:1、accent 3.10:1、text 13.95:1、muted 5.36:1
 * （压 surface 5.74:1）、chart 祖母绿 6.63 / 学者金 3.10 / 靛青 6.13 /
 * 卵石灰 3.37。设计板自查写的 6.5 / 3.1 / 14 / 5 / 6.5·3.1·5·3.5 与实测
 * 同向（靛青一格实测比板上高 1.1，卵石灰低 0.13 仍过 3.0 装饰线），以实测
 * 为准。
 *   - chapter 底色取 primary（同 pulse/consulting/terra 先例），白字对
 *     primary 7.36:1，`readableOn` 自适应两墨取优后稳态可读。
 *   - 板上「块上金一律用浅金 `#E5D9A8` 承小字」是封面样例里绿块内的取色
 *     主张。token 表没有第二枚 accent 的格位，而 `left-anchor` 今天在绿块
 *     里只画反白标题、不画金色小字，所以本轮无处安放这一档——记在冷调组
 *     报告的「板与版式差距清单」里，等版式级裁定（同暖纸组把 heritage
 *     报头对齐、vermilion 通栏红条留给版式级的处理）。
 *
 * 装饰见 `src/svg/motifs/motif-rail-motif.tsx`（进度轨 v2：底带进度点轨 +
 * 右上双线角标）——academic 的锚点 motif 是 `rail-motif`，consulting /
 * journal / enterprise 三家在各自的候选集里也借它。
 */
export const ACADEMIC_TOKENS: StyleTokens = {
  id: "academic",
  colors: {
    bg: "#F5F3EC", // 暖象牙纸——压住绿的寒气，书页而非实验室
    surface: "#FCFBF6", // 稿纸白
    primary: "#0E6245", // 祖母绿偏绿（6.63:1），色块直接承白字
    accent: "#A8861D", // 学者金（3.10:1，只给线与点，不承小字）
    text: "#23251F", // 油墨黑（13.95:1）
    muted: "#62655B", // 铅笔灰（5.36:1）
    border: "#DDD9C8", // 稿纸格线
    danger: "#9E2B25", // 朱批红（压 surface 7.17:1，可作正文级）
    warning: "#9C5A18", // 焦茶褐——学者金压到能承线的重量（5.21:1）
    success: "#16704F", // 祖母绿一档亮（5.85:1），与 primary 同族
    chartPalette: ["#0E6245", "#A8861D", "#3F5B8C", "#8A8471"], // 祖母绿/学者金/靛青/卵石灰
  },
  fonts: {
    heading: ["Sectra", "Georgia", "Source Han Serif SC", "serif"],
    body: ["Inter", "PingFang SC", "system-ui"],
  },
  shape: { radius: 2, gapScale: 1.05 }, // 学术严谨微圆+论文留白
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F5F3EC" },
    chapter: { kind: "color", value: "#0E6245" },
    content: { kind: "color", value: "#F5F3EC" },
    ending: { kind: "color", value: "#F5F3EC" },
  },
};
