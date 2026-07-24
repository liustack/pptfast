// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { FullSlideSvg, resolveOverrideBackgroundHex } from "./full-slide-svg"
import { renderSvgMarkup, parseSvgRoot } from "./serialize"
import { assertSubset } from "./subset-validate"
import { svgToOps } from "../pptx/svg2pptx/dispatch"
import { MOTIF_ARCHETYPES } from "./motifs"
import { THEME_DEFINITIONS } from "../themes/definitions"
import { contrastRatio, readableOn } from "./ink"
import type { PptxIR, Slide } from "@/ir"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: "academic" },
    meta: { organization: "ACME", confidentiality: "internal", version: "v1", date: "2026" },
    assets: { images: {} },
    slides,
  }
}

const coverSlide: Slide = { type: "cover", heading: "年度战略回顾", subheading: "增长与韧性", components: [] }
const contentSlide: Slide = {
  type: "content",
  heading: "三大支柱",
  components: [
    { type: "paragraph", text: "我们围绕三个方向推进。" },
    { type: "bullets", items: ["效率", "增长", "韧性"], style: "default" },
    { type: "kpi_cards", items: [{ value: "37", unit: "%", label: "增长", delta: "up" }] },
  ],
  footnote: "数据来源：内部",
}

describe("FullSlideSvg", () => {
  it("renders a single svg root with no foreignObject", () => {
    const { container } = render(<FullSlideSvg ir={ir([coverSlide])} slide={coverSlide} index={0} />)
    const svgs = container.querySelectorAll("svg")
    expect(svgs.length).toBe(1)
    expect(container.querySelector("foreignObject")).toBeNull()
    // background rect + heading text present
    expect(container.querySelector("rect")).not.toBeNull()
    expect(container.textContent).toContain("年度战略回顾")
  })

  it("renders content components and footer chrome for a content slide", () => {
    const doc = ir([contentSlide])
    const { container } = render(
      <FullSlideSvg ir={doc} slide={contentSlide} index={0} />,
    )
    expect(container.textContent).toContain("三大支柱")
    // bullets markers + kpi card present
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3)
    // 页码已删（2026-07-09 用户裁决）：页脚不再出现 x / y
    expect(container.textContent).not.toContain("1 / 1")
  })

  it("serializes to an export-safe svg that round-trips to ops", () => {
    const doc = ir([contentSlide])
    const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    const ops = svgToOps(root)
    expect(ops.length).toBeGreaterThan(5)
    expect(new Set(ops.map((o) => o.kind)).has("text")).toBe(true)
  })

  it("omits the page number for export (native slide number takes over)", () => {
    const doc = ir([contentSlide])
    const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
    expect(markup).not.toContain("1 / 1")
  })

  // Wave-C S3: `data-blk` is the anchor svg2pptx's `dispatch.ts` walks to tag
  // ops with `blockIndex`, which `render.ts` then folds into the exported
  // shape's objectName. It must only ever appear when the deck explicitly
  // opts in — this is the SVG-layer half of the "static render stays
  // byte-identical by default" contract (`ComponentCtx.blockIndex`'s doc comment).
  describe("data-blk tagging (wave-C S3)", () => {
    it("never emits data-blk when meta.animation is unset", () => {
      const doc = ir([contentSlide])
      const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
      expect(markup).not.toContain("data-blk")
    })

    it('never emits data-blk when meta.animation.elements is "none"', () => {
      const doc: PptxIR = { ...ir([contentSlide]), meta: { animation: { elements: "none" } } }
      const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
      expect(markup).not.toContain("data-blk")
    })

    it('tags each component\'s content with data-blk="{index}" when elements is "auto"', () => {
      const doc: PptxIR = { ...ir([contentSlide]), meta: { animation: { elements: "auto" } } }
      const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
      // contentSlide has 3 components (paragraph, bullets, kpi_cards) at indices 0-2.
      expect(markup).toContain('data-blk="0"')
      expect(markup).toContain('data-blk="1"')
      expect(markup).toContain('data-blk="2"')
    })

    it("does not tag the slide heading/subheading (S3: 标题/副题句 不动画)", () => {
      const doc: PptxIR = { ...ir([contentSlide]), meta: { animation: { elements: "auto" } } }
      const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
      const root = parseSvgRoot(markup)
      const headingText = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("三大支柱"),
      )
      expect(headingText).toBeDefined()
      // Neither the heading's own <text> nor any of its ancestors up to <svg>
      // carry data-blk.
      let el: Element | null = headingText!
      while (el && el.tagName.toLowerCase() !== "svg") {
        expect(el.getAttribute("data-blk")).toBeNull()
        el = el.parentElement
      }
    })

    it("round-trips through svg2pptx: exported shapes carry a blk-marker-shaped blockIndex", () => {
      const doc: PptxIR = { ...ir([contentSlide]), meta: { animation: { elements: "auto" } } }
      const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={contentSlide} index={0} />)
      const ops = svgToOps(parseSvgRoot(markup))
      const blockIndices = new Set(ops.map((o) => o.blockIndex).filter((b) => b != null))
      expect(blockIndices).toEqual(new Set([0, 1, 2]))
    })
  })
})

