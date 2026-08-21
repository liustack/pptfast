/**
 * One-off board vs render contact sheet.
 * Run after dump-sparse-b1-samples.ts.
 */
import sharp from "sharp"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

const boards =
  "/private/tmp/claude-501/-Users-leon-projects-pptfast/f15d68f9-0c0d-4eb5-b0dc-52c2d4686d1c/scratchpad/sparse-boards/png"
const samples = resolve("scratchpad/sparse-b1-samples")
const out = resolve("scratchpad/sparse-b1-samples/compare")

const pairs: [string, string, string][] = [
  ["stage", "statement", "Stage-1"],
  ["stage", "stat-hero", "Stage-2"],
  ["stage", "pull-quote", "Stage-3"],
  ["lecture", "statement", "Lecture-1"],
  ["lecture", "stat-hero", "Lecture-2"],
  ["lecture", "one-evidence", "Lecture-3"],
  ["swiss", "stat-hero", "Swiss-1"],
  ["swiss", "statement", "Swiss-2"],
  ["swiss", "one-evidence", "Swiss-3"],
  ["memo", "pull-quote", "Memo-1"],
  ["memo", "stat-hero", "Memo-2"],
  ["memo", "statement", "Memo-3"],
  ["playbill", "statement", "Playbill-1"],
  ["playbill", "stat-hero", "Playbill-2"],
  ["playbill", "mono-bleed", "Playbill-3"],
  ["museum", "statement", "Museum-1"],
  ["museum", "one-evidence", "Museum-2"],
  ["museum", "stat-hero", "Museum-3"],
  ["luxe", "pull-quote", "Luxe-1"],
  ["luxe", "stat-hero", "Luxe-2"],
  ["luxe", "statement", "Luxe-3"],
  ["ink", "statement", "Ink-1"],
  ["ink", "stat-hero", "Ink-2"],
  ["ink", "pull-quote", "Ink-3"],
]

const W = 640
const H = 360
const GAP = 16
const LABEL = 28

async function fitPng(path: string) {
  return sharp(path)
    .resize(W, H, { fit: "contain", background: { r: 20, g: 18, b: 16, alpha: 1 } })
    .png()
    .toBuffer()
}

async function main() {
  mkdirSync(out, { recursive: true })
  const tiles: Buffer[] = []
  for (const [theme, layout, board] of pairs) {
    const left = await fitPng(`${boards}/${board}.png`)
    const right = await sharp(`${samples}/${theme}-${layout}.svg`)
      .resize(W, H, { fit: "contain", background: { r: 20, g: 18, b: 16, alpha: 1 } })
      .png()
      .toBuffer()
    const label = Buffer.from(
      `<svg width="${W * 2 + GAP}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#141210"/><text x="8" y="20" fill="#C4BFB6" font-size="14" font-family="sans-serif">${board} board  |  ${theme} ${layout} render</text></svg>`,
    )
    const dest = `${out}/${theme}-${layout}.png`
    await sharp({
      create: { width: W * 2 + GAP, height: H + LABEL, channels: 3, background: "#141210" },
    })
      .composite([
        { input: await sharp(label).png().toBuffer(), top: 0, left: 0 },
        { input: left, top: LABEL, left: 0 },
        { input: right, top: LABEL, left: W + GAP },
      ])
      .png()
      .toFile(dest)
    tiles.push(await sharp(dest).toBuffer())
    console.log(dest)
  }

  const RW = W * 2 + GAP
  const RH = H + LABEL
  const COLS = 2
  const ROWS = Math.ceil(pairs.length / COLS)
  const composites = tiles.map((input, i) => ({
    input,
    top: Math.floor(i / COLS) * (RH + 12),
    left: (i % COLS) * (RW + 12),
  }))
  await sharp({
    create: {
      width: COLS * RW + (COLS - 1) * 12,
      height: ROWS * RH + (ROWS - 1) * 12,
      channels: 3,
      background: "#0A0908",
    },
  })
    .composite(composites)
    .png()
    .toFile(`${out}/all.png`)
  console.log(`${out}/all.png`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
