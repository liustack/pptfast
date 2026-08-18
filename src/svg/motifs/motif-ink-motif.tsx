import type { DecorProps } from "./types"

/**
 * ink-motif v3（2026-08-18 主题重设计第一期，1a「素」方向 ——
 * `.issues/2026-08-18-theme-redesign/ink/decisions.md`）。
 *
 * 马远式克制：一整页只留两笔——**右缘落款列**和**一角残山**。v2 的三件东西
 * 全部删掉，逐条交代去向，免得后来人当成漏搬：
 *   - y34 / y664 两条全宽版框线：删。版框把每一页锁成同一个方框，是 v2 最
 *     显眼的「千篇一律」来源，也是 `BRANDS.ink.suppressFooterRule` 当初存在
 *     的唯一理由（那个开关本期继续留着，见下）。
 *   - 三层大远山（左下 / 右下 / 横贯三个 seed 变体）：删。1a 的判断是墨要
 *     少到「一角」，大面积晕染属于 1b「浓」，不在本期。
 *   - 旧的竖排落款 + 印章（x1170~1202，y608 起）：删。它正压在 BrandChrome
 *     的 logo 盒（1120,630,96×40）和 `tone-adaptive-header` 的右下日期上——
 *     `inventory.md` 记录的 ink / tone-adaptive-header 日期 1.07:1 就是这处
 *     碰撞。新落款列整体右移到 x>=1220，与 logo 盒（右缘 x1216）划清界线。
 *
 * v3 画的两笔：
 *   - **右缘落款列**（四种页型都画）：一条 x1220 的竖界线，右边一列逐字竖排
 *     的机构名（19px 楷）、隔一段接排的年月（17px，中文数字），列底一枚朱砂
 *     印。这一列同时吞并了 BrandChrome 页脚 meta 的职责——
 *     `BRANDS.ink.suppressFooterMeta` 因此打开（`../brand-chrome.tsx`），
 *     否则同一份机构名/日期会在一页上出现两次。
 *   - **一角残山**（仅 cover / chapter）：左下角一道 0.06 透明度的墨形，
 *     几何固定、不随内容动。x<=500 y>=640，避开四个内容区。
 *
 * 竖排仍然是逐字 `<text>`（不用 `writing-mode`，导出安全），沿用 v2 的写法
 * ——不是新造原语：`lib/svg-text-layout.ts` 的 `fitSvgLine`/`layoutSvgText`
 * 量的是**横排宽度**，竖排一列的容量是字数不是像素宽，量宽度的工具在这里
 * 无事可做，硬套只会得到一个假的约束。列的容量改由下面 `orgCapacity()` 按
 * 几何算。
 *
 * 纪律：零 theme id、零 hex，颜色全部来自 ctx。
 */

// ── 落款列几何（1a 设计稿坐标，逐条抄录，不派生） ──────────────────────
//
// 楚河汉界：这一列的每一个声明坐标都 >= RAIL_X，因为 BrandChrome 的 logo 盒
// 是 (1120, 630, 96×40)，右缘落在 x1216。界线本身 1.2px 描边，实际着墨
// 1219.4~1220.6，离 logo 盒仍有 3.4px——`motif-ink-motif.test.tsx` 同时锁
// 「声明坐标 >= 1220」和「实际着墨 > 1216」两条。
const RAIL_X = 1220
const RAIL_Y1 = 64
const RAIL_Y2 = 656
const RAIL_STROKE = 1.2

/** 逐字竖排的列心（`textAnchor="middle"`），与印章同一条中轴。 */
const COLUMN_X = 1244
const ORG_FIRST_Y = 88
const ORG_STEP = 30
const ORG_SIZE = 19
/** 年月比机构名小一号，字距按同比例收（30/19 ≈ 17/26.8，取整 26）。 */
const DATE_STEP = 26
const DATE_SIZE = 17
/** 「间隔一段后接排」——机构名末字与年月首字之间的留白。 */
const BLOCK_GAP = 34
/**
 * 整列最后一个字的 baseline 上限。印章顶在 y614，17px 字的下缘约在
 * baseline+4，留 14px 空气，字与印不相碰。列的容量由这条线倒推
 * （`orgCapacity`），不是拍脑袋定的字数。
 */
