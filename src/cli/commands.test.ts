// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import JSZip from "jszip"
import { afterAll, describe, expect, it, beforeAll } from "vitest"
import { installNodePlatform } from "@/platform/node"
import { NARRATIVE_PRESETS } from "../narrative"
import {
  applyDeckConfig,
  runAssemble,
  runAudit,
  runDisassemble,
  runInit,
  runMigrate,
  runSpecValidate,
  runPreview,
  runRender,
  runNarratives,
  runSchema,
  runThemes,
  runValidate,
} from "./commands"

// 1x1 红色 PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const VALID_IR = {
  version: "4",
  filename: "cli-test",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hello from the CLI test" }] },
  ],
}

const IR_WITH_LOCAL_ASSET = {
  version: "4",
  filename: "cli-test-asset",
  theme: { id: "tech" },
  assets: { images: { logo: { src: "logo.png" } } },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "image", asset_id: "logo" }] },
  ],
}

const IR_WITH_PLACEHOLDER = {
  version: "4",
  filename: "cli-test-placeholder",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", id: "p-2", placeholder: true },
  ],
}

// theme.style is a schema-open deep-partial override (validate-legal) — this
// text color lands right next to consulting's own `colors.bg` (#F7F7F2),
// which auditDeck's low-contrast check (not validateIr — schema/quality gates
// have no opinion on color pairing) is the one thing that catches. Mirrors
// deck-audit.test.ts's own "low-contrast via a real style-token override"
// fixture (`src/svg/audit/deck-audit.test.ts`).
const IR_LOW_CONTRAST = {
  version: "4",
  filename: "cli-test-low-contrast",
  theme: { id: "consulting", style: { colors: { text: "#F5F5F0" } } },
  slides: [
    {
      type: "content",
      id: "p-body",
      heading: "readable heading",
      components: [{ type: "paragraph", text: "some body copy" }],
    },
  ],
}

// kpi_cards item uses "title" instead of "label" — W5 task 4's field-alias
// normalizer should silently adopt it and runValidate should note it.
const IR_WITH_FIELD_ALIAS = {
  version: "4",
  filename: "cli-test-alias",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "kpi_cards", items: [{ value: "42", title: "Revenue" }] }] },
  ],
}

const VALID_PLAN = {
  version: "1",
  narrative: "boardroom-report",
  theme: "consulting",
  pages: [
    { id: "p-cover", type: "cover", heading: "CLI Plan" },
    { id: "p-kpi", type: "content", heading: "Body content page", beat: "anchor", focus: "kpi_cards" },
    { id: "p-detail", type: "content", heading: "More detail" },
    { id: "p-ending", type: "ending", heading: "Thanks" },
  ],
}

const BAD_PLAN = { pages: [] }

let dir: string
const originalPptfastHome = process.env.PPTFAST_HOME
beforeAll(async () => {
  installNodePlatform()
  dir = await mkdtemp(join(tmpdir(), "pptfast-cli-"))
  await writeFile(join(dir, "deck.json"), JSON.stringify(VALID_IR))
  await writeFile(join(dir, "bad.json"), JSON.stringify({ version: "4" }))
  await writeFile(join(dir, "logo.png"), PNG_1PX)
  await writeFile(join(dir, "deck-with-asset.json"), JSON.stringify(IR_WITH_LOCAL_ASSET))
  await writeFile(join(dir, "deck-with-placeholder.json"), JSON.stringify(IR_WITH_PLACEHOLDER))
  await writeFile(join(dir, "deck-low-contrast.json"), JSON.stringify(IR_LOW_CONTRAST))
  await writeFile(join(dir, "deck-with-alias.json"), JSON.stringify(IR_WITH_FIELD_ALIAS))
  await writeFile(join(dir, "plan.json"), JSON.stringify(VALID_PLAN))
  await writeFile(join(dir, "bad-plan.json"), JSON.stringify(BAD_PLAN))
  // Isolate every test in this file from whatever the real machine's
  // ~/.pptfast happens to hold (W5 task 5: applyDeckConfig now reads the
  // user config layer — findUserConfig — on every call). A fresh, never-
  // populated directory means "missing = fine" (null) for every test below
  // that does not opt into a custom user config via withPptfastHome.
  process.env.PPTFAST_HOME = await mkdtemp(join(tmpdir(), "pptfast-cli-home-"))
})

afterAll(() => {
  if (originalPptfastHome === undefined) delete process.env.PPTFAST_HOME
  else process.env.PPTFAST_HOME = originalPptfastHome
})

/** Scopes a `PPTFAST_HOME` override to `fn`'s duration, restoring whatever
 *  was set before (this file's own isolated default, per the `beforeAll`
 *  above, for every caller in this file) even if `fn` throws. */
async function withPptfastHome<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.PPTFAST_HOME
  process.env.PPTFAST_HOME = home
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = prev
  }
}

/** 5 pages (cover + 3 content + ending) clears "spacious" pacing's
 *  4-16 page-count floor (spec §5) with room to leave some unfilled — same
 *  fixture-sizing rationale as `plan/assemble.test.ts`'s own `makePlan`. */
function makeDeckPlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    narrative: "boardroom-report", // pyramid/spacious/executive
    theme: "consulting",
    filename: "q3-review",
    pages: [
      { id: "p-cover", type: "cover", heading: "Q3 Review" },
      { id: "p-a", type: "content", heading: "Segment A" },
      { id: "p-b", type: "content", heading: "Segment B" },
      { id: "p-c", type: "content", heading: "Segment C" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ],
    ...extra,
  }
}