describe("asset background auto scrim (image-layouts P1)", () => {
  const bgSlide: Slide = {
    type: "cover",
    heading: "压图封面",
    components: [],
    background: {
      kind: "asset",
      asset_id: "bg1",
      overlay: { color: "#000000", opacity: 0.3 },
    },
  }
  const withAsset = (themeId: string): PptxIR => ({
    ...ir([bgSlide]),
    theme: { id: themeId as PptxIR["theme"]["id"] },
    assets: { images: { bg1: { src: "data:image/png;base64,AAAA" } } },
  })

  it("design theme cover: dark-scrim takeover with white heading (polish 2026-07-09)", () => {
    // cover 压图页由 ImageCoverPage 接管：暗遮罩（低透，图清晰可辨）+ 白字，
    // 模型的 overlay 被忽略，P1 的雾面 scrim 不再用于 cover/chapter。
    const { container } = render(
      <FullSlideSvg ir={withAsset("academic")} slide={bgSlide} index={0} />,
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects.some((r) => r.getAttribute("fill") === "#000000")).toBe(false)
    const dark = rects.filter((r) => r.getAttribute("fill") === "#0A0E14")
    expect(dark.length).toBeGreaterThanOrEqual(2)
    for (const r of dark) {
      expect(Number(r.getAttribute("fill-opacity"))).toBeLessThanOrEqual(0.35)
    }
    const whiteTitle = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === "压图封面" && t.getAttribute("fill") === "#FFFFFF",
    )
    expect(whiteTitle).not.toBeUndefined()
  })

  it("design theme content page keeps the frosted page-color scrim", () => {
    const contentBg: Slide = {
      type: "content",
      heading: "正文压图",
      components: [{ type: "paragraph", text: "文" }],
      background: { kind: "asset", asset_id: "bg1" },
    }
    const ir2: PptxIR = { ...withAsset("academic"), slides: [contentBg] }
    const { container } = render(
      <FullSlideSvg ir={ir2} slide={contentBg} index={0} />,
    )
    const scrims = Array.from(container.querySelectorAll("rect")).filter((r) => {
      const o = r.getAttribute("fill-opacity")
      // 0.66（2026-07-09 用户裁决 0.8 看不清背景，同 background.test 边界）
      return o !== null && Number(o) >= 0.6 && Number(o) < 0.75
    })
    expect(scrims).toHaveLength(1)
  })

})

describe("resolveOverrideBackgroundHex (post-v0.3 W8 fix round, backlog item 1)", () => {
  it("passes a color spec through unchanged, same as resolveBackgroundHex", () => {
    // surfaceFallback/paintedFallback both supplied but distinct from the
    // spec's own value and from each other — proves a color spec ignores
    // both fallback arguments rather than happening to match one of them.
    expect(resolveOverrideBackgroundHex({ kind: "color", value: "#123456" }, "#FFFFFF", "#000000")).toBe("#123456")
  })

  it("reduces a gradient to its exact midpoint blend (t=0.5), not the from stop", () => {
    // Same non-vacuity discipline as the color case above — neither
    // fallback argument matches "#808080", so a pass proves the midpoint
    // policy actually ran rather than coincidentally returning a fallback.
    expect(
      resolveOverrideBackgroundHex({ kind: "gradient", from: "#FFFFFF", to: "#000000" }, "#FFFFFF", "#000000"),
    ).toBe("#808080")
    // Direction-independent — the from/to labels don't privilege either end.
    expect(
      resolveOverrideBackgroundHex({ kind: "gradient", from: "#000000", to: "#FFFFFF" }, "#FFFFFF", "#000000"),
    ).toBe("#808080")
  })

  // Final-review Major finding (whole-branch review of fix/post-v03-backlog,
  // independently discovered, not caught by task 2's own review): the asset
  // branch used to fall back to `surfaceFallback` (`resolveBackgroundHex`'s
  // own asset policy) — silently wrong for a *per-slide override*, since
  // `tokens.colors.surface` is not what an asset-background content/ending
  // slide actually paints behind text (the auto-scrim, colored
  // `themeDefaultBg` — see `background.tsx`/`full-slide-svg.tsx`'s own
  // `autoScrimColor`). Fixed by threading the caller's `themeDefaultBg`
  // through as a third `paintedFallback` argument, consulted instead of
  // `surfaceFallback` for exactly this branch — see
  // `resolveOverrideBackgroundHex`'s own "Asset policy rationale" doc
  // comment for the full paint-path justification.
  it("resolves an asset spec to paintedFallback (the actually-painted scrim color), not surfaceFallback", () => {
    expect(resolveOverrideBackgroundHex({ kind: "asset", asset_id: "x" }, "#ABCDEF", "#112233")).toBe("#112233")
  })

  it("does not fall back to surfaceFallback for an asset spec even when it differs from paintedFallback", () => {
    // Distinguishing assertion: a pre-fix implementation (`resolveBackgroundHex`'s
    // asset policy, returning `surfaceFallback`) would return "#ABCDEF" here,
    // not "#112233" — this is red-pre-fix-by-construction evidence, not just
    // a happy-path pin.
    const result = resolveOverrideBackgroundHex({ kind: "asset", asset_id: "x" }, "#ABCDEF", "#112233")
    expect(result).not.toBe("#ABCDEF")
    expect(result).toBe("#112233")
  })
})

