import type {
  ArchitectureLayer,
  Block,
  FlowEdge,
  FlowNode,
  PptxIR,
  Slide,
  TimelineMilestone,
} from "@/ir"

/**
 * Extreme-content stress fixtures for the overflow auditor (see svg-audit.ts).
 * These decks are deliberately pathological — they document current overflow
 * bugs (B-2 work list), not a "should render nicely" showcase. Do not tune
 * the renderers to make these fixtures look good; fix the renderers instead
 * (later tasks) and let these snapshots shrink toward empty.
 */

export const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
/**
 * S3e: em-dash variant of `CJK_LONG`, same rough length/severity, for the
 * `heading` deck's `content` entry — closes a fixture gap the S3e review
 * flagged (no `heading:` field anywhere in this file had ever exercised an
 * em dash through the real heading wrap/shrink + dual-gate pipeline, unlike
 * `callout`/`quote`'s `text` fields, which S3c's `PUNCTUATION_STRESS`
 * already covers). Templates render headings via `fitHeadingLines` →
 * `layoutSvgText` → `measureTextUnits` (already fixed by S3c), not this
 * file's own `heading-fit.ts` `visualUnits` (fixed by S3e) — so this entry
 * mainly validates that the two sibling fixes compose correctly end-to-end
 * on a real heading, not just in `heading-fit.test.ts`'s isolated units.
 */
export const CJK_LONG_WITH_DASH =
  "微服务架构下的分布式事务一致性保障机制与补偿策略——设计规范以及跨可用区容灾演练的完整落地路径说明"
export const EN_LONG =
  "comprehensive-distributed-transaction-consistency-guarantee-and-compensation-strategy"
export const MIXED_LONG =
  "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"

/** Diagram node/layer labels: brief calls for "截 20 字" off MIXED_LONG. */
const DIAGRAM_LABEL = MIXED_LONG.slice(0, 20)
/** Chart series/category labels: brief calls for "截 24 字" off MIXED_LONG. */
const CHART_LABEL = MIXED_LONG.slice(0, 24)
/**
 * icon_cards/steps `text` field stress content: long enough to push
 * `layoutSvgText`'s 2-line font-shrink past its own floor (1px/unit — see
 * `blocks/icon-cards.tsx`'s `layoutIconCard` / `blocks/steps.tsx`'s
 * `layoutStepItem`). A near-miss length wouldn't exercise the fit-fallback
 * this deck is stress-testing; this repeat count decisively does (verified
 * against the narrowest per-card content width across all 6 themes).
 */
const CARD_TEXT_STRESS = CJK_LONG.repeat(8)
/** verdict_banner `text` stress content: extreme length with an embedded
 * `**强调**` run, so both the wrap/shrink-past-2-lines path and the
 * emphasis-segment re-slicing/truncation must hold together. */
const VERDICT_TEXT_STRESS = `${CJK_LONG}${CJK_LONG}**${MIXED_LONG}${MIXED_LONG}**${CJK_LONG}${CJK_LONG}`
/**
 * callout/quote punctuation-weight stress content (S3c). Matches the
 * user-reported repro: a doubled em dash ("——", the idiomatic CJK long-dash
 * mark) mixed with fullwidth punctuation (fullwidth comma/period/parens,
 * book-title marks, corner brackets, fullwidth colon) and a trailing
 * halfwidth "60%" figure — before the fix, `measureTextUnits` priced the em
 * dash and curly quotes as narrow "other" (0.46) glyphs, so this exact class
 * of sentence wrapped one character too wide and the real glyphs then
 * overran the box, clipping the trailing percentage. Neither `callout` nor
 * `quote` previously had any fixture exercising this character class at all
 * (both gates' blind spot before this task).
 *
 * Deliberately no ASCII spaces anywhere in this string (unlike MIXED_LONG):
 * `svg-text-layout.ts`'s `tokenize()` switches to whole-word wrapping the
 * moment a string contains even one space, which only ever breaks lines at
 * a space boundary — the per-character weight this task fixes stops
 * mattering to the wrap decision once whole words, not characters, are the
 * unit being packed (verified empirically: the same sentence with spaces
 * inserted around its digit runs wraps identically before and after this
 * fix at every width tried, so it would silently pass this gate whether or
 * not the bug existed). Character-by-character wrapping is also what the
 * user's original screenshot showed, and is the realistic case for
 * punctuation-dense CJK prose with no Latin/digit runs long enough to want
 * a protective space.
 */