function makeDeckDir(prefix = "pptfast-deck-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

/** IR shaped so `disassembleDeck`'s output can itself pass `validateSpec`'s
 *  hard gates (first=cover/last=ending, explicit `spacious` pacing so
 *  4 pages clears the page-count floor) — unlike `VALID_IR` above, which is
 *  fine for a bare-IR round trip but was never meant to double as a valid
 *  *spec* (no ending page), so re-assembling its disassembled output would
 *  fail `checkBoundaryTypes` before ever reaching a render. */
const ROUNDTRIPPABLE_IR = {
  version: "4",
  filename: "roundtrip-test",
  theme: { id: "tech" },
  narrative: { pacing: "spacious" },
  slides: [
    { id: "s-cover", type: "cover", heading: "Cover" },
    { id: "s-body", type: "content", heading: "Body", components: [{ type: "paragraph", text: "hi" }] },
    { id: "s-body2", type: "content", heading: "Body 2" },
    { id: "s-ending", type: "ending", heading: "End" },
  ],
}

/** Same shape as {@link ROUNDTRIPPABLE_IR}, plus a data-URI image asset
 *  referenced by `s-body`'s `image` component — the exact runtime-reproduced
 *  "image decks round-trip to a missing image" scenario (W5 review fix,
 *  finding 1): `runDisassemble` must materialize `assets/logo.png` from the
 *  data URI so the later `runRender` on the disassembled directory actually
 *  embeds the image again, not just produces a structurally valid pptx. */
const ROUNDTRIPPABLE_IR_WITH_ASSET = {
  version: "4",
  filename: "roundtrip-asset-test",
  theme: { id: "tech" },
  narrative: { pacing: "spacious" },
  assets: { images: { logo: { src: `data:image/png;base64,${PNG_1PX.toString("base64")}` } } },
  slides: [
    { id: "s-cover", type: "cover", heading: "Cover" },
    { id: "s-body", type: "content", heading: "Body", components: [{ type: "image", asset_id: "logo" }] },
    { id: "s-body2", type: "content", heading: "Body 2" },
    { id: "s-ending", type: "ending", heading: "End" },
  ],
}

/** Every slide is an unfilled placeholder — `disassembleDeck` produces zero
 *  `pages/*.json` entries for this IR (W5 review fix, finding 8: the
 *  `runDisassemble` summary must not claim to have written a `pages/`
 *  directory that was never created). */
const IR_ALL_PLACEHOLDERS = {
  version: "4",
  filename: "cli-test-all-placeholder",
  theme: { id: "tech" },
  slides: [
    { id: "p-1", type: "cover", placeholder: true },
    { id: "p-2", type: "content", placeholder: true },
  ],
}

describe("runValidate", () => {
  it("reports OK with slide count for valid IR", async () => {
    await expect(runValidate(join(dir, "deck.json"))).resolves.toMatch(/OK — 2 slides/)
  })
  it("throws with issue list for invalid IR", async () => {
    await expect(runValidate(join(dir, "bad.json"))).rejects.toThrow(/invalid IR/)
  })
})

describe("runValidate field-alias note (W5 task 4)", () => {
  it("prints a note after OK listing the normalized field aliases", async () => {
    const report = await runValidate(join(dir, "deck-with-alias.json"))
    expect(report).toMatch(/^OK — 2 slides/)
    expect(report).toContain("note: 1 field alias normalized")
    expect(report).toContain("slides[1].components[0].items[0]: title → label")
  })
  it("has no note line when there is nothing to normalize", async () => {
    const report = await runValidate(join(dir, "deck.json"))
    expect(report).not.toContain("note:")
  })
})

describe("runAudit (W6 task 2)", () => {
  it("reports a clean deck with zero findings, exit-clean signal, and the plan's literal summary wording", async () => {
    const result = await runAudit(join(dir, "deck.json"))
    expect(result.hasFindings).toBe(false)
    expect(result.output).toBe("audited 2 pages, 0 skipped, 0 findings")
  })

  it("--json mode returns the full AuditReport, unmodified", async () => {
    const result = await runAudit(join(dir, "deck.json"), { json: true })
    expect(result.hasFindings).toBe(false)
    const report = JSON.parse(result.output) as {
      findings: unknown[]
      pagesAudited: number
      pagesSkipped: number
      checks: unknown
    }
    // checks (audit-v2 phase B): pixels is "not-requested" since this call
    // never passed --pixels — "not checked" must never read as "passed".
    expect(report).toEqual({
      findings: [],
      pagesAudited: 2,
      pagesSkipped: 0,
      checks: { svg: "completed", pixels: "not-requested" },
    })
  })

  it("throws the same shape as runValidate for invalid IR — never reaches auditDeck", async () => {
    await expect(runAudit(join(dir, "bad.json"))).rejects.toThrow(/invalid IR/)
  })

  it("--pixels runs the optional pixel-contrast pass: checks.pixels flips to completed and the human summary notes it", async () => {
    const result = await runAudit(join(dir, "deck.json"), { pixels: true })
    expect(result.hasFindings).toBe(false)
    expect(result.output).toContain("audited 2 pages, 0 skipped, 0 findings")
    expect(result.output).toContain("pixel-contrast check: completed")
  })

  it("--pixels --json reports checks.pixels completed in the machine-readable AuditReport", async () => {
    const result = await runAudit(join(dir, "deck.json"), { pixels: true, json: true })
    const report = JSON.parse(result.output) as { checks: { svg: string; pixels: string } }
    expect(report.checks).toEqual({ svg: "completed", pixels: "completed" })
  })

  it("without --pixels, the human summary never mentions the pixel-contrast check (byte-identical to before this option existed)", async () => {
    const result = await runAudit(join(dir, "deck.json"))
    expect(result.output).toBe("audited 2 pages, 0 skipped, 0 findings")
    expect(result.output).not.toContain("pixel-contrast")
  })

  it("flags a low-contrast style-token override: page/id/[code] formatting and a non-zero summary count", async () => {
    const result = await runAudit(join(dir, "deck-low-contrast.json"))
    expect(result.hasFindings).toBe(true)
    expect(result.output).toMatch(/^page 1 \(p-body\): \[low-contrast\]/)
    expect(result.output).toMatch(/\naudited 1 page, 0 skipped, \d+ findings$/)
  })

  it("--json mode on a findings deck sets hasFindings and includes the finding code", async () => {
    const result = await runAudit(join(dir, "deck-low-contrast.json"), { json: true })
    expect(result.hasFindings).toBe(true)
    const report = JSON.parse(result.output) as {
      findings: Array<{ code: string; page: number; slideId?: string }>
    }
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.every((f) => f.code === "low-contrast")).toBe(true)
    expect(report.findings[0]?.slideId).toBe("p-body")
  })

  it("notes skipped placeholder pages in human output, unconditionally (not gated on dir-mode like runValidate)", async () => {
    const result = await runAudit(join(dir, "deck-with-placeholder.json"))
    expect(result.output).toContain("audited 1 page, 1 skipped, 0 findings")
    expect(result.output).toContain("note: 1 unfilled placeholder page: p-2 (page 2)")
  })

  it("resolves local image assets before auditing, matching render/preview asset handling", async () => {
    await expect(runAudit(join(dir, "deck-with-asset.json"))).resolves.toMatchObject({ hasFindings: false })
  })

  it("resolves a deck project directory through the same loadDeckTarget path as validate/render", async () => {
    const deckDir = await makeDeckDir("pptfast-audit-dir-")
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(join(deckDir, "pages", "p-cover.json"), "{}")
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment A detail" }] }),
    )
    await writeFile(
      join(deckDir, "pages", "p-b.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment B detail" }] }),
    )
    await writeFile(
      join(deckDir, "pages", "p-c.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment C detail" }] }),
    )
    await writeFile(join(deckDir, "pages", "p-ending.json"), "{}")
    const result = await runAudit(deckDir)
    expect(result.hasFindings).toBe(false)
    expect(result.output).toBe("audited 5 pages, 0 skipped, 0 findings")
  })
})

describe("runSpecValidate", () => {
  it("reports OK with page count, resolved narrative, and theme for a valid spec", async () => {
    await expect(runSpecValidate(join(dir, "plan.json"))).resolves.toBe(
      'OK — 4 pages, narrative pyramid/spacious/executive, theme "consulting"',
    )
  })
  it("throws with the issue list, including page ids, for an invalid spec", async () => {
    await expect(runSpecValidate(join(dir, "bad-plan.json"))).rejects.toThrow(/invalid spec.*no pages/s)
  })
  it("throws a readable error for a file that is not valid JSON", async () => {
    const badJsonPath = join(dir, "not-json-plan.json")
    await writeFile(badJsonPath, "{ not json")
    await expect(runSpecValidate(badJsonPath)).rejects.toThrow(/not valid JSON/)
  })
})

describe("runRender", () => {
  it("writes a pptx file and honors --theme override", async () => {
    const out = join(dir, "out.pptx")
    const msg = await runRender(join(dir, "deck.json"), { output: out, theme: "consulting" })
    expect(msg).toContain("2 slides")
    const bytes = await readFile(out)
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK")
  })

  describe("--draft threading (W5 task 1)", () => {
    it("rejects a deck with an unfilled placeholder page when --draft is not passed", async () => {
      const out = join(dir, "out-placeholder-blocked.pptx")
      await expect(
        runRender(join(dir, "deck-with-placeholder.json"), { output: out }),
      ).rejects.toThrow(/unfilled placeholder page.*p-2.*--draft/s)
    })

    it("renders the deck when --draft is passed", async () => {
      const out = join(dir, "out-placeholder-draft.pptx")
      const msg = await runRender(join(dir, "deck-with-placeholder.json"), { output: out, draft: true })
      expect(msg).toContain("2 slides")
      const bytes = await readFile(out)
      expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK")
    })
  })

  describe("field-alias note (W5 whole-branch review finding 3: README claimed render printed this note; it never actually did)", () => {
    it("prints a note after the wrote-file summary listing the normalized field aliases", async () => {
      const out = join(dir, "out-alias.pptx")
      const msg = await runRender(join(dir, "deck-with-alias.json"), { output: out })
      expect(msg).toMatch(/^wrote .*out-alias\.pptx/)
      expect(msg).toContain("note: 1 field alias normalized")
      expect(msg).toContain("slides[1].components[0].items[0]: title → label")
    })

    it("has no note line when there is nothing to normalize", async () => {
      const out = join(dir, "out-no-alias.pptx")
      const msg = await runRender(join(dir, "deck.json"), { output: out })
      expect(msg).not.toContain("note:")
    })
  })
})

describe("runSchema / runThemes", () => {
  it("prints JSON Schema", () => {
    expect(JSON.parse(runSchema())).toHaveProperty("$schema")
  })
  it("prints 13 themes, json mode parses", () => {
    expect(runThemes(false).split("\n")).toHaveLength(13)
    expect(JSON.parse(runThemes(true))).toHaveLength(13)
  })
})

