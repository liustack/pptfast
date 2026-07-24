import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("insight_panel"),
    /** 带标题的策略/观点面板：标题压色条 + 若干 label/描述行 + 可选贴底
     * 脚注。常作 aside 侧栏块与数据并置（观点/纪律/结论）。 */
    title: z.string(),
    rows: z
      .array(z.object({ label: z.string(), text: z.string() }).strict())
      .min(1)
      .max(5),
    footnote: z.string().optional(),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
