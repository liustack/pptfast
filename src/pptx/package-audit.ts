import JSZip from "jszip"
import type { PptxIR } from "@/ir"
import { slideToOps } from "@/svg/render-slide"
import { PptfastError } from "../errors"
import { createPptxPackageReader, type PptxPackageReader, type PackageRelationship } from "./package-reader"
import type { ImageOp } from "./svg2pptx/image"

/**
 * PPTX package audit — Audit v2 spec §4.4's fourth layer. Runs on the
 * *finished* OOXML package (after every gradient/transition/element-
 * animation/media-dedupe JSZip patch — spec §4.4's opening line: "package
 * audit 检查'文件是否完整'…它在所有… patch 完成后执行") and is the hard gate
 * `generatePptxBlob` (`generate.ts`) runs right before returning bytes. Per
 * spec §4.4's closing paragraph, there is no skip switch: a violation is a
 * bug in the generator or one of its patches, not a user-actionable content
 * problem, so it throws loud rather than reporting a soft finding.
 *
 * Each rule below is named after — and its own doc comment cites — the
 * specific spec §4.4 bullet and/or real failure mode it exists to catch;
 * none of them attempt full ECMA-376 XSD validation (explicitly out of
 * scope, same paragraph).
 */

export type PackageAuditRuleId =
  | "zip-unreadable"
  | "core-part-missing"
  | "xml-parse-error"
  | "slide-list-mismatch"
  | "relationship-target-missing"
  | "duplicate-shape-id"
  | "invalid-shape-transform"
  | "dangling-animation-target"
  | "image-alt-dropped"

export interface PackageAuditViolation {
  rule: PackageAuditRuleId
  message: string
}

const CONTENT_TYPES_PART = "[Content_Types].xml"
const ROOT_RELS_PART = "_rels/.rels"
const PRESENTATION_PART = "ppt/presentation.xml"
const CORE_PARTS = [CONTENT_TYPES_PART, ROOT_RELS_PART, PRESENTATION_PART]

const SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
const SLIDE_PART_RE = /^ppt\/slides\/slide\d+\.xml$/

function violation(rule: PackageAuditRuleId, message: string): PackageAuditViolation {
  return { rule, message }
}

// ────────────────────────────────────────────────────────────────────────
// Rule: core-part-missing — spec §4.4 bullet 1 ("ZIP 能正常读取，核心 parts
// 存在"). The "zip readable" half is enforced by `auditPptxPackage`'s own
// load step below (a genuinely unreadable zip never reaches a reader at
// all); this half checks the three parts every valid PPTX must have
// regardless of content (verified against a real `generatePptxBlob` output
// — `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml` — the only
// three OPC/ECMA-376 parts a package cannot possibly omit and still be a
// presentation at all).
// ────────────────────────────────────────────────────────────────────────

function checkCoreParts(reader: PptxPackageReader): PackageAuditViolation[] {
  return CORE_PARTS.filter((p) => !reader.hasPart(p)).map((p) => violation("core-part-missing", `core part missing: ${p}`))
}

// ────────────────────────────────────────────────────────────────────────
// Rule: xml-parse-error (foundational parts) — spec §4.4 bullet 2
// ("[Content_Types].xml、根关系和 presentation 关系能解析"). `readXml`
// already throws on a part that doesn't survive parsing to any root element
// at all; this adds one more check `readXml` deliberately leaves to its
// callers (see that method's own doc comment) — the parsed root is actually
// the tag this part is supposed to have, not some other survivor of
// linkedom's lenient auto-repair. `ppt/presentation.xml`'s own root-tag
// sanity is folded in here too (slightly beyond the bullet's literal three
// parts) because the very next rule (slide-list-mismatch) can't do anything
// meaningful without it — it's a direct prerequisite, not a separate
// concern.
// ────────────────────────────────────────────────────────────────────────

const FOUNDATIONAL_ROOT_TAGS: ReadonlyArray<readonly [string, string]> = [
  [CONTENT_TYPES_PART, "Types"],
  [ROOT_RELS_PART, "Relationships"],
  [PRESENTATION_PART, "p:presentation"],
]

