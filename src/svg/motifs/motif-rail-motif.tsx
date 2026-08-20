import type { DecorProps } from "./types"

/**
 * rail-motif v2 —— 「进度轨」（2026-08-20 冷调组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html` 的
 * academic 设计表，几何坐标逐条抄录，不派生）。academic 的锚点 motif 就是
 * 本文件（`THEME_DEFINITIONS.academic.motif`），所以冷调组换 academic 的
 * 装饰语汇＝换本文件。
 *
 * 换掉的东西：v1 是一枚 260 半径的四分之一圆盘（`ARC_PATH`），三档 seed
 * 变体分别贴在右下/左下/右上角，chapter 用 `readableOn` 反白、其余用
 * primary，一律 0.06 不透明。一整块低透明度的大圆盘在页角，既不是学术的
 * 语言，也和 `rail-chapter`/`rail-ending` 自带的底部进度点轨对不上话。
 * v2 换成这个家族本来就在说的话——进度，位置写死。v2 上是两件，2026-08-20
 * 的悬空装饰清扫删掉了其中的右上角标（x1200-1256 两条 accent 短线，不贴任何
 * 文字、不落在任何词上），只剩下这一件：
 *   - **进度点轨**：五枚 r6 的点，第一枚实心、后四枚空心描边（primary），
 *     间距 46。章节推进的具象，与 `chapter-rail-chapter.tsx` 自带的
 *     `CH_DOT_*` 点轨同一个读法。设计板把它放在底带 y648，本文件放在顶带
 *     y30——理由见 `DOT_Y` 自己的注释（那条 y648 正是本仓库所有脚注的共用
 *     基线，实测撞了八个版式）。
 * 设计板原话是「light 档仅此两件」。角标退役之后只剩点轨一件，顶带上的读法
 * 从「一整条页眉饰带」收成「一处进度记号」，页角回到全空。
 *
 * ## 两档锚点（都写死，不做内容感知）
 *
 * 点轨的默认锚是 x96 起（首点圆心 x106），但 academic 声明的封面是
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
 *   - 点轨 y24-36，在标题区上沿 y48 之上；默认锚横向 x100-296、cover 锚
 *     x564-760，两档都够不到 `brand-chrome.tsx` 右上 logo 带（1120,48,
 *     96×40）与右下 logo 盒的左沿 x1120。
 *   - 设计板坐标只改了点轨的 y 一处（见 `DOT_Y`），x 与件数一处未改。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 点轨）。
 * 借用网（`motif-selection.ts` 的 `MOTIF_CANDIDATES`）：consulting / journal /
 * enterprise 三家的候选集里都有本 motif，抽到时画的是它们自己 token 下的
 * 进度轨——本轮换语汇，这三家抽中本 motif 的页跟着换装，逐页归因见
 * 冷调组报告。
 */

// ── 顶带进度点轨 ────────────────────────────────────────────────────────
/**
 * 设计板给的是 y648（底带）。本仓库的 y648 正好是
 * `chrome-geometry.ts` 的 `FOOTNOTE_BASELINE_Y`——「一条分隔线只配一个答案」
 * 那次统一之后，每个 content 版式的脚注都画在这一根基线上。实测（全主题 ×
 * 全版式 × 满配 meta ＋长脚注的最坏情形扫描）：点轨压在 consulting 八个
 * content 版式的脚注下面，`deck-audit` 报 3.26:1 的 low-contrast。设计板的
 * 四条红虚线禁区里没有这条脚注线（板上把页脚 meta 带画在 y664 起，而脚注
 * 比它高 16px）。y620（正文区下沿）到 y628（20px 脚注的字顶）之间只剩 8px，
 * 放不下 r6 的点，所以点轨整组上移进顶带——那是四条禁区留出来的另一条通宽
 * 空带，也是本组另外两家 motif（刻度尺、心电线）落脚的同一条带子。
 * x 锚不动（板上的 x96-296 一档原样保留）。
 */
const DOT_Y = 30
const DOT_R = 6
const DOT_GAP = 46
const DOT_COUNT = 5
/** 默认锚：首点圆心 x106（设计板写作 x96-296 的那一档）。 */
const DOT_X_DEFAULT = 106
/** cover 锚：让开 `left-anchor` 的 512 宽整幅色块，整组移进右板（板上 x570-760）。 */
const DOT_X_COVER = 570
const DOT_STROKE = 1.5

export function RailMotif({ slide, ctx }: DecorProps) {
  // chapter 完全退让（见文件头：重影 + 同色不可见 + 净空零碎）。
  if (slide.type === "chapter") return null

  const ink = ctx.colors.primary
  const startX = slide.type === "cover" ? DOT_X_COVER : DOT_X_DEFAULT
  const dots = Array.from({ length: DOT_COUNT }, (_, i) => startX + i * DOT_GAP)

  return (
    <>
      {/* 顶带进度点轨：首点实心，其余空心 */}
      <g>
        <circle cx={dots[0]} cy={DOT_Y} r={DOT_R} fill={ink} />
        {dots.slice(1).map((cx) => (
          <circle key={cx} cx={cx} cy={DOT_Y} r={DOT_R} fill="none" stroke={ink} strokeWidth={DOT_STROKE} />
        ))}
      </g>
    </>
  )
}
