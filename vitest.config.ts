import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/bench/**/*.test.{ts,tsx}", "scripts/**/*.test.mts"],
    setupFiles: ["src/test-setup.ts"],
    // 60s, not 15s, because the heaviest sweeps genuinely need it. They are
    // slow, not hung. Measured on a 10-core machine, `vitest run` forking 10
    // workers:
    //
    //   test                                    solo    in a full run
    //   all-themes.test.ts / campaign           3.9s    10.2-17.1s
    //   gallery.test.mts / gallery corpus       4.8s    11.0-15.0s
    //   audit-baseline.test.ts / journal        0.7s    1.5-10.1s
    //
    // Ten workers on ten cores costs each worker a 2.5-4.5x slowdown, so a
    // sweep costing ~4s alone lands near 15s in company. At the old limit
    // `campaign` straddled the line and failed about one run in three. Raise
    // the limit and that same run finishes in 10.2s, which is what rules out
    // a hang: a hang does not finish. `campaign` is the heaviest because its
    // motif draws particle strokes, ~156k custom-geometry points per deck
    // against ~40 for a typical theme.
    //
    // 60s keeps ~3.5x headroom over the worst measured run and still surfaces
    // a real hang loudly (the whole suite takes 85-140s).
    testTimeout: 60_000,
  },
})