async function checkFoundationalParse(reader: PptxPackageReader): Promise<PackageAuditViolation[]> {
  const violations: PackageAuditViolation[] = []
  for (const [part, expectedRoot] of FOUNDATIONAL_ROOT_TAGS) {
    try {
      const doc = await reader.readXml(part)
      const rootTag = doc.documentElement?.tagName
      if (rootTag !== expectedRoot) {
        violations.push(
          violation(
            "xml-parse-error",
            `${part}: expected root element <${expectedRoot}>, found ${rootTag ? `<${rootTag}>` : "none"}`,
          ),
        )
      }
    } catch (e) {
      violations.push(violation("xml-parse-error", `${part}: ${(e as Error).message}`))
    }
  }
  // presentation's own relationships (ppt/_rels/presentation.xml.rels) —
  // bullet 2's third "parses" target. `readRelationships` only throws on a
  // genuine parse failure of that .rels part; a *missing* .rels file
  // returns `[]` (not an error — most parts have none by design), which the
  // next rule surfaces on its own terms (every <p:sldId> would fail to
  // resolve to any relationship at all — a more specific, more actionable
  // message than "file missing" would be here).
  try {
    await reader.readRelationships(PRESENTATION_PART)
  } catch (e) {
    violations.push(violation("xml-parse-error", `ppt/_rels/presentation.xml.rels: ${(e as Error).message}`))
  }
  return violations
}

// ────────────────────────────────────────────────────────────────────────
// Rule: slide-list-mismatch — spec §4.4 bullet 3 ("presentation.xml 的
// slide 列表与 slide relationships、slide parts 数量一致"). Real failure
// mode this guards: a patch step (or a future one) that adds/removes a
// slide *part* or its presentation-level relationship without keeping
// `<p:sldIdLst>` in sync would otherwise ship a deck where PowerPoint's own
// slide list silently disagrees with what's actually in the package.
// ────────────────────────────────────────────────────────────────────────

async function checkSlideListConsistency(reader: PptxPackageReader): Promise<PackageAuditViolation[]> {
  const violations: PackageAuditViolation[] = []
  const presDoc = await reader.readXml(PRESENTATION_PART)
  const sldIdNodes = presDoc.getElementsByTagName("p:sldId")
  const sldRIds: string[] = []
  for (let i = 0; i < sldIdNodes.length; i++) sldRIds.push(sldIdNodes[i]!.getAttribute("r:id") ?? "")

  const presRels = await reader.readRelationships(PRESENTATION_PART)
  const slideRelsById = new Map<string, PackageRelationship>()
  for (const rel of presRels) if (rel.type === SLIDE_REL_TYPE) slideRelsById.set(rel.id, rel)

  const slideParts = reader.listParts().filter((p) => SLIDE_PART_RE.test(p))
  const slidePartSet = new Set(slideParts)

  if (sldRIds.length !== slideRelsById.size) {
    violations.push(
      violation(
        "slide-list-mismatch",
        `presentation.xml's <p:sldIdLst> lists ${sldRIds.length} slide(s) but ppt/_rels/presentation.xml.rels has ${slideRelsById.size} slide relationship(s)`,
      ),
    )
  }
  if (slideRelsById.size !== slideParts.length) {
    violations.push(
      violation(
        "slide-list-mismatch",
        `ppt/_rels/presentation.xml.rels has ${slideRelsById.size} slide relationship(s) but the package contains ${slideParts.length} ppt/slides/slideN.xml part(s)`,
      ),
    )
  }
  for (const rId of sldRIds) {
    const rel = slideRelsById.get(rId)
    if (!rel) {
      violations.push(
        violation(
          "slide-list-mismatch",
          `presentation.xml's <p:sldId r:id="${rId}"> has no matching slide relationship in ppt/_rels/presentation.xml.rels`,
        ),
      )
      continue
    }
    const resolved = reader.resolveTarget(PRESENTATION_PART, rel.target)
    if (!slidePartSet.has(resolved)) {
      violations.push(
        violation(
          "slide-list-mismatch",
          `presentation.xml's <p:sldId r:id="${rId}"> resolves to ${resolved}, which is not a slide part in the package`,
        ),
      )
    }
  }
  return violations
}

// ────────────────────────────────────────────────────────────────────────
// Rule: relationship-target-missing — spec §4.4 bullets 4 and 8 combined
// ("内部 relationship target 全部存在… External 跳过" / "notes、media、chart
// 和 workbook 的 relationship target 存在"). One general walk over every
// `.rels` part in the package rather than two rules: notes/media/chart/
// workbook targets are just specific `Relationship` `Type` values living in
// exactly the same `.rels` universe bullet 4 already covers end to end —
// splitting them into a second rule would re-walk the same data filtered by
// `Type` string, adding surface without adding coverage. Real failure mode
// this guards: `pptx-dedupe-media.ts`'s relationship-repoint step is exactly
// the kind of patch that could leave a slide's `.rels` `Target` pointing at
// a media part that got removed as a "duplicate" by mistake.
// ────────────────────────────────────────────────────────────────────────

