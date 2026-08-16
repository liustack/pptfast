// DeepSeek Harness (DSH) plugin: registers the pptfast deck-generation
// skill into DSH's skill system (v0, skill-registration wave). The model
// then drives the pptfast CLI from the DSH terminal exactly the way the
// skill teaches every other harness.
//
// Loaded via the package root export (`exports["."]` → this file) and the
// cordis.patch.yml bundle row `@liustack/pptfast` — DSH's plugin card
// derives its label by stripping the scope, so the card reads "pptfast".
//
// Verified against DSH 0.1.0-rc.6 source:
// - `ctx.skills.register(registration)` takes the skill *content* as a
//   string (frontmatter must be stripped — the registry treats content as
//   body verbatim) and returns a disposer; registration rides a Cordis
//   effect, so unloading the plugin removes the skill (reversible, no
//   residue).
// - The profile's `node_modules/.bin` never enters the DSH terminal's
//   PATH (dsh-subprocess inherits the parent env untouched), so the skill
//   body gets a runtime preamble that maps `pptfast <args>` onto
//   `node <abs path to this package's dist/cli.js> <args>` — no PATH
//   lookup, no npx, plugin and engine version-locked together (the
//   modlens precedent).
// - Registered names carry the pptfast identity ("pptfast") and collide
//   with no built-in skill (`dsh-badge`, `cordis-plugin-development`,
//   `editing-cordis-compositions`) or provider (`runtime`, `filesystem`,
//   `dsh-badge`).
//
// This file is plain dependency-free JS by design (node builtins only):
// no build step, no dsh type imports, resilient to rc surface drift.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { definePreviewTool, registerPreviewRoute, TOOL_NAME } from './preview-tool.js'

const SKILL_FILE_URL = new URL('../skills/pptfast/SKILL.md', import.meta.url)
const SKILL_DIR = fileURLToPath(new URL('../skills/pptfast/', import.meta.url))
const CLI_PATH = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

export const name = 'pptfast'
export const inject = ['skills', 'tools']

export const SKILL_NAME = 'pptfast'
export const PREVIEW_TOOL_NAME = TOOL_NAME

/**
 * Split SKILL.md into { description, body }. DSH's runtime registry does
 * not parse frontmatter (that is the filesystem provider's job), so the
 * `---` block must come off here and the description travels as its own
 * registration field.
 */
export function parseSkillMarkdown(raw) {
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!fm) {
    throw new Error('SKILL.md has no frontmatter block')
  }
  const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
  if (!description) {
    throw new Error('SKILL.md frontmatter has no description field')
  }
  const body = raw.slice(fm[0].length).trim()
  if (body === '') {
    throw new Error('SKILL.md has an empty body')
  }
  return { description, body }
}

/**
 * The DSH-specific note prepended to the skill body. Kept as a function of
 * the CLI path so tests can pin the contract without touching the module
 * constant.
 */
export function dshRuntimePreamble(cliPath) {
  return [
    '## DSH runtime note (injected by the pptfast DSH plugin)',
    '',
    'The `pptfast` bin is not on PATH in this environment. Whenever this playbook says `pptfast <args>`, run this in the terminal instead:',
    '',
    '```bash',
    `node "${cliPath}" <args>`,
    '```',
    '',
    'That CLI ships inside this plugin\'s own package, version-locked to this skill, so it wins over the "Run it" section below: ignore the launcher scripts there, this line is the mapping. Only if that file is missing, fall back to `npx -y @liustack/pptfast <args>`.',
  ].join('\n')
}

export function apply(ctx) {
  // Any failure degrades loudly instead of taking the plugin's host scope
  // down: a skill that fails to register is a console line, not a crash.
  let skill
  try {
    skill = parseSkillMarkdown(readFileSync(SKILL_FILE_URL, 'utf8'))
  } catch (error) {
    console.error(`[pptfast] skill registration skipped (cannot read ${fileURLToPath(SKILL_FILE_URL)}): ${error}`)
    return
  }
  // The preview tool is what gives pptfast a seat in the conversation. The
  // skill alone leaves every call belonging to `bash`, whose card this plugin
  // cannot contribute to — which is why the review loop used to end in "open
  // this URL yourself". Registered first and independently: a tool failure
  // must not cost the skill, and vice versa.
  try {
    ctx.tools.register(definePreviewTool(CLI_PATH))
  } catch (error) {
    console.error(`[pptfast] preview tool registration skipped: ${error}`)
  }

  // The route the preview card fetches a rendered deck from. `webServer`
  // exists only under the web profile and this cordis has no optional-inject
  // form, so it rides a scoped `ctx.inject`: the closure runs when the
  // service appears and never runs where it does not, leaving headless
  // untouched (modlens's own routes take the same shape).
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      try {
        registerPreviewRoute(scope)
      } catch (error) {
        console.error(`[pptfast] preview route skipped: ${error}`)
      }
    })
  }

  try {
    // The returned disposer is intentionally unused here: register() wires
    // itself as a Cordis effect on the calling context, so disposing this
    // plugin's fiber (plugin remove / reload) unregisters the skill.
    ctx.skills.register({
      name: SKILL_NAME,
      description: skill.description,
      source: 'bundled',
      content: `${dshRuntimePreamble(CLI_PATH)}\n\n${skill.body}`,
      path: fileURLToPath(SKILL_FILE_URL),
      resourceBase: { kind: 'directory', path: SKILL_DIR },
    })
  } catch (error) {
    console.error(`[pptfast] skill registration skipped: ${error}`)
  }
}
