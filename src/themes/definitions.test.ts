import { afterEach, describe, expect, it } from "vitest"
import { CANONICAL_THEME_IDS, THEME_STYLES, resolveThemeId } from "./index"
import {
  __resetRegisteredThemes,
  getInstalledThemeIds,
  getThemeDefinition,
  registerTheme,
  resolveBrand,
  THEME_DEFINITIONS,
  type ThemeDefinition,
  type ThemeRegistration,
} from "./definitions"
import { COVER_ARCHETYPES } from "../svg/archetypes"
import { CHAPTER_ARCHETYPES } from "../svg/archetypes/index-chapter"
import { CONTENT_ARCHETYPES } from "../svg/archetypes/index-content"
import { ENDING_ARCHETYPES } from "../svg/archetypes/index-ending"
import { MOTIF_ARCHETYPES } from "../svg/archetypes/index-motif"
import { layoutsForSlideType } from "../svg/layouts/registry"

// 四页型注册表按 id 分发用的宽字符串索引视图（PAGE_ARCHETYPE_REGISTRIES 在
// FullSlideSvg.tsx 用的同一模式）：THEME_DEFINITIONS.layouts 的 id 是通用
// string（W2 任务 2 起不再分页型细分 ID 联合类型），直接用窄 Record 类型索引
// 会编译失败，故在测试里做同样的宽化视图。
const COVER_REGISTRY: Record<string, unknown> = COVER_ARCHETYPES
const CHAPTER_REGISTRY: Record<string, unknown> = CHAPTER_ARCHETYPES
const CONTENT_REGISTRY: Record<string, unknown> = CONTENT_ARCHETYPES
const ENDING_REGISTRY: Record<string, unknown> = ENDING_ARCHETYPES