/** `"ppt/slides/_rels/slide1.xml.rels"` → `"ppt/slides/slide1.xml"` (the
 * part that owns this `.rels` file); `"_rels/.rels"` → `""` (package root).
 * Reverse of `package-reader.ts`'s own `relsPathFor` — kept local since
 * that helper isn't part of the reader's public interface. */
function owningPartFor(relsPart: string): string {
  const segments = relsPart.split("/")
  const relsIdx = segments.lastIndexOf("_rels")
  const name = segments[segments.length - 1]!.replace(/\.rels$/, "")
  const dirSegments = segments.slice(0, relsIdx)
  return dirSegments.length > 0 ? `${dirSegments.join("/")}/${name}` : name
}

/** `"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"`
 * → `"image"` — cosmetic only, for a readable violation message. */
function relationshipKindLabel(type: string): string {
  const idx = type.lastIndexOf("/")
  return idx === -1 ? type : type.slice(idx + 1)
}

async function checkRelationshipTargets(reader: PptxPackageReader): Promise<PackageAuditViolation[]> {
  const violations: PackageAuditViolation[] = []
  const relsParts = reader.listParts().filter((p) => p.endsWith(".rels")).sort()
  for (const relsPart of relsParts) {
    const owningPart = owningPartFor(relsPart)
    let rels: PackageRelationship[]
    try {
      rels = await reader.readRelationships(owningPart)
    } catch (e) {
      violations.push(violation("xml-parse-error", `${relsPart}: ${(e as Error).message}`))
      continue
    }
    for (const rel of rels) {
      if (rel.targetMode === "External") continue
      const resolved = reader.resolveTarget(owningPart, rel.target)
      if (!reader.hasPart(resolved)) {
        violations.push(
          violation(
            "relationship-target-missing",
            `${owningPart || "(package root)"}: relationship "${rel.id}" (${relationshipKindLabel(rel.type)}) target "${rel.target}" does not resolve to an existing part (resolved: ${resolved})`,
          ),
        )
      }
    }
  }
  return violations
}

// ────────────────────────────────────────────────────────────────────────
// Per-slide rules — duplicate-shape-id / invalid-shape-transform /
// dangling-animation-target. Consolidated into one read-and-walk pass per
// slide part (`checkSlideParts` below) so three named rules share a single
// `readXml` per slide instead of three, which matters for the "gate cost
// should be small" performance goal (spec §4.4 / this task's perf note).
// ────────────────────────────────────────────────────────────────────────

function collectCNvPrIds(doc: Document): string[] {
  const nodes = doc.getElementsByTagName("p:cNvPr")
  const ids: string[] = []
  for (let i = 0; i < nodes.length; i++) ids.push(nodes[i]!.getAttribute("id") ?? "")
  return ids
}

/** Rule: duplicate-shape-id — spec §4.4 bullet 5 ("同一 slide 内 p:cNvPr@id
 * 唯一"). Scoped per-slide, not deck-wide: pptxgenjs restarts its own id
 * counter on every slide by design (confirmed against a real render), so a
 * deck-wide uniqueness check would flag every normal deck. Real failure
 * mode: `pptx-animations.ts`'s own `dedupeShapeIds` doc comment documents
 * exactly this collision class (pptxgenjs's STEP1-3 shape counter vs. its
 * hardcoded STEP4 slide-number placeholder id) — this rule is the
 * generator-level backstop that would have caught it before that fix
 * existed. */