// backlog item 1 (`.issues/notes/2026-07-18-post-v03-backlog.md` #1):
// `ctx.defaultBg` used to be blind to `slide.background`, always resolving
// to `tokens.defaultBackgrounds[slide.type]` regardless of any per-slide
// override — an archetype that paints no panel of its own and relies on
// `ctx.defaultBg` to pick readable ink (e.g. `chapter-rail-chapter.tsx`'s
// `ink = readableOn(defaultBg)`) could measure contrast against a
// background the slide never actually painted. classroom is the
// demonstrator: its own chapter default (`tokens.defaultBackgrounds.chapter`,
// "#6E8E9E", luminance ~0.251) sits in the luminance band where backlog
// item 2's `readableOn` fix (`src/svg/ink.ts`) picks dark ink — a
// deliberately much darker override color flips that pick to white,
// proving the override is actually read, not just accepted and ignored.
describe("ctx.defaultBg prefers slide.background (post-v0.3 W8 fix round, backlog item 1)", () => {
  const classroomIr = (slide: Slide): PptxIR => ({
    version: "4",
    filename: "deck.pptx",
    theme: { id: "classroom" },
    meta: {},
    assets: { images: {} },
    slides: [slide],
  })
  const HEADING = "背景覆盖探针"
  const railChapter = (background?: Slide["background"]): Slide =>
    ({
      type: "chapter",
      heading: HEADING,
      layout: "rail-chapter",
      components: [],
      ...(background ? { background } : {}),
    }) as Slide
  const headingFill = (markup: string): string | null => {
    const root = parseSvgRoot(markup)
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)
    return heading?.getAttribute("fill") ?? null
  }

  it("invariant: a slide with no background override still picks the theme's own default-background ink (byte-identical to before this fix)", () => {
    const slide = railChapter()
    const markup = renderSvgMarkup(<FullSlideSvg ir={classroomIr(slide)} slide={slide} index={0} />)
    // readableOn("#6E8E9E") — classroom's own tokens.defaultBackgrounds.chapter.
    expect(headingFill(markup)).toBe(readableOn("#6E8E9E"))
    expect(headingFill(markup)).toBe("#0A0E14")
  })

  it("a color slide.background override changes the picked ink to match the real painted background, not the theme default", () => {
    const slide = railChapter({ kind: "color", value: "#0A0A0C" }) // insight's own colors.bg — very dark
    const markup = renderSvgMarkup(<FullSlideSvg ir={classroomIr(slide)} slide={slide} index={0} />)
    expect(headingFill(markup)).toBe(readableOn("#0A0A0C"))
    expect(headingFill(markup)).toBe("#FFFFFF")
  })

  it("a gradient slide.background override resolves ctx.defaultBg via the midpoint blend, not the from stop (from and midpoint disagree here)", () => {
    // from "#000000" alone would pick white ink (readableOn("#000000") ===
    // "#FFFFFF") — the midpoint "#808080" picks dark ink instead
    // (readableOn("#808080") === "#0A0E14"), so this only passes if the
    // render path actually goes through the midpoint, not `.from`.
    expect(readableOn("#000000")).toBe("#FFFFFF")
    expect(readableOn("#808080")).toBe("#0A0E14")
    const slide = railChapter({ kind: "gradient", from: "#000000", to: "#FFFFFF" })
    const markup = renderSvgMarkup(<FullSlideSvg ir={classroomIr(slide)} slide={slide} index={0} />)
    expect(headingFill(markup)).toBe("#0A0E14")
  })

  it("an asset slide.background override does not change autoScrimColor's own theme-default source (out of this fix's scope, see full-slide-svg.tsx's own comment)", () => {
    // content (not cover/chapter) so imageCoverTakeover doesn't take over
    // and the P1 frosted auto-scrim still applies.
    const slide: Slide = {
      type: "content",
      heading: HEADING,
      components: [{ type: "paragraph", text: "文" }],
      background: { kind: "asset", asset_id: "bg1" },
    } as Slide
    const doc: PptxIR = { ...classroomIr(slide), assets: { images: { bg1: { src: "data:image/png;base64,AAAA" } } } }
    const { container } = render(<FullSlideSvg ir={doc} slide={slide} index={0} />)
    // classroom's own content default background, resolveBackgroundHex-reduced — unchanged scrim source.
    const scrim = Array.from(container.querySelectorAll("rect")).find(
      (r) => r.getAttribute("fill") === "#F4F1EB" && Number(r.getAttribute("fill-opacity")) > 0.6,
    )
    expect(scrim).not.toBeUndefined()
  })

  // Final-review Major finding (whole-branch review of fix/post-v03-backlog):
  // the test above only pins that `autoScrimColor` itself (what's actually
  // painted) stayed put — it says nothing about whether `ctx.defaultBg` (what
  // ink decisions are measured against) agrees with that painted color. This
  // is the actual regression: luxe's colors.accent ("#A67B45") measures
  // 4.42:1 against colors.surface ("#211D18", the pre-fix — wrong —
  // ctx.defaultBg for an asset override) but 4.88:1 against the real painted
  // scrim (luxe's own content default background, "#161310") — independently
  // computed via `contrastRatio` below, not assumed. 4.5:1 is the body-text
  // floor, and content-narrow-column.tsx's subheading renders at 22px (body
  // tier, confirmed in that file's own `fitEmphasisLine` call) via
  // `accessibleInk(colors.accent, ctx.defaultBg, 22)` — so this flip is live
  // today, not latent.
  it("an asset slide.background override changes ctx.defaultBg-driven ink to match the real painted scrim, not colors.surface (final-review Major finding)", () => {
    expect(contrastRatio("#A67B45", "#211D18")).toBeLessThan(4.5)
    expect(contrastRatio("#A67B45", "#161310")).toBeGreaterThanOrEqual(4.5)

    const SUBHEADING = "背景覆盖探针副题"
    const slide: Slide = {
      type: "content",
      heading: HEADING,
      subheading: SUBHEADING,
      layout: "narrow-column",
      components: [{ type: "paragraph", text: "文" }],
      background: { kind: "asset", asset_id: "bg1" },
    } as Slide
    const doc: PptxIR = {
      version: "4",
      filename: "deck.pptx",
      theme: { id: "luxe" },
      meta: {},
      assets: { images: { bg1: { src: "data:image/png;base64,AAAA" } } },
      slides: [slide],
    }
    const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={slide} index={0} />)
    const root = parseSvgRoot(markup)
    const subheadingText = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === SUBHEADING)
    expect(subheadingText).toBeDefined()
    // Post-fix: ctx.defaultBg is the real painted scrim color, so
    // accessibleInk keeps the theme's own accent token instead of wrongly
    // falling back to neutral ink (a pre-fix run returns readableOn's
    // neutral pick here instead, never "#A67B45").
    expect(subheadingText!.getAttribute("fill")).toBe("#A67B45")
  })
})

