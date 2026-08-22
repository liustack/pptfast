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
// - the CARD reads that id out of the result text and fetches from the route:
//   the bundle for its thumbnail strip, and `preview.html` for the viewer it
//   opens in an iframe. Same-origin loopback only.
//
// Nothing here re-renders anything of its own, and — since the viewer became
// an iframe — nothing here reimplements anything either. It shells out to the
// same packaged CLI the skill teaches and serves what `preview --html` already
// wrote: `manifest.json` plus one SVG per page for the strip, and the
// self-contained `preview.html` (filmstrip, keyboard paging, light/dark
// surround, audit findings) for the full-size view. Keeping one rendering path
// is the point, and it now covers the reading path too: a second renderer in a
// UI is how the promotional images and the review conclusions would stop
// describing the same product, and a second *viewer* is how the card and the
// review bundle would stop showing the same deck.
//
// Everything stateful lives inside `createPreviewService`, never at module
// scope. Two services (a plugin reload, a second profile, a test) must not be
// able to see each other's CLI path — a module-level `cliPath` meant the
// second `apply()` silently re-pointed the route the first one had already
// registered.
//
// The decks themselves are the opposite case, and getting that backwards is
// what this file was fixed for. See PREVIEWS ARE HISTORY below.
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
//  - project/user configuration: every run reads it fresh from the same cwd,
//    and the window between the preview run and the export run is a whole
//    render, so seconds rather than an instant. Not pinned — an edit landing
//    inside that window would split preview from export. Rare enough to
//    accept, not rare enough to call impossible.
//  - http(s) assets, and local images in formats that need a recode (webp
//    and friends): still fetched or read per run. See `inlineLocalImages`.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { runChild } from './spawnHidden.js'

/**
 * How many pages get their SVG inlined into the bundle.
 *
 * This is a count of pages, not a budget of bytes, and it is bound to one
 * thing only: how many thumbnails the card's strip draws (`STRIP_PAGES`,
 * ./client.js). The bundle has no other consumer — the full-size viewer is the
 * `preview.html` served below, which carries every page inside itself and asks
 * this route for no markup at all. Pages past this point still travel, with
 * their metadata, so the card can count and name them.
 *
 * What stood here before was an 8 MB budget on the total inlined markup, and
 * the difference matters. A byte budget makes a page's fate depend on the
 * pages before it: a real nine-page deck with a photo on every slide came back
 * with pages 2 and 6 blank — the early photos had spent the budget, and the
 * later, cheaper pages fit in what was left. Counting pages cannot produce
 * that, because which pages arrive without markup no longer has anything to do
 * with how heavy their neighbours were.
 */
const THUMBNAIL_STRIP_PAGES = 12

/** The self-contained review page `preview --html` writes into `outDir`. */
const PREVIEW_HTML_FILE = 'preview.html'

/**
 * What a missing preview looks like to the one consumer that renders what it
 * is handed rather than parsing it.
 *
 * Every other thing this route serves is read by code, so JSON is the right
 * answer for it. `/html` is the exception: its consumer is the card's iframe,
 * and an iframe displays the response body whatever the status line said. So a
 * missing preview reached the user as a bare browser document reading
 * `{"error":"unknown preview id"}`, pretty-print checkbox and all, framed by
 * the viewer's own Close and Download buttons. The status code is unchanged —
 * a status code is not a document, and the card still reads it — but the body
 * is now a sentence a person can act on.
 *
 * The word "expired" is deliberately not in it any more. Nothing expires a
 * preview: no timer, no budget, no sweep. A deck is missing because it was
 * deleted, which makes "where they live and that they stay there" the useful
 * thing to say — the previous wording sent people looking for a setting that
 * does not exist.
 *
 * Self-contained and colourless on purpose: it renders inside a modal that is
 * already black, in a browser that may be in either theme, with no stylesheet
 * of its own to inherit.
 */
