import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { code } from "../components/code"
import { resolveFontStack } from "../fonts"
import type { ComponentCtx } from "../components/types"
import { auditSvgMarkup } from "./svg-audit"

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${inner}</svg>`

describe("auditSvgMarkup", () => {
  it("passes text that fits its box", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,400">` +
          `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">短文本</text></g>` +
          `</g></g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("flags unwrapped text wider than its box as h-overflow", () => {
    const long = "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范说明"
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,300">` +
          `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">${long}</text></g>` +
          `</g></g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })

  it("respects text-anchor=end", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,300">` +
          `<text x="400" y="20" text-anchor="end" font-size="16">right aligned</text>` +
          `</g></g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("flags text below the content rect as v-overflow", () => {
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-rect="96,176,1088,424">` +
          `<text x="96" y="700" font-size="20">stacked past bottom</text>` +
          `</g>`,
      ),
    )
    expect(issues.some((i) => i.kind === "v-overflow")).toBe(true)
  })

  it("flags text outside the 1280x720 page", () => {
    const issues = auditSvgMarkup(
      wrap(`<text x="1270" y="30" font-size="20">edge overflow text</text>`),
    )
    expect(issues.some((i) => i.kind === "page-overflow")).toBe(true)
  })

  // text-anchor="middle" straddles its x coordinate, so the auditor must
  // subtract width/2 (not width) from tx to find the left edge. "12345678"
  // is 8 digits, each weighed 0.56 by measureTextUnits (digits fall in the
  // lowercase/digit bucket), so units = 8 * 0.56 = 4.48 and, at font-size
  // 20, width = 89.6, half-width = 44.8.
  it("computes text-anchor=middle left/right edges from width/2 and fits inside the box", () => {
    // box spans x=[100,300] (TOL-padded to [94,306]); tx=200 is the box
    // center, so left = 200 - 44.8 = 155.2, right = 200 + 44.8 = 244.8.
    // Both stay inside the padded bounds with a 61.2px margin (> TOL=6).
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,200">` +
          `<text x="200" y="20" text-anchor="middle" font-size="20">12345678</text>` +
          `</g>`,
      ),
    )
    expect(issues).toEqual([])
  })

  it("computes text-anchor=middle left/right edges from width/2 and flags an h-overflow past the box edge", () => {
    // Same box and text, but tx=280 shifts the (still 89.6-wide) text right:
    // left = 280 - 44.8 = 235.2, right = 280 + 44.8 = 324.8. The right edge
    // exceeds the padded box bound of 306 by 18.8px (> TOL=6), while the
    // left edge (235.2) stays well inside the padded bound of 94 — so this
    // must produce exactly one h-overflow, not a left-edge violation too.
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,200">` +
          `<text x="280" y="20" text-anchor="middle" font-size="20">12345678</text>` +
          `</g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })

  // The auditor's recursive `visit` must thread the accumulated translate
  // offset (ax = ox + dx) through every nested <g>, not just the innermost
  // one. Three levels translate by 50, 70, and 90, so the text's true x
  // offset is 50 + 70 + 90 = 210. "OVERFLOW" is 8 uppercase chars, each
  // weighed 0.66, so units = 8 * 0.66 = 5.28 and, at font-size 20,
  // width = 105.6.
  it("accumulates offsets across three nested translate() groups before overflow checks", () => {
    // box spans x=[100,250] (TOL-padded right bound = 100+150+6 = 256).
    // Correct accumulation: left = 210 + 0 = 210, right = 210 + 105.6 = 315.6,
    // which exceeds 256 by 59.6px (> TOL=6) — a single h-overflow.
    // Any partial accumulation (e.g. only the innermost translate, dx=90,
    // or only two of the three levels, dx<=120) would give right <= 225.6,
    // which stays under 256 and would wrongly report no overflow — so this
    // only fails if all three levels are summed.
    const issues = auditSvgMarkup(
      wrap(
        `<g data-audit-box="100,100,150">` +
          `<g transform="translate(50,0)">` +
          `<g transform="translate(70,0)">` +
          `<g transform="translate(90,0)">` +
          `<text x="0" y="20" font-size="20">OVERFLOW</text>` +
          `</g></g></g></g>`,
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("h-overflow")
  })
})

// borrow-wave Task 3 review round (2026-07-21): a permanent regression for
// task-3-review.md's Important finding N1. Real `code.render()` (the
// renderer under test) + real `auditSvgMarkup` (the auditor under test) —
// neither function is reimplemented or mirrored here — wrapped in a
// hand-built `data-audit-box` envelope that mirrors `SvgContent.tsx`'s own
// per-component wrapper (the one piece this test builds by hand, since
// `code.render()` alone never emits its own box — see that component's own
// file). `ctx.fonts.mono` comes from a real `resolveFontStack([], "mono")`
// call, not a hand-typed literal, so this test exercises the exact family
// string production code emits (confirmed against `fonts.test.ts`'s own
// pin: `resolveFontStack([], "mono")` === `"Consolas, Menlo, monospace"`).
//
// Before this round's fix (bf6131e..17a459a), `code.tsx` sized this text
// with the exact `measureMonoTextUnits` model while this file's
// `auditSvgMarkup` still measured every `<text>` proportionally
// (`measureTextUnits`) — the two disagreed, and upper/underscore-heavy
// content (constant names, SQL keywords, env-var assignments) could read as
// "overflowing" a box the real renderer never actually overflowed (the
// renderer's own `Math.floor` sizing structurally guarantees it doesn't —
// see `code.tsx`'s `MONO_WIDTH_SAFETY` derivation comment). Confirmed red
// on pre-fix HEAD (17a459a) with this exact construction: boxW=700 produced
// `h-overflow: text [54,761] exceeds box x=0 w=700` — byte-identical to the
// reviewer's own captured repro in task-3-review.md's Important finding N1.
describe("auditSvgMarkup — mono/proportional alignment with the real code renderer (red-first, borrow-wave Task 3 fix round)", () => {
  const ctx: ComponentCtx = {
    colors: {
      bg: "#FFFFFF",
      surface: "#F4F4F4",
      primary: "#006A4E",
      accent: "#00A878",
      text: "#1A2421",
      muted: "#5D6B65",
      chartPalette: ["#006A4E", "#00A878"],
    },
    fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: resolveFontStack([], "mono") },
    bodyFontPx: 24,
  }

  // The reviewer's exact repro string (task-3-review.md N1): a realistic
  // SCREAMING_SNAKE_CASE constant/env-var name, 101 characters, "not a
  // contrived extreme case" per that finding.
  const SCREAMING_SNAKE_101 =
    "CONST_MAX_RETRY_COUNT_FOR_DISTRIBUTED_TRANSACTION_COMPENSATION_STRATEGY_ACROSS_ALL_AVAILABILITY_ZONES"

  it("is really 101 characters (the finding's own premise)", () => {
    expect(SCREAMING_SNAKE_101).toHaveLength(101)
  })

  // The reviewer's own sweep found this class false-positives across
  // boxW 270-1010 (75 of 115 sampled widths for this exact string) — the
  // lower bound, the reviewer's own cited boxW=700 example, and the upper
  // bound, so a fix that only narrowly patches one width can't pass here.
  for (const boxW of [270, 700, 1010]) {
    it(`renders zero h-overflow findings at boxW=${boxW} (false-positive window per task-3-review.md)`, () => {
      const box = { x: 0, y: 0, w: boxW }
      const inner = renderToStaticMarkup(
        code.render({ type: "code", language: "ts", code: SCREAMING_SNAKE_101 }, box, ctx),
      )
      const markup = wrap(`<g data-audit-box="${box.x},${box.y},${box.w}">${inner}</g>`)
      const issues = auditSvgMarkup(markup)
      expect(issues.filter((i) => i.kind === "h-overflow")).toEqual([])
    })
  }

  // "Proportional roles stay proportional" (this round's explicit scope
  // fence, task-3-report.md's fix-round entry) — the mono branch must not
  // generalize into a free pass for other roles. Same uppercase/underscore-
  // heavy content, same box, rendered under `ctx.fonts.body` instead of
  // `ctx.fonts.mono`: `measureTextUnits`'s real +20%-class overestimate for
  // uppercase text must still fire. This uses `SvgContent`'s own
  // `paragraph`-style raw `<text>` shape (hand-built, since no shared
  // component renders arbitrary body text at a fixed size/box this
  // directly) rather than a second real component, specifically to prove
  // the *auditor's* branch — not just "does code.tsx happen to call
  // measureMonoTextUnits" — actually keys off font-family, not content.
  it("still flags proportional (non-mono) text with the same content as h-overflow (scope fence: mono-only, not all roles)", () => {
    const content = SCREAMING_SNAKE_101
    const boxW = 700
    const markup = wrap(
      `<g data-audit-box="0,0,${boxW}">` +
        `<text x="0" y="20" font-size="15" font-family="${ctx.fonts.body}">${content}</text>` +
        `</g>`,
    )
    const issues = auditSvgMarkup(markup)
    expect(issues.filter((i) => i.kind === "h-overflow")).toHaveLength(1)
  })
})
