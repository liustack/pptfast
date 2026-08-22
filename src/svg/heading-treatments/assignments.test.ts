import { describe, expect, it } from "vitest"
import {
  assignedThemeIds,
  resolveHeadingTreatment,
  type HeadingKnobs,
  type HeadingTreatmentId,
} from "./assignments"

type AssignmentRow = {
  themeId: string
  treatment: HeadingTreatmentId
  knobs: HeadingKnobs
}

const ASSIGNMENTS: AssignmentRow[] = [
  {
    themeId: "consulting",
    treatment: "ghost_index",
    knobs: { indexStyle: "ghost-bleed", noTitleAnchor: "mini-index" },
  },
  {
    themeId: "tech",
    treatment: "ghost_index",
    knobs: { indexStyle: "stroke-corner", noTitleAnchor: "mini-index" },
  },
  {
    themeId: "insight",
    treatment: "baseline",
    knobs: { rule: "hairline", rightSlot: "none", noTitleAnchor: "none" },
  },
  {
    themeId: "heritage",
    treatment: "baseline",
    knobs: { rule: "wenwu", rightSlot: "none" },
  },
  {
    themeId: "journal",
    treatment: "baseline",
    knobs: { rule: "double-tone", rightSlot: "numero-name" },
  },
  {
    themeId: "playbill",
    treatment: "tag_box",
    knobs: { box: "solid-invert", chapterLabel: "act" },
  },
  {
    themeId: "enterprise",
    treatment: "tag_box",
    knobs: { box: "solid-primary", chapterLabel: "part" },
  },
  {
    themeId: "arena",
    treatment: "tag_box",
    knobs: { box: "hud-brackets", chapterLabel: "round" },
  },
  {
    themeId: "academic",
    treatment: "lead_accent",
    knobs: { accentStyle: "typeface-shift", tail: "gold-dot", noTitleAnchor: "none" },
  },
  {
    themeId: "terra",
    treatment: "lead_accent",
    knobs: { accentStyle: "color", tail: "olive-rule", noTitleAnchor: "none" },
  },
  {
    themeId: "ink",
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "vermilion-dot",
      titleRule: "none",
      insetX: 152,
      noTitleAnchor: "short-kicker",
    },
  },
  {
    themeId: "lecture",
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "none",
      titleRule: "chalk",
      insetX: 164,
      noTitleAnchor: "short-kicker",
    },
  },
  {
    themeId: "museum",
    treatment: "vertical_kicker",
    knobs: {
      kickerMark: "gold-rule",
      titleRule: "none",
      insetX: 168,
      noTitleAnchor: "short-kicker",
    },
  },
  {
    themeId: "luxe",
    treatment: "center_mirror",
    knobs: { mirror: "hairline", diamond: true, chapterLabel: "chapter", noTitleAnchor: "none" },
  },
  {
    themeId: "campaign",
    treatment: "center_mirror",
    knobs: { mirror: "bar", diamond: false, chapterLabel: "act", noTitleAnchor: "none" },
  },
  {
    themeId: "vermilion",
    treatment: "center_mirror",
    knobs: { mirror: "gold-rule", diamond: false, chapterLabel: "part", noTitleAnchor: "none" },
  },
]

describe("resolveHeadingTreatment", () => {
  describe("unassigned / missing themeId → undefined", () => {
    it.each([
      "classroom",
      "bloom",
      "swiss",
      "stage",
      "memo",
      "crayon",
      "ember",
      "runway",
      "pulse",
      "unknown",
    ] as const)("%s → undefined", (themeId) => {
      expect(resolveHeadingTreatment(themeId)).toBeUndefined()
    })

    it("undefined → undefined", () => {
      expect(resolveHeadingTreatment(undefined)).toBeUndefined()
    })
  })

  describe("each spec assignment resolves to the expected treatment", () => {
    it.each(ASSIGNMENTS)("$themeId → $treatment with spec knobs", ({ themeId, treatment, knobs }) => {
      expect(resolveHeadingTreatment(themeId)).toEqual({ treatment, knobs })
    })
  })

  describe("uniqueness: one theme one treatment", () => {
    it("maps each themeId to exactly one treatment", () => {
      const themeIds = assignedThemeIds()
      expect(new Set(themeIds).size).toBe(themeIds.length)
      expect(themeIds).toHaveLength(16)
      for (const themeId of themeIds) {
        const assignment = resolveHeadingTreatment(themeId)
        expect(assignment).toBeDefined()
        expect(assignment!.treatment).toBeTruthy()
      }
    })
  })

  it("bloom is not in the table (classroom recolor)", () => {
    expect(resolveHeadingTreatment("bloom")).toBeUndefined()
    expect(assignedThemeIds()).not.toContain("bloom")
    expect(assignedThemeIds()).not.toContain("classroom")
  })

  it("assignment count is 16", () => {
    expect(assignedThemeIds()).toHaveLength(16)
    expect(ASSIGNMENTS).toHaveLength(16)
  })
})
