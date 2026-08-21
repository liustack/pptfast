/**
 * One-off board vs render contact sheet.
 * Run after dump-sparse-b2-samples.ts.
 */
import sharp from "sharp"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

const boards =
  "/private/tmp/claude-501/-Users-leon-projects-pptfast/f15d68f9-0c0d-4eb5-b0dc-52c2d4686d1c/scratchpad/sparse-boards/png"
const samples = resolve("scratchpad/sparse-b2-samples")
const out = resolve("scratchpad/sparse-b2-samples/compare")

const pairs: [string, string, string][] = [
  ["consulting", "statement", "Consulting-1"],
  ["consulting", "stat-hero", "Consulting-2"],
  ["consulting", "one-evidence", "Consulting-3"],
  ["insight", "statement", "Insight-1"],
  ["insight", "stat-hero", "Insight-2"],
  ["insight", "pull-quote", "Insight-3"],
  ["tech", "stat-hero", "Tech-1"],
  ["tech", "statement", "Tech-2"],
  ["tech", "one-evidence", "Tech-3"],
  ["heritage", "pull-quote", "Heritage-1"],
  ["heritage", "statement", "Heritage-2"],
  ["heritage", "stat-hero", "Heritage-3"],
  ["vermilion", "statement", "Vermilion-1"],
  ["vermilion", "stat-hero", "Vermilion-2"],
  ["vermilion", "one-evidence", "Vermilion-3"],
  ["journal", "pull-quote", "Journal-1"],
  ["journal", "stat-hero", "Journal-2"],
  ["journal", "statement", "Journal-3"],
  ["campaign", "statement", "Campaign-1"],
  ["campaign", "stat-hero", "Campaign-2"],
  ["campaign", "one-evidence", "Campaign-3"],
  ["arena", "stat-hero", "Arena-1"],
  ["arena", "statement", "Arena-2"],
  ["arena", "one-evidence", "Arena-3"],
  ["terra", "statement", "Terra-1"],
  ["terra", "stat-hero", "Terra-2"],
  ["terra", "one-evidence", "Terra-3"],
  ["academic", "pull-quote", "Academic-1"],
  ["academic", "stat-hero", "Academic-2"],
  ["academic", "statement", "Academic-3"],
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
