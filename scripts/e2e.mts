/** End-to-end: CLI renders the examples, output must be a well-formed pptx.
 *  Requires `pnpm build` first (wired via the `e2e` npm script). */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

const OUT = ".e2e-out"
mkdirSync(OUT, { recursive: true })

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" })
}

// 1) render via the built CLI
const pptxPath = join(OUT, "basic.pptx")
console.log(sh("node", ["dist/cli.js", "render", "examples/basic.json", "-o", pptxPath]))

// 2) structural assertions
const zip = await JSZip.loadAsync(readFileSync(pptxPath))
const mustExist = [
  "ppt/presentation.xml",
  "ppt/slides/slide1.xml",
  "ppt/slides/slide5.xml",
]
for (const f of mustExist) {
  if (!zip.file(f)) throw new Error(`e2e: missing ${f} in ${pptxPath}`)
}
const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string")
if (!slide1.includes("pptfast")) throw new Error("e2e: cover heading text not found in slide1.xml")

// 3) preview command
console.log(sh("node", ["dist/cli.js", "preview", "examples/basic.json", "-o", join(OUT, "svgs")]))

// 3b) --style override must reach the DrawingML (hex appears uppercase, no "#")
const stylePath = join(OUT, "style.json")
writeFileSync(stylePath, JSON.stringify({ colors: { primary: "#0B5FFF" } }))
const brandedPath = join(OUT, "branded.pptx")
console.log(
  sh("node", ["dist/cli.js", "render", "examples/basic.json", "-o", brandedPath, "--style", stylePath]),
)
const brandedZip = await JSZip.loadAsync(readFileSync(brandedPath))
const brandedSlideXml = (
  await Promise.all(
    Object.keys(brandedZip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .map((k) => brandedZip.file(k)!.async("string")),
  )
).join("")
if (!brandedSlideXml.includes("0B5FFF"))
  throw new Error("e2e: --style primary color not found in any branded slide XML")
console.log("style override leg OK (--style color reached DrawingML)")

// 4) optional visual gate: LibreOffice PDF conversion (skipped when unavailable)
try {
  sh("soffice", ["--headless", "--convert-to", "pdf", "--outdir", OUT, pptxPath])
  if (!existsSync(join(OUT, "basic.pdf"))) throw new Error("no pdf produced")
  console.log("soffice PDF conversion OK")
} catch {
  console.log("soffice unavailable or failed — visual gate skipped (install LibreOffice to enable)")
}

// 5) webp asset regression leg — locks the packaged bin's sharp recode path.
//    dist/cli.js dynamic-imports "sharp" at runtime (tsup marks it external); this
//    exercises that exact path against the built CLI, not just the vitest suite.
let sharpMod: typeof import("sharp") | undefined
try {
  sharpMod = (await import("sharp")).default as unknown as typeof import("sharp")
} catch {
  console.log("sharp unavailable — webp asset leg skipped")
}
if (sharpMod) {
  // 1x1 red PNG, recoded to webp so the CLI must hit the sharp recode path
  // (png/jpeg/gif pass through untouched — webp is outside that fast path).
  const PNG_1PX = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  )
  const webpPath = join(OUT, "smoke.webp")
  await sharpMod(PNG_1PX).webp().toFile(webpPath)

  const webpDeck = {
    version: "3",
    filename: "pptfast-webp-smoke",
    theme: { id: "consulting" },
    assets: { images: { smoke: { src: "smoke.webp" } } },
    slides: [
      { type: "cover", heading: "webp smoke" },
      { type: "content", heading: "Body", components: [{ type: "image", asset_id: "smoke" }] },
    ],
  }
  const webpDeckPath = join(OUT, "webp-deck.json")
  writeFileSync(webpDeckPath, JSON.stringify(webpDeck))

  const webpPptxPath = join(OUT, "webp.pptx")
  console.log(sh("node", ["dist/cli.js", "render", webpDeckPath, "-o", webpPptxPath]))

  const webpZip = await JSZip.loadAsync(readFileSync(webpPptxPath))
  for (const f of ["ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]) {
    if (!webpZip.file(f)) throw new Error(`e2e: webp leg produced malformed pptx — missing ${f}`)
  }
  // The renderer silently draws an "image missing" placeholder for unresolved
  // assets instead of failing — so the zip-membership checks above pass even
  // if resolveLocalAssets/recodeWithSharp silently degrades to a no-op. Assert
  // the image was actually embedded: a media part exists, and the slide that
  // holds the image component (slide2 — see webpDeck above) references it via
  // r:embed, not just a decorative shape.
  if (!Object.keys(webpZip.files).some((k) => k.startsWith("ppt/media/"))) {
    throw new Error("e2e: webp leg — no ppt/media/* part found, image was not embedded")
  }
  const webpSlide2 = await webpZip.file("ppt/slides/slide2.xml")!.async("string")
  if (!webpSlide2.includes("r:embed")) {
    throw new Error("e2e: webp leg — slide2.xml has no r:embed reference, image was not embedded")
  }
  console.log("webp asset leg OK (sharp recode path exercised)")
}

console.log("e2e OK")
