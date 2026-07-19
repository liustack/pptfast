import JSZip from "jszip"
import type { Component } from "@/ir"

/**
 * Deck-level slide-transition effect (S1 in the wave-C plan). `"none"` opts a
 * deck out of the default fade transition entirely — no `<p:transition>` is
 * injected. Element-level entrance animations (`meta.animation.elements`)
 * are a separate switch (S3, wired further down in this file —
 * `applyElementAnimations`) and don't live in this section.
 */
export type SlideTransitionEffect = "fade" | "push" | "wipe" | "none"

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

/** A `.pptx`'s own slide part path, e.g. `ppt/slides/slide1.xml`. */
const SLIDE_PART_RE = /^ppt\/slides\/slide\d+\.xml$/

/**
 * Any previously-injected `<p:transition>…</p:transition>` block, matched
 * non-greedily so a slide already carrying one is replaced rather than
 * duplicated — the idempotency `applySlideTransitions` relies on.
 */
const TRANSITION_RE = /<p:transition[\s\S]*?<\/p:transition>/

/**
 * The Office-2010 `p14:dur` extension namespace, in milliseconds. Matches
 * `~/projects/claw/DSpark-科普版-动画版.pptx`'s own unpacked slide XML byte
 * for byte on the `fade` case (only effect that real sample deck exercises);
 * `push`/`wipe` extrapolate from the same namespace and element-naming
 * convention per ECMA-376 §19.5.10 (`CT_SideDirectionTransition`) and
 * `~/.claude/ppt-master/skills/ppt-master/scripts/pptx_animations.py`
 * (`TRANSITIONS` table), the wave-C plan's named blueprint for the two
 * effects the sample deck doesn't cover. Both take an explicit `dir="r"` —
 * the schema default is `"l"`, but pptx_animations.py picks `"r"` for a more
 * legible left-to-right reading-order motion, and this module mirrors that
 * choice for consistency with the blueprint.
 */
const TRANSITION_ELEMENT: Record<Exclude<SlideTransitionEffect, "none">, string> = {
  fade: "<p:fade/>",
  push: '<p:push dir="r"/>',
  wipe: '<p:wipe dir="r"/>',
}

/**
 * Generate a `<p:transition>` fragment for one of the three supported
 * effects. `durMs` defaults to 400 — the wave-C plan's S2 default and the
 * exact value the DSpark sample deck uses for its fade transitions.
 */
export function transitionXml(
  effect: Exclude<SlideTransitionEffect, "none">,
  durMs = 400
): string {
  return `<p:transition p14:dur="${durMs}" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">${TRANSITION_ELEMENT[effect]}</p:transition>`
}

/**
 * Patch a finished `.pptx`'s slide XML, injecting the deck's transition
 * effect into every slide part.
 *
 * Same JSZip-write-after-patch shape as the sibling `render.ts`'s
 * `applyGradientFills` and `pptx-dedupe-media.ts`'s `dedupePptxMedia` (open
 * the zip, rewrite parts, re-zip) — reusing that basis rather than teaching
 * pptxgenjs about transitions, which has no API for them (same shape of gap
 * as the gradient-fill one `applyGradientFills`'s doc comment describes).
 *
 * Insertion point: immediately before each slide part's closing `</p:sld>`.
 * Per ECMA-376's `CT_Slide` child order (`p:cSld`, `p:clrMapOvr`,
 * `p:transition`, `p:timing`, `p:extLst`, all optional after `p:cSld`) and
 * pptxgenjs's own output (verified by unzipping a real `generatePptxBlob`
 * result: every slide part ends `...</p:cSld><p:clrMapOvr>...</p:clrMapOvr></p:sld>`,
 * no `p:timing`), appending right before `</p:sld>` lands `p:transition` in
 * the only schema-valid slot without needing to locate `</p:clrMapOvr>`
 * (which pptxgenjs always emits, but isn't a documented contract).
 *
 * Idempotent: any transition block already present on a slide (from a prior
 * call on the same blob) is stripped before the new one is inserted, so
 * repeated calls never stack multiple `<p:transition>` elements.
 *
 * Defensive like `dedupePptxMedia` (not fail-loud like `applyGradientFills`):
 * a bad/non-zip input just comes back unchanged. That asymmetry is
 * deliberate — `applyGradientFills` fails loud because a missed per-shape
 * patch would silently ship the wrong *visual* (a solid fill where a
 * gradient was authored). A missed transition has no such failure mode: it
 * is deck-wide and uniform, not keyed to any per-shape target that could go
 * missing, so the only realistic failure is a malformed/mock zip (as
 * `pptx-generate.test.ts`'s `FakePptx.write()` stub produces) — exactly the
 * case `dedupePptxMedia` already treats as a no-op passthrough so export
 * never breaks.
 */
