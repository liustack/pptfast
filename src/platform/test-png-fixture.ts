import { deflateSync } from "node:zlib"

/**
 * Minimal, dependency-free PNG encoder — test support only (no `.test.ts`
 * suffix so both `node-rasterize.test.ts` and `../svg/audit/pixel-audit.test.ts`
 * can import it, same "shared fixture module living next to what it tests"
 * convention `../svg/audit/stress-fixtures.ts` already establishes).
 *
 * Hand-rolled rather than generated through Sharp itself on purpose: the
 * whole point of `node-rasterize.test.ts`'s probe suite is to verify Sharp's
 * *own* rendering against independently-known ground truth — building the
 * source bitmap with Sharp too would make the probe circular (a systematic
 * Sharp color-handling bug could then round-trip through both the fixture
 * and the assertion and never show up as a mismatch).
 */

let crcTable: Uint32Array | null = null

function crc32(buf: Buffer): number {
  if (!crcTable) {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    crcTable = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, "ascii")
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/**
 * Build a minimal valid 8-bit RGB (no alpha channel — every pixel fully
 * opaque by construction, sidestepping any ambiguity about how a partially
 * transparent *source* image ought to composite) PNG, `pixel(x, y)` deciding
 * each pixel's colour. No filtering (filter-type 0/None per scanline) and a
 * single zlib-deflated IDAT — the simplest encoding a PNG decoder must
 * still accept, per the spec.
 */
export function makeSolidRegionPng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type 2 = truecolor (RGB), no alpha
  ihdrData[10] = 0 // compression method
  ihdrData[11] = 0 // filter method
  ihdrData[12] = 0 // interlace method
  const ihdr = chunk("IHDR", ihdrData)

  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // per-scanline filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
    }
  }
  const idat = chunk("IDAT", deflateSync(raw))
  const iend = chunk("IEND", Buffer.alloc(0))
  return Buffer.concat([signature, ihdr, idat, iend])
}

/** {@link makeSolidRegionPng}, base64-encoded as a `data:image/png` URI —
 *  the shape every `<image href>`/`assets.images[id].src` call site needs. */
export function makeSolidRegionPngDataUri(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): string {
  return `data:image/png;base64,${makeSolidRegionPng(width, height, pixel).toString("base64")}`
}

/** A PNG evenly split into a bright top half and a dark bottom half — the
 *  two-region fixture both probe suites use: "bright region behind faintly
 *  scrimmed text" and "dark region behind heavily scrimmed text" are the two
 *  realistic cases `ImageCoverPage`'s own `DarkScrim` (uneven per-band
 *  opacity) actually produces. 40×40 is comfortably past the "tiny source
 *  gets smoothed on extreme upscale" artifact this task's own probe found at
 *  a 2×2 source (not a Sharp defect — an expected interpolation effect of
 *  stretching a near-1px source ~640×; irrelevant to any real deck asset,
 *  which is never that small) — verified empirically at 20×20 already being
 *  clean, 40×40 kept for extra margin. */
export function twoToneSquarePng(
  size: number,
  top: [number, number, number],
  bottom: [number, number, number],
): Buffer {
  return makeSolidRegionPng(size, size, (_x, y) => (y < size / 2 ? top : bottom))
}
