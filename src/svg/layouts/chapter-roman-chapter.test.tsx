import { describe, it, expect } from "vitest"
import { toRoman } from "./chapter-roman-chapter"

describe("toRoman（标准减法记数，非查表）", () => {
  it("常用章节号", () => {
    expect(toRoman(1)).toBe("I")
    expect(toRoman(4)).toBe("IV")
    expect(toRoman(6)).toBe("VI")
    expect(toRoman(9)).toBe("IX")
    expect(toRoman(14)).toBe("XIV")
    expect(toRoman(19)).toBe("XIX")
    expect(toRoman(40)).toBe("XL")
    expect(toRoman(49)).toBe("XLIX")
    expect(toRoman(88)).toBe("LXXXVIII")
    expect(toRoman(444)).toBe("CDXLIV")
    expect(toRoman(1994)).toBe("MCMXCIV")
    expect(toRoman(3999)).toBe("MMMCMXCIX")
  })
  it("越界回落阿拉伯数字", () => {
    expect(toRoman(0)).toBe("0")
    expect(toRoman(4000)).toBe("4000")
    expect(toRoman(2.5)).toBe("2.5")
  })
})
