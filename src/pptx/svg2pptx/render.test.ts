import { describe, it, expect } from "vitest"
import { renderOp, renderOps, type SlideLike } from "./render"
import type { Op } from "./dispatch"

interface Call {
  method: string
  args: unknown[]
}

function recorder(): SlideLike & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    addText: (...args: unknown[]) => calls.push({ method: "addText", args }),
    addShape: (...args: unknown[]) => calls.push({ method: "addShape", args }),
    addImage: (...args: unknown[]) => calls.push({ method: "addImage", args }),
  }
}

describe("renderOp", () => {
  it("renders a rect shape op via addShape", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "shape",
      text: "",
      shape: "rect",
      x: 1,
      y: 0.5,
      w: 2,
      h: 1,
      fill: { color: "1A4A8A" },
    } as Op)
    expect(slide.calls[0].method).toBe("addShape")
    expect(slide.calls[0].args[0]).toBe("rect")
    expect(slide.calls[0].args[1]).toMatchObject({
      x: 1,
      y: 0.5,
      w: 2,
      h: 1,
      fill: { color: "1A4A8A" },
    })
  })

  it("passes rectRadius through for a roundRect", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "shape",
      text: "",
      shape: "roundRect",
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      rectRadius: 0.25,
    } as Op)
    expect(slide.calls[0].args[0]).toBe("roundRect")
    expect(slide.calls[0].args[1]).toMatchObject({ rectRadius: 0.25 })
  })

  it("renders an ellipse shape op", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "shape",
      text: "",
      shape: "ellipse",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    } as Op)
    expect(slide.calls[0].args[0]).toBe("ellipse")
  })

  it("renders a line op via addShape with flip flags", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "line",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      line: { color: "FF0000", width: 1.5 },
      flipV: true,
    } as Op)
    expect(slide.calls[0].args[0]).toBe("line")
    expect(slide.calls[0].args[1]).toMatchObject({
      line: { color: "FF0000", width: 1.5 },
      flipV: true,
    })
  })

  it("renders a path op via custGeom with points", () => {
    const slide = recorder()
    const points = [
      { x: 0, y: 0, moveTo: true },
      { x: 1, y: 0 },
      { close: true },
    ]
    renderOp(slide, {
      kind: "path",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      points,
      fill: { color: "000000" },
    } as Op)
    expect(slide.calls[0].args[0]).toBe("custGeom")
    expect(slide.calls[0].args[1]).toMatchObject({ points, fill: { color: "000000" } })
  })

  it("renders a text op via addText with runs and top valign", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "text",
      runs: [{ text: "Hello", bold: true }],
      x: 1,
      y: 1,
      w: 4,
      h: 0.5,
      fontFace: "Georgia",
      fontSize: 24,
      color: "1A1A1A",
      align: "left",
    } as Op)
    expect(slide.calls[0].method).toBe("addText")
    expect(slide.calls[0].args[0]).toEqual([
      { text: "Hello", options: { bold: true } },
    ])
    expect(slide.calls[0].args[1]).toMatchObject({
      x: 1,
      align: "left",
      valign: "top",
      fontFace: "Georgia",
      fontSize: 24,
      color: "1A1A1A",
      margin: 0,
    })
  })

  it("renders an image op via addImage", () => {
    const slide = recorder()
    renderOp(slide, {
      kind: "image",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      data: "data:image/png;base64,AAA",
    } as Op)
    expect(slide.calls[0].method).toBe("addImage")
    expect(slide.calls[0].args[0]).toMatchObject({ data: "data:image/png;base64,AAA" })
  })
})

describe("renderOps", () => {
  it("applies every op in order", () => {
    const slide = recorder()
    renderOps(slide, [
      { kind: "shape", text: "", shape: "rect", x: 0, y: 0, w: 1, h: 1 },
      { kind: "image", x: 0, y: 0, w: 1, h: 1, data: "d" },
    ] as Op[])
    expect(slide.calls.map((c) => c.method)).toEqual(["addShape", "addImage"])
  })
})

