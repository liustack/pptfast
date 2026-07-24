// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { PPTX_ICON_NAMES } from "@/icons/catalog"
import { assertSubset } from "./subset-validate"
import { Icon } from "./icons"

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

describe("Icon component", () => {
  it("renders info icon with a <path> and <circle> using the given stroke color", () => {
    const { container } = svg(
      <Icon name="info" x={0} y={0} size={20} color="#006A4E" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBeGreaterThanOrEqual(1)
    for (const p of paths) {
      expect(p.getAttribute("stroke")).toBe("#006A4E")
      expect(p.getAttribute("fill")).toBe("none")
      expect(p.getAttribute("stroke-linecap")).toBe("round")
      expect(p.getAttribute("stroke-linejoin")).toBe("round")
    }
    const circles = container.querySelectorAll("circle")
    expect(circles.length).toBe(1)
    expect(circles[0].getAttribute("stroke")).toBe("#006A4E")
    expect(circles[0].getAttribute("fill")).toBe("none")
  })

  it("wraps primitives in a <g> with translate and scale transform", () => {
    const { container } = svg(
      <Icon name="info" x={10} y={20} size={20} color="#000000" />,
    )
    const g = container.querySelector("g")
    expect(g).not.toBeNull()
    const scale = 20 / 24
    expect(g?.getAttribute("transform")).toBe(
      `translate(10,20) scale(${scale})`,
    )
  })

  it("renders triangle-alert with three <path> elements", () => {
    const { container } = svg(
      <Icon name="triangle-alert" x={0} y={0} size={24} color="#DC2626" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(3)
    for (const p of paths) {
      expect(p.getAttribute("stroke")).toBe("#DC2626")
    }
  })

  it("renders lightbulb with three <path> elements", () => {
    const { container } = svg(
      <Icon name="lightbulb" x={0} y={0} size={16} color="#00A878" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(3)
  })

  it("renders check with one <path> element", () => {
    const { container } = svg(
      <Icon name="check" x={0} y={0} size={24} color="#333333" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(1)
    expect(paths[0].getAttribute("d")).toBe("M20 6 9 17l-5-5")
  })

  it("renders trending-up with two <path> elements", () => {
    const { container } = svg(
      <Icon name="trending-up" x={5} y={5} size={20} color="#111111" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(2)
  })

  it("renders trending-down with two <path> elements", () => {
    const { container } = svg(
      <Icon name="trending-down" x={0} y={0} size={20} color="#222222" />,
    )
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(2)
  })

  it("throws on unknown icon name", () => {
    expect(() =>
      svg(<Icon name="nonexistent" x={0} y={0} size={20} color="#000" />),
    ).toThrow('unknown icon name "nonexistent"')
  })
})

describe("Icon component: model pretraining-habit aliases (T0b fix 1)", () => {
  // A weak model's pretraining data remembers the older lucide-react names
  // ("alert-circle"/"alert-triangle") pptfast never used (this catalog has
  // always spelled these "circle-alert"/"triangle-alert" — see
  // icons/legacy-names.ts). Bench evidence: 6 real validate failures across
  // 3 models, .issues/notes/2026-07-24-bench-rerun.md item 1. These aliases
  // must render byte-identical output to their canonical counterpart, not
  // just "something" — same catalog entry, not a lookalike substitute.
  it("renders alert-circle identically to circle-alert", () => {
    const alias = svg(<Icon name="alert-circle" x={0} y={0} size={24} color="#DC2626" />)
    const canonical = svg(<Icon name="circle-alert" x={0} y={0} size={24} color="#DC2626" />)
    expect(alias.container.innerHTML).toBe(canonical.container.innerHTML)
    expect(alias.container.innerHTML.length).toBeGreaterThan(0)
  })

  it("renders alert-triangle identically to triangle-alert", () => {
    const alias = svg(<Icon name="alert-triangle" x={0} y={0} size={24} color="#DC2626" />)
    const canonical = svg(<Icon name="triangle-alert" x={0} y={0} size={24} color="#DC2626" />)
    expect(alias.container.innerHTML).toBe(canonical.container.innerHTML)
    expect(alias.container.innerHTML.length).toBeGreaterThan(0)
  })
})

describe("shared catalogue", () => {
  it("renders every catalogued icon within the controlled subset", () => {
    for (const name of PPTX_ICON_NAMES) {
      const { container } = render(
        <svg>
          <Icon name={name} x={0} y={0} size={20} color="#112233" />
        </svg>,
      )
      const root = container.querySelector("svg")
      expect(root).not.toBeNull()
      expect(() => assertSubset(root as Element)).not.toThrow()
      expect(container.querySelectorAll("g[transform]").length).toBeGreaterThan(0)
    }
  })
})