function noticePage(title, heading, message, hint) {
  return [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="color-scheme" content="dark light">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'html,body{height:100%;margin:0}',
    'body{display:flex;align-items:center;justify-content:center;background:#111;color:#eee;',
    'font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}',
    'main{max-width:44ch;text-align:center}',
    'h1{font-size:15px;font-weight:600;margin:0 0 8px}',
    'p{margin:0 0 8px;color:#aaa}',
    'p:last-child{margin:0}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#ccc}',
    '</style>',
    '<main>',
    `<h1>${escapeHtml(heading)}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    `<p>${hint}</p>`,
    '</main>',
  ].join('\n')
}

/**
 * The deck is not under this root: a final answer, and usually one the user
 * caused. Usually, not always — the root follows `PPTFAST_HOME`, so a deck
 * written under a different one is alive and out of reach. That is why the
 * hint below prints the root it actually looked in rather than telling the
 * reader what they must have done.
 */
function missingPage(message) {
  return noticePage(
    'Preview not found',
    'This deck is no longer on disk',
    message,
    `Rendered decks stay in <code>${escapeHtml(previewRoot())}</code> until you delete them. ` +
      'Run <code>pptfast_preview</code> again to rebuild this one.',
  )
}

/**
 * The deck may well be fine and this process could not read it.
 *
 * A separate page rather than a reworded one, because the two say opposite
 * things to the person reading them: one means "rebuild it", the other means
 * "wait and try again". Handing a permission blip the "no longer on disk" page
 * would send a user to rebuild a deck that is sitting right there.
 */
function unreadablePage(message) {
  return noticePage(
    'Preview unavailable',
    'This deck could not be read just now',
    message,
    'The files may still be there. Close this and open it again in a moment.',
  )
}

/**
 * The files are here; what describes them is not readable.
 *
 * A third page, for the same reason there is a second one. "No longer on disk"
 * is a claim about what the user did, and it is false here — the deck was
 * rendered, the pages are probably sitting right next to the file that went
 * bad. Telling someone their deck was deleted when a `record.json` was
 * truncated by a full disk sends them looking in the wrong place, and quietly
 * blames them for it.
 */
function damagedPage(message) {
  return noticePage(
    'Preview damaged',
    'This deck cannot be opened',
    message,
    "The rendered pages may still be there — it is the file describing them that this version cannot read. " +
      'Run <code>pptfast_preview</code> again to rebuild it.',
  )
}

/**
 * The page that goes with a failure code. One mapping, and the route's only way
 * to reach these three pages, so the wording follows the verdict rather than
 * being chosen again at the call site.
 */
function noticePageFor(code, message) {
  if (code === FAILURE_CODES.unreadable) return unreadablePage(message)
  if (code === FAILURE_CODES.damaged) return damagedPage(message)
  return missingPage(message)
}

/** The four characters that could turn a filesystem path in a message into markup. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const TOOL_NAME = 'pptfast_preview'

export const PREVIEW_ROUTE = '/pptfast/preview'

/**
 * The stamp every response from this route carries, and the card's only proof
 * that a status came from here.
 *
 * A status code says nothing about who produced it. A 404 can mean "this
 * module has never heard of that id" or it can mean the plugin's route never
 * registered, or that a proxy answered first, or that the harness served its
 * own not-found page for an unknown path. The card acts on our 404 by retiring
 * a deck permanently, so it has to be able to tell the difference — and since
 * the route is same-origin, a response header is readable. Anything that writes
 * a response could write this one, so it is not a signature: it is a name
 * nothing else answering on this port has any reason to set, which is enough to
 * stop an unrelated 404 from retiring a live deck.
 */
export const ROUTE_HEADER = 'x-pptfast-preview'
export const ROUTE_HEADER_VALUE = '1'

/**
 * The machine-readable half of every failure this route reports.
 *
 * A status code has three values to say four things with, and prose is not a
 * protocol. The card has to tell a deleted preview from a damaged one — they
 * are both final, they are both 410, and they need opposite sentences in front
 * of the user — so it was reading the difference out of a status code that
 * cannot carry it. It could not, so both arrived as "deleted", and the damaged
 * case existed only in a server log.
 *
 * Sent in the JSON body rather than only in a header so anything reading this
 * route by hand sees it too, and mirrored on the status line by nothing: the
 * body is the contract.
 */
export const FAILURE_CODES = {
  /** No such preview here. Deleted, or never in this root at all. */
  unknown: 'preview_unknown',
  /** The preview is here and has lost files it needs. */
  missing: 'preview_missing',
  /** The files are here; the bookkeeping that describes them cannot be read. */
  damaged: 'preview_damaged',
  /** This process could not read it. Says nothing about the preview. */
  unreadable: 'preview_unreadable',
}

// PREVIEWS ARE HISTORY, NOT TEMPORARY FILES.
//
// That sentence is the whole storage design, and it is the one the previous
// layout got wrong in two independent ways. Both are worth writing down,
// because both looked reasonable and both guaranteed the same user-visible
// failure: cards that go dead for no reason the user can see.
//
//  1. The records lived in `$TMPDIR/pptfast-previews/<sha256(cliPath)[0:16]>/`.
//     An npm install path carries the version in it
//     (`.pnpm/@liustack+pptfast@0.19.2/…`), so that hash changed on every
//     single plugin upgrade and every historical preview was orphaned the
//     moment the user updated. Measured on a real machine: 14 records, 7 live
//     decks, and every dead one predated the commit that introduced the
//     bucket.
//  2. The rendered decks lived in `$TMPDIR` too, via `mkdtemp`. macOS sweeps
//     that directory on its own schedule, so every card expired after a few
//     days no matter what the records did.
//
// The bucket was there for two stated reasons and neither survives contact:
// "one service must not see another's decks" is a privacy claim about one
// person's own machine, where the only way to reach a deck is to already have
// its UUID out of the transcript it belongs to; and "a record written by a
// different renderer build is not visible" is a version fence guarding
// nothing, because recall serves files that were rendered once and starts no
// renderer. What the fence actually bought was the bug.
//
// So: one fixed root, keyed by nothing. No version, no install path, no
// process id, nothing that an upgrade can move. One directory per call, named
// by the id itself, so a lookup is a path computed from the id rather than a
// path followed out of a file — and published in a single `rename`, so the
// route sees a whole preview or none of one. The three notes below (expiry,
// `PARTIAL_SUFFIX`, `OWNER_MARKER`) are where each of those is argued.

/** Directory under `$PPTFAST_HOME` that holds every preview this plugin has kept. */
const PREVIEW_DIR = 'previews'

/**
 * Root of everything this module writes.
 *
 * `~/.pptfast` (overridable wholesale by `PPTFAST_HOME`) is not invented
 * here — it is already this project's user-state convention, declared by
 * `pptfastHome()` in `src/cli/home.ts` and used for the deck projects and the
 * user config file. The plugin cannot import it (this file is dependency-free
 * plain JS with no build step) so the two lines are duplicated, deliberately
 * and identically, rather than the plugin inventing a second home.
 *
 * Read fresh on each call, matching `pptfastHome()`: `PPTFAST_HOME` is meant
 * to be redirectable per process, which is also how the tests keep off a real
 * user's home directory. Empty counts as unset in both places — it did not
 * always, and the mismatch was a real one: the CLI kept `""` and resolved its
 * deck root relative to the cwd while this module treated it as absent, so the
 * two disagreed about where a user's pptfast lived. `src/cli/home.ts` was
 * changed to match this, because this is the side that deletes directories
 * under the root it computes. The rule is what is duplicated, not the line:
 * same variable, same treatment of an empty value, same `~/.pptfast` default.
 * This side then resolves the result, for the reason below.
 *
 * Resolved to an absolute path for the same reason: a relative root would make
 * every path here depend on where the harness happened to be started.
 */
export function previewRoot() {
  const home = process.env.PPTFAST_HOME
  return join(resolve(home === undefined || home === '' ? join(homedir(), '.pptfast') : home), PREVIEW_DIR)
}

/**
 * The record, the snapshot, the pages, the viewer page and the .pptx all live
 * in `<root>/<id>/`, and the id IS the directory name.
 *
 * The old layout kept the record in one place and the deck in another, joined
 * by an absolute path stored inside the record. That made "the record survived
 * but the deck did not" an ordinary, reachable state — the one every dead card
 * in the wild was in. Here they no longer live in separate places that can be
 * swept independently, and `recallAnywhere` finds a preview by computing a path
 * from the id rather than by following one it read off disk. Taking part of one
 * directory still splits them, which is what outcome (3) and `PreviewExpired`
 * are for — the difference is that it now takes a deliberate hand rather than
 * an ordinary temp sweep.
 *
 * That has a second consequence, and it is the one the single deletion left in
 * this file leans on: no value out of a record is ever used as a directory to
 * delete.
 */
const RECORD_FILE = 'record.json'

/** The page index `preview --html` writes, and the file a bundle is read from. */
const MANIFEST_FILE = 'manifest.json'

// NOTHING HERE EXPIRES A PREVIEW.
//
// An earlier draft of this file carried a count budget, a byte budget, a
// least-recently-used sort and a sweep for abandoned directories. All four are
// gone on purpose, and the note is here so the next reader does not restore
// them as an obvious omission.
//
// A card is a row in a transcript, and how far back a transcript stays worth
// reading is the user's call — not a number picked in this file. Every
// automatic rule that could delete a deck was a rule that would eventually
// delete one the user was still scrolling back to, silently, with a dead card
// as the only notice. That is the exact complaint this whole change answers,
// and buying it back at a longer interval is still buying it back.
//
// Disk therefore grows with the number of calls. The answer to that is
// visibility rather than deletion: every run reports its `outDir` to the model
// and the user, the root is one fixed directory, and removing that directory
// is a safe thing for a person to do.
//
// One deletion survives, and only one: a render that threw removes the
// half-written directory it was building — a directory whose name no id
// resolves to and which nobody was ever handed. A render killed outright
// (SIGKILL, a lost machine) leaves that directory behind, permanently, and
// that is accepted rather than swept: an unpublished `<id>.partial` is
// unreachable from every route, and collecting it means reintroducing exactly
// the timer this design removed.

/**
 * The name a preview is assembled under, before it is published.
 *
 * `rename` inside one filesystem is atomic, which is the whole mechanism: the
 * route sees a preview directory complete or not at all, never mid-render.
 *
 * That is a claim about visibility and not about durability, and the difference
 * is worth keeping straight. Nothing here calls fsync, so a machine that loses
 * power just after the rename can come back with the directory published and
 * files inside it that never reached the platter. What the route finds then is
 * a preview with pieces missing, which it already has an answer for — 410, and
 * the name of what it could not read. What it will not find is half a render
 * presenting itself as a whole one, and that is the part rename buys.
 *
 * The suffix cannot collide with a published preview, and that is a property
 * of `ID_PATTERN` rather than of luck — the pattern admits no `.`, so no id
 * can spell a name ending in `.partial`, and every path this module looks up
 * is built from an id that passed it.
 */
const PARTIAL_SUFFIX = '.partial'

/**
 * Written into a directory this module creates, and required before it will
 * remove one again.
 *
 * The job is narrower than the note that used to stand here, which argued from
 * an eviction path that no longer exists. Back then a record's `outDir` — a
 * string read out of JSON, pointing anywhere — was passed to a recursive
 * delete, so the marker was the only thing standing between a forged record
 * and `rm -rf`. There is no such input any more: the one path this module
 * deletes is `<root>/<id>.partial`, built from a uuid this call generated
 * moments earlier.
 *
 * What is left is smaller and still real. That path is a name, and a name can
 * already be taken — by a leftover from an older layout, by a concurrent
 * writer, by something planted. `createOwnedDir` refuses to merge into an
 * existing directory, and this file looks for the marker again before removing
 * anything. It is a filename, not a signature: the payload written beside it is
 * never read back, so it stops a delete from wandering into a directory that
 * never belonged to this tool and would not stop one that had the marker
 * planted in it. Keeping it costs one `stat`; removing it is an argument about
 * a different subject, and belongs in its own change rather than smuggled into
 * a move of the storage root.
 */
const OWNER_MARKER = '.pptfast-preview-owner'

/**
 * Ids reach this module from a URL path and become directory names, so the
 * shape is checked rather than trusted. `randomUUID` is the only producer.
 *
 * Hex and dashes only, which is what makes every path built from an id stay
 * inside the root: `.` is not in the class, so `..` cannot be spelled, and
 * neither can a separator. That is checked on both sides — a read that builds
 * a lookup path and a write that creates a directory — because this module
 * exports entry points (`remember`) that take an id from a caller.
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

/**
 * Thrown when a preview could not be READ, which is not the same as gone.
 *
 * This distinction is the whole point of the class existing, and collapsing it
 * is a bug this plugin has now grown twice in two different files. The card
 * treats 404 and 410 as final — nothing regenerates a preview, so re-asking is
 * pointless — and everything else as worth another try. That contract is only
 * safe if the server never spends a final status on a temporary problem.
 *
 * `readRecord` used to answer every failure with `undefined`, which the route
 * turns into "unknown preview id". So a permission bit changed by a backup
 * tool, an `EIO` off a failing disk, or an `EMFILE` while the harness was
 * busy, all reported that a preview the user was looking at had never existed
 * — and because the card had just been taught not to retry a 404, it stayed
 * that way for the life of the page. That is the exact bug that was fixed on
 * the client side, re-appearing one layer down.
 */
class PreviewUnreadable extends Error {}

/**
 * Thrown when a preview's own bookkeeping is corrupt: present, readable, and
 * not something this code can make sense of.
 *
 * A third case, because it is genuinely a third thing and the first draft made
 * it wear the first one's clothes. A `record.json` that does not parse used to
 * be reported as "unknown preview id" — the answer an id nobody was ever given
 * gets — which tells the user their deck never existed when what actually
 * happened is a write torn in half by a full disk.
 *
 * It shares a status with `PreviewExpired` (410) rather than getting a 5xx,
 * and that is deliberate: re-reading the same bytes produces the same failure
 * for ever, so telling the card to try again would spin it. What changes is
 * the sentence the user reads, which no longer accuses them of deleting
 * something.
 */
class PreviewDamaged extends Error {}

/**
 * Does this error mean nothing is there, or that we could not look?
 *
 * `ENOENT` is a fact about the filesystem: no file has that name. `ENOTDIR` is
 * the same fact arriving through a path component, and is treated identically
 * — asking for `<id>/manifest.json` when `<id>` is a regular file means the
 * manifest is not there either.
 *
 * Everything else is a fact about this attempt, not about the deck.
 */
function isAbsent(error) {
  const code = error && error.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * The errnos a retry can honestly do something about.
 *
 * An allowlist, and the direction matters more than the contents. This used to
 * be "anything with a `code` that is not `ENOENT`", which is a blocklist — and
 * a blocklist answers "is this fixed bad data?" with "I have not heard of it,
 * so no". It let two permanent conditions through as retryable: a `record.json`
 * that is actually a directory (`EISDIR`), and a page name containing a NUL
 * byte (`ERR_INVALID_ARG_VALUE`). No number of retries turns a directory into
 * a JSON file.
 *
 * So retryable is now the exception that has to be argued for, one entry at a
 * time. Each of these can succeed on a later identical call with nobody
 * editing anything:
 *
 *  - `EACCES`, `EPERM`   a permission bit a backup or sync tool flipped, and
 *                        can flip back.
 *  - `EAGAIN`            the kernel said "not right now" in as many words.
 *  - `EBUSY`             another process has it open; it will let go.
 *  - `EMFILE`, `ENFILE`  out of descriptors, this process or the machine. The
 *                        file is fine; the moment is not.
 *  - `ENOMEM`            same shape, different resource.
 *  - `EIO`               a read that failed at the device. Disks do this once
 *                        and then succeed, which is exactly what a retry is for.
 *  - `ENOBUFS`            the kernel is out of buffer space. Same shape as
 *                        `ENOMEM`, different pool.
 *  - `ETIMEDOUT`, `ESTALE`, `ENETDOWN`, `ENETRESET`, `ENETUNREACH`,
 *    `EHOSTDOWN`, `EHOSTUNREACH`, `ENOTCONN`, `ECONNRESET`, `ECONNABORTED`,
 *    `ECONNREFUSED`, `ENONET`, `EREMOTEIO`
 *                        a network filesystem in a state it comes out of. The
 *                        first version of this list took the mounted-share
 *                        cases and stopped short of the connection ones, which
 *                        is not a distinction the kernel makes: a read from an
 *                        NFS or FUSE mount answers with any of these while the
 *                        deck underneath is perfectly intact. Leaving them out
 *                        meant one connection reset permanently retired a live
 *                        deck — the exact cost this list exists to avoid, in a
 *                        different set of errnos.
 *
 * Everything else — including every error with no `code` at all, and every
 * code this list has not thought about — is final. That is the safe direction
 * to be wrong in: a final answer on something transient costs one card that a
 * re-render fixes, while a retryable answer on fixed bad data is a card that
 * offers a button which can never work.
 */
const RETRYABLE_ERRNOS = new Set([
  'EACCES',
  'EPERM',
  'EAGAIN',
  'EBUSY',
  'EMFILE',
  'ENFILE',
  'ENOMEM',
  'ENOBUFS',
  'EIO',
  'ETIMEDOUT',
  'ESTALE',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENOTCONN',
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ENONET',
  'EREMOTEIO',
])

function isTransient(error) {
  return RETRYABLE_ERRNOS.has(error && error.code)
}

/**
 * What a failed read means, in the three words this module answers in.
 *
 * One classifier so the three read sites cannot drift: absent is a deletion,
 * an allowlisted errno is worth another go, and everything else is data that
 * will fail the same way for ever. `ELOOP`, `ENAMETOOLONG`, `EISDIR` and a NUL
 * in a filename all land in that last group, which is where they belong — they
 * describe something wrong with the deck, not with the moment.
 */
function classifyReadFailure(error) {
  if (isAbsent(error)) return 'missing'
  if (isTransient(error)) return 'unreadable'
  return 'damaged'
}

/** Name the file and the reason, so a retryable failure says what to look at. */
function describeUnreadable(error, fallback) {
  const path = error && typeof error.path === 'string' ? error.path : fallback
  const code = error && typeof error.code === 'string' ? error.code : 'unknown error'
  return `${path} (${code})`
}

/**
 * The one directory a preview id is allowed to name, or nothing.
 *
 * Every preview *directory* in this module is built here, from an id, and
 * never followed out of a record. Names that do come out of a record or a
 * manifest (`pptxFile`, `themeFile`, a page's `file`) are joined onto the
 * directory this returns, after `isSafeFileName` has had them, so they cannot
 * lead anywhere else. That is the single property both the lookups and the
 * one deletion rest on, so it is worth stating plainly: `join(root, id)` with
 * `id` matching `ID_PATTERN` cannot leave `root`, because the pattern admits
 * no `.` and no separator.
 *
 * Note what is deliberately *not* checked anywhere in this module: the tool's
 * `target`. A user may legitimately ask for `../deck`, and the CLI resolves
 * exactly that. The id is the value that becomes a directory name, so the id
 * is the value with a shape to enforce.
 */
function previewDir(root, id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return undefined
  return join(root, id)
}

/** Same, for the paths that must fail loudly rather than quietly resolving to nothing. */
function requirePreviewDir(root, id) {
  const dir = previewDir(root, id)
  if (!dir) throw new Error(`refusing to write a preview record for an unsafe id: ${id}`)
  return dir
}

/**
 * Where a preview is built before it is published under its own id.
 *
 * Derived from `requirePreviewDir` rather than from the raw id, so the shape
 * check guards the staging path too — otherwise the one directory this module
 * creates and deletes would be the one path that skipped it.
 */
function partialDir(root, id) {
  return `${requirePreviewDir(root, id)}${PARTIAL_SUFFIX}`
}

/**
 * Create a preview's staging directory, and stamp it as this call's to remove.
 *
 * Not `recursive` on the leaf, and that is the point of the two calls: a
 * directory already sitting at this name belongs to something else, and
 * `mkdir -p` would silently adopt it — after which the failure path would
 * delete somebody else's files with a marker this call had just written into
 * them. `EEXIST` is the right answer, and it is unreachable in practice
 * because the name carries a freshly generated uuid.
 *
 * 0o700 because a deck is the user's own work and this now lives in their home
 * directory rather than in the per-user temp directory it used to. Ignored on
 * Windows, and applied only to directories the call actually creates.
 */
async function createOwnedDir(root, dir) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  await mkdir(dir, { mode: 0o700 })
  try {
    await writeFile(join(dir, OWNER_MARKER), JSON.stringify({ tool: TOOL_NAME, created: Date.now() }))
  } catch (error) {
    // The window this closes is narrow and permanent: the directory exists and
    // its proof of ownership does not, so every later cleanup — which asks for
    // that proof before deleting anything — would refuse it for ever. A full
    // disk while writing fifty bytes is enough to reach it.
    //
    // This is the one moment ownership can be established without the marker,
    // and that is what makes the removal safe: the `mkdir` above is
    // non-recursive, so it succeeded only by creating this directory, and
    // nothing else has been given its name yet.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/**
 * Remove a directory this module built, and leave alone anything it did not.
 *
 * Best-effort: a staging directory that cannot be tidied up is disk the user
 * can see and delete, whereas a cleanup that throws would replace the render's
 * own error — the one that says why the deck failed — with a filesystem
 * complaint about the wreckage.
 */
async function discardOwnedDir(dir) {
  if (typeof dir !== 'string' || dir === '') return
  if (!(await isFile(join(dir, OWNER_MARKER)))) return
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

/**
 * A file a record names inside its own preview directory, or nothing.
 *
 * A record is JSON on disk, so the names in it are data, and two of them
 * (`pptxFile`, `themeFile`) get joined onto a path and served to a browser.
 * Basename-only is the whole rule: `..`, a separator, or an absolute path is
 * refused rather than resolved, so the worst a corrupted or hand-edited record
 * can do is point at another file in the same preview directory, or at one that
 * is not there — which the route already answers with a 410. What it cannot do
 * is point outside.
 */
function fileInside(dir, name) {
  if (!isSafeFileName(name)) return undefined
  return join(dir, name)
}

/**
 * Is this a plain file name — something that names a file inside a directory
 * and cannot name anything outside it?
 *
 * Split out of `fileInside` so the *rule* can be applied where no path is being
 * built. That distinction is not academic: the manifest's page names used to be
 * checked only when a page's markup was about to be read, which meant the first
 * twelve pages of a deck were validated and the rest were not. A thirteen-page
 * manifest with `"file": "../../escape.svg"` on page thirteen was accepted, and
 * the bad name travelled to the card inside the bundle.
 *
 * Validation exists to refuse bad data, not to keep the renderer from
 * tripping over it. Whether this process happens to read a value is not a
 * reason to decide whether the value is allowed.
 */
function isSafeFileName(name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') return false
  // Control characters, and NUL above all. A name is checked here so that
  // whatever is built from it is a path the filesystem will take seriously;
  // a name holding a NUL byte passed every other clause and then made `readFile`
  // throw `ERR_INVALID_ARG_VALUE`, which is not a filesystem error at all and was
  // being reported as a temporary one. Refuse the name and it never gets that
  // far.
  // Matching control characters is the entire point of this line.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return false
  return !/[\\/]/.test(name) && !isAbsolute(name)
}

/**
 * The absolute paths a preview's own directory implies, layered over the
 * record's few stored fields.
 *
 * Nothing about where a preview's files are is stored, because storing it is
 * what broke: an absolute path written into a record in 2026 is a claim about
 * a machine's filesystem that no later version, upgrade or home-directory move
 * can keep. Derived instead, the whole tree relocates for free, and a record
 * from an older layout — which carried `outDir`, `snapshot` and `pptxPath` as
 * absolute paths into `$TMPDIR` — has those fields overwritten here rather
 * than followed. That is the entire legacy-format story: old fields are
 * shadowed, not trusted, and an old id simply is not in this root, so it
 * reaches the user as the missing-deck card the client already draws.
 */
function entryFromRecord(dir, record) {
  return {
    ...record,
    outDir: dir,
    snapshot: join(dir, SNAPSHOT_FILE),
    themeFile: fileInside(dir, record.themeFile),
    pptxPath: fileInside(dir, record.pptxFile),
  }
}

/**
 * The few fields a preview directory cannot imply about itself.
 *
 * Which target the user asked for, what the export is called, and why there is
 * none. Every path this module *derives* is dropped here and re-built by
 * `entryFromRecord`, so memory and disk cannot end up describing two different
 * decks. `target` is the exception and stays as the user typed it, absolute or
 * not: it records what was asked for rather than where anything is now, and
 * nothing reads it back as a path.
 */
function recordFrom(entry) {
  return {
    target: String(entry.target ?? ''),
    themeFile: entry.themeFile ? basename(entry.themeFile) : undefined,
    pptxFile: entry.pptxPath ? basename(entry.pptxPath) : undefined,
    pptxError: entry.pptxError,
    created: Date.now(),
  }
}

/**
 * Write a record into a directory that already exists.
 *
 * Published by rename, which is atomic: a reader sees the old file or the new
 * one, never half of either. Same caveat as `PARTIAL_SUFFIX` — that is about
 * what a reader can see, not about what survives a power cut. This replaced a
 * single shared JSON index, whose
 * read-modify-write meant two previews finishing at once lost one of them, and
 * a reader catching the file mid-write fell back to `{}` and then overwrote
 * everything in it. The scratch name carries its own uuid so two writers for
 * one id cannot collide on the scratch file either.
 *
 * Takes a directory rather than an id because `execute` writes this into
 * `<id>.partial` — the record has to be inside the directory being published,
 * or the publish would not be one step.
 */
async function writeRecordInto(dir, record) {
  const scratch = join(dir, `.${RECORD_FILE}.${randomUUID()}.tmp`)
  await writeFile(scratch, JSON.stringify(record))
  await rename(scratch, join(dir, RECORD_FILE))
}

/**
 * The same, addressed by id.
 *
 * The id is checked here, at the write boundary, and not only where records
 * are read: `remember` is an exported entry point, and before this check
 * existed `remember("../../victim", …)` resolved straight out of the root. The
 * plugin itself only ever passes a `randomUUID`, so nothing in production
 * reached it, but the guarantee was claimed before it was true.
 */
async function writeRecord(root, id, record) {
  const dir = requirePreviewDir(root, id)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeRecordInto(dir, record)
}

/**
 * The record for an id, or nothing — with "nothing" meaning only one thing.
 *
 * Reading and parsing are separate steps here because they fail for opposite
 * reasons and deserve opposite answers. A read that fails is about the disk; a
 * parse that fails is about the bytes, which will not improve on a second
 * look. Wrapping both in one `catch` is what let a permission error report
 * itself as an id that had never existed.
 */
async function readRecord(root, id) {
  const dir = previewDir(root, id)
  if (!dir) return undefined
  const path = join(dir, RECORD_FILE)
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    const failure = classifyReadFailure(error)
    if (failure === 'missing') return undefined
    if (failure === 'unreadable') {
      throw new PreviewUnreadable(
        `this preview's record could not be read right now: ${describeUnreadable(error, path)}`,
      )
    }
    // Fixed bad data rather than a bad moment: a `record.json` that is really a
    // directory, a name the filesystem will not accept. Retrying is pointless,
    // and saying so is the difference between a card that offers a button that
    // works and one that offers a button that cannot.
    throw new PreviewDamaged(`this preview's record cannot be read: ${describeUnreadable(error, path)}`)
  }
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    // Truncated by a full disk, or hand-edited. Final, not retryable: the same
    // bytes parse the same way for ever. But it is emphatically not "no such
    // preview" — the file is right there, and saying otherwise blames the user
    // for a write this program failed to finish.
    throw new PreviewDamaged(`this preview's record is present but unreadable: ${path}`)
  }
  // A record has to be an object before anything reads fields off it: this file
  // is on disk between runs, and `JSON.parse` will happily hand back a number
  // or null. Written by an older or newer layout, or by something else
  // entirely — either way this code cannot act on it, and it should say which
  // of the two it is rather than pretend the id is unknown.
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new PreviewDamaged(`this preview's record is not in a shape this version understands: ${path}`)
  }
  // The fields this module actually reads, checked for type when present.
  // Validating only the outer shape left a `pptxFile` of the wrong type to be
  // quietly turned into `undefined` by `fileInside`, and reported to the user
  // as "this preview has no exported deck" — a statement about the deck, made
  // on the strength of a record this version could not read. Absent is a fact;
  // present-and-wrong-type is damage, and they must not look the same.
  //
  // Fields an older layout wrote and this one ignores (`outDir`, `snapshot`,
  // `pptxPath`) are deliberately not checked: they are shadowed rather than
  // read, so their type cannot affect anything.
  for (const field of ['target', 'themeFile', 'pptxFile', 'pptxError']) {
    if (record[field] !== undefined && typeof record[field] !== 'string') {
      throw new PreviewDamaged(`this preview's record has an unusable "${field}": ${path}`)
    }
  }
  if (record.created !== undefined && typeof record.created !== 'number') {
    throw new PreviewDamaged(`this preview's record has an unusable "created": ${path}`)
  }
  return record
}