describe("image_grid / image_compare export round-trip (image-layouts P2)", () => {
  const assets: PptxIR["assets"] = {
    images: {
      g1: { src: "data:image/png;base64,AAAA" },
      g2: { src: "data:image/png;base64,BBBB" },
    },
  }
  const roundTrip = (slide: Slide) => {
    const doc: PptxIR = { ...ir([slide]), assets }
    const markup = renderSvgMarkup(<FullSlideSvg ir={doc} slide={slide} index={0} />)
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    return svgToOps(root)
  }

  it("image_grid serializes to an export-safe svg with 2 image ops", () => {
    const ops = roundTrip({
      type: "content",
      heading: "图片网格",
      components: [
        {
          type: "image_grid",
          items: [
            { asset_id: "g1", caption: "样例一" },
            { asset_id: "g2", caption: "样例二" },
          ],
        },
      ],
    })
    expect(ops.filter((o) => o.kind === "image")).toHaveLength(2)
  })

  it("image_compare serializes with 2 image ops and label text", () => {
    const ops = roundTrip({
      type: "content",
      heading: "前后对比",
      components: [
        {
          type: "image_compare",
          left: { asset_id: "g1", label: "改造前" },
          right: { asset_id: "g2", label: "改造后" },
          style: "before_after",
        },
      ],
    })
    expect(ops.filter((o) => o.kind === "image")).toHaveLength(2)
    const texts = ops.filter((o) => o.kind === "text").map((o) => JSON.stringify(o))
    expect(texts.some((t) => t.includes("BEFORE"))).toBe(true)
  })
})

