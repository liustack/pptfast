// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { BentoPanelContent } from "./content-bento-panel"
import type { Component, PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function para(text: string): Component {
  // bento 中"有壳普通块"的代表——paragraph 已去框（passthrough，见
  // PASSTHROUGH_SHELL_TYPES），改用 bullets（仍走 bento shell），同
  // templates/tech.test.tsx 的先例。
  return { type: "bullets", items: [text], style: "default" }
}

/**
 * Whether `r` is one of bento's own outline-card shells, as opposed to some
 * other element that happens to share one or two of its attributes (e.g.
 * callout's own card also sets fill=surface; flowchart's own node
 * boxes/diamonds set fill=surface + stroke={colors.primary}, and
 * primary===accent in bento's single-accent palette). content-bento-panel.tsx
 * stamps its own shell rects with an explicit `data-bento-shell` marker, so
 * this checks that marker directly (see templates/tech.test.tsx's original
 * doc comment for the fuller disambiguation history).
 */
function isBentoOutlineShell(r: Element): boolean {
  return r.getAttribute("data-bento-shell") === "true"
}

// "Bento 拼盘"：kpi_cards（2 item）+ icon_cards（2 item）混排——explodeIntoUnits
// 把两个块各自炸成独立单元，4 个单元落进 4-cell 网格档（不是 2 个块 = 2 个格）。
const kpiComponent: Component = {
  type: "kpi_cards",
  items: [
    { value: "128", unit: "ms", label: "P99 延迟", delta: "down" },
    { value: "99.95", unit: "%", label: "可用率" },
  ],
}
const iconCardsComponent: Component = {
  type: "icon_cards",
  items: [
    { icon: "rocket", title: "增长优先", text: "以最快速度验证市场假设" },
    { icon: "shield", title: "安全合规", text: "数据全链路加密与审计留痕" },
  ],
}
const bentoSlide: Slide = {
  type: "content",
  heading: "架构拼盘",
  subheading: "**核心指标**一屏可见",
  footnote: "数据来源：监控平台",
  components: [kpiComponent, iconCardsComponent],
} as Slide

// 单个孤立 KPI 项：走 onlyUnit 的居中小卡退化路径（SINGLE_KPI_CARD_W/H），
// 而非满 rect 空壳大卡。
const soloKpiSlide: Slide = {
  type: "content",
  heading: "单指标",
  components: [{ type: "kpi_cards", items: [{ value: "88", label: "达成率" }] }],
} as Slide

// Captured once from the (now-retired) legacy `BentoTechContent` — locks the
// byte-identical output the port preserved, without importing templates/.
const BENTO_SLIDE_TECH_MARKUP =
  '<text x="96" y="150" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="44" font-weight="700" fill="#F2F6FA" dominant-baseline="alphabetic">架构拼盘</text><text x="96" y="192" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#2DD4E6" dominant-baseline="alphabetic"><tspan fill="#F2F6FA" font-weight="700">核心指标</tspan><tspan fill="#2DD4E6">一屏可见</tspan></text><g data-audit-rect="96,232,1088,408"><g data-audit-box="96,232,643.1999999999999" data-audit-rect="96,232,643.1999999999999,196"><rect data-bento-shell="true" x="96" y="232" width="643.1999999999999" height="196" rx="6" fill="#0A101C" stroke="#2DD4E6" stroke-opacity="0.3" stroke-width="1"></rect><text x="116" y="356" font-size="72" font-weight="bold" fill="#2DD4E6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">128<tspan font-size="32" fill="#8A94A6">ms</tspan></text><circle cx="284.8" cy="302" r="3" fill="#2DD4E6"></circle><circle cx="284.8" cy="302" r="9" fill="none" stroke="#2DD4E6" stroke-opacity="0.18" stroke-width="1"></circle><circle cx="284.8" cy="302" r="14" fill="none" stroke="#2DD4E6" stroke-opacity="0.07" stroke-width="1"></circle><text x="719.1999999999999" y="300" text-anchor="end" font-size="16" fill="#DC2626" dominant-baseline="alphabetic">↓</text><text x="116" y="384" font-size="16" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">P99 延迟</text></g><g data-audit-box="755.1999999999999,232,428.8" data-audit-rect="755.1999999999999,232,428.8,196"><rect data-bento-shell="true" x="755.1999999999999" y="232" width="428.8" height="196" rx="6" fill="#0A101C" stroke="#2DD4E6" stroke-opacity="0.3" stroke-width="1"></rect><g transform="translate(775.1999999999999,283) scale(1.25)"><path stroke="#2DD4E6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path><path stroke="#2DD4E6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"></path><path stroke="#2DD4E6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"></path><path stroke="#2DD4E6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"></path></g><text x="775.1999999999999" y="347" font-size="22" font-weight="600" fill="#F2F6FA" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">增长优先</text><text x="775.1999999999999" y="379" font-size="15" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">以最快速度验证市场假设</text></g><g data-audit-box="96,444,428.8" data-audit-rect="96,444,428.8,196"><rect data-bento-shell="true" x="96" y="444" width="428.8" height="196" rx="6" fill="#0A101C" stroke="#2DD4E6" stroke-opacity="0.3" stroke-width="1"></rect><g transform="translate(116,495) scale(1.25)"><path stroke="#2DD4E6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></g><text x="116" y="559" font-size="22" font-weight="600" fill="#F2F6FA" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">安全合规</text><text x="116" y="591" font-size="15" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">数据全链路加密与审计留痕</text></g><g data-audit-box="540.8,444,643.1999999999999" data-audit-rect="540.8,444,643.1999999999999,196"><rect data-bento-shell="true" x="540.8" y="444" width="643.1999999999999" height="196" rx="6" fill="#0A101C" stroke="#2DD4E6" stroke-opacity="0.3" stroke-width="1"></rect><text x="560.8" y="568" font-size="72" font-weight="bold" fill="#2DD4E6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">99.95<tspan font-size="32" fill="#8A94A6">%</tspan></text><circle cx="781.92" cy="514" r="3" fill="#2DD4E6"></circle><circle cx="781.92" cy="514" r="9" fill="none" stroke="#2DD4E6" stroke-opacity="0.18" stroke-width="1"></circle><circle cx="781.92" cy="514" r="14" fill="none" stroke="#2DD4E6" stroke-opacity="0.07" stroke-width="1"></circle><text x="560.8" y="596" font-size="16" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">可用率</text></g></g><text x="96" y="652" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#8A94A6" font-style="italic" dominant-baseline="alphabetic">数据来源：监控平台</text>'
const SOLO_KPI_TECH_MARKUP =
  '<text x="96" y="150" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="44" font-weight="700" fill="#F2F6FA" dominant-baseline="alphabetic">单指标</text><g data-audit-box="440,333,400" data-audit-rect="440,333,400,160"><rect data-bento-shell="true" x="440" y="333" width="400" height="160" rx="6" fill="#0A101C" stroke="#2DD4E6" stroke-opacity="0.3" stroke-width="1"></rect><text x="460" y="434" font-size="56" font-weight="bold" fill="#2DD4E6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">88</text><circle cx="534.72" cy="392" r="3" fill="#2DD4E6"></circle><circle cx="534.72" cy="392" r="7" fill="none" stroke="#2DD4E6" stroke-opacity="0.18" stroke-width="1"></circle><circle cx="534.72" cy="392" r="11" fill="none" stroke="#2DD4E6" stroke-opacity="0.07" stroke-width="1"></circle><text x="460" y="456" font-size="16" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">达成率</text></g>'
// W4 task 3 re-pin: balanced delivery's 24px body baseline (was a fixed
// 20px) makes each demo item taller, so the SvgContent single-stack
// fallback (see the test below) now only fits 6 of the 7 items instead of
// 7 — the 7th drops via SvgContent's own pre-existing overflow-marker path
// ("+1 项未展示", already covered independently by SvgContent.test.tsx's
// "renders a dropped-count marker when components overflow the rect").
// This is a capacity-number shift caused by the font-size default change,
// not a behavior change in the drop/marker mechanism itself.
const OVERFLOW_TECH_MARKUP =
  '<text x="96" y="150" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="44" font-weight="700" fill="#F2F6FA" dominant-baseline="alphabetic">七项要点</text><g data-audit-rect="96,186,1088,454"><g data-audit-box="96,186,1088"><g transform="translate(96,186)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 0</text></g></g><g data-audit-box="96,252,1088"><g transform="translate(96,252)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 1</text></g></g><g data-audit-box="96,318,1088"><g transform="translate(96,318)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 2</text></g></g><g data-audit-box="96,384,1088"><g transform="translate(96,384)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 3</text></g></g><g data-audit-box="96,450,1088"><g transform="translate(96,450)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 4</text></g></g><g data-audit-box="96,516,1088"><g transform="translate(96,516)"><circle cx="5" cy="18.8" r="3" fill="#2DD4E6"></circle><text x="26" y="26" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="24" fill="#F2F6FA" dominant-baseline="alphabetic">要点 5</text></g></g><text x="1184" y="634" text-anchor="end" font-size="14" fill="#8A94A6" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" dominant-baseline="alphabetic">+1 项未展示</text></g>'

describe("BentoPanelContent", () => {
  it("tech tokens 下与旧 BentoTechContent 输出逐字节一致（档位一——kpi_cards+icon_cards 混排拼盘，4-cell 网格）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", [bentoSlide])

    const next = renderSvgMarkup(
      <BentoPanelContent ir={deck} slide={bentoSlide} index={0} ctx={ctx} />,
    )
    expect(next).toBe(BENTO_SLIDE_TECH_MARKUP)

    const root = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <BentoPanelContent ir={deck} slide={bentoSlide} index={0} ctx={ctx} />
        </svg>,
      ),
    )
    // 2 个 kpi item + 2 个 icon-card item = 4 个 bento 单元（不是 2 个块 = 2 格）。
    expect(root.querySelectorAll("[data-audit-box]")).toHaveLength(4)
    for (const item of kpiComponent.items) expect(next).toContain(item.value)
    for (const item of iconCardsComponent.items) {
      expect(next).toContain(item.title)
      expect(next).toContain(item.text)
    }
    expect(next).toContain("架构拼盘")
    expect(next).toContain("数据来源：监控平台")
  })

  it("tech tokens 下单个孤立 KPI 项与旧模板逐字节一致——居中小卡退化路径（非满 rect 空壳）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech", [soloKpiSlide])

    const next = renderSvgMarkup(
      <BentoPanelContent ir={deck} slide={soloKpiSlide} index={0} ctx={ctx} />,
    )
    expect(next).toBe(SOLO_KPI_TECH_MARKUP)

    const root = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <BentoPanelContent ir={deck} slide={soloKpiSlide} index={0} ctx={ctx} />
        </svg>,
      ),
    )
    const shell = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("data-bento-shell") === "true",
    )!
    expect(shell.getAttribute("width")).toBe("400") // SINGLE_KPI_CARD_W
    expect(shell.getAttribute("height")).toBe("160") // SINGLE_KPI_CARD_H
    expect(next).toContain("88")
  })

  it(">6 单元时降级为 SvgContent 单栈布局，与旧模板逐字节一致（bento 网格上限）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const overflowComponents: Component[] = Array.from({ length: 7 }, (_, i) => ({
      type: "bullets" as const,
      items: [`要点 ${i}`],
      style: "default" as const,
    }))
    const overflowSlide: Slide = {
      type: "content",
      heading: "七项要点",
      components: overflowComponents,
    } as Slide
    const deck = ir("tech", [overflowSlide])

    const next = renderSvgMarkup(
      <BentoPanelContent ir={deck} slide={overflowSlide} index={0} ctx={ctx} />,
    )
    expect(next).toBe(OVERFLOW_TECH_MARKUP)
    // 降级路径不画 bento 卡壳（无 data-bento-shell）。
    expect(next).not.toContain("data-bento-shell")
    // W4 task 3 re-pin: at the 24px balanced baseline the single-stack
    // fallback only fits 6 of the 7 demo items — item 6 drops via
    // SvgContent's own overflow-marker path (see OVERFLOW_TECH_MARKUP's own
    // comment above).
    for (let i = 0; i < 6; i++) expect(next).toContain(`要点 ${i}`)
    expect(next).not.toContain("要点 6")
    expect(next).toContain("+1 项未展示")
  })

  it("consulting tokens 下用 consulting 自己的 surface/accent/text/muted（证明 token 化成立），tech 烤死色不残留", () => {
    const consultingTheme = resolveStyle("consulting")
    const ctx = buildCtx(consultingTheme, {})
    const deck = ir("consulting", [bentoSlide])
    const out = renderSvgMarkup(
      <BentoPanelContent ir={deck} slide={bentoSlide} index={0} ctx={ctx} />,
    )

    expect(out).toContain(ctx.colors.surface as string) // bento 卡壳 fill
    expect(out).toContain(ctx.colors.accent as string) // 卡壳描边 + KPI 数值
    expect(out).toContain(ctx.colors.text as string)
    expect(out).toContain(ctx.colors.muted as string)

    // tech 自己的电光青烤死色不得残留（本函数体内本无烤死色字面量，这里是
    // 回归锁：确认没有意外把 tech 的 accent 当字面量写死）。
    expect(out).not.toContain("#2DD4E6")
    expect(out).not.toContain("#0A101C") // tech surface
    expect(out).not.toContain("#060A13") // tech bg

    expect(out).toContain("架构拼盘")
  })

  // ── 以下为从 templates/tech.test.tsx 回填的 Content/bento 场景覆盖 ──

  it("passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const slide: Slide = {
      type: "content",
      heading: "四大支柱",
      components: [para("一"), para("二"), para("三"), para("四")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("4 components 精确产出 4 个 data-audit-box 卡片，每张都是细描边卡（fill=surface, stroke=accent@0.3, rx=6），无角标", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const slide: Slide = {
      type: "content",
      heading: "四大支柱",
      components: [para("一"), para("二"), para("三"), para("四")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)

    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(4)

    // 卡片圆角/描边治理：全部 rx=6 outline 处理，不存在旧版 3px 高角标条。
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)

    const shells = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(shells).toHaveLength(4)
    shells.forEach((shell) => {
      expect(shell.getAttribute("fill")).toBe(ctx.colors.surface)
      expect(shell.getAttribute("stroke")).toBe(ctx.colors.accent)
      expect(shell.getAttribute("stroke-opacity")).toBe("0.3")
      expect(shell.getAttribute("stroke-width")).toBe("1")
      expect(shell.getAttribute("rx")).toBe("6")
    })
  })

  it("explodes a 4-item kpi_cards component into 4 individual bento cards, each showing its own value", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent4: Component = {
      type: "kpi_cards",
      items: [
        { value: "128", unit: "%", label: "同比增长", delta: "up" },
        { value: "42", label: "新增客户", delta: "flat" },
        { value: "3.2", unit: "s", label: "平均响应时长", delta: "down" },
        { value: "99.9", unit: "%", label: "服务可用性" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "核心指标",
      components: [kpiComponent4],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // One kpi_cards component with 4 items still yields 4 bento cards (not 1
    // card containing a 4-up row, as kpi.tsx's own layout would produce).
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(4)
    for (const item of kpiComponent4.items) {
      expect(markup).toContain(item.value)
      expect(markup).toContain(item.label)
    }
    expect(markup).toContain(`fill="${ctx.colors.surface}"`)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)
  })

  it("explodes a 3-item icon_cards component into 3 individual bento cards, each showing icon/title/text at 22px bold titles", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const iconCardsComponent3: Component = {
      type: "icon_cards",
      items: [
        { icon: "rocket", title: "增长优先", text: "以最快速度验证市场假设" },
        { icon: "server", title: "稳定可靠", text: "核心链路 SLA 99.9% 以上" },
        { icon: "shield", title: "安全合规", text: "数据全链路加密与审计留痕" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "三大原则",
      components: [iconCardsComponent3],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // One icon_cards component with 3 items yields 3 bento cards (not 1 card
    // containing a 3-up row, as icon-cards.tsx's own standalone layout
    // would produce).
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(3)
    for (const item of iconCardsComponent3.items) {
      expect(markup).toContain(item.title)
      expect(markup).toContain(item.text)
    }
    expect(markup).toContain(`fill="${ctx.colors.surface}"`)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)

    // Bento's icon-card title is 22px/font-weight 600 (bento-only bump; the
    // shared components/icon-cards.tsx row layout keeps 20px for other themes).
    const titles = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600",
    )
    expect(titles).toHaveLength(3)
    titles.forEach((title) => {
      expect(title.getAttribute("font-size")).toBe("22")
    })
  })

  it("keeps a steps component as one whole bento cell, not exploded into per-item cards", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const stepsComponent: Component = {
      type: "steps",
      items: [
        { title: "步骤一", text: "说明一" },
        { title: "步骤二", text: "说明二" },
        { title: "步骤三", text: "说明三" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "操作流程",
      components: [stepsComponent, para("补充说明")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // steps component (3 items) + 1 paragraph = 2 units → the 2-unit grid tier,
    // NOT 4 units (which explodeIntoUnits would produce if steps were
    // exploded like kpi_cards/icon_cards).
    const cells = root.querySelectorAll("[data-audit-box][data-audit-rect]")
    expect(cells.length).toBe(2)
    for (const item of stepsComponent.items) {
      expect(markup).toContain(item.title)
      expect(markup).toContain(item.text)
    }
    // Double-shell governance: steps already draws its own chrome, so its
    // cell skips bento's own outline shell entirely — only the paragraph
    // cell gets one.
    const bentoShells = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(bentoShells).toHaveLength(1)
  })

  const flowchartComponent: Component = {
    type: "flowchart",
    nodes: [
      { id: "a", label: "开始", kind: "round" },
      { id: "b", label: "处理", kind: "rect" },
      { id: "c", label: "判断", kind: "diamond" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
    direction: "TB",
  }
  const architectureComponent: Component = {
    type: "architecture",
    layers: [
      { title: "展现层", items: ["React"] },
      { title: "逻辑层", items: ["Zustand"] },
    ],
  }
  const timelineComponent: Component = {
    type: "timeline",
    milestones: [
      { date: "2024-01", title: "启动" },
      { date: "2024-06", title: "上线" },
    ],
  }

  it.each([
    ["flowchart", flowchartComponent, "处理"],
    ["architecture", architectureComponent, "展现层"],
    ["timeline", timelineComponent, "启动"],
  ] as const)(
    "renders a %s component bare in the grid (double-shell governance) — no outline shell, own chrome intact",
    (_label, component, expectedText) => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const paragraphComponent: Component = para("普通块仍然有卡壳")
      const slide: Slide = {
        type: "content",
        heading: "双壳治理",
        components: [component, paragraphComponent],
      } as Slide
      const doc = ir("tech", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      expect(() => assertSubset(root)).not.toThrow()

      // 2 units (the diagram component + 1 paragraph) → 2 bento cells, both
      // still carrying the grid box/audit annotations.
      const cells = root.querySelectorAll("[data-audit-box][data-audit-rect]")
      expect(cells.length).toBe(2)

      // Only the paragraph cell gets bento's own outline shell.
      const bentoShells = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
      expect(bentoShells).toHaveLength(1)

      const stripes = Array.from(root.querySelectorAll("rect")).filter(
        (r) => r.getAttribute("height") === "3",
      )
      expect(stripes).toHaveLength(0)

      // The diagram's own content still renders — un-shelled, not hidden.
      expect(markup).toContain(expectedText)
    },
  )

  it("keeps each exploded KPI card's label baseline >=30px below its value baseline (no label/value overlap)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent4: Component = {
      type: "kpi_cards",
      items: [
        { value: "99.95", unit: "%", label: "可用率" },
        { value: "1.2", unit: "TB", label: "数据库容量" },
        { value: "42", label: "新增客户" },
        { value: "3.2", unit: "s", label: "平均响应时长" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "核心指标",
      components: [kpiComponent4],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(4)
    for (const box of boxes) {
      // Value text is the only bold <text> in a KPI card body.
      const valueText = Array.from(box.querySelectorAll("text")).find(
        (t) => t.getAttribute("font-weight") === "bold",
      )!
      const labelText = Array.from(box.querySelectorAll("text")).find(
        (t) => t.getAttribute("font-weight") !== "bold",
      )!
      const gap = Number(labelText.getAttribute("y")) - Number(valueText.getAttribute("y"))
      expect(gap).toBeGreaterThanOrEqual(20)
    }
  })

  it("renders each exploded KPI card's value at display-level size (72px hero tier) in colors.accent, plus a restrained glow accent past it", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent4: Component = {
      type: "kpi_cards",
      items: [
        { value: "88", label: "达成率", icon: "target", delta: "up" },
        { value: "12", label: "转化率" },
        { value: "45", label: "留存率" },
        { value: "7", label: "净增长" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "核心指标",
      components: [kpiComponent4],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(4)
    for (const box of boxes) {
      const valueText = Array.from(box.querySelectorAll("text")).find(
        (t) => t.getAttribute("font-weight") === "bold",
      )!
      expect(valueText.getAttribute("font-size")).toBe("72")
      expect(valueText.getAttribute("fill")).toBe(ctx.colors.accent)

      // Glow cluster: 1 solid dot (fill=accent) + 2 concentric rings
      // (fill=none, stroke=accent), distinguished by exact stroke-opacity.
      const dot = Array.from(box.querySelectorAll("circle")).find(
        (c) => c.getAttribute("fill") === ctx.colors.accent,
      )!
      expect(dot.getAttribute("r")).toBe("3")
      const ring1 = Array.from(box.querySelectorAll("circle")).find(
        (c) => c.getAttribute("stroke-opacity") === "0.18",
      )!
      const ring2 = Array.from(box.querySelectorAll("circle")).find(
        (c) => c.getAttribute("stroke-opacity") === "0.07",
      )!
      for (const ring of [ring1, ring2]) {
        expect(ring.getAttribute("fill")).toBe("none")
        expect(ring.getAttribute("stroke")).toBe(ctx.colors.accent)
      }
      expect(ring1.getAttribute("r")).toBe("9")
      expect(ring2.getAttribute("r")).toBe("14")
      expect(ring1.getAttribute("cx")).toBe(dot.getAttribute("cx"))
      expect(ring1.getAttribute("cy")).toBe(dot.getAttribute("cy"))
      expect(ring2.getAttribute("cx")).toBe(dot.getAttribute("cx"))
      expect(ring2.getAttribute("cy")).toBe(dot.getAttribute("cy"))
      expect(Number(dot.getAttribute("cx"))).toBeGreaterThan(Number(valueText.getAttribute("x")))
    }
  })

  it("bumps a KPI card's value to the 72px hero size in a full-height cell, and reserves extra glow clearance from a co-present delta arrow", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    // 2-unit grid: both cells span the bento rect's full height — comfortably
    // over the hero threshold, so both items earn the 72px tier. Item 0 has
    // no icon + a long, unit-less value (forces fitSvgLine to shrink until
    // its rendered width approaches the card's full inner width, pushing the
    // glow cluster's *natural* position past the right-edge clamp) + a delta
    // arrow — the combination that used to let the outer glow ring visually
    // collide with the delta arrow.
    const kpiComponent2: Component = {
      type: "kpi_cards",
      items: [
        {
          value: "123456789012.99",
          label: "超长数值压力占位标签文本",
          delta: "up",
        },
        { value: "88", label: "达成率", icon: "target", delta: "down" },
      ],
    }
    const slide: Slide = {
      type: "content",
      heading: "核心指标",
      components: [kpiComponent2],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(2)
    // Ring radii are a pure function of `hero` (derived from box.h), never
    // of the value's own rendered/fitted size.
    for (const box of boxes) {
      const ring1 = Array.from(box.querySelectorAll("circle")).find(
        (c) => c.getAttribute("stroke-opacity") === "0.18",
      )!
      const ring2 = Array.from(box.querySelectorAll("circle")).find(
        (c) => c.getAttribute("stroke-opacity") === "0.07",
      )!
      expect(ring1.getAttribute("r")).toBe("9")
      expect(ring2.getAttribute("r")).toBe("14")
    }

    // Item 1's value ("88") renders at the full hero ceiling.
    const shortValueBox = boxes.find((b) =>
      Array.from(b.querySelectorAll("text")).some((t) => t.textContent === "88"),
    )!
    const shortValueText = Array.from(shortValueBox.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-weight") === "bold",
    )!
    expect(shortValueText.getAttribute("font-size")).toBe("72")

    // Item 0 (no icon, long value, delta): the glow's outer ring must clear
    // the delta arrow's own estimated rendered width, not just its anchor
    // point.
    const longValueBox = boxes.find((b) =>
      Array.from(b.querySelectorAll("text")).some((t) => (t.textContent ?? "").startsWith("123456789")),
    )!
    const longValueText = Array.from(longValueBox.querySelectorAll("text")).find(
      (t) => t.getAttribute("font-weight") === "bold",
    )!
    expect(Number(longValueText.getAttribute("font-size"))).toBeLessThanOrEqual(72)
    const deltaText = Array.from(longValueBox.querySelectorAll("text")).find(
      (t) => t.getAttribute("text-anchor") === "end",
    )!
    const deltaX = Number(deltaText.getAttribute("x"))
    const deltaFontSize = Number(deltaText.getAttribute("font-size"))
    const deltaWidth = measureTextUnits(deltaText.textContent ?? "") * deltaFontSize
    const deltaLeftEdge = deltaX - deltaWidth
    const ring2 = Array.from(longValueBox.querySelectorAll("circle")).find(
      (c) => c.getAttribute("stroke-opacity") === "0.07",
    )!
    const ringRight = Number(ring2.getAttribute("cx")) + Number(ring2.getAttribute("r"))
    expect(ringRight).toBeLessThan(deltaLeftEdge)
  })

  it("mixes an exploded 2-item kpi_cards component with a chart component into a 3-unit bento grid", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent2: Component = {
      type: "kpi_cards",
      items: [
        { value: "12", label: "转化率" },
        { value: "88", label: "满意度" },
      ],
    }
    const chartComponent: Component = {
      type: "chart",
      chart_type: "bar",
      series: [{ name: "S1", data: [{ x: "A", y: 10 }] }],
    }
    const slide: Slide = {
      type: "content",
      heading: "混合拼盘",
      components: [kpiComponent2, chartComponent],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // 2 kpi items + 1 chart component = 3 bento cells (the 3-unit grid tier),
    // not 2 cells (1 kpi_cards component + 1 chart component).
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(3)
    for (const item of kpiComponent2.items) {
      expect(markup).toContain(item.value)
    }
  })

  it("centers a lone KPI item's value vertically in a tall bento cell (2-unit grid, mixed with a paragraph)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent1: Component = {
      type: "kpi_cards",
      items: [{ value: "88", label: "达成率" }],
    }
    const slide: Slide = {
      type: "content",
      heading: "双元混排",
      components: [kpiComponent1, para("这里是配对展示的另一块说明文字。")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(2)
    const kpiBox = boxes.find((b) =>
      Array.from(b.querySelectorAll("text")).some((t) => t.textContent === "88"),
    )!
    const [, by, , bh] = (kpiBox.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
    const valueText = Array.from(kpiBox.querySelectorAll("text")).find((t) => t.textContent === "88")!
    const valueY = Number(valueText.getAttribute("y"))
    // Middle vertical band of the cell — top-anchored content would sit at
    // y ≈ box.y + ~50px, well inside the top quarter for a tall cell.
    expect(valueY).toBeGreaterThan(by + bh * 0.25)
  })

  it("lays out exactly 5 components as a 3+2 bento grid (no degrade) — verifies capacity.ts's per-theme 5/6 override", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const texts = Array.from({ length: 5 }, (_, i) => `要点 ${i}`)
    const components = texts.map(para)
    const slide: Slide = {
      type: "content",
      heading: "五项要点",
      components,
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(5)
    const surfaceRects = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(surfaceRects).toHaveLength(5)
    for (const t of texts) {
      expect(markup).toContain(t)
    }
    expect(() => assertSubset(root)).not.toThrow()
    expect(auditSvgMarkup(markup)).toEqual([])
  })

  it("lays out exactly 6 components as a 3x2 bento grid (no degrade)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const texts = Array.from({ length: 6 }, (_, i) => `要点 ${i}`)
    const components = texts.map(para)
    const slide: Slide = {
      type: "content",
      heading: "六项要点",
      components,
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    // 6 units now fit the grid's largest tier (3x2) — the bento cards
    // render, unlike the >6-unit case which must degrade.
    const root = parseSvgRoot(markup)
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(6)
    for (const t of texts) {
      expect(markup).toContain(t)
    }
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("lays out 6 short bullets components as a real 3x2 grid — 6 panel cards, zero-overflow audit clean", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const components: Component[] = Array.from({ length: 6 }, (_, i) => ({
      type: "bullets" as const,
      items: [`要点 ${i}-A`, `要点 ${i}-B`],
    }))
    const slide: Slide = {
      type: "content",
      heading: "六项要点",
      components,
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const surfaceRects = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(surfaceRects).toHaveLength(6)

    expect(auditSvgMarkup(markup)).toEqual([])
  })

  it("renders self-visual components (callout/code) bare in the grid — no outline shell, no accent stripe", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const calloutComponent: Component = {
      type: "callout",
      variant: "tip",
      text: "自带视觉的提示块。",
    }
    const codeComponent: Component = {
      type: "code",
      language: "ts",
      code: "const a = 1",
    }
    const paragraphComponent: Component = para("普通块仍然有卡壳")
    const slide: Slide = {
      type: "content",
      heading: "卡壳感知",
      components: [calloutComponent, codeComponent, paragraphComponent],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // 3 units → 3 bento cells, but only the plain paragraph cell gets a
    // surface-filled shell — callout/code paint their own chrome instead.
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(3)
    const surfaceFills = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(surfaceFills).toHaveLength(1)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)
    // callout/code still render their own chrome — this isn't "no chrome at
    // all".
    expect(markup).toContain("自带视觉的提示块。")
    expect(markup).toContain("const a = 1")
  })

  it("renders a verdict_banner bare in the grid — no outline shell, no accent stripe (joins SELF_VISUAL_TYPES)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const verdictComponent: Component = {
      type: "verdict_banner",
      tone: "positive",
      text: "自带视觉的结论条。",
    }
    const paragraphComponent: Component = para("普通块仍然有卡壳")
    const slide: Slide = {
      type: "content",
      heading: "结论条卡壳感知",
      components: [verdictComponent, paragraphComponent],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // 2 units → 2 bento cells, but only the plain paragraph cell gets a
    // bento outline shell — verdict_banner paints its own tone-tinted/
    // stroked bar instead.
    const boxes = root.querySelectorAll("[data-audit-box]")
    expect(boxes.length).toBe(3)
    const surfaceFills = Array.from(root.querySelectorAll("rect")).filter(isBentoOutlineShell)
    expect(surfaceFills).toHaveLength(1)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)
    // verdict_banner still renders its own chrome: a tone-tinted rx=10 bar,
    // resolved to tech's dark-theme bright variant.
    expect(markup).toContain("自带视觉的结论条。")
    const bannerRect = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("rx") === "10")
    expect(bannerRect?.getAttribute("fill")).toBe("#4FBF8B")
  })

  it("renders a single ordinary component with no shell card — bare, centered in the bento rect", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const slide: Slide = {
      type: "content",
      heading: "唯一要点",
      components: [para("独占一页的普通块。")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
    // No bento shell (surface fill) and no accent stripe — a lone component is
    // not stretched into a page-filling empty card.
    expect(markup).not.toContain(`fill="${ctx.colors.surface}"`)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)
    expect(markup).toContain("独占一页的普通块。")
  })

  it("keeps a single KPI item as one modest centered card (400 wide), not a rect-filling shell", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const kpiComponent1: Component = {
      type: "kpi_cards",
      items: [{ value: "42", unit: "%", label: "唯一指标", delta: "up" }],
    }
    const slide: Slide = {
      type: "content",
      heading: "单一指标",
      components: [kpiComponent1],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(1)
    const [x, , w] = (boxes[0].getAttribute("data-audit-box") ?? "").split(",").map(Number)
    expect(w).toBe(400)
    // bentoRect is x=96 w=1088 for a single-line heading — the card is
    // horizontally centered within it (same center point).
    const bentoRectCenter = 96 + 1088 / 2
    expect(x + w / 2).toBeCloseTo(bentoRectCenter)
    expect(markup).toContain(`fill="${ctx.colors.surface}"`)
    const stripes = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("height") === "3",
    )
    expect(stripes).toHaveLength(0)
    expect(markup).toContain("42")
    expect(markup).toContain("唯一指标")
  })

  it("degrades when a single card's component content overflows its height budget (4 components, one tall)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    // 6 long bullet items in a single card: even a single unwrapped line per
    // item already exceeds a bento cell's content budget, and these CJK
    // sentences are long enough to wrap to 2 lines in the narrower cells too.
    const longItems = Array.from(
      { length: 6 },
      (_, i) => `${CJK_LONG}——补充说明第 ${i} 条落地细则与验收标准`,
    )
    const components: Component[] = [para("一"), { type: "bullets", items: longItems, style: "default" }, para("三"), para("四")]
    const slide: Slide = {
      type: "content",
      heading: "四大支柱",
      components,
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    // Same degrade signature as the >=5-component overflow case: no bento card
    // background, full content preserved.
    expect(markup).not.toContain(`fill="${ctx.colors.surface}"`)
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("scales an oversized chart component to fit its card instead of degrading (4 components, chart in a quarter-height cell)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const chartComponent: Component = {
      type: "chart",
      chart_type: "bar",
      series: [
        {
          name: "S1",
          data: [
            { x: "A", y: 10 },
            { x: "B", y: 20 },
          ],
        },
      ],
    }
    const components: Component[] = [para("概览"), chartComponent, para("结论"), para("展望")]
    const slide: Slide = {
      type: "content",
      heading: "四项要点",
      components,
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    // Not degraded: the panel-colored bento cards still render.
    expect(markup).toContain(`fill="${ctx.colors.surface}"`)
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    const scaledGroups = Array.from(root.querySelectorAll("g")).filter((g) =>
      /scale\(/.test(g.getAttribute("transform") ?? ""),
    )
    expect(scaledGroups.length).toBeGreaterThanOrEqual(1)
    const s = Number(/scale\(([\d.]+)\)/.exec(scaledGroups[0].getAttribute("transform")!)![1])
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)

    // The zero-overflow estimator gate must stay green — it composes
    // accumulated scale into its text-position/size math.
    expect(auditSvgMarkup(markup)).toEqual([])
  })

  it("each bento card carries both a data-audit-box (h-overflow) and a card-level data-audit-rect (v-overflow)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const slide: Slide = {
      type: "content",
      heading: "四大支柱",
      components: [para("一"), para("二"), para("三"), para("四")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const boxes = Array.from(root.querySelectorAll("[data-audit-box]"))
    expect(boxes).toHaveLength(4)
    for (const el of boxes) {
      expect(el.hasAttribute("data-audit-rect")).toBe(true)
      const [x, y, w, h] = (el.getAttribute("data-audit-rect") ?? "").split(",").map(Number)
      const [bx, by, bw] = (el.getAttribute("data-audit-box") ?? "").split(",").map(Number)
      // Same box origin/width as the h-overflow box, plus an explicit height
      // (the card's own, not the whole bento region's) for the v-overflow
      // check.
      expect([x, y, w]).toEqual([bx, by, bw])
      expect(h).toBeGreaterThan(0)
    }
  })

  it("heading converges a pathologically long (48-char) heading to <44pt or 2 lines", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const longHeading = "微服务架构下分布式事务一致性保障机制补偿策略设计".repeat(3).slice(0, 48)
    expect(longHeading.length).toBe(48)
    const slide: Slide = {
      type: "content",
      heading: longHeading,
      components: [para("概要")],
    } as Slide
    const doc = ir("tech", [slide])
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()

    // Isolate the heading <text> lines: fontWeight 700 + fill=colors.text is
    // unique to the heading among Content's elements.
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700" && t.getAttribute("fill") === ctx.colors.text,
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2)
    const converged =
      headingTexts.length === 2 || Number(headingTexts[0].getAttribute("font-size")) < 44
    expect(converged).toBe(true)
  })

  describe("Content subheading (Task 5)", () => {
    const base: Slide = {
      type: "content",
      heading: "三大支柱",
      components: [para("一"), para("二")],
    } as Slide

    function bentoRectY(root: Element): number {
      const g = Array.from(root.querySelectorAll("g")).find((el) =>
        el.getAttribute("data-audit-rect")?.startsWith("96,"),
      )!
      return Number(g.getAttribute("data-audit-rect")!.split(",")[1])
    }

    it("no subheading: bento rect y stays at the pre-subheading formula (headingLastY + 36)", () => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const doc = ir("tech", [base])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BentoPanelContent ir={doc} slide={base} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      expect(bentoRectY(root)).toBe(150 + 36)
      expect(root.querySelector('text[y="180"]')).toBeNull()
    })

    it("with subheading: renders in colors.accent below the heading, and pushes the bento grid down 46 (S3b: headingLastY+42)", () => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const slide: Slide = { ...base, subheading: "效率提升三成，风险敞口下降" } as Slide
      const doc = ir("tech", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const sub = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("效率提升三成"),
      )!
      expect(sub.getAttribute("fill")).toBe(ctx.colors.accent)
      // S3b unified formula (44px title): headingLastY + 22+14+round(0.12*44) = +42
      expect(sub.getAttribute("y")).toBe(String(150 + 42))
      expect(bentoRectY(root)).toBe(150 + 36 + 46)
    })

    it("emphasis markup: ** ** segments invert to colors.text at fontWeight 700", () => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const slide: Slide = { ...base, subheading: "**效率提升三成**，风险敞口下降" } as Slide
      const doc = ir("tech", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const tspan = Array.from(root.querySelectorAll("tspan")).find((t) =>
        (t.textContent ?? "").includes("效率提升三成"),
      )!
      expect(tspan.getAttribute("fill")).toBe(ctx.colors.text)
      expect(tspan.getAttribute("font-weight")).toBe("700")
      const plainTspan = Array.from(root.querySelectorAll("tspan")).find((t) =>
        (t.textContent ?? "").includes("风险敞口下降"),
      )!
      expect(plainTspan.getAttribute("fill")).toBe(ctx.colors.accent)
    })

    it("overly long subheading shrinks to 16px then truncates", () => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const slide: Slide = { ...base, subheading: CJK_LONG.repeat(2) } as Slide
      const doc = ir("tech", [slide])
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <BentoPanelContent ir={doc} slide={slide} index={0} ctx={ctx} />
        </svg>,
      )
      const root = parseSvgRoot(markup)
      const sub = Array.from(root.querySelectorAll("text")).find((t) =>
        (t.textContent ?? "").includes("微服务"),
      )!
      expect(sub.getAttribute("font-size")).toBe("16")
      expect((sub.textContent ?? "").endsWith("…")).toBe(true)
      expect(sub.textContent).not.toBe(CJK_LONG.repeat(2))
    })
  })
})