function resolveCliCommand() {
  if (process.versions.electron) {
    return process.env.npm_node_execpath || 'node'
  }
  return process.execPath
}

function cliChildEnv() {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}

/** Run the packaged CLI, resolving with its combined output.
 *
 * GitHub issue #1: two libvips in one Electron process crash the renderer.
 * The plugin must never import() the CLI. Electron's process.execPath is not
 * a Node binary, so the child is a real node when inside Electron, and
 * ELECTRON_RUN_AS_NODE is always set so an Electron fallback cannot boot as
 * an app.
 */
function runCli(cliPath, args, signal) {
  return runChild(resolveCliCommand(), [cliPath, ...args], {
    env: cliChildEnv(),
    signal,
  }).then(({ code, stdout, stderr }) => {
    if (code === 0) return { stdout, stderr }
    throw new Error(stderr.trim() || stdout.trim() || `pptfast exited with code ${code}`)
  })
}

/**
 * Is there a directory here, nothing here, or something this process cannot
 * look at?
 *
 * Three answers rather than the two `isDirectory` gives, because the caller has
 * to tell "no such preview" from "a preview that lost a file" from "ask again
 * later", and a boolean collapses the last one into whichever of the first two
 * it was standing next to. `'other'` — a plain file sitting where a preview
 * directory should be — is reported as its own thing and treated as absent by
 * the caller: whatever it is, it is not a preview.
 */