function checkDuplicateShapeIds(doc: Document, slidePart: string): PackageAuditViolation[] {
  const counts = new Map<string, number>()
  for (const id of collectCNvPrIds(doc)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const violations: PackageAuditViolation[] = []
  for (const [id, count] of counts) {
    if (count > 1) {
      violations.push(
        violation("duplicate-shape-id", `${slidePart}: p:cNvPr id "${id}" appears ${count} times (must be unique within a slide)`),
      )
    }
  }
  return violations
}

/** Rule: invalid-shape-transform — spec §4.4 bullet 6 ("shape transform
 * 坐标和尺寸能解析为有限整数. 面积对象的 cx/cy 必须为正. 连接线允许其中一轴
 * 为零，但不能两轴同时为零"). Scoped to `<p:sp>`/`<p:pic>` only — never
 * `<p:grpSp>`'s own `<p:grpSpPr><a:xfrm>` (the outer group wrapper), which
 * pptxgenjs always emits as a fixed, meaningless `off(0,0)/ext(0,0)`
 * placeholder (confirmed against a real render's `ppt/slides/slide1.xml`)
 * that would otherwise read as a false-positive "zero-size area object" on
 * every single slide. "Connector" is detected the way this renderer
 * actually emits one — `<a:prstGeom prst="line">` (verified: `svg2pptx`
 * never emits a real `<p:cxnSp>`, only a `<p:sp>` with a `line` preset
 * geometry — `svg2pptx/line.ts`'s own doc comment) — not by shape type. */
function checkShapeTransforms(doc: Document, slidePart: string): PackageAuditViolation[] {
  const violations: PackageAuditViolation[] = []
  const shapeEls: Element[] = []
  const spNodes = doc.getElementsByTagName("p:sp")
  for (let i = 0; i < spNodes.length; i++) shapeEls.push(spNodes[i]!)
  const picNodes = doc.getElementsByTagName("p:pic")
  for (let i = 0; i < picNodes.length; i++) shapeEls.push(picNodes[i]!)

  for (const shapeEl of shapeEls) {
    const spPr = shapeEl.getElementsByTagName("p:spPr")[0]
    if (!spPr) continue
    const xfrm = spPr.getElementsByTagName("a:xfrm")[0]
    if (!xfrm) continue // no explicit transform on this shape — nothing to validate

    const name = shapeEl.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") ?? "(unnamed)"
    const off = xfrm.getElementsByTagName("a:off")[0]
    const ext = xfrm.getElementsByTagName("a:ext")[0]
    const fields: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ["off@x", off?.getAttribute("x")],
      ["off@y", off?.getAttribute("y")],
      ["ext@cx", ext?.getAttribute("cx")],
      ["ext@cy", ext?.getAttribute("cy")],
    ]
    let allFinite = true
    const parsed = new Map<string, number>()
    for (const [label, raw] of fields) {
      if (raw === null || raw === undefined) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        violations.push(violation("invalid-shape-transform", `${slidePart}: shape "${name}" a:xfrm ${label}="${raw}" is not a finite integer`))
        allFinite = false
      } else {
        parsed.set(label, n)
      }
    }
    if (!allFinite) continue

    const cx = parsed.get("ext@cx")
    const cy = parsed.get("ext@cy")
    if (cx === undefined || cy === undefined) continue // no <a:ext> at all — nothing to validate for size

    const isLine = spPr.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst") === "line"
    if (isLine) {
      if (cx === 0 && cy === 0) {
        violations.push(violation("invalid-shape-transform", `${slidePart}: shape "${name}" is a zero-length connector (a:ext cx=0 and cy=0)`))
      }
    } else if (cx <= 0 || cy <= 0) {
      violations.push(
        violation(
          "invalid-shape-transform",
          `${slidePart}: shape "${name}" a:ext cx=${cx} cy=${cy} — an area shape needs both cx and cy > 0`,
        ),
      )
    }
  }
  return violations
}

/** Rule: dangling-animation-target — spec §4.4 bullet 7 ("animation timing
 * 引用的 shape id 在同一 slide 存在"). Walks `<p:spTgt spid>` and `<p:bldP
 * spid>` — the two shape-id-bearing element/attribute pairs
 * `pptx-animations.ts`'s `applyElementAnimations` actually writes (see that
 * file's `setAnimEffectPairXml`/`elementTimingXml`) — against this slide's
 * own `<p:cNvPr id>` set. Real failure mode: a future edit to that patch's
 * spid reverse-lookup (`collectSpidsForBlock`) producing a stale/renumbered
 * id after `dedupeShapeIds` runs would otherwise ship a `<p:timing>` that
 * references a shape id nothing on the slide carries. */
function checkAnimationTargets(doc: Document, slidePart: string): PackageAuditViolation[] {
  const timing = doc.getElementsByTagName("p:timing")[0]
  if (!timing) return []
  const validIds = new Set(collectCNvPrIds(doc))
  const violations: PackageAuditViolation[] = []
  const seen = new Set<string>()
  const spTgtNodes = timing.getElementsByTagName("p:spTgt")
  const bldPNodes = timing.getElementsByTagName("p:bldP")
  const spidEls: Element[] = []
  for (let i = 0; i < spTgtNodes.length; i++) spidEls.push(spTgtNodes[i]!)
  for (let i = 0; i < bldPNodes.length; i++) spidEls.push(bldPNodes[i]!)

  for (const el of spidEls) {
    const spid = el.getAttribute("spid")
    if (spid === null || seen.has(spid)) continue
    seen.add(spid)
    if (!validIds.has(spid)) {
      violations.push(
        violation("dangling-animation-target", `${slidePart}: <p:timing> references shape id "${spid}" which does not exist on this slide`),
      )
    }
  }
  return violations
}

