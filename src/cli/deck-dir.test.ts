// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { isDeckDirectory, pathExists, readDeckDir, resolveDeckTarget, writeDeckAssets } from "./deck-dir"

function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pptfast-deckdir-"))
}

/** 4 pages clears the "presentation" delivery's page-count floor (spec §5:
 *  4-16), same fixture-sizing rationale as `plan/assemble.test.ts`'s own
 *  `makePlan` helper. */
function makePlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "1",
    scenario: { delivery: "presentation" },
    theme: "consulting",
    filename: "q3-review",
    pages: [
      { id: "p-cover", type: "cover", heading: "Q3 Review" },
      { id: "p-kpi", type: "content", heading: "Revenue is up" },
      { id: "p-detail", type: "content", heading: "Detail breakdown" },
      { id: "p-ending", type: "ending", heading: "Thanks" },
    ],
    ...extra,
  }
}

async function writeDeckPlan(dir: string, plan: unknown = makePlan()): Promise<void> {
  await writeFile(join(dir, "deck.plan.json"), JSON.stringify(plan))
}

describe("isDeckDirectory", () => {
  it("is true for a directory", async () => {
    const dir = await tmp()
    expect(await isDeckDirectory(dir)).toBe(true)
  })

  it("is false for a file", async () => {
    const dir = await tmp()
    const file = join(dir, "deck.json")
    await writeFile(file, "{}")
    expect(await isDeckDirectory(file)).toBe(false)
  })

  it("is false for a path that does not exist", async () => {
    expect(await isDeckDirectory("/nowhere/at/all")).toBe(false)
  })

  it("rethrows a non-ENOENT stat error instead of reading it as false (W5 review fix: ENOTDIR via a file as an intermediate segment)", async () => {
    const base = await tmp()
    await writeFile(join(base, "notadir"), "x")
    await expect(isDeckDirectory(join(base, "notadir", "sub"))).rejects.toThrow()
  })
})

describe("resolveDeckTarget", () => {
  const originalHome = process.env.PPTFAST_HOME

  afterEach(() => {
    if (originalHome === undefined) delete process.env.PPTFAST_HOME
    else process.env.PPTFAST_HOME = originalHome
  })

  it("resolves a forward-slash path against cwd (explicit path always wins, W5 review fix: no longer returned unresolved)", async () => {
    const cwd = await tmp()
    expect(await resolveDeckTarget("some/dir", undefined, cwd)).toBe(resolve(cwd, "some/dir"))
  })

  it("resolves a backslash path against cwd", async () => {
    const cwd = await tmp()
    expect(await resolveDeckTarget("some\\dir", undefined, cwd)).toBe(resolve(cwd, "some\\dir"))
  })

  it("returns an absolute path unchanged (path.resolve keeps an absolute later segment as-is)", async () => {
    const dir = await tmp()
    expect(await resolveDeckTarget(dir)).toBe(dir)
  })

  it("resolves a bare name that exists locally under cwd to its full path", async () => {
    const cwd = await tmp()
    await writeFile(join(cwd, "deck.json"), "{}")
    // Resolved (not the bare "deck.json") — every downstream fs call resolves
    // a relative path against the *real* process.cwd(), which only matches
    // this `cwd` parameter in production. See resolveDeckTarget's own doc
    // comment for why returning it unresolved would be a latent bug.
    expect(await resolveDeckTarget("deck.json", undefined, cwd)).toBe(join(cwd, "deck.json"))
  })

  it("resolves a bare directory name that exists locally under cwd to its full path", async () => {
    const cwd = await tmp()
    await mkdir(join(cwd, "mydeck"))
    expect(await resolveDeckTarget("mydeck", undefined, cwd)).toBe(join(cwd, "mydeck"))
  })

  it("resolves a bare name that does not exist locally to $PPTFAST_HOME/decks/<name> when that candidate exists", async () => {
    const home = await tmp()
    process.env.PPTFAST_HOME = home
    await mkdir(join(home, "decks", "q3-review"), { recursive: true })
    const cwd = await tmp()
    expect(await resolveDeckTarget("q3-review", undefined, cwd)).toBe(join(home, "decks", "q3-review"))
  })

  it("honors config.decksDir as an override for the bare-name case, when that candidate exists", async () => {
    process.env.PPTFAST_HOME = await tmp()
    const teamDecks = await tmp()
    await mkdir(join(teamDecks, "q3-review"), { recursive: true })
    const cwd = await tmp()
    expect(await resolveDeckTarget("q3-review", { decksDir: teamDecks }, cwd)).toBe(join(teamDecks, "q3-review"))
  })

  describe("typo'd bare-name fallback (W5 review fix: neither candidate exists)", () => {
    it("returns the local (cwd-resolved) path, not a decksRoot guess, when neither candidate exists", async () => {
      const home = await tmp()
      process.env.PPTFAST_HOME = home
      const cwd = await tmp()
      // Neither `<cwd>/typo.json` nor `<home>/decks/typo.json` exists on disk.
      expect(await resolveDeckTarget("typo.json", undefined, cwd)).toBe(join(cwd, "typo.json"))
    })

    it("still prefers an existing decksRoot candidate over the local path", async () => {
      const home = await tmp()
      process.env.PPTFAST_HOME = home
      await mkdir(join(home, "decks", "q3-review"), { recursive: true })
      const cwd = await tmp()
      expect(await resolveDeckTarget("q3-review", undefined, cwd)).toBe(join(home, "decks", "q3-review"))
    })
  })

  describe("non-ENOENT stat errors rethrow instead of silently falling back (W5 review fix)", () => {
    it("rethrows when the local candidate's path is broken (ENOTDIR via a file as an intermediate segment)", async () => {
      const base = await tmp()
      await writeFile(join(base, "notadir"), "x")
      const brokenCwd = join(base, "notadir")
      await expect(resolveDeckTarget("bare-name", undefined, brokenCwd)).rejects.toThrow()
    })
  })
})

