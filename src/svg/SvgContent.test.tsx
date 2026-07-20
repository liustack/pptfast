// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { SvgContent } from "./SvgContent"
import type { ComponentCtx } from "./components/types"
import type { Component } from "@/ir"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFF",
    surface: "#EEE",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

const components: Component[] = [
  { type: "paragraph", text: "引言段落。" },
  { type: "bullets", items: ["甲", "乙"], style: "default" },
]

describe("SvgContent", () => {
  it("renders one positioned group per component within an svg", () => {
    const { container } = render(
      <svg viewBox="0 0 1280 720">
        <SvgContent arrangement="single" components={components} rect={{ x: 80, y: 264, w: 1120, h: 400 }} ctx={ctx} />
      </svg>,
    )
    // paragraph text + 2 bullet markers + 2 bullet texts
    expect(container.querySelectorAll("text").length).toBeGreaterThanOrEqual(3)
    expect(container.querySelectorAll("circle").length).toBe(2)
    // every component group is translated below the content-box top
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    expect(groups.length).toBeGreaterThanOrEqual(2)
  })

  it("annotates content rect and component boxes for the overflow auditor", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          components={[
            { type: "bullets", items: ["一", "二"], style: "default" },
            { type: "paragraph", text: "第二块，避免单块垂直居中偏移" },
          ]}
          rect={{ x: 96, y: 176, w: 1088, h: 424 }}
          ctx={ctx}
        />
      </svg>,
    )
    expect(markup).toContain('data-audit-rect="96,176,1088,424"')
    expect(markup).toContain('data-audit-box="96,176,1088"')
  })

  it("renders a dropped-count marker when components overflow the rect", () => {
    const longText =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const many: Component[] = Array.from({ length: 8 }, () => ({
      type: "paragraph",
      text: longText.repeat(3),
    }))
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent components={many} rect={{ x: 0, y: 0, w: 800, h: 400 }} ctx={ctx} />
      </svg>,
    )
    expect(markup).toMatch(/\+\d+ more/)
  })

  it("annotates bespoke variants with the content rect", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          arrangement="big_number"
          components={[{ type: "kpi_cards", items: [{ value: "18", label: "成本下降" }] }]}
          rect={{ x: 96, y: 176, w: 1088, h: 424 }}
          ctx={ctx}
        />
      </svg>,
    )
    expect(markup).toContain('data-audit-rect="96,176,1088,424"')
  })
})

it("vertically centers a lone component within the content rect", () => {
  const markup = renderToStaticMarkup(
    <svg>
      <SvgContent
        components={[{ type: "bullets", items: ["仅此一块"], style: "default" }]}
        rect={{ x: 96, y: 176, w: 1088, h: 424 }}
        ctx={ctx}
      />
    </svg>,
  )
  const m = /data-audit-box="96,([\d.]+),1088"/.exec(markup)
  expect(m).not.toBeNull()
  expect(Number(m?.[1])).toBeGreaterThan(200)
})

// Structure-components wave task 1, decision 1: a full-body component
// (`swot`/`bmc`, `FULL_BODY_TYPES`) as the slide's sole component gets the
// whole content rect handed to it verbatim — no `layoutContentFit` column
// stacking, no 38% golden vertical offset.
describe("SvgContent full-body components (structure-components wave task 1)", () => {
  const swotComponent: Component = {
    type: "swot",
    strengths: ["优势一"],
    weaknesses: ["劣势一"],
    opportunities: ["机会一"],
    threats: ["威胁一"],
  } as Component

  it("hands the entire rect (h included) to the sole full-body component, bypassing the golden offset", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent components={[swotComponent]} rect={{ x: 96, y: 176, w: 1088, h: 424 }} ctx={ctx} />
      </svg>,
    )
    expect(markup).toContain('data-audit-rect="96,176,1088,424"')
    expect(markup).toContain('data-audit-box="96,176,1088"')
    // No dy offset — the component's own <g> children translate straight to
    // rect.y (176), never a golden-position-shifted y like the lone-component
    // bullets case above (which lands well past 200).
    expect(markup).not.toContain("未展示")
  })

  it("wins over the big_number arrangement branch when the sole component is full-body", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          arrangement="big_number"
          components={[swotComponent]}
          rect={{ x: 0, y: 0, w: 1000, h: 500 }}
          ctx={ctx}
        />
      </svg>,
    )
    // A real swot render (quadrant badge letters), not BigNumber's hero-metric markup.
    expect(markup).toContain(">S<")
    expect(markup).toContain(">优势一<")
  })

  it("fills two different given heights differently (matrix.tsx's box.h stretch idiom, no dead space)", () => {
    const shortMarkup = renderToStaticMarkup(
      <svg>
        <SvgContent components={[swotComponent]} rect={{ x: 0, y: 0, w: 1000, h: 200 }} ctx={ctx} />
      </svg>,
    )
    const tallMarkup = renderToStaticMarkup(
      <svg>
        <SvgContent components={[swotComponent]} rect={{ x: 0, y: 0, w: 1000, h: 600 }} ctx={ctx} />
      </svg>,
    )
    // Quadrant panel rects differ in height between the two renders.
    const heightsOf = (markup: string) =>
      Array.from(markup.matchAll(/<rect[^>]*width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/g))
        .filter((m) => Number(m[1]) > 34)
        .map((m) => Number(m[2]))
    const shortHeights = heightsOf(shortMarkup)
    const tallHeights = heightsOf(tallMarkup)
    expect(shortHeights[0]).not.toBe(tallHeights[0])
    expect(tallHeights[0]).toBeGreaterThan(shortHeights[0])
  })

  it("does not fire for an ordinary component even when it's the sole one", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          components={[{ type: "bullets", items: ["仅此一块"], style: "default" }]}
          rect={{ x: 96, y: 176, w: 1088, h: 424 }}
          ctx={ctx}
        />
      </svg>,
    )
    // The pre-existing golden-offset behavior (asserted above, "vertically
    // centers a lone component") is untouched for non-full-body types.
    const m = /data-audit-box="96,([\d.]+),1088"/.exec(markup)
    expect(Number(m?.[1])).toBeGreaterThan(200)
  })
})

// Wave-B S4: the surplus-distribution gap growth lives entirely in
// `layoutContentFit`'s returned box.y — SvgContent renders and annotates
// straight from that one value, so the audit annotation (data-audit-box)
// and the actual rendered position (the component's own translate) can never
// drift apart. `kpi_cards` measures a fixed 120px (see layout.test.ts), so
// the expected numbers below match that file's "two components + large
// remaining" case exactly.
it("surplus-grown component y is identical between the audit annotation and the rendered translate", () => {
  const twoKpis: Component[] = [
    { type: "kpi_cards", items: [{ value: "1", label: "a" }] },
    { type: "kpi_cards", items: [{ value: "1", label: "b" }] },
  ]
  const markup = renderToStaticMarkup(
    <svg>
      <SvgContent components={twoKpis} rect={{ x: 0, y: 0, w: 400, h: 500 }} ctx={ctx} />
    </svg>,
  )
  // The second component's audit box must report the grown y (220 — stretch
  // grants each kpi the capped +84 first; see layout.test.ts's arithmetic).
  expect(markup).toContain('data-audit-box="0,220,400"')
  // And the component's own rendered translate must carry that exact same y —
  // "rendering the annotation" (not a parallel, possibly-diverging value).
  expect(markup).toContain("translate(0,220)")
  expect(markup).not.toContain('data-audit-box="0,136,400"')
})