async function directoryState(path) {
  try {
    return (await stat(path)).isDirectory() ? 'directory' : 'other'
  } catch (error) {
    // The same three-way split every other read uses. This branch is reachable
    // for its own reasons, not as an echo of the read before it: a permission
    // bit that changes between the two answers here and not there, because they
    // are separate system calls with a filesystem free to move underneath them.
    // An earlier round called it unreachable by construction; that was an
    // assumption about ordering, not a fact about it.
    const failure = classifyReadFailure(error)
    if (failure === 'missing') return 'absent'
    if (failure === 'unreadable') {
      throw new PreviewUnreadable(
        `this preview's directory could not be read right now: ${describeUnreadable(error, path)}`,
      )
    }
    throw new PreviewDamaged(`this preview's directory cannot be used: ${describeUnreadable(error, path)}`)
  }
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
  // `dirname(previewRoot())` rather than a second hard-coded `~/.pptfast`, so
  // this follows `PPTFAST_HOME` the way the CLI's own `decksRoot()` does. The
  // previous literal ignored that variable and looked in the wrong home
  // whenever it was set.
  const named = join(dirname(previewRoot()), 'decks', target)
  if (await isDirectory(named)) return named
  return undefined
}

/**
 * Copy a single-file IR target, rewriting every local asset src to an
 * absolute path.
 *
 * A relative src in an IR file resolves against that file's own directory
 * (the CLI's `loadDeckTarget`), so a byte-for-byte copy into the preview directory
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
 * Read what the card's thumbnail strip needs: the manifest, plus the SVG of
 * every page the strip will actually draw, inlined so the card needs no
 * filesystem access of its own (it runs in a browser).
 *
 * Every page keeps its metadata. `svg: null` means "this page is past the end
 * of the strip", never "this page failed" — the deck in full is one route away
 * (`preview.html`), so a page without markup here is not a page the user
 * cannot see. There is deliberately no flag saying the markup was cut short:
 * the strip is a fixed-length teaser by design, and a card that announced
 * "preview shortened" for every deck over twelve pages would be reporting the
 * design as a defect.
 */