describe("pathExists", () => {
  it("is true for a file", async () => {
    const dir = await tmp()
    const file = join(dir, "x.json")
    await writeFile(file, "{}")
    expect(await pathExists(file)).toBe(true)
  })

  it("is true for a directory", async () => {
    expect(await pathExists(await tmp())).toBe(true)
  })

  it("is false for a path that does not exist", async () => {
    expect(await pathExists("/nowhere/at/all")).toBe(false)
  })

  it("rethrows a non-ENOENT stat error (ENOTDIR via a file as an intermediate segment)", async () => {
    const base = await tmp()
    await writeFile(join(base, "notadir"), "x")
    await expect(pathExists(join(base, "notadir", "sub"))).rejects.toThrow()
  })
})

describe("readDeckDir", () => {
  it("assembles plan + pages/ + assets/ into an IR with the deck dir resolved absolute", async () => {
    const dir = await tmp()
    await writeDeckPlan(dir)
    await mkdir(join(dir, "pages"))
    await writeFile(
      join(dir, "pages", "p-kpi.json"),
      JSON.stringify({ components: [{ type: "paragraph", text: "Revenue grew 12%" }] }),
    )
    const result = await readDeckDir(dir)
    expect(result.deckDir).toBe(dir)
    expect(result.ir.slides.map((s) => s.id)).toEqual(["p-cover", "p-kpi", "p-detail", "p-ending"])
    const kpi = result.ir.slides.find((s) => s.id === "p-kpi")
    expect(kpi?.placeholder).toBeUndefined()
    expect(kpi?.components).toEqual([{ type: "paragraph", text: "Revenue grew 12%" }])
  })

  it("treats a missing pages/ directory as zero filled pages — every plan page becomes a placeholder", async () => {
    const dir = await tmp()
    await writeDeckPlan(dir)
    const { ir } = await readDeckDir(dir)
    // No pages/ entry for *any* plan page (cover/ending included — assembleDeck
    // applies the same missing-page rule to every page type, not just content).
    expect(ir.slides.filter((s) => s.placeholder).map((s) => s.id)).toEqual([
      "p-cover",
      "p-kpi",
      "p-detail",
      "p-ending",
    ])
  })

  it("skips non-.json entries and dotfiles under pages/", async () => {
    const dir = await tmp()
    await writeDeckPlan(dir)
    await mkdir(join(dir, "pages"))
    await writeFile(join(dir, "pages", ".DS_Store"), "junk")
    await writeFile(join(dir, "pages", "notes.txt"), "not a page")
    const { ir } = await readDeckDir(dir)
    // Neither stray file registered as a page — every plan page stays unfilled.
    expect(ir.slides.filter((s) => s.placeholder).map((s) => s.id)).toEqual([
      "p-cover",
      "p-kpi",
      "p-detail",
      "p-ending",
    ])
  })

  it("reports the seed generation the same way assembleDeck does (no plan.seed set)", async () => {
    const dir = await tmp()
    await writeDeckPlan(dir)
    const { generatedSeed, ir } = await readDeckDir(dir)
    expect(generatedSeed).toBeDefined()
    expect(ir.seed).toBe(generatedSeed)
  })

  it("passes an explicit plan.seed through with no generatedSeed", async () => {
    const dir = await tmp()
    await writeDeckPlan(dir, makePlan({ seed: 999 }))
    const { generatedSeed, ir } = await readDeckDir(dir)
    expect(generatedSeed).toBeUndefined()
    expect(ir.seed).toBe(999)
  })

  describe("missing plan file", () => {
    it("throws a PptfastError suggesting `pptfast plan validate` and the expected layout", async () => {
      const dir = await tmp()
      await expect(readDeckDir(dir)).rejects.toThrow(/pptfast plan validate/)
      await expect(readDeckDir(dir)).rejects.toThrow(/pages\/<page-id>\.json/)
      await expect(readDeckDir(dir)).rejects.toThrow(dir)
    })
  })

  describe("malformed plan JSON", () => {
    it("names the plan file in the error", async () => {
      const dir = await tmp()
      await writeFile(join(dir, "deck.plan.json"), "{ not json")
      await expect(readDeckDir(dir)).rejects.toThrow(/deck\.plan\.json.*not valid JSON/s)
    })
  })

  describe("malformed page JSON", () => {
    it("names the offending page file in the error", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "pages"))
      await writeFile(join(dir, "pages", "p-kpi.json"), "{ not json")
      await expect(readDeckDir(dir)).rejects.toThrow(/p-kpi.*not valid JSON/s)
    })
  })

  describe("orphan page file (structural mismatch — assembleDeck's own gate surfaces through)", () => {
    it("rejects a pages/ file whose id is not in the plan", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "pages"))
      await writeFile(join(dir, "pages", "not-a-real-page.json"), "{}")
      await expect(readDeckDir(dir)).rejects.toThrow(/orphan page id "not-a-real-page"/)
    })
  })

  describe("locked-field protection (structural mismatch — assembleDeck's own gate surfaces through)", () => {
    it("rejects a page file that redeclares heading", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "pages"))
      await writeFile(join(dir, "pages", "p-kpi.json"), JSON.stringify({ heading: "sneaky" }))
      await expect(readDeckDir(dir)).rejects.toThrow(/"heading" is locked by the plan/)
    })
  })

  describe("invalid plan", () => {
    it("surfaces validatePlan's own formatted error", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir, { pages: [] })
      await expect(readDeckDir(dir)).rejects.toThrow(/invalid plan.*no pages/s)
    })
  })

  describe("assets/ auto-registration", () => {
    it("registers each file as assets.images[id] with a deck-relative src", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "assets"))
      await writeFile(join(dir, "assets", "logo.png"), "fake-png-bytes")
      const { ir } = await readDeckDir(dir)
      expect(ir.assets.images.logo).toEqual({ src: "assets/logo.png" })
    })

    it("treats a missing assets/ directory as zero assets", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      const { ir } = await readDeckDir(dir)
      expect(ir.assets.images).toEqual({})
    })

    it("skips dotfiles (e.g. .DS_Store) rather than registering them as image assets", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "assets"))
      await writeFile(join(dir, "assets", ".DS_Store"), "junk")
      const { ir } = await readDeckDir(dir)
      expect(ir.assets.images).toEqual({})
    })

    it("rejects two files that normalize to the same asset id, naming both files", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await mkdir(join(dir, "assets"))
      await writeFile(join(dir, "assets", "logo.png"), "a")
      await writeFile(join(dir, "assets", "logo.jpg"), "b")
      // readdir order across logo.png/logo.jpg is not guaranteed — assert both
      // filenames appear rather than a specific order.
      await expect(readDeckDir(dir)).rejects.toThrow(/logo\.png/)
      await expect(readDeckDir(dir)).rejects.toThrow(/logo\.jpg/)
      await expect(readDeckDir(dir)).rejects.toThrow(/"logo"/)
    })

    // Regression guard: PptxIRSchema's `assets` field defaults to a *static*
    // object literal (`AssetsSchema.default({ images: {} })`, ../ir/index.ts).
    // zod does not deep-clone that default per parse, so every assembled deck
    // that omits `assets` (every deck — a plan never has one) starts out
    // sharing one `images: {}` object identity. Mutating it in place would
    // silently leak one deck's local images onto every other deck assembled
    // in the same process. readDeckDir must rebuild `ir.assets` instead.
    it("does not leak asset registrations across separate readDeckDir calls", async () => {
      const dirA = await tmp()
      await writeDeckPlan(dirA)
      await mkdir(join(dirA, "assets"))
      await writeFile(join(dirA, "assets", "logo.png"), "a")
      const resultA = await readDeckDir(dirA)
      expect(resultA.ir.assets.images).toEqual({ logo: { src: "assets/logo.png" } })

      const dirB = await tmp()
      await writeDeckPlan(dirB)
      const resultB = await readDeckDir(dirB)
      expect(resultB.ir.assets.images).toEqual({})
    })
  })

  describe("non-ENOENT readdir errors hard-fail instead of reading as empty (W5 review fix)", () => {
    // EACCES is hard to trigger portably in a test — a `pages`/`assets` PATH
    // THAT IS A FILE (ENOTDIR) is the portable vehicle: readdir on a file
    // path fails the same "not a directory" way a permission error would,
    // without needing platform-specific chmod tricks.
    it("readPages: rethrows when pages/ exists but is a file, not a directory", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await writeFile(join(dir, "pages"), "not a directory")
      await expect(readDeckDir(dir)).rejects.toThrow(/cannot read pages\/ directory/)
    })

    it("scanAssets: rethrows when assets/ exists but is a file, not a directory", async () => {
      const dir = await tmp()
      await writeDeckPlan(dir)
      await writeFile(join(dir, "assets"), "not a directory")
      await expect(readDeckDir(dir)).rejects.toThrow(/cannot read assets\/ directory/)
    })
  })
})

