import { z } from "zod"
import { PPTX_ICON_NAMES } from "@/icons/catalog"
import { iconEnumError } from "../schema-error-hints"

/**
 * Genuinely cross-component zod primitives (src domain reorg wave 2, spec
 * §4.1: "共享子 schema…放 `src/ir/components/shared.ts`——真跨域共享资产，
 * 保持少量"). This is the CLAUDE.md shared-assets rule's exception clause in
 * practice: a fragment lands here only when *two or more* of the
 * per-component domain files (`./sankey.ts`, `./kpi-cards.ts`, … — added in
 * W2b/W2c, this file is scaffolded ahead of them in W2a) would otherwise
 * define the exact same zod value independently. Everything a single
 * component owns alone — `GanttItemSchema`'s `.refine`, `PestQuadrantSchema`,
 * `SankeyNodeSchema`/`SankeyLinkSchema`, every named row/item shape unique to
 * one component — stays in that component's own domain file, even when its
 * *shape* superficially resembles another component's (e.g. `roadmap`'s
 * `{label, value}` row vs. `insight_panel`'s `{label, text}` row: similar
 * silhouette, different fields, not the same reusable value).
 *
 * Audited against the pre-migration `src/ir/index.ts` (~3000 lines, all 32
 * component schemas) for this task: the icon-name enum below was the *only*
 * zod fragment literally repeated (not just similarly-shaped) across
 * component schemas — it appears 5 times verbatim
 * (`callout.icon`, `kpi_cards.items[].icon`, `icon_cards.items[].icon`,
 * `row_cards.items[].icon`, `verdict_banner.icon`), matching
 * `schema-error-hints.ts`'s own doc comment ("the IR schema's two large
 * closed vocabularies … the icon enum, used 5 times"). No shared
 * "data-point shape" (e.g. chart's `{x, y}` series point) turned out to
 * exist — `chart`'s data point is the only user of that particular shape in
 * the current schema — so none is extracted here; a future component that
 * needs the same shape can move it here as a second entry, no different from
 * adding a new export to any other module.
 *
 * Deliberately minimal (a scaffold, not a landing zone): W2b/W2c may grow
 * this file as real per-component sharing is discovered during the actual
 * migration — this task migrates zero components and adds only what today's
 * codebase already, verifiably, shares.
 */

/**
 * One PPTX icon name — every `icon` field across the IR shares this exact
 * enum + error-hint pair (see this module's own doc comment for the 5 use
 * sites). Bare (not `.optional()`): `icon_cards.items[].icon` is required,
 * the other 4 use sites apply `.optional()` at their own call site — same
 * "the shared fragment is the narrowest common piece, optionality is each
 * field's own business" split `field-aliases.ts`'s per-component tables
 * already use for alias maps.
 */
export const IconNameSchema = z.enum(PPTX_ICON_NAMES, { error: iconEnumError })
