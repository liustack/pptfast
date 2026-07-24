// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { measureComponent } from "../components"
import { StackedPosterContent } from "./content-stacked-poster"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

// BrandChrome's brand logo bands (brand-chrome.tsx logoBox: image at
// width=96 height=40, positioned tl/tr/bl/br). Ported from
// templates/creative.test.tsx — the poster grammar's entire premise is
// centering everything on x=640 so its x-extent stays within [190,1090],
// clear of both corner columns regardless of y.
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const chapter1: Slide = { type: "chapter", heading: "第一章", components: [] } as Slide

// 1 块：海报路径的单主视觉 rect。
const oneComponentSlide: Slide = {
  type: "content",
  heading: "核心指标",
  components: [{ type: "paragraph", text: "本季度表现优异。" }],
} as Slide

// 2 块：海报路径的主视觉 + 标注条。
const twoComponentSlide: Slide = {
  type: "content",
  heading: "双栏演示",
  components: [
    { type: "paragraph", text: "主视觉说明文字。" },
    { type: "paragraph", text: "补充说明。" },
  ],
} as Slide

// >=3 块：降级为原始左对齐堆叠构图。
const threeComponentSlide: Slide = {
  type: "content",
  heading: "多块降级",
  components: [
    { type: "paragraph", text: "第一段。" },
    { type: "bullets", items: ["要点一", "要点二"], style: "default" },
    { type: "paragraph", text: "第三段。" },
  ],
} as Slide

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

/** Parse a `data-audit-rect` attribute value into a box. */
function parseAudit(attr: string | null | undefined): { x: number; y: number; w: number; h?: number } {
  const [x, y, w, h] = (attr ?? "").split(",").map(Number)
  return { x, y, w, h }
}

