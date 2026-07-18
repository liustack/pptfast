// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import JSZip from "jszip"
import { afterAll, describe, expect, it, beforeAll } from "vitest"
import { installNodePlatform } from "@/platform/node"
import { SCENARIO_PRESETS } from "../scenario"
import {
  applyDeckConfig,
  runAssemble,
  runAudit,
  runDisassemble,
  runInit,
  runPlanValidate,
  runPreview,
  runRender,
  runScenarios,
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
  version: "3",
  filename: "cli-test",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "paragraph", text: "hello from the CLI test" }] },
  ],
}

const IR_WITH_LOCAL_ASSET = {
  version: "3",
  filename: "cli-test-asset",
  theme: { id: "tech" },
  assets: { images: { logo: { src: "logo.png" } } },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "image", asset_id: "logo" }] },
  ],
}

const IR_WITH_PLACEHOLDER = {
  version: "3",
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
  version: "3",
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
  version: "3",
  filename: "cli-test-alias",
  theme: { id: "tech" },
  slides: [
    { type: "cover", heading: "CLI" },
    { type: "content", heading: "Body", components: [{ type: "kpi_cards", items: [{ value: "42", title: "Revenue" }] }] },
  ],
}

const VALID_PLAN = {
  version: "1",
  scenario: "boardroom-report",
  theme: "consulting",
  pages: [
    { id: "p-cover", type: "cover", heading: "CLI Plan" },
    { id: "p-kpi", type: "content", heading: "Body content page", rhythm: "anchor", focus: "kpi_cards" },
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
  await writeFile(join(dir, "bad.json"), JSON.stringify({ version: "3" }))
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

/** 5 pages (cover + 3 content + ending) clears "presentation" delivery's
 *  4-16 page-count floor (spec §5) with room to leave some unfilled — same
 *  fixture-sizing rationale as `plan/assemble.test.ts`'s own `makePlan`. */
function makeDeckPlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    scenario: "boardroom-report", // pyramid/presentation/executive
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

/** IR shaped so `disassembleDeck`'s output can itself pass `validatePlan`'s
 *  hard gates (first=cover/last=ending, explicit `presentation` delivery so
 *  4 pages clears the page-count floor) — unlike `VALID_IR` above, which is
 *  fine for a bare-IR round trip but was never meant to double as a valid
 *  *plan* (no ending page), so re-assembling its disassembled output would
 *  fail `checkBoundaryTypes` before ever reaching a render. */
const ROUNDTRIPPABLE_IR = {
  version: "3",
  filename: "roundtrip-test",
  theme: { id: "tech" },
  scenario: { delivery: "presentation" },
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
  version: "3",
  filename: "roundtrip-asset-test",
  theme: { id: "tech" },
  scenario: { delivery: "presentation" },
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
  version: "3",
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
    const report = JSON.parse(result.output) as { findings: unknown[]; pagesAudited: number; pagesSkipped: number }
    expect(report).toEqual({ findings: [], pagesAudited: 2, pagesSkipped: 0 })
  })

  it("throws the same shape as runValidate for invalid IR — never reaches auditDeck", async () => {
    await expect(runAudit(join(dir, "bad.json"))).rejects.toThrow(/invalid IR/)
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
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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

describe("runPlanValidate", () => {
  it("reports OK with page count, resolved scenario, and theme for a valid plan", async () => {
    await expect(runPlanValidate(join(dir, "plan.json"))).resolves.toBe(
      'OK — 4 pages, scenario pyramid/presentation/executive, theme "consulting"',
    )
  })
  it("throws with the issue list, including page ids, for an invalid plan", async () => {
    await expect(runPlanValidate(join(dir, "bad-plan.json"))).rejects.toThrow(/invalid plan.*no pages/s)
  })
  it("throws a readable error for a file that is not valid JSON", async () => {
    const badJsonPath = join(dir, "not-json-plan.json")
    await writeFile(badJsonPath, "{ not json")
    await expect(runPlanValidate(badJsonPath)).rejects.toThrow(/not valid JSON/)
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

describe("runScenarios", () => {
  const presetCount = Object.keys(SCENARIO_PRESETS).length

  it("prints one row per preset in human mode, id/axes/theme recommendations", () => {
    const lines = runScenarios(false).split("\n")
    expect(lines).toHaveLength(presetCount)
    const generalLine = lines.find((l) => l.startsWith("general"))
    expect(generalLine).toBeDefined()
    expect(generalLine).toMatch(/briefing\/balanced\/public/)
    expect(generalLine).toMatch(/consulting/)
  })

  it("prints the full machine payload in json mode", () => {
    const payload = JSON.parse(runScenarios(true)) as {
      presets: Record<string, { axes: { mode: string; delivery: string; audience: string } }>
      modes: Record<string, unknown>
      deliveries: Record<string, unknown>
      audiences: string[]
    }
    expect(Object.keys(payload.presets)).toHaveLength(presetCount)
    expect(payload.presets.general?.axes).toEqual({ mode: "briefing", delivery: "balanced", audience: "public" })
    expect(Object.keys(payload.modes)).toEqual(
      expect.arrayContaining(["pyramid", "narrative", "instructional", "showcase", "briefing"]),
    )
    expect(Object.keys(payload.deliveries)).toEqual(expect.arrayContaining(["text", "balanced", "presentation"]))
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

describe("runSchema --style", () => {
  it("prints the StyleOverride schema", () => {
    const s = JSON.parse(runSchema("style")) as { properties?: Record<string, unknown> }
    expect(Object.keys(s.properties ?? {})).toEqual(
      expect.arrayContaining(["colors", "fonts", "shape"]),
    )
  })
})

describe("runSchema --plan", () => {
  it("prints the deck plan schema", () => {
    const s = JSON.parse(runSchema("plan")) as { properties?: Record<string, unknown> }
    expect(Object.keys(s.properties ?? {})).toEqual(
      expect.arrayContaining(["version", "scenario", "theme", "pages"]),
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
  it("walks the brief's end-to-end scenario: partial pages → assemble → draft render → fill → render", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
    // plan omits `seed`).
    const assembleMsg1 = await runAssemble(deckDir)
    expect(assembleMsg1).toContain(join(deckDir, "deck.json"))
    expect(assembleMsg1).toContain("5 slides")
    expect(assembleMsg1).toContain("1 placeholder")
    expect(assembleMsg1).toContain("to deck.plan.json for revision stability")
    const seedMatch1 = /generated seed (\d+)/.exec(assembleMsg1)
    expect(seedMatch1).not.toBeNull()

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
    // the plan's filename + page-id sequence, never page content or fill
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
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(join(deckDir, "pages", "not-a-real-page.json"), "{}")
    await expect(runValidate(deckDir)).rejects.toThrow(/orphan page id "not-a-real-page"/)
  })

  it("surfaces a locked-field error through runRender", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
    await mkdir(join(deckDir, "pages"))
    await writeFile(join(deckDir, "pages", "p-a.json"), JSON.stringify({ heading: "sneaky" }))
    await expect(
      runRender(deckDir, { output: join(deckDir, "out.pptx") }),
    ).rejects.toThrow(/"heading" is locked by the plan/)
  })

  it("surfaces the missing-plan-file error through runPreview", async () => {
    const deckDir = await makeDeckDir()
    await expect(runPreview(deckDir, join(deckDir, "svgs"))).rejects.toThrow(/pptfast plan validate/)
  })

  it("surfaces an invalid-plan error through runAssemble", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify({ pages: [] }))
    await expect(runAssemble(deckDir)).rejects.toThrow(/invalid plan.*no pages/s)
  })
})

describe("runValidate prints a placeholder note only for deck-directory input (W5 task 5)", () => {
  it("notes unfilled placeholder pages when validating a deck directory", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
    const msg = await runAssemble(deckDir)
    expect(msg).toContain(join(deckDir, "deck.json"))
    expect(msg).toContain("5 slides")
    expect(msg).toContain("5 placeholders") // no pages/ dir at all — every plan page unfilled
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.slides).toHaveLength(5)
  })

  it("writes to a custom -o path when given", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
    const customOut = join(deckDir, "custom.json")
    await runAssemble(deckDir, { output: customOut })
    const written = JSON.parse(await readFile(customOut, "utf8"))
    expect(written.slides).toHaveLength(5)
  })

  it("has no generated-seed note when the plan already sets seed", async () => {
    const deckDir = await makeDeckDir()
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan({ seed: 424242 })))
    const msg = await runAssemble(deckDir)
    expect(msg).not.toContain("note:")
    const written = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"))
    expect(written.seed).toBe(424242)
  })

  it("never modifies the user's plan file, even when it suggests writing a seed back", async () => {
    const deckDir = await makeDeckDir()
    const planPath = join(deckDir, "deck.plan.json")
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

  it("still surfaces the detailed missing-plan-file error for a target that does not exist at all", async () => {
    const d = await makeDeckDir()
    const missing = join(d, "does-not-exist")
    await expect(runAssemble(missing)).rejects.toThrow(/pptfast plan validate/)
  })

  describe("cwd + output-relative-asset portability (W5 review fix)", () => {
    it("resolves a relative -o against the cwd param, not the real process.cwd()", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
      const otherCwd = await makeDeckDir()
      const msg = await runAssemble(deckDir, { output: "custom-out.json", cwd: otherCwd })
      const expected = join(otherCwd, "custom-out.json")
      expect(msg).toContain(expected)
      const written = JSON.parse(await readFile(expected, "utf8"))
      expect(written.slides).toHaveLength(5)
    })

    it("rewrites relative asset srcs to stay correct when -o writes outside the deck directory", async () => {
      const deckDir = await makeDeckDir()
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
      await mkdir(join(deckDir, "assets"))
      await writeFile(join(deckDir, "assets", "logo.png"), PNG_1PX)
      await runAssemble(deckDir, { output: join(deckDir, "custom.json") })
      const written = JSON.parse(await readFile(join(deckDir, "custom.json"), "utf8"))
      expect(written.assets.images.logo.src).toBe("assets/logo.png")
    })
  })
})

describe("runDisassemble", () => {
  it("splits an IR file into deck.plan.json + pages/<id>.json", async () => {
    const srcDir = await makeDeckDir()
    const irPath = join(srcDir, "deck.json")
    await writeFile(irPath, JSON.stringify(VALID_IR))
    const outDir = await makeDeckDir()
    const msg = await runDisassemble(irPath, outDir)
    expect(msg).toContain(join(outDir, "deck.plan.json"))

    const plan = JSON.parse(await readFile(join(outDir, "deck.plan.json"), "utf8"))
    expect(plan.pages).toHaveLength(2)
    expect(plan.theme).toBe("tech")

    // VALID_IR's slides omit `id` — disassembleDeck synthesizes p-<ordinal>-<type>.
    const pageFiles = (await readdir(join(outDir, "pages"))).sort()
    expect(pageFiles).toEqual(["p-1-cover.json", "p-2-content.json"])
  })

  it("refuses to overwrite an existing deck.plan.json", async () => {
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
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
      await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))
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
    await writeFile(join(projectDeckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))

    // Same bare name also resolves to something real under the user's
    // decksDir, so this proves project wins on a genuine conflict, not just
    // by being the only candidate that exists.
    const userDeckDir = join(userDecks, "q3-review")
    await mkdir(userDeckDir, { recursive: true })
    await writeFile(join(userDeckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan({ filename: "wrong-deck" })))

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
    await writeFile(join(deckDir, "deck.plan.json"), JSON.stringify(makeDeckPlan()))

    await withPptfastHome(home, async () => {
      const msg = await runAssemble("q3-review", { cwd: projectRoot })
      expect(msg).toContain(join(deckDir, "deck.json"))
    })
  })
})
