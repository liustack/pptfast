// The `pptfast_preview` DSH tool.
//
// Why a tool at all, when this plugin already registers a skill: a skill
// teaches the model to drive the CLI from the terminal, so every call in the
// transcript belongs to `bash` and renders in DSH's generic terminal card.
// pptfast owns no surface there, which is why the review loop has been "open
// http://127.0.0.1:4400 yourself" — the harness had nowhere to put a button.
// A registered tool owns its own `tool.call.toolview` key, and that key is
// the seat the in-conversation preview sits in.
//
// The payload split is the whole design, and the channel it rides took two
// attempts. `output.presentationMeta` looks like the right home — a
// structured, persisted, non-model-facing projection — but the registry
// computes it for TOP-LEVEL calls only, and this repo's own default agent
// preset runs in Code Mode, where every tool is invoked from inside
// `run_code` and is therefore a sub-call. Verified against a real session
// log: 34 top-level `run_code` calls, `pptfast_preview` never once among
// them, and no `presentationMeta` anywhere in the persisted result. The card
// dutifully rendered nothing.
//
// So the deck rides an HTTP route instead (`registerPreviewRoute`), which is
// indifferent to call depth:
//
// - the MODEL sees one short line from `output.render`, plus a preview id.
//   A deck's SVG runs to tens of kilobytes and carries nothing the model can
//   act on, so it never enters the transcript.
// - the CARD reads that id out of the result text and fetches the bundle
//   from the route. Same-origin loopback only, and the bundle is held in
//   memory for the life of the process.
//
// Nothing here re-renders anything. It shells out to the same packaged CLI
// the skill teaches, and reads the bundle that `preview --html` already
// writes — `manifest.json` plus one SVG per page. Keeping one rendering path
// is the point: a second renderer in a UI is how the promotional images and
// the review conclusions would stop describing the same product.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Cap on how much rendered SVG rides the presentation channel, in bytes. */
const MAX_PRESENTED_BYTES = 8 * 1024 * 1024

export const TOOL_NAME = 'pptfast_preview'

/** `id -> bundle`, for the route the card fetches from. */
const bundles = new Map()

/** Cap on retained previews — a long session should not pin every deck it rendered. */
const MAX_RETAINED = 12

export function rememberBundle(id, bundle) {
  bundles.set(id, bundle)
  while (bundles.size > MAX_RETAINED) bundles.delete(bundles.keys().next().value)
}

export function recallBundle(id) {
  return bundles.get(id)
}

/**
 * Serve a rendered deck to this plugin's own card.
 *
 * Loopback-only by the same reasoning modlens's routes use: this is a local
 * dev surface, and a deck the user just generated is theirs alone. The id is
 * random rather than sequential so a page on another origin cannot walk the
 * space even if it somehow reached the port.
 */
export function registerPreviewRoute(ctx) {
  ctx.webServer.register({
    name: 'pptfast-preview',
    kind: 'prefix',
    path: PREVIEW_ROUTE,
    handler: async (req, res) => {
      const id = String(req.url || '').split(PREVIEW_ROUTE)[1]?.split('?')[0]?.replace(/^\//, '')
      const bundle = id && bundles.get(id)
      if (!bundle) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unknown preview id' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(bundle))
    },
  })
}

export const PREVIEW_ROUTE = '/pptfast/preview'

/** Run the packaged CLI, resolving with its combined output. */
function runCli(cliPath, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const onAbort = () => child.kill()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || stdout.trim() || `pptfast exited with code ${code}`))
    })
  })
}

/**
 * Read the bundle `preview --html` wrote: the manifest, plus each page's SVG
 * inlined so the card needs no filesystem access of its own (it runs in a
 * browser). Oversized decks degrade to a manifest with no markup rather than
 * blowing up the session log — the card falls back to the file paths.
 */
async function readPreviewBundle(outDir) {
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
  const pages = []
  let total = 0
  let truncated = false
  for (const page of manifest.pages) {
    if (truncated) {
      pages.push({ ...page, svg: null })
      continue
    }
    const svg = await readFile(join(outDir, page.file), 'utf8')
    total += Buffer.byteLength(svg, 'utf8')
    if (total > MAX_PRESENTED_BYTES) {
      truncated = true
      pages.push({ ...page, svg: null })
      continue
    }
    pages.push({ ...page, svg })
  }
  return { ...manifest, pages, markupTruncated: truncated }
}

/** One short model-facing line — never the markup. */
function modelSummary(value) {
  const bits = [`rendered ${value.pageCount} page${value.pageCount === 1 ? '' : 's'} to ${value.outDir}`]
  // The card finds the deck by this id. It has to travel in model-facing
  // text because that is the only part of a sub-call's result the card is
  // guaranteed to see — see this module's own header for why the structured
  // channel was not an option.
  bits.unshift(`pptfast-preview:${value.previewId}`)
  if (value.findingCount > 0) bits.push(`${value.findingCount} audit finding${value.findingCount === 1 ? '' : 's'}`)
  else if (value.audited) bits.push('audit clean')
  else bits.push('audit skipped')
  bits.push('the user can page through it in this card — do not tell them to open a URL')
  return bits.join(' · ')
}

export function definePreviewTool(cliPath) {
  return {
    name: TOOL_NAME,
    description:
      'Render a pptfast deck and show it to the user as a slide preview inside this conversation. ' +
      'Accepts the same targets as the CLI: a deck project directory, a single IR json file, or a bare deck name. ' +
      'Prefer this over telling the user to open a preview URL — they can page through the deck right here.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Deck project directory, IR json file, or bare deck name — the same target the CLI takes.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          previewId: { type: 'string' },
          outDir: { type: 'string' },
          pageCount: { type: 'number' },
          findingCount: { type: 'number' },
          audited: { type: 'boolean' },
          bundle: { type: 'object', additionalProperties: true },
        },
        required: ['previewId', 'outDir', 'pageCount', 'findingCount', 'audited', 'bundle'],
        additionalProperties: true,
      },
      // Model-facing: one line. The deck itself is not information the model
      // can act on, and putting it here would spend the context window on
      // markup while telling the model nothing it does not already know.
      render(_args, value) {
        return [{ type: 'text', text: modelSummary(value) }]
      },
      // Still declared: on a top-level (native-mode) call this is the better
      // channel, and the card prefers it when present. Code Mode simply never
      // computes it, which is why the route exists as well.
      presentationMeta(_args, value) {
        return { card: 'pptfast-preview', previewId: value.previewId, bundle: value.bundle }
      },
    },
    async execute(args, exec) {
      const outDir = await mkdtemp(join(tmpdir(), 'pptfast-preview-'))
      await runCli(cliPath, ['preview', String(args.target), '-o', outDir, '--html'], exec?.signal)
      const bundle = await readPreviewBundle(outDir)
      const findingCount = bundle.pages.reduce((n, p) => n + (p.findings?.length ?? 0), 0)
      const previewId = randomUUID()
      rememberBundle(previewId, bundle)
      return {
        previewId,
        outDir,
        pageCount: bundle.pages.length,
        findingCount,
        // `checks` is present only when the audit actually ran. Absent is not
        // "clean" — the preview manifest goes out of its way to keep those
        // two apart, and collapsing them here would undo that.
        audited: Boolean(bundle.checks),
        bundle,
      }
    },
    timeoutMs: 120_000,
  }
}

/** Exposed for the plugin's own tests — not part of any DSH contract. */
export const __testing = { readPreviewBundle, modelSummary, MAX_PRESENTED_BYTES }
