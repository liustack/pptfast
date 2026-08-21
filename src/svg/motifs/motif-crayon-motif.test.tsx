// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { contrastRatio, blendOver } from "../ink"
import { resolveStyle } from "../../themes"
import { PACING_BUDGETS } from "@/narrative"
import { CrayonMotif, CRAYON_DASH_DRAWN } from "./motif-crayon-motif"
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
  return { ...render(<CrayonMotif ir={ir(theme, filename)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

function parts(root: Element) {
  const paths = Array.from(root.querySelectorAll("path"))
  return {
    wave: paths.find((p) => p.getAttribute("fill") === "none")!,
    star: paths.find((p) => p.getAttribute("fill") !== "none"),
    stickers: Array.from(root.querySelectorAll("circle")),
    dashes: Array.from(root.querySelectorAll("line")),
  }
}

function waveBox(wave: Element): Box {
  const half = num(wave, "stroke-width") / 2
  // 二次曲线实际振幅 = 控制点偏置 / 2 = 5，加上半线宽。
  return { x0: 48, y0: 26 - 5 - half, x1: 48 + 14 * 80, y1: 26 + 5 + half }
}

function stickerBox(c: Element): Box {
  const r = num(c, "r")
  return { x0: num(c, "cx") - r, y0: num(c, "cy") - r, x1: num(c, "cx") + r, y1: num(c, "cy") + r }
}

function dashBox(l: Element): Box {
  const half = num(l, "stroke-width") / 2
  const x1 = num(l, "x1")
  const x2 = num(l, "x2")
  const y = num(l, "y1")
  return { x0: Math.min(x1, x2) - half, y0: y - half, x1: Math.max(x1, x2) + half, y1: y + half }
}

function starBox(): Box {
  // 板上路径从 (56,628) 起笔的墨迹外接：x42-70, y628-656。
  return { x0: 42, y0: 628, x1: 70, y1: 656 }
}

function allBoxes(root: Element): { label: string; box: Box }[] {
  const p = parts(root)
  const out: { label: string; box: Box }[] = [{ label: "wave", box: waveBox(p.wave) }]
  for (const c of p.stickers) out.push({ label: `sticker@${num(c, "cx")}`, box: stickerBox(c) })
  for (const l of p.dashes) out.push({ label: `dash@${num(l, "x1")}`, box: dashBox(l) })
  if (p.star) out.push({ label: "star", box: starBox() })
  return out
}

/**
 * crayon-motif「蜡笔描边」（2026-08-21 低龄教育主题）。
 * 设计源：`design-project/skin-boards.html` 的 crayon 板。
 */
describe("CrayonMotif（蜡笔描边）", () => {
  it("content/ending 画全家福：顶波浪 + 三枚贴纸 + 彩虹划 + 左下星", () => {
    for (const slide of [contentSlide, endingSlide]) {
      const { root } = draw("crayon", slide)
      const p = parts(root)
      expect(p.wave, `no wave on ${slide.type}`).toBeTruthy()
      expect(p.stickers, `wrong sticker count on ${slide.type}`).toHaveLength(3)
      expect(p.dashes, `wrong dash count on ${slide.type}`).toHaveLength(CRAYON_DASH_DRAWN)
      expect(p.star, `no star on ${slide.type}`).toBeTruthy()
    }
  })

  it("cover 撤底带：tone-adaptive-header 封面的作者/日期行画在 y624-656，彩虹划与星让位，波浪与贴纸留下", () => {
    const { root } = draw("crayon", coverSlide)
    const p = parts(root)
    expect(p.wave).toBeTruthy()
    expect(p.stickers).toHaveLength(3)
    expect(p.dashes).toHaveLength(0)
    expect(p.star).toBeUndefined()
  })

  it("chapter 完全退让——整版 primary 蜡笔蓝底上波浪消失、贴纸与巨幅标题抢面", () => {
    const { root } = draw("crayon", chapterSlide)
    expect(root.children).toHaveLength(0)
  })

  it("波浪几何：M48,26 起 14 段二次贝塞尔，控制点偏置 ±10，蜡笔蓝，圆头", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", coverSlide)
    const { wave } = parts(root)
    expect(wave.getAttribute("d")).toBe(
      "M48,26 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0 q40,-10 80,0 q40,10 80,0",
    )
    expect(wave.getAttribute("stroke")).toBe(t.colors.primary)
    expect(wave.getAttribute("fill")).toBe("none")
    expect(wave.getAttribute("stroke-width")).toBe("3")
    expect(wave.getAttribute("stroke-linecap")).toBe("round")
  })

  it("三枚贴纸几何：顶带右侧 (1150,1188,1226)× y28 r11，黄/绿/橘红取自 chartPalette", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", coverSlide)
    const { stickers } = parts(root)
    expect(stickers.map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])).toEqual([
      [1150, 28, 11],
      [1188, 28, 11],
      [1226, 28, 11],
    ])
    expect(stickers.map((c) => c.getAttribute("fill"))).toEqual([
      t.colors.chartPalette[3],
      t.colors.chartPalette[2],
      t.colors.chartPalette[1],
    ])
  })

  it("彩虹短划：y644，x1=96+i*46 长 26，圆头 5px，四色轮换，末两段让开右下 logo 盒", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", contentSlide)
    const { dashes } = parts(root)
    expect(CRAYON_DASH_DRAWN).toBe(22)
    expect(dashes).toHaveLength(22)
    for (const [i, l] of dashes.entries()) {
      expect(num(l, "x1")).toBe(96 + i * 46)
      expect(num(l, "x2")).toBe(96 + i * 46 + 26)
      expect(num(l, "y1")).toBe(644)
      expect(num(l, "y2")).toBe(644)
      expect(l.getAttribute("stroke")).toBe(t.colors.chartPalette[i % 4])
      expect(l.getAttribute("stroke-width")).toBe("5")
      expect(l.getAttribute("stroke-linecap")).toBe("round")
      expect(l.getAttribute("opacity"), "dash opacity lives on the <line> leaf").toBe("0.3")
    }
    const last = dashes[dashes.length - 1]!
    expect(num(last, "x2") + num(last, "stroke-width") / 2).toBeLessThan(BOARD_ZONES.brLogo.x)
  })

  /**
   * 第五保护带准入：正文墨压在「四色划各自叠在 bg 上的合成色」上，四格都
   * ≥4.5:1。opacity 拿掉或改回 1，蓝/橘/绿三格立刻红（黄格满不透明也过）。
   */
  it("彩虹划减淡档：正文墨压在四色划叠 bg 的合成色上，四格都 ≥4.5:1", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", contentSlide)
    const { dashes } = parts(root)
    const seen = new Set<string>()
    for (const l of dashes) {
      const stroke = l.getAttribute("stroke")!
      const opacityAttr = l.getAttribute("opacity")
      expect(opacityAttr, `dash@${l.getAttribute("x1")} missing leaf opacity`).not.toBeNull()
      const opacity = Number(opacityAttr)
      const composite = blendOver(stroke, t.colors.bg, opacity)
      const ratio = contrastRatio(t.colors.text, composite)
      expect(
        ratio,
        `${stroke} @ ${opacity} composites to ${composite} (${ratio.toFixed(2)}:1)`,
      ).toBeGreaterThanOrEqual(4.5)
      seen.add(stroke)
    }
    expect([...seen]).toEqual(t.colors.chartPalette)
  })

  it("左下星贴纸走 accent，板上路径从 (56,628) 起笔", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", contentSlide)
    const { star } = parts(root)
    expect(star).toBeTruthy()
    expect(star!.getAttribute("fill")).toBe(t.colors.accent)
    expect(star!.getAttribute("d")?.startsWith("M56,628")).toBe(true)
  })

  it("content/ending 在同一页结构下画同一张（cover 另有撤底带档）", () => {
    const markups = new Set([contentSlide, endingSlide].map((slide) => draw("crayon", slide).markup))
    expect(markups.size).toBe(1)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw("crayon", coverSlide).markup).toBe(draw("crayon", coverSlide).markup)
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw("crayon", coverSlide, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("motif 不受 chartPaletteOffset 影响（图表调色板轮转改不动装饰一个字节）", () => {
    const tokens = resolveStyle("crayon")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <CrayonMotif
            ir={ir("crayon")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  describe("heavy 降档（密页半场：贴纸与星星撤场，顶波浪＋底彩虹划留下）", () => {
    const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
    const sparse = slideOf("content", Array.from({ length: threshold - 1 }, (_, i) => para(`第 ${i} 段`)))
    const dense = slideOf("content", Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)))

    it("判据是这一页的组件数，阈值取全仓自己的 dense 档每页块数上限", () => {
      expect(threshold).toBe(5)
      const sparseParts = parts(draw("crayon", sparse).root)
      const denseParts = parts(draw("crayon", dense).root)
      expect(sparseParts.stickers).toHaveLength(3)
      expect(sparseParts.star).toBeTruthy()
      expect(denseParts.stickers).toHaveLength(0)
      expect(denseParts.star).toBeUndefined()
      expect(denseParts.wave).toBeTruthy()
      expect(denseParts.dashes).toHaveLength(CRAYON_DASH_DRAWN)
    })

    it("阈值以上继续加组件，输出不再变化（是阈值不是滑块）", () => {
      const heavier = slideOf("content", Array.from({ length: threshold + 4 }, (_, i) => para(`第 ${i} 段`)))
      expect(draw("crayon", heavier).markup).toBe(draw("crayon", dense).markup)
    })

    describe("判据纯度：只吃 IR 结构，不吃文字几何", () => {
      const short = slideOf("content", [para("短")], "短")
      const long = slideOf(
        "content",
        [
          para(
            "这一段正文特意写得很长很长很长，长到足以把版式的自动缩字号与换行逻辑整个跑一遍，" +
              "再长一点还会触发溢出截断——但页面的组件数量始终是一个，结构层没有任何变化。",
          ),
        ],
        "这是一个长到会换行、会触发标题自动缩字号、甚至可能被截断的超长标题，用来把文字几何拉到另一个极端",
      )

      it("同结构不同文案：输出逐字节相同（判据一旦读文字几何，这条红）", () => {
        expect(draw("crayon", long).markup).toBe(draw("crayon", short).markup)
      })

      it("同结构不同页型：content/ending 输出逐字节相同（cover 是声明的撤底带档，不是文字几何的函数）", () => {
        const markups = new Set(
          (["content", "ending"] as const).map((type) => draw("crayon", slideOf(type, [para("同一段")])).markup),
        )
        expect(markups.size).toBe(1)
      })

      it("组件数相同、组件类型不同：输出逐字节相同（数的是个数，不是内容）", () => {
        const bullets = slideOf("content", [{ type: "bullets", items: ["甲", "乙", "丙"] } as Component])
        expect(draw("crayon", bullets).markup).toBe(draw("crayon", slideOf("content", [para("一段")])).markup)
      })
    })
  })

  it("安全区：全部装饰不进板上四条红虚线禁区", () => {
    for (const slide of [contentSlide, coverSlide]) {
    const { root } = draw("crayon", slide)
    for (const { label, box } of allBoxes(root)) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `${label} enters the ${name} zone: ${JSON.stringify(box)}`).toBe(false)
      }
    }
    }
  })

  it("不画任何左竖条", () => {
    const { root } = draw("crayon", coverSlide)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
      expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
    }
  })

  it("画笔属性写在叶子上，不挂 <g>——导出侧只读叶子自己的 fill/stroke/opacity", () => {
    for (const slide of [coverSlide, contentSlide]) {
      const { root } = draw("crayon", slide)
      for (const g of Array.from(root.querySelectorAll("g"))) {
        for (const attr of ["fill", "stroke", "opacity"]) {
          expect(g.getAttribute(attr), `<g> on ${slide.type} carries ${attr}, which svg2pptx drops`).toBeNull()
        }
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，crayon 的色一处不残留（零 hex 纪律的实证）", () => {
    const luxe = resolveStyle("luxe")
    const { markup } = render(<CrayonMotif ir={ir("luxe")} slide={coverSlide} ctx={buildCtx(luxe, {})} />)
    for (const hex of ["#FFF6E9", "#FFFDF6", "#2B59C3", "#E4572E", "#2E2A25", "#6E655A", "#F1E3C8", "#2E933C", "#F5B700"]) {
      expect(markup, `crayon token ${hex} leaked into the luxe render`).not.toContain(hex)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("crayon", slide).root)).not.toThrow()
    }
  })
})
