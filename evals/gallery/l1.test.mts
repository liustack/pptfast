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