/**
 * Asset ids this slide's IR mentions an alt-bearing image binding for
 * (`image` components, `image_grid` items, `image_compare` sides,
 * `device_mockup` components, `logo_wall` items, an asset-kind `background`) —
 * `checkImageAltExported`'s leg (b) uses this
 * *only* to narrow which global `ir.assets.images` entries it even
 * considers for a given slide, never to decide pass/fail on its own (see
 * that leg's own comment). A dropped component's asset id still shows up
 * here — the IR still mentions it — but produces no matching rendered op,
 * so it stays correctly unflagged either way.
 */
function assetIdsDeclaredOnSlide(slide: PptxIR["slides"][number] | undefined): ReadonlySet<string> {
  const ids = new Set<string>()
  if (!slide) return ids
  if (slide.background?.kind === "asset") ids.add(slide.background.asset_id)
  for (const component of slide.components ?? []) {
    if (component.type === "image") {
      ids.add(component.asset_id)
    } else if (component.type === "image_grid") {
      for (const item of component.items) ids.add(item.asset_id)
    } else if (component.type === "image_compare") {
      ids.add(component.left.asset_id)
      ids.add(component.right.asset_id)
    } else if (component.type === "device_mockup") {
      ids.add(component.asset_id)
    } else if (component.type === "logo_wall") {
      for (const item of component.items) ids.add(item.asset_id)
    }
  }
  return ids
}

/**
 * Rule: image-alt-dropped — pipeline-preservation invariant, rewritten in
 * the alt-emission-closure fix wave to key off what actually entered the
 * render pipeline instead of the IR's *declared* `slide.components` list
 * (that version's own history: A11Y-01 alt chain wave, plan 裁定 3, then
 * widened to `image_grid`/`image_compare`/background by
 * `.issues/2026-08-04-bench-agentic/q15-root-cause.md`).
 *
 * Reviewer-caught defect this rewrite fixes: `layoutContentFit`
 * (`src/svg/layout.ts`) can silently drop a trailing component on overflow —
 * a deliberate graceful-degrade path (see that function's own doc comment),
 * not a bug. A dropped `image`/`image_grid`/`image_compare` component with
 * IR alt text never renders at all, so no `descr` can possibly exist for
 * it — the old IR-component-keyed rule hard-failed a legitimately degraded
 * export on that path. Rekeying on the actually-rendered image ops fixes
 * this: a dropped component produces no op, so it is simply never checked —
 * the rendered-visibility story (is this asset even on the slide) is
 * already asset-brief's job (`rendered: false`), not this rule's.
 *
 * Two legs, both required — dropping either reopens a real gap:
 *
 * (a) Preservation: every rendered `ImageOp` that carries `.alt` (set from
 *     the SVG's `aria-label` by `svg2pptx/image.ts`'s `imageToOp`) must land
 *     as a `descr` somewhere in the exported slide. Catches a pipeline bug
 *     between SVG emission and the finished package — e.g. `render.ts`
 *     failing to carry `altText` through to pptxgenjs.
 *
 * (b) Coverage: every alt-bearing IR asset (`ir.assets.images[id].alt`) that
 *     was actually rendered on this slide — its `src` matches some op's
 *     `.data`, i.e. the image genuinely made it into the SVG as an
 *     `<image>` element — must have at least one matching op that carries
 *     its exact `.alt` string. This is the q15 defect class (a renderer
 *     emits `<image>` but forgets `aria-label`): leg (a) alone would never
 *     catch it, since an op with no `.alt` has nothing for leg (a) to
 *     check. An asset that never rendered on this slide (dropped component,
 *     or simply not used here) matches no op and is correctly skipped by
 *     this leg too — it is never a "does the IR have alt" check, only "did
 *     a rendered image forget to carry the alt it has". Matched by exact
 *     string, not "some op has any alt at all" — two distinct assets can
 *     share byte-identical `src` (e.g. a duplicated stock photo), and a
 *     weaker check would let one asset's op cover for another's.
 *
 * `imageOps` is this slide's actually-rendered `ImageOp[]` — see
 * `auditPptxPackage`'s own doc comment for where it comes from (the caller's
 * own already-computed ops in the common case, a same-seam re-derivation via
 * `slideToOps` as a fallback otherwise). `undefined` means neither `ir` nor
 * ops were available — nothing to check.
 *
 * `.getAttributeNode("descr")?.value`, not `.getAttribute("descr")` — same
 * linkedom decode workaround as `svg2pptx/image.ts`'s `imageToOp` (see that
 * function's own doc comment): `.getAttribute()` half-decodes `&amp;`/
 * `&lt;`/`&gt;` on this parser, which would make a correctly-escaped descr
 * compare unequal to the plain-text IR `alt` it should match.
 */