describe("runNarratives", () => {
  const presetCount = Object.keys(NARRATIVE_PRESETS).length

  it("prints one row per preset in human mode, id/axes/theme recommendations", () => {
    const lines = runNarratives(false).split("\n")
    expect(lines).toHaveLength(presetCount)
    const generalLine = lines.find((l) => l.startsWith("general"))
    expect(generalLine).toBeDefined()
    expect(generalLine).toMatch(/briefing\/balanced\/public/)
    expect(generalLine).toMatch(/consulting/)
  })

  it("prints the full machine payload in json mode", () => {
    const payload = JSON.parse(runNarratives(true)) as {
      presets: Record<string, { axes: { strategy: string; pacing: string; audience: string } }>
      strategies: Record<string, unknown>
      pacings: Record<string, unknown>
      audiences: string[]
    }
    expect(Object.keys(payload.presets)).toHaveLength(presetCount)
    expect(payload.presets.general?.axes).toEqual({ strategy: "briefing", pacing: "balanced", audience: "public" })
    expect(Object.keys(payload.strategies)).toEqual(
      expect.arrayContaining(["pyramid", "storytelling", "instructional", "showcase", "briefing"]),
    )
    expect(Object.keys(payload.pacings)).toEqual(expect.arrayContaining(["dense", "balanced", "spacious"]))
    expect(payload.audiences).toEqual(expect.arrayContaining(["executive", "technical", "customer", "public"]))
  })
})

describe("runPreview", () => {
  it("writes one SVG per slide", async () => {
    const out = join(dir, "svgs")
    await runPreview(join(dir, "deck.json"), out)
    const files = await readdir(out)
    expect(files.sort()).toEqual(["001-cover.svg", "002-content.svg"])
    const svg = await readFile(join(out, "002-content.svg"), "utf8")
    expect(svg).toContain("hello from the CLI test")
  })

  it("inlines local image assets as data URIs", async () => {
    const out = join(dir, "svgs-asset")
    await runPreview(join(dir, "deck-with-asset.json"), out)
    const svg = await readFile(join(out, "002-content.svg"), "utf8")
    expect(svg).toContain("data:image/png;base64")
  })
})

describe("runPreview --html (W7 task 1)", () => {
  it("does not write preview.html unless --html is requested", async () => {
    const out = join(dir, "svgs-no-html")
    await runPreview(join(dir, "deck.json"), out)
    const files = await readdir(out)
    expect(files).not.toContain("preview.html")
  })

  it("writes a self-contained preview.html with one <svg> embed per slide, alongside the per-slide SVG files, and notes it in the success message", async () => {
    const out = join(dir, "svgs-html")
    const msg = await runPreview(join(dir, "deck.json"), out, { htmlOut: true })
    const files = await readdir(out)
    expect(files.sort()).toEqual(["001-cover.svg", "002-content.svg", "preview.html"])
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html.match(/<svg\b/g)).toHaveLength(2)
    expect(msg).toContain(join(out, "preview.html"))
  })

  it("shows the 'unfilled' badge for a placeholder page (deck-directory input, same as SVG output)", async () => {
    const out = join(dir, "svgs-html-placeholder")
    await runPreview(join(dir, "deck-with-placeholder.json"), out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html).toContain(">unfilled<")
  })

  it("works for deck project directory input too (loadDeckTarget's dir branch)", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    const out = join(deckDir, "svgs-html")
    await runPreview(deckDir, out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    // makeDeckPlan() has 5 pages, every one unfilled (no pages/ dir written) —
    // assemble marks all 5 as placeholders, so all 5 badges should show.
    expect(html.match(/<svg\b/g)).toHaveLength(5)
    expect(html.match(/class="pf-badge"/g)).toHaveLength(5)
  })
})

describe("runPreview --html audit overlay (notes+preview wave, task 2)", () => {
  it("audits a clean deck and shows no finding badges or panel", async () => {
    const out = join(dir, "svgs-html-audit-clean")
    const msg = await runPreview(join(dir, "deck.json"), out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html).not.toContain('class="pf-finding-badge"')
    expect(html).not.toContain('class="pf-thumb-finding-badge"')
    expect(html).not.toContain('id="pf-audit-panel"')
    expect(html).not.toContain('id="pf-audit-note"')
    // No "N findings" note appended when the audit found nothing.
    expect(msg).not.toContain("audit found")
    // The checks summary still shows on a clean report (fix round,
    // Important-1) — `preview --html` never runs the pixel pass, so it
    // always reads "not-requested" here, never a checkmark or "passed".
    expect(html).toContain('id="pf-audit-checks"')
    expect(html).toContain("svg completed")
    expect(html).toContain("pixels not-requested")
  })

  it("audits a deliberately low-contrast deck and shows a finding badge + panel entry, plus a CLI note", async () => {
    const out = join(dir, "svgs-html-audit-low-contrast")
    const msg = await runPreview(join(dir, "deck-low-contrast.json"), out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html).toContain('class="pf-finding-badge"')
    expect(html).toContain('class="pf-thumb-finding-badge"')
    expect(html).toContain('id="pf-audit-panel"')
    expect(html).toContain("[low-contrast]")
    expect(html).toContain("p-body") // IR_LOW_CONTRAST's slide id
    expect(msg).toMatch(/note: audit found \d+ findings? — see preview\.html/)
    // The checks summary sits alongside the findings panel, not in place of it.
    expect(html).toContain('id="pf-audit-checks"')
    expect(html).toContain("svg completed")
  })

  it("skips the audit entirely for a deck with a placeholder page, showing the one-line notice instead of running a partial audit", async () => {
    const out = join(dir, "svgs-html-audit-placeholder")
    const msg = await runPreview(join(dir, "deck-with-placeholder.json"), out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html).toContain('id="pf-audit-note"')
    expect(html).toContain("audit overlay skipped")
    expect(html).not.toContain('id="pf-audit-panel"')
    expect(html).not.toContain('class="pf-finding-badge"')
    expect(html).not.toContain('class="pf-thumb-finding-badge"')
    expect(msg).not.toContain("audit found")
    // The overlay only appears when the audit actually runs — a skipped
    // audit shows no checks summary either, same as no findings panel.
    expect(html).not.toContain('id="pf-audit-checks"')
  })

  it("always includes the annotation UI and export button, independent of audit results", async () => {
    const out = join(dir, "svgs-html-audit-annotate")
    await runPreview(join(dir, "deck.json"), out, { htmlOut: true })
    const html = await readFile(join(out, "preview.html"), "utf8")
    expect(html).toContain('id="pf-annotate-panel"')
    expect(html).toContain('id="pf-export-btn"')
  })
})

describe("runSchema --style", () => {
  it("prints the StyleOverride schema", () => {
    const s = JSON.parse(runSchema("style")) as { properties?: Record<string, unknown> }
    expect(Object.keys(s.properties ?? {})).toEqual(
      expect.arrayContaining(["colors", "fonts", "shape"]),
    )
  })
})

describe("runSchema --spec", () => {
  it("prints the deck spec schema", () => {
    const s = JSON.parse(runSchema("spec")) as { properties?: Record<string, unknown> }
    expect(Object.keys(s.properties ?? {})).toEqual(
      expect.arrayContaining(["version", "narrative", "theme", "pages"]),
    )
  })
})

describe("applyDeckConfig resolution (flag > config > IR)", () => {
  const freshDir = () => mkdtemp(join(tmpdir(), "pptfast-deckcfg-"))

  it("--style file wins over config style", async () => {
    const d = await freshDir()
    await writeFile(
      join(d, "pptfast.config.json"),
      JSON.stringify({ style: { colors: { primary: "#111111" } } }),
    )
    await writeFile(join(d, "style.json"), JSON.stringify({ colors: { primary: "#0B5FFF" } }))
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { stylePath: join(d, "style.json"), cwd: d })
    expect(raw.theme.style.colors.primary).toBe("#0B5FFF")
  })

  it("config theme and style apply when no flags are given", async () => {
    const d = await freshDir()
    await writeFile(
      join(d, "pptfast.config.json"),
      JSON.stringify({ theme: "ink", style: { colors: { primary: "#111111" } } }),
    )
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { cwd: d })
    expect(raw.theme.id).toBe("ink")
    expect(raw.theme.style.colors.primary).toBe("#111111")
  })

  it("--theme flag beats config and keeps IR-authored style", async () => {
    const d = await freshDir()
    await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "ink" }))
    const raw: any = structuredClone(VALID_IR)
    raw.theme = { id: "tech", style: { colors: { primary: "#ABCDEF" } } }
    await applyDeckConfig(raw, { theme: "consulting", cwd: d })
    expect(raw.theme.id).toBe("consulting")
    expect(raw.theme.style.colors.primary).toBe("#ABCDEF")
  })

  it("leaves the IR untouched when there is no flag and no config", async () => {
    const d = await freshDir()
    const raw: any = structuredClone(VALID_IR)
    await applyDeckConfig(raw, { cwd: d })
    expect(raw).toEqual(VALID_IR)
  })

  it("rejects an invalid --style file with the file path in the message", async () => {
    const d = await freshDir()
    await writeFile(join(d, "style.json"), JSON.stringify({ colors: { primary: "nope" } }))
    const raw: any = structuredClone(VALID_IR)
    await expect(
      applyDeckConfig(raw, { stylePath: join(d, "style.json"), cwd: d }),
    ).rejects.toThrow(/style\.json/)
  })

  it("runValidate reports the config-resolved theme", async () => {
    const d = await freshDir()
    await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "ink" }))
    await writeFile(join(d, "deck.json"), JSON.stringify(VALID_IR))
    await expect(runValidate(join(d, "deck.json"), d)).resolves.toMatch(/theme "ink"/)
  })

  describe("theme validation moved to resolution time (W5 review fix, finding 6)", () => {
    it("throws unknown-theme naming the config path when a stale project-config theme actually wins", async () => {
      const d = await freshDir()
      await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "not-a-real-theme" }))
      const raw: any = structuredClone(VALID_IR)
      await expect(applyDeckConfig(raw, { cwd: d })).rejects.toThrow(
        /unknown theme "not-a-real-theme" \(from .*pptfast\.config\.json\)/,
      )
    })

    it("--theme override bypasses a stale/unknown project-config theme entirely — no longer a read-time hard-fail", async () => {
      const d = await freshDir()
      await writeFile(join(d, "pptfast.config.json"), JSON.stringify({ theme: "not-a-real-theme" }))
      const raw: any = structuredClone(VALID_IR)
      await applyDeckConfig(raw, { theme: "consulting", cwd: d })
      expect(raw.theme.id).toBe("consulting")
    })
  })
})

