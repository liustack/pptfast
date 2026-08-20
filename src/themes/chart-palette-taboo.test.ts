// @vitest-environment node
//
// The blue-with-orange ban, swept across every built-in theme's
// `chartPalette` (round-4 review). The user's own words, on enterprise p09
// and p10: 「我不知道 claude design 为什么又把橙配蓝弄出来，这个真的太丑了，
// 应该列为禁忌」 and 「不要蓝配橙，超级丑」. This file is the durable form of
// that verdict: a palette must not put a vivid orange and a vivid blue in
// the same chart.
//
// ## What counts as "vivid orange" and "vivid blue"
//
// Measured in HSL, which is the vocabulary the theme files themselves use
// when they describe a token (火橙/天蓝/机灰 and so on):
//
//   - orange: hue 15-50 with saturation >= 0.35. The lower edge keeps pure
//     signal reds out (#C0231A sits at hue 3) — red against blue is a
//     Swiss-poster pairing, not the one that was banned. The upper edge is
//     deliberately generous: it swallows gold and yellow too, which is why
//     three themes below need an adjudicated exception rather than a
//     narrower band. Trying to split "amber" from "gold" numerically does
//     not survive contact with the real values — tech's #FFC14D is at 39.1
//     and campaign's #F0B429 at 41.9, and no honest line runs between them.
//     So the band is wide and the judgement is written down by name.
//   - blue: hue 195-260 with saturation >= 0.35. Below 195 the color reads
//     as teal (terra's #3E6B63 at 169, pulse's own greens at 164-170) and
//     orange-against-teal is not what the user rejected. The saturation
//     floor is what keeps the slate grey-blues out — heritage's #3F5361
//     (s=0.21), insight's #7E93A8 (0.19), vermilion's #4A5C6E (0.20),
//     luxe's #77808E (0.09) all read as neutrals on the page, not as blue,
//     and the Morandi twins bloom/classroom sit just under the line too
//     (#4A6B8A at 0.30 against #988054 at 0.29).
//
// ## The four palettes this verdict actually changed
//
//   - enterprise: 炸橘 #E85D1F → 工业蓝 #2F6FBF. Named by the user.
//   - ember: 天蓝 #3E7CB1 → 余烬紫 #6B3F5C. Found by the round-4 triage
//     sweep as the second instance.
//   - pulse: 警示褐 #B9722F → 墨蓝灰 #2E4257. Same shape, plus the theme's
//     own file already said 「全程冷配角，暖色一律不出场」 while keeping a
//     burnt orange in its chart table.
//   - tech: 警示琥珀 #FFC14D → 薄荷绿 #4BD98A. Same shape: one lone warm
//     against a cyan/blue/violet trio.
//
// Each replacement stays inside its own theme's colour language, clears the
// 3.0 decorative-contrast floor against every background that theme renders
// a chart on, and keeps every pair in the palette distinguishable — see the
// per-palette assertions below and each theme file's own header for the
// measured numbers.
import { describe, expect, it } from "vitest"
import { THEME_STYLES, CANONICAL_THEME_IDS } from "./index"
import { contrastRatio } from "@/svg/ink"

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** HSL hue (degrees) + saturation (0-1), the vocabulary the theme files use. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r0, g0, b0] = hexToRgb(hex)
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { hue: 0, sat: 0 }
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue: number
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return { hue: hue * 60, sat }
}