describe("THEME_DEFINITIONS", () => {
  it("covers all 13 canonical ids with theme tokens and brand", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const def = THEME_DEFINITIONS[id]
      expect(def.id).toBe(id)
      expect(def.style).toBe(THEME_STYLES[id])
      expect(def.brand).toBeDefined()
      expect(Array.isArray(def.tags)).toBe(true)
    }
  })

  it("carries the two legacy chrome flags to their owners", () => {
    expect(THEME_DEFINITIONS.enterprise.brand.suppressFooterOnCardContent).toBe(true)
    expect(THEME_DEFINITIONS.ink.brand.suppressFooterRule).toBe(true)
    expect(THEME_DEFINITIONS.consulting.brand).toEqual({})
  })

  // W2 任务 2（选择源迁居）：src/themes/manifest.ts 已删除（原主题清单常量
  // 随之死亡），其存留断言迁入本文件，验证对象换成 THEME_DEFINITIONS[id]
  // 的 .layouts/.motif。
  it("十三主题四页型 layouts 均非空（模板已全量迁移，删 templates/*.tsx 是安全的）。motif 可选（spec §3，runway 留空验证）", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const def = THEME_DEFINITIONS[id]
      expect(def.layouts.cover.length, `${id}.cover`).toBeGreaterThan(0)
      expect(def.layouts.chapter.length, `${id}.chapter`).toBeGreaterThan(0)
      expect(def.layouts.content.length, `${id}.content`).toBeGreaterThan(0)
      expect(def.layouts.ending.length, `${id}.ending`).toBeGreaterThan(0)
      // motif 是可选的（undefined = 该主题无装饰层，FullSlideSvg 的 Decor 跳过
      // 渲染，安全）——runway 留空，故这里不强制 defined。
    }
  })

  it("清单-注册表一致性锁：四页型 layouts + motif 里的每个 id 都已在对应 archetype 注册表注册", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const def = THEME_DEFINITIONS[id]
      for (const lid of def.layouts.cover) expect(COVER_REGISTRY[lid]).toBeTypeOf("function")
      for (const lid of def.layouts.chapter) expect(CHAPTER_REGISTRY[lid]).toBeTypeOf("function")
      for (const lid of def.layouts.content) expect(CONTENT_REGISTRY[lid]).toBeTypeOf("function")
      for (const lid of def.layouts.ending) expect(ENDING_REGISTRY[lid]).toBeTypeOf("function")
      if (def.motif !== undefined) expect(MOTIF_ARCHETYPES[def.motif]).toBeTypeOf("function")
    }
  })

  // W4 全集放开（design decision 7, spec §3「缺省 = 全集」）+ W4 fix round
  // 的根因处置收官 + post-v0.3 W8 fix round（backlog item 2）：这份基线断言
  // 钉的是十三主题四页型的纯全集终态。design decision 7 的三处既有对比度
  // 裁定（luxe/campaign/classroom 的 content 排除 banner-heading）、design
  // decision 8 新增的三处阳性裁定（tech 的 cover/content、consulting 的
  // chapter）、以及 W4 fix round 全矩阵扫描新发现的三处（bloom/classroom/
  // heritage 的 chapter 排除 fashion-chapter）——共九处——已随 `src/svg/ink.ts`
  // 的 readableOn 两轮根因修复（W4 引入自适应 ink helper；post-v0.3 W8 把
  // 固定 0.4 明度阈值换成两墨实测对比度取优）全部撤销：十三主题四页型现在
  // **没有任何例外**，均为各页型全集。四个 FULL_* 常量是手工钉的字面数组
  // （人审基线，不经 layoutsForSlideType 派生）——未来 registry 新增/删除
  // archetype 时，这里必须跟着人工重推，而不是无声通过。
  const FULL_COVER = [
    "banner-title",
    "poster-center",
    "left-anchor",
    "constellation",
    "editorial-masthead",
    "tone-adaptive-header",
    "fashion-masthead",
    "split-diagonal",
  ]
  const FULL_CHAPTER = [
    "masthead-chapter",
    "constellation-chapter",
    "rail-chapter",
    "banner-chapter",
    "poster-chapter",
    "roman-chapter",
    "tone-adaptive-chapter",
    "fashion-chapter",
  ]
  const FULL_CONTENT = [
    "narrow-column",
    "two-column",
    "rail-numbered",
    "banner-heading",
    "stacked-poster",
    "bento-panel",
    "tone-adaptive-content",
    // P1 variety wave, task 4: content pool 7 -> 10.
    "side-highlight",
    "asymmetric-triptych",
    "quiet-frame",
  ]
  const FULL_ENDING = [
    "masthead-ending",
    "constellation-ending",
    "rail-ending",
    "banner-ending",
    "poster-ending",
    "tone-adaptive-ending",
    "fashion-ending",
  ]
  it("W4 全集放开基线 + post-v0.3 W8 fix round：十三主题四页型全部为各页型全集，无任何例外残留", () => {
    expect(THEME_DEFINITIONS.consulting.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.consulting.motif).toBe("banner-motif")

    expect(THEME_DEFINITIONS.insight.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.insight.motif).toBe("poster-motif")

    expect(THEME_DEFINITIONS.academic.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.academic.motif).toBe("rail-motif")

    expect(THEME_DEFINITIONS.tech.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.tech.motif).toBe("constellation-motif")

    // runway：唯一留空 motif 的主题（排印至上的终审裁决，见 definitions.ts 注释）。
    expect(THEME_DEFINITIONS.runway.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.runway.motif).toBeUndefined()

    expect(THEME_DEFINITIONS.journal.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.journal.motif).toBe("corner-ornament-motif")

    expect(THEME_DEFINITIONS.enterprise.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.enterprise.motif).toBe("enterprise-motif")

    expect(THEME_DEFINITIONS.luxe.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.luxe.motif).toBe("luxe-motif")

    expect(THEME_DEFINITIONS.campaign.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.campaign.motif).toBe("campaign-motif")

    // classroom：W4 fix round 曾排除 fashion-chapter，post-v0.3 W8 fix round
    // 随 readableOn 根因修复撤销（backlog item 2）——现为纯 FULL_CHAPTER。
    expect(THEME_DEFINITIONS.classroom.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.classroom.motif).toBe("classroom-motif")

    // bloom：同上，chapter 排除已撤销。
    expect(THEME_DEFINITIONS.bloom.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.bloom.motif).toBe("bloom-motif")

    expect(THEME_DEFINITIONS.ink.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.ink.motif).toBe("ink-motif")

    // heritage：同上，chapter 排除已撤销。
    expect(THEME_DEFINITIONS.heritage.layouts).toEqual({
      cover: FULL_COVER,
      chapter: FULL_CHAPTER,
      content: FULL_CONTENT,
      ending: FULL_ENDING,
    })
    expect(THEME_DEFINITIONS.heritage.motif).toBe("heritage-motif")
  })

  it("未知 id 经 resolveThemeId 回落 consulting 的主题定义（含 layouts/motif），原 manifest 取值函数回落断言迁移", () => {
    expect(THEME_DEFINITIONS[resolveThemeId("nonexistent-theme")]).toBe(THEME_DEFINITIONS.consulting)
  })
})

