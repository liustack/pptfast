// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { BannerHeadingContent } from "./content-banner-heading"
import type { PptxIR, Slide } from "@/ir"

// BrandChrome's brand logo bands (see templates/consulting.test.tsx's own
// LOGO_BANDS block) — re-declared here (self-contained, no cross-import from
// the legacy test file) for the kicker/banner logo-avoidance backfills below.
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

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

const chapter1: Slide = { type: "chapter", heading: "第一部分：研究背景", components: [] } as Slide
// Single-line banner, with subheading + footnote so both optional slots
// (SUBHEADING_SLOT / footnote) exercise their non-empty branches.
const bannerSlide: Slide = {
  type: "content",
  heading: "结论先行：断言横幅",
  subheading: "**核心结论**：证据链完整",
  footnote: "数据来源：内部埋点，2026Q2",
  components: [
    { type: "paragraph", text: "本节陈述关键论断。" },
    { type: "bullets", items: ["论据一", "论据二", "论据三"], style: "default" },
  ],
} as Slide
// Two-line banner (long CJK heading wraps), no subheading/footnote so the
// slot-skipping branch also gets covered.
const longSlide: Slide = {
  type: "content",
  heading: CJK_LONG,
  components: [{ type: "paragraph", text: "支撑论据。" }],
} as Slide

function ir(
  slides: Slide[],
  opts?: { brand?: PptxIR["brand"]; assets?: PptxIR["assets"] },
): PptxIR {
  return {
    version: "3",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: opts?.assets ?? { images: {} },
    brand: opts?.brand,
    slides,
  } as unknown as PptxIR
}

// Captured verbatim from the legacy `MckinseyNavyContent` (templates/consulting.tsx)
// for these exact fixtures before templates/ was deleted — see P2 Task 26
// dependency-break note (same pattern as cover-banner-title.test.tsx).
const LEGACY_BANNER_MARKUP = `<text x="96" y="52" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#6C6C6C" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="72" width="1088" height="88" rx="4" fill="#051C2C"></rect><text x="120" y="127" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="184" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#051C2C" dominant-baseline="alphabetic"><tspan fill="#051C2C" font-weight="700">核心结论</tspan><tspan fill="#051C2C">：证据链完整</tspan></text><g data-audit-rect="96,230,1088,390"><g data-audit-box="96,230,1088"><g transform="translate(96,230)"><text x="0" y="20" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,298,1088"><g transform="translate(96,298)"><circle cx="5" cy="16" r="3" fill="#051C2C"></circle><text x="26" y="22" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="52" r="3" fill="#051C2C"></circle><text x="26" y="58" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="88" r="3" fill="#051C2C"></circle><text x="26" y="94" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="676" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#6C6C6C" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text>`
const LEGACY_LONG_MARKUP = `<rect x="96" y="72" width="1088" height="132" rx="4" fill="#051C2C"></rect><text x="120" y="130.5" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及</text><text x="120" y="167.5" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">跨可用区容灾演练的完整落地路径说明</text><g data-audit-rect="96,236,1088,384"><g data-audit-box="96,371.28,1088"><g transform="translate(96,371.28)"><text x="0" y="20" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">支撑论据。</text></g></g></g>`
const LEGACY_NOLOGO_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg"><text x="96" y="52" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#6C6C6C" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="72" width="1088" height="88" rx="4" fill="#051C2C"></rect><text x="120" y="127" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="184" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#051C2C" dominant-baseline="alphabetic"><tspan fill="#051C2C" font-weight="700">核心结论</tspan><tspan fill="#051C2C">：证据链完整</tspan></text><g data-audit-rect="96,230,1088,390"><g data-audit-box="96,230,1088"><g transform="translate(96,230)"><text x="0" y="20" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,298,1088"><g transform="translate(96,298)"><circle cx="5" cy="16" r="3" fill="#051C2C"></circle><text x="26" y="22" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="52" r="3" fill="#051C2C"></circle><text x="26" y="58" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="88" r="3" fill="#051C2C"></circle><text x="26" y="94" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="676" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#6C6C6C" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text></svg>`
const LEGACY_TLLOGO_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg"><text x="176" y="52" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#6C6C6C" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="72" width="1088" height="88" rx="4" fill="#051C2C"></rect><text x="120" y="127" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="184" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#051C2C" dominant-baseline="alphabetic"><tspan fill="#051C2C" font-weight="700">核心结论</tspan><tspan fill="#051C2C">：证据链完整</tspan></text><g data-audit-rect="96,230,1088,390"><g data-audit-box="96,230,1088"><g transform="translate(96,230)"><text x="0" y="20" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,298,1088"><g transform="translate(96,298)"><circle cx="5" cy="16" r="3" fill="#051C2C"></circle><text x="26" y="22" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="52" r="3" fill="#051C2C"></circle><text x="26" y="58" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="88" r="3" fill="#051C2C"></circle><text x="26" y="94" font-family="Georgia, Songti SC, STSong, serif" font-size="20" fill="#051C2C" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="676" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#6C6C6C" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text></svg>`