const PUNCTUATION_STRESS =
  "系统吞吐量提升——从每秒吞吐一万两千笔跃升至一万八千五百笔，性能提升幅度高达60%——这一飞跃式增长（详见《验证报告》「附录二」）证明了架构升级的必要性：全链路压测通过率达到100%。"
/**
 * ending "tightest nominal two-line" stress heading (5b, wave-B S3b review
 * Important #2). The pre-existing `ending` entry below uses `CJK_LONG`,
 * which is so long it shrinks academic/consulting's Ending heading
 * all the way down to (or near) their `minPt` floor — a much smaller glyph
 * pushes the downstream contact/copyright chain far less than a *realistic*
 * heading that wraps to 2 lines without shrinking at all, so `CJK_LONG`
 * alone never exercised those two themes' actual worst case (their Ending
 * templates clamp the first line's upward shift to `ENDING_TWO_LINE_SHIFT_
 * MAX` — see academic.tsx/consulting.tsx's own "Two-line title
 * reflow" comments — so a 2-line heading at *nominal* size pushes
 * `headingLastY`, and everything anchored off it, further down than any
 * shrunk heading can).
 *
 * This is the first 12 characters of `"从今天开始，用声明式管理你的
 * 集群"` — the literal user-reported repro string already named in
 * academic.tsx/consulting.tsx/creative.tsx's own "Two-line
 * title reflow" comments — truncated to the exact length window (verified
 * by brute-force probing every prefix length through the real
 * `fitHeadingLines`, the same method `templates/subheading-spacing.test.
 * tsx`'s `HEADING_TWO_LINE` used) where *both* org-logo-constrained themes
 * simultaneously wrap to exactly 2 lines at their own nominal (un-shrunk)
 * Ending fontSize — academic's window is 7-12 chars (fontSize 120,
 * maxWidth 768) and consulting's is 9-16 chars (fontSize 132, maxWidth
 * 1088); 9-12 is the overlap, and every length in that overlap resolves to
 * the theme's own identical worst-case downstream Y (only `lines.length`
 * and the nominal `lineHeight` matter once fontSize stops shrinking — the
 * exact split point between the two lines does not), so any prefix in that
 * range is equally "worst case", not just this one. The other four themes
 * (tech/custom/creative/magazine) anchor their Ending's
 * *last* heading line to a fixed baseline regardless of line count (see
 * each template's own "Last-line-anchored" comment), so unlike the two
 * constrained themes above, a 2-line heading costs them nothing — this
 * string doesn't need to hit their own individual worst case too, only
 * avoid regressing them (covered by the same dual-gate run as every other
 * entry in this file).
 */
const ENDING_TIGHT_HEADING = "从今天开始，用声明式管理"

function deck(slides: Slide[]): PptxIR {
  return {
    version: "2",
    filename: "stress.pptx",
    theme: { id: "consulting" },
    meta: { organization: "压力测试" },
    assets: { images: {} },
    slides,
  }
}

