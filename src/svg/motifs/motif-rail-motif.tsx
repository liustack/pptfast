import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * rail-motif v2 —— 「顶带点轨」（2026-08-20 冷调组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html` 的
 * academic 设计表，几何坐标逐条抄录，不派生）。academic 的锚点 motif 就是
 * 本文件（`THEME_DEFINITIONS.academic.motif`），所以冷调组换 academic 的
 * 装饰语汇＝换本文件。
 *
 * 换掉的东西：v1 是一枚 260 半径的四分之一圆盘（`ARC_PATH`），三档 seed
 * 变体分别贴在右下/左下/右上角，chapter 用 `readableOn` 反白、其余用
 * primary，一律 0.06 不透明。一整块低透明度的大圆盘在页角，既不是学术的
 * 语言，也和 `rail-chapter`/`rail-ending` 自带的底部进度点轨对不上话。
 * v2 换成这个家族本来就在说的话——顶带点轨，只留两件，位置写死：
 *   - **顶带点轨**：五枚相同的空心 r6 圆（primary 1.5 描边），间距 46。
 *     曾经一实四空，被读成进度，2026-08-22 画廊审查改成五枚全空心。
 *     真进度仍只属于 `chapter-rail-chapter.tsx` 按 `totalChapters` 画的
 *     `CH_DOT_*`。设计板把点轨放在底带 y648，本文件放在顶带 y30——理由见
 *     `DOT_Y` 自己的注释（那条 y648 正是本仓库所有脚注的共用基线，实测
 *     撞了八个版式）。
 *   - **右上双线角标**：x1200-1256 的两条短线（y20 长、y30 短，accent），
 *     期刊页眉的角记号。
 * 「light 档仅此两件」是设计板上的原话。两件同在顶带之后，读起来是一整条
 * 页眉饰带，而不是对角两处零件。
 *
 * ## 两档锚点（都写死，不做内容感知）
 *
 * 点轨的默认锚是 x96-296 槽内居中（首点圆心 x104），但 academic 声明的封面是
 * `left-anchor`——那个版式在左侧画一整幅 512 宽、720 高的 primary 色块
 * （`cover-left-anchor.tsx` 的 `COVER_BLOCK_W`），而 Decor 永远画在 body
 * 之下，默认锚的五枚点会被色块整个盖掉（不分顶带底带，那块色是通高的）。
 * 设计板给的解法是让位：**cover 档整组右移到右板 x570 起**（末点圆心
 * x754，板上写作 x570-760）。两档都是常量，motif 不知道当页选中了哪个
 * layout（内容感知是 `inventory.md` 的确定性红线），只按 `slide.type`
 * 二选一——在别的 cover 构造上，右板锚同样落在顶带的净空里。
 *
 * chapter 完全退让（`return null`，v1 是画反白圆盘）：三条理由同向。
 * ①`rail-chapter` 自己就在底部画一条进度点轨，motif 再画一条是重影；
 * ②academic 的 chapter 默认底色是整版 primary 祖母绿，而点轨是 primary
 * ——画上去看不见（同 terra-motif 的判断）；③八个 chapter layout 都在这块
 * 整版色上画巨幅居中标题，可用净空本就零碎。v1 的 `readableOn(ctx.defaultBg
 * ?? ctx.colors.bg)` 反白分支（P1 variety wave 修的那处「白圆盘压近白底」
 * Moderate）随圆盘一并退役，`../ink` 依赖退出本文件。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 点轨 y24-36，在标题区上沿 y48 之上；默认锚横向 x98-294（x96-296
 *     槽内居中）、cover 锚 x564-760，两档都够不到 `branding.tsx` 右上
 *     logo 带（1120,48, 96×40）与右下 logo 盒的左沿 x1120。
 *   - 角标 x1200-1256、y20-30，同在标题区上沿之上、右上 logo 带上方。
 *   - 设计板坐标只改了点轨的 y 一处（见 `DOT_Y`）。件数不变。默认档 x
 *     在 x96-296 槽内居中，相对板上首点圆心 x106 左移 2px。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 点轨、accent = 角标）。
 * 借用网（`motif-selection.ts` 的 `MOTIF_CANDIDATES`）：academic 是锚点且
 * board-cover-restore wave 2 已钉成单成员。consulting / enterprise 仍借本
 * motif。journal 不再轮换到这里。
 */

// ── 顶带五枚空心圆 ──────────────────────────────────────────────────────
/**
 * 设计板给的是 y648（底带）。本仓库的 y648 正好是
 * `branding-geometry.ts` 的 `FOOTNOTE_BASELINE_Y`——「一条分隔线只配一个答案」
 * 那次统一之后，每个 content 版式的脚注都画在这一根基线上。实测（全主题 ×
 * 全版式 × 满配 meta ＋长脚注的最坏情形扫描）：点轨压在 consulting 八个
 * content 版式的脚注下面，`deck-audit` 报 3.26:1 的 low-contrast。设计板的
 * 四条红虚线禁区里没有这条脚注线（板上把页脚 meta 带画在 y664 起，而脚注
 * 比它高 16px）。y620（正文区下沿）到 y628（20px 脚注的字顶）之间只剩 8px，
 * 放不下 r6 的点，所以点轨整组上移进顶带——那是四条禁区留出来的另一条通宽
 * 空带，也是本组另外两家 motif（刻度尺、心电线）落脚的同一条带子。
 * x 仍落在板上的 x96-296 一档，五枚全空心后组在这条槽内居中（首点圆心
 * 从 x106 收到 x104）。
 */
const DOT_Y = 30
const DOT_R = 6
const DOT_GAP = 46
const DOT_COUNT = 5
/** 默认锚：x96-296 槽内居中，首点圆心 x104（五枚间距 46、r6 视觉宽 196）。 */
const DOT_X_DEFAULT = 104
/** cover 锚：让开 `left-anchor` 的 512 宽整幅色块，整组移进右板（板上 x570-760）。 */
const DOT_X_COVER = 570
const DOT_STROKE = 1.5

// ── 右上双线角标 ────────────────────────────────────────────────────────
const CORNER_X2 = 1256
const CORNER_MARKS: readonly { x1: number; y: number }[] = [
  { x1: 1200, y: 20 },
  { x1: 1224, y: 30 },
]
const CORNER_STROKE = 1.5

export function RailMotif({ slide, ctx }: DecorProps) {
  // chapter 完全退让（见文件头：重影 + 同色不可见 + 净空零碎）。
  if (slide.type === "chapter") return null

  const ink = ctx.colors.primary
  const accent = ctx.colors.accent
  const bg = ctx.defaultBg ?? ctx.colors.bg
  const startX = slide.type === "cover" ? DOT_X_COVER : DOT_X_DEFAULT
  const dots = Array.from({ length: DOT_COUNT }, (_, i) => startX + i * DOT_GAP)

  return (
    <>
      <DecorPiece id="dot-track">
        {dots.map((cx) => (
          <circle
            key={cx}
            cx={cx}
            cy={DOT_Y}
            r={DOT_R}
            fill="none"
            stroke={ink}
            strokeWidth={DOT_STROKE}
            opacity={leafRecessOpacity(slide.type, ink, bg)}
          />
        ))}
      </DecorPiece>
      <DecorPiece id="corner-mark">
        {CORNER_MARKS.map((m) => (
          <line
            key={m.y}
            x1={m.x1}
            y1={m.y}
            x2={CORNER_X2}
            y2={m.y}
            stroke={accent}
            strokeWidth={CORNER_STROKE}
            opacity={leafRecessOpacity(slide.type, accent, bg)}
          />
        ))}
      </DecorPiece>
    </>
  )
}