describe("renderOp block marker (wave-C S3)", () => {
  it("does nothing when the op has no blockIndex, even with a slideIndex passed", () => {
    const slide = recorder()
    renderOp(
      slide,
      { kind: "shape", text: "", shape: "rect", x: 0, y: 0, w: 1, h: 1 } as Op,
      [],
      0,
    )
    const opts = slide.calls[0].args[1] as Record<string, unknown>
    expect(opts.objectName).toBeUndefined()
  })

  it("does nothing when the op has a blockIndex but no slideIndex was passed (default export path)", () => {
    const slide = recorder()
    renderOp(
      slide,
      { kind: "shape", text: "", shape: "rect", x: 0, y: 0, w: 1, h: 1, blockIndex: 2 } as Op,
      [],
    )
    const opts = slide.calls[0].args[1] as Record<string, unknown>
    expect(opts.objectName).toBeUndefined()
  })

  it("mints a fresh objectName carrying the blk marker when both are present", () => {
    const slide = recorder()
    renderOp(
      slide,
      { kind: "shape", text: "", shape: "rect", x: 0, y: 0, w: 1, h: 1, blockIndex: 2 } as Op,
      [],
      0,
    )
    const opts = slide.calls[0].args[1] as Record<string, unknown>
    expect(opts.objectName).toMatch(/^svg2pptx-[a-z0-9]+-blk0000-0002$/)
  })

  it("appends the blk marker onto an existing gradient objectName rather than replacing it", () => {
    const slide = recorder()
    const patches: Parameters<typeof renderOp>[2] = []
    renderOp(
      slide,
      {
        kind: "shape",
        text: "",
        shape: "rect",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        gradientFill: { kind: "linear", angleDeg: 0, stops: [] },
        blockIndex: 1,
      } as Op,
      patches,
      3,
    )
    const opts = slide.calls[0].args[1] as Record<string, unknown>
    expect(opts.objectName).toMatch(/^svg2pptx-gradient-[a-z0-9]+-0-blk0003-0001$/)
    // The gradient patch itself still targets the *full* (marker-suffixed) name.
    expect(patches[0].objectName).toBe(opts.objectName)
  })

  it("tags text/line/path/image ops the same way as shape ops", () => {
    const slide = recorder()
    renderOp(
      slide,
      { kind: "text", runs: [{ text: "hi" }], x: 0, y: 0, w: 1, h: 1, fontSize: 12, align: "left", blockIndex: 0 } as Op,
      [],
      0,
    )
    renderOp(
      slide,
      { kind: "line", x: 0, y: 0, w: 1, h: 1, line: { color: "000", width: 1 }, blockIndex: 0 } as Op,
      [],
      0,
    )
    renderOp(
      slide,
      { kind: "path", x: 0, y: 0, w: 1, h: 1, points: [], blockIndex: 0 } as Op,
      [],
      0,
    )
    renderOp(
      slide,
      { kind: "image", x: 0, y: 0, w: 1, h: 1, data: "d", blockIndex: 0 } as Op,
      [],
      0,
    )
    for (const call of slide.calls) {
      const opts = call.args[call.method === "addText" ? 1 : call.method === "addImage" ? 0 : 1] as Record<
        string,
        unknown
      >
      expect(opts.objectName).toContain("blk0000-0000")
    }
  })

  it("renderOps threads slideIndex through to every op", () => {
    const slide = recorder()
    renderOps(
      slide,
      [{ kind: "shape", text: "", shape: "rect", x: 0, y: 0, w: 1, h: 1, blockIndex: 5 } as Op],
      7,
    )
    const opts = slide.calls[0].args[1] as Record<string, unknown>
    expect(opts.objectName).toContain("blk0007-0005")
  })
})

describe("opacity passthrough", () => {
  it("passes text transparency into addText opts", () => {
    const slide = recorder()
    renderOps(slide, [
      {
        kind: "text",
        runs: [{ text: "01" }],
        x: 0, y: 0, w: 2, h: 1,
        fontSize: 40,
        color: "FFFFFF",
        transparency: 94,
        align: "center",
      },
    ])
    const call = slide.calls.find((c) => c.method === "addText")
    const opts = call?.args[1] as Record<string, unknown>
    expect(opts.transparency).toBe(94)
  })
})
