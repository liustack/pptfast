// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { OneEvidenceContent } from "../content-one-evidence"
import { sparseFace } from "./registry"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人听它说话。"

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function render(body: React.ReactElement): Element {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return parseSvgRoot(markup)
}

describe("sparseFace dispatch", () => {
  it("looks up by (themeId, layoutId) and misses fall through to undefined", () => {
    expect(sparseFace("statement", "stage")).toBeTypeOf("function")
    expect(sparseFace("statement", "lecture")).toBeTypeOf("function")
    expect(sparseFace("statement", "consulting")).toBeUndefined()
    expect(sparseFace("one-evidence", "stage")).toBeUndefined()
    expect(sparseFace("mono-bleed", "luxe")).toBeUndefined()
    expect(sparseFace("statement", undefined)).toBeUndefined()
  })

  it("the same statement IR is centered on stage, left on lecture, italic 500 on consulting", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide

    const stageCtx = buildCtx(resolveStyle("stage"), {})
    const stageRoot = render(
      <StatementContent ir={ir("stage", [slide])} slide={slide} index={0} ctx={stageCtx} />,
    )
    const stageHeading = Array.from(stageRoot.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(stageHeading.getAttribute("x")).toBe("640")
    expect(stageHeading.getAttribute("text-anchor")).toBe("middle")
    expect(stageHeading.getAttribute("font-style")).not.toBe("italic")

    const lectureCtx = buildCtx(resolveStyle("lecture"), {})
    const lectureRoot = render(
      <StatementContent ir={ir("lecture", [slide])} slide={slide} index={0} ctx={lectureCtx} />,
    )
    const lectureHeading = Array.from(lectureRoot.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(lectureHeading.getAttribute("x")).toBe("120")

    const consultingCtx = buildCtx(resolveStyle("consulting"), {})
    const consultingRoot = render(
      <StatementContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={consultingCtx} />,
    )
    const consultingHeading = Array.from(consultingRoot.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(consultingHeading.getAttribute("x")).toBe("640")
    expect(consultingHeading.getAttribute("font-style")).toBe("italic")
    expect(consultingHeading.getAttribute("font-weight")).toBe("500")
  })

  it("an unregistered pair (stage, one-evidence) keeps the generic face", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "迁徙路线在十年里缩短了四成",
      components: [],
    } as Slide
    const ctx = buildCtx(resolveStyle("stage"), {})
    const root = render(
      <OneEvidenceContent ir={ir("stage", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("迁徙路线"),
    )!
    expect(heading.getAttribute("x")).toBe("80")
    expect(heading.getAttribute("font-weight")).toBe("600")
    expect(root.querySelector("rect[stroke-dasharray]")).toBeNull()
  })
})
