/**
 * PPTX Renderer — public API.
 *
 * Single-source SVG era: slides are rendered by `svg/FullSlideSvg` and
 * converted by `svg2pptx`. The only piece left here is the master definition
 * (which carries the native dynamic slide number).
 */
export { defineMastersForIR } from "./master-builder"
