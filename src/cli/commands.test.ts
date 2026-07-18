// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it, beforeAll } from "vitest"
import { installNodePlatform } from "@/platform/node"
import { SCENARIO_PRESETS } from "../scenario"
import {
  applyDeckConfig,
  runAssemble,
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
})
