/**
 * Development-time guard asserting a rendered slide SVG stays within the subset
 * svg2pptx can faithfully export. This is not a runtime fallback — it is a tripwire
 * for tests and dev mode so a preview/export divergence is caught at its source
 * (e.g. a template that paints a gradient the exporter would silently drop).
 */

/**
 * Elements DrawingML has no equivalent for, or that svg2pptx cannot scale.
 * `linearGradient`/`radialGradient` are deliberately absent: svg2pptx's
 * `gradient.ts` converts them to native `a:gradFill` (see `fill="url(#…)"`
 * handling below) — only `pattern`/`filter`/etc remain forbidden.
 */
const FORBIDDEN_TAGS = new Set([
  "foreignobject",
  "style",
  "use",
  "mask",
  "filter",
  "clippath",
  "pattern",
  "symbol",
])

/** Match `fill="url(#id)"` (with or without quotes around the fragment). */
function urlRefId(value: string): string | null {
  const m = value.trim().match(/^url\((["']?)#([^"')]+)\1\)$/)
  return m ? m[2] : null
}

/** Collect every declared `<linearGradient>`/`<radialGradient>` id in the tree. */
function collectGradientIds(el: Element, into: Set<string>): void {
  const tag = el.tagName.toLowerCase()
  if (tag === "lineargradient" || tag === "radialgradient") {
    const id = el.getAttribute("id")
    if (id) into.add(id)
    // svg2pptx's own converter (gradient.ts) only supports the default
    // objectBoundingBox units — reject userSpaceOnUse here too, redundantly
    // with that converter's own throw, so a template author sees this dev
    // tripwire fire on the preview side rather than only at export time.
    const units = el.getAttribute("gradientUnits")
    if (units && units !== "objectBoundingBox") {
      throw new Error(
        `subset violation: <${el.tagName} id="${id}"> uses gradientUnits="${units}" — only the default objectBoundingBox is supported`,
      )
    }
  }
  for (const child of Array.from(el.children)) collectGradientIds(child, into)
}

/** Throw if `root`'s subtree contains anything outside the exportable subset. */
export function assertSubset(root: Element): void {
  const gradientIds = new Set<string>()
  collectGradientIds(root, gradientIds)

  const visit = (el: Element): void => {
    const tag = el.tagName.toLowerCase()

    if (el !== root && tag === "svg") {
      throw new Error("subset violation: nested svg (viewBox is not scaled by svg2pptx)")
    }
    if (FORBIDDEN_TAGS.has(tag)) {
      throw new Error(`subset violation: forbidden element <${el.tagName}>`)
    }

    // stroke gradients/patterns stay forbidden outright — svg2pptx never
    // resolves a url() reference for a stroke, only for fill.
    const stroke = el.getAttribute("stroke")
    if (stroke && stroke.trim().startsWith("url(")) {
      throw new Error(`subset violation: stroke="${stroke}" (gradient/pattern is not exportable)`)
    }

    // fill gradients are allowed, but only when they resolve to a gradient
    // actually declared in this document — an unresolved reference is exactly
    // the "silent drop" divergence this guard exists to catch.
    const fill = el.getAttribute("fill")
    if (fill && fill.trim().startsWith("url(")) {
      const id = urlRefId(fill)
      if (!id || !gradientIds.has(id)) {
        throw new Error(
          `subset violation: fill="${fill}" does not reference a declared <linearGradient>/<radialGradient>`,
        )
      }
    }

    for (const child of Array.from(el.children)) visit(child)
  }
  visit(root)
}
