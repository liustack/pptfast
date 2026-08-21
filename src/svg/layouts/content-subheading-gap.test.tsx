// @vitest-environment jsdom
/**
 * S3b (2026-07-07): cross-theme regression lock for the unified sub-claim
 * ("副题句") spacing formula — a shared helper looping over all six themes,
 * rather than six near-duplicate assertions scattered across each theme's
 * own test file (which already carry the theme-specific "with subheading:
 * ... y offset ..." unit test — see each `templates/*.test.tsx`'s "Content
 * subheading (Task 5)" describe block). This file instead checks the
 * *derived visual invariant* the formula exists to guarantee: the title's
 * own glyph bottom (of its *last rendered line* — `titleLastY`, not the
 * first line's `titleY`, since a wrapped 2-line title's crowding risk is
 * against whichever line actually sits closest to the subheading) and the
 * subheading's own glyph top stay >=14px apart, for every theme, using the
 * same approximation the brief's formula is built from (CJK glyph bottom ≈
 * baseline + 0.12*fontSize; this subheading font's glyph top ≈ baseline -
 * 20 — see `emphasis.ts`'s 22px accent line).
 *
 * Each theme is checked against *two* headings: a short one-liner (the
 * common case) and a real long heading that `fitHeadingLines` actually
 * wraps to 2 lines (not a manually-split string) — added per the S3b
 * addendum after two user screenshots showed the subheading crowding the
 * title specifically in the 2-line case (tech, magazine).
 * `TWO_LINE_HEADING` is verified (see the task report) to wrap to exactly 2
 * lines on all six themes' own Content heading fontSize/maxWidth via
 * `fitHeadingLines` — same string everywhere, for comparability.
 *
 * creative and magazine's subheading renders in `fonts.heading`
 * (a serif font) rather than the `fonts.body` sans font the other four
 * themes use for theirs — real getBBox measurement (Chromium 104, not
 * jsdom) showed the six-theme formula's 0.12*fontSize glyph-descent
 * assumption (calibrated against the sans-body themes) badly underestimates
 * real serif CJK descent for both of these, which is *why* their constants
 * were corrected beyond the literal 0.12 formula (see each template's own
 * S3b comment) — this test's 0.12-based `glyphBottom` approximation is
 * intentionally conservative (lower than these two themes' real descent),
 * so it still passes for them, just with a larger apparent margin than the
 * sans-body themes; it does not by itself re-verify the real-font
 * measurement (that lives in the task report + each template's own test).
 *
 * consulting is a deliberate exception (not a bug in this test): its
 * subheading anchors off the assertion banner's bottom edge, not a title
 * baseline — a filled color block has no glyph descent, so the "+0.12*
 * fontSize" term doesn't apply, and the brief calls for a flat +4 bump
 * (bannerBottom+20 -> +24) verified visually rather than re-derived from
 * the same glyph-metric formula. It gets its own, smaller-threshold check
 * below instead of being forced through the shared 14px assertion — but
 * still checked against both a 1-line and (via `bannerH`'s own 2-line
 * literal) 2-line heading, since that theme's banner height already has
 * explicit 1/2-line branches independent of font metrics.
 */
import { describe, it, expect } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle, type CanonicalThemeId } from "../../themes"
import type { PptxIR, Slide } from "@/ir"
import { CONTENT_LAYOUTS } from "./index-content"
import type { ContentLayout, ContentLayoutId } from "./types"

/** 迁移自 templates/subheading-spacing.test.tsx（P2 Wave5 删旧模板）：这是
 * component 级单测（直接调用某个具体 layout 的渲染函数验证间距公式），
 * 不是选型级测试——用哪个 layout 代表哪个主题是本文件自己的固定选择，
 * 不该随 theme.layouts 的策展内容变化而变化。W4 全集放开前曾借道
 * `THEME_DEFINITIONS[themeId].layouts.content[0]` 取值——彼时策展集是每主题
 * 精心排的 2 元素数组，`[0]` 恰好稳定指向本文件想测的那个 layout。全集
 * 放开后 `.content` 变成十主题共享的同一份 7 元素全集数组（`[0]` 恒为
 * "narrow-column"，与主题无关），该隐式假设失效——`CJK_THEME_CASES` 各条目
 * 直接点名自己要测的 layout id，不再经 theme.layouts 转一手。 */
