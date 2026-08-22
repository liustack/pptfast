/**
 * Render-side content-page heading treatment assignment table. Treatments
 * are not IR: one theme maps to at most one treatment, looked up here.
 * bloom is a classroom recolor preset and is not listed. 16 rows.
 *
 * ghost_index and tag_box need a chapter page. Runtime falls back to the
 * native heading when `chapterNumberFor === 0`. The table still lists those
 * themes.
 */

export const HEADING_TREATMENTS = [
  "ghost_index",
  "baseline",
  "tag_box",
  "lead_accent",
  "vertical_kicker",
  "center_mirror",
] as const

export type HeadingTreatmentId = (typeof HEADING_TREATMENTS)[number]

export type NoTitleAnchor = "mini-index" | "short-kicker" | "none"

/**
 * Optional render knobs. A treatment reads the fields it knows and ignores
 * the rest.
 */
export interface HeadingKnobs {
  /** ghost_index */
  indexStyle?: "ghost-bleed" | "stroke-corner"
  /** baseline */
  rule?: "hairline" | "wenwu" | "double-tone"
  rightSlot?: "none" | "numero-name"
  /** tag_box */
  box?: "solid-invert" | "solid-primary" | "hud-brackets"
  chapterLabel?: "act" | "part" | "round" | "chapter" | "lecture"
  /** lead_accent */
  accentStyle?: "color" | "typeface-shift"
  tail?: "none" | "gold-dot" | "olive-rule"
  /** vertical_kicker */
  kickerMark?: "vermilion-dot" | "gold-rule" | "none"
  titleRule?: "none" | "chalk"
  insetX?: number
  /** center_mirror */
  mirror?: "hairline" | "bar" | "gold-rule"
  diamond?: boolean
  /** 无标题锚点。默认随构造。设 none 即关。 */
  noTitleAnchor?: NoTitleAnchor
}

export interface HeadingAssignment {
  treatment: HeadingTreatmentId
  knobs?: HeadingKnobs
}

const ASSIGNMENTS: Record<string, HeadingAssignment> = {
  // Needs a chapter page. Runtime falls back to the native heading when
  // chapterNumberFor === 0.
  consulting: {
    treatment: "ghost_index",
    knobs: { indexStyle: "ghost-bleed", noTitleAnchor: "mini-index" },
  },
  // Needs a chapter page. Runtime falls back to the native heading when
  // chapterNumberFor === 0.
  tech: {
    treatment: "ghost_index",
    knobs: { indexStyle: "stroke-corner", noTitleAnchor: "mini-index" },
  },
  insight: {
    treatment: "baseline",
    knobs: { rule: "hairline", rightSlot: "none", noTitleAnchor: "none" },
  },
  heritage: {
    treatment: "baseline",
    knobs: { rule: "wenwu", rightSlot: "none" },
  },
  journal: {
    treatment: "baseline",
    knobs: { rule: "double-tone", rightSlot: "numero-name" },
  },
  // Needs a chapter page. Runtime falls back to the native heading when
  // chapterNumberFor === 0.
  playbill: {
    treatment: "tag_box",
    knobs: { box: "solid-invert", chapterLabel: "act" },
  },
  // Needs a chapter page. Runtime falls back to the native heading when
  // chapterNumberFor === 0.
  enterprise: {
    treatment: "tag_box",
    knobs: { box: "solid-primary", chapterLabel: "part" },
  },
  // Needs a chapter page. Runtime falls back to the native heading when
  // chapterNumberFor === 0.
  arena: {
    treatment: "tag_box",
    knobs: { box: "hud-brackets", chapterLabel: "round" },
  },
  academic: {
    treatment: "lead_accent",
    knobs: { accentStyle: "typeface-shift", tail: "gold-dot", noTitleAnchor: "none" },
  },
  terra: {
    treatment: "lead_accent",
    knobs: { accentStyle: "color", tail: "olive-rule", noTitleAnchor: "none" },
  },
  ink: {
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "vermilion-dot",
      titleRule: "none",
      insetX: 152,
      noTitleAnchor: "short-kicker",
    },
  },
  lecture: {
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "none",
      titleRule: "chalk",
      insetX: 164,
      noTitleAnchor: "short-kicker",
    },
  },
  // Museum axis is C but the content board is the short vertical signpost.
  // GhostIndex 展签皮 does not ship.
  museum: {
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "gold-rule",
      titleRule: "none",
      insetX: 168,
      noTitleAnchor: "short-kicker",
    },
  },
  // Title axis C. CenterMirror wins over the LeadAccent skin.
  luxe: {
    treatment: "center_mirror",
    knobs: { mirror: "hairline", diamond: true, chapterLabel: "chapter", noTitleAnchor: "none" },
  },
  campaign: {
    treatment: "center_mirror",
    knobs: { mirror: "bar", diamond: false, chapterLabel: "act", noTitleAnchor: "none" },
  },
  vermilion: {
    treatment: "center_mirror",
    knobs: { mirror: "gold-rule", diamond: false, chapterLabel: "part", noTitleAnchor: "none" },
  },
}

export function resolveHeadingTreatment(
  themeId: string | undefined,
): HeadingAssignment | undefined {
  if (themeId === undefined) return undefined
  return ASSIGNMENTS[themeId]
}

export function assignedThemeIds(): string[] {
  return Object.keys(ASSIGNMENTS)
}