const COLUMN_LAST_BASELINE = 596

// 印章：26×26 rx2 朱砂 + 内嵌 17×17 白描边（统一形制，见 decisions.md；
// ending 版的 30×30 随 ending-seal 二期，本期不做）。内嵌方框居中，
// 内缩 (26-17)/2 = 4.5。
const SEAL_X = 1231
const SEAL_Y = 614
const SEAL_SIZE = 26
const SEAL_RADIUS = 2
const SEAL_INNER_SIZE = 17
const SEAL_INNER_INSET = (SEAL_SIZE - SEAL_INNER_SIZE) / 2
const SEAL_INNER_STROKE = 1.4

/**
 * 一角残山（仅 cover / chapter）：几何写死，不读内容、不随 seed 变
 * ——`inventory.md` 的确定性红线（装饰位置做内容感知会让 seed 的修订稳定性
 * 失效）。x 从 -40 出血到 500，脊线最高约 y640，压在页面左下角。
 * 0.06 透明度低于 `deck-audit.ts` 的 `MIN_BG_OPACITY`（0.5），所以它永远不会
 * 被当成某段文字的背景去判对比度——这是「淡到不参与判读」的形式化说法。
 */
const REMNANT_PATH = "M -40 720 Q 140 640 330 690 Q 430 708 500 720 Z"
const REMNANT_OPACITY = 0.06

/** 一位阿拉伯数字 → 汉字数字。落款写年月用汉字是这套语言本身的一部分。 */
const CJK_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

/**
 * `ir.meta.date` → 竖排年月的逐字数组，如 `2026-08-15` → 二〇二六年八月。
 *
 * `meta.date` 在 IR 里是自由字符串（schema 不约束格式），所以只认「四位年 +
 * 非数字分隔 + 一到两位月」这一种能确定读懂的形状；读不懂就整块不画，
 * 而不是猜一个可能错的年月挂在落款上。落款写错日期比不写日期糟。
 */
function colophonDateGlyphs(date: string | undefined): string[] {
  const m = /^(\d{4})\D+(\d{1,2})(?:\D|$)/.exec(date ?? "")
  if (!m) return []
  const month = Number(m[2])
  if (month < 1 || month > 12) return []
  const monthGlyphs =
    month < 10
      ? [CJK_DIGITS[month]]
      : month === 10
        ? ["十"]
        : ["十", CJK_DIGITS[month - 10]]
  return [...[...m[1]].map((d) => CJK_DIGITS[Number(d)]), "年", ...monthGlyphs, "月"]
}

/**
 * 这一列还能排下几个机构名的字——从列底往回推：先给年月块留够
 * （`BLOCK_GAP` + 字数 × `DATE_STEP`），剩下的空间按 `ORG_STEP` 分。
 * 年月不画时（日期读不懂/没写）机构名自己吃满整列。
 *
 * 只读 `ir.meta` 的字数，不读任何一页的文字排版结果——meta 是 deck 级的，
 * 改任何一页的标题都不会让这一列动，seed 的修订稳定性不受影响。
 */
function orgCapacity(dateGlyphCount: number): number {
  const dateSpan = dateGlyphCount > 0 ? BLOCK_GAP + (dateGlyphCount - 1) * DATE_STEP : 0
  const room = COLUMN_LAST_BASELINE - ORG_FIRST_Y - dateSpan
  return Math.max(1, Math.floor(room / ORG_STEP) + 1)
}

