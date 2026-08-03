// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { imageToOp } from "./image"

const DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="

function imageEl(attrs: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image ${attrs}/></svg>`,
    "image/svg+xml",
  )
  const el = doc.querySelector("image")
  if (!el) throw new Error("no image parsed")
  return el
}

// 真实 1×1 PNG（可嗅探原始尺寸）；DATA_URI 是截断 PNG（嗅探失败走回退）
const REAL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("imageToOp", () => {
  it("reads href and converts px bbox to inches (嗅探失败→保持框尺寸无 sizing)", () => {
    const op = imageToOp(
      imageEl(`x="96" y="48" width="192" height="96" href="${DATA_URI}"`),
    )
    expect(op).toEqual({
      kind: "image",
      x: 1,
      y: 0.5,
      w: 2,
      h: 1,
      data: DATA_URI,
    })
  })

  it("falls back to xlink:href when href is absent", () => {
    const op = imageToOp(
      imageEl(`x="0" y="0" width="96" height="96" xlink:href="${DATA_URI}"`),
    )
    expect(op).toEqual({
      kind: "image",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      data: DATA_URI,
    })
  })
})

describe("imageToOp alt (A11Y-01 alt chain)", () => {
  it("reads aria-label into op.alt when present, CJK included", () => {
    const op = imageToOp(
      imageEl(`x="0" y="0" width="96" height="96" href="${DATA_URI}" aria-label="团队庆祝产品发布"`),
    )
    expect(op.alt).toBe("团队庆祝产品发布")
  })

  it("leaves op.alt undefined when aria-label is absent (zero-byte-change guarantee)", () => {
    const op = imageToOp(
      imageEl(`x="0" y="0" width="96" height="96" href="${DATA_URI}"`),
    )
    expect(op.alt).toBeUndefined()
    expect("alt" in op).toBe(false)
  })

  // Real production DOMParser (installNodePlatform → linkedom), not jsdom's:
  // linkedom 0.18.12's `Element.getAttribute()` only decodes `&quot;`/
  // `&#x27;`/numeric entities, silently leaving `&amp;`/`&lt;`/`&gt;`
  // undecoded — verified directly against the library, not a guess. That
  // half-decoded string, fed to pptxgenjs's own `encodeXmlEntities`, would
  // re-escape the already-literal `&amp;` into `&amp;amp;` in the exported
  // `descr` — a real doubling bug this test caught during implementation.
  // `imageToOp` reads via `.getAttributeNode()?.value` specifically to route
  // around it (see that function's own doc comment) — this test pins the
  // exact linkedom code path in production, not jsdom's unaffected one.
  it("decodes &, <, > correctly through linkedom (not jsdom) — no double-escaping regression", async () => {
    const { DOMParser: LinkedomDOMParser } = await import("linkedom")
    const doc = new LinkedomDOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="96" height="96" href="${DATA_URI}" aria-label="a &amp; b &lt;c&gt; &quot;d&quot; &#x27;e&#x27;"/></svg>`,
      "image/svg+xml",
    )
    const el = doc.querySelector("image")!
    const op = imageToOp(el as unknown as Element)
    expect(op.alt).toBe(`a & b <c> "d" 'e'`)
  })
})

describe("imageToOp sizing (2026-07-09 导出拉伸修复)", () => {
  const mk = (attrs: string) =>
    imageEl(`href="${REAL_PNG}" x="0" y="0" width="640" height="720" ${attrs}`)

  it("slice → cover：w/h=原始尺寸、sizing.w/h=目标框（pptxgenjs srcRect 契约）", () => {
    const op = imageToOp(mk('preserveAspectRatio="xMidYMid slice"'))
    expect(op.sizing).toEqual({ type: "cover", w: 640 / 96, h: 720 / 96 })
    expect(op.w).toBeCloseTo(1 / 96)
    expect(op.h).toBeCloseTo(1 / 96)
  })

  it("显式 meet → contain", () => {
    const op = imageToOp(mk('preserveAspectRatio="xMidYMid meet"'))
    expect(op.sizing?.type).toBe("contain")
  })

  it("缺省 → contain（SVG 规范缺省即 xMidYMid meet）", () => {
    const op = imageToOp(mk(""))
    expect(op.sizing?.type).toBe("contain")
  })

  it("显式 none → 不设 sizing（保持拉伸语义）", () => {
    const op = imageToOp(mk('preserveAspectRatio="none"'))
    expect(op.sizing).toBeUndefined()
    expect(op.w).toBeCloseTo(640 / 96)
  })

  it("嗅探不到原始尺寸 → 不设 sizing（回退旧行为，不比修复前糟）", () => {
    const op = imageToOp(
      imageEl(`href="${DATA_URI}" width="640" height="720" preserveAspectRatio="xMidYMid slice"`),
    )
    expect(op.sizing).toBeUndefined()
    expect(op.w).toBeCloseTo(640 / 96)
  })
})

describe("dataUriDimensions", () => {
  it("PNG IHDR", async () => {
    const { dataUriDimensions } = await import("./image")
    expect(dataUriDimensions(REAL_PNG)).toEqual({ w: 1, h: 1 })
  })
  it("非图片/截断返回 null", async () => {
    const { dataUriDimensions } = await import("./image")
    expect(dataUriDimensions(DATA_URI)).toBeNull()
    expect(dataUriDimensions("data:text/plain;base64,QUFB")).toBeNull()
  })
})
