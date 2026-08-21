import type { ContentLayout, ContentLayoutId } from "../types"
import * as stage from "./stage"
import * as lecture from "./lecture"
import * as swiss from "./swiss"
import * as memo from "./memo"
import * as playbill from "./playbill"
import * as museum from "./museum"
import * as luxe from "./luxe"
import * as ink from "./ink"
import * as consulting from "./consulting"
import * as insight from "./insight"
import * as tech from "./tech"
import * as heritage from "./heritage"
import * as vermilion from "./vermilion"
import * as journal from "./journal"
import * as campaign from "./campaign"
import * as arena from "./arena"
import * as terra from "./terra"
import * as academic from "./academic"

export type SparseLayoutId = Extract<
  ContentLayoutId,
  "statement" | "pull-quote" | "stat-hero" | "one-evidence" | "mono-bleed"
>

type FaceMap = Partial<Record<SparseLayoutId, ContentLayout>>

/**
 * `(themeId, layoutId)` → theme face. Theme ids live only in this table.
 * Unregistered pairs fall through to the generic face in content-*.tsx.
 */
export const FACES: Partial<Record<string, FaceMap>> = {
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
  consulting: {
    statement: consulting.statement,
    "stat-hero": consulting.statHero,
    "one-evidence": consulting.oneEvidence,
  },
  insight: {
    statement: insight.statement,
    "stat-hero": insight.statHero,
    "pull-quote": insight.pullQuote,
  },
  tech: {
    "stat-hero": tech.statHero,
    statement: tech.statement,
    "one-evidence": tech.oneEvidence,
  },
  heritage: {
    "pull-quote": heritage.pullQuote,
    statement: heritage.statement,
    "stat-hero": heritage.statHero,
  },
  vermilion: {
    statement: vermilion.statement,
    "stat-hero": vermilion.statHero,
    "one-evidence": vermilion.oneEvidence,
  },
  journal: {
    "pull-quote": journal.pullQuote,
    "stat-hero": journal.statHero,
    statement: journal.statement,
  },
  campaign: {
    statement: campaign.statement,
    "stat-hero": campaign.statHero,
    "one-evidence": campaign.oneEvidence,
  },
  arena: {
    "stat-hero": arena.statHero,
    statement: arena.statement,
    "one-evidence": arena.oneEvidence,
  },
  terra: {
    statement: terra.statement,
    "stat-hero": terra.statHero,
    "one-evidence": terra.oneEvidence,
  },
  academic: {
    "pull-quote": academic.pullQuote,
    "stat-hero": academic.statHero,
    statement: academic.statement,
  },
}

export function sparseFace(layoutId: string, themeId: string | undefined): ContentLayout | undefined {
  if (!themeId) return undefined
  return FACES[themeId]?.[layoutId as SparseLayoutId]
}
