/** End-to-end: CLI renders the examples, output must be a well-formed pptx.
 *  Requires `pnpm build` first (wired via the `e2e` npm script). */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import JSZip from "jszip"
import type * as Sharp from "sharp"

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

/** Runs `cmd args` and returns its exit status alongside stdout/stderr,
 *  regardless of whether it succeeded — unlike `sh` (throws on any failure)
 *  and `shExpectFail` (only ever returns stderr, and requires failure). The
 *  audit leg below needs this because `pptfast audit`'s report — clean or
 *  with findings — is the command's normal output on stdout; the exit code
 *  alone is the pass/fail signal (same convention as eslint/tsc), unlike a
 *  `fail()`-routed CLI error (console.error → stderr → non-zero exit). */
function shCapture(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, { encoding: "utf8" })
    return { status: 0, stdout, stderr: "" }
  } catch (e) {
    const { status, stdout, stderr } = e as { status?: number; stdout?: string; stderr?: string }
    if (status === undefined) throw e
    return { status, stdout: stdout ?? "", stderr: stderr ?? "" }
  }
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

// 2a) a:ea font-slot leg (a:ea follow-up task): examples/basic.json's
//     consulting theme leads with Georgia (zero CJK glyphs), so every
//     exported run's <a:ea> must be corrected to Microsoft YaHei by
//     applyEaFontFaces (src/pptx/pptx-ea-fonts.ts) — asserted here against
//     the *built* CLI binary's real output, not a vitest mock. Unconditional
//     per the feature's own design (src/svg/fonts.ts's eaFontFaceFor doc
//     comment): this holds even though basic.json's own text is all-English,
//     since the declaration doesn't depend on the run's content.
if (!/<a:latin typeface="Georgia"[^>]*\/><a:ea typeface="Microsoft YaHei"/.test(slide1)) {
  throw new Error("e2e: slide1.xml's Georgia-declared run is missing a corrected <a:ea typeface=\"Microsoft YaHei\">")
}
if (slide1.includes('<a:ea typeface="Georgia"')) {
  throw new Error("e2e: slide1.xml still carries an uncorrected <a:ea typeface=\"Georgia\"> (zero CJK glyphs)")
}
console.log("a:ea font-slot leg OK (Georgia latin run carries a corrected Microsoft YaHei ea slot)")

// 2b) package-audit leg (package-audit wave, task 1, spec §4.4/§10.4):
//     generatePptxBlob's own hard gate has no skip switch — every render in
//     this whole script (basic/branded/webp/deck-dir/structures, below)
//     already implicitly proves the gate accepted the package, since a
//     violation would have made the CLI exit non-zero with a PptfastError
//     instead of ever writing a file. This adds direct e2e-level evidence
//     from the *built* CLI binary's own output (src/pptx/package-audit.test.ts
//     already covers the red/broken side at the vitest level, including
//     against real generatePptxBlob renders) that the invariants the gate
//     enforces genuinely hold end to end: presentation.xml's slide list and
//     the package's actual slide parts agree, and no slide has a duplicate
//     shape id.
console.log("--- package-audit leg ---")
const presentationXml = await zip.file("ppt/presentation.xml")!.async("string")
const sldIdCount = (presentationXml.match(/<p:sldId\b/g) ?? []).length
const slideKeys = Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
if (sldIdCount !== slideKeys.length) {
  throw new Error(
    `e2e: package-audit leg — presentation.xml lists ${sldIdCount} slide(s) but ${pptxPath} has ${slideKeys.length} slide part(s) (the gate should have refused this before render even wrote the file)`,
  )
}
for (const slideKey of slideKeys) {
  const slideXml = await zip.file(slideKey)!.async("string")
  const ids = Array.from(slideXml.matchAll(/<p:cNvPr id="(\d+)"/g)).map((m) => m[1])
  if (new Set(ids).size !== ids.length) {
    throw new Error(`e2e: package-audit leg — ${slideKey} has a duplicate p:cNvPr id (the gate should have refused this)`)
  }
}
console.log(
  `package-audit leg OK (${pptxPath}: ${sldIdCount} slide(s) three-way consistent, no duplicate shape ids — ` +
    "the hard gate has no skip switch, so every render in this script already passed it)",
)

// 3) preview command
console.log(sh("node", ["dist/cli.js", "preview", "examples/basic.json", "-o", join(OUT, "svgs")]))

// 3b) preview --html (W7 task 2, spec §7 workflow ⑤): the self-contained
//     preview.html bundle must exist, embed every one of basic.json's 5
//     slides' SVGs exactly once, carry the keyboard-nav JS, and stay
//     self-contained — no http(s) reference anywhere except the SVG
//     namespace URI. Same filtered assertion as the unit-level check
//     (`src/cli/preview-html.test.ts`, "self-containment: no http(s)
//     reference anywhere except known SVG/XML namespace URIs") — basic.json
//     has no assets, so nothing here can fall into preview-html.ts's known
//     remote-asset limitation.
const htmlOutDir = join(OUT, "svgs-html")
console.log(
  sh("node", ["dist/cli.js", "preview", "examples/basic.json", "-o", htmlOutDir, "--html"]),
)
const previewHtmlPath = join(htmlOutDir, "preview.html")
if (!existsSync(previewHtmlPath)) throw new Error(`e2e: preview --html leg — ${previewHtmlPath} was not written`)
const previewHtml = readFileSync(previewHtmlPath, "utf8")
const svgCount = previewHtml.match(/<svg\b/g)?.length ?? 0
if (svgCount !== 5) {
  throw new Error(`e2e: preview --html leg — expected exactly 5 embedded <svg, got ${svgCount}`)
}
if (!previewHtml.includes("ArrowLeft") || !previewHtml.includes("ArrowRight")) {
  throw new Error("e2e: preview --html leg — keyboard-nav JS marker (ArrowLeft/ArrowRight) not found")
}
const KNOWN_NAMESPACE_URIS = new Set(["http://www.w3.org/2000/svg"])
const httpMatches = previewHtml.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
const unexpectedHttp = httpMatches.filter((m) => !KNOWN_NAMESPACE_URIS.has(m))
if (unexpectedHttp.length > 0) {
  throw new Error(`e2e: preview --html leg — unexpected http(s) reference(s) in preview.html: ${unexpectedHttp.join(", ")}`)
}
if (httpMatches.length === 0) {
  throw new Error("e2e: preview --html leg — expected at least the SVG namespace URI, found no http(s) substring at all")
}
console.log("preview --html leg OK (self-contained: 5 embedded svgs, keyboard-nav JS, no stray http(s) reference)")