describe("runInit", () => {
  it("writes a config template into cwd", async () => {
    const d = await mkdtemp(join(tmpdir(), "pptfast-init-"))
    const msg = await runInit(d)
    expect(msg).toContain("pptfast.config.json")
    const written = JSON.parse(await readFile(join(d, "pptfast.config.json"), "utf8"))
    expect(written.theme).toBe("consulting")
    expect(written.style.colors.primary).toMatch(/^#/)
  })

  it("refuses to overwrite an existing config", async () => {
    const d = await mkdtemp(join(tmpdir(), "pptfast-init-"))
    await runInit(d)
    await expect(runInit(d)).rejects.toThrow(/exists/)
  })
})

// ── W5 task 5: deck project directories ─────────────────────────────────

describe("deck project directory workflow (W5 task 5)", () => {
  it("walks the brief's end-to-end narrative: partial pages → assemble → draft render → fill → render", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment A detail" }] }),
    )
    await writeFile(
      join(deckDir, "pages", "p-b.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment B detail" }] }),
    )
    // Cover/ending have no fillable content of their own here, but still
    // need a pages/ entry to count as "filled" — assembleDeck applies the
    // same missing-page → placeholder rule to every page type, not just
    // content pages (plan/assemble.ts's buildSlide has no type-based
    // special case). p-c is deliberately left unfilled — 2 of 3 content
    // pages present — so it is the *only* placeholder below.
    await writeFile(join(deckDir, "pages", "p-cover.json"), "{}")
    await writeFile(join(deckDir, "pages", "p-ending.json"), "{}")

    // assemble → placeholder present, seed-generation note included (the
    // spec omits `seed`).
    const assembleMsg1 = await runAssemble(deckDir)
    expect(assembleMsg1).toContain(join(deckDir, "deck.json"))
    expect(assembleMsg1).toContain("5 slides")
    expect(assembleMsg1).toContain("1 placeholder")
    expect(assembleMsg1).toContain("to deck.spec.json for revision stability")
    const seedMatch1 = /generated seed (\d+)/.exec(assembleMsg1)
    expect(seedMatch1).not.toBeNull()
    // Backlog item 9a (`.issues/notes/2026-07-18-post-v03-backlog.md` #9a):
    // none of p-a/p-b/p-cover/p-ending's page files set an explicit
    // `layout`, so this call also triggers the materialized-layout note —
    // commands.ts:668-677 always pushes the seed note before the layout
    // note when both apply; assert that relative order, not just that each
    // note's text independently appears somewhere in the message.
    const layoutNoteIndex1 = assembleMsg1.indexOf("auto-selected into deck.json")
    expect(layoutNoteIndex1).toBeGreaterThanOrEqual(0)
    expect(layoutNoteIndex1).toBeGreaterThan(seedMatch1!.index)

    const assembled1 = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(assembled1.slides.find((s: { id: string }) => s.id === "p-c").placeholder).toBe(true)
    expect(assembled1.slides.find((s: { id: string }) => s.id === "p-a").placeholder).toBeUndefined()
    expect(String(assembled1.seed)).toBe(seedMatch1![1])

    // render (no --draft) on the directory hits the exact same draft gate
    // single-file mode already has.
    await expect(
      runRender(deckDir, { output: join(deckDir, "blocked.pptx") }),
    ).rejects.toThrow(/unfilled placeholder page.*p-c.*--draft/s)

    // render --draft on the directory (in-memory assemble) succeeds.
    const draftOut = join(deckDir, "draft.pptx")
    const draftMsg = await runRender(deckDir, { output: draftOut, draft: true })
    expect(draftMsg).toContain("5 slides")
    const draftBytes = await readFile(draftOut)
    expect(draftBytes.subarray(0, 2).toString("latin1")).toBe("PK")

    // fill in the third page.
    await writeFile(
      join(deckDir, "pages", "p-c.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Segment C detail" }] }),
    )

    // re-assemble is idempotent: the generated seed is stable (a function of
    // the spec's filename + page-id sequence, never page content or fill
    // state — plan/assemble.ts's generateSeed) and every page is now filled.
    const assembleMsg2 = await runAssemble(deckDir)
    expect(assembleMsg2).toContain("0 placeholders")
    expect(assembleMsg2).toContain(`generated seed ${seedMatch1![1]}`)
    const assembled2 = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(assembled2.seed).toBe(assembled1.seed)
    expect(assembled2.slides.find((s: { id: string }) => s.id === "p-c").placeholder).toBeUndefined()

    // render without --draft now succeeds — no placeholders left.
    const finalOut = join(deckDir, "final.pptx")
    const finalMsg = await runRender(deckDir, { output: finalOut })
    expect(finalMsg).toContain("5 slides")
    const finalBytes = await readFile(finalOut)
    expect(finalBytes.subarray(0, 2).toString("latin1")).toBe("PK")
  })
})

describe("bare-name resolution through CLI commands (W5 task 5)", () => {
  it("resolves a bare deck name to $PPTFAST_HOME/decks/<name> end to end", async () => {
    const home = await makeDeckDir("pptfast-barehome-")
    await withPptfastHome(home, async () => {
      const deckDir = join(home, "decks", "q3-review")
      await mkdir(deckDir, { recursive: true })
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      const cwd = await makeDeckDir("pptfast-barecwd-")
      const msg = await runAssemble("q3-review", { cwd })
      expect(msg).toContain(join(deckDir, "deck.json"))
      const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
      expect(written.slides).toHaveLength(5)
    })
  })

  it("prefers a same-name local file over the deck home (explicit/local path always wins)", async () => {
    const home = await makeDeckDir("pptfast-barehome2-")
    await withPptfastHome(home, async () => {
      const cwd = await makeDeckDir("pptfast-barecwd2-")
      await writeFile(join(cwd, "deck.json"), JSON.stringify(VALID_IR))
      // "deck.json" has no path separator, but exists locally under cwd —
      // must resolve as that local file, not $PPTFAST_HOME/decks/deck.json.
      await expect(runValidate("deck.json", cwd)).resolves.toMatch(/OK — 2 slides/)
    })
  })

  it("a nonexistent bare-name typo's error names the local candidate, not an obscure deck-home guess (W5 review fix, finding 3)", async () => {
    const home = await makeDeckDir("pptfast-barehome3-")
    await withPptfastHome(home, async () => {
      const cwd = await makeDeckDir("pptfast-barecwd3-")
      // "typo.json" exists neither locally under cwd nor under the deck
      // home — the error must name what the user actually typed (resolved
      // under cwd), not $PPTFAST_HOME/decks/typo.json.
      await expect(runValidate("typo.json", cwd)).rejects.toThrow(join(cwd, "typo.json"))
    })
  })

  it("a separator-relative target resolves against the cwd param (W5 review fix, finding 4)", async () => {
    const cwd = await makeDeckDir("pptfast-barecwd4-")
    await mkdir(join(cwd, "sub"))
    await writeFile(join(cwd, "sub", "deck.json"), JSON.stringify(VALID_IR))
    // "./sub/deck.json" has a path separator — resolveDeckTarget must
    // resolve it against the `cwd` param, not the real process.cwd().
    await expect(runValidate("./sub/deck.json", cwd)).resolves.toMatch(/OK — 2 slides/)
  })
})

