// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { parseSvgRoot, renderSvgMarkup } from "../serialize"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { BannerTitleCover } from "./cover-banner-title"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = { type: "cover", heading: "年度战略回顾", subheading: "面向 2027 的三个决定", components: [] } as Slide
const ir = (theme: string): PptxIR =>
  ({ version: "3", filename: "x.pptx", theme: { id: theme }, meta: { organization: "测试部", date: "2026-07" }, assets: { images: {} }, slides: [slide] }) as unknown as PptxIR

// Captured verbatim from the legacy `MckinseyNavyCover` (templates/consulting.tsx)
// for this exact fixture (consulting tokens, org="测试部", date="2026-07") before
// templates/ was deleted — see the task header comment below for why this is
// now a literal instead of a live import (P2 Task 26 dependency break).
const LEGACY_COVER_MARKUP = `<g transform="translate(96, 136)"><circle cx="12" cy="-12" r="12" fill="#FFC72C"></circle><text x="48" y="0" font-family="Georgia, Songti SC, STSong, serif" font-size="32" fill="#051C2C" letter-spacing="2" dominant-baseline="alphabetic">测试部</text></g><text x="96" y="362" font-family="Georgia, Songti SC, STSong, serif" font-size="84" font-weight="600" fill="#051C2C" dominant-baseline="alphabetic">年度战略回顾</text><rect x="96" y="402" width="96" height="8" fill="#051C2C"></rect><text x="96" y="430" font-family="Georgia, Songti SC, STSong, serif" font-size="34" fill="#6C6C6C" font-style="italic" dominant-baseline="alphabetic">面向 2027 的三个决定</text><line x1="96" y1="495" x2="820" y2="495" stroke="#D5D5CB" stroke-width="1.4"></line><text x="96" y="543" font-family="Georgia, Songti SC, STSong, serif" font-size="26" dominant-baseline="alphabetic"><tspan fill="#6C6C6C">2026-07</tspan></text>`

// Tag-count helper for the structural-equivalence check below: counts each
// SVG element tag so we can assert "same shape" (same number of <text>/
// <rect>/<circle>/<line>) between old and new output without requiring the
// two markups to be byte-identical.
function tagCounts(markup: string): Record<string, number> {
  return Array.from(markup.matchAll(/<([a-z]+)[ >]/g)).reduce<Record<string, number>>((acc, [, tag]) => {
    acc[tag] = (acc[tag] ?? 0) + 1
    return acc
  }, {})
}

describe("BannerTitleCover", () => {
  // 2026-07-09 有意偏离旧模板修叠压 bug：旧 MckinseyNavyCover
  // （templates/consulting.tsx 29-183 行）把 accent 条钉在 titleLastY+40，
  // 副题钉在 titleLastY+68——条底（+48）到副题基线只留 20px，副题 34px 字号
  // 的可视 ascent 远超过这个余量，字形顶部与条底重叠。这是 P1 逐字节提炼
  // 原样搬入的旧模板既有瑕疵，本任务（Wave 3 Task 21b）有意修掉它，把
  // subtitleY 从 titleLastY+68 改成 titleLastY+96（见 cover-banner-title.tsx
  // 的注释）。这条历史上曾是 toBe(legacy) 的逐字节断言，现在必须降级为
  // 观感等价——结构（元素标签数量）、文本内容、颜色 token 仍然锁定，但不再
  // 要求与旧模板逐字节相同，因为这次几何差异是有意的正确性修复，不是迁移
  // 期间的意外行为漂移。
  it("consulting tokens 下与旧 MckinseyNavyCover 观感等价（2026-07-09 有意偏离旧模板修叠压 bug，不再逐字节锁）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const legacy = LEGACY_COVER_MARKUP
    const next = renderSvgMarkup(<BannerTitleCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)

    // 结构一致：同样数量的每种 SVG 元素标签（org 圆点、confidentiality 徽标
    // 分支未触发、标题行、accent 条、副题行、meta 分隔线/文本，一个不多一个
    // 不少）。
    expect(tagCounts(next)).toEqual(tagCounts(legacy))
    // 文本内容一致：标题/副题/org 一字不差地保留。
    expect(next).toContain("年度战略回顾")
    expect(next).toContain("面向 2027 的三个决定")
    expect(next).toContain("测试部")
    // token 化一致：颜色全部来自 ctx.colors，consulting 的三个 token 值都在。
    expect(next).toContain(ctx.colors.primary)
    expect(next).toContain(ctx.colors.accent)
    expect(next).toContain(ctx.colors.muted)
    // 但不再逐字节相等——这正是本次有意偏离的证明，若这条失败说明修复被
    // 意外撤销回了旧的叠压几何。
    expect(next).not.toBe(legacy)
  })

  it("tech tokens 下用 tech 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const out = renderSvgMarkup(<BannerTitleCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#2DD4E6") // tech accent
    expect(out).not.toContain("#FFC72C") // consulting accent 不得残留
  })

  it("修复后 accent 条与副题首行不再叠压（accent 条底边 y 明显小于副题首行 y，留出副题字号的可视 ascent + 目标间距）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <BannerTitleCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    // accent 条：唯一一个 96x8 的 rect（confidentiality 徽标本例未触发，
    // 不会有别的 rect 混入）。
    const bar = Array.from(root.querySelectorAll("rect")).find(
      (el) => el.getAttribute("width") === "96" && el.getAttribute("height") === "8",
    )
    // 副题首行：唯一带 font-style="italic" 的 text（org/标题/meta 都不是斜体）。
    const subtitleFirstLine = root.querySelector('text[font-style="italic"]')
    expect(bar).toBeTruthy()
    expect(subtitleFirstLine).toBeTruthy()
    // 回填旧测试「Cover renders a short thick navy bar ... 」里对 bar 自身颜色
    // 的断言（旧文件 consulting.test.tsx L326-345）：条本身填色须是
    // ctx.colors.primary，不是烤死的 NAVY 字面量。
    expect(bar!.getAttribute("fill")).toBe(ctx.colors.primary)

    const barY = Number(bar!.getAttribute("y"))
    const barBottom = barY + Number(bar!.getAttribute("height"))
    const subtitleY = Number(subtitleFirstLine!.getAttribute("y"))

    // 条本身在副题上方（旧模板这条也成立，不是本次修复的重点）。
    expect(barY).toBeLessThan(subtitleY)
    // 真正锁住不叠压的是条底与副题基线之间的余量：34px 副题字号的可视
    // ascent（本仓库"六主题统一公式"惯例：ascent≈字号本身）+ 14px 目标可视
    // 间距 = 48px 最小余量，而不只是两个 y 值谁大谁小。旧模板这里只有 20px
    // （68-48），会失败。
    expect(subtitleY - barBottom).toBeGreaterThanOrEqual(34 + 14)
  })
})