describe("resolveBrand", () => {
  it("returns the style default when no override", () => {
    expect(resolveBrand("ink")).toEqual({ suppressFooterRule: true })
  })
  it("merges IR-level override over the default", () => {
    expect(resolveBrand("ink", { suppressFooterRule: false })).toEqual({ suppressFooterRule: false })
  })
  it("falls back to consulting for unknown ids", () => {
    expect(resolveBrand("nope")).toEqual({})
  })
})

// ── registerTheme (W3 task 4: theme registration seam) ──────────────────

/** A structurally valid `ThemeRegistration` fixture — real LAYOUT_REGISTRY
 *  ids (one archetype per slide type, each already applicable to that type
 *  per registry.ts), a minimal-but-complete StyleTokens. `overrides` lets
 *  each test tweak just the field it's exercising, including setting
 *  `layouts` to `undefined` or a partial slide-type subset (W4: `layouts`
 *  and each of its four entries are independently optional on the
 *  registration input — see {@link ThemeRegistration}'s own doc comment). */
function testTheme(overrides: Partial<ThemeRegistration> = {}): ThemeRegistration {
  return {
    id: "acme",
    style: {
      id: "acme",
      colors: {
        bg: "#FFFFFF",
        surface: "#F0F0F0",
        primary: "#112233",
        accent: "#AA00FF",
        text: "#000000",
        muted: "#888888",
        chartPalette: ["#112233", "#AA00FF"],
      },
      fonts: { heading: ["Arial"], body: ["Arial"] },
      defaultBackgrounds: {
        cover: { kind: "color", value: "#FFFFFF" },
        chapter: { kind: "color", value: "#FFFFFF" },
        content: { kind: "color", value: "#FFFFFF" },
        ending: { kind: "color", value: "#FFFFFF" },
      },
    },
    brand: {},
    tags: [],
    layouts: {
      cover: ["poster-center"],
      chapter: ["banner-chapter"],
      content: ["two-column"],
      ending: ["banner-ending"],
    },
    ...overrides,
  }
}