async function readPreviewBundle(outDir) {
  const manifestPath = join(outDir, MANIFEST_FILE)
  const manifest = parseManifest(await readFile(manifestPath, 'utf8'), manifestPath)
  const pages = []
  for (const page of manifest.pages) {
    // Every name in this manifest was checked by `parseManifest`, for every
    // page, before this loop began — so the join below cannot leave `outDir`
    // and this loop has no validation left to do. Reading a name only when it
    // is about to be used is what let the pages past the strip through
    // unchecked.
    const drawn = pages.length < THUMBNAIL_STRIP_PAGES
    pages.push({ ...page, svg: drawn ? await readFile(join(outDir, page.file), 'utf8') : null })
  }
  // `draft` travels with the bundle rather than with the record, so a card
  // reopened after a restart still says so: `recallAnywhere` rebuilds the
  // bundle from this manifest, and the manifest is where the unfilled pages
  // are named in the first place.
  return { ...manifest, pages, draft: pages.some((p) => p.placeholder === true) }
}

/**
 * A manifest, or a clear statement that this one is not usable.
 *
 * Checked rather than trusted for the same reason the record is: it is a file
 * on disk between runs, so it can be half-written, hand-edited, or produced by
 * a version whose shape this one does not know. Every one of those used to
 * arrive as a `TypeError` on `manifest.pages` — which the layer above turned
 * into "the rendered deck is no longer complete", telling the user a file had
 * been deleted when nothing had.
 */
