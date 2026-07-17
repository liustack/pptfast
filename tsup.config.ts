import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", node: "src/node.ts", cli: "src/cli.ts" },
  format: ["esm"],
  dts: { entry: { index: "src/index.ts", node: "src/node.ts" } },
  external: ["sharp"],
  clean: true,
  sourcemap: true,
})
