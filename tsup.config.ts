import { defineConfig } from "tsup"

// Two build "shapes" share this file (P2 browser-distribution wave, task 1):
//
// 1. The main/node/cli entries (unchanged behavior) — dependencies stay
//    external (npm's normal resolution), so a bundler-user's install of
//    `@liustack/pptfast` pulls react/zod/jszip/dagre/pptxgenjs from their
//    own node_modules, deduped against whatever else they depend on.
//    None of the three array items below sets `clean` — tsup runs array
//    entries *concurrently* (`Promise.all`, confirmed against tsup 8.5.1's
//    own source), so a `clean: true` on any one of them would race the
//    other two and could delete output they had already written. The
//    `build` npm script does the one-time `rm -rf dist` up front instead.
// 2. The browser/validate entries — fully self-contained ESM, every
//    dependency inlined (`noExternal: [/.*/]`), `platform: "browser"` so
//    esbuild honors each dependency's package.json `browser` field
//    (pptxgenjs and jszip both ship one, remapping their Node-only code
//    paths away) instead of resolving their Node/CJS main. `splitting:
//    false` keeps each one a single file with zero relative-chunk imports
//    to fetch — the whole point of a bare `<script type="module">` target.
//    `validate.ts`'s closure (src/validate.ts) excludes the render/export
//    chain by physical file-graph construction — it imports
//    src/validate-core.ts directly, never src/api.ts (see both files' own
//    doc comments for why a tree-shaking-only attempt didn't hold) — so it
//    comes out far smaller than browser.js; scripts/e2e.mts's
//    build-verification step checks both the zero-bare-specifier and the
//    tree-separation invariants post-build.
export default defineConfig([
  {
    entry: { index: "src/index.ts", node: "src/node.ts", cli: "src/cli.ts" },
    format: ["esm"],
    dts: { entry: { index: "src/index.ts", node: "src/node.ts", validate: "src/validate.ts" } },
    external: ["sharp"],
    sourcemap: true,
  },
  {
    entry: { browser: "src/index.ts" },
    format: ["esm"],
    platform: "browser",
    noExternal: [/.*/],
    splitting: false,
    treeshake: true,
    minify: true,
    dts: false,
    sourcemap: false,
  },
  {
    entry: { validate: "src/validate.ts" },
    format: ["esm"],
    platform: "browser",
    noExternal: [/.*/],
    splitting: false,
    treeshake: true,
    minify: true,
    dts: false,
    sourcemap: false,
  },
])