describe("BannerHeadingContent", () => {
  it("consulting tokens 下与旧 MckinseyNavyContent 输出逐字节一致（档位一，含单/双行 banner、subheading、footnote、跨章节 kicker）", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const deck = ir([chapter1, bannerSlide])

    const next = renderSvgMarkup(<BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />)
    expect(next).toBe(LEGACY_BANNER_MARKUP)
    expect(next).toContain("结论先行：断言横幅")
    expect(next).toContain("证据链完整")
    expect(next).toContain("论据一")
    expect(next).toContain("数据来源：内部埋点，2026Q2")

    const longDeck = ir([longSlide])
    const nextLong = renderSvgMarkup(<BannerHeadingContent ir={longDeck} slide={longSlide} index={0} ctx={ctx} />)
    expect(nextLong).toBe(LEGACY_LONG_MARKUP)
  })

  it("brand 无 tl logo 时 kicker 逐字节一致，真实 tl logo 存在时侧移 dodge 也逐字节一致（hasTlLogo 随迁 helper 验证）", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})

    function renderKickerNext(deck: PptxIR): { next: string; kickerX: string | null } {
      const next = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(next)
      const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("第一部分"),
      )
      return { next, kickerX: kicker?.getAttribute("x") ?? null }
    }

    const noLogoDeck = ir([chapter1, bannerSlide])
    const noLogoResult = renderKickerNext(noLogoDeck)
    expect(noLogoResult.next).toBe(LEGACY_NOLOGO_MARKUP)
    expect(noLogoResult.kickerX).toBe("96")

    const tlLogoDeck = ir([chapter1, bannerSlide], {
      brand: { logo_asset_id: "logo1", position: "tl" },
      assets: { images: { logo1: { src: "data:image/png;base64,AAAA" } } },
    })
    const tlLogoResult = renderKickerNext(tlLogoDeck)
    expect(tlLogoResult.next).toBe(LEGACY_TLLOGO_MARKUP)
    expect(tlLogoResult.kickerX).toBe("176")
  })

  // 回填旧测试「brand logo present but positioned elsewhere (default 'br')」
  // （旧文件 consulting.test.tsx L220-227）：logo 存在但不在 tl 位时，仍视为
  // 无 tl logo，kicker 对齐 banner 左边。
  it("brand logo 存在但不是 tl 位（默认 br）：kicker 仍对齐 banner 左边，不触发侧移 dodge", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const deck = ir([chapter1, bannerSlide], {
      brand: { logo_asset_id: "logo1" },
      assets: { images: { logo1: { src: "data:image/png;base64,AAAA" } } },
    })
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一部分"),
    )!
    expect(kicker.getAttribute("x")).toBe("96")
  })

  // 回填旧测试「tl brand entry present but the asset failed to load」（旧文件
  // consulting.test.tsx L251-258）：tl 位 logo 资产加载失败（asset.error）时
  // 视为无 logo（镜像 BrandChrome 自己的 `!logo.error` 判定），kicker 对齐
  // banner。
  it("tl 位 logo 资产加载失败（asset.error）：视为无 logo，kicker 对齐 banner", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const deck = ir([chapter1, bannerSlide], {
      brand: { logo_asset_id: "logo1", position: "tl" },
      assets: { images: { logo1: { src: "data:image/png;base64,AAAA", error: "404" } } },
    })
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一部分"),
    )!
    expect(kicker.getAttribute("x")).toBe("96")
  })

  // 回填旧测试「Content banner grows to the 2-line height for a long heading
  // and pushes the content rect down」（旧文件 consulting.test.tsx L127-169）：
  // banner 高度随 1/2 行变化（88 vs 132），content rect 的 y 相应下移
  // （bannerBottom + 32，无 subheading）。
  it("banner 2 行时高度变为 132（1 行为 88），content rect 的 y 随 bannerBottom + 32 下移", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const shortSlide: Slide = {
      type: "content",
      heading: "结论先行",
      components: [{ type: "paragraph", text: "支撑论据。" }],
    } as Slide
    const longHeadingSlide: Slide = {
      type: "content",
      heading: CJK_LONG,
      components: [{ type: "paragraph", text: "支撑论据。" }],
    } as Slide

    function render(slide: Slide): Element {
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BannerHeadingContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      return parseSvgRoot(markup)
    }

    function contentRectY(root: Element): number {
      const g = Array.from(root.querySelectorAll("g")).find((el) =>
        el.getAttribute("data-audit-rect")?.startsWith("96,"),
      )!
      return Number(g.getAttribute("data-audit-rect")!.split(",")[1])
    }

    const shortRoot = render(shortSlide)
    const longRoot = render(longHeadingSlide)

    const shortBanner = Array.from(shortRoot.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "72",
    )!
    const longBanner = Array.from(longRoot.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "72",
    )!
    expect(shortBanner.getAttribute("height")).toBe("88")
    expect(longBanner.getAttribute("height")).toBe("132") // wraps to 2 lines

    const shortContentY = contentRectY(shortRoot)
    const longContentY = contentRectY(longRoot)
    expect(shortContentY).toBe(160 + 32) // 1-line banner bottom (160) + gap
    expect(longContentY).toBe(204 + 32) // 2-line banner bottom (204) + gap
    expect(longContentY).toBeGreaterThan(shortContentY)
  })

  // 回填旧测试「Content does not draw its own source hairline ... footnote
  // stays below it」（旧文件 consulting.test.tsx L171-192）：本 archetype 不
  // 画自己的 y=648 源信息 hairline（BrandChrome 已经画了），footnote 落在
  // 其下方。
  it("不画自己的 y=648 源信息 hairline，footnote 落在其下方", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const slide: Slide = {
      type: "content",
      heading: "结论先行",
      components: [{ type: "paragraph", text: "支撑论据。" }],
      footnote: "数据来源：内部",
    } as Slide
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(root.querySelector('line[y1="648"]')).toBeNull()
    const footnote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("数据来源"),
    )!
    expect(Number(footnote.getAttribute("y"))).toBeGreaterThan(648)
  })

  // 回填旧测试「Content assertion banner's fill may touch the tl/tr logo
  // bands' corner (solid color, no text) but the heading text never does」
  // （旧文件 consulting.test.tsx L261-305）：banner 的实心填色允许触碰 tl/tr
  // 角落（色块，不含文字），但 banner 内的 heading 文字必须始终清空四个
  // logo 带。
  it("banner 实心填色可触碰 tl/tr logo 带角落（色块无文字），但 heading 文字永远清空四个 logo 带", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const slide: Slide = {
      type: "content",
      heading: "结论先行",
      components: [{ type: "paragraph", text: "支撑论据。" }],
    } as Slide
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const banner = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "72",
    )!
    const bannerBox = {
      x: Number(banner.getAttribute("x")),
      y: Number(banner.getAttribute("y")),
      w: Number(banner.getAttribute("width")),
      h: Number(banner.getAttribute("height")),
    }
    // Documented/accepted (see content-banner-heading.tsx's BANNER_Y comment
    // lineage in the ported templates/consulting.tsx): the banner's solid
    // fill does dip into the tl/tr bands' corner.
    expect(rectsOverlap(bannerBox, TL_LOGO)).toBe(true)
    expect(rectsOverlap(bannerBox, TR_LOGO)).toBe(true)

    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("结论先行"),
    )!
    const headingBox = {
      x: Number(heading.getAttribute("x")),
      y: Number(heading.getAttribute("y")) - Number(heading.getAttribute("font-size")),
      w: 1000,
      h: Number(heading.getAttribute("font-size")) * 1.4,
    }
    for (const band of LOGO_BANDS) {
      expect(rectsOverlap(headingBox, band)).toBe(false)
    }
  })

  // 回填旧测试「Content body passes subset validation」（旧文件
  // consulting.test.tsx L75-93）。
  it("输出通过 subset validation", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const slide: Slide = {
      type: "content",
      heading: "验证子集",
      components: [
        { type: "paragraph", text: "文本段落。" },
        { type: "bullets", items: ["项目一", "项目二"], style: "default" },
      ],
    } as Slide
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("banner 结构断言：全宽 primary 填色矩形承载纯白居中标题（横幅式 content，非 kicker+标题+分隔线语法）", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const deck = ir([bannerSlide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={deck} slide={bannerSlide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)

    const banner = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "72",
    )!
    expect(banner).toBeTruthy()
    expect(banner.getAttribute("width")).toBe("1088")
    expect(banner.getAttribute("height")).toBe("88") // single-line heading
    expect(banner.getAttribute("fill")).toBe(ctx.colors.primary)

    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("结论先行"),
    )!
    expect(heading.getAttribute("fill")).toBe("#FFFFFF")
    expect(heading.getAttribute("x")).toBe("120")
    // 回填旧测试「Content renders a full-width assertion banner with a white
    // heading inside it」（旧文件 consulting.test.tsx L95-125）对 baseline
    // 垂直居中值的显式断言：单行 34px 标题的基线 y=127（72 + 88/2 +
    // round(34*0.32)）。
    expect(heading.getAttribute("y")).toBe("127")

    // Content components below the banner, not inside a foreignObject.
    expect(markup).not.toContain("foreignObject")
    expect(markup).toContain("论据一")
  })

  it("tech tokens 下用 tech 的色（证明 token 化成立，无 baked hex），banner 白字例外跨主题稳定", () => {
    const techTheme = resolveStyle("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir([chapter1, bannerSlide])
    const out = renderSvgMarkup(<BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />)

    expect(out).toContain(ctx.colors.primary as string) // tech 的 primary 驱动 banner 填色/subheading
    expect(out).toContain(ctx.colors.muted as string) // tech 的 muted 驱动 kicker/footnote
    expect(out).toContain(ctx.colors.text as string) // tech 的 text 驱动 subheading 强调段
    // consulting 自己的烤死色不得残留（NAVY/YELLOW/MUTED/DIVIDER，均未被本
    // 函数消费，理应从未出现过，这里做回归锁）
    expect(out).not.toContain("#051C2C")
    expect(out).not.toContain("#FFC72C")
    expect(out).not.toContain("#6C6C6C")
    expect(out).not.toContain("#D5D5CB")

    // 白字例外：banner 标题固定纯白，不随主题变化
    expect(out).toContain('fill="#FFFFFF"')
    expect(ctx.colors.text).not.toBe("#FFFFFF")

    // ctx 确实按主题切换生效：标题字体走 tech 的解析结果
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)
  })
})
