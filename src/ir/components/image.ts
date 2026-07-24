import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("image"),
    asset_id: z.string(),
    caption: z.string().optional(),
    // 默认 cover（2026-07-09 用户反馈：模型常选 contain letterbox 不铺满
    // ——照片一律等比铺满裁切；contain 留给图表截图等不可裁切的图）
    fit: z.enum(["contain", "cover"]).default("cover"),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: true,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
