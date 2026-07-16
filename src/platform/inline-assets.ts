/**
 * 导出前的资产内联：把 ir.assets.images 里的 http(s) 图片取回并替换为
 * data URL。预览用 <image href=签名URL> 由浏览器直接加载，而 pptxgenjs 的
 * addImage 需要真实字节（data URI）——单源重构时丢了这一步，URL 资产在
 * 导出产物里整体缺失（页面只剩遮罩，视觉上是黑/灰底）。
 *
 * 失败语义与 image-export 一致：显式抛错，不生成残缺文档。
 *
 * 另做 Office 安全 MIME 归一化：webp 等非 png/jpeg/gif 资产（典型是
 * ref:upload 上传图的 1600w webp 预览变体）重编码为 PNG——pptxgenjs 把
 * data URL 的 MIME 原样写进 pptx，PowerPoint 打不开 webp。
 */
import type { PptxIR } from "@/ir"
import { PptfastError } from "../errors"
import { getPlatform } from "./registry"

/**
 * 手工构造 data URL（不走 FileReader）：MIME 取 Content-Type，兜底 image/png。
 * pptxgenjs 依赖 data URL 的 MIME 头识别媒体类型，不能容忍 octet-stream。
 */
async function responseToDataUrl(resp: Response): Promise<string> {
  const mime = resp.headers.get("content-type")?.split(";")[0] || "image/png"
  const bytes = new Uint8Array(await resp.arrayBuffer())
  let bin = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

/** 收集所有被 slide.background 引用的 asset id（仅这些参与背景压缩）。 */
export function backgroundAssetIds(ir: PptxIR): Set<string> {
  const ids = new Set<string>()
  for (const slide of ir.slides) {
    const bg = slide.background
    if (bg && bg.kind === "asset" && bg.asset_id) ids.add(bg.asset_id)
  }
  return ids
}

/** 背景图重编码阈值：小于此字节数不值得有损压缩。 */
const COMPRESS_MIN_BYTES = 400 * 1024
/** 背景图重编码目标：全幅铺图 + 遮罩场景，JPEG 0.85 视觉无感。 */
const COMPRESS_QUALITY = 0.85
const COMPRESS_MAX_W = 1920

/**
 * data URL → 已解码 HTMLImageElement。jsdom 等无解码环境 onload 永不触发——
 * 3s 超时报错，绝不挂死导出。调用方自行决定失败语义（压缩=回退原图，
 * mime 归一化=fail-loud）。
 */
async function decodeDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("decode timeout")), 3000)
    img.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error("image decode failed"))
    }
    img.src = dataUrl
  })
  return img
}

/** pptxgenjs/PowerPoint 安全的位图 MIME；其余（webp/avif 等）导出前必须重编码。 */
const OFFICE_SAFE_MIME = new Set(["image/png", "image/jpeg", "image/gif"])

function dataUrlMime(dataUrl: string): string {
  const semi = dataUrl.indexOf(";")
  return semi > 5 ? dataUrl.slice(5, semi) : ""
}

/**
 * 非 Office 安全 MIME 的资产（典型：上传图的 1600w webp 预览变体，走
 * ref:upload 进 IR）重编码为 PNG。这是正确性变换而非优化：pptxgenjs 会把
 * data URL 的 MIME 原样写进 pptx，PowerPoint 打不开 webp——失败必须抛错，
 * 与本文件「显式抛错，不生成残缺文档」的语义一致。
 */
async function reencodeToPng(dataUrl: string): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx2d = canvas.getContext("2d")
  if (!ctx2d || typeof canvas.toDataURL !== "function") {
    throw new Error("canvas unavailable, cannot re-encode")
  }
  const img = await decodeDataUrlImage(dataUrl)
  if (!img.naturalWidth) throw new Error("image decode failed")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  ctx2d.drawImage(img, 0, 0)
  const png = canvas.toDataURL("image/png")
  if (!png.startsWith("data:image/png")) throw new Error("PNG encode failed")
  return png
}

/** 资产 src 若是非 Office 安全 MIME 的 data URL → PNG；其余原样返回。 */
async function normalizeAssetDataUrl(id: string, dataUrl: string): Promise<string> {
  const mime = dataUrlMime(dataUrl)
  if (!mime.startsWith("image/") || OFFICE_SAFE_MIME.has(mime)) return dataUrl
  try {
    const recode = getPlatform().recodeImageToPng
    return recode ? await recode(dataUrl) : await reencodeToPng(dataUrl)
  } catch (e) {
    throw new PptfastError(
      `background/illustration asset "${id}" format conversion failed (${mime}→png: ${e instanceof Error ? e.message : String(e)}), cannot produce a complete PPT — please retry or regenerate the image`,
    )
  }
}

/**
 * 大体积 PNG 背景重编码为 JPEG（graphic_create 产 1920×1080 无损 PNG
 * 常见 2-5MB，作为遮罩下的背景无须无损）。canvas 不可用（如测试环境）
 * 或重编码失败/更大时原样返回——只做优化，不改变正确性。
 */
export async function maybeCompressBackground(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/png;base64,")) return dataUrl
  const approxBytes = (dataUrl.length - 22) * 0.75
  if (approxBytes < COMPRESS_MIN_BYTES) return dataUrl
  try {
    const canvas = document.createElement("canvas")
    const ctx2d = canvas.getContext("2d")
    if (!ctx2d || typeof canvas.toDataURL !== "function") return dataUrl
    const img = await decodeDataUrlImage(dataUrl)
    if (!img.naturalWidth) return dataUrl
    const scale = Math.min(1, COMPRESS_MAX_W / img.naturalWidth)
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpeg = canvas.toDataURL("image/jpeg", COMPRESS_QUALITY)
    return jpeg.startsWith("data:image/jpeg") && jpeg.length < dataUrl.length
      ? jpeg
      : dataUrl
  } catch {
    return dataUrl
  }
}

export async function inlinePptxAssets(ir: PptxIR): Promise<PptxIR> {
  const entries = Object.entries(ir.assets?.images ?? {})
  const bgIds = backgroundAssetIds(ir)
  const needsWork = entries.some(
    ([id, v]) =>
      (v.src && !v.src.startsWith("data:")) ||
      (bgIds.has(id) && v.src?.startsWith("data:image/png")) ||
      (v.src?.startsWith("data:image/") &&
        !OFFICE_SAFE_MIME.has(dataUrlMime(v.src))),
  )
  if (!needsWork) return ir

  const images: Record<string, (typeof entries)[number][1]> = {}
  await Promise.all(
    entries.map(async ([id, asset]) => {
      if (!asset.src || asset.src.startsWith("data:")) {
        if (!asset.src) {
          images[id] = asset
          return
        }
        const normalized = await normalizeAssetDataUrl(id, asset.src)
        images[id] = bgIds.has(id)
          ? { ...asset, src: await maybeCompressBackground(normalized) }
          : normalized === asset.src
            ? asset
            : { ...asset, src: normalized }
        return
      }
      let dataUrl: string
      try {
        const resp = await fetch(asset.src)
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`)
        }
        dataUrl = await responseToDataUrl(resp)
      } catch (e) {
        throw new PptfastError(
          `background/illustration asset "${id}" fetch failed (${e instanceof Error ? e.message : String(e)}), cannot produce a complete PPT — please retry or regenerate the image`,
        )
      }
      dataUrl = await normalizeAssetDataUrl(id, dataUrl)
      images[id] = {
        ...asset,
        src: bgIds.has(id) ? await maybeCompressBackground(dataUrl) : dataUrl,
      }
    }),
  )
  return { ...ir, assets: { ...ir.assets, images } }
}