// 3c) --style override must reach the DrawingML (hex appears uppercase, no "#")
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
let sharpMod: typeof Sharp.default | undefined
try {
  sharpMod = (await import("sharp")).default as unknown as typeof Sharp.default
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
    version: "4",
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

const deckSpec = {
  version: "1",
  narrative: "boardroom-report",
  theme: "consulting",
  filename: "pptfast-e2e-deck-dir",
  pages: [
    { id: "p-cover", type: "cover", heading: "pptfast Deck Directory Demo" },
    { id: "p-goals", type: "content", heading: "Design goals" },
    { id: "p-roadmap", type: "content", heading: "Roadmap ahead" },
    { id: "p-ending", type: "ending", heading: "Thanks" },
  ],
}
writeFileSync(join(deckDir, "deck.spec.json"), JSON.stringify(deckSpec))
writeFileSync(join(deckDir, "pages", "p-cover.json"), JSON.stringify({}))
writeFileSync(
  join(deckDir, "pages", "p-goals.json"),
  JSON.stringify({
    // Short items on purpose — this spec's narrative ("boardroom-report")
    // resolves to "spacious" pacing, the tightest bullets budget
    // (PACING_BUDGETS.spacious.bullets.maxUnitsPerItem, src/scenario/index.ts).
    components: [
      {
        type: "bullets",
        items: ["Every shape stays editable", "Design tokens, not freeform drawing"],
      },
    ],
    // speaker notes (notes+preview wave, task 1) — content, not locked by the
    // spec, exported as native PowerPoint speaker notes, asserted against
    // the final render's notesSlide2.xml below.
    notes: "Emphasize that every shape stays editable in PowerPoint, not a flattened image.",
  }),
)
writeFileSync(join(deckDir, "pages", "p-ending.json"), JSON.stringify({}))
// pages/p-roadmap.json is deliberately never written yet — that spec page
// has no matching page file, so it must assemble as a placeholder.

console.log(sh("node", ["dist/cli.js", "spec", "validate", join(deckDir, "deck.spec.json")]))

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
          { value: "28", label: "semantic component types" },
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

// p-goals is slide 2 (cover, goals, roadmap, ending) and set `notes` above —
// must reach the exported .pptx as native speaker notes text, never onto the
// slide's own canvas XML.
if (!finalZip.file("ppt/notesSlides/notesSlide2.xml")) {
  throw new Error("e2e: deck-dir leg — missing ppt/notesSlides/notesSlide2.xml in the final render")
}
const finalNotes2 = await finalZip.file("ppt/notesSlides/notesSlide2.xml")!.async("string")
if (!finalNotes2.includes("Emphasize that every shape stays editable")) {
  throw new Error(`e2e: deck-dir leg — expected p-goals's notes text in notesSlide2.xml, got: ${finalNotes2}`)
}
const finalSlide2 = await finalZip.file("ppt/slides/slide2.xml")!.async("string")
if (finalSlide2.includes("Emphasize that every shape stays editable")) {
  throw new Error("e2e: deck-dir leg — notes text leaked onto slide2.xml's own canvas, must stay speaker-notes-only")
}
console.log("deck-dir speaker-notes leg OK (notesSlide2.xml carries p-goals's notes text, slide2.xml canvas does not)")

// 6b) migrate leg (spec §9.1/§9.2/§9.3, vocabulary-v4 rename, task 2):
//     `pptfast migrate` for both accepted input shapes — a pre-rename
//     deck.plan.json project directory, and a v3 IR file — plus the
//     "never overwrite" and dual-file hard-error contracts.
console.log("--- migrate leg ---")

// (a) deck-dir leg: old plan dir → migrate → spec validate → assemble green.
const migrateDeckDir = join(OUT, "migrate-deck-dir-demo")
rmSync(migrateDeckDir, { recursive: true, force: true })
mkdirSync(join(migrateDeckDir, "pages"), { recursive: true })
const legacyDeckPlan = {
  version: "1",
  scenario: "boardroom-report",
  theme: "consulting",
  filename: "pptfast-e2e-migrate-deck-dir",
  pages: [
    { id: "p-cover", type: "cover", heading: "Migrate Demo" },
    { id: "p-a", type: "content", heading: "Segment A", rhythm: "anchor" },
    { id: "p-b", type: "content", heading: "Segment B" },
    { id: "p-ending", type: "ending", heading: "Thanks" },
  ],
}
writeFileSync(join(migrateDeckDir, "deck.plan.json"), JSON.stringify(legacyDeckPlan))
writeFileSync(join(migrateDeckDir, "pages", "p-cover.json"), JSON.stringify({}))
writeFileSync(
  join(migrateDeckDir, "pages", "p-a.json"),
  JSON.stringify({ components: [{ type: "paragraph", text: "Segment A detail" }] }),
)
writeFileSync(
  join(migrateDeckDir, "pages", "p-b.json"),
  JSON.stringify({ components: [{ type: "paragraph", text: "Segment B detail" }] }),
)
writeFileSync(join(migrateDeckDir, "pages", "p-ending.json"), JSON.stringify({}))

const migrateDeckDirOut = sh("node", [
  "dist/cli.js",
  "migrate",
  migrateDeckDir,
  "-o",
  migrateDeckDir,
])
console.log(migrateDeckDirOut)
const migratedSpecPath = join(migrateDeckDir, "deck.spec.json")
if (!existsSync(migratedSpecPath)) {
  throw new Error("e2e: migrate leg — deck.spec.json was not written alongside deck.plan.json")
}
const migratedSpec = JSON.parse(readFileSync(migratedSpecPath, "utf8")) as Record<string, unknown>
if (migratedSpec.scenario !== undefined || migratedSpec.narrative !== "boardroom-report") {
  throw new Error(`e2e: migrate leg — expected narrative: "boardroom-report", no scenario field, got: ${JSON.stringify(migratedSpec)}`)
}
const migratedPageA = (migratedSpec.pages as Array<Record<string, unknown>>).find((p) => p.id === "p-a")
if (migratedPageA?.rhythm !== undefined || migratedPageA?.beat !== "anchor") {
  throw new Error(`e2e: migrate leg — expected p-a's rhythm field renamed to beat: "anchor", got: ${JSON.stringify(migratedPageA)}`)
}
// The pre-rename deck.plan.json must survive untouched (never overwritten,
// never deleted by migrate itself) — the caller deletes it once satisfied.
if (!existsSync(join(migrateDeckDir, "deck.plan.json"))) {
  throw new Error("e2e: migrate leg — migrate must never delete the source deck.plan.json")
}
console.log("migrate deck-dir leg OK (deck.spec.json written, narrative/beat fields renamed, source file untouched)")

// Dual-file hard error (spec §9.2): both files present must refuse to guess.
const dualFileStderr = shExpectFail("node", ["dist/cli.js", "assemble", migrateDeckDir])
if (!/deck\.plan\.json/.test(dualFileStderr) || !/deck\.spec\.json/.test(dualFileStderr)) {
  throw new Error(`e2e: migrate leg — expected the dual-file hard error to name both files, got: ${dualFileStderr}`)
}
console.log("migrate dual-file hard-error leg OK (assemble refuses while both files are present)")

// Never-overwrite: re-running migrate at the same -o must refuse, not clobber.
const migrateOverwriteStderr = shExpectFail("node", ["dist/cli.js", "migrate", migrateDeckDir, "-o", migrateDeckDir])
if (!/already exists/.test(migrateOverwriteStderr)) {
  throw new Error(`e2e: migrate leg — expected a re-run to refuse to overwrite deck.spec.json, got: ${migrateOverwriteStderr}`)
}

// Delete the legacy file (the documented next step) — spec validate and
// assemble must both go green on the migrated deck.spec.json alone.
rmSync(join(migrateDeckDir, "deck.plan.json"))
console.log(sh("node", ["dist/cli.js", "spec", "validate", migratedSpecPath]))
const migrateAssembleOut = sh("node", ["dist/cli.js", "assemble", migrateDeckDir])
console.log(migrateAssembleOut)
if (!migrateAssembleOut.includes("(4 slides, 0 placeholders)")) {
  throw new Error(`e2e: migrate leg — expected a clean 4-slide, 0-placeholder assemble, got: ${migrateAssembleOut}`)
}
console.log("migrate deck-dir leg OK end to end (spec validate + assemble green after deleting the legacy file)")

// (b) v3 IR file leg: mode "narrative" → strategy "storytelling", delivery
//     "text" → pacing "dense" — the exact spec §9.1 value mapping, not just
//     a field rename.
const v3Ir = {
  version: "3",
  filename: "pptfast-e2e-migrate-v3",
  scenario: { mode: "narrative", delivery: "text", audience: "public" },
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Migrate v3 Demo" },
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "migrated from v3" }] },
  ],
}
const v3IrPath = join(OUT, "migrate-v3-input.json")
writeFileSync(v3IrPath, JSON.stringify(v3Ir))
const v4OutPath = join(OUT, "migrate-v3-output.json")
// Clean slate — a leftover output file from a previous run would falsify
// both this call (should succeed on a fresh target) and the never-overwrite
// check just below it (should fail only because *this run* just wrote it).
rmSync(v4OutPath, { force: true })
console.log(sh("node", ["dist/cli.js", "migrate", v3IrPath, "-o", v4OutPath]))
const migratedV4 = JSON.parse(readFileSync(v4OutPath, "utf8")) as Record<string, unknown>
if (migratedV4.version !== "4") {
  throw new Error(`e2e: migrate leg — expected version "4" in the migrated v3→v4 output, got: ${JSON.stringify(migratedV4.version)}`)
}
const migratedNarrative = migratedV4.narrative as Record<string, unknown> | undefined
if (migratedNarrative?.strategy !== "storytelling" || migratedNarrative?.pacing !== "dense") {
  throw new Error(`e2e: migrate leg — expected strategy "storytelling" / pacing "dense", got: ${JSON.stringify(migratedNarrative)}`)
}
console.log(sh("node", ["dist/cli.js", "validate", v4OutPath]))
// Never-overwrite for the single-file leg too.
const migrateV3OverwriteStderr = shExpectFail("node", ["dist/cli.js", "migrate", v3IrPath, "-o", v4OutPath])
if (!/already exists/.test(migrateV3OverwriteStderr)) {
  throw new Error(`e2e: migrate leg — expected a re-run to refuse to overwrite the v4 output file, got: ${migrateV3OverwriteStderr}`)
}
console.log("migrate v3-IR-file leg OK (version + mode/delivery value mapping, validates as v4, no-overwrite enforced)")