describe("manifest cover dispatch (P1)", () => {
  const coverSlide: Slide = { type: "cover", heading: "标题", components: [] } as Slide
  const mkIr = (theme: string): PptxIR =>
    ({ version: "4", filename: "m.pptx", theme: { id: theme }, meta: {}, assets: { images: {} }, slides: [coverSlide] }) as unknown as PptxIR

  it("consulting cover 命中允许集成员（W4 全集放开后 8 元素，seed 决定具体落点）", () => {
    const { container } = render(<FullSlideSvg ir={mkIr("consulting")} slide={coverSlide} index={0} />)
    const g = container.querySelector("[data-archetype]")
    expect(g).not.toBeNull()
    expect(THEME_DEFINITIONS.consulting.layouts.cover).toContain(g!.getAttribute("data-archetype"))
  })
  it("tech cover 命中允许集成员（W4 全集放开，design decision 8 排除 left-anchor 后 7 元素）", () => {
    const { container } = render(<FullSlideSvg ir={mkIr("tech")} slide={coverSlide} index={0} />)
    const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
    expect(THEME_DEFINITIONS.tech.layouts.cover).toContain(id)
    expect(id).not.toBe("left-anchor")
  })
  it("asset 背景 cover 仍走 ImageCoverPage 接管（优先级高于 manifest）", () => {
    const bgCover: Slide = { ...coverSlide, background: { kind: "asset", asset_id: "a" } } as Slide
    const ir = { ...mkIr("consulting"), assets: { images: { a: { src: "data:image/png;base64,iVBORw0KGgo=" } } }, slides: [bgCover] } as unknown as PptxIR
    const { container } = render(<FullSlideSvg ir={ir} slide={bgCover} index={0} />)
    expect(container.querySelector("image")).not.toBeNull()
  })
  it("cover + image_split（schema 合法组合）仍走图文版式接管，优先级高于 manifest archetype", () => {
    const splitCover: Slide = {
      ...coverSlide,
      layout: "image-split",
      components: [{ type: "image", asset_id: "a" }],
    } as unknown as Slide
    const ir = {
      ...mkIr("consulting"),
      assets: { images: { a: { src: "data:image/png;base64,iVBORw0KGgo=" } } },
      slides: [splitCover],
    } as unknown as PptxIR
    const { container } = render(<FullSlideSvg ir={ir} slide={splitCover} index={0} />)
    expect(container.querySelector("[data-archetype]")).toBeNull()
  })
})

