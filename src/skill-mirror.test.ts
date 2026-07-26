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
