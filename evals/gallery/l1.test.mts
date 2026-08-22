// @vitest-environment node
//
// L1 is the zero-model geometry pass. Planted SVGs must hit. A live corpus
// sample must complete even when the current render still has findings.

import { describe, expect, it } from "vitest"
import { renderSlideSvg } from "@/api"
import { installNodePlatform } from "@/platform/node"
import { corpusAssets, layoutPage } from "./corpus/decks"
import { LEXICONS } from "./corpus/lexicon"
import { auditL1, classifyL1 } from "./l1"
import { loadPlantedManifest, plantedSvg } from "./planted/load"

await installNodePlatform()

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${inner}</svg>`

function codes(svg: string): string[] {
  return classifyL1(auditL1(svg))
}

describe("auditL1 planted defects", () => {
  it("flags text overflowing its data-audit-box as overflow", () => {
    const long = "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范说明"
    const svg = wrap(
      `<g data-audit-rect="0,0,1280,720"><g data-audit-box="100,100,300">` +
        `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">${long}</text></g>` +
        `</g></g>`,
    )
    expect(codes(svg)).toContain("overflow")
  })

  it("flags text past 1280×720 as out-of-bounds", () => {
    const svg = wrap(`<text x="1270" y="30" font-size="20">edge overflow text</text>`)
    expect(codes(svg)).toContain("out-of-bounds")
  })

  it("flags +3 more and +2 … as overflow-marker", () => {
    expect(codes(wrap(`<text x="40" y="40" font-size="14">+3 more</text>`))).toContain("overflow-marker")
    expect(codes(wrap(`<text x="40" y="40" font-size="14">+2 …</text>`))).toContain("overflow-marker")
  })

  it("flags font-size 10, and ignores data-decor", () => {
    expect(codes(wrap(`<text x="40" y="40" font-size="10">tiny body</text>`))).toContain("font-size")
    expect(codes(wrap(`<text x="40" y="40" font-size="10" data-decor="1">star</text>`))).not.toContain("font-size")
    expect(codes(wrap(`<g data-decor="1"><text x="40" y="40" font-size="10">star</text></g>`))).not.toContain("font-size")
  })

  it("flags text x=1 as edge-stick", () => {
    expect(codes(wrap(`<text x="1" y="40" font-size="16">stuck</text>`))).toContain("edge-stick")
  })

  it("flags writing-mode tb with Latin as latin-vertical", () => {
    expect(codes(wrap(`<text x="40" y="40" font-size="16" writing-mode="tb">ABC</text>`))).toContain("latin-vertical")
  })

  it("classifies the same SVG identically on a dual run (0 drift)", () => {
    const svg = wrap(
      `<text x="1" y="40" font-size="10">tiny</text>` +
        `<text x="40" y="80" font-size="14">+3 more</text>` +
        `<text x="1270" y="30" font-size="20">edge overflow text</text>`,
    )
    expect(classifyL1(auditL1(svg))).toEqual(classifyL1(auditL1(svg)))
  })

  it("flags a horizontal line through the title x-height as strikethrough", () => {
    const svg = wrap(
      `<text x="100" y="200" font-size="80">客户与收入结构</text>` +
        `<line x1="90" y1="172" x2="500" y2="172" stroke="#F5C518" stroke-width="2"/>`,
    )
    expect(codes(svg)).toContain("strikethrough")
  })

  it("does not flag a legal underline below the baseline as strikethrough", () => {
    const svg = wrap(
      `<text x="100" y="200" font-size="80">客户与收入结构</text>` +
        `<line x1="90" y1="212" x2="500" y2="212" stroke="#F5C518" stroke-width="2"/>`,
    )
    expect(codes(svg)).not.toContain("strikethrough")
  })

  it("does not flag a short gold underline as edge-stick", () => {
    const svg = wrap(
      `<text x="640" y="404" font-size="84" text-anchor="middle">客户与收入结构</text>` +
        `<line x1="568" y1="472" x2="712" y2="472" stroke="#F5C518" stroke-width="1.6"/>`,
    )
    expect(codes(svg)).not.toContain("edge-stick")
    expect(codes(svg)).not.toContain("strikethrough")
  })

  it("flags two axis-aligned text ink boxes that intersect as overlap", () => {
    const svg = wrap(
      `<text x="200" y="435" font-size="70" font-weight="700">年第二季度业务评审</text>` +
        `<text x="200" y="446" font-size="34">工作区席位订阅业务的增长质量</text>`,
    )
    expect(codes(svg)).toContain("overlap")
  })

  it("does not flag a hanging quotation mark against the first glyph as overlap", () => {
    const svg = wrap(
      `<text x="96" y="200" font-size="48">“</text>` +
        `<text x="110" y="200" font-size="24">我们不是在卖算法，是在卖一个团队少开一场会。</text>`,
    )
    expect(codes(svg)).not.toContain("overlap")
  })

  it("does not flag stacked 70px lines at y=360 and y=435 as overlap", () => {
    const svg = wrap(
      `<text x="200" y="360" font-size="70" font-weight="700">云觅科技 2026</text>` +
        `<text x="200" y="435" font-size="70" font-weight="700">年第二季度业务评审</text>`,
    )
    expect(codes(svg)).not.toContain("overlap")
  })

  it("flags boxless overflow when a long line leaves a 300px parent card", () => {
    const zh = "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范说明"
    const en = "Distributed transaction consistency under a microservice architecture and compensation policy"
    const zhSvg = wrap(
      `<g>` +
        `<rect x="100" y="80" width="300" height="80" fill="#eee"/>` +
        `<text x="110" y="130" font-size="20">${zh}</text>` +
        `</g>`,
    )
    const enSvg = wrap(
      `<g>` +
        `<rect x="100" y="80" width="300" height="80" fill="#eee"/>` +
        `<text x="110" y="130" font-size="20">${en}</text>` +
        `</g>`,
    )
    expect(codes(zhSvg)).toContain("overflow")
    expect(codes(enSvg)).toContain("overflow")
  })

  it("flags a bento shell that runs past the page bottom as out-of-bounds", () => {
    const svg = wrap(
      `<rect data-bento-shell="true" x="96" y="421" width="400" height="320" fill="#26342E"/>` +
        `<text x="116" y="500" font-size="16">接入设备总量</text>`,
    )
    expect(codes(svg)).toContain("out-of-bounds")
    const hit = auditL1(svg).findings.find((f) => f.code === "out-of-bounds")
    expect(hit?.message).toMatch(/shell|card/i)
    expect(hit?.message).toMatch(/1280/)
  })

  it("does not treat a giant watermark or the page fill as boxless overflow", () => {
    const svg = wrap(
      `<rect x="0" y="0" width="1280" height="720" fill="#1E2A4A"/>` +
        `<text x="1224" y="650" font-size="260" font-weight="700" opacity="0.05" text-anchor="end">01</text>` +
        `<text x="640" y="404" font-size="84" text-anchor="middle">客户与收入结构</text>`,
    )
    expect(codes(svg)).not.toContain("overflow")
  })

  it("classifies a mixed new-rule SVG identically on a dual run (0 drift)", () => {
    const svg = wrap(
      `<text x="100" y="200" font-size="80">客户与收入结构</text>` +
        `<line x1="90" y1="172" x2="500" y2="172" stroke="#F5C518"/>` +
        `<text x="200" y="435" font-size="70">年第二季度业务评审</text>` +
        `<text x="200" y="446" font-size="34">工作区订阅业务</text>`,
    )
    expect(classifyL1(auditL1(svg))).toEqual(classifyL1(auditL1(svg)))
  })

  it("flags a midground group painted after foreground as depth-contract", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="fg"><text x="96" y="120" font-size="32">主体</text></g>` +
        `<g data-depth="mid"><line x1="80" y1="680" x2="1200" y2="680" stroke="#999999" opacity="0.2"/></g>`,
    )
    expect(codes(svg)).toContain("depth-contract")
  })

  it("flags midground paint at or above the shared contrast ceiling", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="mid"><rect x="100" y="100" width="80" height="60" fill="#000000"/></g>` +
        `<g data-depth="fg"></g>`,
    )
    expect(codes(svg)).toContain("depth-contract")
  })

  it("accepts ordered layers whose midground paint stays below the shared ceiling", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="mid"><line x1="80" y1="680" x2="1200" y2="680" stroke="#999999" opacity="0.2"/></g>` +
        `<g data-depth="fg"><text x="96" y="120" font-size="32">主体</text></g>`,
    )
    expect(codes(svg)).not.toContain("depth-contract")
  })

  it("flags a midground ghost label whose glyph box bleeds off canvas", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="mid"><text x="1260" y="700" font-size="160" fill="#999999" opacity="0.1" data-bleed="true">09</text></g>` +
        `<g data-depth="fg"></g>`,
    )
    expect(codes(svg)).toContain("mid-text-bleed")
  })

  it("flags an isolated small stroked midground piece", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="mid"><path d="M 100 100 h 16 v 16" fill="none" stroke="#999999" opacity="0.2"/></g>` +
        `<g data-depth="fg"></g>`,
    )
    expect(codes(svg)).toContain("isolated-mid-piece")
  })

  it("accepts a small midground tick attached to a structural rule", () => {
    const svg = wrap(
      `<g data-depth="bg"><rect width="1280" height="720" fill="#FFFFFF"/></g>` +
        `<g data-depth="mid">` +
        `<line x1="40" y1="100" x2="100" y2="100" stroke="#999999" opacity="0.2"/>` +
        `<path d="M 100 100 h 16 v 16" fill="none" stroke="#999999" opacity="0.2"/>` +
        `</g><g data-depth="fg"></g>`,
    )
    expect(codes(svg)).not.toContain("isolated-mid-piece")
  })
})

describe("planted L1 regression", () => {
  it("hits every expected L1 code on planted pages that declare one", () => {
    const { entries } = loadPlantedManifest()
    const l1Entries = entries.filter((entry) => entry.l1Expected.length > 0)
    expect(l1Entries.length).toBeGreaterThan(0)
    for (const entry of l1Entries) {
      const got = classifyL1(auditL1(plantedSvg(entry)))
      for (const code of entry.l1Expected) {
        expect(got, `${entry.id} should include ${code}, got ${got.join(",")}`).toContain(code)
      }
    }
  })

  it("does not require L1 hits on radius and rotate plants", () => {
    const { entries } = loadPlantedManifest()
    const visualOnly = entries.filter((entry) => entry.class === "radius" || entry.class === "rotate")
    expect(visualOnly.length).toBeGreaterThanOrEqual(4)
    expect(visualOnly.every((entry) => entry.l1Expected.length === 0)).toBe(true)
  })
})

describe("auditL1 live sample", () => {
  it("completes on a real rendered page without treating corpus findings as failure", async () => {
    const assets = await corpusAssets(LEXICONS.zh)
    const svg = renderSlideSvg(layoutPage("two-column", LEXICONS.zh, assets), 0)
    const result = auditL1(svg)
    expect(Array.isArray(result.findings)).toBe(true)
    expect(classifyL1(result)).toEqual(classifyL1(auditL1(svg)))
  })
})