function checkImageAltExported(
  doc: Document,
  slidePart: string,
  slide: PptxIR["slides"][number] | undefined,
  imageOps: readonly ImageOp[] | undefined,
  ir: PptxIR,
): PackageAuditViolation[] {
  if (!imageOps) return []
  const violations: PackageAuditViolation[] = []
  const descrs = new Set<string>()
  const cNvPrNodes = doc.getElementsByTagName("p:cNvPr")
  for (let i = 0; i < cNvPrNodes.length; i++) {
    const d = cNvPrNodes[i]!.getAttributeNode("descr")?.value
    if (d) descrs.add(d)
  }

  // Leg (a) — preservation: a rendered op that carries alt must have made
  // it into the package as a descr.
  for (const op of imageOps) {
    if (op.alt && !descrs.has(op.alt)) {
      violations.push(
        violation(
          "image-alt-dropped",
          `${slidePart}: a rendered image (aria-label "${op.alt}") has no matching <p:pic> descr in the exported slide — dropped somewhere between SVG emission and the finished package`,
        ),
      )
    }
  }

  // Leg (b) — coverage: index this slide's rendered ops by resolved src
  // (the same string `components/image.tsx` et al. set as `href`, and
  // `imageToOp` reads back verbatim into `.data`) so an alt-bearing asset
  // can be matched against "did it actually make it onto the canvas".
  //
  // Candidates are scoped to `assetIdsDeclaredOnSlide(slide)` — a lightweight
  // read of *which asset ids this slide's IR mentions*, used purely to
  // narrow which global `ir.assets.images` entries even get considered here.
  // This is not the pass/fail check reintroduced (that stays 100% ops-based
  // below) — it exists because `src` content alone is ambiguous: two
  // different assets on two different slides can carry byte-identical
  // bytes (e.g. the same stock photo used twice, or two placeholder images
  // in a fixture — real regression this scoping fixes:
  // `generate-dedupe-media-export.test.ts`'s heroA/heroB fixture, byte-
  // identical PNGs on different slides with different alt text, without
  // this scope slide 1's rendered op for heroA got checked against slide
  // 2's own heroB and vice versa). A dropped component's asset id still
  // shows up in this scope (the IR still mentions it) but produces no op
  // match below — still correctly skipped, since the actual check is
  // "was a matching op found", never "was it declared".
  const opsBySrc = new Map<string, ImageOp[]>()
  for (const op of imageOps) {
    const bucket = opsBySrc.get(op.data)
    if (bucket) bucket.push(op)
    else opsBySrc.set(op.data, [op])
  }
  for (const assetId of assetIdsDeclaredOnSlide(slide)) {
    const asset = ir.assets.images[assetId]
    if (!asset?.alt) continue // 没有 alt 的资产不在此规则的检查范围内
    const rendered = opsBySrc.get(asset.src)
    if (!rendered) continue // never made it into this slide's SVG — not this rule's concern
    // "At least one rendered occurrence carries this asset's exact alt",
    // not "every op with this src carries alt" — two different components
    // on the *same* slide can also share byte-identical `src` (e.g. two
    // image_grid cells reusing one placeholder), each producing its own op
    // with the same `.data`. Requiring *every* matching op to carry alt
    // would wrongly blame asset A for asset B's own (legitimately absent)
    // alt. Exact-string matching (not just "some op has any alt") keeps
    // this precise even when srcs collide within one slide.
    const hasMatchingAlt = rendered.some((op) => op.alt === asset.alt)
    if (!hasMatchingAlt) {
      violations.push(
        violation(
          "image-alt-dropped",
          `${slidePart}: asset "${assetId}" has IR alt text and was rendered on this slide, but no rendered <image> element carries it as aria-label (expected aria-label="${asset.alt}")`,
        ),
      )
    }
  }
  return violations
}

