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

/** 设计板上的五个保护区（`docs/designing-themes.md` 第 5 条）。 */
const BOARD_ZONES = {
  title: { x: 96, y: 48, w: 1040, h: 122 },
  body: { x: 96, y: 200, w: 1040, h: 420 },
  footerMeta: { x: 48, y: 664, w: 1184, h: 44 },
  brLogo: { x: 1120, y: 630, w: 96, h: 40 },
  fifthBand: { x: 0, y: 620, w: 1280, h: 44 },
} as const

/** 标题区右沿。太阳必须落在这条线右侧外。 */
const TITLE_RIGHT = BOARD_ZONES.title.x + BOARD_ZONES.title.w

/**
 * 板上太阳外缘：圆心 (1188,27)，光芒到 r27，线宽 3。
 * 轴对齐外接，比逐根光芒略宽，给相交测试用。
 */
const SUN_INK = { x0: 1188 - 27 - 1.5, y0: 27 - 27 - 1.5, x1: 1188 + 27 + 1.5, y1: 27 + 27 + 1.5 }

/** tone-adaptive-header 密级徽标（`cover-tone-adaptive-header.tsx`）。 */
const TONE_CONF_BADGE = { x: 1086, y: 50, w: 130, h: 44 }
/** banner-title 密级徽标（`cover-banner-title.tsx`）。 */
const BANNER_CONF_BADGE = { x: 1058, y: 100, w: 126, h: 48 }
/**
 * tone-adaptive-header 顶部 org 标签墨迹。
 * 基线 x64 y74、字号 22、alphabetic，可视顶约 y52。
 */
const TONE_ORG_INK = { x: 64, y: 74 - 22, w: 480, h: 22 }

const EDGE_POINTS =
  "0,0 1280,0 1280,15.6 1240,12.5 1200,11.2 1160,12.0 1120,13.1 1080,12.9 1040,11.2 1000,9.6 960,9.9 920,12.7 880,16.5 840,18.9 800,18.8 760,16.7 720,14.8 680,14.4 640,15.3 600,15.9 560,14.5 520,11.5 480,8.7 440,8.1 400,10.3 360,13.6 320,15.9 280,16.2 240,15.1 200,14.6 160,15.8 120,17.8 80,18.9 40,17.5 0,14.0"

const SUN_RAYS = [
  [1205.7, 30.2, 1214.6, 31.8],
  [1198.2, 41.8, 1203.4, 49.2],
  [1184.8, 44.7, 1183.2, 53.6],
  [1173.2, 37.2, 1165.8, 42.4],
  [1170.3, 23.8, 1161.4, 22.2],
  [1177.8, 12.2, 1172.6, 4.8],
  [1191.2, 9.3, 1192.8, 0.4],
  [1202.8, 16.8, 1210.2, 11.6],
] as const

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
  const lines = Array.from(root.querySelectorAll("line"))
  return {
    edge: root.querySelector("polygon"),
    sunCircles: Array.from(root.querySelectorAll("circle")),
    scratches: lines.filter((l) => num(l, "y1") === 1.5),
    dashes: lines.filter((l) => num(l, "y1") === 644),
    rays: lines.filter((l) => num(l, "y1") !== 1.5 && num(l, "y1") !== 644),
    paths: Array.from(root.querySelectorAll("path")),
  }
}

function polygonBox(poly: Element): Box {
  const pts = poly
    .getAttribute("points")!
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number)
      return { x: x!, y: y! }
    })
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  }
}

function lineBox(l: Element): Box {
  const half = num(l, "stroke-width") / 2
  return {
    x0: Math.min(num(l, "x1"), num(l, "x2")) - half,
    y0: Math.min(num(l, "y1"), num(l, "y2")) - half,
    x1: Math.max(num(l, "x1"), num(l, "x2")) + half,
    y1: Math.max(num(l, "y1"), num(l, "y2")) + half,
  }
}

function circleBox(c: Element): Box {
  const r = num(c, "r") + (Number(c.getAttribute("stroke-width")) || 0) / 2
  return { x0: num(c, "cx") - r, y0: num(c, "cy") - r, x1: num(c, "cx") + r, y1: num(c, "cy") + r }
}

