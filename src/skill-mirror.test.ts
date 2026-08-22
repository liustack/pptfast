import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { AUDIENCE_VALUES, PACING_VALUES, STRATEGY_VALUES } from "./ir/narrative-values"
import { NARRATIVE_PRESETS } from "./narrative"
import { FULL_BODY_TYPES } from "./svg/component-traits"

// This test is NOT under skills/pptfast/ (where the files it guards live)
// because vitest.config.ts's `include` only picks up `src/**/*.test.{ts,tsx}`
// and `tests/bench/**/*.test.{ts,tsx}` — nothing under skills/ is currently
// wired into any test runner. Rather than teach vitest a new include glob
// for a single file, this lives in src/ (which is already scanned) and reads
// the skill files and their reference booklets by repo-relative path.

const ROOT = process.cwd()
const SKILL_ROOT_REL = "skills/pptfast"
const EN_REL = `${SKILL_ROOT_REL}/SKILL.md`
const ZH_REL = `${SKILL_ROOT_REL}/SKILL.zh-CN.md`
const REF = (name: string) => `${SKILL_ROOT_REL}/references/${name}`

const EXPECTED_EN_REL = [
  "SKILL.md",
  "references/spec.md",
  "references/layouts.md",
  "references/components.md",
  "references/density.md",
  "references/branding.md",
  "references/images.md",
  "references/validate.md",
] as const

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
}

function frontmatter(text: string): string {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) throw new Error("no --- frontmatter block found")
  return m[1]!
}

/** `wc -l` semantics: a trailing newline does not add a line. Empty → 0. */
function wcL(text: string): number {
  if (text.length === 0) return 0
  const body = text.endsWith("\n") ? text.slice(0, -1) : text
  return body.split("\n").length
}

function linesOf(text: string): string[] {
  if (text.length === 0) return []
  const body = text.endsWith("\n") ? text.slice(0, -1) : text
  return body.split("\n")
}

function consecutivePipeRowCount(text: string, headerPrefix: string): number {
  const lines = linesOf(text)
  const start = lines.findIndex((l) => l.startsWith(headerPrefix))
  if (start === -1) throw new Error(`table header not found: ${JSON.stringify(headerPrefix)}`)
  let n = 0
  for (let i = start; i < lines.length; i++) {
    if (!lines[i]!.startsWith("|")) break
    n++
  }
  return n
}

function posixRel(from: string, to: string): string {
  return relative(from, to).split("\\").join("/")
}

function listSkillMarkdown(): { abs: string; rel: string }[] {
  const root = join(ROOT, SKILL_ROOT_REL)
  const out: { abs: string; rel: string }[] = []
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) walk(abs)
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        out.push({ abs, rel: posixRel(root, abs) })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

function zhSiblingRel(enRel: string): string {
  if (!enRel.endsWith(".md")) throw new Error(`not a markdown path: ${enRel}`)
  return `${enRel.slice(0, -".md".length)}.zh-CN.md`
}

function sectionAfter(text: string, heading: RegExp, nextHeading = /^##+ /m): string {
  const m = text.match(heading)
  expect(m, `heading ${heading} missing`).toBeTruthy()
  const rest = text.slice(m!.index! + m![0].length)
  const next = rest.search(nextHeading)
  return next === -1 ? rest : rest.slice(0, next)
}