export async function applySlideTransitions(
  pptx: Blob | ArrayBuffer | Uint8Array,
  effect: SlideTransitionEffect = "fade",
  durMs = 400
): Promise<Blob> {
  const asBlob = pptx instanceof Blob ? pptx : new Blob([pptx as BlobPart], { type: PPTX_MIME })
  if (effect === "none") return asBlob

  try {
    const zip = await JSZip.loadAsync(await asBlob.arrayBuffer())
    const slidePaths = Object.keys(zip.files).filter(
      (p) => SLIDE_PART_RE.test(p) && !zip.files[p].dir
    )
    if (slidePaths.length === 0) return asBlob

    const fragment = transitionXml(effect, durMs)
    for (const path of slidePaths) {
      const raw = await zip.files[path].async("string")
      const stripped = raw.replace(TRANSITION_RE, "")
      const closeIdx = stripped.lastIndexOf("</p:sld>")
      if (closeIdx === -1) continue // not a well-formed slide part — leave untouched
      const xml = stripped.slice(0, closeIdx) + fragment + stripped.slice(closeIdx)
      zip.file(path, xml)
    }

    const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
    return new Blob([ab], { type: PPTX_MIME })
  } catch {
    return asBlob
  }
}

// ============================================================================
// S3 — per-component entrance animations (opt-in, meta.animation.elements="auto")
// ============================================================================

/**
 * Zero-pad to 4 digits (`2` → `"0002"`). Every `blockMarker` this file
 * produces is therefore exactly the same length, which is what makes a plain
 * `.includes(marker)` substring check safe in `collectSpidsForBlock` below —
 * two *different* markers can never be a substring of one another (unlike,
 * say, `"blk0-2"` inside `"blk0-20"`) because same-length strings are only
 * substrings of each other when they're identical. Four digits comfortably
 * covers any realistic deck (thousands of slides/components); if a deck ever
 * exceeded it the marker just gets wider and stays internally consistent —
 * it would only collide with a *different* over-9999 index, not with any
 * normal one.
 */
export function pad4(n: number): string {
  return String(n).padStart(4, "0")
}

/**
 * The `blk{slideIndex}-{blockIndex}` token `renderOps` (svg2pptx/render.ts)
 * folds into a component-tagged shape's `objectName`, and this module's own
 * `collectSpidsForBlock` searches for to reverse-lookup that component's spids
 * from the exported slide XML's `<p:cNvPr id="…" name="…">` entries.
 */
export function blockMarker(slideIndex: number, blockIndex: number): string {
  return `blk${pad4(slideIndex)}-${pad4(blockIndex)}`
}

/** Semantic entrance effect chosen per component type (wave-C plan, S3). */
export type ElementAnimationEffect = "fade" | "wipe" | "fly"

/**
 * Component type → entrance effect, per the wave-C plan's S3 semantic mapping:
 * `chart` → wipe, `steps` → fly, everything else (`kpi_cards`/`icon_cards`/
 * `verdict_banner` explicitly called out in the plan, plus every other component
 * type) → fade.
 */
export function blockAnimationEffect(blockType: Component["type"]): ElementAnimationEffect {
  if (blockType === "chart") return "wipe"
  if (blockType === "steps") return "fly"
  return "fade"
}

