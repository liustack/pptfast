/**
 * L1 gallery audit: geometry and taboo markers, zero model.
 *
 * Reuses `auditSvgMarkup` (overflow / page-overflow) and `findOverlapIssues`.
 * Extra checks: page-edge stick, font-size floor, overflow markers, Latin
 * vertical type. Five-dot progress is left to L2.
 */

import { measureMonoTextUnits, measureTextUnits } from "@/lib/svg-text-layout"
import { getPlatform } from "@/platform/registry"
import { findOverlapIssues } from "@/svg/audit/deck-audit"
import { auditSvgMarkup, parseTransform } from "@/svg/audit/svg-audit"
import { isBold, isMonoFontFamily } from "@/svg/fonts"
import { bleedExemption } from "./bbox-exemptions"
import { layoutOf } from "./bbox"

export const L1_CODES = [
  "overflow",
  "out-of-bounds",
  "overlap",
  "edge-stick",
  "font-size",
  "overflow-marker",
  "latin-vertical",
] as const

export type L1Code = (typeof L1_CODES)[number]

export interface L1Finding {
  readonly code: L1Code
  readonly message: string
}

export interface L1Result {
  readonly findings: readonly L1Finding[]
}

const PAGE_W = 1280
const PAGE_H = 720
const EDGE_PX = 4
const FONT_FLOOR = 12
const DIVIDER_MIN_W = 400

const OVERFLOW_MARKER = /\+\d+\s*(…|\.{3}|more|项)/i
const OVERFLOW_MARKER_ZH = /另有\s*\d+\s*项/
const VERTICAL_WM = /^(tb|tb-rl|vertical-rl|vertical-lr)$/i
const LATIN = /[A-Za-z]/

function parseRoot(markup: string): Element {
  const Parser = getPlatform().domParser ?? globalThis.DOMParser
  if (!Parser) {
    throw new Error("DOMParser unavailable — call installNodePlatform() first")
  }
  return new Parser().parseFromString(markup, "image/svg+xml").documentElement
}

function hasDecor(el: Element | null): boolean {
  let cur: Element | null = el
  while (cur) {
    if (typeof cur.hasAttribute === "function" && cur.hasAttribute("data-decor")) return true
    cur = cur.parentElement
  }
  return false
}

function writingModeOf(el: Element): string {
  let cur: Element | null = el
  while (cur) {
    const wm = cur.getAttribute("writing-mode")
    if (wm) return wm
    cur = cur.parentElement
  }
  return ""
}

function textWidth(el: Element, content: string, fontSize: number): number {
  const fontFamily = el.getAttribute("font-family") ?? ""
  const units = isMonoFontFamily(fontFamily)
    ? measureMonoTextUnits(content)
    : measureTextUnits(content, { bold: isBold(el.getAttribute("font-weight")), fontFamily })
  return units * fontSize
}

function collectDividers(root: Element): { y: number; x1: number; x2: number }[] {
  const out: { y: number; x1: number; x2: number }[] = []
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    const tag = el.tagName.toLowerCase()
    if (tag === "line") {
      const x1 = ax + Number(el.getAttribute("x1") ?? 0) * as
      const x2 = ax + Number(el.getAttribute("x2") ?? 0) * as
      const y1 = ay + Number(el.getAttribute("y1") ?? 0) * as
      const y2 = ay + Number(el.getAttribute("y2") ?? 0) * as
      if (Math.abs(y1 - y2) <= 2 && Math.abs(x2 - x1) > DIVIDER_MIN_W) {
        out.push({ y: (y1 + y2) / 2, x1: Math.min(x1, x2), x2: Math.max(x1, x2) })
      }
    }
    if (tag === "rect") {
      const x = ax + Number(el.getAttribute("x") ?? 0) * as
      const y = ay + Number(el.getAttribute("y") ?? 0) * as
      const w = Number(el.getAttribute("width") ?? 0) * as
      const h = Number(el.getAttribute("height") ?? 0) * as
      if (h > 0 && h <= 4 && w > DIVIDER_MIN_W) {
        out.push({ y: y + h / 2, x1: x, x2: x + w })
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
  return out
}

function walkText(
  root: Element,
  layout: string,
  findings: L1Finding[],
  dividers: { y: number; x1: number; x2: number }[],
): void {
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.tagName.toLowerCase() === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const label = content.slice(0, 24)
        const fontSizeAttr = el.getAttribute("font-size")
        const fontSize = Number(fontSizeAttr ?? 16) * as
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const width = textWidth(el, content, fontSize)
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        const right = left + width
        const top = ty - fontSize
        const bottom = ty + fontSize * 0.25
        const decor = hasDecor(el)

        if (OVERFLOW_MARKER.test(content) || OVERFLOW_MARKER_ZH.test(content)) {
          findings.push({
            code: "overflow-marker",
            message: `overflow marker "${label}" is banned`,
          })
        }

        if (!decor && fontSizeAttr !== null && Number(fontSizeAttr) < FONT_FLOOR) {
          findings.push({
            code: "font-size",
            message: `text "${label}" is smaller than the ${FONT_FLOOR}px floor`,
          })
        }

        if (VERTICAL_WM.test(writingModeOf(el)) && LATIN.test(content)) {
          findings.push({
            code: "latin-vertical",
            message: `Latin text "${label}" is set vertically`,
          })
        }

        if (!decor && !el.hasAttribute("data-bleed")) {
          const nearEdge = left < EDGE_PX || top < EDGE_PX || right > PAGE_W - EDGE_PX || bottom > PAGE_H - EDGE_PX
          const exempt =
            nearEdge &&
            bleedExemption({
              layout,
              kind: "page-overflow",
              label,
            })
          if (nearEdge && !exempt) {
            findings.push({
              code: "edge-stick",
              message: `text "${label}" sits within ${EDGE_PX}px of the page edge`,
            })
          } else if (!exempt) {
            for (const d of dividers) {
              const overlap = Math.min(right, d.x2) - Math.max(left, d.x1)
              const gap = Math.min(Math.abs(bottom - d.y), Math.abs(top - d.y), Math.abs(ty - d.y))
              if (overlap > 0 && gap < EDGE_PX) {
                findings.push({
                  code: "edge-stick",
                  message: `text "${label}" sits within ${EDGE_PX}px of a divider`,
                })
                break
              }
            }
          }
        }
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
}

export function auditL1(svg: string): L1Result {
  const findings: L1Finding[] = []
  for (const issue of auditSvgMarkup(svg)) {
    if (issue.kind === "page-overflow") {
      findings.push({
        code: "out-of-bounds",
        message: `text "${issue.text}" falls outside the 1280×720 page (${issue.detail})`,
      })
    } else {
      findings.push({
        code: "overflow",
        message: `text "${issue.text}" overflows ${issue.kind === "h-overflow" ? "its column" : "the content area"} (${issue.detail})`,
      })
    }
  }
  for (const issue of findOverlapIssues(svg)) {
    const pct = Math.round(issue.ratio * 100)
    findings.push({
      code: "overlap",
      message: `two regions overlap by ${pct}% of the smaller region's area — near "${issue.a.label}" and "${issue.b.label}"`,
    })
  }
  const root = parseRoot(svg)
  walkText(root, layoutOf(svg), findings, collectDividers(root))
  return { findings }
}

export function classifyL1(result: L1Result): string[] {
  return [...new Set(result.findings.map((f) => f.code))].sort()
}
