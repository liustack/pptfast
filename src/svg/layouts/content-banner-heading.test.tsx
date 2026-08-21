// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { accessibleInk, readableOn } from "../ink"
import { BannerHeadingContent } from "./content-banner-heading"
import type { PptxIR, Slide } from "@/ir"
import { FOOTER_DIVIDER_Y, footnoteBaselineFor } from "../chrome-geometry"
import { BLOCK_GAP } from "../layout"

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
//
// Footnote re-pin (2026-08-20, footnote-clearance round): the baseline moved
// 648 -> 645, the only token that changed in either archive. It now comes
// from `footnoteBaselineFor(14)` — 664 minus the 16px the divider is owed
// minus the 3px a 14px line's ink drops below its baseline. At the old flat
// 648 this page kept 12.50px of real gap (4x raster,
// `layout--banner-heading--zh`), which the 2026-08-19 review filed as the
// footnote sitting on the rule rather than above it.
// Rhythm re-pin (2026-08-21, fifth review): kicker/banner sit 8px lower
// (em box on TITLE_ZONE_TOP 48, banner keeps the 20px kicker gap) and the
// gathered body follows the banner under the golden-top cap instead of
// taking 38% of a tall leftover. Token counts unchanged. Every differing
// token is a y / height / translate y. No x, no element added or dropped.
//   - chrome: kicker 52->60, banner 72->80, heading 127->135, subheading
//     184->192, content rect 230->238 (h 390->382).
//   - body: paragraph 301.44->270, bullets 359.44->328. Both by the same
//     31.44, so the pair stays 58 apart (the 1.5x gap ceiling).
//   - `LEGACY_LONG_MARKUP`: banner 72->80, heading lines +8, rect 236->244
//     (h 384->376), lone block 369->276 (rect.y + the 32px cap).
// Sixth-review re-pin (2026-08-21): the golden-top cap and the banner's
// heading-to-body beat both drop from two block-gaps to one. Token counts
// unchanged, no element added or dropped. Every differing token is a y /
// height / translate y.
//   - content rect 238->222 (h 382->398), paragraph 270->238, bullets
//     328->296. Pair stays 58.
//   - `LEGACY_LONG_MARKUP`: rect 244->228 (h 376->392), lone block 276->244
//     (rect.y + the 16px cap).
const LEGACY_BANNER_MARKUP = `<text x="96" y="60" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#5B6069" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="80" width="1088" height="88" rx="4" fill="#1E2A4A"></rect><text x="120" y="135" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="192" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#1E2A4A" dominant-baseline="alphabetic"><tspan fill="#1C1E23" font-weight="700">核心结论</tspan><tspan fill="#1E2A4A">：证据链完整</tspan></text><g data-audit-rect="96,222,1088,398"><g data-audit-box="96,238,1088"><g transform="translate(96,238)"><text x="0" y="24" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,296,1088"><g transform="translate(96,296)"><circle cx="5" cy="18.8" r="3" fill="#1E2A4A"></circle><text x="26" y="26" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="60.8" r="3" fill="#1E2A4A"></circle><text x="26" y="68" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="102.8" r="3" fill="#1E2A4A"></circle><text x="26" y="110" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="645" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#5B6069" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text>`
const LEGACY_LONG_MARKUP = `<rect x="96" y="80" width="1088" height="132" rx="4" fill="#1E2A4A"></rect><text x="120" y="138.5" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及</text><text x="120" y="175.5" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">跨可用区容灾演练的完整落地路径说明</text><g data-audit-rect="96,228,1088,392"><g data-audit-box="96,244,1088"><g transform="translate(96,244)"><text x="0" y="24" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">支撑论据。</text></g></g></g>`
const LEGACY_NOLOGO_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg"><text x="96" y="60" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#5B6069" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="80" width="1088" height="88" rx="4" fill="#1E2A4A"></rect><text x="120" y="135" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="192" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#1E2A4A" dominant-baseline="alphabetic"><tspan fill="#1C1E23" font-weight="700">核心结论</tspan><tspan fill="#1E2A4A">：证据链完整</tspan></text><g data-audit-rect="96,222,1088,398"><g data-audit-box="96,238,1088"><g transform="translate(96,238)"><text x="0" y="24" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,296,1088"><g transform="translate(96,296)"><circle cx="5" cy="18.8" r="3" fill="#1E2A4A"></circle><text x="26" y="26" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="60.8" r="3" fill="#1E2A4A"></circle><text x="26" y="68" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="102.8" r="3" fill="#1E2A4A"></circle><text x="26" y="110" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="645" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#5B6069" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text></svg>`
const LEGACY_TLLOGO_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg"><text x="176" y="60" font-family="Georgia, Songti SC, STSong, serif" font-size="12" fill="#5B6069" letter-spacing="4" dominant-baseline="alphabetic">第一部分：研究背景</text><rect x="96" y="80" width="1088" height="88" rx="4" fill="#1E2A4A"></rect><text x="120" y="135" font-family="Georgia, Songti SC, STSong, serif" font-size="34" font-weight="600" fill="#FFFFFF" dominant-baseline="alphabetic">结论先行：断言横幅</text><text x="96" y="192" font-family="Georgia, Songti SC, STSong, serif" font-size="22" fill="#1E2A4A" dominant-baseline="alphabetic"><tspan fill="#1C1E23" font-weight="700">核心结论</tspan><tspan fill="#1E2A4A">：证据链完整</tspan></text><g data-audit-rect="96,222,1088,398"><g data-audit-box="96,238,1088"><g transform="translate(96,238)"><text x="0" y="24" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">本节陈述关键论断。</text></g></g><g data-audit-box="96,296,1088"><g transform="translate(96,296)"><circle cx="5" cy="18.8" r="3" fill="#1E2A4A"></circle><text x="26" y="26" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据一</text><circle cx="5" cy="60.8" r="3" fill="#1E2A4A"></circle><text x="26" y="68" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据二</text><circle cx="5" cy="102.8" r="3" fill="#1E2A4A"></circle><text x="26" y="110" font-family="Georgia, Songti SC, STSong, serif" font-size="24" fill="#1C1E23" dominant-baseline="alphabetic">论据三</text></g></g></g><text x="96" y="645" font-family="Georgia, Songti SC, STSong, serif" font-size="14" fill="#5B6069" font-style="italic" dominant-baseline="alphabetic">数据来源：内部埋点，2026Q2</text></svg>`

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
  it("banner 2 行时高度变为 132（1 行为 88），content rect 的 y 随 bannerBottom + 16 下移", () => {
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
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "80",
    )!
    const longBanner = Array.from(longRoot.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "80",
    )!
    expect(shortBanner.getAttribute("height")).toBe("88")
    expect(longBanner.getAttribute("height")).toBe("132") // wraps to 2 lines

    const shortContentY = contentRectY(shortRoot)
    const longContentY = contentRectY(longRoot)
    expect(shortContentY).toBe(168 + BLOCK_GAP) // 1-line banner bottom (168) + gap
    expect(longContentY).toBe(212 + BLOCK_GAP) // 2-line banner bottom (212) + gap
    expect(longContentY).toBeGreaterThan(shortContentY)
  })

  // 回填旧测试「Content does not draw its own source hairline ... footnote
  // stays below it」（旧文件 consulting.test.tsx L171-192）：本 layout 不
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
    // The footnote sits on the shared baseline (`footnoteBaselineFor`,
    // chrome-geometry.ts) rather than 28px below the hairline this layout
    // does not draw. At the old +28 it landed at 676 — under the footer
    // divider at 664, through the footer's own text row. The baseline is
    // derived from the *rendered* size, so a footnote that `fitSvgLine`
    // shrank keeps the same gap above the rule instead of drifting down.
    const rendered = Number(footnote.getAttribute("font-size"))
    expect(Number(footnote.getAttribute("y"))).toBe(footnoteBaselineFor(rendered))
    expect(footnoteBaselineFor(rendered)).toBeLessThan(FOOTER_DIVIDER_Y)
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
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "80",
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
      (r) => r.getAttribute("x") === "96" && r.getAttribute("y") === "80",
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
    // 垂直居中值的显式断言：单行 34px 标题的基线 y=135（80 + 88/2 +
    // round(34*0.32)）。
    expect(heading.getAttribute("y")).toBe("135")

    // Content components below the banner, not inside a foreignObject.
    expect(markup).not.toContain("foreignObject")
    expect(markup).toContain("论据一")
  })

  it("tech tokens 下用 tech 的色（证明 token 化成立，无 baked hex），banner 标题对比度自适应出反白", () => {
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

    // W4 fix round: banner 标题墨色由 readableOn(colors.primary) 挑，不是写死
    // 的纯白。当时 tech 的 primary 还是亮青，白字压上去只有 ~1.80:1（低于 3:1
    // 大字门槛），挑出来的是中性深墨；深底组皮肤重设计（2026-08-19）把 primary
    // 换成深蓝 #14294A（`themes/tech.ts`：「横幅重新承得起反白」），同一个
    // readableOn 现在挑回纯白，实测 14.52:1。断言锁的仍是「墨色由 readableOn
    // 决定」，只是钉的值随 token 换了一边。
    expect(out).toContain('fill="#FFFFFF"')
    expect(out).not.toContain('fill="#0A0E14"') // 另一半墨色不得同时出现
    expect(ctx.colors.text).not.toBe("#FFFFFF")

    // ctx 确实按主题切换生效：标题字体走 tech 的解析结果
    expect(out).toContain(`font-family="${ctx.fonts.heading}"`)
  })

  it("luxe/campaign/classroom tokens 下 banner 标题走 readableOn(primary)、副标题走 accessibleInk——decision-7/8 排除是否仍需保留见 definitions.ts", () => {
    // 三个既有 CONTENT_WITHOUT_BANNER_HEADING 排除主题。按 ../ink.ts 的同一
    // 套函数独立算出期望值（不是重新推导 WCAG 公式，是验证本 layout 确实
    // 调用了它们，而不是仍然写死白字/colors.primary）。
    for (const themeId of ["luxe", "campaign", "classroom"] as const) {
      const tokens = resolveStyle(themeId)
      const ctx = buildCtx(tokens, {})
      const deck = ir([chapter1, bannerSlide])
      const out = renderSvgMarkup(<BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />)

      const expectedHeadingInk = readableOn(tokens.colors.primary)
      expect(out).toContain(`fill="${expectedHeadingInk}"`)

      const expectedSubheadingInk = accessibleInk(tokens.colors.primary, ctx.defaultBg as string, 22)
      expect(out).toContain(`fill="${expectedSubheadingInk}"`)
    }
  })

  it("seats the kicker em box on the title-zone top (y=48), matching heading-family top breathing", () => {
    const TITLE_ZONE_TOP = 48
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const deck = ir([chapter1, bannerSlide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={deck} slide={bannerSlide} index={1} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第一部分"),
    )!
    const emTop = Number(kicker.getAttribute("y")) - Number(kicker.getAttribute("font-size"))
    expect(emTop).toBeGreaterThanOrEqual(TITLE_ZONE_TOP)
    expect(emTop).toBe(TITLE_ZONE_TOP)
  })

  it("keeps a lone table following the banner instead of hanging as a second island", () => {
    const ctx = buildCtx({ ...resolveStyle("consulting"), shape: undefined }, {})
    const tableSlide: Slide = {
      type: "content",
      heading: "本季度经营结果好于预期",
      components: [
        {
          type: "data_table",
          columns: [
            { key: "m", label: "指标" },
            { key: "q1", label: "Q1" },
            { key: "q2", label: "Q2" },
          ],
          rows: [
            { cells: { m: "收入", q1: "1.2亿", q2: "1.4亿" } },
            { cells: { m: "毛利", q1: "38%", q2: "41%" } },
            { cells: { m: "净利", q1: "0.18亿", q2: "0.22亿" } },
          ],
        },
      ],
    } as Slide
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BannerHeadingContent ir={ir([tableSlide])} slide={tableSlide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const banner = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("x") === "96" && Number(r.getAttribute("width")) === 1088,
    )!
    const bannerBottom = Number(banner.getAttribute("y")) + Number(banner.getAttribute("height"))
    const box = root.querySelector("g[data-audit-box]")!
    const bodyY = Number(box.getAttribute("data-audit-box")!.split(",")[1])
    const headingBodyGap = BLOCK_GAP
    const cap = BLOCK_GAP
    expect(bodyY - bannerBottom).toBe(headingBodyGap + cap)
    const header = Array.from(root.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-weight") === "bold" && (t.textContent ?? "").includes("指标"),
    )!
    const headerY = bodyY + Number(header.getAttribute("y"))
    expect(headerY - bannerBottom).toBeGreaterThanOrEqual(40)
    expect(headerY - bannerBottom).toBeLessThanOrEqual(60)
  })

  it("scales the banner-to-body gap with gapScale", () => {
    const tight = buildCtx({ ...resolveStyle("consulting"), shape: { gapScale: 0.8 } }, {})
    const airy = buildCtx({ ...resolveStyle("consulting"), shape: { gapScale: 1.3 } }, {})
    const tableSlide: Slide = {
      type: "content",
      heading: "本季度经营结果好于预期",
      components: [
        {
          type: "data_table",
          columns: [
            { key: "m", label: "指标" },
            { key: "q1", label: "Q1" },
          ],
          rows: [{ cells: { m: "收入", q1: "1.2亿" } }],
        },
      ],
    } as Slide

    function contentRectY(ctx: ReturnType<typeof buildCtx>): number {
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BannerHeadingContent ir={ir([tableSlide])} slide={tableSlide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const g = Array.from(root.querySelectorAll("g")).find((el) =>
        el.getAttribute("data-audit-rect")?.startsWith("96,"),
      )!
      return Number(g.getAttribute("data-audit-rect")!.split(",")[1])
    }

    expect(contentRectY(airy)).toBeGreaterThan(contentRectY(tight))
    expect(contentRectY(airy) - contentRectY(tight)).toBe(
      Math.round(BLOCK_GAP * 1.3) - Math.round(BLOCK_GAP * 0.8),
    )
  })
})
