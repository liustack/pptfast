// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PACING_BUDGETS } from "@/narrative"
import { CampaignMotif, CONFETTI_COUNT, CONFETTI_HALF_FIELD_COUNT, PIECE_REACH } from "./motif-campaign-motif"
import type { Component, PptxIR, Slide } from "@/ir"

const para = (text: string): Component => ({ type: "paragraph", text }) as Component
const slideOf = (type: Slide["type"], components: Component[] = [], heading = "标题"): Slide =>
  ({ type, heading, components }) as Slide

const coverSlide = slideOf("cover")
const chapterSlide = slideOf("chapter")
const contentSlide = slideOf("content")
const endingSlide = slideOf("ending", [], undefined as unknown as string)
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const BOARD_ZONES = {
  title: { x: 96, y: 48, w: 1040, h: 122 },
  body: { x: 96, y: 200, w: 1040, h: 420 },
  footerMeta: { x: 48, y: 664, w: 1184, h: 44 },
  brLogo: { x: 1120, y: 630, w: 96, h: 40 },
} as const

/** `branding.tsx` 的四个 logo 位（`brand.position` 四选一），各 96×40。 */
const LOGO_BOXES = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
] as const

/**
 * 全 41 版式 + 主题 deck 十页实测出来的排字外沿（工具：
 * `.issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts`，
 * 486 条文字 / 51 页）。三条纸屑带按这四个数收边，推导见 motif 文件头。
 */
const TEXT_ENVELOPE = { top: 34, bottom: 708.6, left: 56, right: 1224 } as const

/** 三条带的取样窗（与 motif 源同源，这里独立复述一遍当契约钉住）。 */
const BANDS = [
  { name: "top", x: [48, 1232], y: [10, 27] },
  { name: "left", x: [20, 48], y: [40, 655] },
  { name: "right", x: [1232, 1264], y: [40, 655] },
] as const
/** 与 motif 源同一个数：两处各写一遍就会各自漂。 */
const REACH = PIECE_REACH

