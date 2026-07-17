import type { Component, Slide } from "@/ir"

/**
 * Shared "first image component" lookup (W2 task 3): the takeover-layout
 * renderers (`ImagePages.tsx`'s 4 page components) and `FullSlideSvg`'s
 * takeover-dispatch check each used to independently write
 * `slide.components.find((b) => b.type === "image")` — 5 duplicated copies of
 * the same convention (inventory finding). This is the single place that
 * convention now lives.
 *
 * Exported name is forward-looking ("component", the task-4 vocabulary for
 * today's `components`) — new code gets the name the codebase is migrating
 * toward — but the field this task still reads is `slide.components`, so the
 * implementation below keeps "component" terminology internally.
 */
export function findImageComponent(slide: Slide): Extract<Component, { type: "image" }> | undefined {
  return slide.components.find(
    (component): component is Extract<Component, { type: "image" }> => component.type === "image",
  )
}
