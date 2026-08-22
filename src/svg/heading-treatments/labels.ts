import { hasCjk } from "../layouts/minimal-shared"
import type { HeadingKnobs } from "./assignments"

const HAN_FORMAL = ["", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾"] as const
const CASUAL_HAN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"] as const

export function padded(n: number): string {
  return String(n).padStart(2, "0")
}

function digitRun(n: number, table: readonly string[]): string {
  if (n <= 0) return String(n)
  if (n <= 10) return table[n] ?? String(n)
  if (n < 20) return `十${table[n - 10] ?? String(n - 10)}`
  const tens = Math.floor(n / 10)
  const ones = n % 10
  const head = tens === 1 ? "十" : `${table[tens] ?? String(tens)}十`
  return ones === 0 ? head : `${head}${table[ones] ?? String(ones)}`
}

/** 壹贰叁…拾. Above 10 uses 十一 style (`十` + remainder). Museum GhostIndex 展签 does not ship. */
export function hanFormal(n: number): string {
  return digitRun(n, HAN_FORMAL)
}

/** 一二三…十. Above 10 uses 十一. Used in 第N幕 / 第N部分 / 第N章, never 第叁幕. */
export function casualHan(n: number): string {
  return digitRun(n, CASUAL_HAN)
}

export type ChapterLabelKind = NonNullable<HeadingKnobs["chapterLabel"]>

/** Pick CJK vs Latin from the section name, then the heading. */
export function headingIsCjk(sectionName?: string | null, heading?: string | null): boolean {
  return hasCjk(sectionName ?? heading ?? "")
}

export function formatChapterLabel(kind: ChapterLabelKind, n: number, cjk: boolean): string {
  switch (kind) {
    case "act":
      return cjk ? `第${casualHan(n)}幕` : `ACT ${n}`
    case "part":
      return cjk ? `第${casualHan(n)}部分` : `PART ${n}`
    case "round":
      return `ROUND ${n}`
    case "chapter":
      return cjk ? `第${casualHan(n)}章` : `CHAPTER ${padded(n)}`
    case "lecture":
      return cjk ? `第${casualHan(n)}讲` : `LECTURE ${n}`
  }
}

export function formatJournalRightSlot(n: number, sectionName: string): string {
  return `№ ${padded(n)} · ${sectionName}`
}