function contentLayoutFor(id: ContentLayoutId): ContentLayout {
  return CONTENT_LAYOUTS[id]
}

const HEADING_ONE_LINE = "三大支柱"
// Verified via fitHeadingLines (see task report's verify-2line-wrap2.mts)
// to wrap to exactly 2 lines on all six themes' own Content heading
// fontSize/maxWidth combos.
const HEADING_TWO_LINE = "声明期望副本数，控制器驱动滚动更新与一键回滚，故障自愈无需人工介入"
const SUBHEADING = "效率提升三成，风险敞口下降"

function ir(themeId: CanonicalThemeId, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: themeId },
    meta: { organization: "ACME" },
    assets: { images: {} },
    slides,
  }
}

function render(node: React.ReactElement): Element {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {node}
    </svg>,
  )
  return parseSvgRoot(markup)
}

function textByContent(root: Element, content: string): Element {
  const el = Array.from(root.querySelectorAll("text")).find(
    (t) => (t.textContent ?? "").includes(content),
  )
  if (!el) throw new Error(`no <text> containing "${content}"`)
  return el
}

/**
 * The title's *last rendered line* — found by style predicate (not content
 * match, since a wrapped title's full text never appears in one <text>
 * element) and picking the one with the largest `y` (title lines render
 * top-to-bottom, so the last line has the largest baseline).
 */
function lastTitleLine(root: Element, isTitleLine: (el: Element) => boolean): Element {
  const matches = Array.from(root.querySelectorAll("text")).filter(isTitleLine)
  if (matches.length === 0) throw new Error("no title line matched")
  return matches.reduce((last, el) =>
    Number(el.getAttribute("y")) > Number(last.getAttribute("y")) ? el : last,
  )
}

/** CJK glyph bottom ≈ baseline + 0.12*fontSize (this task's brief formula). */
function glyphBottom(y: number, fontSize: number): number {
  return y + Math.round(fontSize * 0.12)
}

/** This subheading font's glyph top ≈ baseline - 20 (brief's test-point-1 convention). */
function subheadingGlyphTop(subheadingY: number): number {
  return subheadingY - 20
}

interface ThemeCase {
  id: CanonicalThemeId
  /** Which content layout this case exercises (see `contentLayoutFor`'s
   *  doc comment for why this is now named explicitly instead of taken from
   *  `theme.layouts.content[0]`). */
  layoutId: ContentLayoutId
  isTitleLine: (el: Element) => boolean
  /** Renders a Content slide (given heading + components) whose subheadingY was touched by the S3b formula. */
  renderContent: (contentLayout: ContentLayout, ctx: ReturnType<typeof buildCtx>, heading: string) => Element
}

const CJK_THEME_CASES: ThemeCase[] = [
  {
    id: "academic",
    layoutId: "rail-numbered",
    isTitleLine: (el) => el.getAttribute("font-weight") === "600",
    renderContent: (contentLayout, ctx, heading) => {
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [{ type: "paragraph", text: "核心概要。" }],
      }
      return render(contentLayout({ ir: ir("academic", [slide]), slide, index: 0, ctx }))
    },
  },
  {
    id: "tech",
    layoutId: "bento-panel",
    isTitleLine: (el) => el.getAttribute("font-weight") === "700",
    renderContent: (contentLayout, ctx, heading) => {
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [{ type: "paragraph", text: "一" }, { type: "paragraph", text: "二" }],
      }
      return render(contentLayout({ ir: ir("tech", [slide]), slide, index: 0, ctx }))
    },
  },
  {
    // tone-adaptive-content 已不被 canonical 主题引用（custom→gallery→avant→enterprise
    // 换成高色彩版式），但 layout 保留在库中，S3b 的 gap 保证仍需覆盖——
    // 忽略 harness 传入的 contentLayout 参数，直接取注册表渲染。
    id: "enterprise",
    layoutId: "tone-adaptive-content",
    isTitleLine: (el) => el.getAttribute("font-weight") === "700",
    renderContent: (_contentLayout, ctx, heading) => {
      // No background asset -> the (simpler) no-bg branch.
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [{ type: "paragraph", text: "围绕三个方向推进。" }],
      }
      const tone = CONTENT_LAYOUTS["tone-adaptive-content"]
      return render(tone({ ir: ir("enterprise", [slide]), slide, index: 0, ctx }))
    },
  },
  {
    id: "insight",
    layoutId: "stacked-poster",
    isTitleLine: (el) => el.getAttribute("font-weight") === "500",
    renderContent: (contentLayout, ctx, heading) => {
      // >=3 components forces the degrade (stacked) path — the one S3b actually
      // moved (+38->+50); the poster path's own +46 is a separate regression
      // lock (see creative.test.tsx's "poster path, with subheading").
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [
          { type: "paragraph", text: "第一段。" },
          { type: "bullets", items: ["要点一", "要点二"] },
          { type: "paragraph", text: "第三段。" },
        ],
      }
      return render(contentLayout({ ir: ir("insight", [slide]), slide, index: 0, ctx }))
    },
  },
  {
    id: "journal",
    layoutId: "narrow-column",
    isTitleLine: (el) => el.getAttribute("font-weight") === "600",
    renderContent: (contentLayout, ctx, heading) => {
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [{ type: "paragraph", text: "一" }, { type: "paragraph", text: "二" }],
      }
      return render(contentLayout({ ir: ir("journal", [slide]), slide, index: 0, ctx }))
    },
  },
]