describe("writeDeckAssets (disassemble asset materialization, W5 review fix)", () => {
  it("decodes a base64 data URI and writes assets/<id>.<ext> from its mime", async () => {
    const outDir = await tmp()
    const payload = Buffer.from("hello-asset-bytes")
    const result = await writeDeckAssets(
      { logo: { src: `data:image/png;base64,${payload.toString("base64")}` } },
      outDir,
      outDir,
    )
    expect(result).toEqual({ count: 1, assetsDir: join(outDir, "assets") })
    const written = await readFile(join(outDir, "assets", "logo.png"))
    expect(written.equals(payload)).toBe(true)
  })

  it("maps mime to extension for png/jpeg/gif/webp — jpeg canonicalizes to .jpg", async () => {
    const outDir = await tmp()
    const payload = Buffer.from("x").toString("base64")
    await writeDeckAssets(
      {
        a: { src: `data:image/png;base64,${payload}` },
        b: { src: `data:image/jpeg;base64,${payload}` },
        c: { src: `data:image/gif;base64,${payload}` },
        d: { src: `data:image/webp;base64,${payload}` },
      },
      outDir,
      outDir,
    )
    const files = (await readdir(join(outDir, "assets"))).sort()
    expect(files).toEqual(["a.png", "b.jpg", "c.gif", "d.webp"])
  })

  it("throws for an unrecognized data URI mime, naming the asset", async () => {
    const outDir = await tmp()
    await expect(
      writeDeckAssets({ weird: { src: "data:image/bmp;base64,eA==" } }, outDir, outDir),
    ).rejects.toThrow(/asset "weird".*image\/bmp/s)
  })

  it("throws for a malformed (non-base64) data URI, naming the asset", async () => {
    const outDir = await tmp()
    await expect(
      writeDeckAssets({ weird: { src: "data:image/png,not-base64-at-all" } }, outDir, outDir),
    ).rejects.toThrow(/asset "weird"/)
  })

  it("copies a local file src (relative to sourceBaseDir) into assets/<id><origExt>", async () => {
    const outDir = await tmp()
    const sourceDir = await tmp()
    await writeFile(join(sourceDir, "photo.jpg"), "real-bytes-ish")
    const result = await writeDeckAssets({ pic: { src: "photo.jpg" } }, outDir, sourceDir)
    expect(result.count).toBe(1)
    const written = await readFile(join(outDir, "assets", "pic.jpg"), "utf8")
    expect(written).toBe("real-bytes-ish")
  })

  it("copies an absolute local file src as-is (not resolved against sourceBaseDir)", async () => {
    const outDir = await tmp()
    const sourceDir = await tmp()
    const elsewhere = await tmp()
    await writeFile(join(elsewhere, "photo.jpg"), "real-bytes-ish")
    await writeDeckAssets({ pic: { src: join(elsewhere, "photo.jpg") } }, outDir, sourceDir)
    const written = await readFile(join(outDir, "assets", "pic.jpg"), "utf8")
    expect(written).toBe("real-bytes-ish")
  })

  it("throws naming the asset and the path when a local source file cannot be read", async () => {
    const outDir = await tmp()
    const sourceDir = await tmp()
    await expect(
      writeDeckAssets({ pic: { src: "missing.png" } }, outDir, sourceDir),
    ).rejects.toThrow(/asset "pic".*missing\.png/s)
  })

  it("throws a disassemble-specific error for a URL asset", async () => {
    const outDir = await tmp()
    await expect(
      writeDeckAssets({ logo: { src: "https://example.com/logo.png" } }, outDir, outDir),
    ).rejects.toThrow(
      'asset "logo": URL assets cannot be disassembled into a deck directory — inline it as a data URI or download it first',
    )
  })

  it("does not create assets/ when there are no image entries", async () => {
    const outDir = await tmp()
    const result = await writeDeckAssets({}, outDir, outDir)
    expect(result).toEqual({ count: 0, assetsDir: join(outDir, "assets") })
    await expect(stat(join(outDir, "assets"))).rejects.toThrow()
  })

  it("writes independent entries concurrently without cross-contamination", async () => {
    const outDir = await tmp()
    const sourceDir = await tmp()
    await writeFile(join(sourceDir, "a.png"), "AAA")
    await writeFile(join(sourceDir, "b.png"), "BBB")
    const result = await writeDeckAssets(
      {
        a: { src: "a.png" },
        b: { src: "b.png" },
        c: { src: `data:image/png;base64,${Buffer.from("CCC").toString("base64")}` },
      },
      outDir,
      sourceDir,
    )
    expect(result.count).toBe(3)
    expect(await readFile(join(outDir, "assets", "a.png"), "utf8")).toBe("AAA")
    expect(await readFile(join(outDir, "assets", "b.png"), "utf8")).toBe("BBB")
    expect(await readFile(join(outDir, "assets", "c.png"), "utf8")).toBe("CCC")
  })
})
