// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { blendOver, contrastRatio } from "../ink"
import type { StyleColors } from "../../themes/tokens"
import {
  CONTENT_DECOR_CONTRAST_CEILING,
  effectivePaintOpacity,
  hexSaturation,
  midgroundSaturationCeiling,
} from "../motifs/decor-budget"
import { enforceMidgroundContract, resolveMidgroundBackground } from "./safety"
import { textInkBox } from "./geometry"

const colors: StyleColors = {
  bg: "#FFFFFF",
  surface: "#F4F4F4",
  primary: "#101010",
  accent: "#FF0000",
  text: "#101010",
  muted: "#777777",
  border: "#999999",
  chartPalette: ["#FF0000"],
}

function renderContract(midground: React.ReactNode, foreground: React.ReactNode = null): Element {
  const safe = enforceMidgroundContract({
    midground,
    foreground,
    background: colors.bg,
    colors,
  })
  return parseSvgRoot(
    renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g data-depth="mid">{safe}</g>
        <g data-depth="fg">{foreground}</g>
      </svg>,
    ),
  )
}

describe("midground safety contract", () => {
  it("caps saturation and effective contrast at the shared decor budget", () => {
    const root = renderContract(<rect data-probe="vivid" x={40} y={40} width={80} height={40} fill="#FF0000" />)
    const rect = root.querySelector('[data-probe="vivid"]')!
    const fill = rect.getAttribute("fill")!
    const opacity = effectivePaintOpacity(rect, "fill")

    expect(hexSaturation(fill)).toBeLessThanOrEqual(midgroundSaturationCeiling(colors) + 0.001)
    expect(contrastRatio(blendOver(fill, colors.bg, opacity), colors.bg)).toBeLessThan(
      CONTENT_DECOR_CONTRAST_CEILING,
    )
  })

  it("drops only the midground leaf whose box intersects foreground content", () => {
    const root = renderContract(
      <g>
        <rect data-probe="blocked" x={20} y={20} width={40} height={40} fill="#777777" />
        <circle data-probe="clear" cx={180} cy={180} r={12} fill="#777777" />
      </g>,
      <rect x={30} y={30} width={80} height={80} fill="#101010" />,
    )

    expect(root.querySelector('[data-probe="blocked"]')).toBeNull()
    expect(root.querySelector('[data-probe="clear"]')).not.toBeNull()
  })

  it("moves a whole ghost label inside the canvas before painting it", () => {
    const root = renderContract(
      <text
        data-probe="ghost"
        x={1300}
        y={715}
        fontFamily="Georgia"
        fontSize={220}
        fontWeight={700}
        fill="#FF0000"
        dominantBaseline="alphabetic"
      >
        01
      </text>,
    )
    const ghost = root.querySelector('[data-probe="ghost"]')!
    const box = textInkBox({
      content: ghost.textContent ?? "",
      x: Number(ghost.getAttribute("x")),
      y: Number(ghost.getAttribute("y")),
      fontSize: Number(ghost.getAttribute("font-size")),
      fontFamily: ghost.getAttribute("font-family") ?? "",
      fontWeight: ghost.getAttribute("font-weight"),
      textAnchor: ghost.getAttribute("text-anchor") ?? "start",
    })

    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w).toBeLessThanOrEqual(1280)
    expect(box.y + box.h).toBeLessThanOrEqual(720)
  })

  it("keeps already-quiet paint unchanged", () => {
    const root = renderContract(
      <line data-probe="quiet" x1={20} y1={20} x2={120} y2={20} stroke="#999999" strokeWidth={1} opacity={0.2} />,
    )
    const line = root.querySelector('[data-probe="quiet"]')!
    expect(line.getAttribute("stroke")).toBe("#999999")
    expect(line.getAttribute("opacity")).toBe("0.2")
    expect(line.getAttribute("stroke-opacity")).toBe("1")
  })

  it("rounds a nested local opacity down so effective contrast cannot cross the ceiling", () => {
    const background = "#2A1E3F"
    const safe = enforceMidgroundContract({
      midground: <circle data-probe="nested" cx={100} cy={100} r={8} fill="#A1C68A" opacity={0.77} />,
      foreground: null,
      background,
      colors,
    })
    const root = parseSvgRoot(
      renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <g data-depth="mid">{safe}</g>
        </svg>,
      ),
    )
    const circle = root.querySelector('[data-probe="nested"]')!
    const opacity = effectivePaintOpacity(circle, "fill")
    expect(contrastRatio(blendOver(circle.getAttribute("fill")!, background, opacity), background)).toBeLessThan(
      CONTENT_DECOR_CONTRAST_CEILING,
    )
  })

  it("resolves a full-canvas layout field nested in a React node array", () => {
    const nodes = [
      <g key="layout-bg">
        <rect x={0} y={0} width={1280} height={720} fill="#1E2A4A" />
      </g>,
    ]
    expect(resolveMidgroundBackground(nodes, "#F7F6F2")).toBe("#1E2A4A")
  })
})