// (c) v2 is explicitly not accepted (spec §15.3: "pptfast migrate 只支持
//     v3→v4，不接 v2").
const v2Path = join(OUT, "migrate-v2-input.json")
writeFileSync(v2Path, JSON.stringify({ version: "2", slides: [] }))
const migrateV2Stderr = shExpectFail("node", ["dist/cli.js", "migrate", v2Path, "-o", join(OUT, "migrate-v2-output.json")])
if (!/v2/.test(migrateV2Stderr)) {
  throw new Error(`e2e: migrate leg — expected the v2-rejection message to mention v2, got: ${migrateV2Stderr}`)
}
console.log("migrate v2-rejection leg OK (pptfast migrate refuses v2 input)")

// 6c) vocabulary-v4 old-command hard-fail leg (spec §8.2): no long-lived
//     aliases — each removed command must fail and name the one new command.
console.log("--- old-command hard-fail leg ---")
const scenariosStderr = shExpectFail("node", ["dist/cli.js", "scenarios"])
if (!/pptfast narratives/.test(scenariosStderr)) {
  throw new Error(`e2e: old-command leg — expected \`pptfast scenarios\` to point at \`pptfast narratives\`, got: ${scenariosStderr}`)
}
const schemaPlanStderr = shExpectFail("node", ["dist/cli.js", "schema", "--plan"])
if (!/pptfast schema --spec/.test(schemaPlanStderr)) {
  throw new Error(`e2e: old-command leg — expected \`pptfast schema --plan\` to point at \`pptfast schema --spec\`, got: ${schemaPlanStderr}`)
}
const planValidateStderr = shExpectFail("node", ["dist/cli.js", "plan", "validate", migratedSpecPath])
if (!/pptfast spec validate/.test(planValidateStderr)) {
  throw new Error(`e2e: old-command leg — expected \`pptfast plan validate\` to point at \`pptfast spec validate\`, got: ${planValidateStderr}`)
}
console.log("old-command hard-fail leg OK (scenarios / schema --plan / plan validate all point at their replacements)")

