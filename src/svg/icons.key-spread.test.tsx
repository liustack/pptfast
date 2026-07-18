// @vitest-environment jsdom
//
// Deliberately its own file, not folded into icons.test.tsx (post-v0.3 W8
// fix round, backlog item 11, `.issues/notes/2026-07-18-post-v03-backlog.md`
// #11). React's dev-mode "A props object containing a 'key' prop is being
// spread into JSX" warning is deduplicated per element type for the
// lifetime of the module realm — confirmed empirically while building this
// test: once any render in the same file has already triggered the warning
// for e.g. `<rect>`, a later, freshly `vi.spyOn`-installed `console.error`
// spy in the same file sees nothing on a second render of the same tag,
// even against the unfixed code. icons.test.tsx's own "Icon component"/
// "shared catalogue" describe blocks already render every catalogued icon
// (all 7 primitive tags this fix touches) before any test of this shape
// could run if it shared that file — which would make a "no warning fired"
// assertion pass unconditionally regardless of whether the underlying bug
// is fixed, a silent false negative rather than real coverage. Vitest's
// default per-file module isolation (`vitest.config.ts` sets no
// `pool`/`isolate` override, so the documented `isolate: true` default
// applies) gives every test *file* a fresh module graph, and therefore a
// fresh copy of React's internal warning-dedup state — so this file's
// render is guaranteed to be the first (and only) one to touch these 7
// tags within its own module realm. Precedent for a second,
// environment-motivated test file over the same source module:
// `src/platform/node.smoke.test.ts` alongside that module's regular tests.
//
// Both assertions below (byte-identical markup, zero key-spread warnings)
// come from a *single* render call for the same reason: two separate calls
// in this file would hit the same self-pollution problem the file header
// above describes, just at file-local scope instead of repo scope.
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Icon } from "./icons"

describe("Icon-bearing render (post-v0.3 W8 fix round, backlog item 11)", () => {
  it("produces byte-identical XML to the pre-fix render, with zero key-spread console.error calls", () => {
    const calls: unknown[][] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      calls.push(args)
    })
    let markup: string
    try {
      // Five icons chosen to cover all 7 renderPrimitive JSX return sites in
      // one markup: info (circle+path), cylinder (ellipse+path), server
      // (rect+line), navigation (polygon), album (rect+polyline) — grepped
      // from `@/icons` (`src/icons.ts`) for each primitive kind's rarest
      // occurrence. `renderToStaticMarkup` — the same server-render entry
      // point `renderSlideSvg`/`generatePptx` use in production
      // (`docs/architecture.md`'s render-chain diagram) — rather than
      // `@testing-library/react`'s jsdom `render()`, so this exercises the
      // same code path a real deck render does.
      markup = renderToStaticMarkup(
        <svg>
          <Icon name="info" x={0} y={0} size={20} color="#112233" />
          <Icon name="cylinder" x={24} y={0} size={22} color="#334455" />
          <Icon name="server" x={48} y={0} size={20} color="#556677" />
          <Icon name="navigation" x={72} y={0} size={18} color="#778899" />
          <Icon name="album" x={96} y={0} size={24} color="#99AABB" />
        </svg>,
      )
    } finally {
      spy.mockRestore()
    }

    // Captured with this identical render call against the pre-fix
    // `renderPrimitive` (the version whose `common` object still carried
    // `key: i`) — pinned verbatim, not regenerated, so this string is the
    // actual proof of byte-identity rather than a tautology against the
    // current implementation.
    const EXPECTED_MARKUP =
      '<svg><g transform="translate(0,0) scale(0.8333333333333334)"><circle stroke="#112233" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" cx="12" cy="12" r="10"></circle><path stroke="#112233" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4"></path><path stroke="#112233" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 8h.01"></path></g><g transform="translate(24,0) scale(0.9166666666666666)"><ellipse stroke="#334455" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" cx="12" cy="5" rx="9" ry="3"></ellipse><path stroke="#334455" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 5v14a9 3 0 0 0 18 0V5"></path></g><g transform="translate(48,0) scale(0.8333333333333334)"><rect stroke="#556677" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect stroke="#556677" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line stroke="#556677" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" x1="6" y1="6" x2="6.01" y2="6"></line><line stroke="#556677" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" x1="6" y1="18" x2="6.01" y2="18"></line></g><g transform="translate(72,0) scale(0.75)"><polygon stroke="#778899" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="3 11 22 2 13 21 11 13 3 11"></polygon></g><g transform="translate(96,0) scale(1)"><rect stroke="#99AABB" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polyline stroke="#99AABB" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="11 3 11 11 14 8 17 11 17 3"></polyline></g></svg>'
    expect(markup).toBe(EXPECTED_MARKUP)

    const keySpreadWarnings = calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        args[0].includes('A props object containing a "key" prop is being spread into JSX'),
    )
    expect(keySpreadWarnings).toEqual([])
  })
})
