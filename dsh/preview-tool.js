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
// first one had already registered. That extends to the on-disk records: each
// service gets its own subdirectory keyed by its CLI path, so one service can
// neither read another's decks nor evict them.
//
// ONE RENDER WINDOW is the rule everything else here follows. A preview and
// its .pptx are produced by a single `execute` call, from one snapshot, by
// one CLI process generation. Pinning the IR alone was not enough: a second
// CLI run re-reads project and user configuration (theme, style), re-reads
// image files off disk, re-fetches http assets, and may even be a different
// renderer version after a plugin upgrade. None of that is captured by an IR
// file, so the export could differ from the deck the user just approved in
// four separate ways. The download route therefore serves a file, and starts
// no process. The cost is one export per preview, including the previews
// nobody downloads. That is the deliberate price.
//
// What that buys, precisely — the earlier wording here claimed more than the
// code delivers, so here is the honest list:
//
//  - the deck structure and text: pinned, by the snapshot.
//  - local image BYTES: pinned, by inlining them into the snapshot as data
//    URIs (`inlineLocalImages`). Preview and render are still two processes
//    with a real window between them, and an image file edited inside that
//    window used to land in the export but not in the preview. Neither
//    process reads those files any more.
//  - the renderer build: the same `cliPath` for both runs, so only an
//    upgrade mid-`execute` could split them. Not defended against.
//  - project/user configuration: both runs read it, milliseconds apart, from
//    the same cwd. Not pinned — an edit landing exactly between them would
//    split preview from export. Small enough to accept, too small to claim
//    it cannot happen.
//  - http(s) assets, and local images in formats that need a recode (webp
//    and friends): still fetched or read per run. See `inlineLocalImages`.

import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

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
const RECORD_ROOT = join(tmpdir(), 'pptfast-previews')

/**
 * Records live one directory down, keyed by the service's CLI path.
 *
 * A flat shared directory made every service a peer of every other one:
 * service B's `recallAnywhere` happily found a deck service A had rendered
 * and served it, and the eviction budget was shared too, so a busy profile
 * silently deleted a quiet one's history. Splitting by CLI path is the
 * cheapest key that separates the cases that actually differ (a second
 * profile, an upgraded install, a test), and it doubles as a version fence:
 * a record written by a different renderer build is simply not visible.
 *
 * Hashed rather than embedded, because the CLI path is an absolute filesystem
 * path and would otherwise have to be flattened into a directory name.
 */
export function recordDirFor(cliPath) {
  return join(RECORD_ROOT, createHash('sha256').update(String(cliPath)).digest('hex').slice(0, 16))
}

/**
 * Age at which an orphaned scratch file is considered abandoned rather than
 * in flight. Scratch files are published by rename within a single write, so
 * anything this old belongs to a process that died mid-write.
 */
const SCRATCH_MAX_AGE_MS = 60 * 60 * 1000

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
 * and the round after that by re-rendering the pinned snapshot. Both are the
 * same bug at different depths: what comes back is built now, out of whatever
 * the configuration, the image files and the installed renderer happen to be
 * now, and is then presented as the deck sitting in the card. A preview whose
 * files are gone is gone, and says so.
 */
class PreviewExpired extends Error {}

/** Prefix of every directory this module creates for a preview's rendered deck. */
const OUT_DIR_PREFIX = 'pptfast-preview-'

/**
 * Written into every directory this module creates, and required before it
 * will delete one again.
 *
 * The name alone is not ownership. `pptfast-preview-` is a public string
 * sitting in a world-writable directory, so anyone — another tool, an older
 * pptfast, a person with a shell — can produce a path that passes a prefix
 * test, and eviction would then recurse into it with `force: true`. This file
 * is the part an outsider has no reason to have created, so it is the part
 * worth checking.
 */
const OWNER_MARKER = '.pptfast-preview-owner'

/** A fresh, marked directory for one preview's rendered deck. */
async function createOutDir() {
  const dir = await mkdtemp(join(tmpdir(), OUT_DIR_PREFIX))
  await writeFile(join(dir, OWNER_MARKER), JSON.stringify({ tool: TOOL_NAME, created: Date.now() }))
  return dir
}