// 7) audit leg (W6 task 2, spec §7 workflow ④): a clean deck must exit 0; a
//    deliberately near-background text color (theme.style override,
//    validate-legal — same fixture shape as deck-audit.test.ts's own
//    "low-contrast via a real style-token override" case) must exit 1 with a
//    low-contrast finding in its output, in both human and --json mode.
//    Bench-driven fix round, defect E: the same deliberately-degraded fixture
//    also carries a page that overflows a single row_cards component (6
//    schema-legal items, each with substantial title/text/sub — measured
//    directly against real widths before writing this fixture: a full-width
//    single column needs ~676px for 6 items, well past any real content
//    rect's ~380-471px range, see docs/concepts.md's capacity section) to
//    trip `content-dropped` via row-cards.tsx's own item-level "+N more"
//    marker, and a page with a verdict_banner carrying far more text than its
//    fixed 18px/2-line budget can hold to trip `content-truncated`.
console.log("--- audit leg ---")

const cleanAudit = shCapture("node", ["dist/cli.js", "audit", "examples/basic.json"])
console.log(cleanAudit.stdout)
if (cleanAudit.status !== 0) {
  throw new Error(
    `e2e: audit leg — expected examples/basic.json to audit clean (exit 0), got exit ${cleanAudit.status}`,
  )
}
if (!/audited 5 pages, 0 skipped, 0 findings/.test(cleanAudit.stdout)) {
  throw new Error(`e2e: audit leg — expected a clean summary line for examples/basic.json, got: ${cleanAudit.stdout}`)
}
console.log("audit clean-deck leg OK (examples/basic.json exits 0)")

// Realistic-length CJK content (not adversarial stress text) — same order of
// magnitude as docs/concepts.md's capacity-section measurement, so this
// fixture reproduces the benchmark's actual "row_cards drops items" shape
// rather than an artificially extreme one.
const ROW_CARDS_TEXT = "本季度通过精细化运营和渠道下沉实现了显著的增长，客户留存率同步提升"
const VERDICT_LONG_TEXT =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明".repeat(6)

const lowContrastDeck = {
  version: "4",
  filename: "pptfast-e2e-audit-low-contrast",
  // Near consulting's own colors.bg (#F7F7F2) — validate-legal (theme.style
  // is a schema-open deep-partial override), renderer-level unreadable.
  theme: { id: "consulting", style: { colors: { text: "#F5F5F0" } } },
  slides: [
    { type: "cover", heading: "Audit Fixture" },
    {
      type: "content",
      id: "p-body",
      heading: "readable heading",
      components: [{ type: "paragraph", text: "some body copy that should read as low-contrast" }],
    },
    {
      type: "content",
      id: "p-dropped",
      heading: "row_cards over capacity",
      components: [
        {
          type: "row_cards",
          items: [1, 2, 3, 4, 5, 6].map((n) => ({
            title: `事项标题条目编号 ${n}`,
            text: ROW_CARDS_TEXT,
            sub: "补充说明文字用于撑高卡片高度",
          })),
        },
      ],
    },
    {
      type: "content",
      id: "p-truncated",
      heading: "verdict_banner over budget",
      components: [{ type: "verdict_banner", tone: "positive", text: VERDICT_LONG_TEXT }],
    },
  ],
}
const lowContrastPath = join(OUT, "audit-low-contrast.json")
writeFileSync(lowContrastPath, JSON.stringify(lowContrastDeck))