function parseManifest(raw, path) {
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    throw new PreviewDamaged(`${path} is present but unreadable`)
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.pages)) {
    throw new PreviewDamaged(`${path} is not in a shape this version understands`)
  }
  // Every element, not just the array around them. Checking the container and
  // then trusting its contents left `{"pages":[null]}` — legal JSON, and a
  // shape a half-written file can genuinely have — to throw a `TypeError` on
  // `page.file` two lines later, which the layer above dressed up as "a file
  // has been deleted". Validating the outside of a structure and reaching
  // straight into the inside is the same bug as not validating at all.
  for (const [index, page] of manifest.pages.entries()) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw new PreviewDamaged(`${path} has a page ${index + 1} this version cannot read`)
    }
    // Every page, not only the ones whose markup this call is about to read.
    // Checking a name at the moment it becomes a path meant the check followed
    // the reader: the thumbnail strip reads twelve pages, so pages thirteen and
    // up were never looked at, and `"file": "../../escape.svg"` on page
    // thirteen came back in the bundle unchallenged.
    if (!isSafeFileName(page.file)) {
      throw new PreviewDamaged(`${path} names a page ${index + 1} file this version will not open: ${page.file}`)
    }
  }
  return manifest
}

/**
 * Name what is wrong with a preview directory whose record survived.
 *
 * This becomes the body of a 410, and the difference between "your preview is
 * gone" and "your preview is gone because `001.svg` is not there" is the
 * difference between a dead end and something the user can look at. Node's
 * filesystem errors carry the path they were about, which is exactly the fact
 * worth forwarding — and this is a message about the user's own home
 * directory, on a route the harness serves locally, so there is nothing here
 * worth withholding. Nothing in this file enforces that locality: it comes from
 * whatever `ctx.webServer` binds to, which is a thing to check again if a
 * harness ever binds outward.
 *
 * "is missing" is asserted only when the error says nothing is there, which is
 * `ENOENT` and the `ENOTDIR` carrying the same fact one component up. Saying it
 * for every error that happened to carry a path is how an `EACCES` came to be
 * reported as a deletion — a claim about the user's own actions, made on no
 * evidence, and one the card acts on by retiring the deck.
 */