describe("structural deck-directory errors surface through the CLI shell (W5 task 5)", () => {
  it("surfaces an orphan page-file error through runValidate", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(join(deckDir, "pages", "not-a-real-page.json"), "{}")
    await expect(runValidate(deckDir)).rejects.toThrow(/orphan page id "not-a-real-page"/)
  })

  it("surfaces a locked-field error through runRender", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(join(deckDir, "pages", "p-a.json"), JSON.stringify({ heading: "sneaky" }))
    await expect(
      runRender(deckDir, { output: join(deckDir, "out.pptx") }),
    ).rejects.toThrow(/"heading" is locked by the spec/)
  })

  it("surfaces the missing-spec-file error through runPreview", async () => {
    const deckDir = await makeDeckDir()
    await expect(runPreview(deckDir, join(deckDir, "svgs"))).rejects.toThrow(/pptfast spec validate/)
  })

  it("surfaces an invalid-spec error through runAssemble", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify({ pages: [] }))
    await expect(runAssemble(deckDir)).rejects.toThrow(/invalid spec.*no pages/s)
  })
})

describe("runValidate prints a placeholder note only for deck-directory input (W5 task 5)", () => {
  it("notes unfilled placeholder pages when validating a deck directory", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "filled" }] }),
    )
    await writeFile(join(deckDir, "pages", "p-cover.json"), "{}")
    await writeFile(join(deckDir, "pages", "p-ending.json"), "{}")
    const report = await runValidate(deckDir)
    expect(report).toMatch(/^OK — 5 slides/)
    expect(report).toContain("note: 2 unfilled placeholder pages: p-b (page 3), p-c (page 4)")
  })

  it("never adds a placeholder note for single-file IR input, even with an authored placeholder slide", async () => {
    const report = await runValidate(join(dir, "deck-with-placeholder.json"))
    expect(report).toMatch(/^OK — 2 slides/)
    expect(report).not.toContain("placeholder")
  })
})

describe("assets/ auto-registration reaches rendered output (W5 task 5)", () => {
  it("inlines a deck-dir asset as a data URI in the previewed SVG", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(
      join(deckDir, "pages", "p-a.json"),
      JSON.stringify({ components: [{ type: "image", asset_id: "logo" }] }),
    )
    await mkdir(join(deckDir, "assets"))
    await writeFile(join(deckDir, "assets", "logo.png"), PNG_1PX)

    const outDir = join(deckDir, "svgs")
    await runPreview(deckDir, outDir)
    // p-cover is slide 1 → "001-cover.svg", p-a is slide 2 → "002-content.svg"
    // (runPreview's own `${padded index}-${slide.type}.svg` naming).
    const svg = await readFile(join(outDir, "002-content.svg"), "utf8")
    expect(svg).toContain("data:image/png;base64")
  })
})

describe("runAssemble", () => {
  it("writes deck.json to <dir>/deck.json by default and reports the placeholder count", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    const msg = await runAssemble(deckDir)
    expect(msg).toContain(join(deckDir, "deck.json"))
    expect(msg).toContain("5 slides")
    expect(msg).toContain("5 placeholders") // no pages/ dir at all — every spec page unfilled
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.slides).toHaveLength(5)

    // Backlog item 9a: makeDeckPlan() here has neither an explicit `seed`
    // nor any page pinning its own `layout`, so this default call triggers
    // both assemble notes — the seed note (generated seed) and the
    // materialized-layout note (auto-selected). commands.ts:668-677 always
    // pushes the seed note first; assert that relative order holds in the
    // actual message, not just that both notes' text appears somewhere.
    const seedNoteIndex = msg.indexOf("note: generated seed")
    const layoutNoteIndex = msg.indexOf("note:", seedNoteIndex + 1)
    expect(seedNoteIndex).toBeGreaterThanOrEqual(0)
    expect(layoutNoteIndex).toBeGreaterThan(seedNoteIndex)
    expect(msg.slice(layoutNoteIndex)).toContain("auto-selected into deck.json")
  })

  it("writes to a custom -o path when given", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
    const customOut = join(deckDir, "custom.json")
    await runAssemble(deckDir, { output: customOut })
    const written = JSON.parse(await readFile(customOut, "utf8"))
    expect(written.slides).toHaveLength(5)
  })

  it("has no generated-seed note when the spec already sets seed (a materialized-layout note may still appear — a separate concern)", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan({ seed: 424242 })))
    const msg = await runAssemble(deckDir)
    expect(msg).not.toContain("generated seed")
    expect(msg).not.toContain("revision stability")
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.seed).toBe(424242)
  })

  it("reports the materialized-layout count as its own note (W4 design decision 10)", async () => {
    const deckDir = await makeDeckDir()
    // No pages/ dir at all — every one of makeDeckPlan()'s 5 pages is an
    // unfilled placeholder, so every one of them also omits `layout` and
    // gets materialized.
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan({ seed: 424242 })))
    const msg = await runAssemble(deckDir)
    expect(msg).toContain("note: 5 layouts auto-selected into deck.json")
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.slides.every((s: { layout?: string }) => typeof s.layout === "string")).toBe(true)
  })

  it("has no materialized-layout note when every page already pins its own layout", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan({ seed: 424242 })))
    await mkdir(join(deckDir, "pages"))
    await Promise.all([
      writeFile(join(deckDir, "pages", "p-cover.json"), JSON.stringify({ layout: "banner-title" })),
      writeFile(join(deckDir, "pages", "p-a.json"), JSON.stringify({ layout: "two-column" })),
      writeFile(join(deckDir, "pages", "p-b.json"), JSON.stringify({ layout: "two-column" })),
      writeFile(join(deckDir, "pages", "p-c.json"), JSON.stringify({ layout: "two-column" })),
      writeFile(join(deckDir, "pages", "p-ending.json"), JSON.stringify({ layout: "tone-adaptive-ending" })),
    ])
    const msg = await runAssemble(deckDir)
    expect(msg).not.toContain("auto-selected")
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.slides.map((s: { layout?: string }) => s.layout)).toEqual([
      "banner-title",
      "two-column",
      "two-column",
      "two-column",
      "tone-adaptive-ending",
    ])
  })

  it("never modifies the user's spec file, even when it suggests writing a seed back", async () => {
    const deckDir = await makeDeckDir()
    const planPath = join(deckDir, "deck.spec.json")
    const planText = JSON.stringify(makeDeckPlan())
    await writeFile(planPath, planText)
    await runAssemble(deckDir)
    expect(await readFile(planPath, "utf8")).toBe(planText)
  })

  it("gives a friendly error for a file target instead of a confusing ENOTDIR (W5 review fix)", async () => {
    const d = await makeDeckDir()
    const filePath = join(d, "not-a-dir.json")
    await writeFile(filePath, JSON.stringify(VALID_IR))
    await expect(runAssemble(filePath)).rejects.toThrow(/expected a deck project directory/)
  })

  it("still surfaces the detailed missing-spec-file error for a target that does not exist at all", async () => {
    const d = await makeDeckDir()
    const missing = join(d, "does-not-exist")
    await expect(runAssemble(missing)).rejects.toThrow(/pptfast spec validate/)
  })

  describe("cwd + output-relative-asset portability (W5 review fix)", () => {
    it("resolves a relative -o against the cwd param, not the real process.cwd()", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      const otherCwd = await makeDeckDir()
      const msg = await runAssemble(deckDir, { output: "custom-out.json", cwd: otherCwd })
      const expected = join(otherCwd, "custom-out.json")
      expect(msg).toContain(expected)
      const written = JSON.parse(await readFile(expected, "utf8"))
      expect(written.slides).toHaveLength(5)
    })

    it("rewrites relative asset srcs to stay correct when -o writes outside the deck directory", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      await mkdir(join(deckDir, "pages"))
      await writeFile(
        join(deckDir, "pages", "p-a.json"),
        JSON.stringify({ components: [{ type: "image", asset_id: "logo" }] }),
      )
      await mkdir(join(deckDir, "assets"))
      await writeFile(join(deckDir, "assets", "logo.png"), PNG_1PX)

      const elsewhere = await makeDeckDir("pptfast-assemble-elsewhere-")
      const outPath = join(elsewhere, "out.json")
      await runAssemble(deckDir, { output: outPath })

      const written = JSON.parse(await readFile(outPath, "utf8"))
      // No longer "assets/logo.png" (deckDir-relative) — must still resolve
      // back to the real file from the OUTPUT file's own directory.
      expect(written.assets.images.logo.src).not.toBe("assets/logo.png")
      expect(resolve(elsewhere, written.assets.images.logo.src)).toBe(join(deckDir, "assets", "logo.png"))

      // The real proof: rendering straight from the output location succeeds
      // and actually embeds the image — a stale deckDir-relative src would
      // fail to resolve from `elsewhere/`. --draft: only p-a was filled in
      // above, the rest of makeDeckPlan()'s pages are unfilled placeholders,
      // and that gate is orthogonal to what this test is checking.
      const pptxPath = join(elsewhere, "out.pptx")
      await runRender(outPath, { output: pptxPath, draft: true })
      const zip = await JSZip.loadAsync(await readFile(pptxPath))
      const media = Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/"))
      expect(media.length).toBeGreaterThan(0)
    })

    it("leaves asset srcs untouched when -o stays inside the deck directory", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      await mkdir(join(deckDir, "assets"))
      await writeFile(join(deckDir, "assets", "logo.png"), PNG_1PX)
      await runAssemble(deckDir, { output: join(deckDir, "custom.json") })
      const written = JSON.parse(await readFile(join(deckDir, "custom.json"), "utf8"))
      expect(written.assets.images.logo.src).toBe("assets/logo.png")
    })
  })
})

