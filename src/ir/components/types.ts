import type { z } from "zod"
import type { Component } from "../index"
import type { FieldAliasMap, ItemFieldAliasSpec } from "../field-aliases"

/**
 * Domain-file contract types (src domain reorg wave 2, spec §4.1 + the
 * controller ruling amending it): the shape a future `src/ir/components/
 * <name>.ts` file (one per component, added in W2b/W2c — this task adds only
 * the types, migrates zero components) is expected to satisfy via three
 * named exports — uniformly `schema`, `aliases`, `traits` in every domain
 * file (not a type-suffixed or component-prefixed name; the aggregator is
 * what disambiguates, importing each with a per-component alias: `import {
 * schema as sankeySchema, aliases as sankeyAliases, traits as sankeyTraits }
 * from "./components/sankey"`).
 *
 * `IrComponentDomain` itself is a documentation/aggregation type, not
 * something a domain file imports and implements directly (TS has no
 * "this module's named exports satisfy this interface" construct) — three
 * separate top-level `export const`s can't literally `satisfies` one object
 * type. Its real consumers are (a) this doc comment / the domain-file
 * authoring convention it records, and (b) `src/ir/index.ts`'s future
 * aggregator (W2c), which re-assembles each domain file's three imports into
 * a value of this exact shape before folding it into the `discriminatedUnion`
 * / alias tables / traits registry — see each field's own doc comment below
 * for precisely which existing aggregate it feeds.
 */

/**
 * One component's field-alias declaration (spec §4.1's `sankeyAliases`
 * example, generalized to the uniform `aliases` export name) — the
 * per-component slice of what `src/ir/field-aliases.ts` today stores as two
 * tables keyed *by* component type (`COMPONENT_FIELD_ALIASES`,
 * `COMPONENT_ITEM_FIELD_ALIASES`). A domain file needs no key (the file
 * *is* the one component), so this is just the row shape those two tables'
 * values already have, reusing `field-aliases.ts`'s own
 * {@link FieldAliasMap}/{@link ItemFieldAliasSpec} rather than redeclaring an
 * equivalent shape that could drift from it.
 */
export interface ComponentAliasSpec {
  /** This component's own top-level field aliases, if any — feeds `COMPONENT_FIELD_ALIASES[type]`. */
  readonly block?: FieldAliasMap
  /** This component's item-array alias specs, if any (more than one when a component has more than one item array, e.g. sankey's `nodes`/`links`) — feeds `COMPONENT_ITEM_FIELD_ALIASES[type]`. */
  readonly items?: readonly ItemFieldAliasSpec[]
}

/**
 * The 5 render-time behavior axes `src/svg/component-traits.ts` classifies
 * today as 5 independent `ReadonlySet<ComponentType>` collections
 * (`STRETCHABLE_TYPES`/`SELF_VISUAL_TYPES`/`SCALABLE_TYPES`/
 * `PASSTHROUGH_SHELL_TYPES`/`FULL_BODY_TYPES`), plus `evidence` — spec
 * §4.1's named exception for `EVIDENCE_TYPES`: that collection carries
 * cross-component *priority order* (which type wins when more than one
 * appears), which is comparative knowledge no single component can declare
 * about itself, so it stays a hand-written ordered tuple in the aggregator
 * (component-traits.ts, unchanged by this task). A domain file declares only
 * the boolean "am I evidence-eligible at all" — the aggregator asserts the
 * set of components declaring `evidence: true` equals the set named in that
 * hand-written order (two independent sources of truth, drift between them
 * fails a test, per spec §4.1's own closing sentence).
 *
 * Field-for-field identical to the 6 axes documented in
 * `src/svg/component-traits.ts`'s own module doc comment — this interface
 * doesn't redefine their semantics, only gives the per-component boolean
 * declaration a name once domain files start producing them (W2b/W2c). Kept
 * here (ir side) rather than in `component-traits.ts` (svg side) because the
 * *declaration* is an ir-domain-file concern (spec §4.3: ir declares,
 * `component-traits.ts` reconstructs the 6 sets from ir's declarations,
 * svg→ir being an already-existing dependency direction) — this task adds
 * only the type, `component-traits.ts`'s own 6 sets are untouched.
 */
export interface ComponentTraits {
  /** Feeds `STRETCHABLE_TYPES` — may `growStretchables` stretch this component to fill leftover column height? */
  readonly stretchable: boolean
  /** Feeds `SELF_VISUAL_TYPES` — does this component already paint its own card/frame? */
  readonly selfVisual: boolean
  /** Feeds `SCALABLE_TYPES` — is this component's content a rendered graphic safe to scale uniformly (not reflowable text)? */
  readonly scalable: boolean
  /** Feeds `PASSTHROUGH_SHELL_TYPES` — does this component draw its own internal chrome, so the bento shell paint should be skipped? */
  readonly passthroughShell: boolean
  /** Feeds `FULL_BODY_TYPES` — must this component be the slide's sole component, filling the whole content rect itself? */
  readonly fullBody: boolean
  /** Feeds the membership (not the order) of `EVIDENCE_TYPES` — see this interface's own doc comment for why order stays aggregator-owned. */
  readonly evidence: boolean
}

/**
 * The full per-component domain-file contract: `schema` (feeds
 * `ComponentSchema`'s `discriminatedUnion` in `src/ir/index.ts`), `aliases`
 * (feeds `src/ir/field-aliases.ts`'s two tables), `traits` (feeds
 * `src/svg/component-traits.ts`'s 6 sets). See this module's own top doc
 * comment for why this type documents the convention rather than being
 * `satisfies`-checked against each domain file directly.
 */
export interface IrComponentDomain<T extends Component = Component> {
  /** This component's own zod object schema — `.strict()`, `type: z.literal("<name>")` discriminant included, byte-identical to its current member inside `src/ir/index.ts`'s `ComponentSchema` union. */
  readonly schema: z.ZodType<T>
  readonly aliases: ComponentAliasSpec
  readonly traits: ComponentTraits
}
