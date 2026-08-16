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
// So the deck rides an HTTP route instead (`registerRoute`), which is
// indifferent to call depth:
//
// - the MODEL sees one short line from `output.render`, plus a preview id.
//   A deck's SVG runs to tens of kilobytes and carries nothing the model can
//   act on, so it never enters the transcript.
// - the CARD reads that id out of the result text and fetches the bundle
//   from the route. Same-origin loopback only, and the bundle is held in
//   memory for the life of the process.
//
// Nothing here re-renders anything of its own. It shells out to the same
// packaged CLI the skill teaches, and reads the bundle that `preview --html`
// already writes — `manifest.json` plus one SVG per page. Keeping one
// rendering path is the point: a second renderer in a UI is how the
// promotional images and the review conclusions would stop describing the
// same product.
//
// Everything stateful lives inside `createPreviewService`, never at module
// scope. Two services (a plugin reload, a second profile, a test) must not
// be able to see each other's decks or each other's CLI path — a module-level
// `cliPath` meant the second `apply()` silently re-pointed the route the
// first one had already registered.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Cap on how much rendered SVG rides the presentation channel, in bytes. */
const MAX_PRESENTED_BYTES = 8 * 1024 * 1024

export const TOOL_NAME = 'pptfast_preview'

export const PREVIEW_ROUTE = '/pptfast/preview'

/** Cap on retained in-memory previews — a long session should not pin every deck it rendered. */
const MAX_RETAINED = 12

/**
 * Cap on retained on-disk records. Kept generously longer than the in-memory
 * cap: a record is a handful of short strings, and its whole job is to still
 * be there when a transcript is reopened days later.
 */
const MAX_PERSISTED = MAX_RETAINED * 20

/**
 * Where the id -> deck mapping outlives this process.
 *
 * The in-memory map dies with the server, and a dead preview id is a broken
 * promise: the card sits in a transcript the user scrolls back to days
 * later, and DSH restarts for every plugin reload. Before this existed,
 * clicking the export on any pre-restart card produced a 404 that the
 * browser dutifully saved as `pptx.json` — the worst possible failure, since
 * it looks like a download that worked.
 *
 * One file per preview id, never one shared index. A single JSON index is a
 * read-modify-write, and two previews finishing at once meant the second
 * write erased the first; a reader that caught the file mid-write fell back
 * to `{}` and then overwrote every record there was. Per-id files have no
 * shared region to lose, and each one is published by rename, which is
 * atomic — a reader sees the old file or the new one, never half of either.
 */
const RECORD_DIR = join(tmpdir(), 'pptfast-previews')

/**
 * Ids reach this module from a URL path and are used as filenames, so the
 * shape is checked rather than trusted. `randomUUID` is the only producer.
 */
const ID_PATTERN = /^[0-9a-fA-F-]{8,64}$/

/** The resolved deck a preview is pinned to, written next to its rendered pages. */
const SNAPSHOT_FILE = 'snapshot.ir.json'

/** A deck-local brand theme, copied beside the snapshot for the same reason. */
const THEME_FILE = 'theme.json'

/**
 * Thrown when the record survived but the deck it points at did not.
 *
 * The old code answered this case by re-reading the user's original target,
 * which is exactly the bug: the target may have moved on, so the card would
 * quietly start showing a different deck than the one it was created for. A
 * preview whose snapshot is gone is gone, and says so.
 */
class PreviewExpired extends Error {}

async function writeRecord(id, record) {
  await mkdir(RECORD_DIR, { recursive: true })
  // Published by rename: a concurrent reader never sees a partial file, and
  // the temp name carries its own uuid so two writers for the same id cannot
  // collide on the scratch file either.
  const scratch = join(RECORD_DIR, `.${id}.${randomUUID()}.tmp`)
  await writeFile(scratch, JSON.stringify(record))
  await rename(scratch, join(RECORD_DIR, `${id}.json`))
}

