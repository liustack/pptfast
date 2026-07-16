import { renderToStaticMarkup } from "react-dom/server"
import type React from "react"

/**
 * Serialize an SVG React tree (a full `<svg>` root) to standalone markup.
 *
 * React's server renderer omits the SVG namespace on the root element, which
 * makes the string fail to parse as `image/svg+xml`; we inject `xmlns` when the
 * component did not already provide it. This is the bridge that lets the same
 * component drive both the live preview and the svg2pptx exporter.
 */
export function renderSvgMarkup(node: React.ReactElement): string {
  const markup = renderToStaticMarkup(node)
  return markup.includes("xmlns=")
    ? markup
    : markup.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
}

/** Parse serialized slide markup back into an `<svg>` root element for svgToOps. */
export function parseSvgRoot(markup: string): Element {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const err = doc.querySelector("parsererror")
  if (err) throw new Error(`failed to parse slide svg: ${err.textContent ?? ""}`)
  return doc.documentElement
}
