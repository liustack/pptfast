import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// device_mockup component wave (`.issues/2026-08-05-component-waves/
// plan-device-mockup.md`, 控制器裁定 1): closes the "product screenshot
// pasted as a bare image reads like a Figma mockup, not real running
// software" gap the probe evidence gate confirmed 2/2 (p08 手机场景 4/4
// BROKEN, p09 浏览器仪表盘 3/3 EXPRESSION-GAP — 模型只能靠文案找补"not a
// mockup"/"actual in-app dashboard"，渲染手段完全跟不上). Two device
// shapes only (`裁定 1`：语义面最小，零装饰选项) — the probe evidence never
// covered tablet/watch, so this schema doesn't speculate about them. `url`
// is the *only* text decoration this component allows (a browser's address
// bar is itself the "this is really running" signal p09's evidence names
// explicitly) — deliberately has no counterpart on `phone` (no address
// bar on a phone screen), enforced below rather than silently ignored.
export const schema = z
  .object({
    type: z.literal("device_mockup"),
    device: z
      .enum(["browser", "phone"])
      .describe('Frame shape to draw: "browser" (adds an optional address-bar `url`) or "phone" (no address bar).'),
    // Same asset_id semantics as `image` (裁定 2) — the screen area reuses
    // image.tsx's whole asset-resolution/cover-crop/aria-label/missing-asset
    // machinery verbatim, just inside a themed device frame instead of a
    // bare bordered rect. No `fit` field (unlike `image`): the device frame
    // exists specifically to read as "a real screen", and a real screen's
    // content fills it — cover is the only legal crop, not an authoring
    // choice.
    asset_id: z.string(),
    caption: z.string().optional(),
    // Browser-only address-bar text — see this schema's own top comment.
    url: z
      .string()
      .optional()
      .describe('Address-bar text shown in the browser window bar. Only valid when device is "browser".'),
  })
  .strict()
  // Schema guidance (review fix round, Important-1 — this is the first
  // component schema to carry a `.describe()`; `pptfast schema`/`irJsonSchema()`
  // is the surface a model actually reads before writing IR, so the
  // component-vs-image decision this schema's own top comment already
  // reasons through needs to live here too, not just in a comment nobody
  // consuming the JSON Schema output ever sees). Style precedent for future
  // components: name the concrete alternative component, state the one-line
  // test that decides between them, keep it to a sentence or two.
  .describe(
    "Frames a product or app screenshot inside a real device (a browser window or a phone) so it reads as " +
      "software that is actually running, not a flat picture. Use device_mockup for screenshots of a UI, " +
      "dashboard, or app; keep plain photos, illustrations, and other non-screen images as `image`.",
  )
  .superRefine((c, ctx) => {
    if (c.device === "phone" && c.url !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: `device_mockup.url only applies to device: "browser" (it renders as the address-bar text) — "phone" has no address bar; remove url or switch device to "browser"`,
      })
    }
  })

export const aliases = {} satisfies ComponentAliasSpec

// selfVisual (not scalable, unlike `image`): the device chrome *is* the
// component's own card/frame — stacking bento's outline shell underneath
// it, or content-stacked-poster.tsx's scale-to-fill-slot treatment (which
// would stretch the device frame's carefully-derived aspect ratio out of
// shape), would both undercut the exact "reads as a real device" effect
// this component exists to deliver. evidence: true — a framed product
// screenshot is the strongest available proof a slide can show for "this
// software is real and running" (the direct fix for the probe evidence
// this component closes), so it is evidence-eligible alongside `image`
// (see `component-traits.ts`'s `EVIDENCE_TYPES` for the priority-order
// placement, ranked above `image` — the same underlying asset reads as
// stronger evidence once it's framed as a real device).
export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
