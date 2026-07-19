import { z } from "zod"
import {
  AssetsSchema,
  BrandSchema,
  MetaSchema,
  NarrativeProfileInputSchema,
  SlideSchema,
  ThemeSchema,
} from "./index"

/**
 * The frozen IR v3 top-level shape (vocabulary-v4 rename, task 1 — spec
 * §9.3: "v3 已冻结... 顶层字段和枚举改名必须进入新的 IR 版本，不能在 v3
 * 内静默改变含义"). `./index.ts`'s `PptxIRSchema` is v4 now — this module
 * exists only so a genuinely v3-shaped document still has somewhere to parse
 * against: `migrateIrV3ToV4`'s input type (`./migrate.ts`), and the
 * v3-hard-reject path's own tests (constructing a *valid* v3 IR to prove the
 * reject fires on version alone, not on some other schema defect).
 *
 * `validateIr` (`src/api.ts`) never calls this schema itself — an incoming
 * v3 document (`version === "3"`) is hard-rejected before any schema parse
 * runs at all (spec §9.3), full stop. This schema is a migration-tooling and
 * test fixture, not a second accepted input shape.
 *
 * Every field but `version` and `scenario` is byte-identical to `./index.ts`'s
 * v4 `PptxIRSchema` (spec §9.1: "其余 IR 字段保持不变") — reuses the exact
 * same `ThemeSchema`/`MetaSchema`/`AssetsSchema`/`BrandSchema`/`SlideSchema`
 * instances rather than redefining them, so there is no way for this frozen
 * shape to silently drift from the fields it shares with v4.
 */
export const PptxIRV3Schema = z
  .object({
    version: z.literal("3").default("3"),
    filename: z.string().default("presentation"),
    // Pre-rename field name and axis vocabulary (mode/delivery/audience) —
    // frozen as of the 0.3.0 release, spec §9.3. Same open-schema/closed-
    // semantic split `NarrativeProfileInputSchema` documents: the actual
    // mode/delivery/audience enum closure happened at `resolveScenario`
    // runtime, not here, even before this rename.
    scenario: z.union([z.string(), NarrativeProfileInputSchema]).optional(),
    theme: ThemeSchema.default({ id: "consulting" }),
    meta: MetaSchema.default({}),
    assets: AssetsSchema.default({ images: {} }),
    brand: BrandSchema.optional(),
    seed: z.number().int().optional(),
    slides: z.array(SlideSchema),
  })
  .strict()

export type PptxIRV3 = z.infer<typeof PptxIRV3Schema>
