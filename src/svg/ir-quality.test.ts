import { describe, it, expect } from "vitest"
import { checkIrQuality, type QualityIssue } from "./ir-quality"
import { CAPACITY } from "./audit/capacity"
import type { PptxIR, Slide } from "@/ir"

// ── helpers ──

function makeIR(slides: Slide[], themeId: PptxIR["theme"]["id"] = "consulting"): PptxIR {
  return {
    version: "3",
    filename: "test.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

function codes(issues: QualityIssue[]): string[] {
  return issues.map((i) => i.code)
}

// ── tests ──

describe("checkIrQuality", () => {
  it("returns empty array for a clean deck", () => {
    const ir = makeIR([
      {
        type: "cover",
        heading: "标题",
        blocks: [],
      },
      {
        type: "content",
        heading: "内容页",
        blocks: [
          { type: "bullets", items: ["a", "b", "c"] },
          { type: "paragraph", text: "hello" },
        ],
      },
    ])
    expect(checkIrQuality(ir)).toEqual([])
  })

  // ── empty_deck ──

  it("reports error for empty deck", () => {
    const issues = checkIrQuality(makeIR([]))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].code).toBe("empty_deck")
  })

  // ── density ──

  it(`warns when content slide has >${CAPACITY.maxBlocksPerSlide} blocks`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "密集页",
        blocks: Array.from({ length: CAPACITY.maxBlocksPerSlide + 1 }, (_, i) => ({
          type: "paragraph" as const,
          text: String(i),
        })),
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("density")
  })

  it(`does NOT warn density for exactly ${CAPACITY.maxBlocksPerSlide} blocks`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "刚好页",
        blocks: Array.from({ length: CAPACITY.maxBlocksPerSlide }, (_, i) => ({
          type: "paragraph" as const,
          text: String(i),
        })),
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("density")
  })

  it("does NOT warn density for tech content slide at its own (higher) 6-block threshold", () => {
    // tech's card-grid geometry supports more blocks/page than the
    // linear-stack themes the flat default was derived from — verified by
    // real zero-overflow rendering in templates/tech.test.tsx.
    const bentoLimit = CAPACITY.maxBlocksPerSlideOverrides["tech"]
    const ir = makeIR(
      [
        {
          type: "content",
          heading: "拼盘页",
          blocks: Array.from({ length: bentoLimit }, (_, i) => ({
            type: "paragraph" as const,
            text: String(i),
          })),
        },
      ],
      "tech",
    )
    expect(codes(checkIrQuality(ir))).not.toContain("density")
  })

  it("warns density for a tech content slide that exceeds its own 6-block threshold", () => {
    const bentoLimit = CAPACITY.maxBlocksPerSlideOverrides["tech"]
    const ir = makeIR(
      [
        {
          type: "content",
          heading: "超载拼盘页",
          blocks: Array.from({ length: bentoLimit + 1 }, (_, i) => ({
            type: "paragraph" as const,
            text: String(i),
          })),
        },
      ],
      "tech",
    )
    const issues = checkIrQuality(ir)
    expect(codes(issues)).toContain("density")
    expect(issues.find((i) => i.code === "density")!.message).toContain(
      String(bentoLimit),
    )
  })

  it("still warns a non-bento theme at the flat 4-block threshold even though tech's is 6", () => {
    const ir = makeIR(
      [
        {
          type: "content",
          heading: "普通主题页",
          blocks: Array.from({ length: CAPACITY.maxBlocksPerSlide + 1 }, (_, i) => ({
            type: "paragraph" as const,
            text: String(i),
          })),
        },
      ],
      "consulting",
    )
    expect(codes(checkIrQuality(ir))).toContain("density")
  })

  it(`does NOT warn density for non-content slide with >${CAPACITY.maxBlocksPerSlide} blocks`, () => {
    const ir = makeIR([
      {
        type: "cover",
        heading: "封面",
        blocks: [
          { type: "paragraph", text: "1" },
          { type: "paragraph", text: "2" },
          { type: "paragraph", text: "3" },
          { type: "paragraph", text: "4" },
          { type: "paragraph", text: "5" },
          { type: "paragraph", text: "6" },
        ],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("density")
  })

  // ── bullets_overflow ──

  it(`warns when a bullets block has >${CAPACITY.bullets.maxItems} items`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "列表页",
        blocks: [
          {
            type: "bullets",
            items: Array.from(
              { length: CAPACITY.bullets.maxItems + 1 },
              (_, i) => String(i)
            ),
          },
        ],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("bullets_overflow")
  })

  it(`does NOT warn bullets_overflow for exactly ${CAPACITY.bullets.maxItems} items`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "列表页",
        blocks: [
          {
            type: "bullets",
            items: Array.from(
              { length: CAPACITY.bullets.maxItems },
              (_, i) => String(i)
            ),
          },
        ],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("bullets_overflow")
  })

  // ── bullet_item_long ──

  it(`warns when a bullet item exceeds ${CAPACITY.bullets.maxUnitsPerItem} measureTextUnits`, () => {
    const long = "长".repeat(CAPACITY.bullets.maxUnitsPerItem + 1) // CJK weight=1.0/字
    const ir = makeIR([
      {
        type: "content",
        heading: "列表页",
        blocks: [{ type: "bullets", items: [long] }],
      },
    ])
    const issues = checkIrQuality(ir)
    expect(codes(issues)).toContain("bullet_item_long")
    expect(issues.find((i) => i.code === "bullet_item_long")!.severity).toBe(
      "warn"
    )
  })

  it("does NOT warn bullet_item_long for an item within budget", () => {
    const ok = "长".repeat(CAPACITY.bullets.maxUnitsPerItem)
    const ir = makeIR([
      {
        type: "content",
        heading: "列表页",
        blocks: [{ type: "bullets", items: [ok] }],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("bullet_item_long")
  })

  // ── missing_heading ──

  it("warns when content slide has no heading", () => {
    const ir = makeIR([
      {
        type: "content",
        blocks: [{ type: "paragraph", text: "hi" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("warns when cover slide has no heading", () => {
    const ir = makeIR([
      {
        type: "cover",
        blocks: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("warns when chapter slide has no heading", () => {
    const ir = makeIR([
      {
        type: "chapter",
        blocks: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("missing_heading")
  })

  it("does NOT warn missing_heading for ending slide", () => {
    const ir = makeIR([
      {
        type: "ending",
        blocks: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("missing_heading")
  })

  it("does NOT warn missing_heading for background-image-only pages", () => {
    const ir = makeIR([
      {
        type: "content",
        blocks: [{ type: "image", asset_id: "hero", fit: "cover" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("missing_heading")
  })

  // ── long_heading ──

  it(`warns when heading exceeds ${CAPACITY.headingMaxChars} characters`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading:
          "这是一个超过四十个字符的标题用来测试标题过长告警功能是否正常工作的完整长句子啊你好世界。这句真的很长",
        blocks: [],
      },
    ])
    const issues = checkIrQuality(ir)
    expect(codes(issues)).toContain("long_heading")
    expect(issues.find((i) => i.code === "long_heading")!.message).toContain(
      "断言式短句"
    )
  })

  it(`does NOT warn for heading at exactly ${CAPACITY.headingMaxChars} characters`, () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "a".repeat(CAPACITY.headingMaxChars),
        blocks: [],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("long_heading")
  })

  // ── big_number_no_kpi ──

  it("warns when big_number variant lacks kpi_cards block", () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "大数字",
        variant: "big_number",
        blocks: [{ type: "paragraph", text: "oops" }],
      },
    ])
    expect(codes(checkIrQuality(ir))).toContain("big_number_no_kpi")
  })

  it("does NOT warn big_number_no_kpi when kpi_cards present", () => {
    const ir = makeIR([
      {
        type: "content",
        heading: "大数字",
        variant: "big_number",
        blocks: [
          {
            type: "kpi_cards",
            items: [{ value: "99%", label: "完成率" }],
          },
        ],
      },
    ])
    expect(codes(checkIrQuality(ir))).not.toContain("big_number_no_kpi")
  })

  // ── multiple issues on one slide ──

  it("can report multiple issues on a single slide", () => {
    const ir = makeIR([
      {
        type: "content",
        // no heading + >maxBlocksPerSlide blocks + bullets overflow
        blocks: [
          { type: "bullets", items: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] },
          { type: "paragraph", text: "a" },
          { type: "paragraph", text: "b" },
          { type: "paragraph", text: "c" },
          { type: "paragraph", text: "d" },
          { type: "paragraph", text: "e" },
        ],
      },
    ])
    const c = codes(checkIrQuality(ir))
    expect(c).toContain("density")
    expect(c).toContain("bullets_overflow")
    expect(c).toContain("missing_heading")
  })

  // ── slide index correctness ──

  it("reports correct slide index (0-based)", () => {
    const ir = makeIR([
      { type: "cover", heading: "OK", blocks: [] },
      {
        type: "content",
        // no heading
        blocks: [{ type: "paragraph", text: "x" }],
      },
    ])
    const issues = checkIrQuality(ir)
    expect(issues).toHaveLength(1)
    expect(issues[0].slide).toBe(1)
  })
})