/** This slide part's 1-based slide number, e.g. 3 for
 * `ppt/slides/slide3.xml` — used to index `ir.slides` (pptxgenjs writes
 * slide parts in `ir.slides.forEach` call order, `generate.ts`'s own
 * `addSlide` loop, so slide N's part is always `ir.slides[N - 1]`). `null`
 * for a part `SLIDE_PART_RE` wouldn't have matched in the first place —
 * defensive only, every caller already filtered through that regex. */
function slideNumberFromPart(slidePart: string): number | null {
  const m = /slide(\d+)\.xml$/.exec(slidePart)
  return m ? Number(m[1]) : null
}

async function checkSlideParts(
  reader: PptxPackageReader,
  ir?: PptxIR,
  imageOpsBySlide?: ReadonlyArray<readonly ImageOp[]>,
): Promise<PackageAuditViolation[]> {
  const violations: PackageAuditViolation[] = []
  const slideParts = reader.listParts().filter((p) => SLIDE_PART_RE.test(p)).sort()
  // `image-alt-dropped` needs this slide's actually-rendered image ops, not
  // the IR's declared component list (see `checkImageAltExported`'s own doc
  // comment for why). `generatePptxBlob` (`generate.ts`) already computes
  // these once per slide in its own render loop and threads them straight
  // through via `imageOpsBySlide` — the cleanest access path, no second
  // render pass. A caller that omits it (every package-audit unit test, and
  // any other standalone `ir`-only caller) falls back to re-deriving the
  // same ops via the same pure `slideToOps` seam `generatePptxBlob` itself
  // calls — not a new rendering pass, just the one this rule already
  // depends on, run again from the (deterministic, pure) IR.
  const resolvedImageOpsBySlide: ReadonlyArray<readonly ImageOp[]> | undefined = ir
    ? (imageOpsBySlide ??
        ir.slides.map((slide, index) =>
          slideToOps(ir, slide, index).filter((op): op is ImageOp => op.kind === "image"),
        ))
    : undefined
  for (const slidePart of slideParts) {
    let doc: Document
    try {
      doc = await reader.readXml(slidePart)
    } catch (e) {
      violations.push(violation("xml-parse-error", `${slidePart}: ${(e as Error).message}`))
      continue
    }
    if (doc.documentElement?.tagName !== "p:sld") {
      violations.push(
        violation(
          "xml-parse-error",
          `${slidePart}: expected root element <p:sld>, found ${doc.documentElement ? `<${doc.documentElement.tagName}>` : "none"}`,
        ),
      )
      continue
    }
    violations.push(...checkDuplicateShapeIds(doc, slidePart))
    violations.push(...checkShapeTransforms(doc, slidePart))
    violations.push(...checkAnimationTargets(doc, slidePart))
    if (ir) {
      const num = slideNumberFromPart(slidePart)
      const slide = num != null ? ir.slides[num - 1] : undefined
      const imageOps = num != null ? resolvedImageOpsBySlide?.[num - 1] : undefined
      violations.push(...checkImageAltExported(doc, slidePart, slide, imageOps, ir))
    }
  }
  return violations
}

// ────────────────────────────────────────────────────────────────────────
// Orchestration + entry point.
// ────────────────────────────────────────────────────────────────────────

async function collectViolations(
  reader: PptxPackageReader,
  ir?: PptxIR,
  imageOpsBySlide?: ReadonlyArray<readonly ImageOp[]>,
): Promise<PackageAuditViolation[]> {
  const coreViolations = checkCoreParts(reader)
  if (coreViolations.length > 0) return coreViolations // nothing else is safely checkable without these

  const foundationalViolations = await checkFoundationalParse(reader)
  if (foundationalViolations.length > 0) return foundationalViolations // rules below all assume these parse

  const violations: PackageAuditViolation[] = []
  violations.push(...(await checkSlideListConsistency(reader)))
  violations.push(...(await checkRelationshipTargets(reader)))
  violations.push(...(await checkSlideParts(reader, ir, imageOpsBySlide)))
  return violations
}

/**
 * Cap on how many individual violation lines `formatViolations` ever spells
 * out verbatim. Sized for a human/agent skimming a terminal or log line, not
 * for completeness — the per-rule summary above the detail block already
 * carries the true total, so nothing is lost by truncating the list itself.
 *
 * Real incident (P0 hardening, robustness deep-review D1): an unbounded
 * text-stacking component (e.g. `bullets` with an extreme item count) can
 * make `checkShapeTransforms` alone emit thousands of `invalid-shape-
 * transform` violations, one per off-canvas `<a:xfrm>` — 500 items produced
 * 621, 20000 items produced 19776 and a 2.5MB error string. A message that
 * size is useless to the SDK's actual audience (an AI agent's context
 * window / a CI log), and drowns the one line that would have named the
 * real root cause (which slide, which rule, how many).
 */