function pptfastCommands(section: string): string[] {
  return [...section.matchAll(/^pptfast .+$/gm)].map((mm) => mm[0].replace(/\s+#.*$/, "").trimEnd())
}

/**
 * Pull the "Use" column (3rd `|`-delimited cell) out of every data row of
 * the "## Component selection" table, then collect every backtick-quoted
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

  it("every English skill markdown file has a ZH sibling, and the discovered EN set is closed", () => {
    const files = listSkillMarkdown()
    const en = files.filter((f) => !f.rel.endsWith(".zh-CN.md"))
    const discovered = en.map((f) => f.rel).sort()
    const expected = [...EXPECTED_EN_REL].sort()
    const unexpected = discovered.filter((rel) => !EXPECTED_EN_REL.includes(rel as (typeof EXPECTED_EN_REL)[number]))
    const missing = expected.filter((rel) => !discovered.includes(rel))
    expect(
      { unexpected, missing },
      "discovered English markdown under skills/pptfast/ is not the documented set",
    ).toEqual({ unexpected: [], missing: [] })

    for (const file of en) {
      const siblingRel = zhSiblingRel(file.rel)
      const siblingAbs = join(ROOT, SKILL_ROOT_REL, siblingRel)
      expect(existsSync(siblingAbs), `missing ZH sibling ${SKILL_ROOT_REL}/${siblingRel}`).toBe(true)
    }
  })

  it("every ZH skill markdown file is a reading mirror (mirror_of, no name:), and no EN references file registers a skill", () => {
    const files = listSkillMarkdown()
    for (const file of files) {
      const text = readFileSync(file.abs, "utf8")
      if (file.rel.endsWith(".zh-CN.md")) {
        const fm = frontmatter(text)
        expect(fm, `${file.rel} must declare mirror_of:`).toMatch(/^mirror_of:/m)
        expect(fm, `${file.rel} must NOT have a name: frontmatter field`).not.toMatch(/^name:/m)
      } else if (file.rel.startsWith("references/")) {
        expect(text, `${file.rel} must NOT have a name: field`).not.toMatch(/^name:/m)
      }
    }
  })

  it("SKILL.md stays within the slim-playbook line budget", () => {
    expect(wcL(read(EN_REL)), "SKILL.md exceeded 120 lines (wc -l semantics)").toBeLessThanOrEqual(120)
  })

  it("the component-selection table stays within 40 lines and matches ZH row count", () => {
    const enN = consecutivePipeRowCount(read(EN_REL), "| Content shape")
    const zhN = consecutivePipeRowCount(read(ZH_REL), "| 内容形态")
    expect(enN, "SKILL.md component table missing").toBeGreaterThan(0)
    expect(enN, "SKILL.md component table exceeded 40 lines").toBeLessThanOrEqual(40)
    expect(zhN, "ZH component table row count diverged from EN").toBe(enN)
  })

  it("the component-selection table's Use column lists the same backtick-quoted ids in the same order in both files", () => {
    const en = componentSelectionUseTokens(read(EN_REL), "## Component selection")
    const zh = componentSelectionUseTokens(read(ZH_REL), "## 组件选型")

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
    const enDecl = fullBodyDeclarationIds(read(REF("components.md")), " are *full-body*")
    const zhDecl = fullBodyDeclarationIds(read(REF("components.zh-CN.md")), " 是「满幅」")
    const enEnum = fullBodyEnumerationIds(read(REF("density.md")), "sharing it: ", ".")
    const zhEnum = fullBodyEnumerationIds(read(REF("density.zh-CN.md")), "而不是与其他组件共享：", "。")

    // internal consistency: the slash list (components.md) and the enum
    // (density.md) must agree, in both languages.
    expect(new Set(enEnum), "references/density.md's full-body enum disagrees with references/components.md's slash list").toEqual(
      new Set(enDecl),
    )
    expect(
      new Set(zhEnum),
      "references/density.zh-CN.md's full-body enum disagrees with references/components.zh-CN.md's slash list",
    ).toEqual(new Set(zhDecl))

    const missingFromZh = enDecl.filter((id) => !zhDecl.includes(id))
    const missingFromEn = zhDecl.filter((id) => !enDecl.includes(id))
    expect(
      { missingFromZh, missingFromEn },
      "full-body component type list drifted between references/components.md and references/components.zh-CN.md",
    ).toEqual({ missingFromZh: [], missingFromEn: [] })

    // cross-check against the actual code: a new/removed full-body type
    // should fail this doc test too, not just the code's own trait test.
    const missingFromCode = enDecl.filter((id) => !FULL_BODY_TYPES.has(id as never))
    const missingFromDocs = [...FULL_BODY_TYPES].filter((id) => !enDecl.includes(id))
    expect(
      { missingFromCode, missingFromDocs },
      "references/components.md's declared full-body list no longer matches FULL_BODY_TYPES in src/svg/component-traits.ts",
    ).toEqual({ missingFromCode: [], missingFromDocs: [] })
  })

  it("both files carry the stock-photos section with the same CLI command lines", () => {
    const en = sectionAfter(read(REF("images.md")), /^### Stock photos$/m)
    const zh = sectionAfter(read(REF("images.zh-CN.md")), /^### 图库配图$/m)
    expect(pptfastCommands(en).length, "references/images.md stock-photos section has no pptfast command lines").toBeGreaterThan(0)
    expect(pptfastCommands(zh), "stock-photos sections' pptfast command lines diverge between EN and ZH").toEqual(
      pptfastCommands(en),
    )
    expect(en).toContain("pptfast asset-brief")
    expect(en).toContain("pptfast images search")
    expect(en).toContain("pptfast images fetch")
    expect(en).toContain("pptfast images generate")
    expect(en).toContain("pptfast config set pexels.apiKey")
    expect(en).toContain("pptfast config set images.generators.grok.enabled true")
  })

  it("both files carry the Brand-themes section with the same CLI command lines", () => {
    // brand-extract wave review noted this section's EN/ZH parity was
    // unguarded. Structural guard: both sections exist, and every backtick
    // `pptfast …` command line inside them matches verbatim (commands are
    // language-invariant; prose stays free per this file's philosophy).
    // Commands live in ```bash fenced blocks (not inline backticks) — match
    // whole command lines; trailing per-line comments are language-variant
    // prose, so strip them before comparing.
    const en = pptfastCommands(sectionAfter(read(REF("branding.md")), /^## Brand themes[^\n]*$/m, /^## /m))
    const zh = pptfastCommands(sectionAfter(read(REF("branding.zh-CN.md")), /^## 品牌主题[^\n]*$/m, /^## /m))
    expect(en.length, "references/branding.md Brand-themes section has no pptfast command lines").toBeGreaterThan(0)
    expect(zh, "Brand-themes sections' pptfast command lines diverge between EN and ZH").toEqual(en)
  })

  it("both files carry the serve review-loop section with the same command lines", () => {
    // `pptfast serve` is the deck's review path, in every harness: the
    // loop (`serve --no-open`, report the URL, read the annotations back,
    // stop the job) must exist in both files with identical command lines
    // — same structural guard as the Brand-themes test above.
    const en = sectionAfter(read(REF("validate.md")), /^### Showing the deck to the user$/m)
    const zh = sectionAfter(read(REF("validate.zh-CN.md")), /^### 把 deck 拿给用户看$/m)
    expect(pptfastCommands(en).length, "references/validate.md serve section has no pptfast command lines").toBeGreaterThan(0)
    expect(pptfastCommands(zh), "serve sections' pptfast command lines diverge between EN and ZH").toEqual(pptfastCommands(en))
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

  it("both files name the same six sparse pin-only ids in the Sparse-page contract", () => {
    const ids = ["statement", "pull-quote", "verse-chapter", "stat-hero", "one-evidence", "mono-bleed"] as const
    const en = sectionAfter(read(REF("layouts.md")), /^### Sparse-page contract$/m)
    const zh = sectionAfter(read(REF("layouts.zh-CN.md")), /^### 稀排页合同$/m)
    for (const id of ids) {
      expect(en, `references/layouts.md Sparse-page contract missing ${id}`).toContain(`\`${id}\``)
      expect(zh, `references/layouts.zh-CN.md 稀排页合同 missing ${id}`).toContain(`\`${id}\``)
    }
    expect(en).toMatch(/not a new `pacing`/)
    expect(zh).toMatch(/不是新的 `pacing`/)
    expect(en).toContain("slide.notes")
    expect(zh).toContain("slide.notes")
    expect(en, "branding: \"full\" moved out of layouts.md").not.toContain('branding: "full"')
    expect(zh, "branding: \"full\" moved out of layouts.zh-CN.md").not.toContain('branding: "full"')
    expect(read(REF("branding.md"))).toContain('branding: "full"')
    expect(read(REF("branding.zh-CN.md"))).toContain('branding: "full"')
  })

  it("both files ask the narrative interview with the same closed option ids, the same ★ defaults, and the same gate block", () => {
    // The interview is the one place the skill hands a closed vocabulary to
    // the user instead of to the model, so a translation that quietly grew a
    // fifth Q2 option, moved a ★, or dropped the gate block would give
    // Chinese-reading harnesses a different interview. Option ids are
    // language-invariant (they are IR enum values or fixed composite ids) —
    // the prose around them stays free, same as every other test here.
    // One question per line, options separated by " · ". An option's id is
    // the first backtick token of its segment — later backticks on the same
    // segment are the axis values it writes (`talk-pyramid` → `pyramid`),
    // which are prose, not things the user picks.
    const questionOptions = (section: string, n: number): { ids: string[]; starred: string[] } => {
      const line = section.match(new RegExp(`^\\*\\*Q${n}[^\\n]*$`, "m"))
      expect(line, `Q${n} line missing from the interview section`).toBeTruthy()
      const ids: string[] = []
      const starred: string[] = []
      for (const segment of line![0].split(" · ")) {
        const id = segment.match(/`([^`]+)`/)?.[1]
        expect(id, `Q${n} has an option segment with no backticked id: ${segment}`).toBeTruthy()
        ids.push(id!)
        if (segment.includes("★")) starred.push(id!)
      }
      return { ids, starred }
    }
    const en = sectionAfter(read(REF("spec.md")), /^### Narrative interview \(at most one round\)$/m)
    const zh = sectionAfter(read(REF("spec.zh-CN.md")), /^### 叙事访谈（最多一轮）$/m)

    // ★ pins the pitch shape (customer × talk-pyramid × spacious) plus
    // builtin theme. Empty-workspace interviews must land there, named as
    // a default, not as a reading of the room.
    for (const [n, expected, starred] of [
      [1, [...AUDIENCE_VALUES], "customer"],
      [2, ["talk-pyramid", "talk-showcase", "read-brief", "teach"], "talk-pyramid"],
      [3, [...PACING_VALUES], "spacious"],
      [4, ["extract", "builtin", "later"], "builtin"],
    ] as const) {
      const enQ = questionOptions(en, n)
      const zhQ = questionOptions(zh, n)
      // Set comparison against the closed list: the interview orders its
      // options by what reads best (★ first on Q3), not by the enum's order.
      expect(
        [...enQ.ids].sort(),
        `references/spec.md Q${n} option ids drifted from the closed list`,
      ).toEqual([...expected].sort())
      expect(zhQ.ids, `references/spec.zh-CN.md Q${n} option ids diverge from EN`).toEqual(enQ.ids)
      expect(enQ.starred, `references/spec.md Q${n} ★ default drifted off the pitch-form table`).toEqual([starred])
      expect(zhQ.starred, `Q${n}'s ★ default moved between EN and ZH`).toEqual(enQ.starred)
    }

    // Every strategy the engine knows has to be reachable from the
    // interview — four through Q2, `storytelling` through derivation.
    for (const strategy of STRATEGY_VALUES) {
      expect(en, `references/spec.md interview never mentions strategy ${strategy}`).toContain(`\`${strategy}\``)
      expect(zh, `references/spec.zh-CN.md interview never mentions strategy ${strategy}`).toContain(`\`${strategy}\``)
    }

    // The lookup must name every preset. Check by `id` inclusion, not by
    // walking every backtick token: the NARRATIVE_INTERVIEW fence is a
    // verbatim block, and naive pairing across it inverts later captures.
    for (const id of Object.keys(NARRATIVE_PRESETS)) {
      expect(en, `references/spec.md's interview lookup never names preset ${id}`).toContain(`\`${id}\``)
      expect(zh, `references/spec.zh-CN.md's interview lookup never names preset ${id}`).toContain(`\`${id}\``)
    }

    // The anti-self-answer gate: a fixed block the agent prints, and a ban on
    // touching spec files while any axis is still `?`. Both halves, verbatim,
    // in both files.
    const gate = "NARRATIVE_INTERVIEW\naudience: ?\ntell: ?\npacing: ?\nbrand: ?"
    expect(en, "references/spec.md lost the NARRATIVE_INTERVIEW gate block").toContain(gate)
    expect(zh, "references/spec.zh-CN.md lost the NARRATIVE_INTERVIEW gate block").toContain(gate)
    for (const section of [en, zh]) {
      expect(section, "the gate must name deck.spec.json as the thing that stays unwritten").toContain("deck.spec.json")
      expect(section, "the interview must still forbid the agent from answering its own questions").toMatch(
        /Do not fill them in|不要自己填/,
      )
      expect(section, "an unmanned run must still print the filled block").toContain("(no user in this run)")
    }

    expect(en, "★ must be named as a default, not as a read of the room").toContain(
      "name the ★ option as a default, not as a read",
    )
    expect(zh, "★ must be named as a default, not as a read of the room").toContain(
      "把 ★ 点明成默认，不是对用户处境的读数",
    )
    expect(en, "typeScale stays off the spec").toContain("Do not write `typeScale` onto `deck.spec.json`")
    expect(zh, "typeScale stays off the spec").toContain("不要在 `deck.spec.json` 上写 `typeScale`")
    expect(en, "Q1's review condition belongs in a maintainer comment").toMatch(/<!--[\s\S]*?delete Q1[\s\S]*?-->/)
    expect(zh, "Q1's review condition belongs in a maintainer comment").toMatch(/<!--[\s\S]*?删掉 Q1[\s\S]*?-->/)
  })

  it("both SKILL files scan the workspace before asking and do not name an external shaping skill", () => {
    const en = read(EN_REL)
    const zh = read(ZH_REL)
    expect(en).toContain("Also scan the workspace before asking anyone anything")
    expect(zh).toContain("动手问人之前，先扫工作区")
    expect(en, "the skill must not name shaping").not.toMatch(/shaping/i)
    expect(zh, "the skill must not name shaping").not.toMatch(/shaping/i)
  })

  it("both spec booklets refuse a typeScale spec field and write confirmed narrative/theme/branding immediately", () => {
    const en = read(REF("spec.md"))
    const zh = read(REF("spec.zh-CN.md"))
    expect(en).toContain("Do not invent a `typeScale` field on the spec")
    expect(zh).toContain("不要在 spec 上发明 `typeScale` 字段")
    expect(en).toContain("Write the confirmed `narrative`, `theme`, and `branding`")
    expect(zh).toContain("立刻把确认下来的 `narrative`、`theme`、`branding` 写进")
  })

  it("every reference booklet has a read-when trigger, and SKILL.md indexes all of them", () => {
    const names = ["spec", "layouts", "components", "density", "branding", "images", "validate"] as const
    const enSkill = read(EN_REL)
    const zhSkill = read(ZH_REL)
    for (const name of names) {
      expect(read(REF(`${name}.md`)), `${name}.md missing Read this when`).toMatch(/^# .+\n\nRead this when /)
      expect(read(REF(`${name}.zh-CN.md`)), `${name}.zh-CN.md missing 何时读`).toMatch(/何时读：/)
      expect(enSkill, `SKILL.md does not index references/${name}.md`).toContain(`references/${name}.md`)
      expect(zhSkill, `SKILL.zh-CN.md does not index references/${name}.md`).toContain(`references/${name}.md`)
    }
  })

  it("slim SKILL files name the interview → spec → pages → validate → audit → render loop", () => {
    const en = read(EN_REL)
    const zh = read(ZH_REL)
    expect(en).toContain("Interview → spec → pages → validate → audit → render")
    expect(zh).toContain("访谈 → spec → pages → validate → audit → render")
    for (const step of ["interview", "spec", "pages", "validate", "audit", "render"] as const) {
      expect(en.toLowerCase(), `SKILL.md missing workflow step ${step}`).toContain(step)
    }
    expect(zh, "SKILL.zh-CN.md missing workflow step 访谈").toContain("访谈")
    for (const step of ["spec", "pages", "validate", "audit", "render"] as const) {
      expect(zh, `SKILL.zh-CN.md missing workflow step ${step}`).toContain(step)
    }
  })
})