describe("runDisassemble", () => {
  it("splits an IR file into deck.spec.json + pages/<id>.json", async () => {
    const srcDir = await makeDeckDir()
    const irPath = join(srcDir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const outDir = await makeDeckDir()
    const msg = await runDisassemble(irPath, outDir)
    expect(msg).toContain(join(outDir, "deck.spec.json"))

    const spec = JSON.parse(await readFile(join(outDir, "deck.spec.json"), "utf8"))
    expect(spec.pages).toHaveLength(2)
    expect(spec.theme).toBe("tech")

    // VALID_IR's slides omit `id` — disassembleDeck synthesizes p-<ordinal>-<type>.
    const pageFiles = (await readdir(join(outDir, "pages"))).sort()
    expect(pageFiles).toEqual(["p-1-cover.json", "p-2-content.json"])
  })

  it("refuses to overwrite an existing deck.spec.json", async () => {
    const srcDir = await makeDeckDir()
    const irPath = join(srcDir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const outDir = await makeDeckDir()
    await runDisassemble(irPath, outDir)
    await expect(runDisassemble(irPath, outDir)).rejects.toThrow(/already exists/)
  })

  it("round-trips through runRender on the resulting directory", async () => {
    const srcDir = await makeDeckDir()
    const irPath = join(srcDir, "deck.json")
    await writeFile(irPath, JSON.stringify(ROUNDTRIPPABLE_IR))
    const outDir = await makeDeckDir()
    await runDisassemble(irPath, outDir)
    const renderMsg = await runRender(outDir, { output: join(outDir, "roundtrip.pptx") })
    expect(renderMsg).toContain("4 slides")
    const bytes = await readFile(join(outDir, "roundtrip.pptx"))
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK")
  })

  describe("materializes assets/ (W5 review fix, finding 1: image decks used to round-trip to a missing image)", () => {
    it("a data-URI asset round-trips through disassemble -> render and the image is embedded again", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      await writeFile(irPath, JSON.stringify(ROUNDTRIPPABLE_IR_WITH_ASSET))
      const outDir = await makeDeckDir()

      const msg = await runDisassemble(irPath, outDir)
      expect(msg).toContain("1 asset file")

      // The bytes actually landed on disk, decoded from the data URI.
      const assetBytes = await readFile(join(outDir, "assets", "logo.png"))
      expect(assetBytes.equals(PNG_1PX)).toBe(true)

      // Full round trip: render the disassembled directory and confirm the
      // image is actually embedded in the pptx zip — the exact "missing
      // image" repro this fix closes, not just a structurally-valid pptx
      // with the image silently dropped.
      const pptxPath = join(outDir, "roundtrip-asset.pptx")
      await runRender(outDir, { output: pptxPath })
      const zip = await JSZip.loadAsync(await readFile(pptxPath))
      const media = Object.keys(zip.files).filter((f) => f.startsWith("ppt/media/"))
      expect(media.length).toBeGreaterThan(0)
    })

    it("rejects a URL asset with a disassemble-specific error", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      const irWithUrlAsset = {
        ...ROUNDTRIPPABLE_IR_WITH_ASSET,
        assets: { images: { logo: { src: "https://example.com/logo.png" } } },
      }
      await writeFile(irPath, JSON.stringify(irWithUrlAsset))
      const outDir = await makeDeckDir()
      await expect(runDisassemble(irPath, outDir)).rejects.toThrow(
        'asset "logo": URL assets cannot be disassembled into a deck directory — inline it as a data URI or download it first',
      )
      // Failure rollback (post-v0.3 W8 fix round, backlog item 8): unlike the
      // path-traversal case above, this failure happens in writeDeckAssets,
      // well after deck.spec.json and pages/*.json were both written
      // successfully — the spec file this run itself created must not
      // survive, or it would misrepresent this outDir as an already,
      // successfully disassembled deck project.
      await expect(stat(join(outDir, "deck.spec.json"))).rejects.toThrow()
    })

    it("copies a local file asset into assets/, resolving relative to the input IR's own directory", async () => {
      const srcDir = await makeDeckDir()
      await writeFile(join(srcDir, "logo.png"), PNG_1PX)
      const irPath = join(srcDir, "deck.json")
      const irWithLocalAsset = {
        ...ROUNDTRIPPABLE_IR_WITH_ASSET,
        assets: { images: { logo: { src: "logo.png" } } },
      }
      await writeFile(irPath, JSON.stringify(irWithLocalAsset))
      const outDir = await makeDeckDir()
      await runDisassemble(irPath, outDir)
      const written = await readFile(join(outDir, "assets", "logo.png"))
      expect(written.equals(PNG_1PX)).toBe(true)
    })

    it("does not mention an assets/ dir in the summary when the IR has no assets", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      await writeFile(irPath, JSON.stringify(VALID_IR))
      const outDir = await makeDeckDir()
      const msg = await runDisassemble(irPath, outDir)
      expect(msg).not.toContain("asset file")
      await expect(stat(join(outDir, "assets"))).rejects.toThrow()
    })
  })

  describe("summary message does not name an unwritten pages/ dir (W5 review fix, finding 8)", () => {
    it("says 'no pages' rather than '0 page files to <dir>' when every slide is a placeholder", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      await writeFile(irPath, JSON.stringify(IR_ALL_PLACEHOLDERS))
      const outDir = await makeDeckDir()
      const msg = await runDisassemble(irPath, outDir)
      expect(msg).toContain("no pages")
      expect(msg).not.toContain(join(outDir, "pages"))
      await expect(stat(join(outDir, "pages"))).rejects.toThrow()
    })
  })

  describe("path traversal defense (W5 whole-branch review finding 1, CRITICAL, CWE-22 — reproduced by the reviewer)", () => {
    it("rejects a slide id containing '../' segments and writes nothing outside outDir", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      const maliciousIr = {
        ...ROUNDTRIPPABLE_IR,
        slides: ROUNDTRIPPABLE_IR.slides.map((s, i) => (i === 1 ? { ...s, id: "../../../../escape" } : s)),
      }
      await writeFile(irPath, JSON.stringify(maliciousIr))
      const outDir = await makeDeckDir()

      await expect(runDisassemble(irPath, outDir)).rejects.toThrow(
        'slide id "../../../../escape" is not a safe file name — ids used as page/asset file names must not contain path separators or ".."',
      )

      // The exact path the pre-fix code would have written to (pagesDir
      // joined with the malicious id) must not exist.
      const wouldEscapeTo = join(outDir, "pages", "../../../../escape.json")
      await expect(stat(wouldEscapeTo)).rejects.toThrow()

      // Nothing with the attacker's chosen name landed anywhere in outDir's
      // ancestor chain either (scan a few levels up, the same chain a
      // successful escape would have walked through).
      let ancestor = outDir
      for (let i = 0; i < 5; i++) {
        ancestor = dirname(ancestor)
        const entries = await readdir(ancestor).catch(() => [] as string[])
        expect(entries).not.toContain("escape")
        expect(entries).not.toContain("escape.json")
      }

      // Failure rollback (post-v0.3 W8 fix round, backlog item 8): the id
      // check now runs before deck.spec.json is even written, so a failed
      // run leaves no spec file at all — not a residual one that no longer
      // matches what (if anything) landed in pages/.
      await expect(stat(join(outDir, "deck.spec.json"))).rejects.toThrow()
    })

    // Task-3 review, optional nit routed to this wave: the case above
    // always starts from an `outDir` that `makeDeckDir()` (mkdtemp) already
    // created, so it can't tell "the id check runs before mkdir" apart from
    // "the id check runs before the spec write" — outDir existing either
    // way. `runDisassemble` (commands.ts) runs the `assertSafeFileSegment`
    // loop before its own `mkdir(outDir, { recursive: true })` call, so an
    // unsafe id must fail without ever creating `outDir` at all when it
    // does not already exist — a stronger, more direct check on that
    // ordering than the existing case above can express.
    it("rejects an unsafe slide id without ever creating outDir when it does not already exist", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      const maliciousIr = {
        ...ROUNDTRIPPABLE_IR,
        slides: ROUNDTRIPPABLE_IR.slides.map((s, i) => (i === 1 ? { ...s, id: "../../../../escape" } : s)),
      }
      await writeFile(irPath, JSON.stringify(maliciousIr))
      const parent = await makeDeckDir()
      const outDir = join(parent, "not-created-yet")
      await expect(stat(outDir)).rejects.toThrow() // sanity: outDir does not exist before the call

      await expect(runDisassemble(irPath, outDir)).rejects.toThrow(
        'slide id "../../../../escape" is not a safe file name — ids used as page/asset file names must not contain path separators or ".."',
      )

      await expect(stat(outDir)).rejects.toThrow() // still does not exist — the check ran before mkdir
    })

    it("still disassembles a deck with only safe, explicit slide ids — happy path unchanged", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      await writeFile(irPath, JSON.stringify(ROUNDTRIPPABLE_IR))
      const outDir = await makeDeckDir()
      await runDisassemble(irPath, outDir)
      const pageFiles = (await readdir(join(outDir, "pages"))).sort()
      expect(pageFiles).toEqual(["s-body.json", "s-body2.json", "s-cover.json", "s-ending.json"])
    })
  })

  describe("failure-rollback spec-file cleanup (post-v0.3 W8 fix round, backlog item 8)", () => {
    it("never deletes a pre-existing deck.spec.json this call did not itself create", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "deck.json")
      await writeFile(irPath, JSON.stringify(ROUNDTRIPPABLE_IR))
      const outDir = await makeDeckDir()
      const preExisting = JSON.stringify({ sentinel: "pre-existing spec, not written by this call" })
      await writeFile(join(outDir, "deck.spec.json"), preExisting)

      // The `wx` no-overwrite guard rejects before the rollback scope is
      // ever entered — this is a "failed run" in the sense backlog item 8
      // is about, but the spec file it fails on was never this call's own
      // to delete.
      await expect(runDisassemble(irPath, outDir)).rejects.toThrow(/already exists/)

      const stillThere = await readFile(join(outDir, "deck.spec.json"), "utf8")
      expect(stillThere).toBe(preExisting)
    })
  })
})