const findingsAudit = shCapture("node", ["dist/cli.js", "audit", lowContrastPath])
console.log(findingsAudit.stdout)
if (findingsAudit.status !== 1) {
  throw new Error(`e2e: audit leg — expected the low-contrast fixture to exit 1, got exit ${findingsAudit.status}`)
}
if (!/\[low-contrast\]/.test(findingsAudit.stdout) || !/page 2 \(p-body\)/.test(findingsAudit.stdout)) {
  throw new Error(
    `e2e: audit leg — expected a low-contrast finding naming page 2 (p-body), got: ${findingsAudit.stdout}`,
  )
}
console.log("audit low-contrast-fixture leg OK (exit 1, finding present)")

// Bench-driven fix round, defect E: same fixture, same exit-1 report — a
// 6-item row_cards over capacity must surface as `content-dropped` on
// page 3 (p-dropped), and verdict_banner's over-budget text must surface as
// `content-truncated` on page 4 (p-truncated).
if (!/\[content-dropped\]/.test(findingsAudit.stdout) || !/page 3 \(p-dropped\)/.test(findingsAudit.stdout)) {
  throw new Error(
    `e2e: audit leg — expected a content-dropped finding naming page 3 (p-dropped), got: ${findingsAudit.stdout}`,
  )
}
if (!/\[content-truncated\]/.test(findingsAudit.stdout) || !/page 4 \(p-truncated\)/.test(findingsAudit.stdout)) {
  throw new Error(
    `e2e: audit leg — expected a content-truncated finding naming page 4 (p-truncated), got: ${findingsAudit.stdout}`,
  )
}
console.log("audit content-dropped/content-truncated leg OK (exit 1, both new advisory codes present)")

const jsonAudit = shCapture("node", ["dist/cli.js", "audit", lowContrastPath, "--json"])
if (jsonAudit.status !== 1) {
  throw new Error(`e2e: audit leg — expected --json mode to also exit 1, got exit ${jsonAudit.status}`)
}
const jsonReport = JSON.parse(jsonAudit.stdout) as { findings: Array<{ code: string }> }
if (!jsonReport.findings.some((f) => f.code === "low-contrast")) {
  throw new Error(`e2e: audit leg — expected --json output to include a low-contrast finding, got: ${jsonAudit.stdout}`)
}
if (!jsonReport.findings.some((f) => f.code === "content-dropped")) {
  throw new Error(`e2e: audit leg — expected --json output to include a content-dropped finding, got: ${jsonAudit.stdout}`)
}
if (!jsonReport.findings.some((f) => f.code === "content-truncated")) {
  throw new Error(`e2e: audit leg — expected --json output to include a content-truncated finding, got: ${jsonAudit.stdout}`)
}
console.log("audit --json leg OK (machine-readable AuditReport, exit 1, low-contrast/content-dropped/content-truncated codes present)")

// 7b) --pixels leg (audit-v2 phase B, spec §4.3/§11.7): the one CLI surface
//     genuinely worth an e2e check for this feature — it exercises real
//     Sharp through the *built* dist/cli.js binary (installNodePlatform()'s
//     actual runtime dependency resolution), not vitest's in-process call.
//     examples/basic.json has no asset backgrounds, so this only proves the
//     pass runs and completes cleanly, not that it can find something —
//     src/svg/audit/pixel-audit.test.ts's own real-Sharp suite already
//     covers the sampling/threshold logic end to end.
console.log("--- audit --pixels leg ---")

const pixelsAudit = shCapture("node", ["dist/cli.js", "audit", "examples/basic.json", "--pixels"])
if (pixelsAudit.status !== 0) {
  throw new Error(`e2e: audit --pixels leg — expected examples/basic.json to still audit clean (exit 0), got exit ${pixelsAudit.status}: ${pixelsAudit.stdout}`)
}
if (!/pixel-contrast check: completed/.test(pixelsAudit.stdout)) {
  throw new Error(`e2e: audit --pixels leg — expected the human summary to note the pixel-contrast check ran, got: ${pixelsAudit.stdout}`)
}

const pixelsJsonAudit = shCapture("node", ["dist/cli.js", "audit", "examples/basic.json", "--pixels", "--json"])
if (pixelsJsonAudit.status !== 0) {
  throw new Error(`e2e: audit --pixels leg — expected --pixels --json to also exit 0, got exit ${pixelsJsonAudit.status}`)
}
const pixelsReport = JSON.parse(pixelsJsonAudit.stdout) as { checks: { svg: string; pixels: string } }
if (pixelsReport.checks.pixels !== "completed") {
  throw new Error(`e2e: audit --pixels leg — expected checks.pixels "completed", got: ${JSON.stringify(pixelsReport.checks)}`)
}
console.log("audit --pixels leg OK (real Sharp through dist/cli.js, checks.pixels completed, human summary notes it)")

// 8) structure-components leg (structure-components wave 1 task 3, extended
//    by wave 2 tasks 1-2): a deck exercising all seven full-body components
//    across both waves (swot/bmc/waterfall/gantt/pest/five_forces/heatmap),
//    one per content slide, cover+ending bookending them —
//    must render to a well-formed pptx and audit clean (exit 0, 0 findings).
//    `layout: "narrow-column"` is pinned on every content slide (same
//    precedent as full-matrix-contrast.test.ts's own SWOT_SLIDE/BMC_SLIDE/
//    WATERFALL_SLIDE/GANTT_SLIDE fixtures) — a full-body component ignores
//    its resolved archetype's own content-fit geometry either way, so the
//    pin exists only to keep this leg clear of a documented, unrelated
//    audit-tool blind spot (this file's own ALLOWLIST["rail-numbered"]
//    entry: content-rail-numbered.tsx's small self-painted "N.N" badge rect
//    falls below deck-audit.ts's MIN_BG_REGION_AREA, so a real page that
//    happens to auto-select that archetype gets a false-positive low-
//    contrast finding on the badge text — a pre-existing tool gap, not
//    something this wave's components caused or should paper over here).
console.log("--- structure-components leg ---")

