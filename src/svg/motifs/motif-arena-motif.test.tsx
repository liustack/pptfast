// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PACING_BUDGETS } from "@/narrative"
import { ARENA_TOKENS } from "../../themes/arena"
import { ArenaMotif } from "./motif-arena-motif"
import type { Component, PptxIR, Slide } from "@/ir"
import type { StyleTokens } from "../../themes/tokens"

const para = (text: string): Component => ({ type: "paragraph", text }) as Component
const slideOf = (type: Slide["type"], components: Component[] = [], heading = "标题"): Slide =>
  ({ type, heading, components }) as Slide

const coverSlide = slideOf("cover")
const chapterSlide = slideOf("chapter")
const contentSlide = slideOf("content")
const endingSlide = slideOf("ending", [], undefined as unknown as string)
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }

const ir = (theme = "arena", filename = "x.pptx"): PptxIR =>
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

function draw(slide: Slide, tokens: StyleTokens = ARENA_TOKENS, filename?: string) {
  const ctx = buildCtx(tokens, {})
  return { ...render(<ArenaMotif ir={ir(tokens.id, filename)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

function pathBox(d: string): Box {
  const nums = d.match(/-?[\d.]+/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

function lineBox(l: Element): Box {
  return {
    x0: Math.min(num(l, "x1"), num(l, "x2")),
    y0: Math.min(num(l, "y1"), num(l, "y2")),
    x1: Math.max(num(l, "x1"), num(l, "x2")),
    y1: Math.max(num(l, "y1"), num(l, "y2")),
  }
}

function rectBox(r: Element): Box {
  const x = num(r, "x")
  const y = num(r, "y")
  return { x0: x, y0: y, x1: x + num(r, "width"), y1: y + num(r, "height") }
}

/**
 * arena-motif「HUD 括弧＋速度线」（2026-08-21）。
 * 设计源：`design-project/skin-boards` 的 arena 板，几何坐标逐条抄录。
 */
describe("ArenaMotif（HUD 括弧＋速度线）", () => {
  it("content/ending 画全家福：四角括弧 + 十道速度线 + 八段能量条", () => {
    for (const slide of [contentSlide, endingSlide]) {
      const { root } = draw(slide)
      expect(Array.from(root.querySelectorAll("path")), `brackets on ${slide.type}`).toHaveLength(4)
      expect(Array.from(root.querySelectorAll("line")), `speed lines on ${slide.type}`).toHaveLength(10)
      expect(Array.from(root.querySelectorAll("rect")), `energy on ${slide.type}`).toHaveLength(8)
    }
  })

  it("cover 撤能量条：第五文字带住着封面 meta 行，括弧与速度线留下", () => {
    const { root } = draw(coverSlide)
    expect(Array.from(root.querySelectorAll("path"))).toHaveLength(4)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(10)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
  })

  it("chapter 完全退让——巨幅居中标题 + 章节号水印的活动范围就是页缘", () => {
    const { root } = draw(chapterSlide)
    expect(Array.from(root.querySelectorAll("path"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
  })

  it("四角括弧几何：板上四条 path 一字不改", () => {
    const { root } = draw(coverSlide)
    const ds = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d"))
    expect(ds).toEqual([
      "M12,36 L12,12 L36,12",
      "M1244,12 L1268,12 L1268,36",
      "M12,684 L12,708 L36,708",
      "M1268,684 L1268,708 L1244,708",
    ])
  })

  it("左右速度线束几何：各 5 道 45°（dx=52 dy=-52），落在 x20-88 / x1150-1260 两带", () => {
    const { root } = draw(coverSlide)
    const lines = Array.from(root.querySelectorAll("line"))
    const left = lines.filter((l) => num(l, "x1") < 640)
    const right = lines.filter((l) => num(l, "x1") > 640)
    expect(left).toHaveLength(5)
    expect(right).toHaveLength(5)
    for (const l of lines) {
      expect(num(l, "x2") - num(l, "x1")).toBe(52)
      expect(num(l, "y1") - num(l, "y2")).toBe(52)
    }
    for (const l of left) {
      expect(num(l, "x1")).toBeGreaterThanOrEqual(20)
      expect(num(l, "x2")).toBeLessThanOrEqual(88)
    }
    for (const l of right) {
      expect(num(l, "x1")).toBeGreaterThanOrEqual(1150)
      expect(num(l, "x2")).toBeLessThanOrEqual(1260)
    }
  })

  it("底能量条几何：y648，x=96+i*39，宽 30 高 8，正好 8 段", () => {
    const { root } = draw(contentSlide)
    const rects = Array.from(root.querySelectorAll("rect"))
    expect(rects).toHaveLength(8)
    rects.forEach((r, i) => {
      expect(num(r, "x")).toBe(96 + i * 39)
      expect(num(r, "y")).toBe(648)
      expect(num(r, "width")).toBe(30)
      expect(num(r, "height")).toBe(8)
    })
  })

  it("颜色一律读 token：括弧与绿速度线/前五段能量条走 accent，品红速度线走 chartPalette[1]，后三段能量条走 border", () => {
    const t = ARENA_TOKENS
    const { root } = draw(contentSlide)
    for (const p of Array.from(root.querySelectorAll("path"))) {
      expect(p.getAttribute("stroke")).toBe(t.colors.accent)
    }
    const lines = Array.from(root.querySelectorAll("line"))
    const greens = lines.filter((l) => l.getAttribute("stroke") === t.colors.accent)
    const magentas = lines.filter((l) => l.getAttribute("stroke") === t.colors.chartPalette[1])
    expect(greens).toHaveLength(5)
    expect(magentas).toHaveLength(5)
    const rects = Array.from(root.querySelectorAll("rect"))
    expect(rects.slice(0, 5).every((r) => r.getAttribute("fill") === t.colors.accent)).toBe(true)
    expect(rects.slice(5).every((r) => r.getAttribute("fill") === t.colors.border)).toBe(true)
  })

  // ── heavy 降档：判据只钉 IR 结构层 ──────────────────────────────────
  describe("heavy 降档（密页撤速度线）", () => {
    const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
    const sparse = slideOf("content", Array.from({ length: threshold - 1 }, (_, i) => para(`第 ${i} 段`)))
    const dense = slideOf("content", Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)))

    it("判据是这一页的组件数，阈值取全仓自己的 dense 档每页块数上限", () => {
      expect(threshold).toBe(5)
      expect(draw(sparse).root.querySelectorAll("line")).toHaveLength(10)
      expect(draw(dense).root.querySelectorAll("line")).toHaveLength(0)
      expect(draw(dense).root.querySelectorAll("path")).toHaveLength(4)
      expect(draw(dense).root.querySelectorAll("rect")).toHaveLength(8)
    })

    it("阈值以上继续加组件，输出不再变化（是阈值不是滑块）", () => {
      const heavier = slideOf("content", Array.from({ length: threshold + 4 }, (_, i) => para(`第 ${i} 段`)))
      expect(draw(heavier).markup).toBe(draw(dense).markup)
    })

    it("密页内容区 1040×420 内零装饰像素", () => {
      const { root } = draw(dense)
      const boxes = [
        ...Array.from(root.querySelectorAll("path")).map((p) => pathBox(p.getAttribute("d")!)),
        ...Array.from(root.querySelectorAll("line")).map(lineBox),
        ...Array.from(root.querySelectorAll("rect")).map(rectBox),
      ]
      for (const box of boxes) {
        expect(intersects(box, BODY_ZONE), `decor enters the body zone: ${JSON.stringify(box)}`).toBe(false)
      }
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
        expect(draw(long).markup).toBe(draw(short).markup)
      })

      it("同结构不同页型：content/ending 输出逐字节相同（cover 是声明的撤能量条档，不是文字几何的函数）", () => {
        const markups = new Set(
          (["content", "ending"] as const).map((type) => draw(slideOf(type, [para("同一段")])).markup),
        )
        expect(markups.size).toBe(1)
      })

      it("组件数相同、组件类型不同：输出逐字节相同（数的是个数，不是内容）", () => {
        const bullets = slideOf("content", [{ type: "bullets", items: ["甲", "乙", "丙"] } as Component])
        expect(draw(bullets).markup).toBe(draw(slideOf("content", [para("一段")])).markup)
      })
    })
  })

  describe("第五文字带让位（cover 撤能量条 / 注脚页撤能量条）", () => {
    const withNote = { ...contentSlide, footnote: "来源：内部经营数据" } as Slide
    const emptyNote = { ...contentSlide, footnote: "" } as Slide
    const longNote = {
      ...contentSlide,
      footnote:
        "来源：这一行故意写得很长很长很长，长到足以把注脚自动缩字号与截断逻辑整个跑一遍，但字段有无始终是同一个真值。",
    } as Slide
    const tableSource = slideOf("content", [
      {
        type: "data_table",
        columns: [
          { key: "a", label: "甲" },
          { key: "b", label: "乙" },
        ],
        rows: [{ cells: { a: "1", b: "2" } }],
        source: "来源：表格自己的脚注",
      } as Component,
    ])

    it("有 slide.footnote：能量条撤场，括弧与速度线留下", () => {
      const { root } = draw(withNote)
      expect(Array.from(root.querySelectorAll("path"))).toHaveLength(4)
      expect(Array.from(root.querySelectorAll("line"))).toHaveLength(10)
      expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    })

    it("无 footnote 字段：能量条留下（反例）", () => {
      expect(draw(contentSlide).root.querySelectorAll("rect")).toHaveLength(8)
    })

    it("空串 footnote 与缺省同：能量条留下（与渲染侧 slide.footnote && 对齐）", () => {
      expect(draw(emptyNote).root.querySelectorAll("rect")).toHaveLength(8)
      expect(draw(emptyNote).markup).toBe(draw(contentSlide).markup)
    })

    it("同有 footnote 不同文案：输出逐字节相同（判据不读文字几何）", () => {
      expect(draw(longNote).markup).toBe(draw(withNote).markup)
    })

    it("组件级 data_table.source 不撤能量条（表内小字，不是第五文字带）", () => {
      expect(draw(tableSource).root.querySelectorAll("rect")).toHaveLength(8)
      expect(draw(tableSource).root.querySelectorAll("line")).toHaveLength(10)
    })

    it("密页叠加注脚：速度线与能量条都撤，括弧留下", () => {
      const threshold = PACING_BUDGETS.dense.maxComponentsPerSlide
      const denseNoted = {
        ...slideOf(
          "content",
          Array.from({ length: threshold }, (_, i) => para(`第 ${i} 段`)),
        ),
        footnote: "来源：密页",
      } as Slide
      const { root } = draw(denseNoted)
      expect(Array.from(root.querySelectorAll("path"))).toHaveLength(4)
      expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
      expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    })

    it("cover 与同结构 content 只差能量条：括弧与速度线逐字节相同", () => {
      const cover = draw(slideOf("cover", [para("同一段")]))
      const content = draw(slideOf("content", [para("同一段")]))
      expect(Array.from(cover.root.querySelectorAll("path")).map((p) => p.getAttribute("d"))).toEqual(
        Array.from(content.root.querySelectorAll("path")).map((p) => p.getAttribute("d")),
      )
      expect(Array.from(cover.root.querySelectorAll("line")).map((l) => l.outerHTML)).toEqual(
        Array.from(content.root.querySelectorAll("line")).map((l) => l.outerHTML),
      )
      expect(cover.root.querySelectorAll("rect")).toHaveLength(0)
      expect(content.root.querySelectorAll("rect")).toHaveLength(8)
    })
  })

  it("安全区：满场装饰不进板上四条红虚线禁区", () => {
    for (const slide of [contentSlide, coverSlide]) {
      const { root } = draw(slide)
      const boxes = [
        ...Array.from(root.querySelectorAll("path")).map((p) => pathBox(p.getAttribute("d")!)),
        ...Array.from(root.querySelectorAll("line")).map(lineBox),
        ...Array.from(root.querySelectorAll("rect")).map(rectBox),
      ]
      for (const box of boxes) {
        for (const [name, zone] of Object.entries({
          title: TITLE_ZONE,
          body: BODY_ZONE,
          footer: FOOTER_ZONE,
          brLogo: LOGO_BOX,
        })) {
          expect(intersects(box, zone), `${slide.type} piece enters the ${name} zone: ${JSON.stringify(box)}`).toBe(
            false,
          )
        }
      }
    }
  })

  it("不画任何粗平左竖条", () => {
    const { root } = draw(contentSlide)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
      expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
    }
    for (const r of Array.from(root.querySelectorAll("rect"))) {
      expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
    }
  })

  it("画笔属性写在叶子上，不挂 <g>——导出侧只读叶子自己的 fill/stroke/opacity", () => {
    const { root } = draw(coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}, which svg2pptx drops`).toBeNull()
      }
    }
  })

  it("不用 rotate transform（导出侧明说旋转不在受控子集内）", () => {
    const { root } = draw(coverSlide)
    for (const el of Array.from(root.querySelectorAll("path, line, rect, g"))) {
      expect(el.getAttribute("transform"), `${el.tagName} carries a transform`).toBeNull()
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，arena 的色一处不残留（零 hex 纪律的实证）", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<ArenaMotif ir={ir("heritage")} slide={contentSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.accent)
    expect(markup).toContain(heritage.colors.border)
    expect(markup).toContain(heritage.colors.chartPalette[1])
    for (const hex of ["#120B22", "#1B1233", "#241847", "#52F2A8", "#F2F3F7", "#A79FC4", "#3A2D63", "#FF4D9D", "#4DC3FF", "#FFD84D"]) {
      expect(markup, `arena token ${hex} leaked into the heritage render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw(coverSlide, ARENA_TOKENS, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw(coverSlide).markup).toBe(draw(coverSlide).markup)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw(slide).root)).not.toThrow()
    }
  })
})
