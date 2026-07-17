import { measureTextUnits } from "../../lib/svg-text-layout"
import { getPlatform } from "../../platform/registry"

export interface OverflowIssue {
  kind: "h-overflow" | "v-overflow" | "page-overflow"
  text: string
  detail: string
}

const TOL = 6
const PAGE = { w: 1280, h: 720 }

interface Box { x: number; y: number; w: number }
interface Rect extends Box { h: number }

// This renderer only ever emits `translate(dx,dy)`, `scale(s)`, or the two
// composed as `translate(dx,dy) scale(s)` (uniform scale, e.g. bento-card
// content scale-to-fit or icon scale) — never rotation or non-uniform scale,
// so a single scalar is enough.
function parseTransform(el: Element): { dx: number; dy: number; scale: number } {
  const t = el.getAttribute("transform") ?? ""
  const tm = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(t)
  const sm = /scale\(\s*(-?[\d.]+)/.exec(t)
  return {
    dx: tm ? Number(tm[1]) : 0,
    dy: tm ? Number(tm[2]) : 0,
    scale: sm ? Number(sm[1]) : 1,
  }
}

function parseNums(attr: string | null): number[] {
  return (attr ?? "").split(",").map(Number)
}

export function auditSvgMarkup(markup: string): OverflowIssue[] {
  const Parser = getPlatform().domParser ?? globalThis.DOMParser
  if (!Parser) {
    throw new Error(
      'DOMParser unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically)'
    )
  }
  const doc = new Parser().parseFromString(markup, "image/svg+xml")
  const root = doc.documentElement
  const issues: OverflowIssue[] = []

  const visit = (
    el: Element,
    ox: number,
    oy: number,
    os: number,
    box: Box | null,
    rect: Rect | null,
  ) => {
    const { dx, dy, scale } = parseTransform(el)
    // Compose (ox,oy,os) — "absolute = (ox,oy) + os * local" — with this
    // element's own translate/scale, in the SVG-transform-list order
    // (translate applied to local coordinates, then the accumulated parent
    // transform), so any component scaled to fit (bento cards) still gets
    // correctly-scaled text metrics rather than false-positive overflow.
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale

    const boxAttr = el.getAttribute("data-audit-box")
    if (boxAttr) {
      const [x, y, w] = parseNums(boxAttr)
      box = { x, y, w }
    }
    const rectAttr = el.getAttribute("data-audit-rect")
    if (rectAttr) {
      const [x, y, w, h] = parseNums(rectAttr)
      rect = { x, y, w, h }
    }

    if (el.tagName.toLowerCase() === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const fontSize = Number(el.getAttribute("font-size") ?? 16) * as
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const width = measureTextUnits(content) * fontSize
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        const right = left + width
        const label = content.slice(0, 24)

        if (box && (right > box.x + box.w + TOL || left < box.x - TOL)) {
          issues.push({
            kind: "h-overflow",
            text: label,
            detail: `text [${left.toFixed(0)},${right.toFixed(0)}] exceeds box x=${box.x} w=${box.w}`,
          })
        }
        if (rect && ty + fontSize * 0.25 > rect.y + rect.h + TOL) {
          issues.push({
            kind: "v-overflow",
            text: label,
            detail: `baseline ${ty.toFixed(0)} below rect bottom ${rect.y + rect.h}`,
          })
        }
        // data-bleed：显式声明的出血排印（时尚杂志出血大号语法，2026-07-10）
        // 不算 page-overflow——审计语义是抓「意外」溢出，声明过的溢出是设计。
        if (
          !el.hasAttribute("data-bleed") &&
          (right > PAGE.w + TOL || left < -TOL || ty > PAGE.h + TOL || ty < -TOL)
        ) {
          issues.push({
            kind: "page-overflow",
            text: label,
            detail: `text [${left.toFixed(0)},${right.toFixed(0)}] y=${ty.toFixed(0)} outside 1280x720`,
          })
        }
      }
    }

    for (const child of Array.from(el.children)) visit(child, ax, ay, as, box, rect)
  }

  visit(root, 0, 0, 1, null, null)
  return issues
}
