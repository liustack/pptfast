import { Fragment } from "react"
import type { Block } from "@/ir"
import type { BlockCtx } from "./blocks/types"
import { renderBlock, measureBlock } from "./blocks"
import { BLOCK_GAP, layoutContentFit, type ContentRect } from "./layout"

/** Block types considered "evidence" in priority order. */
const EVIDENCE_TYPES = [
  "chart",
  "image",
  "comparison",
  "kpi_cards",
] as const satisfies readonly Block["type"][]

/**
 * `assertion_evidence` variant — "full-sentence heading + single enlarged evidence".
 *
 * The slide heading (rendered by the template layer) states an assertion. The
 * content area picks the single strongest evidence block (chart > image >
 * comparison > kpi_cards > first block) and renders it enlarged, vertically
 * centred in the available rect. Any remaining blocks are stacked compactly
 * below it in a smaller supporting region.
 */
export function AssertionEvidence({
  blocks,
  rect,
  ctx,
}: {
  blocks: Block[]
  rect: ContentRect
  ctx: BlockCtx
}) {
  if (blocks.length === 0) {
    return <></>
  }

  // Find the first evidence block by priority.
  let evidence: Block | undefined
  for (const t of EVIDENCE_TYPES) {
    evidence = blocks.find((b) => b.type === t)
    if (evidence) break
  }

  // No recognised evidence type — fall back to normal single-column layout.
  if (!evidence) {
    const { placed, dropped } = layoutContentFit("single", blocks, rect, ctx)
    return (
      <>
        {placed.map((p, i) => (
          <Fragment key={i}>{renderBlock(p.block, p.box, ctx)}</Fragment>
        ))}
        {dropped > 0 && (
          <text
            x={rect.x + rect.w}
            y={rect.y + rect.h - 6}
            textAnchor="end"
            fontSize={14}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${dropped} 项未展示`}
          </text>
        )}
      </>
    )
  }

  const others = blocks.filter((b) => b !== evidence)

  // Measure the evidence block at the full content width.
  const evidenceH = measureBlock(evidence, rect.w, ctx)

  if (others.length === 0) {
    // Only the evidence block — centre it vertically in the entire rect.
    const centredY = rect.y + Math.max(0, (rect.h - evidenceH) / 2)
    return <>{renderBlock(evidence, { x: rect.x, y: centredY, w: rect.w }, ctx)}</>
  }

  // Evidence + supporting blocks: give evidence the majority of the rect,
  // then stack the rest below.
  const SUPPORT_FONT = 14
  const SUPPORT_GAP = 8
  // Reserve space for supporting blocks: at least a compact one-line-each
  // guess, but grown to fit what the blocks actually measure at (they render
  // at their normal block size, not SUPPORT_FONT — a fixed compact guess
  // undersizes real (e.g. wrapped paragraph/bullets) content and forces
  // layoutContentFit's last-resort "keep it anyway" branch to render an
  // overflowing block instead of cleanly dropping it). Capped so evidence
  // still keeps the majority of the rect.
  const measuredSupportH = others.reduce(
    (h, b) => h + measureBlock(b, rect.w, ctx) + BLOCK_GAP,
    -BLOCK_GAP,
  )
  const compactSupportH = others.length * (SUPPORT_FONT + SUPPORT_GAP)
  const supportH = Math.min(
    Math.max(measuredSupportH, compactSupportH),
    rect.h * 0.4,
  )
  const availableForEvidence = rect.h - supportH - SUPPORT_GAP
  const centredY =
    rect.y + Math.max(0, (availableForEvidence - evidenceH) / 2)

  const supportY = rect.y + availableForEvidence + SUPPORT_GAP

  const { placed, dropped } = layoutContentFit(
    "single",
    others,
    { x: rect.x, y: supportY, w: rect.w, h: supportH },
    ctx,
  )

  return (
    <>
      {renderBlock(evidence, { x: rect.x, y: centredY, w: rect.w }, ctx)}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderBlock(p.block, p.box, ctx)}</Fragment>
      ))}
      {dropped > 0 && (
        <text
          x={rect.x + rect.w}
          y={rect.y + rect.h - 6}
          textAnchor="end"
          fontSize={14}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${dropped} 项未展示`}
        </text>
      )}
    </>
  )
}