describe("S3b: title-bottom vs subheading-top gap stays >=14px (shared helper, six themes)", () => {
  describe.each(CJK_THEME_CASES.map((c) => [c.id, c] as const))("%s", (_id, theme) => {
    it.each([
      ["1-line heading", HEADING_ONE_LINE],
      ["2-line heading (real fitHeadingLines wrap)", HEADING_TWO_LINE],
    ])("%s: gap between title glyph bottom and subheading glyph top is >=14px", (_label, heading) => {
      const contentLayout = contentLayoutFor(theme.layoutId)
      const tokens = resolveStyle(theme.id)
      const ctx = buildCtx(tokens, {})
      const root = theme.renderContent(contentLayout, ctx, heading)

      const title = lastTitleLine(root, theme.isTitleLine)
      const titleBottom = glyphBottom(Number(title.getAttribute("y")), Number(title.getAttribute("font-size")))
      const subTop = subheadingGlyphTop(Number(textByContent(root, SUBHEADING).getAttribute("y")))
      const gap = subTop - titleBottom
      expect(gap).toBeGreaterThanOrEqual(14)
    })
  })

  // consulting: banner-anchored, not title-glyph-anchored (see file header).
  describe("consulting: subheading clears the assertion banner's bottom edge (banner has no glyph descent, so this is a flat +4 bump, not the title-glyph formula)", () => {
    it.each([
      ["1-line heading (88px banner)", HEADING_ONE_LINE],
      ["2-line heading, real fitHeadingLines wrap (132px banner)", HEADING_TWO_LINE],
    ])("%s", (_label, heading) => {
      const contentLayout = contentLayoutFor("banner-heading")
      const tokens = resolveStyle("consulting")
      const ctx = buildCtx(tokens, {})
      const slide: Slide = {
        type: "content",
        heading,
        subheading: SUBHEADING,
        components: [{ type: "paragraph", text: "支撑论据。" }],
      }
      const root = render(contentLayout({ ir: ir("consulting", [slide]), slide, index: 0, ctx }))

      const banner = Array.from(root.querySelectorAll("rect")).find(
        (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "80",
      )!
      const bannerBottom = Number(banner.getAttribute("y")) + Number(banner.getAttribute("height"))
      const subheadingY = Number(textByContent(root, SUBHEADING).getAttribute("y"))

      // S3b: bannerBottom + 24 (was +20) — the plain baseline-to-edge gap
      // (not glyph-top-reduced, since there's no glyph on the banner side).
      // Invariant regardless of 1 vs 2 lines — bannerH is a fixed 88/132
      // literal per line count, not font-metric-driven, so there's no
      // wrapping-specific crowding risk here the way there is for the
      // title-glyph-anchored themes above.
      expect(subheadingY - bannerBottom).toBe(24)
      expect(subheadingY - bannerBottom).toBeGreaterThan(20)
    })
  })
})
