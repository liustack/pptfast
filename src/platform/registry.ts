/** Environment seams. The SDK entry stays browser-safe: Node implementations
 *  live in ./node and are installed explicitly (CLI does it automatically). */
export interface PptfastPlatform {
  /** DOMParser constructor used to parse rendered SVG markup. */
  domParser?: typeof DOMParser
  /** Re-encode an image data URL to PNG (Office rejects webp and friends). */
  recodeImageToPng?: (dataUrl: string) => Promise<string>
}

let current: PptfastPlatform = {}

export function installPlatform(p: PptfastPlatform): void {
  current = { ...current, ...p }
}

export function getPlatform(): PptfastPlatform {
  return current
}
