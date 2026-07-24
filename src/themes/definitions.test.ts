import { afterEach, describe, expect, it, vi } from "vitest"
import { CANONICAL_THEME_IDS, THEME_STYLES, resolveThemeId } from "./index"
import {
  __resetRegisteredThemes,
  assertContrastFloor,
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
import { MOTIF_ARCHETYPES } from "../svg/motifs"
import { layoutsForSlideType } from "../svg/layouts/registry"
import { hasExactWidthTable, resolveFontFace } from "../svg/fonts"

// 四页型注册表按 id 分发用的宽字符串索引视图（PAGE_ARCHETYPE_REGISTRIES 在
// full-slide-svg.tsx 用的同一模式）：THEME_DEFINITIONS.layouts 的 id 是通用
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

  // ── registerTheme: colors.text/colors.muted contrast floor (backlog-sweep
  // task I2). Registration-time floor, not the 4.5:1 body-text bar
  // `full-matrix-contrast.test.ts`'s `colors.muted contrast` suite enforces —
  // see `assertContrastFloor`'s own doc comment in `./definitions` for the
  // 3.0 rationale. `testTheme()`'s own fixture (`text` #000000, `muted`
  // #888888, all-white `defaultBackgrounds`) clears 3.0 comfortably (21:1 /
  // ~3.55:1) so every *other* `registerTheme` test above stays green
  // unaffected by this check.
  it("does not throw when colors.text/colors.muted clear the 3.0 floor against every slide type's background", () => {
    expect(() => registerTheme(testTheme({ id: "acme-contrast-ok" }))).not.toThrow()
  })

  it("rejects colors.text below the 3.0 contrast floor against a slide type's resolved default background, naming the token/slideType/ratio/threshold", () => {
    const base = testTheme({ id: "acme-low-text-contrast" })
    expect(() =>
      registerTheme({
        ...base,
        // near-white text on the fixture's white "cover" background -> ~1.09:1.
        style: { ...base.style, colors: { ...base.style.colors, text: "#F5F5F5" } },
      }),
    ).toThrow(/colors\.text.*1\.\d\d:1.*"cover".*3\.0:1/)
  })

  it("rejects colors.muted below the 3.0 contrast floor", () => {
    const base = testTheme({ id: "acme-low-muted-contrast" })
    expect(() =>
      registerTheme({
        ...base,
        style: { ...base.style, colors: { ...base.style.colors, muted: "#FAFAFA" } },
      }),
    ).toThrow(/colors\.muted/)
  })

  it("checks content and ending too, not just cover", () => {
    const base = testTheme({ id: "acme-ending-bad" })
    expect(() =>
      registerTheme({
        ...base,
        style: {
          ...base.style,
          // Only "ending" is a bad background (black, same as the fixture's
          // own black `colors.text` -> 1:1) — cover/chapter/content stay the
          // fixture's white, which clears the floor.
          defaultBackgrounds: {
            cover: { kind: "color", value: "#FFFFFF" },
            chapter: { kind: "color", value: "#FFFFFF" },
            content: { kind: "color", value: "#FFFFFF" },
            ending: { kind: "color", value: "#000000" },
          },
        },
      }),
    ).toThrow(/colors\.text.*"ending"/)
  })

  // Verified red-then-green during implementation: a first draft checked all
  // four slide types (matching the task brief's literal text) and a probe
  // against the 13 real builtins immediately found academic/classroom/
  // consulting's `colors.text`/`colors.muted` measuring as low as 1.00:1
  // against their own `chapter` background — not a bug in those themes
  // (nothing ever renders that raw pairing, see the next test and
  // `assertContrastFloor`'s own doc comment), but a false positive in the
  // check itself. This test locks the fix: `chapter` is deliberately
  // excluded, mirroring `full-matrix-contrast.test.ts`'s `colors.muted
  // contrast` suite's own precedent for the identical reason.
  it("deliberately excludes chapter from the check — a bad chapter background alone does not throw", () => {
    const base = testTheme({ id: "acme-chapter-bad-bg-is-fine" })
    expect(() =>
      registerTheme({
        ...base,
        style: {
          ...base.style,
          // "chapter" alone is bad (black, 1:1 against the fixture's own
          // black colors.text) — cover/content/ending stay white, so if
          // chapter were checked this would throw; it must not.
          defaultBackgrounds: {
            cover: { kind: "color", value: "#FFFFFF" },
            chapter: { kind: "color", value: "#000000" },
            content: { kind: "color", value: "#FFFFFF" },
            ending: { kind: "color", value: "#FFFFFF" },
          },
        },
      }),
    ).not.toThrow()
  })
})