describe("registerTheme", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  it("registers a theme, visible to getThemeDefinition and getInstalledThemeIds", () => {
    registerTheme(testTheme())
    expect(getInstalledThemeIds()).toContain("acme")
    expect(getThemeDefinition("acme").layouts.cover).toEqual(["poster-center"])
  })

  it("rejects a duplicate builtin id", () => {
    expect(() => registerTheme(testTheme({ id: "consulting" }))).toThrow(
      /theme "consulting" is already installed/,
    )
  })

  it("rejects a duplicate already-registered id", () => {
    registerTheme(testTheme())
    expect(() => registerTheme(testTheme())).toThrow(/theme "acme" is already installed/)
  })

  it("rejects an unregistered layout id, naming the bad id", () => {
    expect(() =>
      registerTheme(
        testTheme({
          layouts: {
            cover: ["not-a-real-layout"],
            chapter: ["banner-chapter"],
            content: ["two-column"],
            ending: ["banner-ending"],
          },
        }),
      ),
    ).toThrow(/not-a-real-layout/)
  })

  it("rejects a layout id that exists but does not apply to the slide type", () => {
    expect(() =>
      registerTheme(
        // "two-column" is a content-only archetype (registry.ts) — invalid under `cover`.
        testTheme({
          layouts: {
            cover: ["two-column"],
            chapter: ["banner-chapter"],
            content: ["two-column"],
            ending: ["banner-ending"],
          },
        }),
      ),
    ).toThrow(/layout "two-column" is not valid for "cover" slides/)
  })

  it("rejects a takeover layout id in a curated set (auto-selection assumes archetypes — render would crash)", () => {
    // image-split is kind "takeover" with slideTypes ["content"] — slide-type
    // matching alone would let it through, the kind check must stop it.
    expect(() =>
      registerTheme(
        testTheme({
          layouts: {
            cover: ["poster-center"],
            chapter: ["banner-chapter"],
            content: ["image-split"],
            ending: ["banner-ending"],
          },
        }),
      ),
    ).toThrow(/"image-split" is a takeover layout — curated sets may only contain archetype layouts/)
  })

  it("rejects a theme missing layout coverage for one of the four slide types", () => {
    expect(() =>
      registerTheme(
        testTheme({
          layouts: {
            cover: ["poster-center"],
            chapter: [],
            content: ["two-column"],
            ending: ["banner-ending"],
          },
        }),
      ),
    ).toThrow(/chapter/)
  })

  it("rejects a theme with no style tokens", () => {
    expect(() =>
      registerTheme(testTheme({ style: undefined as unknown as ThemeDefinition["style"] })),
    ).toThrow(/missing style tokens/)
  })

  // ── W4: layouts (and each of its four slide-type entries) is optional,
  // defaulting to the full registered-archetype set (spec §3 "缺省 = 全集")
  // ──────────────────────────────────────────────────────────────────────

  it("omitting layouts entirely defaults every slide type to its full registered-archetype set", () => {
    registerTheme(testTheme({ layouts: undefined }))
    const def = getThemeDefinition("acme")
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      const expected = layoutsForSlideType(slideType)
        .filter((l) => l.kind === "archetype")
        .map((l) => l.id)
      expect(def.layouts[slideType]).toEqual(expected)
    }
  })

  it("curating only one slide type leaves the other three at their full-set default (explicit narrowing coexists with the new default)", () => {
    registerTheme(testTheme({ layouts: { content: ["two-column", "narrow-column"] } }))
    const def = getThemeDefinition("acme")
    expect(def.layouts.content).toEqual(["two-column", "narrow-column"])
    for (const slideType of ["cover", "chapter", "ending"] as const) {
      const expected = layoutsForSlideType(slideType)
        .filter((l) => l.kind === "archetype")
        .map((l) => l.id)
      expect(def.layouts[slideType]).toEqual(expected)
    }
  })

  it("an explicit exclusion inside a curated slide type still narrows the pool (the same full-set-minus-one pattern the 3 built-in exceptions use)", () => {
    const fullContent = layoutsForSlideType("content")
      .filter((l) => l.kind === "archetype")
      .map((l) => l.id)
    registerTheme(testTheme({ layouts: { content: fullContent.filter((id) => id !== "banner-heading") } }))
    const def = getThemeDefinition("acme")
    expect(def.layouts.content).not.toContain("banner-heading")
    expect(def.layouts.content).toHaveLength(fullContent.length - 1)
  })

  it("an explicit empty array for a slide type is still rejected — the full-set default only kicks in when the key is omitted, never for a caller-supplied []", () => {
    expect(() => registerTheme(testTheme({ layouts: { content: [] } }))).toThrow(
      /must declare at least one layout for "content" slides/,
    )
  })
})

describe("getInstalledThemeIds", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  it("starts as exactly the 13 builtins", () => {
    expect(getInstalledThemeIds()).toEqual(CANONICAL_THEME_IDS)
  })

  it("stable order: builtins first, then registration order", () => {
    registerTheme(testTheme({ id: "zzz-first" }))
    registerTheme(testTheme({ id: "aaa-second" }))
    const ids = getInstalledThemeIds()
    expect(ids.slice(0, CANONICAL_THEME_IDS.length)).toEqual(CANONICAL_THEME_IDS)
    expect(ids.slice(CANONICAL_THEME_IDS.length)).toEqual(["zzz-first", "aaa-second"])
  })
})

describe("getThemeDefinition", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  it("returns the registered definition for a registered id", () => {
    registerTheme(testTheme())
    expect(getThemeDefinition("acme")).toEqual(testTheme())
  })

  it("still falls back to consulting for an unknown id (registered or not)", () => {
    registerTheme(testTheme())
    expect(getThemeDefinition("still-unknown")).toBe(THEME_DEFINITIONS.consulting)
  })

  it("matches THEME_DEFINITIONS for a builtin id", () => {
    expect(getThemeDefinition("tech")).toBe(THEME_DEFINITIONS.tech)
  })
})
