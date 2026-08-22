// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { slideToSvgMarkup } from "./render-slide"
import type { PptxIR, Slide } from "@/ir"

// image-bottom 的 caption 遮罩条只在 Branding 真会画内容页脚时才上移
// 让位。页脚绘制条件是 branding:"full"（cover-only 默认与 minimal 都不画
// meta 行），caption 让位谓词必须与它一致，否则默认姿态下条带为不存在的
// 页脚悬空 40px（2026-08-22 根因修复的回归钉）。
const slide: Slide = {
  type: "content",
  heading: "底图页标题",
  layout: "image-bottom",
  components: [
    { type: "image", asset_id: "hero", fit: "cover", caption: "样例底图" },
    { type: "paragraph", text: "正文段落。" },
  ],
}

function makeIr(branding?: PptxIR["branding"]): PptxIR {
  return {
    version: "4",
    filename: "deck.pptx",
    theme: { id: "consulting" },
    meta: { organization: "ACME", date: "2026-08-22" },
    assets: {
      images: {
        hero: {
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        },
      },
    },
    ...(branding ? { branding } : {}),
    slides: [slide],
  }
}

function bandYs(markup: string): number[] {
  // 整宽 40 高的半透明黑 rect（caption 条与 full 姿态下 Branding 的
  // 页脚遮罩同款），收全部 y 值再断言。
  return [...markup.matchAll(/<rect x="0" y="(\d+)" width="1280" height="40" fill="#0A0E14"/g)].map(
    (m) => Number(m[1]),
  )
}

describe("image-bottom caption band vs branding posture", () => {
  it("sits flush at the page edge under the default cover-only posture", () => {
    expect(bandYs(slideToSvgMarkup(makeIr(), slide, 0))).toEqual([680])
  })

  it("sits flush under minimal (no content-page footer meta)", () => {
    expect(bandYs(slideToSvgMarkup(makeIr("minimal"), slide, 0))).toEqual([680])
  })

  it('lifts 40px above the drawn footer only under branding:"full"', () => {
    expect(bandYs(slideToSvgMarkup(makeIr("full"), slide, 0))).toContain(640)
  })
})
