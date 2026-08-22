import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { stackChars } from "./stack"

describe("stackChars", () => {
  it("emits one text node per character, stepped by fontSize + 6", () => {
    const nodes = stackChars("增长", {
      x: 104,
      y: 100,
      fontSize: 16,
      fill: "currentColor",
      fontFamily: "serif",
    })
    expect(nodes).toHaveLength(2)
    const markup = renderToStaticMarkup(<>{nodes}</>)
    expect(markup).toContain("增")
    expect(markup).toContain("长")
    expect(markup).toContain('x="104"')
    expect(markup).toContain('y="100"')
    expect(markup).toContain('y="122"')
    expect(markup).not.toContain("writing-mode")
    expect(markup).not.toContain("letter-spacing")
  })
})