function describeIncomplete(error, dir) {
  if (isAbsent(error) && typeof error.path === 'string') return `${error.path} is missing`
  if (error instanceof PreviewDamaged) return error.message
  return `${join(dir, MANIFEST_FILE)} could not be read`
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
  /**
   * The shared preview root, deliberately shared.
   *
   * Two services on one machine — a reload, a second profile, two DSH windows,
   * an old plugin version and a new one side by side — now read and write the
   * same directory, which is the reverse of what this file used to do. It is
   * also the point: an upgraded plugin has to find the previews the old one
   * rendered, and "the same user's own decks" is not a boundary worth
   * defending. Ids are UUIDs, so the only way to name a deck is to already
   * have its transcript. Concurrent writers never share a file (one directory
   * per id, records published by rename), and no service deletes anything
   * another one could be reading.
   *
   * Captured once here rather than re-read per call, so no lookup can relocate
   * under its own route mid-session. The notice page and `locateDeckDir` still
   * read the environment when they run, which only matters to a process that
   * moves its own home while running.
   */
  const root = previewRoot()

  // THE DISK IS THE SOURCE OF TRUTH. THERE IS NO READ CACHE.
  //
  // There was one: `id -> bundle`, checked before the filesystem and returned
  // whole on a hit. It looked like a pure performance win and was a
  // correctness bug, because it made the answer to "does this preview exist"
  // depend on process state instead of on disk. Delete a preview directory and
  // the three routes disagreed on the spot: the bundle route answered 200 from
  // memory, `/html` and `/pptx` went to disk and answered 410, and the moment
  // the entry aged out of the map — or the harness restarted — all three
  // switched to 404. One fact, three answers, and which one you got depended on
  // how many other previews had been rendered since.
  //
  // That is fatal to the whole missing-state design, because the card is built
  // on those statuses meaning something stable: 404 and 410 are final and are
  // never re-asked. A cached 200 over a deleted deck is a card that draws
  // thumbnails for files that are not there and a download button that fails
  // when clicked.
  //
  // So every read goes to disk, every time. If a cache comes back it must be
  // an optimisation over the same answer — validated against disk on every hit,
  // never consulted in place of it — and the reason to want one is not obvious:
  // a bundle read is a manifest plus at most `THUMBNAIL_STRIP_PAGES` files, on
  // a local disk, a handful of times per session.

  /**
   * Persist a preview under an id already chosen, and hand back the entry the
   * route will see.
   *
   * `execute` does not go through here — it writes its record into the staging
   * directory so that the whole preview publishes in one `rename`. What is left
   * is the entry point for a caller that has files in place and wants an id to
   * point at them, which is what the tests use it for.
   */
  async function remember(id, entry) {
    const dir = requirePreviewDir(root, id)
    const record = recordFrom(entry)
    // Awaited, not fired and forgotten: returning before the record lands means
    // handing out an id the disk has never heard of.
    await writeRecord(root, id, record)
    return { ...entryFromRecord(dir, record), bundle: entry.bundle }
  }

  /**
   * Find a preview by id, on disk, every time.
   *
   * A card lives in a transcript, and a transcript outlives everything: the
   * user scrolls back to a session from last week, and the card has to show
   * the deck it showed then. Memory cannot do that — it dies with the process,
   * and DSH restarts on every plugin reload — so a historical session would
   * have rendered an empty card and a download that saved a 404 body. The
   * record survives the restart, and the rendered bundle is still sitting in
   * `outDir`, so a reload costs a re-read and nothing else.
   *
   * There used to be a third tier: when `outDir` was gone, re-render the deck
   * from the pinned snapshot. It is deliberately gone, for two reasons.
   * `captureSnapshot` writes the snapshot *into* `outDir`, so "the directory
   * is gone but the snapshot survives" was close to unreachable in the first
   * place. And a re-render today is not the deck this card is showing: it
   * reads whatever configuration, theme and image bytes exist now, through
   * whatever renderer version is installed now. It could not reproduce the
   * .pptx either, so keeping it would have left the card showing one deck and
   * the download button reporting the deck as gone. One honest answer beats
   * two halves that disagree.
   *
   * FIVE OUTCOMES, EXHAUSTIVE AND MUTUALLY EXCLUSIVE. They are what the
   * route's status codes are made of, so a real failure landing in the wrong
   * one is a lie told to the user, not a cosmetic slip. In the order this
   * function decides them:
   *
   *  1. the id is not a shape this module hands out -> undefined -> 404
   *     `preview_unknown`. Nothing touches the filesystem.
   *  2. nothing usable at `<root>/<id>` — deleted wholesale, an id from the
   *     old `$TMPDIR` layout that was never in this root, or something at that
   *     name that is not a directory -> undefined -> 404 `preview_unknown`.
   *     All three are the same answer to the card.
   *  3. the directory is there and `record.json` is not -> `PreviewExpired` ->
   *     410 `preview_missing`. This one used to fall into (2), which claimed
   *     the id had never existed while its rendered pages were sitting right
   *     there. A missing bookkeeping file is a preview that lost part of
   *     itself, which is exactly what `missing` means.
   *  4. the record or the manifest is present and cannot be understood ->
   *     `PreviewDamaged` -> 410 `preview_damaged`.
   *  5. anything this process could not read -> `PreviewUnreadable` -> 503
   *     `preview_unreadable`.
   *
   * The split between (2) and (3) is a `stat` of the directory, and it is
   * errno-aware for the same reason everything else here is: a directory this
   * process cannot stat is (5) when a retry could fix the errno and (4) when it
   * could not. Never (2) — which is the half that matters, since (2) is the one
   * answer that retires a deck.
   *
   * Nothing is written on this path, and nothing is remembered from it, so the
   * answer is a function of the disk alone.
   */
  async function recallAnywhere(id) {
    const dir = previewDir(root, id)
    if (!dir) return undefined

    const record = await readRecord(root, id)
    if (!record) {
      // Which of the two absences is this? "No such directory" and "a
      // directory that lost its record" are different facts about the user's
      // disk and deserve different answers.
      // Anything that is not a directory is not a preview, whatever it is, so
      // it answers the same way an empty root does.
      if ((await directoryState(dir)) !== 'directory') return undefined
      throw new PreviewExpired(
        `the rendered deck for this preview is no longer complete: ${join(dir, RECORD_FILE)} is missing`,
      )
    }

    let bundle
    try {
      bundle = await readPreviewBundle(dir)
    } catch (error) {
      // Three outcomes, from the one classifier. A page that is not there is
      // final and is a deletion. A page this process could not open right now
      // is not final at all — answering that with a 410 would retire a whole
      // deck over a permission bit. Anything else is fixed bad data, and
      // reporting *that* as a deletion is the accusation this module keeps
      // having to be stopped from making.
      if (error instanceof PreviewDamaged) throw error
      const failure = classifyReadFailure(error)
      if (failure === 'unreadable') {
        throw new PreviewUnreadable(
          `this preview's rendered deck could not be read right now: ${describeUnreadable(error, dir)}`,
        )
      }
      if (failure === 'damaged') {
        throw new PreviewDamaged(
          `this preview's rendered deck cannot be read: ${describeUnreadable(error, dir)}`,
        )
      }
      throw new PreviewExpired(
        `the rendered deck for this preview is no longer complete: ${describeIncomplete(error, dir)}`,
      )
    }
    return { ...entryFromRecord(dir, record), bundle }
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
        // `<id>`, `<id>/pptx` or `<id>/html`. Matched off the end so the id is
        // whatever is left, and then shape-checked before anything touches the
        // filesystem — a traversal attempt has to fail on all three paths, not
        // only on the bare one.
        const want = rest.endsWith('/pptx') ? 'pptx' : rest.endsWith('/html') ? 'html' : 'bundle'
        const id = want === 'bundle' ? rest : rest.slice(0, -(want.length + 1))
        // Every answer this handler writes carries the same stamp, success and
        // failure alike, and the card refuses to read a verdict off a response
        // without it. The reason is that a 404 is not self-identifying: a
        // plugin whose route failed to register, a proxy in front of the
        // harness, or a shell serving its own not-found page all produce one
        // that looks identical to ours. The card treats our 404 as final, so an
        // unstamped 404 must not be allowed to retire a deck that this module
        // was never even asked about.
        const send = (status, headers, body) => {
          res.writeHead(status, { ...headers, [ROUTE_HEADER]: ROUTE_HEADER_VALUE })
          res.end(body)
        }
        // One failure vocabulary, three statuses, two representations. The
        // status is the part the card acts on: 404/410 are verdicts about the
        // deck and are never re-asked, 5xx is a verdict about this request and
        // is. The page follows the status rather than the call site, so a
        // temporary failure can never reach a reader wearing the "rebuild it"
        // wording. Splitting the representation per branch instead is how the
        // html route once ended up answering a person with a JSON object.
        const fail = (status, code, message) => {
          if (want === 'html') {
            // Chosen from the code, never from the call site. Every branch that
            // reports a failure now names what kind it is, so the page a person
            // reads and the code a program reads cannot disagree — which they
            // did: the body said "present but unreadable" and the page said
            // "no longer on disk".
            const page = noticePageFor(code, message)
            send(
              status,
              { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(page) },
              page,
            )
            return
          }
          send(status, { 'content-type': 'application/json' }, JSON.stringify({ code, error: message }))
        }
        /** A file this route serves: gone is final, unreadable is not. */
        const failReading = (error, path, gonePhrase) => {
          const failure = classifyReadFailure(error)
          if (failure === 'unreadable') {
            fail(
              503,
              FAILURE_CODES.unreadable,
              `this preview could not be read right now: ${describeUnreadable(error, path)}`,
            )
            return
          }
          if (failure === 'damaged') {
            fail(410, FAILURE_CODES.damaged, `this preview cannot be read: ${describeUnreadable(error, path)}`)
            return
          }
          fail(410, FAILURE_CODES.missing, gonePhrase)
        }
        let entry
        try {
          entry = ID_PATTERN.test(id) ? await recallAnywhere(id) : undefined
        } catch (error) {
          if (error instanceof PreviewUnreadable) {
            // 503, and specifically not 404 or 410. The preview may be entirely
            // intact; this process could not look at it. Since the card retires
            // a deck for good on a 4xx, spending one on a permission change or
            // a bad sector would lose a deck that is sitting right there — the
            // same mistake the client half was just fixed for, one layer down.
            fail(503, FAILURE_CODES.unreadable, error.message)
            return
          }
          if (error instanceof PreviewDamaged) {
            // 410, because re-reading the same bytes fails the same way for
            // ever — but under its own code, which is the part that was
            // missing. The status says "final"; the code says which kind of
            // final, and without it the card had no way to avoid telling the
            // user they had deleted a file that is sitting right there.
            fail(410, FAILURE_CODES.damaged, error.message)
            return
          }
          if (!(error instanceof PreviewExpired)) throw error
          // 410, not 404, and the distinction is one the card acts on. The id
          // named a directory that is still there and no longer whole, so the
          // message names what went missing. The alternative — a re-render of
          // today's version of the deck, passed off as the one in the card — is
          // what this whole module exists to refuse.
          fail(410, FAILURE_CODES.missing, error.message)
          return
        }
        if (!entry) {
          // Nothing at `<root>/<id>` at all: deleted wholesale, or written by a
          // version that kept its previews somewhere else. There is deliberately
          // no gravestone on disk to tell those apart — see the note on
          // expiry — so the honest answer is that this id is not here. The
          // card fills in the rest from the transcript, which still carries the
          // page count from the run that produced this id.
          fail(404, FAILURE_CODES.unknown, 'unknown preview id')
          return
        }
        if (want === 'bundle') {
          send(200, { 'content-type': 'application/json' }, JSON.stringify(entry.bundle))
          return
        }
        if (want === 'html') {
          // The viewer the card's modal loads in an iframe. Served straight
          // off disk exactly as `preview --html` wrote it: it already has the
          // filmstrip, the keyboard paging, the light/dark surround and the
          // audit panel, and it is the same file a harness with no plugin UI
          // is told to open. Reimplementing any of that in React here is how
          // the card ended up with a page-count budget, a stand-in for
          // "missing" pages and its own arrow keys, none of which the real
          // preview has.
          const htmlPath = join(entry.outDir, PREVIEW_HTML_FILE)
          let html
          try {
            html = await readFile(htmlPath)
          } catch (error) {
            // Same disposition as a missing .pptx: if the file is really not
            // there the id was real and the page is not, which is a 410 rather
            // than a 404 or a re-render — the iframe must never be handed a
            // page rebuilt out of today's configuration and passed off as the
            // deck in the card. But only for `ENOENT`: a file this process
            // could not open is a 503, or one unlucky permission bit would
            // retire the viewer for good.
            failReading(error, htmlPath, `the preview page for this preview is gone (${htmlPath})`)
            return
          }
          send(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length }, html)
          return
        }
        // Served, not rendered. This handler starts no process and writes
        // nothing — the .pptx was produced during the same `execute` that
        // produced the SVGs the user paged through, which is the closest the
        // two can get to being one deck — what that does and does not pin is
        // the list at the top of this file. It also means two
        // browsers hitting the same id at once are two readers of one file
        // rather than two renderers racing to write it.
        if (!entry.pptxPath) {
          // Either the export failed while the preview itself succeeded, or
          // this record predates exports being rendered up front. Both are
          // permanent for this id: there is no second render to fall back to.
          // `missing` rather than `damaged`: the deck itself is fine and the
          // card should keep drawing it — what is absent is the export.
          fail(
            410,
            FAILURE_CODES.missing,
            entry.pptxError || 'this preview has no exported deck and cannot produce one now',
          )
          return
        }
        let bytes
        try {
          bytes = await readFile(entry.pptxPath)
        } catch (error) {
          // Same disposition as a missing bundle: if the file is really not
          // there, the id was real and the export is not. Re-rendering from the
          // snapshot would hand back a deck built from today's configuration
          // and today's image bytes, which is exactly the substitution this
          // design exists to prevent. `EACCES` and friends are a 503 instead —
          // the file is there, this process just could not open it.
          failReading(error, entry.pptxPath, `the exported deck for this preview is gone (${entry.pptxPath})`)
          return
        }
        send(
          200,
          {
            'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'content-disposition': `attachment; filename="${basename(entry.pptxPath)}"`,
            'content-length': bytes.length,
          },
          bytes,
        )
      },
    })
  }

  /**
   * Everything one `execute` writes into one preview directory.
   *
   * Takes the directory rather than deriving it from the id, because the
   * directory it fills is `<id>.partial` and not the one that id resolves to.
   * Nothing written here is reachable through the route: the id becomes
   * answerable in the single `rename` that `execute` performs afterwards.
   */
  async function render(outDir, target, exec) {
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

    // The export, here, now, in the same call — see ONE RENDER WINDOW at
    // the top of this file. The directory is named after an id nobody else
    // has yet been given, so there is no other writer to publish around.
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
    const record = recordFrom({ target, themeFile, pptxPath: pptxError ? undefined : pptxPath, pptxError })
    // Written last, and into the directory it describes. `recallAnywhere` looks
    // for this file first, so a directory without one is a render that never
    // reached the end. The rename below means no preview is *published* in that
    // state; something removing the record afterwards still puts one there, and
    // that is what outcome (3) answers.
    await writeRecordInto(outDir, record)
    return { record, bundle, findingCount }
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
      // The id comes first, because it names the directory everything else is
      // written into. That inversion is what removes the half-dead state: there
      // is no moment where rendered pages exist under one name and the record
      // that finds them is being written under another.
      const previewId = randomUUID()
      const outDir = requirePreviewDir(root, previewId)
      const stageDir = partialDir(root, previewId)
      let rendered
      try {
        // Inside the try, not before it. `createOwnedDir` can fail after
        // creating the directory (see its own note), and a failure that lands
        // outside the cleanup is a directory nothing will ever collect.
        await createOwnedDir(root, stageDir)
        rendered = await render(stageDir, target, exec)
        // The publish, and the only moment this id means anything. A render
        // takes seconds and writes a dozen files; a machine that dies part-way
        // through one used to leave a directory the route would happily serve
        // — a manifest naming SVGs that were never written, a card with holes
        // in it, a download button pointing at nothing. `rename` inside one
        // filesystem is atomic, so no reader ever sees half a publish, and a
        // machine that dies mid-render leaves an `<id>.partial` no id resolves
        // to. Nothing here calls fsync, so a machine that dies in the seconds
        // after the rename is still on its own — a far smaller window than the
        // one this replaced, not the absence of one.
        await rename(stageDir, outDir)
      } catch (error) {
        // Only ever the staging directory, and only when this call created it:
        // a failing target must not park hundreds of megabytes of half-rendered
        // deck in the user's home, and must not touch anything published.
        await discardOwnedDir(stageDir)
        throw error
      }
      const { bundle, findingCount } = rendered
      return {
        previewId,
        outDir,
        pageCount: bundle.pages.length,
        findingCount,
        // `checks` is present only when the audit actually ran. Absent is not
        // "clean" — the preview manifest goes out of its way to keep those two
        // apart, and collapsing them here would undo that.
        audited: Boolean(bundle.checks),
        bundle,
      }
    },
    timeoutMs: 120_000,
  }

  // No `recall` any more, and its absence is the point: there is no second,
  // faster way to ask this service about an id. Everything goes through
  // `recallAnywhere`, which goes to disk.
  return { tool, registerRoute, remember, recallAnywhere, root }
}

/**
 * Shorthand for a service whose route is never registered — the tool alone.
 * Each call builds its own service, so no two callers share a CLI path or a
 * route. They do share the preview root, deliberately, for the reasons argued
 * where it is captured.
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
  entryFromRecord,
  fileInside,
  previewDir,
  partialDir,
  isSafeFileName,
  directoryState,
  createOwnedDir,
  discardOwnedDir,
  missingPage,
  unreadablePage,
  damagedPage,
  noticePageFor,
  describeIncomplete,
  parseManifest,
  inlineLocalImages,
  isAbsent,
  isTransient,
  classifyReadFailure,
  RETRYABLE_ERRNOS,
  THUMBNAIL_STRIP_PAGES,
  PREVIEW_HTML_FILE,
  PREVIEW_DIR,
  RECORD_FILE,
  MANIFEST_FILE,
  SNAPSHOT_FILE,
  PARTIAL_SUFFIX,
  OWNER_MARKER,
  PreviewExpired,
  PreviewUnreadable,
  PreviewDamaged,
  resolveCliCommand,
  cliChildEnv,
}
