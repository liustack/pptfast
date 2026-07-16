import { pxToIn } from "../../constants"

/**
 * A pptxgenjs image draw, produced from an SVG `<image>` element.
 * Rendered later via `slide.addImage({ data, x, y, w, h })`.
 * `data` is a base64 data-URI string (e.g. "data:image/png;base64,...").
 * All positions are in inches.
 */
export interface ImageOp {
  kind: "image"
  x: number
  y: number
  w: number
  h: number
  data: string
  /**
   * pptxgenjs sizing（2026-07-09 用户报导出拉伸）：SVG 预览的
   * preserveAspectRatio 语义必须翻译到导出，否则 addImage 按 w/h 拉伸。
   * slice→cover（居中裁剪出血，pptxgenjs 对称 srcRect）、meet/缺省→contain
   * （SVG 规范缺省即 xMidYMid meet）、显式 none→不设（保持拉伸）。
   */
  sizing?: { type: "cover" | "contain"; w: number; h: number }
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

const XLINK_NS = "http://www.w3.org/1999/xlink"

function num(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) ?? "0") || 0
}

/**
 * Resolve the image source from an SVG `<image>` element.
 * Priority: `href` attribute > `xlink:href` (namespaced) > `xlink:href` (raw).
 */
function resolveHref(el: Element): string {
  return (
    el.getAttribute("href") ??
    el.getAttributeNS(XLINK_NS, "href") ??
    el.getAttribute("xlink:href") ??
    ""
  )
}

/**
 * 从 data URI 头同步嗅探图片原始像素尺寸（png/jpeg/gif——导出链在
 * pptx-inline-assets 已把其他格式重编码为 png）。识别不了返回 null。
 *
 * 为什么需要：pptxgenjs 的 sizing 用「addImage 的 w/h（应传图片原始尺寸）
 * 与 sizing.w/h（目标框）」的比值算 srcRect 裁剪量——两者传同值会得到
 * 零裁剪（srcRect 全 0），图仍被拉伸（2026-07-09 实拍 XML 证据）。
 */
export function dataUriDimensions(uri: string): { w: number; h: number } | null {
  const m = /^data:image\/(png|jpeg|jpg|gif);base64,/.exec(uri)
  if (!m) return null
  // JPEG 的 SOF 段可能在 EXIF 之后，解码前 256KB 足够覆盖真实病例
  const b64 = uri.slice(m[0].length, m[0].length + 262144)
  let bytes: Uint8Array
  try {
    const bin = atob(b64.slice(0, b64.length - (b64.length % 4)))
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return null
  }
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1]
  const be32 = (i: number) =>
    ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
  // PNG: 8 字节签名 + IHDR（宽高在 16/20，big-endian 32 位）
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { w: be32(16), h: be32(20) }
  }
  // GIF: "GIF" + 宽高在 6/8（little-endian 16 位）
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { w: bytes[6] | (bytes[7] << 8), h: bytes[8] | (bytes[9] << 8) }
  }
  // JPEG: 扫描 SOF0/1/2 标记（高在 +5、宽在 +7，big-endian 16 位）
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++
        continue
      }
      const marker = bytes[i + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { w: be16(i + 7), h: be16(i + 5) }
      }
      i += 2 + be16(i + 2)
    }
  }
  return null
}

/** Convert an SVG `<image>` element to a pptxgenjs image op. */
export function imageToOp(el: Element): ImageOp {
  const boxW = pxToIn(num(el, "width"))
  const boxH = pxToIn(num(el, "height"))
  const data = resolveHref(el)
  const op: ImageOp = {
    kind: "image",
    x: pxToIn(num(el, "x")),
    y: pxToIn(num(el, "y")),
    w: boxW,
    h: boxH,
    data,
  }
  const par = el.getAttribute("preserveAspectRatio") ?? ""
  if (par !== "none") {
    // slice→cover（居中裁剪出血）；meet/缺省→contain（SVG 规范缺省即
    // xMidYMid meet）。pptxgenjs 契约：w/h 传图片原始尺寸、sizing.w/h 传
    // 目标框（单位一致即可，比值运算）。嗅探不到原始尺寸时保持拉伸
    // （不比修复前更糟，且 aspect 相同时拉伸=无损）。
    const natural = dataUriDimensions(data)
    if (natural && natural.w > 0 && natural.h > 0) {
      op.w = pxToIn(natural.w)
      op.h = pxToIn(natural.h)
      op.sizing = { type: par.includes("slice") ? "cover" : "contain", w: boxW, h: boxH }
    }
  }
  return op
}