const structuresDeck = {
  version: "4",
  filename: "pptfast-e2e-structure-components",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Structure Components Demo" },
    {
      type: "content",
      id: "p-swot",
      heading: "SWOT",
      layout: "narrow-column",
      components: [
        {
          type: "swot",
          strengths: ["Strong brand recognition", "Stable cash flow"],
          weaknesses: ["Narrow product line", "High channel dependency"],
          opportunities: ["Fast-growing emerging markets", "Favorable policy window"],
          threats: ["New entrants triggering price wars", "Rising raw material costs"],
        },
      ],
    },
    {
      type: "content",
      id: "p-bmc",
      heading: "Business Model Canvas",
      layout: "narrow-column",
      components: [
        {
          // bmc's five-column canvas gives each cell roughly a fifth of the
          // content width — bench-driven fix round (defect E) turned up
          // three items here that were already silently ellipsis-truncated
          // at that width ("Lower total cost of ownership", "Dedicated
          // customer success manager", "Mid-market enterprise customers")
          // before the new `content-truncated` audit check made it visible.
          // Real dead content, not a tool false positive (verified against
          // bmc.tsx's own PAD_X/BULLET_INDENT/ITEM_SIZE geometry) — shortened
          // to phrases that actually fit, same "fix the fixture" discipline
          // defect D's boundary-page gate used for dead content elsewhere.
          type: "bmc",
          key_partners: ["Core suppliers", "Channel partners"],
          key_activities: ["Product R&D"],
          key_resources: ["Engineering team"],
          value_propositions: ["One-stop solution", "Lower total cost"],
          customer_relationships: ["Dedicated support"],
          channels: ["Direct sales", "Partner distribution"],
          customer_segments: ["Mid-market firms"],
          cost_structure: ["R&D investment", "Cloud infrastructure"],
          revenue_streams: ["Subscription fees", "Implementation services"],
        },
      ],
    },
    {
      type: "content",
      id: "p-waterfall",
      heading: "Revenue Bridge",
      layout: "narrow-column",
      components: [
        {
          type: "waterfall",
          unit: "k",
          items: [
            { label: "Opening", value: 500, kind: "total" },
            { label: "New sales", value: 220 },
            { label: "Churn", value: -150 },
            { label: "Upsell", value: 80 },
            { label: "Refunds", value: -40 },
          ],
        },
      ],
    },
    {
      type: "content",
      id: "p-gantt",
      heading: "Project Timeline",
      layout: "narrow-column",
      components: [
        {
          type: "gantt",
          axis_labels: ["W1", "W4", "W7", "W10"],
          items: [
            { label: "Design", start: 0, end: 3 },
            { label: "Build", start: 2, end: 7 },
            { label: "Test", start: 6, end: 9 },
            { label: "Launch", start: 9, end: 10 },
          ],
        },
      ],
    },
    {
      type: "content",
      id: "p-pest",
      heading: "PEST Analysis",
      layout: "narrow-column",
      components: [
        {
          type: "pest",
          political: { items: ["Tightening data-privacy regulation", "Rising trade tariffs"] },
          economic: { title: "Macro Economy", items: ["Falling interest rates", "Consumer confidence rebound"] },
          social: { items: ["Generational shift in habits", "Normalized remote work"] },
          technological: { items: ["Rapid generative-AI adoption", "Falling edge-compute cost"] },
        },
      ],
    },
    {
      type: "content",
      id: "p-five-forces",
      heading: "Porter's Five Forces",
      layout: "narrow-column",
      components: [
        {
          type: "five_forces",
          rivalry: { items: ["Top 3 players hold 60%+ share", "Persistent price competition"], intensity: "high" },
          new_entrants: { items: ["High licensing barrier to entry"], intensity: "low" },
          supplier_power: { items: ["Core-component supply shortage"], intensity: "medium" },
          buyer_power: { items: ["High customer concentration"], intensity: "medium" },
          substitutes: { items: ["Free open-source alternatives"], intensity: "high" },
        },
      ],
    },
    {
      type: "content",
      id: "p-heatmap",
      heading: "Regional Performance Heatmap",
      layout: "narrow-column",
      components: [
        {
          type: "heatmap",
          x_labels: ["Q1", "Q2", "Q3", "Q4"],
          y_labels: ["North", "South", "East"],
          values: [
            [12, 45, 78, 33],
            [-20, 5, 60, 90],
            [50, 50, 50, 50],
          ],
          show_values: true,
          x_title: "Quarter",
          y_title: "Region",
        },
      ],
    },
    { type: "ending", heading: "Thanks" },
  ],
}
const structuresPath = join(OUT, "structures.json")
writeFileSync(structuresPath, JSON.stringify(structuresDeck))

console.log(sh("node", ["dist/cli.js", "validate", structuresPath]))

const structuresPptxPath = join(OUT, "structures.pptx")
console.log(sh("node", ["dist/cli.js", "render", structuresPath, "-o", structuresPptxPath]))
const structuresZip = await JSZip.loadAsync(readFileSync(structuresPptxPath))
for (const f of ["ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slides/slide9.xml"]) {
  if (!structuresZip.file(f)) throw new Error(`e2e: structure-components leg — missing ${f} in ${structuresPptxPath}`)
}
console.log("structure-components render leg OK (9-slide pptx, all parts present)")