describe("manifest 四页型分发泛化 (P2)", () => {
  const mkIr = (theme: string, slide: Slide): PptxIR =>
    ({
      version: "4",
      filename: "m.pptx",
      theme: { id: theme },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    }) as unknown as PptxIR

  it("chapter 命中 archetype（academic → 允许集成员，W4 全集放开后 8 元素）", () => {
    const chapterSlide: Slide = { type: "chapter", heading: "第一章", components: [] } as Slide
    const { container } = render(
      <FullSlideSvg ir={mkIr("academic", chapterSlide)} slide={chapterSlide} index={0} />,
    )
    const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
    expect(THEME_DEFINITIONS.academic.layouts.chapter).toContain(id)
  })

  it("content 命中 archetype（tech → 允许集成员，W4 全集放开，design decision 8 排除 banner-heading 后 6 元素）", () => {
    const contentSlide2: Slide = {
      type: "content",
      heading: "内容页",
      components: [{ type: "paragraph", text: "正文" }],
    } as Slide
    const { container } = render(
      <FullSlideSvg ir={mkIr("tech", contentSlide2)} slide={contentSlide2} index={0} />,
    )
    const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
    expect(THEME_DEFINITIONS.tech.layouts.content).toContain(id)
    expect(id).not.toBe("banner-heading")
  })

  it("ending 命中 archetype（journal → 允许集成员，W4 全集放开后 7 元素）", () => {
    const endingSlide: Slide = { type: "ending", heading: "谢谢", components: [] } as Slide
    const { container } = render(
      <FullSlideSvg ir={mkIr("journal", endingSlide)} slide={endingSlide} index={0} />,
    )
    const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
    expect(THEME_DEFINITIONS.journal.layouts.ending).toContain(id)
  })

  it("motif 命中：Decor 优先取 THEME_DEFINITIONS 对应主题的 motif 对应的 MOTIF_ARCHETYPES 组件（consulting → banner-motif）", () => {
    // MOTIF_ARCHETYPES 是模块单例对象，spy 其上的属性能直接证明 FullSlideSvg
    // 内部确实调用了这张注册表（而不是巧合产出等价 markup——strangler 抽取
    // 本就要求新旧输出逐字节等价，纯 DOM diff 无法区分调用来源）。
    const spy = vi.spyOn(MOTIF_ARCHETYPES, "banner-motif")
    const slide: Slide = { type: "cover", heading: "标题", components: [] } as Slide
    render(<FullSlideSvg ir={mkIr("consulting", slide)} slide={slide} index={0} />)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("content 页相邻防重复 (W4 design decision 4, retires P3 item ②'s ordinal rotation)", () => {
  // academic content 允许集 = W4 全集放开后的 7 元素——相邻防重复保证的是
  // "紧邻两页不同"，不再是旧 ordinal 轮换机制"奇数页与偶数页各自为一组"的
  // 严格周期性交替（那个保证只在 2 元素允许集下才成立，全集放开后不再有
  // 任何主题的 content 允许集是 2 元素）。
  const contentPage = (heading: string): Slide =>
    ({ type: "content", heading, components: [{ type: "paragraph", text: "正文" }] }) as Slide

  const deck: PptxIR = {
    version: "4",
    filename: "rotation.pptx",
    theme: { id: "academic" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "封面", components: [] },
      contentPage("内容一"),
      contentPage("内容二"),
      contentPage("内容三"),
    ],
  } as unknown as PptxIR

  it("同 deck 相邻 content 页渲染不同 archetype（打破 deck 内雷同），均落在允许集内", () => {
    const archetypeOf = (slideIdx: number): string | null => {
      const { container } = render(
        <FullSlideSvg ir={deck} slide={deck.slides[slideIdx]} index={slideIdx} />,
      )
      return container.querySelector("[data-archetype]")?.getAttribute("data-archetype") ?? null
    }
    const a1 = archetypeOf(1)
    const a2 = archetypeOf(2)
    const a3 = archetypeOf(3)
    // 相邻防重复只约束紧邻页——a1 与 a3 不相邻，不受约束，允许相同也允许不同。
    expect(a1).not.toBe(a2)
    expect(a2).not.toBe(a3)
    for (const a of [a1, a2, a3]) {
      expect(THEME_DEFINITIONS.academic.layouts.content).toContain(a)
    }
  })
})

describe("slide.layout explicit archetype short-circuit (W2 task 3 new capability)", () => {
  const mkIr = (theme: string, slide: Slide): PptxIR =>
    ({
      version: "4",
      filename: "m.pptx",
      theme: { id: theme },
      meta: {},
      assets: { images: {} },
      slides: [slide],
    }) as unknown as PptxIR

  it("uses the exact requested archetype id, bypassing seed selection, when it belongs to the theme's allowed family", () => {
    // consulting's cover allowed set has 3 members — a seed-pick could land
    // on any of them, so a deterministic hit on the requested id proves the
    // short-circuit fired rather than a lucky seed roll.
    const slide: Slide = { type: "cover", heading: "标题", layout: "poster-center", components: [] } as Slide
    const { container } = render(<FullSlideSvg ir={mkIr("consulting", slide)} slide={slide} index={0} />)
    expect(container.querySelector('[data-archetype="poster-center"]')).not.toBeNull()
  })

  it("uses the requested id for every member of a multi-element allowed set, not just one", () => {
    for (const id of ["banner-title", "poster-center", "split-diagonal"]) {
      const slide: Slide = { type: "cover", heading: "标题", layout: id, components: [] } as Slide
      const { container } = render(<FullSlideSvg ir={mkIr("consulting", slide)} slide={slide} index={0} />)
      expect(container.querySelector(`[data-archetype="${id}"]`)).not.toBeNull()
    }
  })

  it("honors the pin even outside the theme's curated family (spec §3: explicit layout bypasses selection unconditionally)", () => {
    // "banner-heading" is tech's own W4 design-decision-8 content exclusion
    // (baked white heading unreadable on tech's bright-cyan primary — see
    // definitions.ts) — not a member of tech's curated content set. Per
    // spec §3 ("要版式完全不动就显式写 layout 字段（显式指定不经选型）"), an
    // explicit `layout` always wins over the theme's curated allowed set —
    // it is not a soft preference that only applies within the family, so
    // this must render banner-heading rather than falling back to tech's
    // own curated set.
    const slide: Slide = {
      type: "content",
      layout: "banner-heading",
      heading: "标题",
      components: [{ type: "paragraph", text: "正文" }],
    } as Slide
    const { container } = render(<FullSlideSvg ir={mkIr("tech", slide)} slide={slide} index={0} />)
    expect(container.querySelector('[data-archetype="banner-heading"]')).not.toBeNull()
  })

  it("falls back to seed-pick (totality safety net) when the pinned id cannot be an archetype for this slide type — unregistered, wrong kind, or wrong slideTypes", () => {
    // validateIr's checkLayoutApplicability (api.ts) rejects all three of
    // these at the validate boundary for a validated IR — registry
    // existence and slideTypes applicability are both hard errors there.
    // This exercises the render-side defensive fallback that must still
    // hold for IRs that reach FullSlideSvg without going through validate
    // first (SDK callers, preview-without-validate): an id resolveArchetype
    // cannot honor never crashes the render, it just degrades to seed-pick
    // — the same total-function philosophy as resolveThemeId.
    for (const badLayout of [
      "not-a-real-layout", // unregistered
      "image-split", // registered, but kind "takeover" not "archetype" (and no image component below, so splitTakeover doesn't intercept first)
      "banner-title", // registered archetype, but slideTypes is ["cover"] — not applicable to "content"
    ]) {
      const slide: Slide = {
        type: "content",
        layout: badLayout,
        heading: "标题",
        components: [{ type: "paragraph", text: "正文" }],
      } as Slide
      const { container } = render(<FullSlideSvg ir={mkIr("tech", slide)} slide={slide} index={0} />)
      const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
      expect(THEME_DEFINITIONS.tech.layouts.content).toContain(id)
    }
  })

  it("falls back to seed-pick when slide.layout is undefined (no regression to the pre-existing dispatch)", () => {
    const slide: Slide = { type: "cover", heading: "标题", components: [] } as Slide
    const { container } = render(<FullSlideSvg ir={mkIr("tech", slide)} slide={slide} index={0} />)
    const id = container.querySelector("[data-archetype]")?.getAttribute("data-archetype")
    expect(THEME_DEFINITIONS.tech.layouts.cover).toContain(id)
  })
})

// W4 task 3 fix round (review Major finding): the review proved this
// production seam was completely unguarded — `full-slide-svg.tsx` resolves
// `PACING_BUDGETS[resolveNarrative(ir.narrative).pacing].bodyBaselinePx`
// and threads it as `buildCtx`'s 5th (optional) argument. If a future edit
// ever drops that argument, `buildCtx` silently falls back to its own
// default (`PACING_BUDGETS.balanced.bodyBaselinePx` = 24) — every
// consumer of `ctx.bodyFontPx` would render 24px regardless of what
// `ir.narrative` said, and the reviewer's mutation-check found that all
// 1206 `src/svg` tests stayed green when this exact regression was
// simulated, because `balanced`/24px is *both* the narrative default and
// `buildCtx`'s own fallback. This block renders THROUGH `FullSlideSvg` (the
// real production entry point, not a direct `paragraph.render(...)` call)
// so it exercises the one and only call site the seam lives at. `layout` is
// pinned (same short-circuit mechanism the block above already exercises)
// so both renders share identical archetype geometry — only `bodyFontPx`
// differs between the two assertions.
describe("pacing bodyFontPx injection seam (W4 task 3 fix round — Major)", () => {
  const PROBE_TEXT = "档位注入回归探针段落"
  const probeSlide: Slide = {
    type: "content",
    heading: "缝隙回归探针",
    layout: "narrow-column",
    components: [{ type: "paragraph", text: PROBE_TEXT }],
  } as Slide

  function renderProbeFontSize(narrative: Record<string, unknown>): string | null {
    const doc: PptxIR = { ...ir([probeSlide]), narrative }
    const { container } = render(<FullSlideSvg ir={doc} slide={probeSlide} index={0} />)
    const probeText = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === PROBE_TEXT,
    )
    return probeText?.getAttribute("font-size") ?? null
  }

  it("dense pacing renders the paragraph body at 20px through the real render entry point", () => {
    expect(renderProbeFontSize({ pacing: "dense" })).toBe("20")
  })

  it("spacious pacing renders the paragraph body at 32px through the real render entry point", () => {
    expect(renderProbeFontSize({ pacing: "spacious" })).toBe("32")
  })
})

// P1 variety wave, task 2 — motif candidate-set rotation
// (`./motif-selection.ts`'s own header has the design rationale). These
// tests exercise the real production entry point (`FullSlideSvg`), not the
// pure `resolveMotifId` function directly (already covered exhaustively in
// `motif-selection.test.ts`) — proving the wiring at `Decor`'s own call
// site is actually live, and that the themes this task must leave alone
// (`runway`, and any 1-member candidate set) really do render
// byte-identically through the whole component, not just at the selection
// function's own return value.
describe("motif candidate rotation (P1 variety wave, task 2)", () => {
  function decorMarkup(themeId: string, pageId: string, seed: number): string | null {
    const doc: PptxIR = { ...ir([]), theme: { id: themeId }, seed } as PptxIR
    const slide: Slide = { type: "content", id: pageId, heading: "x", components: [] } as Slide
    doc.slides = [slide]
    const { container } = render(<FullSlideSvg ir={doc} slide={slide} index={0} />)
    return container.querySelector("[data-decor]")?.innerHTML ?? null
  }

  it("consulting (3-candidate set): different decor pages in the same deck commonly render different motif markup", () => {
    const markups = new Set(
      Array.from({ length: 8 }, (_, i) => decorMarkup("consulting", `page-${i}`, 7)),
    )
    expect(markups.size, "all 8 pages rendered identical decor markup").toBeGreaterThan(1)
  })

  it("runway (no motif, settled decision): the decor slot never renders anything, for any pageKey or seed", () => {
    for (let i = 0; i < 10; i++) {
      expect(decorMarkup("runway", `page-${i}`, i)).toBeNull()
    }
  })

  it("campaign (1-member candidate set): which motif renders never varies by pageKey at a fixed seed — unaffected by this task's per-pageKey selection layer (campaign-motif's own internal composition variant is separately seed-driven, not pageKey-driven, and predates this task)", () => {
    const markups = new Set(Array.from({ length: 10 }, (_, i) => decorMarkup("campaign", `page-${i}`, 99)))
    expect(markups.size).toBe(1)
  })

  // Review fix round (Major finding): the pre-fix `chartPaletteOffset`
  // rotation lived inside `ctx.colors.chartPalette` itself, the exact token
  // `campaign-motif` destructures by fixed position for its own decorative
  // fill — campaign's decor markup silently differed across seeds even
  // though `resolveMotifId` always picked "campaign-motif" for every one of
  // them (this is the pageKey-at-one-seed check above; it can't see a
  // cross-seed color drift under the same, correctly-resolved motif id).
  // This test varies *seed* at a fixed pageKey to catch exactly that gap —
  // must stay green post-fix (`motif-chart-palette-isolation.test.tsx`
  // covers the same seam at the unit level, this covers it end-to-end
  // through the real render entry point).
  it("campaign: decor markup is byte-identical across a seed sweep at a fixed pageKey — chart-palette rotation must not leak into decorative color choice", () => {
    const markups = new Set(Array.from({ length: 20 }, (_, seed) => decorMarkup("campaign", "same-page", seed)))
    expect(markups.size, "campaign decor varied across seeds at a fixed pageKey").toBe(1)
  })

  it("same (ir, slide, index) renders byte-identical decor markup across repeated renders (double-render determinism)", () => {
    const doc: PptxIR = { ...ir([]), theme: { id: "heritage" }, seed: 3 } as PptxIR
    const slide: Slide = { type: "chapter", id: "p1", heading: "x", components: [] } as Slide
    doc.slides = [slide]
    const first = render(<FullSlideSvg ir={doc} slide={slide} index={0} />).container.querySelector(
      "[data-decor]",
    )?.innerHTML
    const second = render(<FullSlideSvg ir={doc} slide={slide} index={0} />).container.querySelector(
      "[data-decor]",
    )?.innerHTML
    expect(first).toBe(second)
  })
})

// P1 variety wave, task 2 — chart palette phase rotation
// (`./chart-palette.ts`'s own header has the design rationale). `runway` is
// used here specifically because it has no motif (see the describe block
// above) — the chart's own `<path fill="…">` elements are the only
// hex-filled paths a decor-free page can render, so no filtering by hex
// value against the motif's own ctx-derived colors is needed to isolate
// them.
describe("chart palette phase rotation (P1 variety wave, task 2)", () => {
  const RUNWAY_CHART_PALETTE = ["#0A0A0A", "#D80027", "#77787D", "#C9C9CC"]

  const pieSlide: Slide = {
    type: "content",
    heading: "图表色板轮换探针",
    layout: "narrow-column",
    components: [
      {
        type: "chart",
        chart_type: "pie",
        series: [
          {
            name: "S1",
            data: [
              { x: "A", y: 10 },
              { x: "B", y: 20 },
              { x: "C", y: 30 },
              { x: "D", y: 15 },
            ],
          },
        ],
      },
    ],
  } as Slide

  function pieFills(seed: number): string[] {
    const doc: PptxIR = { ...ir([pieSlide]), theme: { id: "runway" }, seed } as PptxIR
    const { container } = render(<FullSlideSvg ir={doc} slide={pieSlide} index={0} />)
    return Array.from(container.querySelectorAll("path"))
      .map((p) => p.getAttribute("fill"))
      .filter((f): f is string => !!f && RUNWAY_CHART_PALETTE.includes(f))
  }

  it("renders all 4 wedges in the theme's own palette, just phase-shifted — same multiset, cyclic order preserved", () => {
    for (let seed = 0; seed < 12; seed++) {
      const fills = pieFills(seed)
      expect(fills).toHaveLength(4)
      expect([...fills].sort()).toEqual([...RUNWAY_CHART_PALETTE].sort())
      // Cyclic order: rotating `fills` back to start at index 0's position
      // in the original palette must reproduce the original palette exactly.
      const start = RUNWAY_CHART_PALETTE.indexOf(fills[0]!)
      const reconstructed = [...RUNWAY_CHART_PALETTE.slice(start), ...RUNWAY_CHART_PALETTE.slice(0, start)]
      expect(fills).toEqual(reconstructed)
    }
  })

  it("different seeds commonly start the wedge sequence at a different palette color (phase varies across decks)", () => {
    const firstFills = new Set(Array.from({ length: 12 }, (_, seed) => pieFills(seed)[0]))
    expect(firstFills.size, "every seed started on the same wedge color").toBeGreaterThan(1)
  })

  it("same seed renders byte-identical wedge colors across repeated renders (double-render determinism, one shared phase per deck)", () => {
    expect(pieFills(5)).toEqual(pieFills(5))
  })

  it("a chart on every page of the same deck shares the identical rotated phase (deck-scoped, not page-scoped)", () => {
    const twoPageDeck: Slide[] = [
      { ...pieSlide, id: "p0" } as Slide,
      { ...pieSlide, id: "p1", heading: "第二页" } as Slide,
    ]
    const doc: PptxIR = { ...ir(twoPageDeck), theme: { id: "runway" }, seed: 9 } as PptxIR
    const fillsFor = (index: number) => {
      const { container } = render(<FullSlideSvg ir={doc} slide={doc.slides[index]!} index={index} />)
      return Array.from(container.querySelectorAll("path"))
        .map((p) => p.getAttribute("fill"))
        .filter((f): f is string => !!f && RUNWAY_CHART_PALETTE.includes(f))
    }
    expect(fillsFor(0)).toEqual(fillsFor(1))
  })
})
