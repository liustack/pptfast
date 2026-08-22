// @vitest-environment jsdom
//
// bloom = classroom 的色板 preset，全仓首例（2026-08-20 柔和组皮肤重设计，
// 设计源 `.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html`
// 的 `section#g4`）。
//
// 「preset」在这里不是修辞：`themes/bloom.ts` 直接 spread `CLASSROOM_TOKENS`，
// 只覆盖 `id`、五个色值、三枚语义色、以及由那五个色值推导的
// `defaultBackgrounds`。
// `theme-structure.test.ts` 已经从**声明侧**钉住了结构行（同一个
// `layoutTendencies` 对象引用 + 深等 + 逐 seed 同版式序列）。本文件补的是
// **渲染侧**那一半，也是一个人真正会看见的那一半：把两家的色板从渲出来的
// SVG 里剥掉之后，骨架必须逐字节相同；而色板本身必须是 bloom 自己的五个值。
//
// 谁改坏了什么，这两条会分别报红：
//   - 有人给 bloom 加一条 classroom 没有的版式/字体/圆角 → 骨架不再逐字节同
//   - 有人把 bloom 的色板悄悄改回 classroom 的 → 「五个色值各不相同」那条红
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { renderSlideSvg } from "../api"
import { installNodePlatform } from "../platform/node"
import { resolveStyle } from "./index"
import { THEME_DEFINITIONS } from "./definitions"

installNodePlatform()

const CLASSROOM = resolveStyle("classroom")
const BLOOM = resolveStyle("bloom")

/**
 * 只属于 bloom 的色值——preset 与 classroom 的**全部**差异。
 *
 * 后三枚是语义色（第四轮评审裁定「警示色不得全主题一律红」之后，17 个主题
 * 逐个自填）。它们与前五个同属色板：两家的骨架必须仍然逐字节相同，而值必须
 * 各是各的——bloom 的警戒色是花园语系的金盏花，classroom 的是砂黄。
 */
const PRESET_KEYS = ["bg", "surface", "primary", "accent", "border", "danger", "warning", "success"] as const

const slides: Slide[] = [
  { type: "cover", heading: "岭原智能 2026 年第二季度业务评审", subheading: "设备预测性维护业务的增长质量", components: [] },
  { type: "chapter", heading: "第一章 · 客户与收入结构", components: [] },
  {
    type: "content",
    heading: "续约率回到九成一",
    subheading: "六个季度以来最高",
    footnote: "来源：内部经营数据",
    components: [
      { type: "bullets", items: ["新签同比增长两成三", "集中度偏高", "交付周期九周压到五周"] },
      { type: "kpi_cards", items: [{ value: "91", unit: "%", label: "客户续约率" }] },
    ],
  },
  { type: "ending", heading: "Questions", components: [] },
] as unknown as Slide[]

const deckFor = (theme: string): PptxIR =>
  ({
    version: "4",
    filename: "preset-probe.pptx",
    theme: { id: theme },
    // 显式 seed：两家的版式抽签必须在同一个 seed 上比，否则比的是抽签不是骨架。
    seed: 42,
    meta: { organization: "战略与运营部", date: "2026 年 7 月", confidentiality: "internal" },
    assets: { images: {} },
    slides,
  }) as unknown as PptxIR

/**
 * 剥色板：把一家主题自己的每个 token 色值换成符号名。**按字符串长度倒序
 * 替换**，免得短值是长值的前缀时替错（当前两家没有这种重叠，倒序是防御）。
 */
function stripPalette(markup: string, theme: string): string {
  const t = resolveStyle(theme)
  const named: [string, string][] = [
    [t.colors.bg, "<bg>"],
    [t.colors.surface, "<surface>"],
    [t.colors.primary, "<primary>"],
    [t.colors.accent, "<accent>"],
    [t.colors.text, "<text>"],
    [t.colors.muted, "<muted>"],
    [t.colors.border ?? "", "<border>"],
    [t.colors.danger ?? "", "<danger>"],
    [t.colors.warning ?? "", "<warning>"],
    [t.colors.success ?? "", "<success>"],
    ...t.colors.chartPalette.map((c, i) => [c, `<chart${i}>`] as [string, string]),
  ]
  let out = markup
  for (const [hex, name] of named.sort((a, b) => b[0].length - a[0].length)) {
    if (!hex) continue
    out = out.split(hex).join(name)
  }
  // Content-page motif fade is a function of the palette (gallery r2 B2).
  // Strip it with the hexes so the skeleton comparison stays about
  // structure, not per-theme contrast math.
  out = out.replace(/opacity="[\d.]+"/g, 'opacity="<op>"')
  return out
}

describe("bloom 是 classroom 的色板 preset（渲染侧）", () => {
  it("剥掉色板之后，四页型的骨架逐字节相同", () => {
    for (let i = 0; i < slides.length; i++) {
      const classroom = stripPalette(renderSlideSvg(deckFor("classroom"), i), "classroom")
      const bloom = stripPalette(renderSlideSvg(deckFor("bloom"), i), "bloom")
      expect(bloom, `page ${i + 1} (${slides[i].type}) skeleton diverged`).toBe(classroom)
    }
  })

  it("剥之前不相同——否则上一条是空转（两家渲的确实是两个色板）", () => {
    for (let i = 0; i < slides.length; i++) {
      expect(renderSlideSvg(deckFor("bloom"), i)).not.toBe(renderSlideSvg(deckFor("classroom"), i))
    }
  })

  it("色板八值是 bloom 自己的，其余色值与 classroom 同源（同一份值）", () => {
    for (const key of PRESET_KEYS) {
      expect(BLOOM.colors[key], `${key} should be bloom's own`).not.toBe(CLASSROOM.colors[key])
    }
    expect(BLOOM.colors.text).toBe(CLASSROOM.colors.text)
    expect(BLOOM.colors.muted).toBe(CLASSROOM.colors.muted)
    expect(BLOOM.colors.chartPalette).toEqual(CLASSROOM.colors.chartPalette)
  })

  it("颜色以外的一切都是 classroom 的：字体、圆角/间距、motif", () => {
    expect(BLOOM.fonts).toEqual(CLASSROOM.fonts)
    expect(BLOOM.shape).toEqual(CLASSROOM.shape)
    expect(THEME_DEFINITIONS.bloom.motif).toBe(THEME_DEFINITIONS.classroom.motif)
  })

  it("四页型底色的结构与 classroom 同构：cover/content/ending 取 bg，chapter 取 primary", () => {
    for (const theme of [CLASSROOM, BLOOM]) {
      for (const type of ["cover", "content", "ending"] as const) {
        expect(theme.defaultBackgrounds[type]).toEqual({ kind: "color", value: theme.colors.bg })
      }
      expect(theme.defaultBackgrounds.chapter).toEqual({ kind: "color", value: theme.colors.primary })
    }
  })

  it("红线：bloom 这个 theme id 仍在（既有 deck 里写着它）", () => {
    expect(THEME_DEFINITIONS.bloom.id).toBe("bloom")
    expect(BLOOM.id).toBe("bloom")
  })
})
