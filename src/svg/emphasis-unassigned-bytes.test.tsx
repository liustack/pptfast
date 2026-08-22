// @vitest-environment node
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderSlideSvg } from "../api"
import type { PptxIR, Slide } from "../ir"
import { installNodePlatform } from "../platform/node"
import { CANONICAL_THEME_IDS } from "../themes"

installNodePlatform()

const UNASSIGNED = CANONICAL_THEME_IDS.filter((themeId) => themeId !== "consulting")
const MARKED_HEADING = "年度**增长结论**与下一步投入"
const MARKED_SUBHEADING = "先看**关键判断**，再展开证据"

function content(layout: string, component: Slide["components"][number]): Slide {
  return {
    type: "content",
    layout,
    heading: MARKED_HEADING,
    subheading: MARKED_SUBHEADING,
    components: [component],
  } as Slide
}

function deck(themeId: string): PptxIR {
  return {
    version: "4",
    filename: "emphasis-unassigned-byte-nail.pptx",
    theme: { id: themeId },
    meta: { organization: "pptfast" },
    assets: { images: {} },
    slides: [
      {
        type: "cover",
        heading: MARKED_HEADING,
        subheading: MARKED_SUBHEADING,
        components: [],
      } as Slide,
      { type: "chapter", heading: "增长战略", components: [] } as Slide,
      content("two-column", {
        type: "paragraph",
        text: "普通正文中的**关键证据**保持原有强调画法。",
      }),
      content("banner-heading", {
        type: "bullets",
        items: ["第一条包含**关键证据**", "第二条保持普通文本"],
      }),
      content("bento-panel", {
        type: "callout",
        variant: "info",
        text: "提示中的**关键证据**保持原有强调画法。",
      }),
      content("quiet-frame", {
        type: "verdict_banner",
        tone: "positive",
        text: "结论中的**关键证据**保持原有强调画法。",
      }),
    ],
  } as PptxIR
}

function consultingPadDeck(): PptxIR {
  const plain = { type: "paragraph" as const, text: "普通正文" }
  return {
    version: "4",
    filename: "emphasis-consulting-pad-paths.pptx",
    theme: { id: "consulting" },
    meta: { organization: "pptfast" },
    assets: { images: {} },
    slides: [
      { type: "cover", heading: MARKED_HEADING, components: [] } as Slide,
      { type: "chapter", heading: "增长战略", components: [] } as Slide,
      {
        type: "content",
        layout: "two-column",
        heading: "普通标题",
        components: [{ type: "paragraph", text: "正文中的**关键证据**" }],
      } as Slide,
      {
        type: "content",
        layout: "banner-heading",
        heading: "普通标题",
        components: [{ type: "bullets", items: ["要点中的**关键证据**"] }],
      } as Slide,
      {
        type: "content",
        layout: "bento-panel",
        heading: "普通标题",
        components: [{ type: "callout", variant: "info", text: "提示中的**关键证据**" }],
      } as Slide,
      {
        type: "content",
        layout: "quiet-frame",
        heading: "普通标题",
        components: [{ type: "verdict_banner", tone: "positive", text: "结论中的**关键证据**" }],
      } as Slide,
      { type: "content", layout: "two-column", heading: MARKED_HEADING, components: [plain] } as Slide,
      {
        type: "content",
        layout: "split-band",
        heading: "普通标题",
        subheading: MARKED_SUBHEADING,
        components: [plain],
      } as Slide,
    ],
  } as PptxIR
}

function sha(svg: string): string {
  return createHash("sha256").update(svg).digest("hex")
}

// Recaptured for the three-layer depth contract. All 115 hashes move because
// the marked layer groups are now part of the serialized SVG contract. The
// same matrix remains a byte nail for every later change.
//
// Recaptured (wave8 batch 1, 2026-08-23). Cover/content paths on the five
// boarded themes pick up lock-board covers, motifs, and ink. Changed keys
// are enterprise/insight/campaign/tech/ember × pages 0,2,3,4,5 (25 of 115).
// Other unassigned themes stay byte-identical. consulting is not in this
// fixture.
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/emphasis-unassigned-bytes.json", import.meta.url), "utf-8"),
) as { pages: Record<string, string> }

describe("unassigned emphasis forms stay pinned to the depth-contract fixture", () => {
  const pages: Record<string, string> = {}
  for (const themeId of UNASSIGNED) {
    const ir = deck(themeId)
    for (const pageIndex of [0, 2, 3, 4, 5]) {
      pages[`${themeId}|${pageIndex}`] = sha(renderSlideSvg(ir, pageIndex))
    }
  }
  it("covers 23 themes across five real render paths", () => {
    expect(UNASSIGNED).toHaveLength(23)
    expect(Object.keys(pages)).toHaveLength(115)
    expect(Object.keys(fixture.pages)).toHaveLength(115)
  })

  it.each(Object.keys(fixture.pages))("%s", (key) => {
    expect(pages[key]).toBe(fixture.pages[key])
  })
})

describe("consulting pad reaches every shared emphasis path", () => {
  const ir = consultingPadDeck()

  it.each([
    [0, "cover"],
    [2, "paragraph"],
    [3, "bullets"],
    [4, "callout"],
    [5, "verdict banner"],
    [6, "heading treatment"],
    [7, "layout subheading"],
  ] as const)("page %i covers %s", (pageIndex, path) => {
    const svg = renderSlideSvg(ir, pageIndex)
    expect(svg, path).toContain('data-emphasis-pad=""')
    expect(svg, path).not.toContain("**")
  })
})