const structuresAudit = shCapture("node", ["dist/cli.js", "audit", structuresPath])
console.log(structuresAudit.stdout)
if (structuresAudit.status !== 0) {
  throw new Error(
    `e2e: structure-components leg — expected the swot/bmc/waterfall/gantt/pest/five_forces/heatmap deck to audit clean (exit 0), got exit ${structuresAudit.status}: ${structuresAudit.stdout}`,
  )
}
if (!/audited 9 pages, 0 skipped, 0 findings/.test(structuresAudit.stdout)) {
  throw new Error(`e2e: structure-components leg — expected a clean summary line, got: ${structuresAudit.stdout}`)
}
console.log("structure-components audit leg OK (exit 0, 0 findings)")

// 9) dual-threshold severity leg (borrow wave, Task 2 — validate quality-gate
//    severity recalibration): a warn-only deck (missing heading — editorial,
//    not content-loss) must still validate/render successfully with a
//    "warning: ..." note, exit 0. A bullet item past the new geometric error
//    ceiling (CAPACITY.bullets.itemOverflowUnits = 50, src/svg/audit/
//    capacity.ts — genuinely gets truncated at render) must still hard-block
//    both commands, exit 1. Exercises the *built* dist/cli.js binary, not
//    just the vitest-level src/api.test.ts/src/cli/commands.test.ts coverage
//    of the same behavior.
console.log("--- dual-threshold severity leg ---")

const warnOnlyDeck = {
  version: "4",
  filename: "pptfast-e2e-warn-only",
  theme: { id: "tech" },
  slides: [
    { type: "cover" }, // missing heading — warn only since Task 2
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hello" }] },
  ],
}
const warnOnlyPath = join(OUT, "warn-only.json")
writeFileSync(warnOnlyPath, JSON.stringify(warnOnlyDeck))

const warnValidateOut = sh("node", ["dist/cli.js", "validate", warnOnlyPath])
console.log(warnValidateOut)
if (!/^OK — 2 slides/.test(warnValidateOut)) {
  throw new Error(`e2e: dual-threshold leg — expected OK for the warn-only deck, got: ${warnValidateOut}`)
}
if (!/warning: page 1/.test(warnValidateOut)) {
  throw new Error(
    `e2e: dual-threshold leg — expected a "warning: page 1" line for the missing heading, got: ${warnValidateOut}`,
  )
}
console.log("dual-threshold warn-only validate leg OK (exit 0, warning line present)")

const warnOnlyPptxPath = join(OUT, "warn-only.pptx")
const warnRenderOut = sh("node", ["dist/cli.js", "render", warnOnlyPath, "-o", warnOnlyPptxPath])
console.log(warnRenderOut)
if (!existsSync(warnOnlyPptxPath)) {
  throw new Error("e2e: dual-threshold leg — render did not write the warn-only deck's pptx")
}
if (!/warning: page 1/.test(warnRenderOut)) {
  throw new Error(`e2e: dual-threshold leg — expected render's own warning line, got: ${warnRenderOut}`)
}
console.log("dual-threshold warn-only render leg OK (exit 0, file written, warning line present)")

// 51 = CAPACITY.bullets.itemOverflowUnits (50) + 1 — kept as a literal here
// since this script only shells out to the built CLI, it does not import
// src/ directly.
const bulletOverflowDeck = {
  version: "4",
  filename: "pptfast-e2e-bullet-overflow",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "Overflow" },
    { type: "content", heading: "Body", components: [{ type: "bullets", items: ["测".repeat(51)] }] },
  ],
}
const bulletOverflowPath = join(OUT, "bullet-overflow.json")
writeFileSync(bulletOverflowPath, JSON.stringify(bulletOverflowDeck))

const overflowValidateStderr = shExpectFail("node", ["dist/cli.js", "validate", bulletOverflowPath])
if (!/exceeds/.test(overflowValidateStderr)) {
  throw new Error(
    `e2e: dual-threshold leg — expected the bullet-overflow deck's validate to fail naming "exceeds", got: ${overflowValidateStderr}`,
  )
}
console.log("dual-threshold bullet-overflow validate leg OK (exit 1, geometric ceiling message present)")

const overflowOutPath = join(OUT, "bullet-overflow-should-not-exist.pptx")
const overflowRenderStderr = shExpectFail("node", [
  "dist/cli.js",
  "render",
  bulletOverflowPath,
  "-o",
  overflowOutPath,
])
if (!/exceeds/.test(overflowRenderStderr)) {
  throw new Error(
    `e2e: dual-threshold leg — expected the bullet-overflow deck's render to fail naming "exceeds", got: ${overflowRenderStderr}`,
  )
}
if (existsSync(overflowOutPath)) {
  throw new Error("e2e: dual-threshold leg — render must not write a file when validate hard-blocks")
}
console.log("dual-threshold bullet-overflow render leg OK (exit 1, no file written)")

// browser-distribution wave (P2, task 1) build-verification leg: dist/browser.js
// and dist/validate.js must be loadable by a bare `<script type="module">`
// in a real browser — no bare (unresolved) top-level import/export
// specifier, which is exactly the regression class a browser deep-dive
// investigation caught against the pre-existing dist/index.js (real Chrome:
// `Failed to resolve module specifier "zod"`, since index.js externalizes
// zod/jszip/dagre/react/react-dom as bare specifiers by design — correct for
// a bundler consumer, fatal for a bare <script>). tsup.config.ts's
// browser/validate entries bundle every dependency in (`noExternal: [/.*/]`,
// `platform: "browser"`, `splitting: false`), so neither output file should
// carry any surviving static import/export-from declaration at all.
console.log("--- browser-distribution build-verification leg ---")