/** CIE76 ΔE between two hexes, via sRGB → XYZ (D65) → CIELAB. */
function deltaE(a: string, b: string): number {
  const toLab = (hex: string) => {
    const lin = hexToRgb(hex).map((c) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }) as [number, number, number]
    const [r, g, bl] = lin
    const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * bl) / 0.95047
    const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * bl
    const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * bl) / 1.08883
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
    const fx = f(X)
    const fy = f(Y)
    const fz = f(Z)
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const
  }
  const x = toLab(a)
  const y = toLab(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const VIVID = 0.35
function isVividOrange(hex: string): boolean {
  const { hue, sat } = hueSat(hex)
  return sat >= VIVID && hue >= 15 && hue <= 50
}
function isVividBlue(hex: string): boolean {
  const { hue, sat } = hueSat(hex)
  return sat >= VIVID && hue >= 195 && hue <= 260
}

/**
 * Palettes that trip the wide band above and are nonetheless kept, each with
 * the reason it is not the pairing the user rejected. Adjudicated by name so
 * the judgement is visible and reversible, rather than hidden inside a
 * narrower threshold that would only look objective.
 */
const ADJUDICATED: Record<string, string> = {
  academic:
    "学者金 #A8861D (hue 45.3) 与靛青 #3F5B8C：金配靛是期刊语域的常规搭配，" +
    "不是用户点名的亮橙压亮蓝。靛青饱和度 0.38 也只是刚过线。",
  consulting:
    "高亮黄 #F5C518 (hue 47.0) 与藏青 #1E2A4A / 数据蓝 #3B76A8：藏青配黄是" +
    "本主题的战略咨询签名，用户逐页看过 consulting 全部十页未提。",
  campaign:
    "鎏金 #F0B429 (hue 41.9) 与天青 #4FC1E9 (hue 196)：这张表是洋红/鎏金/" +
    "天青/荧绿的四色纸屑，色相绕满整个色轮，不是「蓝与橙二选一」的配色故事；" +
    "而且 motif-campaign-motif 直接把这四色当纸屑用（每色 30 枚，有测试钉住），" +
    "动它等于重画整个主题的装饰。两条边界值也都在带缘（41.9 对 40 一线，" +
    "196 对 195 一线）。若用户后续点名，这里就是要改的那一格。",
  crayon:
    "向日黄 #F5B700 (hue ~45) 与蜡笔蓝 #2B59C3：这张表是一盒四色蜡笔（蓝/" +
    "橘红/草绿/黄），色相绕满蜡笔盒，不是「蓝与橙二选一」的配色故事。向日黄" +
    "写死仅色块永不承字（1.68:1），motif-crayon-motif 的彩虹短划与圆贴纸直接" +
    "按这四色轮换。动它等于重画整个主题的装饰。",
}

describe("chart palette: no vivid orange beside a vivid blue (round-4 taboo)", () => {
  for (const themeId of CANONICAL_THEME_IDS) {
    it(`${themeId}`, () => {
      const palette = THEME_STYLES[themeId].colors.chartPalette
      const oranges = palette.filter(isVividOrange)
      const blues = palette.filter(isVividBlue)
      const clash = oranges.length > 0 && blues.length > 0
      if (ADJUDICATED[themeId]) {
        // Pinned as a *known* exception: if a future edit makes the clash go
        // away on its own, this line fails and the exception gets deleted
        // rather than quietly outliving its reason.
        expect(clash, `${themeId} no longer trips — drop its ADJUDICATED entry`).toBe(true)
        return
      }
      expect(
        clash,
        `${themeId} pairs ${oranges.join("/")} with ${blues.join("/")} — see this file's header`,
      ).toBe(false)
    })
  }

  it("the four palettes the verdict changed are exactly the four listed here", () => {
    expect(THEME_STYLES["ember"].colors.chartPalette).toEqual([
      "#BC4620",
      "#E8A13C",
      "#6B3F5C",
      "#756B5E",
    ])
    expect(THEME_STYLES["enterprise"].colors.chartPalette).toEqual([
      "#0032A0",
      "#2F6FBF",
      "#0E7C86",
      "#7A7F87",
    ])
    expect(THEME_STYLES["pulse"].colors.chartPalette).toEqual([
      "#0E6B5C",
      "#3D9B82",
      "#4A7FB5",
      "#2E4257",
    ])
    expect(THEME_STYLES["tech"].colors.chartPalette).toEqual([
      "#53E0D2",
      "#5B8CFF",
      "#9A7CFF",
      "#4BD98A",
    ])
  })
})

/**
 * The replacement colours have to survive on the page, not just pass the
 * taboo. Two floors, both the ones the theme files already hold themselves
 * to: 3.0:1 against every background a chart is drawn on, and a visible gap
 * from every sibling in the same palette.
 */
describe("chart palette replacements stay readable and distinguishable", () => {
  const REPLACEMENT = {
    ember: "#6B3F5C",
    enterprise: "#2F6FBF",
    pulse: "#2E4257",
    tech: "#4BD98A",
  } as const
  const CHANGED = ["ember", "enterprise", "pulse", "tech"] as const

  /** Backgrounds a chart actually lands on: content pages and the surface a
   * card paints. `chapter` is deliberately excluded — it is a full-bleed
   * primary block with no body components on it, which is why the old
   * palettes never cleared 3:1 against it either. */
  function chartBackgrounds(themeId: string): string[] {
    const t = THEME_STYLES[themeId as (typeof CANONICAL_THEME_IDS)[number]]
    const out = new Set<string>([t.colors.bg, t.colors.surface])
    const content = t.defaultBackgrounds?.content as
      | { kind: string; value?: string; from?: string }
      | undefined
    if (content?.value) out.add(content.value)
    if (content?.from) out.add(content.from)
    return [...out]
  }

  for (const themeId of CHANGED) {
    it(`${themeId}: every chart colour clears the 3.0:1 decorative floor`, () => {
      for (const hex of THEME_STYLES[themeId].colors.chartPalette) {
        for (const bg of chartBackgrounds(themeId)) {
          // ember's 琥珀 #E8A13C is a documented long-standing exception
          // (2.02:1, "只给点与线，绝不当文字色" — see ember.ts's header). It
          // predates this wave and is not what this file is about.
          if (hex === "#E8A13C") continue
          expect(contrastRatio(hex, bg), `${themeId} ${hex} on ${bg}`).toBeGreaterThanOrEqual(3)
        }
      }
    })

    it(`${themeId}: the replacement is far enough from every sibling to read as its own series`, () => {
      const palette = THEME_STYLES[themeId].colors.chartPalette
      const replacement = REPLACEMENT[themeId]
      for (const sibling of palette) {
        if (sibling === replacement) continue
        // CIE76 ΔE in Lab, the measure the replacements were actually chosen
        // with. 20 is the floor a categorical palette needs for two marks to
        // read as different series at chart scale; the four replacements come
        // in at 27-36 against their nearest sibling.
        //
        // Scoped to the replaced colour on purpose. Sweeping every pair would
        // re-open palettes this wave never touched — ember's 火橙 #BC4620 and
        // 烬灰 #756B5E, for one, are near-identical in lightness (Lab L 46
        // both) and are told apart by chroma (65 vs 9) rather than by ΔE.
        // That is a pre-existing judgement, not this wave's to reverse.
        expect(
          deltaE(replacement, sibling),
          `${themeId}: ${replacement} sits on top of ${sibling}`,
        ).toBeGreaterThan(20)
      }
    })
  }
})
