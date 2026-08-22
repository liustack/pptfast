import { defineConfig } from "tsup"

// The public surface is the CLI (plus the IR schema it speaks) — the JS API
// was sealed pre-1.0 (SDK-sealing wave; see docs/internal-api.md). The
// index/node entries still build because internal consumers (the DSH plugin
// layer, future MCP/tool surfaces) import them by relative path inside the
// published package — they carry no semver promise and are not in `exports`.
// The former browser/validate self-contained bundles (P2
// browser-distribution wave) were external-only surfaces and are gone with
// the sealing.
//
// Dependencies stay external (npm's normal resolution) — an install pulls
// react/zod/jszip/pptxgenjs from its own node_modules.
export default defineConfig([
  {
    entry: { index: "src/index.ts", node: "src/node.ts", cli: "src/cli.ts" },
    format: ["esm"],
    dts: { entry: { index: "src/index.ts", node: "src/node.ts" } },
    external: ["sharp"],
    sourcemap: true,
  },
])