/**
 * `filter`/`presetID`/`presetSubtype` triples for each effect, keyed to real,
 * already-shipped PowerPoint XML rather than invented values:
 *
 * - `fade` matches the DSpark sample deck's own byte-verified `<p:animEffect
 *   filter="fade">` + `presetID="10" presetClass="entr" presetSubtype="0"`
 *   (`~/projects/claw/DSpark-科普版-动画版.pptx`, slide3.xml).
 * - `wipe` and `fly` aren't in the sample (it only exercises fade + a
 *   bottom-rising slide effect), and the plan asks for specific directions —
 *   chart's wipe "rising from the bottom", steps' fly "entering from the
 *   left" — that ppt-master's own *default* `wipe`/`fly` table entries don't
 *   have (`wipe`'s default is `wipe(left)`, `fly`'s is `slide(fromBottom)`).
 *   Rather than inventing a new presetID/subtype pairing for those specific
 *   directions (unverifiable without a live PowerPoint to reverse-engineer
 *   against), both reuse a *different*, already-verified entry from
 *   `~/.claude/ppt-master/skills/ppt-master/scripts/pptx_animations.py`'s
 *   `ANIMATIONS` table that already carries the direction the plan wants:
 *   `wipe` here is ppt-master's `peek` (`wipe(down)`, presetID 12, subtype
 *   4 — "Peek In, From Bottom" in PowerPoint's own gallery), and `fly` here
 *   is ppt-master's `cut` (`slide(fromLeft)`, presetID 42, subtype 8 —
 *   "Cut In, From Left"). The OOXML bytes are exactly what that blueprint
 *   ships; only which of *our* semantic component types triggers them differs.
 */
const ELEMENT_EFFECT_PRESET: Record<
  ElementAnimationEffect,
  { filter: string; presetID: number; presetSubtype: number }
> = {
  fade: { filter: "fade", presetID: 10, presetSubtype: 0 },
  wipe: { filter: "wipe(down)", presetID: 12, presetSubtype: 4 },
  fly: { filter: "slide(fromLeft)", presetID: 42, presetSubtype: 8 },
}

/** One component's entrance: the shapes (spids) that enter together, and how. */
export interface ElementAnimationEntry {
  effect: ElementAnimationEffect
  /** Shape ids from `<p:cNvPr id="…">`, in document order. */
  spids: number[]
}