const MAX_VIOLATION_DETAIL_LINES = 20

function formatViolations(violations: PackageAuditViolation[]): string {
  const total = violations.length

  // Group by rule first — this is the "dedupe" half: 19776 individually
  // distinct `invalid-shape-transform` messages (each names a different
  // shape id/offset) collapse into one `invalid-shape-transform: 19776`
  // line instead of repeating the same rule name thousands of times.
  const byRule = new Map<PackageAuditRuleId, number>()
  for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1)
  const ruleSummary = Array.from(byRule.entries())
    .map(([rule, count]) => `  ${rule}: ${count}`)
    .join("\n")

  // Then a bounded sample of the actual messages — enough to see concrete
  // shape ids/offsets for triage, never the whole list.
  const shown = violations.slice(0, MAX_VIOLATION_DETAIL_LINES)
  const detailLines = shown.map((v) => `  [${v.rule}] ${v.message}`).join("\n")
  const omitted = total - shown.length
  const omittedNote =
    omitted > 0
      ? `\n  … ${omitted} more violation${omitted === 1 ? "" : "s"} omitted (see per-rule counts above)`
      : ""

  return (
    `pptx package audit failed — ${total} invariant violation${total === 1 ? "" : "s"} in the generated package.\n` +
    `By rule:\n${ruleSummary}\n\n` +
    `First ${shown.length} violation${shown.length === 1 ? "" : "s"}:\n${detailLines}${omittedNote}`
  )
}

/**
 * The hard gate itself. Accepts either a pre-loaded `JSZip` — the path
 * `generatePptxBlob` (`generate.ts`) uses, piggybacking the patch chain's
 * own final `JSZip.loadAsync` per spec §10.4 rather than re-reading the
 * package from bytes — or raw bytes (`Blob`/`ArrayBuffer`/`Uint8Array`), a
 * standalone convenience for callers (tests constructing corrupted package
 * bytes) that don't already have a loaded zip. Read-only either way: no
 * rule in this file ever calls a `JSZip` mutating method.
 *
 * Throws {@link PptfastError} naming every invariant it found broken (not
 * just the first) when the package fails one or more of spec §4.4's checks.
 * No skip switch, by design — spec §4.4's closing paragraph: a violation
 * here is the generator's own bug, not a user content problem.
 *
 * `ir` (A11Y-01 alt chain wave): optional, source-IR-aware second parameter
 * that gates the one rule in this file that isn't checkable from the
 * package alone (`image-alt-dropped` — see `checkImageAltExported`'s own
 * doc comment). `generatePptxBlob` (`generate.ts`) always passes its own
 * already-in-scope `ir`; standalone callers (tests constructing corrupted
 * package bytes with no IR at hand) omit it and simply don't get that one
 * rule — every other invariant in this file stays fully enforced either way.
 *
 * `imageOpsBySlide` (alt-emission-closure fix wave): optional third
 * parameter, one entry per `ir.slides` index, each the slide's actually-
 * rendered `ImageOp[]` (`kind === "image"` ops only). `generatePptxBlob`
 * passes the ops it already computed in its own render loop — no second
 * render. Omitted by every standalone/test caller; `checkSlideParts` then
 * re-derives the same ops itself via the same `slideToOps` seam, so the
 * rule still runs correctly off `ir` alone, just without the production
 * path's single-computation optimization.
 */
export async function auditPptxPackage(
  input: JSZip | Blob | ArrayBuffer | Uint8Array,
  ir?: PptxIR,
  imageOpsBySlide?: ReadonlyArray<readonly ImageOp[]>,
): Promise<void> {
  let zip: JSZip
  if (input instanceof JSZip) {
    zip = input
  } else {
    try {
      const bytes = input instanceof Blob ? await input.arrayBuffer() : input
      zip = await JSZip.loadAsync(bytes)
    } catch (e) {
      throw new PptfastError(
        `pptx package audit failed — invariant "zip-unreadable": the generated package is not a readable zip archive (${(e as Error).message})`,
      )
    }
  }
  const reader = createPptxPackageReader(zip)
  const violations = await collectViolations(reader, ir, imageOpsBySlide)
  if (violations.length > 0) throw new PptfastError(formatViolations(violations))
}