/**
 * 机构名逐字排，字数不定时按字数伸展；超出列容量就截断，末字换成省略号
 * 并挂 `data-truncated="1"`——`fitSvgLine` 截断时挂的同一枚标记，
 * `deck-audit.ts` 的 `[data-truncated="1"]` 通读器会照常报 content-truncated。
 * v2 是无声 `.slice(0, 6)`：字被吃掉而没有任何人知道。落款列现在是 ink 内容
 * 页上机构名的**唯一**出场位置（页脚 meta 已被抑制），无声截断等于无声丢信息。
 */
function fitOrgGlyphs(org: string, capacity: number): { glyphs: string[]; truncated: boolean } {
  const glyphs = [...org]
  if (glyphs.length <= capacity) return { glyphs, truncated: false }
  return { glyphs: [...glyphs.slice(0, Math.max(0, capacity - 1)), "…"], truncated: true }
}

export function InkMotif({ slide, ir, ctx }: DecorProps) {
  const { colors } = ctx
  const dateGlyphs = colophonDateGlyphs(ir.meta.date)
  const org = fitOrgGlyphs(ir.meta.organization ?? "", orgCapacity(dateGlyphs.length))
  const orgLastY = ORG_FIRST_Y + Math.max(0, org.glyphs.length - 1) * ORG_STEP
  // 「接排」：年月跟在机构名之后，中间隔 BLOCK_GAP。没有机构名时年月自己
  // 从列首起排。
  const dateFirstY = org.glyphs.length > 0 ? orgLastY + BLOCK_GAP : ORG_FIRST_Y

  return (
    <>
      {/* 右缘落款列的竖界线 */}
      <line x1={RAIL_X} y1={RAIL_Y1} x2={RAIL_X} y2={RAIL_Y2} stroke={colors.border} strokeWidth={RAIL_STROKE} />

      {/* 机构名逐字竖排（楷）。`data-contrast-tier="meta"` —— 这是 B 层元
          信息文本（`docs/contrast-system.md` 三层策略：机构名/日期，真信息、
          故意弱化），按 3:1 判而不是按字号判。实测 muted `#686056` 压
          `#F7F2E7` 是 5.54:1，连 4.5:1 的正文线都过，标 meta 是把它的**层级**
          说清楚，不是去讨一个更松的门槛。 */}
      {org.glyphs.map((ch, i) => (
        <text
          key={`org-${i}`}
          data-contrast-tier="meta"
          data-truncated={org.truncated && i === org.glyphs.length - 1 ? "1" : undefined}
          x={COLUMN_X}
          y={ORG_FIRST_Y + i * ORG_STEP}
          fontFamily={ctx.fonts.heading}
          fontSize={ORG_SIZE}
          fill={colors.muted}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {ch}
        </text>
      ))}

      {/* 年月竖排（汉字数字，小一号） */}
      {dateGlyphs.map((ch, i) => (
        <text
          key={`date-${i}`}
          data-contrast-tier="meta"
          x={COLUMN_X}
          y={dateFirstY + i * DATE_STEP}
          fontFamily={ctx.fonts.heading}
          fontSize={DATE_SIZE}
          fill={colors.muted}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {ch}
        </text>
      ))}

      {/* 列底朱砂印：外框 + 内嵌白描边。印上无字——印面刻什么不是渲染器能
          知道的事，留白比编一个字负责。 */}
      <rect x={SEAL_X} y={SEAL_Y} width={SEAL_SIZE} height={SEAL_SIZE} rx={SEAL_RADIUS} fill={colors.accent} />
      <rect
        x={SEAL_X + SEAL_INNER_INSET}
        y={SEAL_Y + SEAL_INNER_INSET}
        width={SEAL_INNER_SIZE}
        height={SEAL_INNER_SIZE}
        fill="none"
        stroke={colors.surface}
        strokeWidth={SEAL_INNER_STROKE}
      />

      {/* 一角残山：只在 cover / chapter。内容页留干净的纸。 */}
      {(slide.type === "cover" || slide.type === "chapter") && (
        <path d={REMNANT_PATH} fill={colors.primary} opacity={REMNANT_OPACITY} />
      )}
    </>
  )
}