// 档位二（观感等价档，见文件头"孤儿色处理"）：META_MUTED（#666670）在
// creative token 表里没有精确匹配，并入 ctx.colors.muted——验收退化为结构性
// 锚点 + 内容存在 + 归并掉的孤儿色不再出现，而非逐字节 toBe。
describe("StackedPosterContent", () => {
  it("creative tokens 下 1 块：居中海报——muted kicker、accent 短横条走 primary、800-weight 居中标题（text）、单个主视觉 rect 到 y=640", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight", [chapter1, oneComponentSlide])
    const { markup, root } = render(
      <StackedPosterContent ir={deck} slide={oneComponentSlide} index={1} ctx={ctx} />,
    )
    expect(markup).not.toContain("foreignObject")
    expect(markup).toContain("核心指标")

    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("核心指标"),
    )!
    expect(title.getAttribute("text-anchor")).toBe("middle")
    expect(title.getAttribute("x")).toBe("640")
    expect(title.getAttribute("font-weight")).toBe("800")
    expect(title.getAttribute("fill")).toBe(ctx.colors.text)

    // Kicker: section label (from the preceding chapter) is muted, not primary.
    // Regression lock for defect C (bench-driven fixes wave, task 4): the
    // "Chapter NN · <section>" prefix word used to be hardcoded Chinese
    // ("章节") regardless of deck language — asserting the full string (not
    // just the section-name substring the earlier version of this test
    // checked) locks the English prefix landed and stayed in this exact
    // "Chapter 01 · " shape.
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一章"),
    )!
    expect(kicker.textContent).toBe("Chapter 01 · 第一章")
    expect(kicker.getAttribute("fill")).toBe(ctx.colors.muted)

    // Accent hairline (AccentBar inlined): the only primary-filled element.
    const accentBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("y") === "104" && r.getAttribute("width") === "60",
    )!
    expect(accentBar.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(accentBar.getAttribute("x")).toBe("610") // centered: 640 - 60/2

    // Accent hairline is the *only* primary-filled element — no text uses
    // primary as a text color on the poster path.
    const primaryTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.primary,
    )
    expect(primaryTexts.length).toBe(0)

    // Single hero rect, x=190 w=900, bottom fixed at 640 (1-component mode).
    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.x).toBe(190)
    expect(heroRect.w).toBe(900)
    expect(heroRect.y! + heroRect.h!).toBe(640)

    // No bottom strip / divider in 1-component mode.
    expect(root.querySelector('line[y1="520"]')).toBeNull()
  })

  it("creative tokens 下 2 块：主视觉在 y=520 让位，border 分隔线，标注条 rect y=532->640", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight", [twoComponentSlide])
    const { root } = render(<StackedPosterContent ir={deck} slide={twoComponentSlide} index={0} ctx={ctx} />)

    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.y! + heroRect.h!).toBe(520)

    const divider = root.querySelector('line[y1="520"]')!
    expect(divider).toBeTruthy()
    expect(divider.getAttribute("stroke")).toBe(ctx.colors.border)
    expect(divider.getAttribute("x1")).toBe("190")
    expect(divider.getAttribute("x2")).toBe("1090")

    const rects = Array.from(root.querySelectorAll("g")).filter((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )
    expect(rects.length).toBe(2)
    const stripRect = parseAudit(rects[1].getAttribute("data-audit-rect"))
    expect(stripRect.y).toBe(532)
    expect(stripRect.y! + stripRect.h!).toBe(640)
    expect(stripRect.w).toBe(900)
  })

  it("creative tokens 下 ≥3 块：降级为左对齐 kicker(primary)/500-weight 标题(text)/border 分隔线/满宽堆叠，无海报短横条", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight", [chapter1, threeComponentSlide])
    const { markup, root } = render(
      <StackedPosterContent ir={deck} slide={threeComponentSlide} index={1} ctx={ctx} />,
    )
    expect(markup).toContain("多块降级")

    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("多块降级"),
    )!
    expect(title.getAttribute("x")).toBe("56")
    expect(title.getAttribute("text-anchor")).not.toBe("middle")
    expect(title.getAttribute("font-weight")).toBe("500")
    expect(title.getAttribute("fill")).toBe(ctx.colors.text)

    // Section label (kicker replacement on the degrade path) is primary,
    // not muted — a different color role than the poster path's kicker.
    // Defect C regression lock (see the poster-path kicker test above): the
    // degrade path's own copy of the "Chapter NN · <section>" breadcrumb
    // must carry the same English prefix.
    const sectionLabel = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一章"),
    )!
    expect(sectionLabel.textContent).toBe("Chapter 01 · 第一章")
    expect(sectionLabel.getAttribute("fill")).toBe(ctx.colors.primary)

    const topDivider = root.querySelector('line[y1="80"]')!
    expect(topDivider.getAttribute("stroke")).toBe(ctx.colors.border)

    // Full-width content rect (x=56, w=1168), not the 190/900 hero column.
    const rect = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("56,"),
    )!
    expect(parseAudit(rect.getAttribute("data-audit-rect")).w).toBe(1168)

    // No poster-mode accent hairline (y=104,w=60) on the degrade path.
    expect(
      Array.from(root.querySelectorAll("rect")).find(
        (r) => r.getAttribute("y") === "104" && r.getAttribute("width") === "60",
      ),
    ).toBeUndefined()
  })

  it("degrade path (≥3 components) honors a non-default arrangement — W2 task 3: registry declares arrangements \"all\" for this archetype because the degrade path passes slide.arrangement straight through unchanged", () => {
    const twoColThreeComponentSlide: Slide = { ...threeComponentSlide, arrangement: "two_column" } as Slide
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight", [chapter1, twoColThreeComponentSlide])
    const { root } = render(
      <StackedPosterContent ir={deck} slide={twoColThreeComponentSlide} index={1} ctx={ctx} />,
    )
    // two_column splits the 3 components into two x-columns (ceil(3/2)=2 left,
    // 1 right) instead of one full-width (x=56, w=1168) stack.
    const boxes = Array.from(root.querySelectorAll("g[data-audit-box]")).map((g) =>
      parseAudit(g.getAttribute("data-audit-box")),
    )
    expect(boxes.length).toBe(3)
    const xs = new Set(boxes.map((b) => b.x))
    expect(xs.size).toBe(2)
    for (const b of boxes) expect(b.w).toBeLessThan(1168)
  })

  it("footnote 存在时海报/降级两条路径都走 muted（孤儿色 META_MUTED 已并入，#666670 不残留）", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})

    const posterFootnoteSlide: Slide = { ...oneComponentSlide, footnote: "数据来源：内部审计" } as Slide
    const { markup: posterOut, root: posterRoot } = render(
      <StackedPosterContent ir={ir("insight", [posterFootnoteSlide])} slide={posterFootnoteSlide} index={0} ctx={ctx} />,
    )
    const posterFootnote = posterRoot.querySelector("text[y='656']")!
    expect(posterFootnote.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(posterOut).not.toContain("#666670")

    const degradeFootnoteSlide: Slide = { ...threeComponentSlide, footnote: "数据来源：内部审计" } as Slide
    const { markup: degradeOut, root: degradeRoot } = render(
      <StackedPosterContent ir={ir("insight", [degradeFootnoteSlide])} slide={degradeFootnoteSlide} index={0} ctx={ctx} />,
    )
    const degradeFootnote = degradeRoot.querySelector("text[y='688']")!
    expect(degradeFootnote.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(degradeOut).not.toContain("#666670")
  })

  it("consulting tokens 下用 consulting 自己的 primary/text/muted/border，creative 烤死色不残留（token 化成立）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", [chapter1, oneComponentSlide])
    const out = renderSvgMarkup(<StackedPosterContent ir={deck} slide={oneComponentSlide} index={1} ctx={ctx} />)

    expect(out).toContain("#051C2C") // consulting primary（也是 text），accent 短横条 + 标题
    expect(out).toContain("#6B6B6B") // consulting muted，kicker（需要前置 chapter 才会渲染）

    // creative 烤死的 hex 一律不得残留（含并入 muted 的孤儿色 META_MUTED）
    expect(out).not.toContain("#E63946")
    expect(out).not.toContain("#F5F5F5")
    expect(out).not.toContain("#888892")
    expect(out).not.toContain("#2A2A2E")
    expect(out).not.toContain("#666670")

    const degradeOut = renderSvgMarkup(
      <StackedPosterContent ir={ir("consulting", [threeComponentSlide])} slide={threeComponentSlide} index={0} ctx={ctx} />,
    )
    expect(degradeOut).toContain("#D5D5CB") // consulting border，降级路径的分隔线
    expect(degradeOut).not.toContain("#2A2A2E")
  })

  it("1 scalable (chart) component: uniformly scales to fill the hero, capped at 1.3x", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const chartSlide: Slide = {
      type: "content",
      heading: "增长趋势",
      components: [
        {
          type: "chart",
          chart_type: "bar",
          series: [{ name: "收入", data: [{ x: "Q1", y: 1 }] }],
        },
      ],
    } as Slide
    const { root } = render(
      <StackedPosterContent ir={ir("insight", [chartSlide])} slide={chartSlide} index={0} ctx={ctx} />,
    )

    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    // chart.measure() is a fixed 240px regardless of width — the hero rect
    // (well over 240px tall for a 1-line title) drives scale = h/240 > 1, so
    // it must be clamped to the 1.3x cap rather than growing further.
    expect(heroRect.h!).toBeGreaterThan(240 * 1.3)

    const scaledGroup = root.querySelector('g[transform*="scale("]')!
    expect(scaledGroup).toBeTruthy()
    const scaleMatch = /scale\(([\d.]+)\)/.exec(scaledGroup.getAttribute("transform") ?? "")!
    const scale = Number(scaleMatch[1])
    expect(scale).toBeCloseTo(1.3, 5)

    // The scaled box (data-audit-box, inside the hero's data-audit-rect)
    // reflects the *true* rendered footprint at 1.3x — 900*1.3=1170,
    // centered so it bleeds symmetrically to x 55..1225.
    const scaledBox = heroGroup.querySelector("g[data-audit-box]")!
    const box = parseAudit(scaledBox.getAttribute("data-audit-box"))
    expect(box.w).toBeCloseTo(1170, 5)
    expect(box.x + box.w).toBeLessThanOrEqual(1225 + 1)
    expect(box.x).toBeGreaterThanOrEqual(54)
  })

  it("1 component + footnote: hero rect shrinks to bottom=600, leaving room above the y=656 footnote", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...oneComponentSlide, footnote: "数据来源：内部审计" } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)

    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.y! + heroRect.h!).toBe(600) // 640 - 40, not the fixed 640

    const footnote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("数据来源"),
    )!
    expect(footnote.getAttribute("y")).toBe("656")
  })

  it("2 components + footnote: strip bottom shrinks to 600 while the hero/divider split (520) stays put", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...twoComponentSlide, footnote: "数据来源：内部审计" } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)

    // The hero/strip split (divider) is unrelated to footnote room — it
    // stays at 520 regardless, only the strip's own floor shrinks.
    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.y! + heroRect.h!).toBe(520)

    const divider = root.querySelector('line[y1="520"]')!
    expect(divider).toBeTruthy()

    const rects = Array.from(root.querySelectorAll("g")).filter((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )
    expect(rects.length).toBe(2)
    const stripRect = parseAudit(rects[1].getAttribute("data-audit-rect"))
    expect(stripRect.y).toBe(532)
    expect(stripRect.y! + stripRect.h!).toBe(600) // 640 - 40, not the fixed 640
  })

  it("a 2-component deck whose second component can't fit the 108px caption strip degrades to the full-width stack", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      heading: "溢出降级",
      components: [
        { type: "paragraph", text: "主视觉。" },
        {
          type: "bullets",
          style: "numbered",
          items: [CJK_LONG, CJK_LONG, CJK_LONG],
        },
      ],
    } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    // Degraded: full-width rect, not the 190-wide hero column.
    const wideRect = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("56,"),
    )
    expect(wideRect).toBeTruthy()
    const posterRect = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )
    expect(posterRect).toBeUndefined()
  })

  it("a 0-component content slide degrades without crashing", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { type: "content", heading: "空白页", components: [] } as Slide
    expect(() =>
      render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />),
    ).not.toThrow()
  })

  it("kicker accent bar and hero/strip rects stay clear of all four BrandChrome logo bands", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      heading: "版位安全校验",
      components: [
        { type: "paragraph", text: "第一块。" },
        { type: "paragraph", text: "第二块。" },
      ],
    } as Slide
    const { root } = render(
      <StackedPosterContent ir={ir("insight", [chapter1, slide])} slide={slide} index={1} ctx={ctx} />,
    )

    const accentBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("y") === "104" && r.getAttribute("width") === "60",
    )!
    const accentBox = {
      x: Number(accentBar.getAttribute("x")),
      y: Number(accentBar.getAttribute("y")),
      w: Number(accentBar.getAttribute("width")),
      h: Number(accentBar.getAttribute("height")),
    }
    const rects = Array.from(root.querySelectorAll("g[data-audit-rect]")).map((g) => {
      const b = parseAudit(g.getAttribute("data-audit-rect"))
      return { x: b.x, y: b.y, w: b.w, h: b.h ?? 0 }
    })
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap(accentBox, band)).toBe(false)
      for (const r of rects) {
        expect(rectsOverlap(r, band)).toBe(false)
      }
    }
  })

  it("Content body passes subset validation in both 1-component and 2-component mode", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const oneComponent: Slide = {
      type: "content",
      heading: "验证子集",
      components: [{ type: "bullets", items: ["项目一", "项目二"], style: "default" }],
    } as Slide
    const twoComponents: Slide = {
      type: "content",
      heading: "验证子集双块",
      components: [{ type: "paragraph", text: "一" }, { type: "paragraph", text: "二" }],
    } as Slide
    for (const slide of [oneComponent, twoComponents]) {
      const { root } = render(
        <StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
      )
      expect(() => assertSubset(root)).not.toThrow()
    }
  })

  it("poster path: 超长标题（40+ 字）经 fitHeadingLines 收缩/换行渲染，不整段输出原文，通过 subset validation（补齐迁移前遗漏的长标题边缘场景）", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      heading: CJK_LONG,
      components: [{ type: "paragraph", text: "概要。" }],
    } as Slide
    // render() itself must not throw for a pathologically long heading.
    const { markup, root } = render(
      <StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()

    // Poster-path title: centered, 800-weight, colors.text.
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) =>
        t.getAttribute("font-weight") === "800" &&
        t.getAttribute("text-anchor") === "middle" &&
        t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2) // maxLines: 2
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThanOrEqual(64) // nominal
      expect(fontSize).toBeGreaterThanOrEqual(36) // minPt
    }
    expect(markup).toContain("微服务架构")
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)
  })

  it("degrade path（≥3 块）：超长标题同样收缩/换行渲染，不整段输出原文，通过 subset validation", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      heading: CJK_LONG,
      components: [
        { type: "paragraph", text: "第一段。" },
        { type: "bullets", items: ["要点一", "要点二"], style: "default" },
        { type: "paragraph", text: "第三段。" },
      ],
    } as Slide
    const { markup, root } = render(
      <StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()

    // Degrade-path title: left-aligned (x=56), 500-weight, colors.text.
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) =>
        t.getAttribute("font-weight") === "500" &&
        t.getAttribute("x") === "56" &&
        t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2) // maxLines: 2
    for (const t of headingTexts) {
      const fontSize = Number(t.getAttribute("font-size"))
      expect(fontSize).toBeLessThanOrEqual(50) // nominal
      expect(fontSize).toBeGreaterThanOrEqual(26) // minPt
    }
    expect(markup).toContain("微服务架构")
    expect(headingTexts.every((t) => t.textContent !== CJK_LONG)).toBe(true)

    // Confirms the degrade path actually triggered (not the poster path).
    expect(
      Array.from(root.querySelectorAll("g")).find((g) =>
        g.getAttribute("data-audit-rect")?.startsWith("190,"),
      ),
    ).toBeUndefined()
  })
})

