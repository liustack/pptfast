// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import { FullSlideSvg } from "./FullSlideSvg"
import { renderSvgMarkup, parseSvgRoot } from "./serialize"
import { assertSubset } from "./subset-validate"
import { svgToOps } from "../pptx/svg2pptx/dispatch"
import { MOTIF_ARCHETYPES } from "./archetypes/index-motif"
import { THEME_DEFINITIONS } from "../themes/definitions"
import type { PptxIR, Slide } from "@/ir"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "3",
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
      // 0.66（2026-07-09 用户裁决 0.8 看不清背景，同 Background.test 边界）
      return o !== null && Number(o) >= 0.6 && Number(o) < 0.75
    })
    expect(scrims).toHaveLength(1)
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
    ({ version: "3", filename: "m.pptx", theme: { id: theme }, meta: {}, assets: { images: {} }, slides: [coverSlide] }) as unknown as PptxIR

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
      version: "3",
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
    version: "3",
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
      version: "3",
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
