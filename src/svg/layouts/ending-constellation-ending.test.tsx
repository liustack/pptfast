// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { ConstellationEnding } from "./ending-constellation-ending"
import type { PptxIR, Slide } from "@/ir"

// 有 heading 的 ending：不触发 heading 兜底"Thank you."，末尾也不是句号，所以
// 不触发 splitTrailingPeriod 的 accent tspan 分支。
const endingWithHeading: Slide = {
  type: "ending",
  heading: "感谢聆听",
  components: [],
} as Slide

// 无 heading 的 ending：触发 heading 兜底"Thank you."（defect C 修复：原中文
// 兜底"谢谢。"改英文），其结尾句号被 splitTrailingPeriod 拆出，单独渲染为
// accent 色的 tspan。
const endingBare: Slide = { type: "ending", components: [] } as Slide

const ir = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: { organization: "维岚科技", date: "2026-07-09" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// No org/contact/date — isolates assertions to the heading/subheading chain
// and proves the signature bar + meta text are omitted together (no
// orphaned decorative bar with nothing under it).
const irNoMeta = (theme: string, slide: Slide): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// Captured once from the (now-retired) legacy `BentoTechEnding` — locks the
// byte-identical output the port preserved, without importing templates/.
const ENDING_TECH_WITH_HEADING_MARKUP =
  '<text x="640" y="330" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#EAF1FA" text-anchor="middle" dominant-baseline="alphabetic">感谢聆听</text><rect x="610" y="420" width="60" height="3" fill="#53E0D2"></rect><text x="640" y="463" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="13" fill="#93A5C0" text-anchor="middle" dominant-baseline="alphabetic">维岚科技</text>'
const ENDING_TECH_BARE_MARKUP =
  '<text x="640" y="330" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#EAF1FA" text-anchor="middle" dominant-baseline="alphabetic">Thank you<tspan fill="#53E0D2">.</tspan></text><rect x="610" y="420" width="60" height="3" fill="#53E0D2"></rect><text x="640" y="463" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="13" fill="#93A5C0" text-anchor="middle" dominant-baseline="alphabetic">维岚科技</text>'

describe("ConstellationEnding", () => {
  it("tech tokens 下与旧 BentoTechEnding 输出逐字节一致（档位一，有 heading，不兜底）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", endingWithHeading)

    const next = renderSvgMarkup(
      <ConstellationEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />,
    )
    expect(next).toBe(ENDING_TECH_WITH_HEADING_MARKUP)
    expect(next).toContain("感谢聆听")
    expect(next).not.toContain("Thank you")
  })

  it("tech tokens 下无 heading 时与旧 BentoTechEnding 输出逐字节一致（档位一，兜底 + 句号拆分）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", endingBare)

    const next = renderSvgMarkup(
      <ConstellationEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />,
    )
    expect(next).toBe(ENDING_TECH_BARE_MARKUP)
    expect(next).toContain("Thank you")
    // 结尾句号拆成独立 accent 色 tspan，验证 tech 的 accent 值确实用上了。
    // defect C 修复：兜底文案的中文句号"。"改英文句号"."，splitTrailingPeriod
    // 泛化后两者都能拆分（见该函数注释），这里锁的是新值。
    expect(next).toContain('<tspan fill="#53E0D2">.</tspan>')
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting", endingBare)
    const out = renderSvgMarkup(<ConstellationEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)
    expect(out).toContain("#1C1E23") // consulting text
    expect(out).toContain("#F5C518") // consulting accent
    expect(out).not.toContain("#EAF1FA") // tech text 不得残留
    expect(out).not.toContain("#53E0D2") // tech accent 不得残留
  })

  it("renders markup that passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", endingWithHeading)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={deck} slide={endingWithHeading} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("centers the heading and shows a signature bar + card-less meta text only when meta exists", () => {
    // Post-launch revision: the old bordered/filled meta "card" is gone —
    // replaced by a plain 60x3 accent bar (no card) plus bare centered meta
    // text.
    const slide: Slide = { type: "ending", heading: "谢谢", components: [] } as Slide
    const ctx = buildCtx(resolveStyle("tech"), {})

    const docWithMeta = ir("tech", slide)
    const markupWithMeta = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={docWithMeta} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markupWithMeta).toContain("维岚科技")
    const rootWithMeta = parseSvgRoot(markupWithMeta)
    const heading = Array.from(rootWithMeta.querySelectorAll("text")).find((t) => t.textContent === "谢谢")!
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("x")).toBe("640")

    // Exactly one <rect> in this fixture (no subheading): the 60x3 accent
    // signature bar — no card-shaped rect anywhere.
    const rects = Array.from(rootWithMeta.querySelectorAll("rect"))
    expect(rects).toHaveLength(1)
    expect(rects[0].getAttribute("width")).toBe("60")
    expect(rects[0].getAttribute("height")).toBe("3")
    expect(rects[0].getAttribute("fill")).toBe(ctx.colors.accent)

    const docNoMeta = irNoMeta("tech", slide)
    const markupNoMeta = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={docNoMeta} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    // No org/contact/date → the signature bar is omitted entirely too (no
    // orphaned decorative bar with nothing under it) — no <rect> at all.
    const rootNoMeta = parseSvgRoot(markupNoMeta)
    expect(rootNoMeta.querySelectorAll("rect")).toHaveLength(0)
  })

  it("renders slide.subheading centered below the heading, and omits it when absent", () => {
    const slide: Slide = {
      type: "ending",
      heading: "谢谢",
      subheading: "感谢聆听与支持",
      components: [],
    } as Slide
    const ctx = buildCtx(resolveStyle("tech"), {})
    const doc = ir("tech", slide)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).toContain("感谢聆听与支持")
    const root = parseSvgRoot(markup)
    const sub = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "感谢聆听与支持")!
    expect(sub.getAttribute("text-anchor")).toBe("middle")
    expect(sub.getAttribute("x")).toBe("640")
    expect(sub.getAttribute("fill")).toBe(ctx.colors.muted)

    // No org/contact/date either, so the signature bar + meta text (which
    // also renders centered muted text) is omitted entirely — isolates the
    // assertion to just the subheading line, and confirms no orphaned bar.
    const slideNoSub: Slide = { type: "ending", heading: "谢谢", components: [] } as Slide
    const docNoSub = irNoMeta("tech", slideNoSub)
    const markupNoSub = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={docNoSub} slide={slideNoSub} index={0} ctx={ctx} />
      </svg>,
    )
    const rootNoSub = parseSvgRoot(markupNoSub)
    expect(rootNoSub.querySelectorAll("rect")).toHaveLength(0)
    const centeredMuted = Array.from(rootNoSub.querySelectorAll("text")).filter(
      (t) => t.getAttribute("text-anchor") === "middle" && t.getAttribute("fill") === ctx.colors.muted,
    )
    expect(centeredMuted).toHaveLength(0)
  })

  it("a heading that doesn't end in '。' renders unchanged — no split accent tspan", () => {
    const customSlide: Slide = { type: "ending", heading: "Thank you", components: [] } as Slide
    const ctx = buildCtx(resolveStyle("tech"), {})
    const customDoc = ir("tech", customSlide)
    const customMarkup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={customDoc} slide={customSlide} index={0} ctx={ctx} />
      </svg>,
    )
    const customRoot = parseSvgRoot(customMarkup)
    const customHeading = Array.from(customRoot.querySelectorAll("text")).find(
      (t) => t.textContent === "Thank you",
    )!
    expect(customHeading.querySelector("tspan")).toBeNull()
  })

  // Regression lock for defect C (bench-driven fixes wave, task 4):
  // `splitTrailingPeriod` was generalized from CJK-only ("。") to also
  // recognize the ASCII "." so the accent-colored-trailing-punctuation
  // signature detail survives the fallback heading's translation to
  // English ("Thank you.") — see the function's own comment. This is a new
  // user-facing behavior beyond the fallback path itself: any explicit
  // English heading ending in "." now gets the same accent-color split a
  // CJK "。" always got, closing a design-detail gap that previously only
  // Chinese-language decks benefited from.
  it("an explicit heading ending in ASCII '.' also splits the trailing period into an accent tspan (not just the CJK '。' the helper originally supported)", () => {
    const customSlide: Slide = { type: "ending", heading: "Let's grow together.", components: [] } as Slide
    const ctx = buildCtx(resolveStyle("tech"), {})
    const customDoc = ir("tech", customSlide)
    const customMarkup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationEnding ir={customDoc} slide={customSlide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(customMarkup).toContain('<tspan fill="#53E0D2">.</tspan>')
    const customRoot = parseSvgRoot(customMarkup)
    // bold-metrics fix (2026-07-24): round 1's class-average-plus-margin
    // model wrapped this heading to 2 lines ("Let's grow" / "together.");
    // round 2's exact per-character model (tech's YaHei heading face) is
    // more precise for this particular string and fits it back onto one
    // line at fontSize 88, the layout's own declared max -- see this
    // fix's report round-2 section's aesthetic-comparison data (round 2
    // never shrinks *more* than round 1, and often less, exactly this
    // case). Re-pinned to find the line carrying the split tspan (this
    // test's actual subject) via its own attributes rather than assume any
    // particular line count -- twice now, first for round 1's wrap, now
    // back for round 2's fit.
    const headingLines = Array.from(customRoot.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-size") === "88" && t.getAttribute("font-weight") === "700",
    )
    expect(headingLines.map((t) => t.textContent)).toEqual(["Let's grow together."])
    const customHeading = headingLines.find((t) => t.querySelector("tspan") !== null)!
    expect(customHeading.textContent).toBe("Let's grow together.")
    expect(customHeading.querySelector("tspan")?.textContent).toBe(".")
  })

  it("last-line-anchored: a 2-line heading's last line lands at the same y (330) as the 1-line case, so the subheading/bar/meta chain below is byte-identical regardless of line count", () => {
    // "从今天开始用声明式管理你的" (13 CJK chars) is the shortest input that
    // forces wrapping here (maxWidth=1088/fontSize=88) while staying at the
    // *nominal* 88px (not shrunk). Nothing renders above the heading in this
    // Ending, so anchoring the last line is unconditionally safe.
    const twoLineSlide: Slide = { type: "ending", heading: "从今天开始用声明式管理你的", components: [] } as Slide
    const oneLineSlide: Slide = { type: "ending", heading: "谢谢", components: [] } as Slide
    const ctx = buildCtx(resolveStyle("tech"), {})

    const twoLineRoot = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <ConstellationEnding ir={ir("tech", twoLineSlide)} slide={twoLineSlide} index={0} ctx={ctx} />
        </svg>,
      ),
    )
    const oneLineRoot = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <ConstellationEnding ir={ir("tech", oneLineSlide)} slide={oneLineSlide} index={0} ctx={ctx} />
        </svg>,
      ),
    )

    const twoLineHeadingTexts = Array.from(twoLineRoot.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700" && t.getAttribute("text-anchor") === "middle",
    )
    expect(twoLineHeadingTexts.length).toBe(2)
    expect(Number(twoLineHeadingTexts[0].getAttribute("font-size"))).toBe(88) // nominal, not shrunk
    const ys = twoLineHeadingTexts.map((t) => Number(t.getAttribute("y"))).sort((a, b) => a - b)
    const [firstY, lastY] = ys
    expect(firstY).toBe(330 - 95) // HEADING_LAST_BASELINE(330) - lineHeight(round(88*1.08)=95)
    expect(lastY).toBe(330) // invariant — same as the 1-line baseline

    const oneLineHeading = Array.from(oneLineRoot.querySelectorAll("text")).find(
      (t) => t.textContent === "谢谢",
    )!
    expect(oneLineHeading.getAttribute("y")).toBe("330")

    // Signature bar sits at the same y regardless of line count.
    const twoLineBar = twoLineRoot.querySelector("rect")
    const oneLineBar = oneLineRoot.querySelector("rect")
    expect(twoLineBar?.getAttribute("y")).toBe(oneLineBar?.getAttribute("y"))
  })

  // contrast-policy wave, 裁定 3 (task T2, corrected by T2 review +
  // controller adjudication): the accent-colored trailing period is A-tier
  // large text (88px-class heading, 3:1 floor) and used to paint
  // `colors.accent` unconditionally — ember measured 1.57:1 against its own
  // real ending background, a real WCAG violation no fixture had ever
  // exercised (see `stress-fixtures.ts`'s new pinned entry and
  // `deck-audit.test.ts`'s 16-theme sweep for the full red list). The
  // fallback is the heading's own `colors.text` ink (in-sentence
  // coherence — the period sits mid-sentence next to text already painted
  // `colors.text`), not a shared neutral ink — see the layout's own
  // comment for why `accessibleInk`'s usual contract doesn't fit this call
  // site.
  // 2026-08-19 暖纸组皮肤重设计换了 ember 的 accent/text 两枚 token
  // （`#FFC145`→`#E8A13C`、`#26221E`→`#2E241E`）。回退路径本身不变：新
  // accent 实测压 ending 背景 `#FBF5EE` 只有 2.02:1（旧值 1.57:1），仍在
  // 3:1 大字门槛之下，句点照旧落回本句自己的 `colors.text` 墨。
  it("ember: the accent-colored period falls back to the heading's own colors.text ink (accent measures 2.02:1 against ember's own light ending background)", () => {
    const ctx = buildCtx(resolveStyle("ember"), {})
    const slide: Slide = { type: "ending", heading: "Thank you.", components: [] } as Slide
    const markup = renderSvgMarkup(<ConstellationEnding ir={ir("ember", slide)} slide={slide} index={0} ctx={ctx} />)
    // Below the 3:1 floor against ember's real ending background — the
    // period must not keep the raw accent fill, and must match the
    // sentence's own ink (#2E241E), not a generic neutral dark.
    expect(markup).not.toContain('<tspan fill="#E8A13C">.</tspan>')
    expect(markup).not.toContain('<tspan fill="#0A0E14">.</tspan>')
    expect(markup).toContain('<tspan fill="#2E241E">.</tspan>')
    expect(ctx.colors.text).toBe("#2E241E")
  })

  // Themes whose accent already clears 3:1 against their own real ending
  // background stay byte-identical — `accessibleInk` is a no-op there.
  // `tech` is already locked by this file's own "无 heading 时" test above
  // (`<tspan fill="#53E0D2">.</tspan>`); this adds a second, independently
  // measured no-op witness (`enterprise`, one of the 9 themes whose accent
  // already clears 3:1 against its own ending background — the full
  // pass/fail split across all 17 themes is measured and recorded in
  // `deck-audit.test.ts`'s dedicated 16-theme sweep, not repeated here).
  it("enterprise: the accent-colored period keeps the theme's own accent fill (already clears 3:1 — accessibleInk is a no-op)", () => {
    const ctx = buildCtx(resolveStyle("enterprise"), {})
    const slide: Slide = { type: "ending", heading: "Thank you.", components: [] } as Slide
    const markup = renderSvgMarkup(
      <ConstellationEnding ir={ir("enterprise", slide)} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain('<tspan fill="#2F6FBF">.</tspan>')
  })

  // T2 review correction, controller-adjudicated: the fallback ink changed
  // from `readableOn`'s shared neutral (#0A0E14) to the heading's own
  // `colors.text`, on the theory that `colors.text` is guaranteed >=4.5:1 on
  // `colors.bg` by theme calibration, so this fallback always clears the 3:1
  // large-text floor too — never mind which of the two branches
  // (`colors.accent` kept, or `colors.text` fallback) actually fires. Proves
  // that "coherence property" for real, across all 17 canonical themes, not
  // just the two named witnesses above: whichever fill the period ends up
  // with is always one of `colors.accent`/`colors.text` (never a third,
  // neutral value) and always clears the required ratio against the real
  // rendered background.
  it("coherence property, all 17 themes: the period's fill is always colors.accent or colors.text, and always clears the 3:1 large-text floor", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const ctx = buildCtx(resolveStyle(themeId), {})
      const slide: Slide = { type: "ending", heading: "Thank you.", components: [] } as Slide
      const markup = renderSvgMarkup(
        <ConstellationEnding ir={ir(themeId, slide)} slide={slide} index={0} ctx={ctx} />,
      )
      const match = markup.match(/<tspan fill="(#[0-9A-Fa-f]{6})">\.<\/tspan>/)
      expect(match, `${themeId}: expected a period tspan in ${markup}`).not.toBeNull()
      const periodFill = match![1]

      expect(
        [ctx.colors.accent, ctx.colors.text],
        `${themeId}: period fill ${periodFill} is neither colors.accent (${ctx.colors.accent}) nor colors.text (${ctx.colors.text})`,
      ).toContain(periodFill)

      const bg = ctx.defaultBg ?? ctx.colors.bg
      const ratio = contrastRatio(periodFill, bg)
      expect(
        ratio,
        `${themeId}: period fill ${periodFill} measures ${ratio.toFixed(2)}:1 against ${bg}, below the required ${requiredContrastRatio(88)}:1`,
      ).toBeGreaterThanOrEqual(requiredContrastRatio(88))
    }
  })
})
