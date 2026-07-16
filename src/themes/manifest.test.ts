import { describe, expect, it } from "vitest"
import { THEME_MANIFESTS, getManifest } from "./manifest"
import { COVER_ARCHETYPES } from "../svg/archetypes"
import { CHAPTER_ARCHETYPES } from "../svg/archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "../svg/archetypes/index-content"
import { ENDING_ARCHETYPES } from "../svg/archetypes/index-ending"
import { MOTIF_ARCHETYPES } from "../svg/archetypes/index-motif"

describe("THEME_MANIFESTS", () => {
  it("十一主题全覆盖", () => {
    const themes = Object.keys(THEME_MANIFESTS)
    expect(themes.sort()).toEqual(["academic", "bloom", "campaign", "classroom", "consulting", "enterprise", "heritage", "ink", "insight", "journal", "luxe", "runway", "tech"])
  })

  it("清单-注册表一致性锁：四页型 allowed set + motif 里的每个 id 都已在对应注册表注册", () => {
    for (const m of Object.values(THEME_MANIFESTS)) {
      for (const id of m.archetypes.cover) expect(COVER_ARCHETYPES[id]).toBeTypeOf("function")
      for (const id of m.archetypes.chapter) expect(CHAPTER_ARCHETYPES[id]).toBeTypeOf("function")
      for (const id of m.archetypes.content) expect(CONTENT_ARCHETYPES[id]).toBeTypeOf("function")
      for (const id of m.archetypes.ending) expect(ENDING_ARCHETYPES[id]).toBeTypeOf("function")
      if (m.motif !== undefined) expect(MOTIF_ARCHETYPES[m.motif]).toBeTypeOf("function")
    }
  })

  it("Wave 5 前置门：各主题四页型 allowed set 均非空（模板已全量迁移，删 templates/*.tsx 是安全的）。motif 可选（spec §3.3，retail 留空验证）", () => {
    for (const [themeId, m] of Object.entries(THEME_MANIFESTS)) {
      expect(m.archetypes.cover.length, `${themeId}.cover`).toBeGreaterThan(0)
      expect(m.archetypes.chapter.length, `${themeId}.chapter`).toBeGreaterThan(0)
      expect(m.archetypes.content.length, `${themeId}.content`).toBeGreaterThan(0)
      expect(m.archetypes.ending.length, `${themeId}.ending`).toBeGreaterThan(0)
      // motif 是可选的（undefined = 该主题无装饰层，FullSlideSvg 的 Decor 跳过
      // 渲染，安全）——retail 留空，故这里不强制 defined。
    }
  })

  it("manifest 目标值：split-diagonal（academic/tech cover）+ two-column（consulting/academic content）吸纳后的接线态", () => {
    expect(THEME_MANIFESTS.consulting).toEqual({
      archetypes: {
        cover: ["banner-title", "poster-center", "split-diagonal"],
        chapter: ["banner-chapter"],
        content: ["banner-heading", "two-column"],
        ending: ["banner-ending"],
      },
      motif: "banner-motif",
    })
    expect(THEME_MANIFESTS.insight).toEqual({
      archetypes: {
        cover: ["poster-center", "split-diagonal"],
        chapter: ["roman-chapter"],
        content: ["stacked-poster", "two-column"],
        ending: ["poster-ending"],
      },
      motif: "poster-motif",
    })
    expect(THEME_MANIFESTS.academic).toEqual({
      archetypes: {
        cover: ["left-anchor", "split-diagonal"],
        chapter: ["rail-chapter"],
        content: ["rail-numbered", "two-column"],
        ending: ["rail-ending"],
      },
      motif: "rail-motif",
    })
    expect(THEME_MANIFESTS.tech).toEqual({
      archetypes: {
        cover: ["constellation", "split-diagonal"],
        chapter: ["constellation-chapter"],
        content: ["bento-panel", "two-column"],
        ending: ["constellation-ending"],
      },
      motif: "constellation-motif",
    })
    // 2026-07-10 拆分：magazine 时尚版无 motif，journal 继承旧 magazine 全套
    expect(THEME_MANIFESTS.runway).toEqual({
      archetypes: {
        cover: ["fashion-masthead"],
        chapter: ["fashion-chapter"],
        content: ["banner-heading", "two-column"],
        ending: ["fashion-ending"],
      },
    })
    expect(THEME_MANIFESTS.journal).toEqual({
      archetypes: {
        cover: ["editorial-masthead"],
        chapter: ["masthead-chapter"],
        content: ["narrow-column", "two-column"],
        ending: ["masthead-ending"],
      },
      motif: "corner-ornament-motif",
    })
    expect(THEME_MANIFESTS.enterprise).toEqual({
      archetypes: {
        cover: ["split-diagonal"],
        chapter: ["poster-chapter"],
        content: ["banner-heading", "two-column"],
        ending: ["banner-ending"],
      },
      chrome: { suppressFooterOnCardContent: true },
      motif: "enterprise-motif",
    })
  })

  it("chrome 开关归属：enterprise 设 suppressFooterOnCardContent、ink 设 suppressFooterRule（版框防双线），其余九主题不设", () => {
    expect(THEME_MANIFESTS.enterprise.chrome).toEqual({ suppressFooterOnCardContent: true })
    expect(THEME_MANIFESTS.ink.chrome).toEqual({ suppressFooterRule: true })
    for (const themeId of ["consulting", "insight", "academic", "tech", "runway", "journal", "luxe", "heritage", "campaign", "bloom"] as const) {
      expect(THEME_MANIFESTS[themeId].chrome, themeId).toBeUndefined()
    }
  })


  it("luxe（原 retail，黑金）复用现有 archetype（零版式代码），motif 全覆盖后配烫金细线", () => {
    const r = THEME_MANIFESTS.luxe
    // 全借 creative 家族深底 poster 版式 + 共享 two-column/split-diagonal。
    // content 禁配 banner-heading：其横幅文字 baked 白字，香槟金横幅上不可读。
    expect(r.archetypes.cover).toEqual(["poster-center", "split-diagonal"])
    expect(r.archetypes.chapter).toEqual(["poster-chapter"])
    expect(r.archetypes.content).toEqual(["stacked-poster", "two-column"])
    expect(r.archetypes.content).not.toContain("banner-heading")
    expect(r.archetypes.ending).toEqual(["poster-ending"])
    // 2026-07-10 motif 全覆盖（用户裁决 11 主题全配变体装饰）——「motif
    // 可选」的类型语义仍成立，但生产 manifest 已无留空主题。
    expect(r.motif).toBe("luxe-motif")
  })
  it("legacy id 经 resolve 拿到承接主题的清单", () => {
    expect(getManifest("mckinsey-navy")).toBe(THEME_MANIFESTS.consulting)
    // 2026-07-10 第三代退役：retail→luxe、custom→gallery→avant→enterprise
    expect(getManifest("retail")).toBe(THEME_MANIFESTS.luxe)
    expect(getManifest("custom")).toBe(THEME_MANIFESTS.enterprise)
    expect(getManifest("gallery")).toBe(THEME_MANIFESTS.enterprise)
    expect(getManifest("avant")).toBe(THEME_MANIFESTS.enterprise)
  })
})
