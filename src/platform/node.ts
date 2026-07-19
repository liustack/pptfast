import { DOMParser as LinkedomDOMParser } from "linkedom"
import { installPlatform } from "./registry"
import type * as Sharp from "sharp"

async function recodeWithSharp(dataUrl: string): Promise<string> {
  let sharpMod: typeof Sharp.default
  try {
    sharpMod = (await import("sharp")).default as unknown as typeof Sharp.default
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find/.test(err?.message ?? "")) {
      throw new Error(
        'Re-encoding non-PNG/JPEG/GIF images requires the optional dependency "sharp" (npm i sharp), or convert the image beforehand'
      )
    }
    throw e
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
  const png = await sharpMod(Buffer.from(base64, "base64")).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

/** Wire Node implementations (linkedom DOM, sharp image re-encode) into the SDK. */
export function installNodePlatform(): void {
  installPlatform({
    domParser: LinkedomDOMParser as unknown as typeof DOMParser,
    recodeImageToPng: recodeWithSharp,
  })
}