// ── runMigrate (spec §9.1/§9.2/§9.3, vocabulary-v4 rename, task 2) ────────

const V3_IR = {
  version: "3",
  filename: "migrate-cli-test",
  scenario: { mode: "narrative", delivery: "text", audience: "public" },
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "Migrate CLI Test" },
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hi" }] },
  ],
}

function makeLegacyDeckPlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    scenario: "boardroom-report",
    theme: "consulting",
    filename: "migrate-deck-dir-test",
    pages: [
      { id: "p-cover", type: "cover", heading: "Cover" },
      { id: "p-a", type: "content", heading: "Segment A", rhythm: "anchor" },
      { id: "p-b", type: "content", heading: "Segment B" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ],
    ...extra,
  }
}

describe("runMigrate", () => {
  describe("v3 IR file leg", () => {
    it("migrates version + the mode/delivery field-and-value mapping to a v4 output file", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "v3.json")
      await writeFile(irPath, JSON.stringify(V3_IR))
      const outPath = join(await makeDeckDir(), "v4.json")

      const msg = await runMigrate(irPath, outPath)
      expect(msg).toContain(outPath)

      const written = JSON.parse(await readFile(outPath, "utf8"))
      expect(written.version).toBe("4")
      expect(written.scenario).toBeUndefined()
      // spec §9.1: mode "narrative" → strategy "storytelling", delivery
      // "text" → pacing "dense", audience carries through unchanged.
      expect(written.narrative).toEqual({ strategy: "storytelling", pacing: "dense", audience: "public" })
      expect(written.filename).toBe("migrate-cli-test")
      expect(written.slides).toHaveLength(2)
    })

    it("never overwrites an existing output file", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "v3.json")
      await writeFile(irPath, JSON.stringify(V3_IR))
      const outPath = join(await makeDeckDir(), "v4.json")
      await runMigrate(irPath, outPath)
      await expect(runMigrate(irPath, outPath)).rejects.toThrow(/already exists/)
    })

    it("rejects IR v2 with a message pointing at validate's own combined v2→v4 mapping, not a silent v3 reinterpretation", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "v2.json")
      await writeFile(irPath, JSON.stringify({ version: "2", slides: [] }))
      const outPath = join(await makeDeckDir(), "v4.json")
      await expect(runMigrate(irPath, outPath)).rejects.toThrow(/does not support IR v2/)
      await expect(runMigrate(irPath, outPath)).rejects.toThrow(/pptfast validate/)
    })

    it("rejects a file that is already v4 — nothing to migrate", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "v4.json")
      await writeFile(irPath, JSON.stringify(VALID_IR))
      const outPath = join(await makeDeckDir(), "out.json")
      await expect(runMigrate(irPath, outPath)).rejects.toThrow(/only converts an IR v3 file/)
    })

    it("rejects a v3-labeled file that fails PptxIRV3Schema, naming the issue", async () => {
      const srcDir = await makeDeckDir()
      const irPath = join(srcDir, "bad-v3.json")
      await writeFile(irPath, JSON.stringify({ version: "3", slides: "not-an-array" }))
      const outPath = join(await makeDeckDir(), "out.json")
      await expect(runMigrate(irPath, outPath)).rejects.toThrow(/invalid IR v3 file/)
    })
  })

  describe("deck-dir leg", () => {
    it("rewrites deck.plan.json to deck.spec.json per spec §9.2's mapping, leaving every other field verbatim", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeLegacyDeckPlan()))

      const msg = await runMigrate(deckDir, deckDir)
      expect(msg).toContain(join(deckDir, "deck.spec.json"))

      const written = JSON.parse(await readFile(join(deckDir, "deck.spec.json"), "utf8"))
      expect(written.scenario).toBeUndefined()
      expect(written.narrative).toBe("boardroom-report")
      expect(written.theme).toBe("consulting")
      expect(written.filename).toBe("migrate-deck-dir-test")
      const pageA = written.pages.find((p: { id: string }) => p.id === "p-a")
      expect(pageA.rhythm).toBeUndefined()
      expect(pageA.beat).toBe("anchor")
      const pageB = written.pages.find((p: { id: string }) => p.id === "p-b")
      expect(pageB.beat).toBeUndefined() // no rhythm on the source page — nothing to rename

      // The source file is never touched — migrate only ever adds the new one.
      const stillThere = JSON.parse(await readFile(join(deckDir, "deck.plan.json"), "utf8"))
      expect(stillThere.scenario).toBe("boardroom-report")
    })

    it("never overwrites an existing deck.spec.json", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeLegacyDeckPlan()))
      await runMigrate(deckDir, deckDir)
      await expect(runMigrate(deckDir, deckDir)).rejects.toThrow(/already exists/)
    })

    it("can write the migrated spec to a different output directory than the source", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeLegacyDeckPlan()))
      const outDir = await makeDeckDir()
      await runMigrate(deckDir, outDir)
      expect(await readFile(join(outDir, "deck.spec.json"), "utf8")).toBeDefined()
      await expect(stat(join(deckDir, "deck.spec.json"))).rejects.toThrow()
    })

    it("surfaces a readable error when the directory has no deck.plan.json to migrate", async () => {
      const deckDir = await makeDeckDir()
      await expect(runMigrate(deckDir, deckDir)).rejects.toThrow(/cannot read plan file/)
    })

    it("surfaces a friendly 'already migrated' error, not the generic read failure, when deck.spec.json exists and deck.plan.json is already gone", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeLegacyDeckPlan()))
      await runMigrate(deckDir, deckDir)
      await unlink(join(deckDir, "deck.plan.json"))

      await expect(runMigrate(deckDir, deckDir)).rejects.toThrow(/already migrated/)
      await expect(runMigrate(deckDir, deckDir)).rejects.not.toThrow(/cannot read plan file/)
    })

    it("the resulting deck.spec.json validates and assembles cleanly once the legacy file is removed (dual-file hard error otherwise)", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeLegacyDeckPlan()))
      await runMigrate(deckDir, deckDir)

      // Both files present — the deck-dir loader must hard-error, not guess.
      await expect(runAssemble(deckDir)).rejects.toThrow(/deck\.plan\.json/)
      await expect(runAssemble(deckDir)).rejects.toThrow(/deck\.spec\.json/)

      await unlink(join(deckDir, "deck.plan.json"))
      const spec = JSON.parse(await readFile(join(deckDir, "deck.spec.json"), "utf8"))
      await expect(runSpecValidate(join(deckDir, "deck.spec.json"))).resolves.toMatch(/^OK —/)
      const assembleMsg = await runAssemble(deckDir)
      expect(assembleMsg).toContain(`${spec.pages.length} slides`)
    })
  })
})