/** `<p:set>` (visibility) + `<p:animEffect>` pair for one target spid. */
function setAnimEffectPairXml(spid: number, filter: string, nextId: () => number): string {
  const setId = nextId()
  const effId = nextId()
  return (
    `<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:to><p:strVal val="visible"/></p:to></p:set>` +
    `<p:animEffect transition="in" filter="${filter}"><p:cBhvr>` +
    `<p:cTn id="${effId}" dur="400"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    `</p:cBhvr></p:animEffect>`
  )
}

/**
 * One component's `<p:par>`, chained `delayMs` after the shared outer wrapper
 * begins. Single-spid components match the DSpark sample's own structure
 * byte-for-byte (modulo ids/delay/filter): wrapper → presetID leaf
 * (`nodeType="afterEffect"`) → one set+animEffect pair. Multi-spid components
 * ("块内 shape 同时入场" — S3) add one `nodeType="withEffect"` leaf per spid,
 * *siblings* directly under this wrapper — `withEffect` (not `afterEffect`)
 * because these targets start *together*, not chained after one another.
 * `<p:par>` children already play concurrently, so no extra grouping layer
 * is needed to make that happen.
 *
 * PowerPoint compatibility invariant (do not reintroduce a 4th layer here):
 * this function's caller (`elementTimingXml`) nests exactly
 * `mainSeq → click par → this wrapper → effect leaf`, three `<p:par>` deep.
 * An earlier revision wrapped the multi-spid leaves in one more `<p:par>`
 * "group" (a plain delay=0 par whose only job was bundling siblings — which
 * `<p:par>`'s own concurrent-children semantics already provide for free),
 * producing a 4th nesting level. PowerPoint's `mainSeq` timing tree does not
 * tolerate that: opening the file triggered its "repair" prompt every time
 * (confirmed via a real PowerPoint automation probe — see the
 * "mainSeq par-nesting depth" regression suite in `pptx-animations.test.ts`,
 * which asserts the resulting tree structurally rather than by string
 * content, precisely to catch this class of regression).
 */
function blockParXml(
  entry: ElementAnimationEntry,
  delayMs: number,
  nextId: () => number,
): string {
  const preset = ELEMENT_EFFECT_PRESET[entry.effect]
  const wrapperId = nextId()

  let inner: string
  if (entry.spids.length === 1) {
    const leafId = nextId()
    inner =
      `<p:par><p:cTn id="${leafId}" presetID="${preset.presetID}" presetClass="entr" ` +
      `presetSubtype="${preset.presetSubtype}" fill="hold" nodeType="afterEffect">` +
      `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
      `<p:childTnLst>${setAnimEffectPairXml(entry.spids[0], preset.filter, nextId)}</p:childTnLst>` +
      `</p:cTn></p:par>`
  } else {
    inner = entry.spids
      .map((spid) => {
        const leafId = nextId()
        return (
          `<p:par><p:cTn id="${leafId}" presetID="${preset.presetID}" presetClass="entr" ` +
          `presetSubtype="${preset.presetSubtype}" fill="hold" nodeType="withEffect">` +
          `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
          `<p:childTnLst>${setAnimEffectPairXml(spid, preset.filter, nextId)}</p:childTnLst>` +
          `</p:cTn></p:par>`
        )
      })
      .join("")
  }

  return (
    `<p:par><p:cTn id="${wrapperId}" fill="hold">` +
    `<p:stCondLst><p:cond delay="${delayMs}"/></p:stCondLst>` +
    `<p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`
  )
}

/**
 * Generate a `<p:timing>` fragment: one `mainSeq` containing one `par` per
 * component, chained `staggerMs` apart (S3's "块间 after-previous 错峰 200ms"),
 * each internally doing "set visibility → animEffect" per spid (S3's unit
 * test alignment target). Structurally mirrors the DSpark sample deck's own
 * `ppt/slides/slide3.xml` `<p:timing>` tree: `tmRoot` (id 1) → `mainSeq`
 * (id 2, `concurrent="1" nextAc="seek"`) → one shared outer wrapper (id 3,
 * `delay="indefinite"` + `onBegin` on the mainSeq id) → one chained `<p:par>`
 * per component → `<p:prevCondLst>`/`<p:nextCondLst>` siblings on `<p:seq>` and a
 * trailing `<p:bldLst>` — all present in the sample and reproduced here
 * verbatim (see this file's `pptx-animations.test.ts` for the structural
 * diff against the unpacked sample).
 *
 * Entries with no spids (component never got rendered — dropped by overflow, or
 * the theme routed it through a path that predates this feature) are
 * dropped silently; if *nothing* has spids, returns `""` so the caller skips
 * injection for that slide entirely rather than writing an empty, pointless
 * `<p:timing>`.
 */
export function elementTimingXml(entries: ElementAnimationEntry[], staggerMs = 200): string {
  const withSpids = entries.filter((e) => e.spids.length > 0)
  if (withSpids.length === 0) return ""

  let id = 3 // 1 = tmRoot, 2 = mainSeq, 3 = the shared outer wrapper below
  const nextId = () => ++id

  const blockPars = withSpids
    .map((entry, i) => blockParXml(entry, i * staggerMs, nextId))
    .join("")
  const bldLst = withSpids
    .flatMap((e) => e.spids)
    .map((spid) => `<p:bldP spid="${spid}" grpId="0"/>`)
    .join("")

  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">` +
    `<p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq">` +
    `<p:childTnLst><p:par><p:cTn id="3" fill="hold">` +
    `<p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>` +
    `<p:childTnLst>${blockPars}</p:childTnLst>` +
    `</p:cTn></p:par></p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>` +
    `<p:bldLst>${bldLst}</p:bldLst></p:timing>`
  )
}

/** Any previously-injected `<p:timing>…</p:timing>` block (idempotency, mirrors `TRANSITION_RE`). */
const TIMING_RE = /<p:timing>[\s\S]*?<\/p:timing>/

/**
 * Renumber duplicate `<p:cNvPr id="…">` values within one slide part's XML so
 * every shape id is unique before this module reverse-looks-up spids and
 * writes `<p:spTgt spid>`/`<p:bldP spid>` references to them.
 *
 * Why this is needed: pptxgenjs's own STEP1-3 per-shape id counter
 * (`idx + 2`, sequential from 2 — `node_modules/pptxgenjs/dist/pptxgen.cjs.js`,
 * `case SLIDE_OBJECT_TYPES.text/image/chart`) is completely independent of a
 * *hardcoded* `<p:cNvPr id="25" name="Slide Number Placeholder 0"/>` that
 * same file appends afterwards, as the last shape on the slide, whenever a
 * slide's master carries `slideNumber` ("STEP 4: Add slide numbers (if any)
 * last", same file, ~line 5660) — which `master-builder.ts` turns on for
 * every `content`-type master, the only slide type this module ever injects
 * a `<p:timing>` onto. A content slide with ~24+ real shapes (routine for a
 * `chart` + `steps`/`kpi_cards` combo — svg2pptx explodes each bar/badge/
 * label/gradient into its own shape) pushes that STEP1-3 counter to 25 too,
 * so the slide part ends up with *two* `<p:cNvPr id="25">` elements. Ids are
 * required unique per ECMA-376 (`CT_ShapeNonVisual`'s `id` is a `ST_DrawingElementId`,
 * document-scoped); once duplicated, a `<p:spTgt spid="25"/>` this module
 * writes is an ambiguous reference PowerPoint/WPS may resolve to either
 * shape, and does resolve inconsistently in practice (this was found by
 * unzipping a real `generatePptxBlob` output — see this file's own tests).
 *
 * The fix doesn't special-case "25": pptxgenjs (or a future version of it)
 * could hardcode other ids too, and a `<p:cNvPr id>` value's only structural
 * role in a `.pptx` is as the target of a `spid` reference — nothing else in
 * ECMA-376's shape tree cross-references it (unlike, say, `<a:stCxn>`/
 * `<a:endCxn>` on connector shapes, which svg2pptx never emits — it only
 * ever produces `<p:sp>`/`<p:pic>`/`<p:graphicFrame>`, never `<p:cxnSp>`).
 * So any duplicate is safe to renumber unconditionally: this scans the whole
 * slide XML once for every `<p:cNvPr id="…">`, keeps each id's *first*
 * occurrence untouched (document order — the real STEP1-3 content shapes,
 * always emitted before STEP4's trailing placeholder) and assigns every
 * later occurrence of an already-seen id a fresh value above the highest id
 * anywhere on the slide, so the result has zero duplicates and every
 * previously-unique id (i.e. every real, marker-tagged shape this module
 * cares about) keeps exactly the id it already had.
 */
function dedupeShapeIds(xml: string): string {
  const ID_RE = /<p:cNvPr id="(\d+)"/g
  let maxId = 0
  let scan: RegExpExecArray | null
  while ((scan = ID_RE.exec(xml))) {
    const id = Number(scan[1])
    if (id > maxId) maxId = id
  }
  if (maxId === 0) return xml // no cNvPr at all (malformed/empty part) — nothing to do

  const seen = new Set<number>()
  let nextFreeId = maxId
  return xml.replace(/(<p:cNvPr id=")(\d+)(")/g, (full, pre: string, idStr: string, post: string) => {
    const id = Number(idStr)
    if (!seen.has(id)) {
      seen.add(id)
      return full
    }
    nextFreeId += 1
    return `${pre}${nextFreeId}${post}`
  })
}

/** `slide{N}.xml` → `N`, for sorting slide parts into IR order (`Object.keys` order is not numeric). */
function slidePartNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0)
}

/** Every `<p:cNvPr id="…" name="…">` containing `marker`, in document order, as its numeric id (spid). */
function collectSpidsForBlock(xml: string, marker: string): number[] {
  const spids: number[] = []
  const re = /<p:cNvPr id="(\d+)" name="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    if (m[2].includes(marker)) spids.push(Number(m[1]))
  }
  return spids
}

