import type { Block, Slide } from "@/ir"

/**
 * Shared "first image block" lookup (W2 task 3): the takeover-layout
 * renderers (`ImagePages.tsx`'s 4 page components) and `FullSlideSvg`'s
 * takeover-dispatch check each used to independently write
 * `slide.blocks.find((b) => b.type === "image")` — 5 duplicated copies of
 * the same convention (inventory finding). This is the single place that
 * convention now lives.
 *
 * Exported name is forward-looking ("component", the task-4 vocabulary for
 * today's `blocks`) — new code gets the name the codebase is migrating
 * toward — but the field this task still reads is `slide.blocks`, so the
 * implementation below keeps "block" terminology internally.
 */
export function findImageComponent(slide: Slide): Extract<Block, { type: "image" }> | undefined {
  return slide.blocks.find(
    (block): block is Extract<Block, { type: "image" }> => block.type === "image",
  )
}
