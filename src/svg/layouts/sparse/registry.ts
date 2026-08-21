import type { ContentLayout, ContentLayoutId } from "../types"
import * as stage from "./stage"
import * as lecture from "./lecture"
import * as swiss from "./swiss"
import * as memo from "./memo"
import * as playbill from "./playbill"
import * as museum from "./museum"
import * as luxe from "./luxe"
import * as ink from "./ink"

export type SparseLayoutId = Extract<
  ContentLayoutId,
  "statement" | "pull-quote" | "stat-hero" | "one-evidence" | "mono-bleed"
>

type FaceMap = Partial<Record<SparseLayoutId, ContentLayout>>

/**
 * `(themeId, layoutId)` → theme face. Theme ids live only in this table.
 * Unregistered pairs fall through to the generic face in content-*.tsx.
 */
const FACES: Partial<Record<string, FaceMap>> = {
  stage: {
    statement: stage.statement,
    "stat-hero": stage.statHero,
    "pull-quote": stage.pullQuote,
  },
  lecture: {
    statement: lecture.statement,
    "stat-hero": lecture.statHero,
    "one-evidence": lecture.oneEvidence,
  },
  swiss: {
    "stat-hero": swiss.statHero,
    statement: swiss.statement,
    "one-evidence": swiss.oneEvidence,
  },
  memo: {
    "pull-quote": memo.pullQuote,
    "stat-hero": memo.statHero,
    statement: memo.statement,
  },
  playbill: {
    statement: playbill.statement,
    "stat-hero": playbill.statHero,
    "mono-bleed": playbill.monoBleed,
  },
  museum: {
    statement: museum.statement,
    "one-evidence": museum.oneEvidence,
    "stat-hero": museum.statHero,
  },
  luxe: {
    "pull-quote": luxe.pullQuote,
    "stat-hero": luxe.statHero,
    statement: luxe.statement,
  },
  ink: {
    statement: ink.statement,
    "stat-hero": ink.statHero,
    "pull-quote": ink.pullQuote,
  },
}

export function sparseFace(layoutId: string, themeId: string | undefined): ContentLayout | undefined {
  if (!themeId) return undefined
  return FACES[themeId]?.[layoutId as SparseLayoutId]
}