/**
 * Is this directory one of ours to delete?
 *
 * Eviction removes the rendered deck as well as the record pointing at it,
 * which turns a bad `outDir` into a destructive operation. `remember` is an
 * exported entry point and a record is just JSON on disk, so the value is
 * checked rather than trusted. Three things have to hold: the directory sits
 * directly in the system temp directory, it carries this module's prefix, and
 * it holds the marker file `createOutDir` writes. The first two are cheap
 * filters over a name anyone can choose; the third is the one that actually
 * says "we made this". A directory failing any of them keeps its record
 * deleted and its own contents untouched, which is the safe direction to be
 * wrong in.
 */
async function isDisposableOutDir(dir) {
  if (typeof dir !== 'string' || dir === '') return false
  const resolved = resolve(dir)
  if (dirname(resolved) !== resolve(tmpdir())) return false
  if (!basename(resolved).startsWith(OUT_DIR_PREFIX)) return false
  return await isFile(join(resolved, OWNER_MARKER))
}

/** Best-effort removal of an evicted preview's rendered deck. */
async function discardOutDir(record) {
  const dir = record && record.outDir
  if (!(await isDisposableOutDir(dir))) return
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

async function writeRecord(dir, id, record) {
  // Checked here, at the write boundary, not only where records are read.
  // The id becomes a filename the moment the index went one-file-per-preview,
  // and validating reads alone left `remember` — an exported entry point —
  // able to write outside the record directory entirely: `remember("../../victim", …)`
  // resolves right out of it. The plugin itself only ever passes a
  // `randomUUID`, so nothing in production reached this, but the guarantee
  // was claimed before it was true.
  if (!ID_PATTERN.test(id)) throw new Error(`refusing to write a preview record for an unsafe id: ${id}`)
  await mkdir(dir, { recursive: true })
  // Published by rename: a concurrent reader never sees a partial file, and
  // the temp name carries its own uuid so two writers for the same id cannot
  // collide on the scratch file either.
  const scratch = join(dir, `.${id}.${randomUUID()}.tmp`)
  await writeFile(scratch, JSON.stringify(record))
  await rename(scratch, join(dir, `${id}.json`))
}

async function readRecord(dir, id) {
  if (!ID_PATTERN.test(id)) return undefined
  try {
    return JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Trim the oldest records by mtime, and take their rendered decks with them.
 *
 * Deleting the record alone was a leak with a straight face: the record is a
 * few hundred bytes, the directory it points at is an entire rendered deck
 * plus (now) an exported .pptx, and dropping the only pointer to it meant
 * nothing would ever clean it up. Abandoned scratch files got the same
 * treatment — the old filter skipped them explicitly, so a process that died
 * mid-write left one behind forever.
 *
 * Best-effort by design: a preview that cannot be tidied up after is still a
 * working preview, so nothing here is allowed to fail the call that
 * triggered it.
 */
async function pruneRecords(dir) {
  let names
  try {
    names = await readdir(dir)
  } catch {
    // No record directory yet, or an unreadable one. Neither is this call's problem.
    return
  }

  const now = Date.now()
  await Promise.all(
    names
      .filter((n) => n.endsWith('.tmp'))
      .map(async (name) => {
        const path = join(dir, name)
        try {
          // Age-gated, because a scratch file that is still young probably
          // belongs to a write happening right now in another process.
          if (now - (await stat(path)).mtimeMs < SCRATCH_MAX_AGE_MS) return
          await unlink(path)
        } catch {
          // Already gone, or renamed out from under us mid-check. Fine either way.
        }
      }),
  )

  const records = names.filter((n) => n.endsWith('.json'))
  if (records.length <= MAX_PERSISTED) return
  const dated = await Promise.all(
    records.map(async (name) => {
      try {
        return { name, mtime: (await stat(join(dir, name))).mtimeMs }
      } catch {
        return { name, mtime: 0 }
      }
    }),
  )
  dated.sort((a, b) => b.mtime - a.mtime)
  await Promise.all(
    dated.slice(MAX_PERSISTED).map(async (entry) => {
      const path = join(dir, entry.name)
      try {
        // The mtime that made this record look oldest was read before the
        // sort; by now another process may have refreshed it. Re-check, and
        // leave anything that moved. This narrows the window rather than
        // closing it — the record can still be rewritten between this stat
        // and the unlink below, and closing that properly needs a lock file,
        // which is more machinery than an eviction of the 240th-oldest
        // preview deserves. The consequence of losing the race is one card
        // reporting an expired preview earlier than it had to.
        if ((await stat(path)).mtimeMs !== entry.mtime) return
        const record = JSON.parse(await readFile(path, 'utf8'))
        await unlink(path)
        await discardOutDir(record)
      } catch {
        // Unreadable or already collected. Not this call's problem.
      }
    }),
  )
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
 * Extension -> mime, for the formats a data URI can carry straight through
 * both the preview renderer and the export. Deliberately the same four the
 * CLI's own `resolveLocalAssets` recognizes by extension (`src/cli/load-ir.ts`).
 */
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }

/**
 * What these bytes actually are, by magic number — never by filename.
 *
 * Trusting the extension here would quietly undo a check the CLI makes on
 * purpose: it rejects a file whose header disagrees with its name rather than
 * relabelling it, because a media part whose declared type and real bytes
 * disagree is exactly what the package audit cannot see. Returning null for
 * anything unrecognized keeps that judgement where it already lives.
 */
function sniffImageMime(bytes) {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && bytes.toString('latin1', 0, 6).match(/^GIF8[79]a$/)) return 'image/gif'
  return null
}

/**
 * Replace local image paths in the snapshot with the bytes they point at.
 *
 * This is the other half of pinning a deck. `execute` runs the CLI twice —
 * once for the preview, once for the export — and between those two processes
 * there is a real window: an agent regenerating a logo, a designer saving over
 * a file, a build step rewriting `assets/`. A snapshot that names images by
 * path lets each run resolve them independently, so the deck on screen and the
 * file the user downloads could genuinely be built from different pictures,
 * with nothing anywhere to say so. Inlined, neither run reads those files at
 * all.
 *
 * Deliberately narrow, and these are the edges it does not cover:
 *
 *  - `http(s)` sources stay URLs. Fetching them here would mean a second
 *    fetcher, a second cache policy and a second failure vocabulary next to
 *    the one the export pipeline already has (`src/platform/inline-assets.ts`),
 *    and a remote asset can change under a stable URL regardless.
 *  - formats needing a recode (webp and friends) stay paths. Turning those
 *    into something PowerPoint accepts is a sharp/canvas job, and this file is
 *    dependency-free by design; the CLI already owns that decode, and owning
 *    it twice is how two renderers start disagreeing.
 *  - a file that fails a check — unreadable, empty, header not matching its
 *    extension — is left as a path on purpose, so the CLI raises its own
 *    precise error instead of this function inventing a worse one.
 *
 * Anything left as a path keeps the old exposure, which is why the cases are
 * listed rather than waved at.
 */
async function inlineLocalImages(snapshotPath) {
  let ir
  try {
    ir = JSON.parse(await readFile(snapshotPath, 'utf8'))
  } catch {
    // Not valid JSON, so not this function's file to rewrite — the CLI's own
    // parser owns that error message.
    return
  }
  const images = ir?.assets?.images
  if (!images || typeof images !== 'object') return

  let changed = false
  await Promise.all(
    Object.values(images).map(async (asset) => {
      const src = asset?.src
      if (typeof src !== 'string' || src === '') return
      if (src.startsWith('data:') || /^https?:\/\//.test(src)) return
      let bytes
      try {
        bytes = await readFile(src)
      } catch {
        return
      }
      if (bytes.length === 0) return
      const sniffed = sniffImageMime(bytes)
      if (!sniffed) return
      // An extension the CLI knows must agree with the bytes. When it does
      // not, the deck is already broken and the CLI says so precisely; when
      // the extension is unknown to it (webp and friends), the recode path
      // owns the file and inlining would take it away from there.
      const declared = MIME_BY_EXT[(src.match(/\.[^.\\/]+$/)?.[0] || '').toLowerCase()]
      if (declared !== sniffed) return
      asset.src = `data:${sniffed};base64,${bytes.toString('base64')}`
      changed = true
    }),
  )
  if (changed) await writeFile(snapshotPath, JSON.stringify(ir))
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
 * `assemble` rewrites local image paths, it does not inline them, so a
 * snapshot on its own pins *which* deck rather than the bytes it is made of —
 * which left every later run free to re-read those files. `inlineLocalImages`
 * closes that for the formats it can (see its own note for the ones it
 * cannot).
 */
async function captureSnapshot(cliPath, target, outDir, signal) {
  const snapshot = join(outDir, SNAPSHOT_FILE)
  if (await isFile(target)) {
    await snapshotIrFile(target, snapshot)
    await inlineLocalImages(snapshot)
    return { snapshot, themeFile: undefined }
  }
  await runCli(cliPath, ['assemble', target, '-o', snapshot], signal)
  await inlineLocalImages(snapshot)
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
  // `draft` travels with the bundle rather than with the record, so a card
  // reopened after a restart still says so: `recallAnywhere` rebuilds the
  // bundle from this manifest, and the manifest is where the unfilled pages
  // are named in the first place.
  return { ...manifest, pages, markupTruncated: truncated, draft: pages.some((p) => p.placeholder === true) }
}

/**
 * The filename the browser will save the export under.
 *
 * Computed at render time, not at download time, because the file now exists
 * on disk before anyone asks for it. Everything outside `\w.-` collapses to a
 * dash so the value is safe both as a path segment and inside a quoted
 * `content-disposition` header.
 *
 * A deck with unfilled pages says so in its filename. The card already carries
 * a badge, but the file outlives the card: it gets mailed, uploaded and opened
 * by people who never saw this conversation, and `-draft` is the one part of
 * it that travels with the bytes.
 */
function exportName(bundle, target) {
  const raw =
    (bundle && bundle.title) || String(target).split(/[\\/]/).pop().replace(/\.[^.]+$/, '') || 'deck'
  const safe = raw.replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '')
  return `${safe || 'deck'}${bundle && bundle.draft ? '-draft' : ''}.pptx`
}

/** One short model-facing line — never the markup. */
function modelSummary(value) {
  const bits = [`rendered ${value.pageCount} page${value.pageCount === 1 ? '' : 's'} to ${value.outDir}`]
  // The card finds the deck by this id. It has to travel in model-facing
  // text because that is the only part of a sub-call's result the card is
  // guaranteed to see — see this module's own header for why the structured
  // channel was not an option.
  bits.unshift(`pptfast-preview:${value.previewId}`)
  // The model is the one who can act on this: the pages are still unfilled,
  // and the export it just handed the user is labelled a draft.
  if (value.bundle && value.bundle.draft) bits.push('draft — some pages are unfilled placeholders')
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
  /** This service's own record directory — never shared with another service. */
  const recordDir = recordDirFor(cliPath)

  /**
   * `id -> { bundle, target, outDir, snapshot, themeFile, pptxPath }`, for
   * the route the card fetches from.
   *
   * `pptxPath` points at a file that already exists by the time an id is
   * handed out. The card's download button reads it and nothing else — see
   * the ONE RENDER WINDOW note at the top of this file for why a second
   * render, however faithfully it re-read the snapshot, is not the same deck.
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
    await writeRecord(recordDir, id, record)
    await pruneRecords(recordDir)
  }

  /**
   * Find a preview by id: in memory, else from this service's own records.
   *
   * A card lives in a transcript, and a transcript outlives everything: the
   * user scrolls back to a session from last week, and the card has to show
   * the deck it showed then. In-memory alone cannot do that — the map dies
   * with the process, and DSH restarts on every plugin reload — so a
   * historical session would have rendered an empty card and a download that
   * saved a 404 body. The record survives the restart, and the rendered
   * bundle is still sitting in `outDir`, so a reload costs a re-read.
   *
   * There used to be a third tier: when `outDir` was gone, re-render the deck
   * from the pinned snapshot. It is deliberately gone, for two reasons.
   * `captureSnapshot` writes the snapshot *into* `outDir`, so "the directory
   * is gone but the snapshot survives" was close to unreachable in the first
   * place. And a re-render today is not the deck this card is showing: it
   * reads whatever configuration, theme and image bytes exist now, through
   * whatever renderer version is installed now. It could not reproduce the
   * .pptx either, so keeping it would have left the card showing one deck and
   * the download button reporting an expired preview. One honest 410 beats
   * two halves that disagree.
   */
  async function recallAnywhere(id) {
    const live = bundles.get(id)
    if (live) return live

    const record = await readRecord(recordDir, id)
    if (!record) return undefined

    try {
      return cache(id, { ...record, bundle: await readPreviewBundle(record.outDir) })
    } catch {
      throw new PreviewExpired(`the rendered deck for this preview is gone (${record.outDir})`)
    }
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
        // Served, not rendered. This handler starts no process and writes
        // nothing — the .pptx was produced during the same `execute` that
        // produced the SVGs the user paged through, which is the only way the
        // two can be guaranteed to be the same deck. It also means two
        // browsers hitting the same id at once are two readers of one file
        // rather than two renderers racing to write it.
        if (!entry.pptxPath) {
          // Either the export failed while the preview itself succeeded, or
          // this record predates exports being rendered up front. Both are
          // permanent for this id: there is no second render to fall back to.
          res.writeHead(410, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              error: entry.pptxError || 'this preview has no exported deck and cannot produce one now',
            }),
          )
          return
        }
        let bytes
        try {
          bytes = await readFile(entry.pptxPath)
        } catch {
          // Same disposition as a missing bundle: the id was real, the file
          // behind it is not. Re-rendering from the snapshot would hand back
          // a deck built from today's configuration and today's image bytes,
          // which is exactly the substitution this design exists to prevent.
          res.writeHead(410, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: `the exported deck for this preview is gone (${entry.pptxPath})` }))
          return
        }
        res.writeHead(200, {
          'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'content-disposition': `attachment; filename="${basename(entry.pptxPath)}"`,
          'content-length': bytes.length,
        })
        res.end(bytes)
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
      const outDir = await createOutDir()
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

      // The export, here, now, in the same call — see ONE RENDER WINDOW at
      // the top of this file. The directory is a fresh `mkdtemp` owned by
      // this call alone, so there is no other writer to publish around.
      const pptxPath = join(outDir, exportName(bundle, target))
      let pptxError
      try {
        // `--draft` exactly when the preview shows unfilled pages, and never
        // otherwise. `render` refuses a deck with placeholders by default,
        // while `preview` renders it happily — so without this the card looked
        // fine and its download button was guaranteed to fail, forever, with
        // the user finding out only by clicking. Exporting is the better half
        // of that trade: an unfinished deck is still the thing the user is
        // iterating on, and refusing to hand it over means they cannot show it
        // to anyone or open it in PowerPoint to judge it. The gate exists so
        // nobody ships placeholders unknowingly, so the knowing is what is
        // restored: the card carries a draft badge, the model is told, and the
        // file itself is named `-draft`. Passing the flag unconditionally
        // would instead disable the gate for every deck, including the ones
        // whose placeholders the user has not seen.
        const draftArgs = bundle.draft ? ['--draft'] : []
        await runCli(
          cliPath,
          ['render', snapshot, '-o', pptxPath, ...draftArgs, ...themeArgs({ themeFile })],
          exec?.signal,
        )
      } catch (error) {
        // A failed export must not cost the user the preview: paging through
        // the deck is most of the value, and the audit findings on screen may
        // well explain the failure. The reason is recorded so the download
        // route can state it instead of returning a bare 404 the browser
        // saves as a file.
        pptxError = `the export for this preview failed to render: ${String(error && error.message ? error.message : error)}`
      }
      await remember(previewId, {
        bundle,
        target,
        outDir,
        snapshot,
        themeFile,
        pptxPath: pptxError ? undefined : pptxPath,
        pptxError,
      })
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

  return { tool, registerRoute, remember, recall: (id) => bundles.get(id), recallAnywhere, recordDir }
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
  exportName,
  readRecord,
  writeRecord,
  pruneRecords,
  isDisposableOutDir,
  createOutDir,
  inlineLocalImages,
  discardOutDir,
  recordDirFor,
  RECORD_ROOT,
  OUT_DIR_PREFIX,
  OWNER_MARKER,
  SCRATCH_MAX_AGE_MS,
  MAX_PRESENTED_BYTES,
  MAX_PERSISTED,
  PreviewExpired,
}
