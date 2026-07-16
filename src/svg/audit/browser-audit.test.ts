// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectBBoxOverflows, serializePageFunction } from "./browser-audit"

/**
 * jsdom has no layout engine, so `SVGGraphicsElement.prototype.getBBox` is
 * unimplemented (throws). These tests fabricate a small SVG DOM and stub
 * `getBBox` per `<text>` element to the bbox a real browser would report,
 * then assert `collectBBoxOverflows` reproduces the same overflow logic as
 * the estimator audit (`svg-audit.test.ts`) — just fed a real (stubbed)
 * bounding box instead of an estimated width.
 */

function parseSvg(markup: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  return doc.documentElement as unknown as SVGSVGElement
}

/** Stub `getBBox` on every `<text>` under `root`, in document order. */
function stubBBoxes(
  root: Element,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
): void {
  const texts = Array.from(root.querySelectorAll("text"))
  texts.forEach((el, i) => {
    const bbox = boxes[i]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(el as any).getBBox = () => bbox
  })
}

describe("collectBBoxOverflows", () => {
  it("passes text whose real bbox fits its box", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<g data-audit-box="100,100,400">` +
        `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">短文本</text></g>` +
        `</g></svg>`,
    )
    stubBBoxes(root, [{ x: 0, y: 4, width: 60, height: 20 }])
    expect(collectBBoxOverflows(root, 8)).toEqual([])
  })

  it("flags a real bbox wider than its box as h-overflow", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<g data-audit-box="100,100,300">` +
        `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">long text</text></g>` +
        `</g></svg>`,
    )
    // local bbox width 350 far exceeds the 300-wide box even after the +100 offset.
    stubBBoxes(root, [{ x: 0, y: 4, width: 350, height: 20 }])
    const issues = collectBBoxOverflows(root, 8)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain("h-overflow")
  })

  it("stays within tolerance for a near-miss", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<g data-audit-box="0,0,100">` +
        `<text x="0" y="20" font-size="20">edge</text>` +
        `</g></svg>`,
    )
    // right edge = 0 + 104 = 104, 4px over the box's 100 — within the 8px tolerance.
    stubBBoxes(root, [{ x: 0, y: 4, width: 104, height: 20 }])
    expect(collectBBoxOverflows(root, 8)).toEqual([])
  })

  it("flags text below its content rect as v-overflow", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<g data-audit-rect="96,176,1088,424">` +
        `<text x="96" y="700" font-size="20">stacked past bottom</text>` +
        `</g></svg>`,
    )
    // rect bottom is 176 + 424 = 600; real bbox bottom lands at 705, well past it.
    stubBBoxes(root, [{ x: 0, y: 685, width: 200, height: 20 }])
    const issues = collectBBoxOverflows(root, 8)
    expect(issues.some((i) => i.startsWith("v-overflow"))).toBe(true)
  })

  it("flags text outside the 1280x720 page", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<text x="1270" y="30" font-size="20">edge overflow text</text>` +
        `</svg>`,
    )
    stubBBoxes(root, [{ x: 1270, y: 15, width: 60, height: 20 }])
    const issues = collectBBoxOverflows(root, 8)
    expect(issues.some((i) => i.startsWith("page-overflow"))).toBe(true)
  })

  it("accumulates translate() offsets across nested groups before comparing", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<g data-audit-box="100,100,150">` +
        `<g transform="translate(50,0)">` +
        `<g transform="translate(70,0)">` +
        `<g transform="translate(90,0)">` +
        `<text x="0" y="20" font-size="20">OVERFLOW</text>` +
        `</g></g></g></g></svg>`,
    )
    // local bbox left=0 (no self transform); accumulated dx = 50+70+90 = 210,
    // so the real left/right are 210/230 — right exceeds box x+w=250? no —
    // widen the local box so only full accumulation trips the h-overflow:
    // box right bound (padded) = 100+150+8 = 258. Full accumulation gives
    // right = 210+90=300 > 258 (overflow). Partial accumulation (e.g. only
    // 90) would give right = 90+90=180, no overflow.
    stubBBoxes(root, [{ x: 0, y: 4, width: 90, height: 20 }])
    const issues = collectBBoxOverflows(root, 8)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain("h-overflow")
  })

  it("ignores an element whose getBBox throws (unstubbed / unsupported)", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<text x="0" y="20" font-size="20">no bbox stub</text>` +
        `</svg>`,
    )
    // No stubBBoxes call — jsdom's real (unimplemented) getBBox throws.
    expect(() => collectBBoxOverflows(root, 8)).not.toThrow()
    expect(collectBBoxOverflows(root, 8)).toEqual([])
  })

  it("ignores empty text content", () => {
    const root = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
        `<text x="0" y="20" font-size="20">   </text>` +
        `</svg>`,
    )
    stubBBoxes(root, [{ x: 0, y: 0, width: 9999, height: 9999 }])
    expect(collectBBoxOverflows(root, 8)).toEqual([])
  })

  it("is self-contained so it can be serialized into a page via toString()", () => {
    const body = collectBBoxOverflows.toString()
    // No module imports/requires may leak into the extracted source — it has
    // to run standalone once injected into a generated HTML page.
    expect(body).not.toContain("import ")
    expect(body).not.toContain("require(")
    // The page-size constant must be declared inside the function body
    // itself, not pulled in from module scope (which does not travel with
    // `.toString()`).
    expect(body).toMatch(/PAGE_W\s*=\s*1280/)
  })

  describe("serializePageFunction", () => {
    // Vitest's own transform (used to run *this* test file) does not inject
    // esbuild's keepNames `__name(...)` calls, so we can't observe the
    // artifact by calling collectBBoxOverflows.toString() from inside a
    // vitest test — but `pnpm exec tsx` (used by
    // scripts/pptx-browser-audit.mts, the actual consumer of this
    // serializer) runs esbuild with `keepNames: true` baked in, which
    // rewrites every nested named function inside collectBBoxOverflows's
    // body (parseTranslate/parseNums/visit) to append a
    // `__name(parseTranslate, "parseTranslate")` call referencing a helper
    // that only exists in the Node module scope — confirmed by hand via
    // `pnpm exec tsx --tsconfig tsconfig.app.json` against this exact
    // export. Embedding that verbatim into a generated HTML page throws a
    // ReferenceError the moment the in-page audit runs. Since that artifact
    // is toolchain-specific and not reproducible under vitest, this test
    // exercises the stripper directly against a synthetic fixture shaped
    // like real esbuild keepNames output instead of relying on this file's
    // own transform to produce it.
    it("strips esbuild's __name() keepNames calls injected around nested helpers", () => {
      const fakeCompiledFn = Object.assign(() => [] as string[], {
        toString: () =>
          'function collectBBoxOverflows(root,tol){const issues=[];' +
          'function parseTranslate(el){return{dx:0,dy:0}}__name(parseTranslate,"parseTranslate");' +
          'function visit(el){}__name(visit,"visit");' +
          "visit(root);return issues}",
      })
      const serialized = serializePageFunction(
        fakeCompiledFn as unknown as typeof collectBBoxOverflows,
      )
      expect(serialized).not.toContain("__name(")
      // The rest of the source (the actual logic) must survive untouched.
      expect(serialized).toContain("function parseTranslate(el){return{dx:0,dy:0}}")
      expect(serialized).toContain("function visit(el){}")
    })

    it("is a no-op when the source has no __name() calls (e.g. under vitest's own transform)", () => {
      const raw = collectBBoxOverflows.toString()
      expect(raw).not.toContain("__name(")
      expect(serializePageFunction(collectBBoxOverflows)).toBe(raw)
    })

    it("round-trips through Function() and still detects overflows correctly", () => {
      const serialized = serializePageFunction(collectBBoxOverflows)
      const rebuilt = new Function(`return (${serialized})`)() as typeof collectBBoxOverflows

      const root = parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">` +
          `<g data-audit-box="100,100,300">` +
          `<g transform="translate(100,100)"><text x="0" y="20" font-size="20">long text</text></g>` +
          `</g></svg>`,
      )
      stubBBoxes(root, [{ x: 0, y: 4, width: 350, height: 20 }])

      expect(rebuilt(root, 8)).toEqual(collectBBoxOverflows(root, 8))
      expect(rebuilt(root, 8)).toHaveLength(1)
    })
  })
})
