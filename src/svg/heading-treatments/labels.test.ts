import { describe, expect, it } from "vitest"
import {
  casualHan,
  formatChapterLabel,
  formatJournalRightSlot,
  hanFormal,
  headingIsCjk,
  padded,
} from "./labels"

describe("padded", () => {
  it("pads to two digits", () => {
    expect(padded(3)).toBe("03")
    expect(padded(1)).toBe("01")
    expect(padded(10)).toBe("10")
  })
})

describe("hanFormal", () => {
  it("uses 壹贰叁…拾 for 1-10", () => {
    expect(hanFormal(1)).toBe("壹")
    expect(hanFormal(2)).toBe("贰")
    expect(hanFormal(3)).toBe("叁")
    expect(hanFormal(10)).toBe("拾")
  })

  it("above 10 uses 十 + remainder", () => {
    expect(hanFormal(11)).toBe("十壹")
    expect(hanFormal(12)).toBe("十贰")
  })
})

describe("casualHan", () => {
  it("uses 一二三…十, never 叁", () => {
    expect(casualHan(1)).toBe("一")
    expect(casualHan(3)).toBe("三")
    expect(casualHan(10)).toBe("十")
    expect(casualHan(11)).toBe("十一")
  })
})

describe("formatChapterLabel", () => {
  it("act: CJK 第N幕 / Latin ACT N", () => {
    expect(formatChapterLabel("act", 1, true)).toBe("第一幕")
    expect(formatChapterLabel("act", 3, true)).toBe("第三幕")
    expect(formatChapterLabel("act", 3, false)).toBe("ACT 3")
  })

  it("part: CJK 第N部分 / Latin PART N", () => {
    expect(formatChapterLabel("part", 1, true)).toBe("第一部分")
    expect(formatChapterLabel("part", 3, false)).toBe("PART 3")
  })

  it("round is always Latin ROUND N", () => {
    expect(formatChapterLabel("round", 3, true)).toBe("ROUND 3")
    expect(formatChapterLabel("round", 1, false)).toBe("ROUND 1")
  })

  it("chapter: CJK 第N章 with no extra spaces / Latin CHAPTER 0N", () => {
    expect(formatChapterLabel("chapter", 1, true)).toBe("第一章")
    expect(formatChapterLabel("chapter", 3, true)).toBe("第三章")
    expect(formatChapterLabel("chapter", 3, true)).not.toMatch(/ /)
    expect(formatChapterLabel("chapter", 3, false)).toBe("CHAPTER 03")
  })

  it("lecture: CJK 第N讲 / Latin LECTURE N", () => {
    expect(formatChapterLabel("lecture", 3, true)).toBe("第三讲")
    expect(formatChapterLabel("lecture", 3, false)).toBe("LECTURE 3")
  })
})

describe("formatJournalRightSlot", () => {
  it("formats № pad · sectionName", () => {
    expect(formatJournalRightSlot(1, "增长战略")).toBe("№ 01 · 增长战略")
  })
})

describe("headingIsCjk", () => {
  it("picks CJK from sectionName then heading", () => {
    expect(headingIsCjk("增长战略", "Growth")).toBe(true)
    expect(headingIsCjk(null, "算法团队")).toBe(true)
    expect(headingIsCjk("Growth", "Tempo")).toBe(false)
    expect(headingIsCjk(null, null)).toBe(false)
  })
})