/**
 * Order a slide's component indices for the entrance sequence: original
 * `slide.components` order, except `verdict_banner` component(s) move to the end
 * regardless of where they sit in that order (S3: "顺序压轴：verdict 块排
 * 最后不论块序"). Stable otherwise.
 *
 * Exported (in addition to its own use in `applyElementAnimations` below)
 * so `lib/animation.test.ts` can assert its local
 * `orderBlocksForEntrance` stays byte-for-byte in sync with this, the
 * source of truth — see that test file's own comment for why the preview
 * doesn't import this module's *values* at runtime (bundle isolation),
 * only compares against them in tests.
 */
export function orderedBlockIndices(blockTypes: readonly Component["type"][]): number[] {
  const indices = blockTypes.map((_, i) => i)
  const normal = indices.filter((i) => blockTypes[i] !== "verdict_banner")
  const verdict = indices.filter((i) => blockTypes[i] === "verdict_banner")
  return [...normal, ...verdict]
}

/**
 * Patch a finished `.pptx`'s slide XML, injecting each slide's per-component
 * entrance-animation `<p:timing>` tree (wave-C S3). Same JSZip-write-after-patch
 * shape as `applySlideTransitions` above (open the zip, rewrite parts, re-zip);
 * defensive like it too — a bad/non-zip input just comes back unchanged, since
 * a missed injection has no worse failure mode than "no animation," not a
 * wrong visual.
 *
 * `slidesBlockTypes[i]` is slide `i`'s `slide.components.map(b => b.type)`, in
 * original IR order — the same order `blockMarker`'s `blockIndex` was
 * assigned against when `renderOps` tagged each shape's `objectName`
 * (svg2pptx/render.ts). Callers should only invoke this when
 * `meta.animation.elements === "auto"`; there is no internal on/off switch
 * here; an empty `slidesBlockTypes[i]` (cover/chapter/ending slides, or any
 * slide with no components) just skips that slide.
 *
 * Insertion point matches `applySlideTransitions`: immediately before each
 * slide part's closing `</p:sld>`. Per ECMA-376's `CT_Slide` child order
 * (`cSld, clrMapOvr, transition, timing, extLst`), this always lands
 * `<p:timing>` after any `<p:transition>` already injected by that function
 * — both insert at the same "right before `</p:sld>`" point, and
 * `applySlideTransitions` always runs first in the `pptx-generate.ts`
 * pipeline, so by the time this function sees the XML any transition is
 * already the last thing before `</p:sld>`.
 *
 * Idempotent: any `<p:timing>` already present on a slide is stripped before
 * the new one is inserted.
 */