describe("StackedPosterContent subheading", () => {
  it("poster path, no subheading: hero rect bottom edge stays at the pre-subheading formula", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(
      <StackedPosterContent ir={ir("insight", [oneComponentSlide])} slide={oneComponentSlide} index={0} ctx={ctx} />,
    )
    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.y).toBe(184 + 48) // titleLastY(184) + HERO_TITLE_GAP(48)
    expect(heroRect.y! + heroRect.h!).toBe(640)
    // Nothing else on the poster path renders text in colors.accent, so this
    // doubles as "no subheading rendered".
    const accentTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.accent,
    )
    expect(accentTexts.length).toBe(0)
  })

  it("poster path, with subheading: centered accent text at titleLastY+46, heroY (and hero rect fits gate) shift down 34", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...oneComponentSlide, subheading: "效率提升三成，风险敞口下降" } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const sub = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("效率提升三成"),
    )!
    expect(sub.getAttribute("text-anchor")).toBe("middle")
    expect(sub.getAttribute("x")).toBe("640")
    expect(sub.getAttribute("y")).toBe(String(184 + 46))
    expect(sub.getAttribute("fill")).toBe(ctx.colors.accent)

    const heroGroup = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("190,"),
    )!
    const heroRect = parseAudit(heroGroup.getAttribute("data-audit-rect"))
    expect(heroRect.y).toBe(184 + 48 + 34)
    expect(heroRect.y! + heroRect.h!).toBe(640)
  })

  it("emphasis markup: ** ** segments invert to colors.text at fontWeight 700 in the poster subheading", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...oneComponentSlide, subheading: "**效率提升三成**，风险敞口下降" } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const tspan = Array.from(root.querySelectorAll("tspan")).find((t) =>
      (t.textContent ?? "").includes("效率提升三成"),
    )!
    expect(tspan.getAttribute("fill")).toBe(ctx.colors.text)
    expect(tspan.getAttribute("font-weight")).toBe("700")
    const plainTspan = Array.from(root.querySelectorAll("tspan")).find((t) =>
      (t.textContent ?? "").includes("风险敞口下降"),
    )!
    expect(plainTspan.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("overly long poster subheading shrinks to 16px then truncates", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...oneComponentSlide, subheading: CJK_LONG.repeat(2) } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const sub = Array.from(root.querySelectorAll("text")).find(
      (t) => (t.textContent ?? "").includes("微服务") && t.getAttribute("text-anchor") === "middle",
    )!
    expect(sub.getAttribute("font-size")).toBe("16")
    expect((sub.textContent ?? "").endsWith("…")).toBe(true)
    expect(sub.textContent).not.toBe(CJK_LONG.repeat(2))
  })

  it("a component that fits the old (no-subheading) hero budget stops fitting once the subheading eats 34px — falls back to the stacked layout", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    // HERO_W=900; posterBottom=640 (no footnote, 1 component ⇒ not isPair).
    // No-subheading heroY = titleLastY(184)+HERO_TITLE_GAP(48) = 232 ⇒
    // budget 408. With-subheading heroY = 232+34 = 266 ⇒ budget 374.
    // W4 task 3 re-pin: `ctx.bodyFontPx` defaults to balanced delivery's 24px
    // (was a fixed 20px), so paragraph's line height is now 34px (was 28px)
    // and this probe text's slice length was retuned so it still measures
    // exactly 12 lines (408px at width 900) — comfortably inside the new
    // valid (374, 408] straddle window (empirically the slice length must
    // land in [408, 444] chars; 425 sits at its midpoint) — fits the
    // no-subheading budget (408), not the with-subheading one (374).
    const text = CJK_LONG.repeat(15).slice(0, 425)
    const component: Slide["components"][number] = { type: "paragraph", text }
    expect(measureComponent(component, 900, ctx)).toBeGreaterThan(374)
    expect(measureComponent(component, 900, ctx)).toBeLessThanOrEqual(408)

    const withoutSubheading: Slide = {
      type: "content",
      heading: "核心指标",
      components: [component],
    } as Slide
    const withSubheading: Slide = { ...withoutSubheading, subheading: "效率提升三成" } as Slide

    const { root: rootNoSub } = render(
      <StackedPosterContent ir={ir("insight", [withoutSubheading])} slide={withoutSubheading} index={0} ctx={ctx} />,
    )
    // Poster path: centered 800-weight title, hero rect at x=190.
    const titleNoSub = Array.from(rootNoSub.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("核心指标"),
    )!
    expect(titleNoSub.getAttribute("text-anchor")).toBe("middle")
    expect(titleNoSub.getAttribute("font-weight")).toBe("800")

    const { root: rootWithSub } = render(
      <StackedPosterContent ir={ir("insight", [withSubheading])} slide={withSubheading} index={0} ctx={ctx} />,
    )
    // Degrade path: left-aligned 500-weight title at x=56, no poster hero.
    const titleWithSub = Array.from(rootWithSub.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("核心指标"),
    )!
    expect(titleWithSub.getAttribute("x")).toBe("56")
    expect(titleWithSub.getAttribute("font-weight")).toBe("500")
    expect(
      Array.from(rootWithSub.querySelectorAll("g")).find((g) =>
        g.getAttribute("data-audit-rect")?.startsWith("190,"),
      ),
    ).toBeUndefined()
  })

  it("degrade path, no subheading: content rect y stays at the pre-subheading formula (180 + headingExtra)", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const { root } = render(
      <StackedPosterContent ir={ir("insight", [threeComponentSlide])} slide={threeComponentSlide} index={0} ctx={ctx} />,
    )
    const rect = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("56,"),
    )!
    expect(parseAudit(rect.getAttribute("data-audit-rect")).y).toBe(180)
    // Nothing else on the degrade path renders text in colors.accent (the
    // section label is primary, heading/footnote are text/muted), so this
    // doubles as "no subheading rendered".
    const accentTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("fill") === ctx.colors.accent,
    )
    expect(accentTexts.length).toBe(0)
  })

  it("degrade path, with subheading: left-aligned accent text at headingLastY+50, content rect shifts down 46", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { ...threeComponentSlide, subheading: "效率提升三成，风险敞口下降" } as Slide
    const { root } = render(<StackedPosterContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const sub = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("效率提升三成"),
    )!
    expect(sub.getAttribute("x")).toBe("56")
    expect(sub.getAttribute("y")).toBe("200") // headingLastY(150) + 50
    expect(sub.getAttribute("fill")).toBe(ctx.colors.accent)

    const rect = Array.from(root.querySelectorAll("g")).find((g) =>
      g.getAttribute("data-audit-rect")?.startsWith("56,"),
    )!
    const box = parseAudit(rect.getAttribute("data-audit-rect"))
    expect(box.y).toBe(180 + 46)
    expect(box.h).toBe(460 - 46) // contentH(460, no footnote) - SUBHEADING_SLOT_STACKED(46)
  })
})