describe("applyDeckConfig four-layer chain (W5 task 5): user config layer", () => {
  it("user config theme applies when there is no flag and no project config", async () => {
    const projectDir = await makeDeckDir()
    const home = await makeDeckDir()
    await writeFile(join(home, "config.json"), JSON.stringify({ theme: "ink" }))
    await withPptfastHome(home, async () => {
      const raw: any = structuredClone(VALID_IR)
      await applyDeckConfig(raw, { cwd: projectDir })
      expect(raw.theme.id).toBe("ink")
    })
  })

  it("project config wins over user config", async () => {
    const projectDir = await makeDeckDir()
    await writeFile(join(projectDir, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))
    const home = await makeDeckDir()
    await writeFile(join(home, "config.json"), JSON.stringify({ theme: "ink" }))
    await withPptfastHome(home, async () => {
      const raw: any = structuredClone(VALID_IR)
      await applyDeckConfig(raw, { cwd: projectDir })
      expect(raw.theme.id).toBe("tech")
    })
  })

  it("CLI flag wins over both project and user config", async () => {
    const projectDir = await makeDeckDir()
    await writeFile(join(projectDir, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))
    const home = await makeDeckDir()
    await writeFile(join(home, "config.json"), JSON.stringify({ theme: "ink" }))
    await withPptfastHome(home, async () => {
      const raw: any = structuredClone(VALID_IR)
      await applyDeckConfig(raw, { theme: "consulting", cwd: projectDir })
      expect(raw.theme.id).toBe("consulting")
    })
  })

  it("falls back to the IR-authored theme when no layer (flag/project/user) sets one", async () => {
    const projectDir = await makeDeckDir()
    const home = await makeDeckDir()
    await withPptfastHome(home, async () => {
      const raw: any = structuredClone(VALID_IR) // theme.id: "tech"
      await applyDeckConfig(raw, { cwd: projectDir })
      expect(raw.theme.id).toBe("tech")
    })
  })

  it("user config style applies when no flag/project style is set", async () => {
    const projectDir = await makeDeckDir()
    const home = await makeDeckDir()
    await writeFile(join(home, "config.json"), JSON.stringify({ style: { colors: { primary: "#654321" } } }))
    await withPptfastHome(home, async () => {
      const raw: any = structuredClone(VALID_IR)
      await applyDeckConfig(raw, { cwd: projectDir })
      expect(raw.theme.style.colors.primary).toBe("#654321")
    })
  })

  describe("theme validation moved to resolution time (W5 review fix, finding 6)", () => {
    it("throws unknown-theme naming the user-config path when a stale user-config theme actually wins (no flag, no project config)", async () => {
      const projectDir = await makeDeckDir()
      const home = await makeDeckDir()
      await writeFile(join(home, "config.json"), JSON.stringify({ theme: "not-a-real-theme" }))
      await withPptfastHome(home, async () => {
        const raw: any = structuredClone(VALID_IR)
        await expect(applyDeckConfig(raw, { cwd: projectDir })).rejects.toThrow(
          /unknown theme "not-a-real-theme" \(from .*config\.json\)/,
        )
      })
    })

    // The key regression test: a stale/unknown theme sitting in the user's
    // config used to hard-fail at config *read* time (inside findUserConfig,
    // before this fix), even when a valid --theme flag should have overridden
    // it. It must now succeed — the flag wins the chain, so the invalid
    // user-config value never gets validated at all.
    it("--theme override bypasses a stale/unknown user-config theme entirely", async () => {
      const projectDir = await makeDeckDir()
      const home = await makeDeckDir()
      await writeFile(join(home, "config.json"), JSON.stringify({ theme: "not-a-real-theme" }))
      await withPptfastHome(home, async () => {
        const raw: any = structuredClone(VALID_IR)
        await applyDeckConfig(raw, { theme: "consulting", cwd: projectDir })
        expect(raw.theme.id).toBe("consulting")
      })
    })

    it("a valid project config theme overrides a stale/unknown user-config theme (project still beats user, no validation error)", async () => {
      const projectDir = await makeDeckDir()
      await writeFile(join(projectDir, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))
      const home = await makeDeckDir()
      await writeFile(join(home, "config.json"), JSON.stringify({ theme: "not-a-real-theme" }))
      await withPptfastHome(home, async () => {
        const raw: any = structuredClone(VALID_IR)
        await applyDeckConfig(raw, { cwd: projectDir })
        expect(raw.theme.id).toBe("tech")
      })
    })
  })
})

describe("decksDir redirect (W5 task 5)", () => {
  it("resolves a bare deck name under the user config's decksDir override", async () => {
    const home = await makeDeckDir()
    const teamDecks = await makeDeckDir("pptfast-teamdecks-")
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: teamDecks }))
    await withPptfastHome(home, async () => {
      const deckDir = join(teamDecks, "q3-review")
      await mkdir(deckDir, { recursive: true })
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      const cwd = await makeDeckDir("pptfast-redirect-cwd-")
      const msg = await runAssemble("q3-review", { cwd })
      expect(msg).toContain(join(deckDir, "deck.json"))
    })
  })

  it("resolves a relative decksDir in the user config against the home dir, not the cwd (W5 review fix, finding 9)", async () => {
    const home = await makeDeckDir()
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: "team-decks" }))
    await withPptfastHome(home, async () => {
      const deckDir = join(home, "team-decks", "q3-review")
      await mkdir(deckDir, { recursive: true })
      await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))
      // cwd is deliberately unrelated to `home` — a cwd-relative (mis)read of
      // decksDir would resolve to a directory under `cwd`, not find this one.
      const cwd = await makeDeckDir("pptfast-redirect-relative-cwd-")
      const msg = await runAssemble("q3-review", { cwd })
      expect(msg).toContain(join(deckDir, "deck.json"))
    })
  })
})

describe("decksDir redirect — project config precedence (W5 task 6, controller addition A)", () => {
  it("a project pptfast.config.json's decksDir wins over the user config's, resolved against the project config file's own directory", async () => {
    const home = await makeDeckDir()
    const userDecks = await makeDeckDir("pptfast-userdecks-")
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: userDecks }))

    const projectRoot = await makeDeckDir("pptfast-project-")
    await writeFile(join(projectRoot, "pptfast.config.json"), JSON.stringify({ decksDir: "team-decks" }))
    const projectDeckDir = join(projectRoot, "team-decks", "q3-review")
    await mkdir(projectDeckDir, { recursive: true })
    await writeFile(join(projectDeckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))

    // Same bare name also resolves to something real under the user's
    // decksDir, so this proves project wins on a genuine conflict, not just
    // by being the only candidate that exists.
    const userDeckDir = join(userDecks, "q3-review")
    await mkdir(userDeckDir, { recursive: true })
    await writeFile(join(userDeckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan({ filename: "wrong-deck" })))

    await withPptfastHome(home, async () => {
      const msg = await runAssemble("q3-review", { cwd: projectRoot })
      expect(msg).toContain(join(projectDeckDir, "deck.json"))
    })
  })

  it("falls back to the user config's decksDir when the project config exists but sets no decksDir of its own", async () => {
    const home = await makeDeckDir()
    const userDecks = await makeDeckDir("pptfast-userdecks-")
    await writeFile(join(home, "config.json"), JSON.stringify({ decksDir: userDecks }))

    const projectRoot = await makeDeckDir("pptfast-project-partial-")
    await writeFile(join(projectRoot, "pptfast.config.json"), JSON.stringify({ theme: "tech" }))

    const deckDir = join(userDecks, "q3-review")
    await mkdir(deckDir, { recursive: true })
    await writeFile(join(deckDir, "deck.spec.json"), JSON.stringify(makeDeckPlan()))

    await withPptfastHome(home, async () => {
      const msg = await runAssemble("q3-review", { cwd: projectRoot })
      expect(msg).toContain(join(deckDir, "deck.json"))
    })
  })
})