export async function applyElementAnimations(
  pptx: Blob | ArrayBuffer | Uint8Array,
  slidesBlockTypes: ReadonlyArray<ReadonlyArray<Component["type"]>>,
  staggerMs = 200,
): Promise<Blob> {
  const asBlob = pptx instanceof Blob ? pptx : new Blob([pptx as BlobPart], { type: PPTX_MIME })

  try {
    const zip = await JSZip.loadAsync(await asBlob.arrayBuffer())
    const slidePaths = Object.keys(zip.files)
      .filter((p) => SLIDE_PART_RE.test(p) && !zip.files[p].dir)
      .sort((a, b) => slidePartNumber(a) - slidePartNumber(b))
    if (slidePaths.length === 0) return asBlob

    for (let slideIndex = 0; slideIndex < slidePaths.length; slideIndex++) {
      const blockTypes = slidesBlockTypes[slideIndex] ?? []
      if (blockTypes.length === 0) continue

      const path = slidePaths[slideIndex]
      // Dedupe *before* the spid reverse-lookup below: `<p:spTgt>`/`<p:bldP>`
      // will shortly reference whatever id `collectSpidsForBlock` finds, so
      // any collision with pptxgenjs's own hardcoded placeholder ids (see
      // `dedupeShapeIds`'s doc comment) must be resolved first, not patched
      // up after the fact.
      const raw = dedupeShapeIds(await zip.files[path].async("string"))

      const entries: ElementAnimationEntry[] = orderedBlockIndices(blockTypes).map(
        (blockIndex) => ({
          effect: blockAnimationEffect(blockTypes[blockIndex]),
          spids: collectSpidsForBlock(raw, blockMarker(slideIndex, blockIndex)),
        }),
      )

      const timing = elementTimingXml(entries, staggerMs)
      if (!timing) continue // nothing on this slide actually got tagged

      const stripped = raw.replace(TIMING_RE, "")
      const closeIdx = stripped.lastIndexOf("</p:sld>")
      if (closeIdx === -1) continue // not a well-formed slide part — leave untouched
      const xml = stripped.slice(0, closeIdx) + timing + stripped.slice(closeIdx)
      zip.file(path, xml)
    }

    const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
    return new Blob([ab], { type: PPTX_MIME })
  } catch {
    return asBlob
  }
}
