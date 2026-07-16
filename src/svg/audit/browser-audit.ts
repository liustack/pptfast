/**
 * Real-browser counterpart to `svg-audit.ts`. The estimator audit shares
 * `measureTextUnits` with the layout code that decides how much text fits a
 * box — same-source blind spot: an estimation bug can hide layout bugs from
 * itself. This module trades the estimate for the browser's own
 * `SVGGraphicsElement.getBBox()`, so it must run inside an actual page
 * (Chrome 103-class, per `docs/browser-compat.md`), not jsdom.
 *
 * `collectBBoxOverflows` is designed to be shipped into that page verbatim:
 * `scripts/pptx-browser-audit.mts` embeds `collectBBoxOverflows.toString()`
 * in generated HTML and calls it from an inline `<script>`. That means the
 * function body must be self-contained — no closures over module-level
 * imports/consts, no TS-only runtime constructs (enums, parameter
 * properties, `as const` assertions relying on erased types) — plain
 * ES2020 that still works after esbuild/tsx strips the type annotations.
 */

/**
 * Walk `root` (an `<svg>` element already attached to a live document, so
 * `getBBox()` reflects real glyph metrics), accumulating `data-audit-box` /
 * `data-audit-rect` scopes the same way `svg-audit.ts` does for the
 * estimator, and flag any `<text>` whose real bounding box exceeds its
 * declared box/rect (or the 1280x720 page) by more than `tol` px.
 *
 * Kept intentionally free of module-scope references (see file header) —
 * every constant the body needs (including the 1280x720 page size) must be
 * declared *inside* this function, since only the function itself — not the
 * rest of the module — travels into the page via `.toString()`.
 */
export function collectBBoxOverflows(root: SVGSVGElement, tol: number): string[] {
  const PAGE_W = 1280
  const PAGE_H = 720
  const issues: string[] = []

  // This renderer only ever emits `translate(dx,dy)`, `scale(s)`, or the two
  // composed as `translate(dx,dy) scale(s)` (uniform scale, e.g. bento-card
  // content scale-to-fit or icon scale) — never rotation or non-uniform
  // scale, so a single scalar is enough.
  function parseTransform(el: Element): { dx: number; dy: number; scale: number } {
    const t = el.getAttribute("transform") ?? ""
    const tm = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(t)
    const sm = /scale\(\s*(-?[\d.]+)/.exec(t)
    return {
      dx: tm ? Number(tm[1]) : 0,
      dy: tm ? Number(tm[2]) : 0,
      scale: sm ? Number(sm[1]) : 1,
    }
  }

  function parseNums(attr: string | null): number[] {
    return (attr ?? "").split(",").map(Number)
  }

  function visit(
    el: Element,
    ox: number,
    oy: number,
    os: number,
    box: { x: number; y: number; w: number } | null,
    rect: { x: number; y: number; w: number; h: number } | null,
  ): void {
    const { dx, dy, scale } = parseTransform(el)
    // Compose (ox,oy,os) with this element's own translate/scale — see the
    // matching comment in svg-audit.ts's estimator visit() for the derivation
    // — so getBBox() (measured in the text element's own pre-transform local
    // space) still lands at its true rendered position/size under a scaled
    // ancestor (bento-card content scaled to fit).
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale

    const boxAttr = el.getAttribute("data-audit-box")
    if (boxAttr) {
      const [x, y, w] = parseNums(boxAttr)
      box = { x, y, w }
    }
    const rectAttr = el.getAttribute("data-audit-rect")
    if (rectAttr) {
      const [x, y, w, h] = parseNums(rectAttr)
      rect = { x, y, w, h }
    }

    if (el.tagName.toLowerCase() === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        let bbox: { x: number; y: number; width: number; height: number } | null = null
        try {
          bbox = (el as unknown as SVGGraphicsElement).getBBox()
        } catch {
          bbox = null
        }
        if (bbox && bbox.width > 0) {
          const left = ax + bbox.x * as
          const right = left + bbox.width * as
          const top = ay + bbox.y * as
          const bottom = top + bbox.height * as
          const label = content.slice(0, 24)

          if (box && (right > box.x + box.w + tol || left < box.x - tol)) {
            issues.push(
              "h-overflow " +
                label +
                ": [" +
                left.toFixed(0) +
                "," +
                right.toFixed(0) +
                "] exceeds box x=" +
                box.x +
                " w=" +
                box.w,
            )
          }
          if (rect && bottom > rect.y + rect.h + tol) {
            issues.push(
              "v-overflow " +
                label +
                ": bottom " +
                bottom.toFixed(0) +
                " below rect bottom " +
                (rect.y + rect.h),
            )
          }
          if (right > PAGE_W + tol || left < -tol || bottom > PAGE_H + tol || top < -tol) {
            issues.push(
              "page-overflow " +
                label +
                ": [" +
                left.toFixed(0) +
                "," +
                right.toFixed(0) +
                "] y=[" +
                top.toFixed(0) +
                "," +
                bottom.toFixed(0) +
                "] outside " +
                PAGE_W +
                "x" +
                PAGE_H,
            )
          }
        }
      }
    }

    const children = el.children
    for (let i = 0; i < children.length; i++) {
      visit(children[i], ax, ay, as, box, rect)
    }
  }

  visit(root, 0, 0, 1, null, null)
  return issues
}

/**
 * Extract `collectBBoxOverflows` as a string ready to embed verbatim in a
 * generated HTML page (see `scripts/pptx-browser-audit.mts`).
 *
 * `tsx` (and Vite's esbuild-based dev/test transforms) run with esbuild's
 * `keepNames: true`, which rewrites every named function/const declaration
 * to append a `__name(fn, "fn")` call right after it — including the ones
 * nested *inside* `collectBBoxOverflows` (`parseTransform`, `parseNums`,
 * `visit`), so plain `.toString()` embeds calls to a `__name` helper that
 * only exists in the Node module scope, not in a standalone page — the
 * exact "TS-only runtime construct that breaks after transpile" this
 * function's own doc comment warns against. Strip them here so callers get
 * a genuinely self-contained script.
 */
export function serializePageFunction(
  fn: (root: SVGSVGElement, tol: number) => string[],
): string {
  return fn.toString().replace(/__name\([^)]*\);?/g, "")
}