async function readRecord(id) {
  if (!ID_PATTERN.test(id)) return undefined
  try {
    return JSON.parse(await readFile(join(RECORD_DIR, `${id}.json`), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Trim the oldest records by mtime. Best-effort by design: a preview that
 * cannot be tidied up after is still a working preview, so nothing here is
 * allowed to fail the call that triggered it.
 */
async function pruneRecords() {
  try {
    const names = (await readdir(RECORD_DIR)).filter((n) => n.endsWith('.json'))
    if (names.length <= MAX_PERSISTED) return
    const dated = await Promise.all(
      names.map(async (name) => {
        try {
          return { name, mtime: (await stat(join(RECORD_DIR, name))).mtimeMs }
        } catch {
          return { name, mtime: 0 }
        }
      }),
    )
    dated.sort((a, b) => b.mtime - a.mtime)
    await Promise.all(dated.slice(MAX_PERSISTED).map((e) => unlink(join(RECORD_DIR, e.name)).catch(() => {})))
  } catch {
    // No record directory yet, or an unreadable one. Neither is this call's problem.
  }
}

/** Run the packaged CLI, resolving with its combined output. */
function runCli(cliPath, args, signal) {
  return new Promise((resolve_, reject) => {
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
      if (code === 0) resolve_({ stdout, stderr })
      else reject(new Error(stderr.trim() || stdout.trim() || `pptfast exited with code ${code}`))
    })
  })
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Where a deck project directory target actually lives, for the one thing
 * `assemble` cannot carry into the snapshot: a deck-local `theme.json`.
 *
 * The CLI auto-loads that file for a deck *directory* only, so an assembled
 * IR naming a brand theme would fail to render from anywhere else. Path-form
 * targets and bare names under the default decks root are both covered here.
 * A bare name under a project-configured `decksDir` is not — that combination
 * fails loudly on an unknown theme id rather than rendering the wrong thing,
 * which is the disposition the rest of this module takes too.
 */
async function locateDeckDir(target) {
  const direct = resolve(target)
  if (await isDirectory(direct)) return direct
  const named = join(homedir(), '.pptfast', 'decks', target)
  if (await isDirectory(named)) return named
  return undefined
}

/**
 * Copy a single-file IR target, rewriting every local asset src to an
 * absolute path.
 *
 * A relative src in an IR file resolves against that file's own directory
 * (the CLI's `loadDeckTarget`), so a byte-for-byte copy into a temp directory
 * would quietly lose every image. `assemble` performs the same rewrite for
 * the directory case; this is its single-file counterpart.
 */
async function snapshotIrFile(target, snapshotPath) {
  const raw = await readFile(target, 'utf8')
  const baseDir = dirname(resolve(target))
  let ir
  try {
    ir = JSON.parse(raw)
  } catch {
    // Not this module's error to explain. Hand the file to the CLI unchanged
    // and let its own parser produce the message the user should see.
    await writeFile(snapshotPath, raw)
    return
  }
  const images = ir?.assets?.images
  if (images && typeof images === 'object') {
    for (const asset of Object.values(images)) {
      const src = asset?.src
      if (typeof src !== 'string') continue
      if (src.startsWith('data:') || /^https?:\/\//.test(src) || isAbsolute(src)) continue
      asset.src = resolve(baseDir, src)
    }
  }
  await writeFile(snapshotPath, JSON.stringify(ir))
}

/**
 * Pin the target to one immutable deck, written into `outDir`.
 *
 * This is what makes the preview, the export and every later recall the same
 * deck. They used to be three independent readings of the user's target: the
 * user previewed deck A, edited a page, hit download and got deck B, and a
 * card reopened next week re-rendered whatever the target had become. Now the
 * target is read exactly once, here, and nothing downstream ever touches it
 * again.
 *
 * Local image files are the one thing the snapshot still points at rather
 * than owning — `assemble` rewrites their paths, it does not inline them.
 */
async function captureSnapshot(cliPath, target, outDir, signal) {
  const snapshot = join(outDir, SNAPSHOT_FILE)
  if (await isFile(target)) {
    await snapshotIrFile(target, snapshot)
    return { snapshot, themeFile: undefined }
  }
  await runCli(cliPath, ['assemble', target, '-o', snapshot], signal)
  const deckDir = await locateDeckDir(target)
  if (deckDir) {
    const source = join(deckDir, THEME_FILE)
    if (await isFile(source)) {
      const themeFile = join(outDir, THEME_FILE)
      await writeFile(themeFile, await readFile(source, 'utf8'))
      return { snapshot, themeFile }
    }
  }
  return { snapshot, themeFile: undefined }
}

function themeArgs(record) {
  return record.themeFile ? ['--theme-file', record.themeFile] : []
}

/**
 * Read the bundle `preview --html` wrote: the manifest, plus each page's SVG
 * inlined so the card needs no filesystem access of its own (it runs in a
 * browser).
 *
 * Every page keeps its metadata; `svg: null` means that one page's markup did
 * not fit the budget. Only the oversized page is dropped, never the pages
 * after it — a first page over the cap used to blank the entire deck, so one
 * heavy photo slide cost the user every other slide as well.
 */
async function readPreviewBundle(outDir) {
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
  const pages = []
  let total = 0
  let truncated = false
  for (const page of manifest.pages) {
    const svg = await readFile(join(outDir, page.file), 'utf8')
    const size = Buffer.byteLength(svg, 'utf8')
    if (total + size > MAX_PRESENTED_BYTES) {
      truncated = true
      pages.push({ ...page, svg: null })
      continue
    }
    total += size
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

/**
 * One preview service: a tool, the route its card fetches from, and the
 * decks the two share.
 *
 * Everything the pair needs is captured here rather than at module scope.
 * The CLI path in particular: it used to be a module-level variable the tool
 * factory assigned, so building a second tool re-pointed the route the first
 * one had already registered at the first one's CLI — silent, and wrong in
 * exactly the situations (reload, second profile, test) where it matters.
 */
export function createPreviewService(cliPath) {
  /**
   * `id -> { bundle, target, outDir, snapshot, themeFile }`, for the route
   * the card fetches from.
   *
   * The snapshot is kept alongside the deck because the preview's whole
   * purpose is deciding whether to keep the thing — so the card offers the
   * .pptx, rendered on demand from that snapshot rather than eagerly on
   * every preview. Rendering an export nobody asked for would double the
   * work of every preview call to serve the minority that end in a download.
   */
  const bundles = new Map()

  function cache(id, entry) {
    bundles.set(id, entry)
    while (bundles.size > MAX_RETAINED) bundles.delete(bundles.keys().next().value)
    return entry
  }

  async function remember(id, entry) {
    cache(id, entry)
    const { bundle: _bundle, ...record } = entry
    // Awaited, not fired and forgotten: the tool returning before its own
    // record lands means a card can fetch an id the disk has never heard of.
    await writeRecord(id, record)
    await pruneRecords()
  }

  /**
   * Find a preview by id, in increasing order of cost.
   *
   * A card lives in a transcript, and a transcript outlives everything: the
   * user scrolls back to a session from last week, and the card has to show
   * the deck it showed then. In-memory alone cannot do that — the map dies
   * with the process, and DSH restarts on every plugin reload — so a
   * historical session would have rendered an empty card and a download that
   * saved a 404 body.
   *
   * 1. memory — the same process that rendered it
   * 2. the bundle still on disk — `preview --html` already wrote manifest and
   *    SVGs to `outDir`, so a restart costs a re-read, not a re-render
   * 3. re-render from the snapshot — the temp directory is gone (a reboot, a
   *    cleaner), but the pinned deck is not
   *
   * All three answer with the same deck. Step 3 renders the snapshot taken
   * when the preview was created, never the user's target, so a card cannot
   * start showing a deck the user edited afterwards.
   */
  async function recallAnywhere(id) {
    const live = bundles.get(id)
    if (live) return live

    const record = await readRecord(id)
    if (!record) return undefined

    try {
      return cache(id, { ...record, bundle: await readPreviewBundle(record.outDir) })
    } catch {
      // Step 3: the output directory is gone, but the snapshot may not be.
    }

    if (!record.snapshot) {
      // Written before previews were pinned to a snapshot. Re-reading the
      // target would be a guess dressed up as a result.
      throw new PreviewExpired('this preview predates deck snapshots and can no longer be reproduced')
    }
    try {
      await access(record.snapshot)
    } catch {
      throw new PreviewExpired(`the deck snapshot for this preview is gone (${record.snapshot})`)
    }

    const outDir = await mkdtemp(join(tmpdir(), 'pptfast-preview-'))
    await runCli(cliPath, ['preview', record.snapshot, '-o', outDir, '--html', ...themeArgs(record)])
    const entry = cache(id, { ...record, outDir, bundle: await readPreviewBundle(outDir) })
    await writeRecord(id, { ...record, outDir })
    return entry
  }

  /**
   * Serve a rendered deck to this plugin's own card.
   *
   * Loopback-only by the same reasoning modlens's routes use: this is a local
   * dev surface, and a deck the user just generated is theirs alone. The id
   * is random rather than sequential so a page on another origin cannot walk
   * the space even if it somehow reached the port.
   */
  function registerRoute(ctx) {
    ctx.webServer.register({
      name: 'pptfast-preview',
      kind: 'prefix',
      path: PREVIEW_ROUTE,
      handler: async (req, res) => {
        const rest = String(req.url || '').split(PREVIEW_ROUTE)[1]?.split('?')[0]?.replace(/^\//, '') ?? ''
        const wantsPptx = rest.endsWith('/pptx')
        const id = wantsPptx ? rest.slice(0, -'/pptx'.length) : rest
        let entry
        try {
          entry = ID_PATTERN.test(id) ? await recallAnywhere(id) : undefined
        } catch (error) {
          if (!(error instanceof PreviewExpired)) throw error
          // 410, not 404: the id was real, the deck behind it is not. Saying
          // so is the whole point — the alternative is re-rendering today's
          // version of a file and passing it off as the one in the card.
          res.writeHead(410, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: error.message }))
          return
        }
        if (!entry) {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'unknown preview id' }))
          return
        }
        if (!wantsPptx) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(entry.bundle))
          return
        }
        // Rendered here, not at preview time: the export is what the user
        // asks for after deciding they like the deck, and most previews never
        // get that far. From the snapshot, so the .pptx the user saves is the
        // deck they just paged through.
        try {
          const base =
            (entry.bundle && entry.bundle.title) ||
            String(entry.target).split(/[\\/]/).pop().replace(/\.[^.]+$/, '') ||
            'deck'
          const name = base.replace(/[^\w.-]+/g, '-') + '.pptx'
          const pptxPath = join(entry.outDir, name)
          await runCli(cliPath, ['render', entry.snapshot, '-o', pptxPath, ...themeArgs(entry)])
          const bytes = await readFile(pptxPath)
          res.writeHead(200, {
            'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'content-disposition': `attachment; filename="${name}"`,
            'content-length': bytes.length,
          })
          res.end(bytes)
        } catch (error) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: String(error && error.message ? error.message : error) }))
        }
      },
    })
  }

  const tool = {
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
      const target = String(args.target)
      const outDir = await mkdtemp(join(tmpdir(), 'pptfast-preview-'))
      const { snapshot, themeFile } = await captureSnapshot(cliPath, target, outDir, exec?.signal)
      // Previewed from the snapshot, not the target: this is the single read
      // that everything the user later does with this preview refers back to.
      await runCli(
        cliPath,
        ['preview', snapshot, '-o', outDir, '--html', ...themeArgs({ themeFile })],
        exec?.signal,
      )
      const bundle = await readPreviewBundle(outDir)
      const findingCount = bundle.pages.reduce((n, p) => n + (p.findings?.length ?? 0), 0)
      const previewId = randomUUID()
      await remember(previewId, { bundle, target, outDir, snapshot, themeFile })
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

  return { tool, registerRoute, remember, recall: (id) => bundles.get(id), recallAnywhere }
}

/**
 * Shorthand for a service whose route is never registered — the tool alone.
 * Each call builds its own service, so no two callers share anything.
 */
export function definePreviewTool(cliPath) {
  return createPreviewService(cliPath).tool
}

/** Exposed for the plugin's own tests — not part of any DSH contract. */
export const __testing = {
  readPreviewBundle,
  modelSummary,
  captureSnapshot,
  readRecord,
  RECORD_DIR,
  MAX_PRESENTED_BYTES,
  MAX_PERSISTED,
  PreviewExpired,
}