export const STRESS_DECKS: Record<string, PptxIR> = {
  // heading: cover/chapter/content/ending each with an extreme-length CJK
  // heading and mixed-script subheading.
  //
  // S3b addendum (2026-07-07): `ending` added here — this deck previously
  // had no ending-type fixture at all, so the zero-overflow/real-machine
  // gates never exercised a 2-line ending title, an existing blind spot the
  // dual gates now catch (a user-reported bug: creative's ending
  // overflowed the page bottom for a realistic 2-line heading). `CJK_LONG`
  // reliably forces >=2 lines (and some shrink) across all six themes' own
  // Ending heading fontSize/maxWidth combos, matching this deck's existing
  // cover/chapter/content entries rather than a one-off string.
  //
  // 5b addendum (S3b review Important #2, wave B): a *second* `ending`
  // entry using `ENDING_TIGHT_HEADING` (see its own doc comment above) —
  // `CJK_LONG`'s shrink-to-floor case and this nominal-two-line case
  // exercise genuinely different code paths in `fitHeadingLines` (the
  // shrink branch vs. the wrap-without-shrink branch) and different
  // downstream-Y outcomes, so both stay rather than one replacing the
  // other. This entry is also why `meta` below now carries `contact` and
  // `copyright` (the pre-existing entry never triggered their rendering at
  // all — `deck()`'s default `meta` sets only `organization` — so the
  // contact/copyright chain that actually lands closest to the page bottom
  // was never audited by either gate before this addition).
  //
  // S3e addendum: `content`'s heading swapped from plain `CJK_LONG` to
  // `CJK_LONG_WITH_DASH` (see its own doc comment above) — same rough
  // length/severity, but exercises an em dash through this deck's real
  // dual-gate rendering pipeline for the first time.
  heading: {
    ...deck([
      { type: "cover", heading: CJK_LONG, subheading: MIXED_LONG, blocks: [] },
      { type: "chapter", heading: CJK_LONG, subheading: MIXED_LONG, blocks: [] },
      {
        type: "content",
        variant: "single",
        heading: CJK_LONG_WITH_DASH,
        subheading: MIXED_LONG,
        blocks: [],
      },
      { type: "ending", heading: CJK_LONG, subheading: MIXED_LONG, blocks: [] },
      {
        type: "ending",
        heading: ENDING_TIGHT_HEADING,
        subheading: MIXED_LONG,
        blocks: [],
      },
    ]),
    meta: {
      organization: "压力测试",
      contact: { email: "contact@example.com", website: "example.com" },
      copyright: "© 2026 压力测试出品 保留所有权利",
    },
  },

  // bullets: single-column and two-column content pages, 6 extreme-length
  // items each, covering numbered and checklist styles.
  bullets: deck([
    {
      type: "content",
      variant: "single",
      heading: "要点压力测试",
      blocks: [
        {
          type: "bullets",
          style: "numbered",
          items: [
            CJK_LONG,
            MIXED_LONG,
            CJK_LONG,
            MIXED_LONG,
            CJK_LONG,
            MIXED_LONG,
          ],
        },
      ],
    },
    {
      type: "content",
      variant: "two_column",
      heading: "要点双栏压力测试",
      blocks: [
        {
          type: "bullets",
          style: "checklist",
          items: [CJK_LONG, MIXED_LONG, CJK_LONG],
        },
        {
          type: "bullets",
          style: "numbered",
          items: [MIXED_LONG, CJK_LONG, MIXED_LONG],
        },
      ],
    },
  ]),

  // kpi: a 4-card kpi_focus page plus a big_number hero page, both with
  // extreme value/unit/label lengths — plus a big_number page whose hero is
  // followed by ordinary supporting blocks (2 bullets + 1 long paragraph),
  // stress-testing the bespoke variant's supporting-block stacking path.
  kpi: deck([
    {
      type: "content",
      variant: "kpi_focus",
      heading: "KPI 压力测试",
      blocks: [
        {
          type: "kpi_cards",
          items: [
            {
              value: "1,234,567.89",
              unit: "次/秒",
              label: MIXED_LONG,
              delta: "up",
            },
            {
              value: "1,234,567.89",
              unit: "次/秒",
              label: MIXED_LONG,
              delta: "down",
            },
            {
              value: "1,234,567.89",
              unit: "次/秒",
              label: MIXED_LONG,
              delta: "flat",
            },
            { value: "1,234,567.89", unit: "次/秒", label: MIXED_LONG },
          ],
        },
      ],
    },
    {
      type: "content",
      variant: "big_number",
      heading: "大数字压力测试",
      blocks: [
        {
          type: "kpi_cards",
          items: [{ value: "1,234,567.89", unit: "次/秒", label: MIXED_LONG }],
        },
      ],
    },
    {
      type: "content",
      variant: "big_number",
      heading: "大数字支撑内容压力测试",
      blocks: [
        {
          type: "kpi_cards",
          items: [{ value: "1,234,567.89", unit: "次/秒", label: MIXED_LONG }],
        },
        {
          type: "bullets",
          style: "numbered",
          items: [CJK_LONG, MIXED_LONG],
        },
        {
          type: "bullets",
          style: "checklist",
          items: [CJK_LONG, MIXED_LONG],
        },
        {
          type: "paragraph",
          text: `${CJK_LONG}${CJK_LONG}${CJK_LONG}`,
        },
      ],
    },
  ]),

  // citation: 4 sources with extreme-length labels and URLs.
  citation: deck([
    {
      type: "content",
      variant: "single",
      heading: "引用压力测试",
      blocks: [
        {
          type: "citation",
          sources: [
            {
              label: CJK_LONG,
              url: `https://example.com/${EN_LONG}/${EN_LONG}?query=${EN_LONG}`,
            },
            { label: CJK_LONG, url: `https://example.com/${EN_LONG}` },
            {
              label: CJK_LONG,
              url: `https://example.com/${EN_LONG}/${EN_LONG}`,
            },
            {
              label: CJK_LONG,
              url: `https://example.com/${EN_LONG}/${EN_LONG}/${EN_LONG}`,
            },
          ],
        },
      ],
    },
  ]),

  // paragraph_stack: 6 paragraphs, each 3x CJK_LONG — vertical overflow
  // pressure on a single content page (no horizontal pressure; paragraph
  // wraps by design).
  paragraph_stack: deck([
    {
      type: "content",
      variant: "single",
      heading: "段落堆叠压力测试",
      blocks: Array.from(
        { length: 6 },
        (): Block => ({
          type: "paragraph",
          text: `${CJK_LONG}${CJK_LONG}${CJK_LONG}`,
        })
      ),
    },
  ]),

  // diagram: flowchart (8 nodes), architecture (4 layers x 4 items), and
  // timeline (6 milestones), each with extreme-length labels.
  diagram: deck([
    {
      type: "content",
      variant: "single",
      heading: "流程图压力测试",
      blocks: [
        {
          type: "flowchart",
          direction: "TB",
          nodes: Array.from(
            { length: 8 },
            (_, i): FlowNode => ({ id: `n${i}`, label: `${DIAGRAM_LABEL}${i}` })
          ),
          edges: Array.from(
            { length: 7 },
            (_, i): FlowEdge => ({ from: `n${i}`, to: `n${i + 1}` })
          ),
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "架构图压力测试",
      blocks: [
        {
          type: "architecture",
          // architecture items are never wrapped/truncated by the renderer, so
          // use the full (untrimmed) MIXED_LONG per item — 4 of them joined
          // guarantees a decisive h-overflow rather than a near-miss.
          layers: Array.from(
            { length: 4 },
            (_, i): ArchitectureLayer => ({
              title: `第${i + 1}层`,
              items: [MIXED_LONG, MIXED_LONG, MIXED_LONG, MIXED_LONG],
            })
          ),
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "时间线压力测试",
      blocks: [
        {
          type: "timeline",
          milestones: Array.from(
            { length: 6 },
            (_, i): TimelineMilestone => ({
              date: `Q${(i % 4) + 1}`,
              title: DIAGRAM_LABEL,
              desc: MIXED_LONG,
            })
          ),
        },
      ],
    },
  ]),

  // chart: two_column page with two charts, series/category names truncated
  // to 24 chars per the brief — plus an assertion_evidence page (chart
  // evidence + 2 long supporting blocks) stress-testing the bespoke variant's
  // supporting-block stacking path.
  chart: deck([
    {
      type: "content",
      variant: "two_column",
      heading: "图表压力测试",
      blocks: [
        {
          type: "chart",
          chart_type: "bar",
          axes: { x_title: CHART_LABEL, y_title: CHART_LABEL, show_grid: true },
          series: [
            {
              name: CHART_LABEL,
              data: [
                { x: CHART_LABEL, y: 10 },
                { x: CHART_LABEL, y: 20 },
                { x: CHART_LABEL, y: 15 },
              ],
            },
          ],
        },
        {
          type: "chart",
          chart_type: "line",
          axes: { x_title: CHART_LABEL, y_title: CHART_LABEL },
          series: [
            {
              name: CHART_LABEL,
              data: [
                { x: CHART_LABEL, y: 5 },
                { x: CHART_LABEL, y: 25 },
              ],
            },
            {
              name: CHART_LABEL,
              data: [
                { x: CHART_LABEL, y: 8 },
                { x: CHART_LABEL, y: 18 },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "content",
      variant: "assertion_evidence",
      heading: "论证证据支撑内容压力测试",
      blocks: [
        {
          type: "chart",
          chart_type: "bar",
          axes: { x_title: CHART_LABEL, y_title: CHART_LABEL, show_grid: true },
          series: [
            {
              name: CHART_LABEL,
              data: [
                { x: CHART_LABEL, y: 10 },
                { x: CHART_LABEL, y: 20 },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          text: `${CJK_LONG}${CJK_LONG}`,
        },
        {
          type: "bullets",
          style: "numbered",
          items: [CJK_LONG, MIXED_LONG, CJK_LONG],
        },
      ],
    },
  ]),

  // comparison_quote_code: comparison (4x4 long cells), quote (3x CJK_LONG
  // plus the S3c punctuation-stress segment), code (extreme-length line),
  // callout (CJK_LONG/MIXED_LONG plus the same punctuation-stress segment),
  // and image (long caption), one page each.
  comparison_quote_code: deck([
    {
      type: "content",
      variant: "single",
      heading: "对比表压力测试",
      blocks: [
        {
          type: "comparison",
          columns: [MIXED_LONG, MIXED_LONG, MIXED_LONG, MIXED_LONG],
          rows: Array.from({ length: 4 }, () => ({
            label: MIXED_LONG,
            cells: [MIXED_LONG, MIXED_LONG, MIXED_LONG, MIXED_LONG],
          })),
        },
      ],
    },
    {
      type: "content",
      variant: "quote",
      heading: "引言压力测试",
      blocks: [
        {
          type: "quote",
          text: `${CJK_LONG} ${CJK_LONG} ${CJK_LONG} ${PUNCTUATION_STRESS}`,
          attribution: MIXED_LONG,
        },
      ],
    },
    {
      type: "content",
      variant: "code",
      heading: "代码压力测试",
      blocks: [
        {
          type: "code",
          language: "ts",
          code: `const veryLongIdentifierNameForStressTesting = "${EN_LONG}-${EN_LONG}-${EN_LONG}"`,
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "标注压力测试",
      blocks: [
        {
          type: "callout",
          variant: "warn",
          text: `${CJK_LONG} ${MIXED_LONG} ${PUNCTUATION_STRESS}`,
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "配图压力测试",
      blocks: [
        {
          type: "image",
          asset_id: "missing",
          fit: "cover",
          caption: `${CJK_LONG}${MIXED_LONG}`,
        },
      ],
    },
  ]),

  // new_blocks_stress: icon_cards (4-item schema max, extreme title+text —
  // triggers both fitSvgLine's single-line truncation and layoutSvgText's
  // 2-line shrink), steps (5-item schema max in a two_column page, narrow
  // enough on every theme to force the horizontal-degrades-to-vertical
  // width threshold — see steps.tsx's needsVerticalLayout), verdict_banner
  // (extreme text + icon + an embedded **强调** run), and a mixed page
  // (icon_cards + verdict_banner sharing a page with a long subheading, so
  // the subheading's fixed content-rect budget interacts with real block
  // content instead of the "heading" deck's blocks:[] empty pages).
  new_blocks_stress: deck([
    {
      type: "content",
      variant: "single",
      heading: "图标卡片压力测试",
      blocks: [
        {
          type: "icon_cards",
          items: [
            { icon: "target", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "rocket", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "shield-check", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "chart-line", title: MIXED_LONG, text: CARD_TEXT_STRESS },
          ],
        },
      ],
    },
    {
      // Full-width single variant: 5 items keeps cardW well above
      // MIN_CARD_W(180) on 5 of 6 themes (only magazine's narrower
      // COLUMN_W=880 already tips into vertical mode here), so this page
      // targets the *horizontal* card layout's own narrow per-card width.
      type: "content",
      variant: "single",
      heading: "步骤压力测试（横排）",
      blocks: [
        {
          type: "steps",
          items: Array.from({ length: 5 }, () => ({
            title: MIXED_LONG,
            text: CARD_TEXT_STRESS,
          })),
        },
      ],
    },
    {
      // two_column halves the width again (~424-532px), reliably below the
      // n=5 vertical-degrade threshold (needsVerticalLayout: 5*180+4*40=1060)
      // on every theme — this page targets the *vertical* (degraded) mode.
      type: "content",
      variant: "two_column",
      heading: "步骤压力测试（纵排降级）",
      blocks: [
        {
          type: "steps",
          items: Array.from({ length: 5 }, () => ({
            title: MIXED_LONG,
            text: CARD_TEXT_STRESS,
          })),
        },
        {
          type: "steps",
          items: Array.from({ length: 5 }, () => ({
            title: MIXED_LONG,
            text: CARD_TEXT_STRESS,
          })),
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "结论横幅压力测试",
      blocks: [
        {
          type: "verdict_banner",
          text: VERDICT_TEXT_STRESS,
          tone: "warning",
          icon: "triangle-alert",
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "混排内容压力测试",
      subheading: MIXED_LONG,
      blocks: [
        {
          type: "icon_cards",
          items: [
            { icon: "target", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "rocket", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "shield-check", title: MIXED_LONG, text: CARD_TEXT_STRESS },
            { icon: "chart-line", title: MIXED_LONG, text: CARD_TEXT_STRESS },
          ],
        },
        {
          type: "verdict_banner",
          text: VERDICT_TEXT_STRESS,
          tone: "positive",
          icon: "shield-check",
        },
      ],
    },
  ]),

  // flowchart_edge_labels: two content pages exercising the *edge label*
  // fitting/audit path specifically — the "diagram" deck above only stresses
  // flowchart *nodes* (its edges carry no labels at all), so no fixture
  // previously exercised a labeled edge. A 6-node TB chain and an 8-node LR
  // chain are the exact node-count thresholds at which `fitScale` shrinks
  // `scale` enough to expose a since-fixed bug where the edge label's
  // available-width formula subtracted its fit margin in page space
  // (post-scale) instead of local space (pre-scale) — at those thresholds
  // every edge label collapsed to a bare "…" or empty string regardless of
  // how short the label text was (see flowchart.tsx's `LABEL_FIT_MARGIN`
  // comment). Edges mix short (是/否-style) and long, real reported-bug-
  // length descriptive labels ("创建 / 维护同步状态", the exact label from
  // that bug report). Every theme's "single" content width (880-1152, see
  // templates/*.tsx) must clear this without a bare "…"/empty label — now
  // re-checked by this gate itself: the label chip carries its own
  // `data-audit-box` sized to the physical node-to-node gap (previously an
  // audit blind spot — no fixture had a labeled edge, and the label carried
  // no box at all to audit against).
  flowchart_edge_labels: deck([
    {
      type: "content",
      variant: "single",
      heading: "流程图边标签压力测试（纵向）",
      blocks: [
        {
          type: "flowchart",
          direction: "TB",
          nodes: Array.from(
            { length: 6 },
            (_, i): FlowNode => ({ id: `n${i}`, label: `${DIAGRAM_LABEL}${i}` })
          ),
          edges: [
            { from: "n0", to: "n1", label: "创建 / 维护同步状态" },
            { from: "n1", to: "n2", label: "是" },
            { from: "n2", to: "n3", label: "否" },
            { from: "n3", to: "n4", label: "校验通过后归档" },
            { from: "n4", to: "n5", label: "确认" },
          ],
        },
      ],
    },
    {
      type: "content",
      variant: "single",
      heading: "流程图边标签压力测试（横向）",
      blocks: [
        {
          type: "flowchart",
          direction: "LR",
          nodes: Array.from(
            { length: 8 },
            (_, i): FlowNode => ({ id: `n${i}`, label: `${DIAGRAM_LABEL}${i}` })
          ),
          edges: Array.from(
            { length: 7 },
            (_, i): FlowEdge => ({
              from: `n${i}`,
              to: `n${i + 1}`,
              label: i % 2 === 0 ? "创建 / 维护同步状态" : "确认",
            })
          ),
        },
      ],
    },
  ]),
}
