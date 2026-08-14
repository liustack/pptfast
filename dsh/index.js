// DeepSeek Harness (DSH) plugin: registers the pptfast deck-generation
// skill into DSH's skill system (v0, skill-registration wave) and three
// model-facing tools (v1, tool wave) that call the packaged render core
// in-process — no subprocess, no npx:
//   pptfast_validate — IR JSON in, slide count or a short fix list out
//   pptfast_render   — IR JSON in, .pptx + per-page SVG previews on disk
//   pptfast_themes   — the 17 built-in themes with a one-line character note
// The skill keeps teaching the full workflow; the CLI (via the DSH
// terminal) stays the fallback path and covers everything else.
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
// - `ctx.tools.register(definition)` (dsh-tools ToolRuntime) takes a raw
//   definition — name/description/parameters (JSON Schema) plus a
//   mandatory `output: { schema, render }` and an async `execute` — and
//   returns a disposer riding the same Cordis effect. A thrown execute
//   error becomes an `Error: <message>` text result for the model
//   (`toolErrorResult`), never a crashed DSH request. Raw JSON-Schema
//   registration over `defineTool` is the modlens precedent: no
//   @deepseek-ai package imports, this plugin owns its own argument
//   validation inside execute.
// - The profile's `node_modules/.bin` never enters the DSH terminal's
//   PATH (dsh-subprocess inherits the parent env untouched), so the skill
//   body gets a runtime preamble that maps `pptfast <args>` onto
//   `node <abs path to this package's dist/cli.js> <args>` — no PATH
//   lookup, no npx, plugin and engine version-locked together (the
//   modlens precedent).
// - Registered names carry the pptfast identity and collide with no
//   built-in skill (`dsh-badge`, `cordis-plugin-development`,
//   `editing-cordis-compositions`) or tool (rc.6 registers
//   `ask_user_question`, `bash`, `read`, `write`, `edit`, `glob`, `grep`,
//   `read_image`, `str_replace_editor`, `todo_write`, `web_fetch`,
//   `web_search`, `skill`, `send_message`, `interrupt_agent`, `job_*`,
//   `cordis_*`, goal tools, `ralph`, `pwsh` — plus the reserved
//   `run_code`); the `pptfast_` prefix keeps the namespace ours.
// - A tool-result image block is only safe on a route whose model declares
//   `image` input (dsh-tool-fs read_image's gate — the result enters
//   durable session history, so an image on a text-only route would wedge
//   every later request). pptfast_render therefore attaches its first-page
//   preview through `ctx.attachments.saveImage({ data, mediaType, name })`
//   (the write-side contract verified in dsh-attachment types.d.ts —
//   returns an ImageAttachmentRef `{ attachmentId, mediaType, bytes,
//   width, height, name? }` that an image content block carries under
//   `attachment`) ONLY behind that same gate, and degrades to on-disk SVG
//   paths everywhere else.
//
// This file is plain dependency-free JS by design (node builtins only, the
// render core lazily imported from ../dist): no build step, no dsh type
// imports, resilient to rc surface drift.
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_FILE_URL = new URL('../skills/pptfast/SKILL.md', import.meta.url)
const SKILL_DIR = fileURLToPath(new URL('../skills/pptfast/', import.meta.url))
const CLI_PATH = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const CORE_SPECIFIER = new URL('../dist/index.js', import.meta.url).href
const NODE_EXTRAS_SPECIFIER = new URL('../dist/node.js', import.meta.url).href

export const name = 'pptfast'
export const inject = ['skills', 'tools']

export const SKILL_NAME = 'pptfast'
export const TOOL_NAMES = ['pptfast_validate', 'pptfast_render', 'pptfast_themes']

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
    'This environment registers three pptfast tools — call them directly instead of the CLI for their jobs:',
    '',
    '- `pptfast_validate` — check a deck IR JSON object; returns the slide count on success, or a short list of fixes.',
    '- `pptfast_render` — render an IR object to a `.pptx` in the workspace, plus one preview SVG per page.',
    '- `pptfast_themes` — the 17 built-in themes, each with a one-line character note.',
    '',
    'Everything else in this playbook (schema, spec/assemble, audit, preview, serve, brand extract) still runs through the terminal CLI, and the CLI also remains the fallback if a tool is unavailable. The `pptfast` bin is not on PATH in this environment. Whenever this playbook says `pptfast <args>`, run this in the terminal instead:',
    '',
    '```bash',
    `node "${cliPath}" <args>`,
    '```',
    '',
    'That CLI ships inside this plugin\'s own package, version-locked to this skill — skip the "Prerequisites" install step below. Only if that file is missing, fall back to `npx -y @liustack/pptfast <args>`.',
  ].join('\n')
}