function sunBoxFromParts(p: ReturnType<typeof parts>): Box {
  const boxes = [...p.sunCircles.map(circleBox), ...p.rays.map(lineBox)]
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  }
}

function allBoxes(root: Element): { label: string; box: Box }[] {
  const p = parts(root)
  const out: { label: string; box: Box }[] = []
  if (p.edge) out.push({ label: "edge", box: polygonBox(p.edge) })
  for (const c of p.sunCircles) out.push({ label: `sun-circle@${num(c, "cx")}`, box: circleBox(c) })
  for (const l of p.scratches) out.push({ label: `scratch@${num(l, "x1")}`, box: lineBox(l) })
  for (const l of p.rays) out.push({ label: `ray@${num(l, "x1")}`, box: lineBox(l) })
  for (const l of p.dashes) out.push({ label: `dash@${num(l, "x1")}`, box: lineBox(l) })
  return out
}

/**
 * crayon-motif「蜡笔描边」（2026-08-21 低龄教育主题）。
 * 设计源：蜡笔涂边 `EdgeShading.dc.html`、太阳涂鸦 `SunDoodle.dc.html`。
 */
describe("CrayonMotif（蜡笔描边）", () => {
  it("content/ending 画全家福：涂边 + 划痕 + 太阳 + 彩虹划，不画左下星", () => {
    for (const slide of [contentSlide, endingSlide]) {
      const { root } = draw("crayon", slide)
      const p = parts(root)
      expect(p.edge, `no edge on ${slide.type}`).toBeTruthy()
      expect(p.scratches, `wrong scratch count on ${slide.type}`).toHaveLength(5)
      expect(p.sunCircles, `wrong sun circle count on ${slide.type}`).toHaveLength(3)
      expect(p.rays, `wrong ray count on ${slide.type}`).toHaveLength(8)
      expect(p.dashes, `wrong dash count on ${slide.type}`).toHaveLength(CRAYON_DASH_DRAWN)
      expect(p.paths, `star path survived on ${slide.type}`).toHaveLength(0)
    }
  })

  it("cover 撤底带且太阳让位：tone-adaptive-header 密级徽标与太阳外缘相交，涂边与划痕留下", () => {
    expect(intersects(SUN_INK, TONE_CONF_BADGE), "sun must collide with tone-adaptive-header conf badge").toBe(true)
    expect(intersects(SUN_INK, BANNER_CONF_BADGE), "sun must clear banner-title conf badge").toBe(false)
    const { root } = draw("crayon", coverSlide)
    const p = parts(root)
    expect(p.edge).toBeTruthy()
    expect(p.scratches).toHaveLength(5)
    expect(p.sunCircles).toHaveLength(0)
    expect(p.rays).toHaveLength(0)
    expect(p.dashes).toHaveLength(0)
    expect(p.paths).toHaveLength(0)
  })

  it("cover 涂边不压 tone-adaptive-header 顶部 org 标签", () => {
    const { root } = draw("crayon", coverSlide)
    const edge = parts(root).edge!
    expect(intersects(polygonBox(edge), TONE_ORG_INK)).toBe(false)
    expect(polygonBox(edge).y1).toBeLessThan(TONE_ORG_INK.y)
  })

  it("chapter 完全退让——整版 primary 蜡笔蓝底上涂边消失、太阳与巨幅标题抢面", () => {
    const { root } = draw("crayon", chapterSlide)
    expect(root.children).toHaveLength(0)
  })

  it("涂边几何：板上正弦采样折线写成常量路径，primary 填充，opacity 0.9 写在叶子上", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", coverSlide)
    const { edge } = parts(root)
    expect(edge).toBeTruthy()
    expect(edge!.getAttribute("points")).toBe(EDGE_POINTS)
    expect(edge!.getAttribute("fill")).toBe(t.colors.primary)
    expect(edge!.getAttribute("opacity"), "edge opacity lives on the <polygon> leaf").toBe("0.9")
  })

  it("划痕几何：x140 起每 260px 一道，(x,1.5)→(x+26,13)，宽 2.2、opacity 0.55、走 bg", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", coverSlide)
    const { scratches } = parts(root)
    expect(scratches.map((l) => num(l, "x1"))).toEqual([140, 400, 660, 920, 1180])
    for (const l of scratches) {
      expect(num(l, "y1")).toBe(1.5)
      expect(num(l, "x2")).toBe(num(l, "x1") + 26)
      expect(num(l, "y2")).toBe(13)
      expect(l.getAttribute("stroke")).toBe(t.colors.bg)
      expect(l.getAttribute("stroke-width")).toBe("2.2")
      expect(l.getAttribute("opacity"), "scratch opacity lives on the <line> leaf").toBe("0.55")
    }
  })

  it("太阳几何：主圈 (1188,27) r12 描边 3.2 accent，回笔圈错位，芯 r5.5 向日黄，8 根光芒", () => {
    const t = resolveStyle("crayon")
    const { root } = draw("crayon", contentSlide)
    const { sunCircles, rays } = parts(root)
    expect(sunCircles).toHaveLength(3)
    const [ghost, main, core] = sunCircles
    expect([num(ghost!, "cx"), num(ghost!, "cy"), num(ghost!, "r")]).toEqual([1189.5, 28.5, 12])
    expect(ghost!.getAttribute("fill")).toBe("none")
    expect(ghost!.getAttribute("stroke")).toBe(t.colors.accent)
    expect(ghost!.getAttribute("stroke-width")).toBe("2.6")
    expect(ghost!.getAttribute("opacity"), "ghost opacity lives on the <circle> leaf").toBe("0.35")
    expect([num(main!, "cx"), num(main!, "cy"), num(main!, "r")]).toEqual([1188, 27, 12])
    expect(main!.getAttribute("fill")).toBe("none")
    expect(main!.getAttribute("stroke")).toBe(t.colors.accent)
    expect(main!.getAttribute("stroke-width")).toBe("3.2")
    expect([num(core!, "cx"), num(core!, "cy"), num(core!, "r")]).toEqual([1188, 27, 5.5])
    expect(core!.getAttribute("fill")).toBe(t.colors.chartPalette[3])
    expect(rays).toHaveLength(8)
    expect(rays.map((l) => [num(l, "x1"), num(l, "y1"), num(l, "x2"), num(l, "y2")])).toEqual(
      SUN_RAYS.map((r) => [...r]),
    )
    for (const l of rays) {
      expect(l.getAttribute("stroke")).toBe(t.colors.accent)
      expect(l.getAttribute("stroke-width")).toBe("3")
      expect(l.getAttribute("stroke-linecap")).toBe("round")
    }
  })

  it("退役三枚圆贴纸：不再画顶带 (1150,1188,1226)×y28 的实心圆", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("crayon", slide)
      const filled = Array.from(root.querySelectorAll("circle")).filter((c) => {
        const fill = c.getAttribute("fill")
        return fill !== null && fill !== "none"
      })
      for (const c of filled) {
        expect([num(c, "cx"), num(c, "cy"), num(c, "r")]).not.toEqual([1150, 28, 11])
        expect([num(c, "cx"), num(c, "cy"), num(c, "r")]).not.toEqual([1226, 28, 11])
      }
    }
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

  it("任何页型都不画左下星贴纸（M56,628 路径整族退役）", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      const { markup, root } = draw("crayon", slide)
      expect(markup, `M56,628 survived on ${slide.type}`).not.toContain("M56,628")
      expect(Array.from(root.querySelectorAll("path")), `star path survived on ${slide.type}`).toHaveLength(0)
    }
  })

  it("content/ending 几何相同（内容页退底，cover 另有撤底带且太阳让位档）", () => {
    const content = draw("crayon", contentSlide)
    const ending = draw("crayon", endingSlide)
    expect(parts(content.root).dashes).toHaveLength(parts(ending.root).dashes.length)
    expect(parts(content.root).sunCircles).toHaveLength(parts(ending.root).sunCircles.length)
    expect(parts(content.root).rays).toHaveLength(parts(ending.root).rays.length)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw("crayon", coverSlide).markup).toBe(draw("crayon", coverSlide).markup)
    expect(draw("crayon", contentSlide).markup).toBe(draw("crayon", contentSlide).markup)
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw("crayon", coverSlide, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
    const contentMarkups = new Set(
      Array.from({ length: 12 }, (_, i) => draw("crayon", contentSlide, `probe-${i}.pptx`).markup),
    )
    expect(contentMarkups.size).toBe(1)
  })

  it("motif 不受 chartPaletteOffset 影响（图表调色板轮转改不动装饰一个字节）", () => {
    const tokens = resolveStyle("crayon")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <CrayonMotif
            ir={ir("crayon")}
            slide={contentSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  describe("heavy 降档（密页半场：太阳撤场，涂边＋淡彩虹划留下）", () => {
    const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
    const sparse = slideOf("content", Array.from({ length: threshold - 1 }, (_, i) => para(`第 ${i} 段`)))
    const dense = slideOf("content", Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)))

    it("判据是这一页的组件数，阈值取全仓自己的 dense 档每页块数上限", () => {
      expect(threshold).toBe(5)
      const sparseParts = parts(draw("crayon", sparse).root)
      const denseParts = parts(draw("crayon", dense).root)
      expect(sparseParts.sunCircles).toHaveLength(3)
      expect(sparseParts.rays).toHaveLength(8)
      expect(sparseParts.paths).toHaveLength(0)
      expect(denseParts.sunCircles).toHaveLength(0)
      expect(denseParts.rays).toHaveLength(0)
      expect(denseParts.paths).toHaveLength(0)
      expect(denseParts.edge).toBeTruthy()
      expect(denseParts.scratches).toHaveLength(5)
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

      it("同结构不同页型：content/ending 几何相同（内容页退底，cover 是声明的撤底带档）", () => {
        const content = parts(draw("crayon", slideOf("content", [para("同一段")])).root)
        const ending = parts(draw("crayon", slideOf("ending", [para("同一段")])).root)
        expect(content.dashes).toHaveLength(ending.dashes.length)
        expect(content.sunCircles).toHaveLength(ending.sunCircles.length)
      })

      it("组件数相同、组件类型不同：输出逐字节相同（数的是个数，不是内容）", () => {
        const bullets = slideOf("content", [{ type: "bullets", items: ["甲", "乙", "丙"] } as Component])
        expect(draw("crayon", bullets).markup).toBe(draw("crayon", slideOf("content", [para("一段")])).markup)
      })
    })
  })

  it("安全区：涂边、划痕、太阳不进五个保护区。标题右沿 x1136，太阳在其右侧外", () => {
    const { root } = draw("crayon", contentSlide)
    const p = parts(root)
    const topBoxes: { label: string; box: Box }[] = [
      { label: "edge", box: polygonBox(p.edge!) },
      ...p.scratches.map((l) => ({ label: `scratch@${num(l, "x1")}`, box: lineBox(l) })),
      { label: "sun", box: sunBoxFromParts(p) },
    ]
    for (const { label, box } of topBoxes) {
      for (const [name, zone] of Object.entries(BOARD_ZONES)) {
        expect(intersects(box, zone), `${label} enters the ${name} zone: ${JSON.stringify(box)}`).toBe(false)
      }
    }
    const sun = sunBoxFromParts(p)
    expect(sun.x0, `sun left ${sun.x0} must sit right of title edge ${TITLE_RIGHT}`).toBeGreaterThan(TITLE_RIGHT)
    expect(TITLE_RIGHT).toBe(1136)
  })

  it("安全区：全部装饰不进板上四条红虚线禁区（底带划住在第五带，划是减淡豁免）", () => {
    const four = {
      title: BOARD_ZONES.title,
      body: BOARD_ZONES.body,
      footerMeta: BOARD_ZONES.footerMeta,
      brLogo: BOARD_ZONES.brLogo,
    }
    for (const slide of [contentSlide, coverSlide]) {
      const { root } = draw("crayon", slide)
      for (const { label, box } of allBoxes(root)) {
        for (const [name, zone] of Object.entries(four)) {
          expect(intersects(box, zone), `${label} on ${slide.type} enters the ${name} zone: ${JSON.stringify(box)}`).toBe(
            false,
          )
        }
      }
    }
    const { root } = draw("crayon", contentSlide)
    const p = parts(root)
    expect(intersects(lineBox(p.dashes[0]!), BOARD_ZONES.fifthBand)).toBe(true)
    expect(p.paths).toHaveLength(0)
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
    const { markup } = render(<CrayonMotif ir={ir("luxe")} slide={contentSlide} ctx={buildCtx(luxe, {})} />)
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
