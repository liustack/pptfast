// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { SvgContent } from "./SvgContent"
import type { BlockCtx } from "./blocks/types"
import type { Block } from "@/ir"

const ctx: BlockCtx = {
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
}

const blocks: Block[] = [
  { type: "paragraph", text: "引言段落。" },
  { type: "bullets", items: ["甲", "乙"], style: "default" },
]

describe("SvgContent", () => {
  it("renders one positioned group per block within an svg", () => {
    const { container } = render(
      <svg viewBox="0 0 1280 720">
        <SvgContent variant="single" blocks={blocks} rect={{ x: 80, y: 264, w: 1120, h: 400 }} ctx={ctx} />
      </svg>,
    )
    // paragraph text + 2 bullet markers + 2 bullet texts
    expect(container.querySelectorAll("text").length).toBeGreaterThanOrEqual(3)
    expect(container.querySelectorAll("circle").length).toBe(2)
    // every block group is translated below the content-box top
    const groups = Array.from(container.querySelectorAll("g[transform]"))
    expect(groups.length).toBeGreaterThanOrEqual(2)
  })

  it("annotates content rect and block boxes for the overflow auditor", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          blocks={[
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

  it("renders a dropped-count marker when blocks overflow the rect", () => {
    const longText =
      "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
    const many: Block[] = Array.from({ length: 8 }, () => ({
      type: "paragraph",
      text: longText.repeat(3),
    }))
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent blocks={many} rect={{ x: 0, y: 0, w: 800, h: 400 }} ctx={ctx} />
      </svg>,
    )
    expect(markup).toContain("未展示")
  })

  it("annotates bespoke variants with the content rect", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <SvgContent
          variant="big_number"
          blocks={[{ type: "kpi_cards", items: [{ value: "18", label: "成本下降" }] }]}
          rect={{ x: 96, y: 176, w: 1088, h: 424 }}
          ctx={ctx}
        />
      </svg>,
    )
    expect(markup).toContain('data-audit-rect="96,176,1088,424"')
  })
})

it("vertically centers a lone block within the content rect", () => {
  const markup = renderToStaticMarkup(
    <svg>
      <SvgContent
        blocks={[{ type: "bullets", items: ["仅此一块"], style: "default" }]}
        rect={{ x: 96, y: 176, w: 1088, h: 424 }}
        ctx={ctx}
      />
    </svg>,
  )
  const m = /data-audit-box="96,([\d.]+),1088"/.exec(markup)
  expect(m).not.toBeNull()
  expect(Number(m?.[1])).toBeGreaterThan(200)
})

// Wave-B S4: the surplus-distribution gap growth lives entirely in
// `layoutContentFit`'s returned box.y — SvgContent renders and annotates
// straight from that one value, so the audit annotation (data-audit-box)
// and the actual rendered position (the block's own translate) can never
// drift apart. `kpi_cards` measures a fixed 120px (see layout.test.ts), so
// the expected numbers below match that file's "two blocks + large
// remaining" case exactly.
it("surplus-grown block y is identical between the audit annotation and the rendered translate", () => {
  const twoKpis: Block[] = [
    { type: "kpi_cards", items: [{ value: "1", label: "a" }] },
    { type: "kpi_cards", items: [{ value: "1", label: "b" }] },
  ]
  const markup = renderToStaticMarkup(
    <svg>
      <SvgContent blocks={twoKpis} rect={{ x: 0, y: 0, w: 400, h: 500 }} ctx={ctx} />
    </svg>,
  )
  // The second block's audit box must report the grown y (220 — stretch
  // grants each kpi the capped +84 first; see layout.test.ts's arithmetic).
  expect(markup).toContain('data-audit-box="0,220,400"')
  // And the block's own rendered translate must carry that exact same y —
  // "rendering the annotation" (not a parallel, possibly-diverging value).
  expect(markup).toContain("translate(0,220)")
  expect(markup).not.toContain('data-audit-box="0,136,400"')
})