export function apply(ctx, config = {}) {
  registerSkill(ctx)
  registerTools(ctx, config)
}

function registerSkill(ctx) {
  // Any failure degrades loudly instead of taking the plugin's host scope
  // down: a skill that fails to register is a console line, not a crash.
  let skill
  try {
    skill = parseSkillMarkdown(readFileSync(SKILL_FILE_URL, 'utf8'))
  } catch (error) {
    console.error(`[pptfast] skill registration skipped (cannot read ${fileURLToPath(SKILL_FILE_URL)}): ${error}`)
    return
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

function registerTools(ctx, config) {
  if (ctx.tools === undefined || typeof ctx.tools.register !== 'function') {
    console.error('[pptfast] tool registration skipped: ctx.tools is unavailable')
    return
  }
  const getCore = createCoreLoader(config)
  for (const definition of buildToolDefinitions(ctx, getCore)) {
    try {
      // Same disposer story as the skill above: register() rides a Cordis
      // effect, so plugin unload unregisters every tool.
      ctx.tools.register(definition)
    } catch (error) {
      // Same-layer duplicate or a preview-era surface change: lose one
      // tool loudly instead of taking the whole plugin down.
      console.error(`[pptfast] ${definition.name} registration skipped: ${error}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Render-core loading. The tools call this package's own dist/ build
// in-process (dist/index.js + dist/node.js — the sealed-SDK internal
// surface, version-locked to this plugin). Loaded lazily so a broken or
// missing dist costs a tool call an explanatory error, never the plugin
// load; memoized on success, cleared on failure so a repaired install
// retries.
// ---------------------------------------------------------------------------

const CORE_SURFACE = [
  'validateIr',
  'formatIssues',
  'formatWarnings',
  'generatePptx',
  'renderSlideSvg',
  'listThemes',
  'getInstalledThemeIds',
  'resolveLocalAssets',
  'installNodePlatform',
]

function prepareCore(core) {
  for (const fn of CORE_SURFACE) {
    if (typeof core[fn] !== 'function') {
      throw new Error(`the pptfast render engine is missing ${fn}() — plugin and engine build out of sync; reinstall @liustack/pptfast`)
    }
  }
  // Idempotent: wires linkedom DOM + sharp-backed rasterize/recode into the
  // engine. sharp itself stays lazy inside the platform (optional
  // dependency) — a render without webp assets or preview rasterization
  // never touches it.
  core.installNodePlatform()
  return core
}

let bundledCorePromise

function loadBundledCore() {
  bundledCorePromise ??= (async () => {
    let modules
    try {
      modules = await Promise.all([import(CORE_SPECIFIER), import(NODE_EXTRAS_SPECIFIER)])
    } catch (error) {
      bundledCorePromise = undefined
      throw new Error(
        `the pptfast render engine failed to load (${String(error && error.message ? error.message : error).slice(0, 300)}) — reinstall @liustack/pptfast, or fall back to the CLI: npx -y @liustack/pptfast`,
      )
    }
    try {
      return prepareCore({ ...modules[0], ...modules[1] })
    } catch (error) {
      bundledCorePromise = undefined
      throw error
    }
  })()
  return bundledCorePromise
}

/**
 * `config.core` is the dependency-injection seam: a module-like object (or
 * promise of one) carrying the CORE_SURFACE functions. Tests feed the real
 * TS sources through it; production omits it and gets the dist/ build.
 */
export function createCoreLoader(config = {}) {
  if (config.core !== undefined) {
    let suppliedPromise
    return () => {
      suppliedPromise ??= Promise.resolve(config.core).then(prepareCore)
      return suppliedPromise
    }
  }
  return loadBundledCore
}

// ---------------------------------------------------------------------------
// Shared tool helpers
// ---------------------------------------------------------------------------

const MAX_ISSUE_LINES = 25

/**
 * Compress a ValidateResult issue list into model-actionable one-liners —
 * `page N (id) — path: message` via the engine's own formatIssues — capped
 * so a pathological deck cannot flood the model context.
 */
export function issueLines(core, issues) {
  const lines = issues.slice(0, MAX_ISSUE_LINES).map((issue) => core.formatIssues([issue]))
  if (issues.length > MAX_ISSUE_LINES) {
    lines.push(`… and ${issues.length - MAX_ISSUE_LINES} more issue(s) — fix the ones above first`)
  }
  return lines
}

function requireIrArg(args, toolName) {
  const ir = args === null || args === undefined ? undefined : args.ir
  if (typeof ir !== 'object' || ir === null || Array.isArray(ir)) {
    throw new Error(
      `${toolName} needs an "ir" object argument — the deck IR JSON (invoke the pptfast skill for the format; pptfast_themes lists theme ids).`,
    )
  }
  return ir
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw new Error('tool call aborted')
  }
}

/** Windows-safe file stem from the IR's own `filename` field. */
function safeFileStem(filename) {
  const stem = basename(String(filename ?? 'presentation')).replace(/[<>:"/\\|?*]/g, '_').trim()
  return stem === '' || stem === '.' || stem === '..' ? 'presentation' : stem
}

/**
 * The read_image capability gate, mirrored (dsh-tool-fs read-image.js): a
 * tool-result image enters durable session history, so it is only safe when
 * the exact resolved route declares image input. Returns a degrade reason,
 * or undefined when an image block may ride the result.
 */
async function imageRouteGateReason(ctx, exec) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  const agent = exec.agent
  const routed = agent && agent.session && typeof agent.session.requestHeader === 'function' ? agent.session.requestHeader()?.config : undefined
  const provider = routed?.provider ?? agent?.options?.provider
  const model = routed?.model ?? agent?.options?.model
  if (llm === undefined || provider === undefined || model === undefined) {
    return 'the current model route could not be resolved'
  }
  let info
  try {
    info = await llm.resolveModelInfo(provider, model, exec.signal)
  } catch (error) {
    return `the model route could not be inspected (${String(error && error.message ? error.message : error).slice(0, 120)})`
  }
  if (!Array.isArray(info?.inputModalities) || !info.inputModalities.includes('image')) {
    return `model "${model}" does not declare image input (an image tool result would break a text-only route)`
  }
  return undefined
}

/**
 * Best-effort first-page preview into the session: rasterize the page-1 SVG
 * (sharp, optional dependency) and commit it through the attachment
 * service's write side. Every failure path returns `{ note }` instead of
 * throwing — the render result already carries the on-disk SVG paths.
 */
async function tryAttachFirstPagePreview(ctx, exec, svgMarkup, fileStem) {
  const degrade = (reason) => ({ note: `first-page preview not attached: ${reason} — read the preview SVG paths instead` })
  try {
    const attachments = typeof ctx.get === 'function' ? ctx.get('attachments') : undefined
    if (attachments === undefined) return degrade('no attachment service is mounted')
    const gateReason = await imageRouteGateReason(ctx, exec)
    if (gateReason !== undefined) return degrade(gateReason)
    let sharp
    try {
      sharp = (await import('sharp')).default
    } catch {
      return degrade('optional dependency "sharp" is not installed')
    }
    const png = await sharp(Buffer.from(svgMarkup, 'utf8')).resize(1280, 720, { fit: 'fill' }).png().toBuffer()
    const limits = attachments.imageLimits
    if (limits !== undefined) {
      if (Array.isArray(limits.mediaTypes) && !limits.mediaTypes.includes('image/png')) {
        return degrade('this deployment does not accept image/png attachments')
      }
      const byteCap = Math.min(limits.maxImageBytes ?? Infinity, limits.maxMessageImageBytes ?? Infinity)
      if (png.length > byteCap) return degrade(`the ${png.length}-byte PNG exceeds the ${byteCap}-byte attachment limit`)
    }
    const ref = await attachments.saveImage({ data: png, mediaType: 'image/png', name: `${fileStem}-page-1.png` })
    return {
      image: {
        attachmentId: String(ref.attachmentId),
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        ...(ref.name === undefined ? {} : { name: ref.name }),
      },
    }
  } catch (error) {
    return degrade(String(error && error.message ? error.message : error).slice(0, 200))
  }
}

// ---------------------------------------------------------------------------
// Theme character notes (pptfast_themes). One line per built-in, distilled
// from each theme's own definition file (src/themes/<id>.ts — palette,
// fonts, and the documented target register), not invented: the Chinese
// originals live in those files' header comments and the docs.
// ---------------------------------------------------------------------------

export const THEME_NOTES = {
  consulting: 'Warm paper white, deep navy, and a gold accent with all-serif type — the crisp, restrained register of a consulting report.',
  enterprise: 'White walls with International Klein Blue color blocks — confident corporate register for company intros, product proposals, and business pitches.',
  academic: 'Off-white with deep green and serif headings — rigorous and scholarly, built for academic research, lectures, and thesis defenses.',
  insight: 'Near-black ground with signal red and tan gold — the Bloomberg/Economist financial-infographic mood for data-heavy analysis.',
  campaign: 'Deep purple ground with magenta, lake-blue, lemon, and mint brush doodles — loud and young, for event planning, launches, and marketing campaigns.',
  bloom: 'Warm milk white with wisteria, apricot, and dry-rose watercolor washes, serif headings, and fine botanical lines — soft and celebratory, for weddings and lifestyle brands.',
  classroom: 'Morandi-muted mist blue, lotus pink, grey-green, and milk coffee on paper white — gentle and approachable, for teaching courseware and training.',
  ink: 'Rice-paper ground, ink black, cinnabar red, and KaiTi headings — ink-wash guofeng for traditional culture, festivals, and tea or wine scenes.',
  tech: 'Near-black navy lit by a single electric cyan accent — cool, precise product-tech register for launches and engineering decks.',
  runway: 'Pure white, solid black masthead type, and true-red accents — high-contrast fashion-editorial grammar for brand and trend decks.',
  journal: 'Warm paper, brick red, and a serif masthead — humanistic editorial-journal register for narratives and annual reviews.',
  luxe: 'Deep charcoal with champagne gold — luxury-house register for premium brands, beauty, and gala occasions.',
  heritage: 'Putty warm base with burgundy and caramel copper — old-money craft register for brand heritage, anniversaries, and tastings.',
  pulse: 'Pale mint white, deep teal green, and a warm amber accent — clean, trustworthy, and vital, for healthcare and life-science decks.',
  terra: 'Sand ground with olive green and terracotta — plain, rooted, long-termist register for sustainability and ESG reporting.',
  ember: 'Warm white with fire orange and flame yellow — bright, rising, ready-to-pitch energy for startup fundraising decks.',
  vermilion: 'True red with golden yellow on warm rice white and SimSun display headings — solemn, uplifting official-report register for work reports and annual summaries.',
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const IR_PARAM = {
  type: 'object',
  description:
    'The deck IR JSON object (version 4): theme, optional narrative/seed, and a slides array. Get the schema and workflow from the pptfast skill (`pptfast schema`).',
}

function renderWarningLines(value) {
  return (value.warnings ?? []).map((line) => (line.startsWith('warning:') ? line : `warning: ${line}`))
}

export function buildToolDefinitions(ctx, getCore) {
  const validateTool = {
    name: 'pptfast_validate',
    description:
      'Validate a pptfast deck IR JSON object without rendering it. Returns the slide count and theme on success, or a short, path-annotated list of fixes when the IR is invalid. Run it before pptfast_render whenever you have edited IR by hand.',
    parameters: {
      type: 'object',
      properties: { ir: IR_PARAM },
      required: ['ir'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          slides: { type: 'integer' },
          theme: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          normalized: { type: 'array', items: { type: 'string' } },
        },
        required: ['ok'],
      },
      render: (_args, value) => {
        const lines = []
        if (value.ok) {
          lines.push(`IR valid — ${value.slides} slide(s), theme "${value.theme}".`)
        } else {
          lines.push(`IR invalid — fix these and retry:`)
          for (const line of value.errors ?? []) lines.push(`- ${line}`)
        }
        lines.push(...renderWarningLines(value))
        for (const note of value.normalized ?? []) lines.push(`note: normalized ${note}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    isConcurrencySafe: () => true,
    presentCall: () => ({ card: 'generic', title: 'Validate pptfast deck IR', kind: 'read' }),
    async execute(args) {
      const core = await getCore()
      const ir = requireIrArg(args, 'pptfast_validate')
      const v = core.validateIr(ir)
      const warnings = v.warnings === undefined ? {} : { warnings: issueLines(core, v.warnings) }
      const normalized = v.normalized === undefined ? {} : { normalized: [...v.normalized] }
      if (!v.ok) {
        return { ok: false, errors: issueLines(core, v.errors), ...warnings, ...normalized }
      }
      return { ok: true, slides: v.ir.slides.length, theme: v.ir.theme.id, ...warnings, ...normalized }
    },
  }

  const renderTool = {
    name: 'pptfast_render',
    description:
      'Render a pptfast deck IR JSON object to a native, editable .pptx plus one preview SVG per page. Writes into the session workspace by default (out_dir overrides). Deterministic: the same IR + theme + seed reproduces the same bytes. Placeholder pages must be filled first — validate with pptfast_validate when unsure.',
    parameters: {
      type: 'object',
      properties: {
        ir: IR_PARAM,
        theme: {
          type: 'string',
          description: 'Theme id override (replaces ir.theme.id) — run pptfast_themes for the list.',
        },
        seed: {
          type: 'integer',
          description: 'Layout-selection seed for revision stability (writes ir.seed). Reuse one seed across revisions of the same deck.',
        },
        out_dir: {
          type: 'string',
          description: 'Output directory. Default: the session workspace directory. A relative path resolves against the workspace.',
        },
      },
      required: ['ir'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          pptx_path: { type: 'string' },
          pptx_bytes: { type: 'integer' },
          slides: { type: 'integer' },
          theme: { type: 'string' },
          seed: { type: 'integer' },
          preview_dir: { type: 'string' },
          preview_paths: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          preview_image: {
            type: 'object',
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'integer' },
              width: { type: 'integer' },
              height: { type: 'integer' },
              name: { type: 'string' },
            },
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
          },
          preview_note: { type: 'string' },
        },
        required: ['pptx_path', 'pptx_bytes', 'slides', 'theme', 'preview_dir', 'preview_paths'],
      },
      render: (_args, value) => {
        const seedNote = value.seed === undefined ? '' : `, seed ${value.seed}`
        const lines = [
          `wrote ${value.pptx_path} (${value.slides} slide(s), ${value.pptx_bytes} bytes, theme "${value.theme}"${seedNote})`,
          `previews: ${value.preview_dir} (${value.preview_paths.length} SVG page(s))`,
        ]
        lines.push(...renderWarningLines(value))
        if (value.preview_note !== undefined) lines.push(`note: ${value.preview_note}`)
        const blocks = [{ type: 'text', text: lines.join('\n') }]
        if (value.preview_image !== undefined) {
          blocks.push({ type: 'image', attachment: { ...value.preview_image } })
        }
        return blocks
      },
    },
    // Cooperative budget: execute checks exec.signal between pipeline
    // stages (validate → assets → pptx → per-page previews).
    timeoutMs: 180_000,
    // Not parallel-safe on purpose: the output paths derive from
    // ir.filename, so two parallel calls with the same filename (say, two
    // theme candidates of one deck) would write the same .pptx and preview
    // directory and at least one reported result would be a lie. DSH's
    // scheduler only parallelizes calls that return exactly `true`, so
    // `false` serializes every render and keeps each result truthful.
    // (pptfast_validate / pptfast_themes write nothing and stay parallel.)
    isConcurrencySafe: () => false,
    presentCall: (args) => ({
      card: 'generic',
      title: 'Render pptfast deck to PPTX',
      kind: 'execute',
      ...(typeof args?.out_dir === 'string' ? { rawInput: { out_dir: args.out_dir } } : {}),
    }),
    async execute(args, exec) {
      const core = await getCore()
      const rawIr = requireIrArg(args, 'pptfast_render')
      if (args.theme !== undefined && typeof args.theme !== 'string') {
        throw new Error('pptfast_render "theme" must be a theme id string — run pptfast_themes for the list.')
      }
      if (args.seed !== undefined && !Number.isInteger(args.seed)) {
        throw new Error('pptfast_render "seed" must be an integer.')
      }
      if (args.out_dir !== undefined && typeof args.out_dir !== 'string') {
        throw new Error('pptfast_render "out_dir" must be a directory path string.')
      }
      if (args.theme !== undefined) {
        const installed = core.getInstalledThemeIds()
        if (!installed.includes(args.theme)) {
          throw new Error(`unknown theme "${args.theme}" — available: ${installed.join(', ')} (run pptfast_themes for descriptions)`)
        }
      }
      // Lossless-JSON deep clone: model arguments are deep-frozen snapshots,
      // and the theme/seed overrides must not mutate the caller's object.
      const ir = JSON.parse(JSON.stringify(rawIr))
      if (args.theme !== undefined) {
        ir.theme = { ...(typeof ir.theme === 'object' && ir.theme !== null ? ir.theme : {}), id: args.theme }
      }
      if (args.seed !== undefined) ir.seed = args.seed
      const v = core.validateIr(ir)
      if (!v.ok) {
        throw new Error(`IR invalid — fix these and retry:\n${issueLines(core, v.errors).join('\n')}`)
      }
      const warnings = v.warnings === undefined ? {} : { warnings: issueLines(core, v.warnings) }
      const sessionCwd = exec.agent?.session?.header?.cwd
      const baseDir = sessionCwd ?? process.cwd()
      const outDir = args.out_dir === undefined ? baseDir : isAbsolute(args.out_dir) ? args.out_dir : resolve(baseDir, args.out_dir)
      throwIfAborted(exec.signal)
      // Local-file asset paths in assets.images resolve against the
      // workspace (the CLI's own resolveLocalAssets step, minus the file
      // read that produced the IR).
      await core.resolveLocalAssets(v.ir, baseDir)
      throwIfAborted(exec.signal)
      const bytes = await core.generatePptx(v.ir)
      throwIfAborted(exec.signal)
      await mkdir(outDir, { recursive: true })
      const fileStem = safeFileStem(v.ir.filename)
      const pptxPath = join(outDir, `${fileStem}.pptx`)
      await writeFile(pptxPath, bytes)
      const previewDir = join(outDir, `${fileStem}-previews`)
      await mkdir(previewDir, { recursive: true })
      const previewPaths = []
      let firstPageSvg
      for (let i = 0; i < v.ir.slides.length; i++) {
        throwIfAborted(exec.signal)
        const svg = core.renderSlideSvg(v.ir, i)
        if (i === 0) firstPageSvg = svg
        const svgPath = join(previewDir, `${String(i + 1).padStart(3, '0')}-${v.ir.slides[i].type}.svg`)
        await writeFile(svgPath, svg)
        previewPaths.push(svgPath)
      }
      const attach = firstPageSvg === undefined ? {} : await tryAttachFirstPagePreview(ctx, exec, firstPageSvg, fileStem)
      return {
        pptx_path: pptxPath,
        pptx_bytes: bytes.length,
        slides: v.ir.slides.length,
        theme: v.ir.theme.id,
        ...(v.ir.seed === undefined ? {} : { seed: v.ir.seed }),
        preview_dir: previewDir,
        preview_paths: previewPaths,
        ...warnings,
        ...(attach.image === undefined ? {} : { preview_image: attach.image }),
        ...(attach.note === undefined ? {} : { preview_note: attach.note }),
      }
    },
  }

  const themesTool = {
    name: 'pptfast_themes',
    description:
      'List the 17 built-in pptfast themes: id, label, and a one-line character note. Use it to pick a theme id for pptfast_render (or ir.theme.id).',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        properties: {
          themes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['id', 'label', 'description'],
            },
          },
        },
        required: ['themes'],
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: value.themes.map((t) => `${t.id} (${t.label}): ${t.description}`).join('\n'),
        },
      ],
    },
    isConcurrencySafe: () => true,
    presentCall: () => ({ card: 'generic', title: 'List pptfast themes', kind: 'read' }),
    async execute() {
      const core = await getCore()
      return {
        themes: core.listThemes().map((t) => ({
          id: t.id,
          label: t.label,
          description: THEME_NOTES[t.id] ?? t.label,
        })),
      }
    },
  }

  return [validateTool, renderTool, themesTool]
}