const ir = (theme: string, filename = "x.pptx"): PptxIR =>
  ({
    version: "3",
    filename,
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

function render(body: React.ReactElement | null): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

function draw(theme: string, slide: Slide, filename?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return render(<CampaignMotif ir={ir(theme, filename)} slide={slide} ctx={ctx} />)
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

/** 每枚纸屑的包围盒：圆点按 cx/cy/r，斜方片按四角。 */
function pieceBoxes(root: Element): { kind: string; box: Box }[] {
  const out: { kind: string; box: Box }[] = []
  for (const c of Array.from(root.querySelectorAll("circle"))) {
    const r = num(c, "r")
    out.push({
      kind: "dot",
      box: { x0: num(c, "cx") - r, y0: num(c, "cy") - r, x1: num(c, "cx") + r, y1: num(c, "cy") + r },
    })
  }
  for (const p of Array.from(root.querySelectorAll("path"))) {
    const nums = (p.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number)
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    out.push({ kind: "chip", box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } })
  }
  return out
}

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

/** 一组数的变异系数（标准差 / 均值）——用来量「疏密」而不是「多少」。 */
function coefficientOfVariation(xs: readonly number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
  return sd / mean
}

/** 同一条 LCG 撒同样枚数的均布参照场，间距的变异系数当基线用。 */
function uniformGapCv(n: number, lo: number, hi: number): number {
  let s = 7 >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const xs = Array.from({ length: n }, () => lo + rnd() * (hi - lo)).sort((a, b) => a - b)
  return coefficientOfVariation(xs.slice(1).map((x, i) => x - xs[i]!))
}

/**
 * campaign-motif v6「纸屑场」（2026-08-20 柔和组皮肤重设计；v6 = 同日第四轮
 * 评审「纸屑太机械」的返工：同一条 LCG，撒得不再匀）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html`
 * 的 `section#g4` campaign 设计表。
 */
describe("CampaignMotif（纸屑场）", () => {
  it("满场 120 枚，任务书的「装饰点数百级」硬指标", () => {
    expect(CONFETTI_COUNT).toBe(120)
    const { root } = draw("campaign", coverSlide)
    expect(root.querySelectorAll("circle").length + root.querySelectorAll("path").length).toBe(120)
  })

  it("两形制两成数：80 枚圆点 + 40 枚斜方片（板上 `k % 3 === 2` 走斜方片）", () => {
    const { root } = draw("campaign", coverSlide)
    expect(Array.from(root.querySelectorAll("circle"))).toHaveLength(80)
    expect(Array.from(root.querySelectorAll("path"))).toHaveLength(40)
  })

  it("四色轮换取自 chartPalette，每色恰好 30 枚（图表与装饰同源）", () => {
    const t = resolveStyle("campaign")
    const { root } = draw("campaign", coverSlide)
    const counts = new Map<string, number>()
    for (const el of Array.from(root.querySelectorAll("circle, path"))) {
      const fill = el.getAttribute("fill")!
      counts.set(fill, (counts.get(fill) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual([...t.colors.chartPalette].sort())
    for (const c of t.colors.chartPalette) expect(counts.get(c), c).toBe(30)
  })

  it("蜡笔条整族退役：没有一枚纸屑超出单枚外扩的两倍（v4 的笔画宽 42-96px）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      expect(box.x1 - box.x0, `piece too wide: ${JSON.stringify(box)}`).toBeLessThanOrEqual(2 * REACH)
      expect(box.y1 - box.y0, `piece too tall: ${JSON.stringify(box)}`).toBeLessThanOrEqual(2 * REACH)
    }
  })

  // ── v6：撒得不再匀 ────────────────────────────────────────────────────
  /**
   * 评审 campaign p03 的原话是「这些撒花的装饰太机械了，没有灵动的感觉」。
   * 病灶是处处一样：v5 的位置带内均布、尺寸只在一档窄区间线性取、斜方片
   * 一律 ±45°、透明度整场恒定 0.9。这一组是那条裁定的守卫——四项里任何
   * 一项退回 v5 的写法都会红。
   */
  describe("疏密节奏与逐枚变化（v6 返工的守卫）", () => {
    it("顶带的间距比均布参照场更不齐（有团有空档，不是一条等距点线）", () => {
      const { root } = draw("campaign", coverSlide)
      const xs = pieceBoxes(root)
        .filter(({ box }) => box.y1 <= TEXT_ENVELOPE.top)
        .map(({ box }) => (box.x0 + box.x1) / 2)
        .sort((a, b) => a - b)
      expect(xs).toHaveLength(CONFETTI_HALF_FIELD_COUNT)
      const cv = coefficientOfVariation(xs.slice(1).map((x, i) => x - xs[i]!))
      expect(cv, "top band reads as an evenly spaced row").toBeGreaterThan(uniformGapCv(xs.length, 48, 1232) * 1.2)
      // 团与团之间读得出空档：最大间距至少是均值的四倍。
      const gaps = xs.slice(1).map((x, i) => x - xs[i]!)
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
      expect(Math.max(...gaps)).toBeGreaterThan(mean * 4)
    })

    it("圆点半径拉开且偏小：至少 20 档不同，多数在区间下半", () => {
      const { root } = draw("campaign", coverSlide)
      const radii = Array.from(root.querySelectorAll("circle")).map((c) => num(c, "r"))
      expect(new Set(radii).size).toBeGreaterThanOrEqual(20)
      const lo = Math.min(...radii)
      const hi = Math.max(...radii)
      expect(hi - lo, "dot sizes still sit in one narrow band").toBeGreaterThan(3)
      const small = radii.filter((r) => r < lo + (hi - lo) / 2).length
      expect(small / radii.length, "square-law sampling should keep most dots small").toBeGreaterThan(0.5)
    })

    /**
     * v5 的转角只在 ±45° 之间取，8×5 的方片在那个区间里包围盒**永远宽 >= 高**
     * （45° 时正好 1:1，0° 时 1.6:1）。所以「存在一枚立着的片」就是 v5 与 v6
     * 的分水岭：把转角收回 ±45°，下面第二条立刻红。
     */
    it("斜方片转角放开到整圈：既有横躺的也有立着的", () => {
      const { root } = draw("campaign", coverSlide)
      const ratios = Array.from(root.querySelectorAll("path")).map((p) => {
        const nums = p.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number)
        const xs = nums.filter((_, i) => i % 2 === 0)
        const ys = nums.filter((_, i) => i % 2 === 1)
        return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
      })
      expect(Math.max(...ratios), "no chip lies flat").toBeGreaterThan(1.3)
      expect(Math.min(...ratios), "no chip stands upright — angles are still clamped to ±45°").toBeLessThan(0.8)
    })

    it("透明度逐枚取（远近层次），不再是整场一个 0.9", () => {
      const { root } = draw("campaign", coverSlide)
      const ops = Array.from(root.querySelectorAll("circle, path")).map((el) => num(el, "opacity"))
      expect(new Set(ops).size).toBeGreaterThan(20)
      expect(Math.min(...ops)).toBeGreaterThanOrEqual(0.45)
      expect(Math.max(...ops)).toBeLessThanOrEqual(1)
    })
  })

  it("chapter 完全退让（巨幅居中标题 + 章节号水印的活动范围就是页缘）", () => {
    const { root } = draw("campaign", chapterSlide)
    expect(root.children).toHaveLength(0)
  })

  // ── 确定性 ────────────────────────────────────────────────────────────
  it("同一份 IR 两次渲染逐字节相同（LCG seed=7 固定，跑两遍复现）", () => {
    const first = draw("campaign", coverSlide).markup
    const second = draw("campaign", coverSlide).markup
    expect(second).toBe(first)
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变——纸屑不吃 deck seed", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw("campaign", coverSlide, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("三档（cover/content/ending）在同一页结构下画同一张——v4 的 content 弱档已取消", () => {
    const markups = new Set(DRAWN_SLIDES.map((slide) => draw("campaign", slide).markup))
    expect(markups.size).toBe(1)
  })

  it("motif 不受 chartPaletteOffset 影响（图表调色板轮转改不动装饰一个字节）", () => {
    const tokens = resolveStyle("campaign")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <CampaignMotif
            ir={ir("campaign")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  // ── heavy 档降档：判据只钉 IR 结构层 ──────────────────────────────────
  describe("heavy 降档（密页半场）", () => {
    const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
    const sparse = slideOf("content", Array.from({ length: threshold - 1 }, (_, i) => para(`第 ${i} 段`)))
    const dense = slideOf("content", Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)))

    it("判据是这一页的组件数，阈值取全仓自己的 dense 档每页块数上限", () => {
      expect(threshold).toBe(5)
      expect(draw("campaign", sparse).root.querySelectorAll("circle, path")).toHaveLength(CONFETTI_COUNT)
      expect(draw("campaign", dense).root.querySelectorAll("circle, path")).toHaveLength(CONFETTI_HALF_FIELD_COUNT)
    })

    it("半场就是一半：顶带 60 枚 = 满场 120 的一半", () => {
      expect(CONFETTI_HALF_FIELD_COUNT).toBe(CONFETTI_COUNT / 2)
    })

    it("半场留下的是顶带：左右两条竖带整条让开", () => {
      const { root } = draw("campaign", dense)
      for (const { box } of pieceBoxes(root)) {
        expect(box.y1, `piece outside the top band: ${JSON.stringify(box)}`).toBeLessThanOrEqual(BANDS[0].y[1] + REACH)
      }
    })

    it("阈值以上继续加组件，输出不再变化（是阈值不是滑块）", () => {
      const heavier = slideOf("content", Array.from({ length: threshold + 4 }, (_, i) => para(`第 ${i} 段`)))
      expect(draw("campaign", heavier).markup).toBe(draw("campaign", dense).markup)
    })

    /**
     * 判据纯度——本组特有的硬要求：降档判据只许读 IR 结构层（组件数量），
     * 不许读渲染后的文字几何。
     *
     * 这一节是变异守卫：把判据改成任何一种「读文字几何」的写法（标题占几行、
     * 正文缩到几号字、有没有溢出、文字量多少），下面三条里至少一条立刻红——
     * 因为它们只变文字内容，页面的组件结构一个字节没动。变异实测记录见本轮
     * 报告（把判据换成读 `slide.heading` 长度后，第一条与第三条同时报红）。
     */
    describe("判据纯度：只吃 IR 结构，不吃文字几何", () => {
      const short = slideOf("content", [para("短")], "短")
      const long = slideOf(
        "content",
        [para("这一段正文特意写得很长很长很长，长到足以把版式的自动缩字号与换行逻辑整个跑一遍，" +
          "再长一点还会触发溢出截断——但页面的组件数量始终是一个，结构层没有任何变化。")],
        "这是一个长到会换行、会触发标题自动缩字号、甚至可能被截断的超长标题，用来把文字几何拉到另一个极端",
      )

      it("同结构不同文案：输出逐字节相同（判据一旦读文字几何，这条红）", () => {
        expect(draw("campaign", long).markup).toBe(draw("campaign", short).markup)
      })

      it("同结构不同页型：cover/content/ending 输出逐字节相同", () => {
        const markups = new Set(
          (["cover", "content", "ending"] as const).map((type) => draw("campaign", slideOf(type, [para("同一段")])).markup),
        )
        expect(markups.size).toBe(1)
      })

      it("组件数相同、组件类型不同：输出逐字节相同（数的是个数，不是内容）", () => {
        const bullets = slideOf("content", [{ type: "bullets", items: ["甲", "乙", "丙"] } as Component])
        expect(draw("campaign", bullets).markup).toBe(draw("campaign", slideOf("content", [para("一段")])).markup)
      })
    })
  })

  // ── 安全区 ────────────────────────────────────────────────────────────
  it("120 枚全部落在三条取样带内（带内）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      const inSome = BANDS.some(
        (b) =>
          box.x0 >= b.x[0] - REACH &&
          box.x1 <= b.x[1] + REACH &&
          box.y0 >= b.y[0] - REACH &&
          box.y1 <= b.y[1] + REACH,
      )
      expect(inSome, `piece outside every band: ${JSON.stringify(box)}`).toBe(true)
    }
  })

  it("安全区：120 枚都不进板上四条红虚线禁区（区外）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `piece enters the ${name} zone: ${JSON.stringify(box)}`).toBe(false)
      }
    }
  })

  it("安全区：120 枚都不进 branding 的四个 logo 位（板上生成器的底带会横穿右下那只）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      for (const zone of LOGO_BOXES) {
        expect(intersects(box, zone), `piece enters the logo box at ${zone.x},${zone.y}`).toBe(false)
      }
    }
  })

  it("安全区：120 枚全部落在实测排字外沿之外（y<34 / y>708.6 / x<56 / x>1224）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      const outside =
        box.y1 <= TEXT_ENVELOPE.top ||
        box.y0 >= TEXT_ENVELOPE.bottom ||
        box.x1 <= TEXT_ENVELOPE.left ||
        box.x0 >= TEXT_ENVELOPE.right
      expect(outside, `piece sits inside the measured text envelope: ${JSON.stringify(box)}`).toBe(true)
    }
  })

  it("120 枚全部在画布内（页缘不出血）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const { box } of pieceBoxes(root)) {
      expect(box.x0).toBeGreaterThanOrEqual(0)
      expect(box.y0).toBeGreaterThanOrEqual(0)
      expect(box.x1).toBeLessThanOrEqual(1280)
      expect(box.y1).toBeLessThanOrEqual(720)
    }
  })

  it("斜方片不用 rotate transform（导出侧明说旋转不在受控子集内）", () => {
    const { root } = draw("campaign", coverSlide)
    for (const el of Array.from(root.querySelectorAll("circle, path, g"))) {
      expect(el.getAttribute("transform"), `${el.tagName} carries a transform`).toBeNull()
    }
  })

  it("画笔属性写在叶子上，不挂 <g>——导出侧只读叶子自己的 fill/opacity", () => {
    const { root } = draw("campaign", coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}, which svg2pptx drops`).toBeNull()
      }
    }
  })

  it("不画任何左竖条", () => {
    const { root } = draw("campaign", coverSlide)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
  })

  it("换一家 tokens 渲染时颜色跟着换，campaign 的色一处不残留（零 hex 纪律的实证）", () => {
    const luxe = resolveStyle("luxe")
    const { markup } = render(<CampaignMotif ir={ir("luxe")} slide={coverSlide} ctx={buildCtx(luxe, {})} />)
    for (const hex of ["#2A1E3F", "#35284E", "#23173A", "#E84F8A", "#F6F2F9", "#B3A6C7", "#4A3A66", "#F0B429", "#4FC1E9", "#9BE36D"]) {
      expect(markup, `campaign token ${hex} leaked into the luxe render`).not.toContain(hex)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("campaign", slide).root)).not.toThrow()
    }
  })
})
