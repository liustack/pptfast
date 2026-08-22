// @vitest-environment node
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { installNodePlatform } from "../../platform/node"
import { renderSlideSvg } from "../../api"
import type { PptxIR, Slide } from "../../ir"

installNodePlatform()

const UNASSIGNED = [
  "classroom",
  "swiss",
  "stage",
  "memo",
  "crayon",
  "ember",
  "runway",
  "pulse",
] as const

const KEEP_NATIVE_WITHOUT_CHAPTER = [
  "consulting",
  "tech",
  "playbill",
  "enterprise",
  "arena",
] as const

const LAYOUTS = [
  "two-column",
  "bento-panel",
  "tone-adaptive-content",
  "banner-heading",
  "narrow-column",
  "rail-numbered",
] as const

const HEADING = "算法团队的迭代节奏与业务预期存在落差"
const SUB = "设备预测性维护业务的增长质量与下半年投入方向"
const CHAPTER = "增长战略"

function deck(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "heading-byte-nail.pptx",
    theme: { id: theme },
    meta: { organization: "pptfast" },
    assets: { images: {} },
    slides,
  } as PptxIR
}

function content(opts: { heading?: string; subheading?: string; layout: string }): Slide {
  return {
    type: "content",
    heading: opts.heading,
    subheading: opts.subheading,
    layout: opts.layout,
    components: [{ type: "paragraph", text: "正文占位，用来钉头区几何。" }],
  } as Slide
}

function sha(svg: string): string {
  return createHash("sha256").update(svg).digest("hex")
}

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/unassigned-bytes.json", import.meta.url), "utf-8"),
) as { pages: Record<string, string> }

describe("unassigned heading bytes stay pinned to the pre-change fixture", () => {
  const pages: Record<string, string> = {}

  for (const theme of UNASSIGNED) {
    for (const layout of LAYOUTS) {
      const withChapter: Slide[] = [
        { type: "chapter", heading: CHAPTER, components: [] } as Slide,
        content({ heading: HEADING, layout }),
        content({ heading: HEADING, subheading: SUB, layout }),
        content({ heading: undefined, layout }),
      ]
      const irChapter = deck(theme, withChapter)
      pages[`${theme}|${layout}|title-only|chapter`] = sha(renderSlideSvg(irChapter, 1))
      pages[`${theme}|${layout}|title-sub|chapter`] = sha(renderSlideSvg(irChapter, 2))
      pages[`${theme}|${layout}|no-title|chapter`] = sha(renderSlideSvg(irChapter, 3))

      const noChapter: Slide[] = [
        content({ heading: HEADING, layout }),
        content({ heading: HEADING, subheading: SUB, layout }),
        content({ heading: undefined, layout }),
      ]
      const irNone = deck(theme, noChapter)
      pages[`${theme}|${layout}|title-only|none`] = sha(renderSlideSvg(irNone, 0))
      pages[`${theme}|${layout}|title-sub|none`] = sha(renderSlideSvg(irNone, 1))
      pages[`${theme}|${layout}|no-title|none`] = sha(renderSlideSvg(irNone, 2))
    }
  }

  for (const theme of KEEP_NATIVE_WITHOUT_CHAPTER) {
    for (const layout of LAYOUTS) {
      const noChapter: Slide[] = [
        content({ heading: HEADING, layout }),
        content({ heading: HEADING, subheading: SUB, layout }),
        content({ heading: undefined, layout }),
      ]
      const irNone = deck(theme, noChapter)
      pages[`${theme}|${layout}|title-only|none`] = sha(renderSlideSvg(irNone, 0))
      pages[`${theme}|${layout}|title-sub|none`] = sha(renderSlideSvg(irNone, 1))
      pages[`${theme}|${layout}|no-title|none`] = sha(renderSlideSvg(irNone, 2))
    }
  }

  it("captures 378 keys matching the fixture", () => {
    expect(Object.keys(pages)).toHaveLength(378)
    expect(Object.keys(fixture.pages)).toHaveLength(378)
  })

  it.each(Object.keys(fixture.pages))("%s", (key) => {
    expect(pages[key]).toBe(fixture.pages[key])
  })
})
