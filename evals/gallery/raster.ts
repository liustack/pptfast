/**
 * Dual-track raster for L2: sharp (via getPlatform().rasterizeSvg) by default,
 * optional Playwright screenshot when L1 already reported overflow/overlap.
 * Playwright is resolved at runtime, same as evals/gallery/bbox.ts, and is
 * never a package dependency.
 */

import { CANVAS_H_PX, CANVAS_W_PX } from "@/constants"
import { getPlatform } from "@/platform/registry"
import sharp from "sharp"

export async function rasterSvgToPng(svg: string): Promise<Buffer> {
  const rasterize = getPlatform().rasterizeSvg
  if (!rasterize) {
    throw new Error("rasterizeSvg unavailable — call installNodePlatform() first")
  }
  const img = await rasterize(svg, CANVAS_W_PX, CANVAS_H_PX)
  const raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return sharp(raw, { raw: { width: img.width, height: img.height, channels: 4 } })
    .png()
    .toBuffer()
}

async function tryLoadPlaywright(): Promise<any | null> {
  const specs = [process.env.PPTFAST_PLAYWRIGHT, "playwright", "playwright-core"].filter(Boolean) as string[]
  for (const spec of specs) {
    try {
      const mod = await import(spec)
      return mod?.chromium ? mod : mod?.default
    } catch {
      // try the next spec
    }
  }
  return null
}

export async function maybePlaywrightPng(svg: string): Promise<{ png?: Buffer; skipReason?: string }> {
  const playwright = await tryLoadPlaywright()
  if (!playwright?.chromium) {
    return { skipReason: "playwright not found" }
  }
  let browser: { close: () => Promise<void> } | undefined
  try {
    try {
      browser = await playwright.chromium.launch({ channel: "chrome" })
    } catch {
      browser = await playwright.chromium.launch()
    }
    const page = await (browser as any).newPage({ viewport: { width: CANVAS_W_PX, height: CANVAS_H_PX } })
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;}</style>${svg}`,
      { waitUntil: "load" },
    )
    const png = (await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: CANVAS_W_PX, height: CANVAS_H_PX } })) as Buffer
    return { png }
  } catch (error) {
    return { skipReason: error instanceof Error ? error.message : String(error) }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}
