// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { CANONICAL_THEME_IDS, resolveStyle } from "../../themes"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { FashionMastheadCover } from "./cover-fashion-masthead"
import { FashionChapter } from "./chapter-fashion-chapter"
import { FashionEnding } from "./ending-fashion-ending"
import type { PptxIR, Slide } from "@/ir"

// fashion 家族（runway 专属新表达，2026-07-10）基本行为锁：满版色块、
// readableOn 自适应前景、出血 data-bleed 声明、subset-clean。

const cover: Slide = { type: "cover", heading: "秋冬特辑", subheading: "解构与重塑", components: [] } as Slide
const chapter: Slide = { type: "chapter", heading: "廓形的反叛", components: [] } as Slide
const ending: Slide = { type: "ending", heading: "下期预告", subheading: "十月刊", components: [] } as Slide
const endingBare: Slide = { type: "ending", components: [] } as Slide
// 一个不可断词的长 token，`layoutSvgText` 只能靠缩字号塞下——17 家全部渲成
// 21px，正好跨到 24px 大字号线以下，副题的 floor 由 3:1 翻成 4.5:1。
const LONG_SUBHEADING =
  "AntiDisestablishmentarianismAndPseudopseudohypoparathyroidismConsideredTogetherAsOneUnbrokenToken"
const endingLongSub: Slide = {
  type: "ending",
  heading: "下期预告",
  subheading: LONG_SUBHEADING,
  components: [],
} as Slide

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "f.pptx",
    theme: { id: "runway" },
    meta: { organization: "时尚编辑部", date: "2026-10" },
    assets: { images: {} },
    slides,
  } as PptxIR
}

const ctx = buildCtx(resolveStyle("runway"), {})

