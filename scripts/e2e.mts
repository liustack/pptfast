/** End-to-end: CLI renders the examples, output must be a well-formed pptx.
 *  Requires `pnpm build` first (wired via the `e2e` npm script). */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

const OUT = ".e2e-out"
mkdirSync(OUT, { recursive: true })

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" })
}

/** Runs `cmd args`, asserting a non-zero exit (CLI `fail()` — `process.exit(1)`
 *  after printing to stderr), and returns stderr. Throws when the command
 *  unexpectedly succeeds, or when it fails for a reason other than a normal
 *  CLI exit (e.g. the binary itself could not be spawned — no `.status`). */
function shExpectFail(cmd: string, args: string[]): string {
  try {
    execFileSync(cmd, args, { encoding: "utf8" })
  } catch (e) {
    const { status, stderr } = e as { status?: number; stderr?: string }
    if (status === undefined) throw e
    return stderr ?? ""
  }
  throw new Error(`e2e: expected "${cmd} ${args.join(" ")}" to fail, but it succeeded`)
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

// 6) deck project directory leg (W5 task 6): a temp plan + pages directory,
//    left with one unfilled page, must assemble as a placeholder, refuse a
//    plain render (the draft gate), render fine under --draft with the
//    placeholder as a real slide, then render normally once the page is filled.
console.log("--- deck project directory leg ---")
const deckDir = join(OUT, "deck-dir-demo")
// Start from a clean slate every run — a leftover pages/p-roadmap.json from a
// previous successful run would falsify the "starts as a placeholder" setup.
rmSync(deckDir, { recursive: true, force: true })
mkdirSync(join(deckDir, "pages"), { recursive: true })

const deckPlan = {
  version: "1",
  scenario: "boardroom-report",
  theme: "consulting",
  filename: "pptfast-e2e-deck-dir",
  pages: [
    { id: "p-cover", type: "cover", heading: "pptfast Deck Directory Demo" },
    { id: "p-goals", type: "content", heading: "Design goals" },
    { id: "p-roadmap", type: "content", heading: "Roadmap ahead" },
    { id: "p-ending", type: "ending", heading: "Thanks" },
  ],
}
writeFileSync(join(deckDir, "deck.plan.json"), JSON.stringify(deckPlan))
writeFileSync(join(deckDir, "pages", "p-cover.json"), JSON.stringify({}))
writeFileSync(
  join(deckDir, "pages", "p-goals.json"),
  JSON.stringify({
    // Short items on purpose — this plan's scenario ("boardroom-report")
    // resolves to "presentation" delivery, the tightest bullets budget
    // (DELIVERY_BUDGETS.presentation.bullets.maxUnitsPerItem, src/scenario/index.ts).
    components: [
      {
        type: "bullets",
        items: ["Every shape stays editable", "Design tokens, not freeform drawing"],
      },
    ],
  }),
)
writeFileSync(join(deckDir, "pages", "p-ending.json"), JSON.stringify({}))
// pages/p-roadmap.json is deliberately never written yet — that plan page
// has no matching page file, so it must assemble as a placeholder.

console.log(sh("node", ["dist/cli.js", "plan", "validate", join(deckDir, "deck.plan.json")]))

const assembleOut = sh("node", ["dist/cli.js", "assemble", deckDir])
console.log(assembleOut)
if (!assembleOut.includes("(4 slides, 1 placeholder)")) {
  throw new Error(`e2e: deck-dir leg — expected assemble to report exactly 1 placeholder, got: ${assembleOut}`)
}
if (!existsSync(join(deckDir, "deck.json"))) {
  throw new Error("e2e: deck-dir leg — assemble did not write deck.json")
}

// render without --draft must refuse: one plan page (p-roadmap) is still an
// unfilled placeholder.
const draftGateStderr = shExpectFail("node", [
  "dist/cli.js",
  "render",
  deckDir,
  "-o",
  join(OUT, "deck-dir-should-not-exist.pptx"),
])
if (!/placeholder/.test(draftGateStderr) || !/--draft/.test(draftGateStderr) || !/p-roadmap/.test(draftGateStderr)) {
  throw new Error(`e2e: deck-dir leg — expected the draft-gate error naming p-roadmap, got: ${draftGateStderr}`)
}
console.log("deck-dir draft-gate leg OK (render without --draft refused)")

// render --draft must succeed, with the placeholder rendered as a real slide
// (its plan heading present, not skipped).
const draftPptxPath = join(OUT, "deck-dir-draft.pptx")
console.log(sh("node", ["dist/cli.js", "render", deckDir, "-o", draftPptxPath, "--draft"]))
const draftZip = await JSZip.loadAsync(readFileSync(draftPptxPath))
for (const f of ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml", "ppt/slides/slide4.xml"]) {
  if (!draftZip.file(f)) throw new Error(`e2e: deck-dir leg — --draft render missing ${f}`)
}
const draftSlide3 = await draftZip.file("ppt/slides/slide3.xml")!.async("string")
if (!draftSlide3.includes("Roadmap ahead")) {
  throw new Error("e2e: deck-dir leg — placeholder page heading not found in slide3.xml under --draft")
}
console.log("deck-dir --draft leg OK (placeholder page rendered as a real slide)")

// Fill in the missing page, re-assemble (0 placeholders now), then render
// normally — no --draft needed once every page is filled.
writeFileSync(
  join(deckDir, "pages", "p-roadmap.json"),
  JSON.stringify({
    arrangement: "kpi_focus",
    components: [
      {
        type: "kpi_cards",
        items: [
          { value: "13", label: "built-in themes" },
          { value: "19", label: "semantic component types" },
        ],
      },
    ],
  }),
)
const reassembleOut = sh("node", ["dist/cli.js", "assemble", deckDir])
console.log(reassembleOut)
if (!reassembleOut.includes("(4 slides, 0 placeholders)")) {
  throw new Error(`e2e: deck-dir leg — expected 0 placeholders after filling the page, got: ${reassembleOut}`)
}

const finalPptxPath = join(OUT, "deck-dir-final.pptx")
console.log(sh("node", ["dist/cli.js", "render", deckDir, "-o", finalPptxPath]))
const finalZip = await JSZip.loadAsync(readFileSync(finalPptxPath))
const finalSlide3 = await finalZip.file("ppt/slides/slide3.xml")!.async("string")
if (!finalSlide3.includes("13") || !finalSlide3.includes("built-in themes")) {
  throw new Error("e2e: deck-dir leg — filled page content not found in slide3.xml after the normal render")
}
console.log("deck-dir leg OK (assemble + draft gate + fill + normal render)")

console.log("e2e OK")
