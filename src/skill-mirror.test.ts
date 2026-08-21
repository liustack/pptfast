import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { FULL_BODY_TYPES } from "./svg/component-traits"

// This test is NOT under skills/pptfast/ (where the files it guards live)
// because vitest.config.ts's `include` only picks up `src/**/*.test.{ts,tsx}`
// and `tests/bench/**/*.test.{ts,tsx}` — nothing under skills/ is currently
// wired into any test runner. Rather than teach vitest a new include glob
// for a single file, this lives in src/ (which is already scanned) and reads
// the two skill files by repo-relative path.

const ROOT = process.cwd()
const EN_REL = "skills/pptfast/SKILL.md"
const ZH_REL = "skills/pptfast/SKILL.zh-CN.md"

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
}

function frontmatter(text: string): string {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) throw new Error("no --- frontmatter block found")
  return m[1]!
}

/**
 * Pull the "Use" column (3rd `|`-delimited cell) out of every data row of
 * the "### Component selection" table, then collect every backtick-quoted
 * token in it, in document order. Table rows are found by filtering to
 * lines starting with "|" right after the section heading — the
 * disambiguation prose that follows the table never starts a line with
 * "|", so it's naturally excluded without needing to find where the table
 * ends.
 */
function componentSelectionUseTokens(text: string, heading: string): string[] {
  const start = text.indexOf(heading)
  if (start === -1) throw new Error(`heading not found: ${JSON.stringify(heading)}`)
  const section = text.slice(start + heading.length)
  const rows = section.split("\n").filter((l) => l.trim().startsWith("|"))
  const dataRows = rows.slice(2) // drop header row + |---|---|---| separator
  if (dataRows.length === 0) throw new Error(`no table rows found under ${JSON.stringify(heading)}`)
  const tokens: string[] = []
  for (const row of dataRows) {
    const cells = row.split("|").map((c) => c.trim())
    const useCell = cells[2] ?? ""
    for (const m of useCell.matchAll(/`([^`]+)`/g)) tokens.push(m[1]!)
  }
  return tokens
}

/** The slash-separated `are *full-body*` declaration list. */
function fullBodyDeclarationIds(text: string, anchor: string): string[] {
  const idx = text.indexOf(anchor)
  if (idx === -1) throw new Error(`full-body declaration anchor not found: ${JSON.stringify(anchor)}`)
  const before = text.slice(0, idx)
  const listStart = before.search(/`[a-z_]+`(?:\/`[a-z_]+`)*\s*$/)
  if (listStart === -1) throw new Error(`no backtick list found immediately before ${JSON.stringify(anchor)}`)
  return [...before.slice(listStart).matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!)
}

/** The comma-separated "Eight component types own the whole slide" enumeration list. */
function fullBodyEnumerationIds(text: string, prefixAnchor: string, terminator: string): string[] {
  const start = text.indexOf(prefixAnchor)
  if (start === -1) throw new Error(`full-body enumeration anchor not found: ${JSON.stringify(prefixAnchor)}`)
  const rest = text.slice(start + prefixAnchor.length)
  const end = rest.indexOf(terminator)
  if (end === -1) throw new Error(`terminator ${JSON.stringify(terminator)} not found after enumeration anchor`)
  const listSegment = rest.slice(0, end)
  return [...listSegment.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!)
}

describe("SKILL.zh-CN.md mirrors SKILL.md (skill-zh-cn drift guard)", () => {
  it("both files exist", () => {
    expect(existsSync(join(ROOT, EN_REL)), `missing ${EN_REL}`).toBe(true)
    expect(existsSync(join(ROOT, ZH_REL)), `missing ${ZH_REL}`).toBe(true)
  })

  it("SKILL.md registers the skill (has a name: frontmatter field) and SKILL.zh-CN.md does not", () => {
    const enFm = frontmatter(read(EN_REL))
    const zhFm = frontmatter(read(ZH_REL))
    expect(enFm, "SKILL.md's frontmatter should declare name: pptfast").toMatch(/^name:\s*pptfast\s*$/m)
    expect(
      zhFm,
      "SKILL.zh-CN.md must NOT have a `name:` frontmatter field — that is what registers a skill, " +
        "and this file must never become a second, independently-loadable skill",
    ).not.toMatch(/^name:/m)
  })

  it("the component-selection table's Use column lists the same backtick-quoted ids in the same order in both files", () => {
    const en = componentSelectionUseTokens(read(EN_REL), "### Component selection")
    const zh = componentSelectionUseTokens(read(ZH_REL), "### 组件选型")

    if (JSON.stringify(en) !== JSON.stringify(zh)) {
      const max = Math.max(en.length, zh.length)
      const diffs: string[] = []
      for (let i = 0; i < max; i++) {
        if (en[i] !== zh[i]) diffs.push(`  row-token ${i}: SKILL.md=${en[i] ?? "<missing>"} SKILL.zh-CN.md=${zh[i] ?? "<missing>"}`)
      }
      throw new Error(
        `component-selection "Use" column ids drifted between SKILL.md and SKILL.zh-CN.md:\n${diffs.join("\n")}\n` +
          `SKILL.md: [${en.join(", ")}]\nSKILL.zh-CN.md: [${zh.join(", ")}]`,
      )
    }
    expect(zh).toEqual(en)
  })

  it("both files declare the same 8 full-body component types, in both the slash-list and comma-list sentences", () => {
    const en = read(EN_REL)
    const zh = read(ZH_REL)

    const enDecl = fullBodyDeclarationIds(en, " are *full-body*")
    const zhDecl = fullBodyDeclarationIds(zh, " 是「满幅」")
    const enEnum = fullBodyEnumerationIds(en, "sharing it: ", ".")
    const zhEnum = fullBodyEnumerationIds(zh, "共享：", "。")

    // internal consistency: each file's own two sentences must agree
    expect(new Set(enEnum), "SKILL.md's two full-body sentences disagree with each other").toEqual(new Set(enDecl))
    expect(new Set(zhEnum), "SKILL.zh-CN.md's two full-body sentences disagree with each other").toEqual(
      new Set(zhDecl),
    )

    const missingFromZh = enDecl.filter((id) => !zhDecl.includes(id))
    const missingFromEn = zhDecl.filter((id) => !enDecl.includes(id))
    expect(
      { missingFromZh, missingFromEn },
      "full-body component type list drifted between SKILL.md and SKILL.zh-CN.md",
    ).toEqual({ missingFromZh: [], missingFromEn: [] })

    // cross-check against the actual code: a new/removed full-body type
    // should fail this doc test too, not just the code's own trait test.
    const missingFromCode = enDecl.filter((id) => !FULL_BODY_TYPES.has(id as never))
    const missingFromDocs = [...FULL_BODY_TYPES].filter((id) => !enDecl.includes(id))
    expect(
      { missingFromCode, missingFromDocs },
      "SKILL.md's declared full-body list no longer matches FULL_BODY_TYPES in src/svg/component-traits.ts",
    ).toEqual({ missingFromCode: [], missingFromDocs: [] })
  })

  it("both files carry the Brand-themes section with the same CLI command lines", () => {
    // brand-extract wave review noted this section's EN/ZH parity was
    // unguarded. Structural guard: both sections exist, and every backtick
    // `pptfast …` command line inside them matches verbatim (commands are
    // language-invariant; prose stays free per this file's philosophy).
    const sectionAfter = (text: string, heading: RegExp): string => {
      const m = text.match(heading)
      expect(m, `heading ${heading} missing`).toBeTruthy()
      const start = m!.index! + m![0].length
      const rest = text.slice(start)
      const next = rest.search(/^## /m)
      return next === -1 ? rest : rest.slice(0, next)
    }
    // Commands live in ```bash fenced blocks (not inline backticks) — match
    // whole command lines; trailing per-line comments are language-variant
    // prose, so strip them before comparing.
    const commands = (section: string) =>
      [...section.matchAll(/^pptfast .+$/gm)].map((m) => m[0].replace(/\s+#.*$/, "").trimEnd())
    const en = commands(sectionAfter(read(EN_REL), /^## Brand themes[^\n]*$/m))
    const zh = commands(sectionAfter(read(ZH_REL), /^## 品牌主题[^\n]*$/m))
    expect(en.length, "SKILL.md Brand-themes section has no pptfast command lines").toBeGreaterThan(0)
    expect(zh, "Brand-themes sections' pptfast command lines diverge between EN and ZH").toEqual(en)
  })

  it("both files carry the serve review-loop section with the same command lines", () => {
    // `pptfast serve` is the deck's review path, in every harness: the
    // loop (`serve --no-open`, report the URL, read the annotations back,
    // stop the job) must exist in both files with identical command lines
    // — same structural guard as the Brand-themes test above.
    const sectionAfter = (text: string, heading: RegExp): string => {
      const m = text.match(heading)
      expect(m, `heading ${heading} missing`).toBeTruthy()
      const rest = text.slice(m!.index! + m![0].length)
      const next = rest.search(/^##+ /m)
      return next === -1 ? rest : rest.slice(0, next)
    }
    const commands = (section: string) =>
      [...section.matchAll(/^pptfast .+$/gm)].map((mm) => mm[0].replace(/\s+#.*$/, "").trimEnd())
    const en = sectionAfter(read(EN_REL), /^### Showing the deck to the user$/m)
    const zh = sectionAfter(read(ZH_REL), /^### 把 deck 拿给用户看$/m)
    expect(commands(en).length, "SKILL.md serve section has no pptfast command lines").toBeGreaterThan(0)
    expect(commands(zh), "serve sections' pptfast command lines diverge between EN and ZH").toEqual(commands(en))
    for (const section of [en, zh]) {
      // The tool comes first where it exists, and the fallback still has to
      // carry its own discipline — both halves are pinned, in both languages.
      expect(section, "the section must name the preview tool as the first choice").toContain("pptfast_preview")
      expect(section, "the serve fallback must insist on --no-open").toContain("--no-open")
      expect(section, "the serve section must name the localhost URL to report").toContain("http://127.0.0.1:4400")
      // Was: "must route annotations through revision-request.json". That
      // loop is gone (2026-08-16) — the preview is read-only and the
      // reviewer says what they want changed in the conversation. What the
      // section still has to do is tell the agent to keep serving while the
      // review is happening and to stop when it is done, since a serve
      // process left running after the task is the failure this section
      // exists to prevent.
      expect(section, "the serve section must say to stop the serve process when the round ends").toMatch(/kill|停掉/)
    }
  })

  it("both files launch the CLI through the bundled launcher, with the same fallback commands", () => {
    // The launcher is how the skill runs on a machine with no pptfast
    // installed, so a translation that quietly kept the old `npm install -g`
    // preamble would hand Chinese readers a different install story.
    const launcherLines = (text: string) =>
      [...text.matchAll(/^(?:bash|powershell) [^\n]*run\.(?:sh|ps1)[^\n]*$/gm)].map((m) => m[0])
    const pinnedRunners = (text: string) => [...text.matchAll(/^\d+\. .*(?:npx --yes --package|bunx --bun) [^\n]*$/gm)].map((m) => m[0])
    const en = read(EN_REL)
    const zh = read(ZH_REL)
    expect(launcherLines(en).length, "SKILL.md names neither run.sh nor run.ps1").toBe(2)
    expect(launcherLines(zh), "launcher invocation lines diverge between EN and ZH").toEqual(launcherLines(en))
    expect(pinnedRunners(en).length, "SKILL.md lost its npx/bunx no-script fallback").toBe(2)
    for (const [index, line] of pinnedRunners(en).entries()) {
      // Prose around the command is language-variant, the command is not.
      const command = line.match(/`([^`]+)`/)?.[1]
      expect(command, `SKILL.md fallback ${index + 1} has no backticked command`).toBeTruthy()
      expect(pinnedRunners(zh)[index], `ZH fallback ${index + 1} runs a different command`).toContain(command!)
    }
  })

  it("both files name the same six sparse pin-only ids in the Talk-density contract", () => {
    const sectionAfter = (text: string, heading: RegExp): string => {
      const m = text.match(heading)
      expect(m, `heading ${heading} missing`).toBeTruthy()
      const rest = text.slice(m!.index! + m![0].length)
      const next = rest.search(/^##+ /m)
      return next === -1 ? rest : rest.slice(0, next)
    }
    const ids = ["statement", "pull-quote", "verse-chapter", "stat-hero", "one-evidence", "mono-bleed"] as const
    const en = sectionAfter(read(EN_REL), /^### Talk-density contract$/m)
    const zh = sectionAfter(read(ZH_REL), /^### 演讲密度合同$/m)
    for (const id of ids) {
      expect(en, `SKILL.md Talk-density contract missing ${id}`).toContain(`\`${id}\``)
      expect(zh, `SKILL.zh-CN.md 演讲密度合同 missing ${id}`).toContain(`\`${id}\``)
    }
    expect(en).toMatch(/not a new `pacing`/)
    expect(zh).toMatch(/不是新的 `pacing`/)
    expect(en).toContain("slide.notes")
    expect(zh).toContain("slide.notes")
    expect(en).toContain('chrome: "full"')
    expect(zh).toContain('chrome: "full"')
  })

  it("both files have the same number of ### Phase N sections", () => {
    const phaseHeadings = (text: string) => text.match(/^### Phase \d+/gm) ?? []
    const en = phaseHeadings(read(EN_REL))
    const zh = phaseHeadings(read(ZH_REL))
    expect(en.length, "SKILL.md has no ### Phase N sections — did the heading style change?").toBeGreaterThan(0)
    expect(
      zh.length,
      `SKILL.zh-CN.md has ${zh.length} "### Phase N" sections, SKILL.md has ${en.length} — ` +
        `phase headings must keep the literal "Phase N" marker so the two files stay comparable`,
    ).toBe(en.length)
  })
})
