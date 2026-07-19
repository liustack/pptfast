// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { BrandChrome } from "./BrandChrome"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "./components/types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#1A2421",
    muted: "#5D6B65",
    border: "#D5D5CB",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function ir(themeId: PptxIR["theme"]["id"], slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: themeId },
    meta: { organization: "ACME", confidentiality: "internal", version: "v1", date: "2026" },
    assets: {
      images: { bg: { src: "data:image/png;base64,iVBOR", alt: "背景" } },
    },
    slides,
  }
}

const cardBgContentSlide: Slide = {
  type: "content",
  heading: "带背景卡片",
  components: [{ type: "paragraph", text: "卡内文字。" }],
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("BrandChrome footer suppression (W1: theme brand.suppressFooterOnCardContent via resolveBrand)", () => {
  it("enterprise 主题：content 页 + 卡片背景图 → 页脚整体消失（theme brand 驱动）", () => {
    const doc = ir("enterprise", [cardBgContentSlide])
    const { container } = svg(<BrandChrome ir={doc} slide={cardBgContentSlide} ctx={ctx} />)
    expect(container.querySelector("line")).toBeNull()
    expect(container.textContent).not.toContain("ACME")
    expect(container.textContent).not.toContain("v1")
  })

  it.each(["consulting", "insight", "academic", "tech", "journal"] as const)(
    "%s 主题：同样的 content 页 + 卡片背景图 → 页脚正常显示（未设 brand.suppressFooterOnCardContent，不受影响）",
    (themeId) => {
      const doc = ir(themeId, [cardBgContentSlide])
      const { container } = svg(<BrandChrome ir={doc} slide={cardBgContentSlide} ctx={ctx} />)
      expect(container.querySelector("line")).not.toBeNull()
      expect(container.textContent).toContain("ACME")
      expect(container.textContent).toContain("v1")
    },
  )
})
