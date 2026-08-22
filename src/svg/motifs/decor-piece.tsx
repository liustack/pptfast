import type { ReactNode } from "react"

/**
 * One named decoration piece. Paint stays on the leaves. svg2pptx ignores
 * this attribute and does not inherit fill/stroke/opacity from the group.
 */
export function DecorPiece({ id, children }: { id: string; children: ReactNode }) {
  return <g data-decor-piece={id}>{children}</g>
}