describe("fashion 家族（runway）", () => {
  it("cover：满版 primary 色块 + readableOn 白字报头 + accent 色带", () => {
    const deck = ir([cover])
    const markup = renderSvgMarkup(<FashionMastheadCover ir={deck} slide={cover} index={0} ctx={ctx} />)
    // 满版黑底
    expect(markup).toContain('width="1280" height="720" fill="#141414"')
    // 黑底上报头是白字（readableOn）
    expect(markup).toContain('fill="#FFFFFF"')
    expect(markup).toContain("秋冬特辑")
    // accent 满宽色带
    expect(markup).toContain('width="1168" height="20" fill="#B0483C"')
  })

  it("chapter：满版 accent 色块 + 右对齐实色混合水印（导出安全：不出血不半透明）", () => {
    const deck = ir([chapter])
    const markup = renderSvgMarkup(<FashionChapter ir={deck} slide={chapter} index={0} ctx={ctx} />)
    expect(markup).toContain('width="1280" height="720" fill="#B0483C"')
    expect(markup).toContain("CHAPTER 01")
    // 水印：anchor=end 贴右缘（svg2pptx 右对齐文本框宽度充裕不裁字）
    expect(markup).toMatch(/text-anchor="end"[^>]*>01</)
    // 实色混合（#B0483C 与 #FFFFFF 的 22%）而非 fillOpacity 半透明
    expect(markup).toContain('fill="#C17067"')
    expect(markup).not.toContain("data-bleed")
  })

  // 2026-08-19 暖纸组皮肤重设计落地时实测到的既有缺陷：底部 org 行固定叠
  // 0.85 不透明度，混到满版 accent 上就可能跌破 19px 正文的 4.5:1。runway
  // 自己的正红 accent 混完只有 4.06:1（本轮之前就在违例，`deck-audit` 的
  // low-contrast 逐次报出），journal 4.34:1 同理。改走 `accessibleOpacity`
  // 之后，达标的主题保留 0.85、不达标的退回全不透明。
  it("chapter：底部 org 行的 0.85 不透明度过 accessibleOpacity——混完不达标就退回全不透明", () => {
    const deck = ir([chapter])
    const markup = renderSvgMarkup(<FashionChapter ir={deck} slide={chapter} index={0} ctx={ctx} />)
    // runway：白字 @0.85 混到正红上只有 4.06:1 → 退回 1
    expect(markup).toMatch(/fill-opacity="1"[^>]*>时尚编辑部</)

    // 达标的一家保留 0.85——academic 的 accent 上，深墨 @0.85 混完 5.28:1。
    const academicCtx = buildCtx(resolveStyle("academic"), {})
    const academicMarkup = renderSvgMarkup(
      <FashionChapter ir={deck} slide={chapter} index={0} ctx={academicCtx} />,
    )
    expect(academicMarkup).toMatch(/fill-opacity="0.85"[^>]*>时尚编辑部/)
  })

  it("ending：满版 primary 底 + heading 存在时不兜底", () => {
    const deck = ir([ending])
    const markup = renderSvgMarkup(<FashionEnding ir={deck} slide={ending} index={0} ctx={ctx} />)
    expect(markup).toContain('width="1280" height="720" fill="#141414"')
    expect(markup).toContain("下期预告")
    expect(markup).not.toContain("Thank you")
  })

  // 与上面 chapter org 行同型的既有缺陷，这次是 ending 的两处：顶部 org 小字
  // 固定叠 0.72、底部 meta 行固定叠 0.6，混到满版 primary 上都可能跌破正文的
  // 4.5:1。17 家钉 fashion-ending 实测，8 家在违例——org 行 academic 4.24 /
  // campaign 4.10 / bloom 3.77 / classroom 3.76 / pulse 3.98 / ember 3.44 /
  // vermilion 4.14，meta 行再多一家 terra 3.75。两处各走 `accessibleOpacity`
  // 之后，达标的保留原不透明度、不达标的退回全不透明。
  it("ending：org 与 meta 两处不透明度各走 accessibleOpacity——按各自字号独立判定", () => {
    const deck = ir([ending])
    // runway：白字混到 #0A0A0A 上，org 10.20:1、meta 7.30:1，两处都保留原值
    const markup = renderSvgMarkup(<FashionEnding ir={deck} slide={ending} index={0} ctx={ctx} />)
    expect(markup).toMatch(/fill-opacity="0\.72"[^>]*letter-spacing="8"[^>]*>时尚编辑部</)
    expect(markup).toMatch(/fill-opacity="0\.6"[^>]*letter-spacing="3"[^>]*>时尚编辑部 {4}· {4}2026-10</)

    // ember：白字混到 #BC4620 上，org @0.72 只有 3.44:1、meta @0.6 只有
    // 2.84:1，两处都退回全不透明
    const emberMarkup = renderSvgMarkup(
      <FashionEnding ir={deck} slide={ending} index={0} ctx={buildCtx(resolveStyle("ember"), {})} />,
    )
    expect(emberMarkup).toMatch(/fill-opacity="1"[^>]*letter-spacing="8"[^>]*>时尚编辑部</)
    expect(emberMarkup).toMatch(/fill-opacity="1"[^>]*letter-spacing="3"[^>]*>时尚编辑部 {4}· {4}2026-10</)

    // terra 是分辨用例：同一底色（#4D5D39）上 20px 的 org @0.72 混完 4.64:1
    // 达标、19px 的 meta @0.6 混完只有 3.75:1 不达标——两处必须各判各的，
    // 一处失守不该把另一处也一起顶满。
    const terraMarkup = renderSvgMarkup(
      <FashionEnding ir={deck} slide={ending} index={0} ctx={buildCtx(resolveStyle("terra"), {})} />,
    )
    expect(terraMarkup).toMatch(/fill-opacity="0\.72"[^>]*letter-spacing="8"[^>]*>时尚编辑部</)
    expect(terraMarkup).toMatch(/fill-opacity="1"[^>]*letter-spacing="3"[^>]*>时尚编辑部 {4}· {4}2026-10</)
  })

  // 副题的 0.72 是这一页第三处固定不透明度，今天不违例但会在长副题下爆：
  // `layoutSvgText` 从 28px 起缩，短副题 17 家都留在 28px（>=24px，只需
  // 3:1 全过），长副题缩到 21px 就翻成 4.5:1，明度谷里的主题一起违例。
  // 所以量的必须是缩放后的 `subtitle.fontSize`，不是 28 常量——与 meta
  // 行量 `metaLine.fontSize` 是同一课。
  it("ending：副题不透明度按 layoutSvgText 缩放后的实际字号判定，不按 28 常量", () => {
    // 短副题：17 家都渲成 28px，走大字号的 3:1，全家保留 0.72（今天全矩阵
    // 逐字节不变的那一半证据）
    const shortDeck = ir([ending])
    for (const themeId of CANONICAL_THEME_IDS) {
      const markup = renderSvgMarkup(
        <FashionEnding ir={shortDeck} slide={ending} index={0} ctx={buildCtx(resolveStyle(themeId), {})} />,
      )
      expect(markup, themeId).toMatch(/font-size="28"[^>]*fill-opacity="0\.72"[^>]*letter-spacing="4"/)
    }

    // 长副题：17 家都缩到 14px，floor 翻成 4.5:1，这 5 家混完不达标 → 退回
    // 全不透明；其余 12 家仍达标 → 保留 0.72。名单是「明度谷」主题的实测
    // 集合，随 token 变动：冷调组把 academic 的绿加深（#006A4E → #0E6245）
    // 后它退出过一次；柔和组（2026-08-20）把 campaign 的 primary 从品红
    // #F0559E 翻成舞台暗紫 #23173A，白字 @0.72 在 21px 上重新过线，
    // **campaign 也退出**。classroom/bloom 的 primary 换了色相但仍在明度谷
    // 里（#4A6B8A / #92535E），留在名单上。逐主题实测工具：
    // `.issues/2026-08-18-theme-redesign/skins/tools/probe-fashion-flip.mts`
    // ——这个数组钉的是当前 token 下的实测结果，token 换血时它应当跟着换
    // （合并语义冲突的第一现场：两个各自全绿的分支在这里相遇）。
    //
    // 字号从 21 降到 14（字距折行预算，2026-08-20）：这条 97 字符不可断词
    // 的 token 渲染时带 4px 字距，96 个间隙吃掉 384px，`layoutSvgText` 现在
    // 把这笔钱从 1168px 预算里先扣掉再定字号（`SvgTextLayoutOptions.letterSpacing`）。
    // 实测 14×units + 384 = 1162.7 ≤ 1168，修前的 21px 实际画出 1259.1，
    // 越出这个盒子 35.1px。**这条测试要判的那件事没变**：21 和 14 同在 24px
    // 大字号线以下，floor 都是 4.5:1，FLIPPED 名单逐个主题实测前后完全一致，
    // 动的只是那个被扣款扣小了的字号常量。
    const FLIPPED = ["bloom", "classroom", "pulse", "ember", "vermilion"]
    const longDeck = ir([endingLongSub])
    for (const themeId of CANONICAL_THEME_IDS) {
      const markup = renderSvgMarkup(
        <FashionEnding ir={longDeck} slide={endingLongSub} index={0} ctx={buildCtx(resolveStyle(themeId), {})} />,
      )
      const expected = FLIPPED.includes(themeId) ? 'fill-opacity="1"' : 'fill-opacity="0.72"'
      expect(markup, themeId).toMatch(
        new RegExp(`font-size="14"[^>]*${expected.replace(".", "\\.")}[^>]*letter-spacing="4"`),
      )
    }
  })

  it("ending：heading 缺省时兜底「Thank you」（ending 家族兜底纪律，defect C 修复：原中文兜底「谢谢」改英文）", () => {
    const deck = ir([endingBare])
    const markup = renderSvgMarkup(<FashionEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)
    expect(markup).toContain("Thank you")
  })

  // 三轮人评 D 簇 · fashion-ending 的字距折行预算（2026-08-20）
  //
  // 与 cover-fashion-masthead 同型同病：副题带 `letterSpacing={4}` 渲染，
  // 却由一个听不见字距的 `layoutSvgText` 定字号，于是英文语料被判「一行放
  // 得下 1168px」。浏览器真 getBBox 量到右缘 1259.1，越出自己声明的 1168
  // 盒（x=56 起，右缘 1224）35.1px——只是恰好还剩 20.9px 没冲出 1280px 页
  // 面，所以这条一度被读成误报。判「出页」确实不成立，判「越盒」成立。
  //
  // 语料是画廊 EN 版式表 `layout--fashion-ending--en` 的原话，测试跟着真
  // 复现走。
  it("ending：副题字距进折行预算，每一行都留在自己声明的 1168px 盒里", () => {
    const EN_SUBHEADING = "Renewals and accuracy both improved — quarter quality ran ahead of plan"
    const SUBTITLE_MAX_W = 1168
    const SUBTITLE_X = 56
    const enEnding = {
      type: "ending",
      heading: "Second-Half Priorities",
      subheading: EN_SUBHEADING,
      components: [],
    } as Slide
    const markup = renderSvgMarkup(<FashionEnding ir={ir([enEnding])} slide={enEnding} index={0} ctx={ctx} />)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${markup}</svg>`)
    const lines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("letter-spacing") === "4",
    )
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(2) // 调用点自己的 maxLines
    for (const line of lines) {
      const text = line.textContent ?? ""
      const fontSize = Number(line.getAttribute("font-size"))
      // 真实渲染宽度 = 字形估算 × 字号 + SVG 属性真画出来的那笔字距
      const width = measureTextUnits(text) * fontSize + Math.max(0, Array.from(text).length - 1) * 4
      expect(width).toBeLessThanOrEqual(SUBTITLE_MAX_W + 1) // +1：浮点余量，沿用 heading-fit.test.ts 的约定
      expect(SUBTITLE_X + width).toBeLessThanOrEqual(1280)
    }
    // 收窄预算只能重新折行，不能把内容吃掉
    expect(lines.map((l) => l.textContent).join(" ")).toBe(EN_SUBHEADING)
  })

  it("三版式输出均在可导出 SVG 子集内", () => {
    const deck = ir([cover, chapter, ending])
    for (const [Comp, slide, index] of [
      [FashionMastheadCover, cover, 0],
      [FashionChapter, chapter, 1],
      [FashionEnding, ending, 2],
    ] as const) {
      const markup = renderSvgMarkup(<Comp ir={deck} slide={slide} index={index} ctx={ctx} />)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