// ── registerTheme: unmeasured-font-width console.warn (backlog-sweep task
// I2). First console.warn precedent in the codebase (repo-wide grep found
// zero prior production `console.warn` call sites) — plain, no new warning-
// channel abstraction, per the task's own adjudicated rationale.
describe("registerTheme: unmeasured-font-width console.warn", () => {
  afterEach(() => {
    __resetRegisteredThemes()
  })

  it("warns for a heading face with no exact width table (SimSun) and stays silent for a body face that has one (Georgia)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const base = testTheme({ id: "acme-warn-heading-only" })
    registerTheme({ ...base, style: { ...base.style, fonts: { heading: ["SimSun"], body: ["Georgia"] } } })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const message = warnSpy.mock.calls[0]?.[0]
    expect(message).toMatch(/acme-warn-heading-only/)
    expect(message).toMatch(/heading/)
    expect(message).toMatch(/SimSun/)
    expect(message).toMatch(/no exact width table/)
    expect(message).toMatch(/class-average envelope/)
    warnSpy.mockRestore()
  })

  it("warns twice — once per role — when both heading and body resolve to faces without an exact width table", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const base = testTheme({ id: "acme-warn-both" })
    registerTheme({ ...base, style: { ...base.style, fonts: { heading: ["SimSun"], body: ["KaiTi"] } } })
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/heading/)
    expect(warnSpy.mock.calls[1]?.[0]).toMatch(/body/)
    warnSpy.mockRestore()
  })

  it("stays silent when both heading and body resolve to faces with an exact width table (Georgia/Microsoft YaHei)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const base = testTheme({ id: "acme-no-warn" })
    registerTheme({ ...base, style: { ...base.style, fonts: { heading: ["Georgia"], body: ["Microsoft YaHei"] } } })
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("never warns for a registration that ultimately throws (e.g. a bad layout id) — warnings only fire once a registration will actually succeed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const base = testTheme({ id: "acme-throws-before-warn" })
    expect(() =>
      registerTheme({
        ...base,
        style: { ...base.style, fonts: { heading: ["SimSun"], body: ["SimSun"] } },
        layouts: { ...base.layouts, cover: ["not-a-real-layout"] },
      }),
    ).toThrow(/not-a-real-layout/)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // Hostile-review finding (backlog-sweep task I2 self-review): 4 of the 13
  // builtins (bloom/ink/journal/runway) resolve their *heading* font to
  // SimSun or KaiTi — real, deliberate CJK-serif design choices (see each
  // theme file's own inline comment — SimSun/KaiTi are the only CJK serif
  // entries in `SAFE_FONTS`) that have no exact width table. Every builtin's
  // *body* font resolves to Microsoft YaHei, which does. If any of this ever
  // reached `console.warn`, it would fire on every single consumer's very
  // first render — but it structurally cannot: builtins never call
  // `registerTheme` (`THEME_DEFINITIONS` is built directly from
  // `THEME_STYLES`, see the `assertContrastFloor` describe block's own
  // comment above for the full argument). This test locks both halves of
  // that claim so a future change that either (a) alters which builtins
  // resolve to a non-exact face, or (b) starts routing builtins through
  // `registerTheme`, fails loudly here instead of silently starting to spam
  // every consumer.
  it("regression: bloom/ink/journal/runway's heading has no exact table, every builtin's body does — but builtins never call registerTheme, so this never reaches console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const nonExactHeadingBuiltins = new Set(["bloom", "ink", "journal", "runway"])
    for (const id of CANONICAL_THEME_IDS) {
      const style = THEME_DEFINITIONS[id].style
      const headingFace = resolveFontFace(style.fonts.heading, "heading")
      const bodyFace = resolveFontFace(style.fonts.body, "body")
      expect(hasExactWidthTable(bodyFace), `${id} body face "${bodyFace}"`).toBe(true)
      expect(hasExactWidthTable(headingFace), `${id} heading face "${headingFace}"`).toBe(
        !nonExactHeadingBuiltins.has(id),
      )
    }
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("assertContrastFloor", () => {
  // Scoping decision (backlog-sweep task I2, confirmed by reading the
  // source): the 13 builtins do NOT go through `registerTheme` —
  // `THEME_DEFINITIONS` is built directly from `THEME_STYLES`
  // (`Object.fromEntries(CANONICAL_THEME_IDS.map(...))` in `./definitions`),
  // and `registered-themes.ts`'s own docstring explains this is load-bearing
  // (a `THEME_DEFINITIONS`/`registerTheme` cycle would crash at module-eval
  // with a TDZ error). A repo-wide grep for `registerTheme(` confirms zero
  // production call sites outside its own declaration — every call site is
  // this file (or a sibling test) registering a synthetic test theme, never
  // one of the 13 canonical ids. So `registerTheme`'s new contrast check
  // never actually runs against a builtin; this test sweeps all 13 directly
  // through the underlying validation function instead, per the task brief's
  // own scoping fallback for exactly this case.
  it("all 13 canonical themes clear the 3.0 floor for colors.text and colors.muted on every slide type", () => {
    for (const id of CANONICAL_THEME_IDS) {
      expect(() => assertContrastFloor(id, THEME_DEFINITIONS[id].style)).not.toThrow()
    }
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