/** A top-level `import`/`export ... from "<specifier>"` declaration pointing
 *  at a bare (non-relative, non-absolute) specifier — the exact shape that
 *  makes a browser's ESM loader throw `Failed to resolve module specifier`
 *  before a single line of the module runs (deep-dive repro, dist/index.js).
 *  A minified single-line bundle has no reliable newline boundary to anchor
 *  on, so this matches the token sequence directly rather than per-line. */
const BARE_STATIC_IMPORT = /\bfrom"(?!\.\.?\/|\/)[^"]+"/g

/** Node built-ins pptxgenjs's own (vendored, unmodified) optional
 *  file-save/network fallback dynamically imports — guarded behind a
 *  `typeof process<"u" && process.versions?.node` runtime check that is
 *  always false in a real browser (the equivalent pre-existing code in
 *  today's dist/index.js chunk was verified safe in the deep-dive's real
 *  Chrome run), so the import() expression itself is parsed but never
 *  evaluated there. A finite, explicit allowlist — anything else showing up
 *  here would be a new, unreviewed Node dependency sneaking into a browser
 *  bundle. */
const ALLOWED_DYNAMIC_NODE_BUILTINS = new Set(["fs", "https"])

function checkBrowserBundle(relPath: string, opts: { allowDynamicNodeBuiltins: boolean }): { raw: number; gzip: number } {
  const path = join(process.cwd(), relPath)
  const code = readFileSync(path, "utf8")

  const bareStatic = [...code.matchAll(BARE_STATIC_IMPORT)].map((m) => m[0])
  if (bareStatic.length > 0) {
    throw new Error(
      `e2e: ${relPath} has ${bareStatic.length} bare top-level import/export specifier(s) — a bare <script type="module"> would fail to resolve these before any code runs: ${bareStatic.slice(0, 5).join(", ")}`,
    )
  }

  const dynamicImports = [...code.matchAll(/import\((['"])([^'"]+)\1\)/g)].map((m) => m[2]!)
  const bareDynamic = dynamicImports.filter((spec) => !spec.startsWith(".") && !spec.startsWith("/"))
  const unexpected = bareDynamic.filter(
    (spec) => !(opts.allowDynamicNodeBuiltins && ALLOWED_DYNAMIC_NODE_BUILTINS.has(spec.replace(/^node:/, ""))),
  )
  if (unexpected.length > 0) {
    throw new Error(
      `e2e: ${relPath} has unexpected bare dynamic import() specifier(s): ${unexpected.join(", ")} — every dynamic import in a browser bundle must be relative, or a reviewed Node-builtin fallback added to ALLOWED_DYNAMIC_NODE_BUILTINS`,
    )
  }

  return { raw: code.length, gzip: gzipSync(code).length }
}

const browserSize = checkBrowserBundle("dist/browser.js", { allowDynamicNodeBuiltins: true })
console.log(`dist/browser.js: ${browserSize.raw} bytes raw, ${browserSize.gzip} bytes gzip`)
// Generous size-budget smoke bounds (catch a 2x explosion, not a 2% drift) —
// react + react-dom/server + zod + jszip + dagre + pptxgenjs inlined
// currently lands around 1.7MB raw / 460KB gzip.
if (browserSize.raw > 4 * 1024 * 1024) {
  throw new Error(`e2e: dist/browser.js grew to ${browserSize.raw} bytes raw — over the 4MB smoke budget, investigate before raising it`)
}
if (browserSize.gzip > 1.5 * 1024 * 1024) {
  throw new Error(`e2e: dist/browser.js grew to ${browserSize.gzip} bytes gzip — over the 1.5MB smoke budget, investigate before raising it`)
}

const validateSize = checkBrowserBundle("dist/validate.js", { allowDynamicNodeBuiltins: false })
console.log(`dist/validate.js: ${validateSize.raw} bytes raw, ${validateSize.gzip} bytes gzip`)
if (validateSize.raw > 2 * 1024 * 1024) {
  throw new Error(`e2e: dist/validate.js grew to ${validateSize.raw} bytes raw — over the 2MB smoke budget, investigate before raising it`)
}
if (validateSize.gzip > 500 * 1024) {
  throw new Error(`e2e: dist/validate.js grew to ${validateSize.gzip} bytes gzip — over the 500KB smoke budget, investigate before raising it`)
}

// Tree-separation (task 2's "no pptxgenjs/react/jszip for an embed-a-validator
// page" pitch): dist/validate.js's closure must exclude the render/export
// chain entirely — checked against real bundled *code* (class/function names
// unique to each library), not the npm package-name substring, since
// minification drops the latter but keeps distinctive API surface intact.
const validateCode = readFileSync(join(process.cwd(), "dist/validate.js"), "utf8")
const RENDER_CHAIN_MARKERS = ["PptxGenJS", "renderToStaticMarkup", "JSZip", "graphlib"]
for (const marker of RENDER_CHAIN_MARKERS) {
  if (validateCode.includes(marker)) {
    throw new Error(`e2e: dist/validate.js unexpectedly contains "${marker}" — the render/export chain leaked into the validate-only entry`)
  }
}
// And the full browser bundle must still carry all of them — a sanity check
// that the markers themselves are meaningful (still present somewhere in
// this build), not silently renamed away by a future minifier/dependency
// version change that would make the check above pass for the wrong reason.
const browserCode = readFileSync(join(process.cwd(), "dist/browser.js"), "utf8")
for (const marker of RENDER_CHAIN_MARKERS) {
  if (!browserCode.includes(marker)) {
    throw new Error(`e2e: dist/browser.js is missing "${marker}" — expected the full render/export chain to be bundled here`)
  }
}
console.log("browser-distribution build-verification leg OK (zero bare specifiers, size budgets, tree separation)")

console.log("e2e OK")
