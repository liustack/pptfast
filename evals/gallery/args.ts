export interface EvalArgs {
  full: boolean
  l1Only: boolean
  pages?: string[]
  from?: string
  out?: string
  help: boolean
}

export const HELP = `evals:gallery: L1 geometry plus optional L2 vision audit of gallery pages.

Usage:
  pnpm evals:gallery [options]

Options:
  --full              audit every page (default: incremental, changed ∪ added vs hashes.json)
  --l1-only           skip the grok vision pass
  --pages=id,id       audit only these page ids
  --from=<dir>        use an existing gallery output (SVGs + manifest.json)
  --out=<path>        verdict JSON (default evals/gallery/verdicts/<run-id>.json)
  -h, --help          show this help

L2 is skipped (the run still succeeds) when CI=true, --l1-only is set, or grok is not on PATH.
Planted miss-class fixtures are replayed before the live audit. A planted miss fails the process.
Live corpus findings are written to the report and do not fail the process.
`

function flag(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf("=")
  return eq === -1 ? "" : hit.slice(eq + 1)
}

export function parseEvalArgs(argv: string[]): EvalArgs {
  const help = argv.includes("-h") || argv.includes("--help")
  const pagesRaw = flag(argv, "pages")
  const pages = pagesRaw
    ? pagesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  const from = flag(argv, "from")
  const out = flag(argv, "out")
  return {
    full: argv.includes("--full"),
    l1Only: argv.includes("--l1-only"),
    pages: pages && pages.length > 0 ? pages : undefined,
    from: from || undefined,
    out: out || undefined,
    help,
  }
}
