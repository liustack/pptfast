/**
 * Single-shot benchmark runner against an external OpenAI-compatible API.
 *
 * This is the second sanctioned run mode next to README.md's agentic
 * protocol: the model-under-test gets ONE completion call carrying the
 * SKILL playbook, the live vocabulary (schema/narratives/themes CLI
 * output), and the question prompt, and must answer with a bare IR JSON
 * document. No tool loop, no self-check iterations — this measures
 * first-shot floor quality, stricter than the agentic mode. Artifacts land
 * in tests/bench/results/<model>/<qid>/ exactly like agentic runs, so
 * score.mts consumes both identically.
 *
 * Credentials load from the repo-root .env (gitignored, never committed):
 *   <PREFIX>_BASE_URL / <PREFIX>_API_KEY / <PREFIX>_MODEL
 * Usage:
 *   pnpm bench:run <prefix> [q01 q02 ...]   (default: all questions in questionsDir)
 *   pnpm bench:run <prefix> --questions-dir=<dir> --results-dir=<dir> [ids...]
 *   pnpm bench:run <prefix> --model=<id> [ids...]   (override the .env model id)
 * e.g. pnpm bench:run qwen · pnpm bench:run deepseek q01 q07
 *   pnpm bench:run qwen --questions-dir=tests/bench/questions-probe --results-dir=tests/bench/results-probe
 *   pnpm bench:run qwen --model=qwen-flash
 *
 * `--questions-dir`/`--results-dir` default to `tests/bench/questions` /
 * `tests/bench/results` (unchanged default behavior) — added so a second,
 * separate question bank (e.g. the probe bank, `tests/bench/questions-probe/`)
 * can be run without touching the main bank's result history. Question ids
 * are auto-discovered from whichever `questionsDir` is in effect via a
 * generic `/^[a-z]\d\d$/` id shape (matches both `q01`/`p01`-style prefixes),
 * not a hardcoded `q\d\d`.
 *
 * `--model=<id>` overrides the `.env` `<PREFIX>_MODEL` value for this run
 * only — same flag, same semantics as `run-agentic.mts`'s `--model`
 * (round-2 addition, `.issues/2026-08-04-bench-agentic/dashscope-cache-investigation.md`:
 * lets an existing prefix's credentials run against a different model id,
 * e.g. `pnpm bench:run qwen --model=qwen-flash` to test a model on
 * dashscope's implicit-cache allow-list without adding a whole new `.env`
 * prefix). The result directory tag is the actual model id used — `cfg.model`
 * doubles as `runOne`'s `outDir` tag below — so an override never mixes into
 * the un-overridden prefix's own results, and `meta.json`'s `model` field
 * (self-reported by `runOne`) already reflects whichever id was actually
 * queried.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const CLI = join(ROOT, "dist/cli.js")
const CONCURRENCY = 3

function loadEnv(): Record<string, string> {
  const path = join(ROOT, ".env")
  if (!existsSync(path)) throw new Error(".env not found at repo root — see tests/bench/run.mts header")
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (m) out[m[1]!] = m[2]!
  }
  return out
}

function cliText(args: string[]): string {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8", cwd: ROOT })
}

/** Pulls `--<name>=<value>` out of `argv`, or `undefined` when absent —
 *  `run-agentic.mts` carries the identical helper (same `--flag=value`
 *  shape as this file's own `dirFlag`, minus the path-resolution/fallback
 *  step neither `--model` needs); duplicated rather than shared, same
 *  reasoning as this file's other small overlaps with that one (see its
 *  own header comment) — two independently-runnable scripts, not worth a
 *  new shared module for a four-line helper. */
export function flagValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = argv.find((a) => a.startsWith(prefix))
  return hit?.slice(prefix.length)
}

/** Strip a ```json fence when the model wraps its answer in one. */
function stripFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(text)
  return (fenced ? fenced[1]! : text).trim()
}

async function runOne(
  cfg: { baseUrl: string; apiKey: string; model: string },
  qid: string,
  shared: { skill: string; schema: string; narratives: string; themes: string },
  dirs: { questionsDir: string; resultsDir: string },
): Promise<void> {
  const promptPath = join(dirs.questionsDir, qid, "prompt.md")
  const prompt = readFileSync(promptPath, "utf8")
  const outDir = join(dirs.resultsDir, cfg.model, qid)
  if (existsSync(join(outDir, "answer.json"))) {
    console.log(`${qid}: already answered, skipping (resume mode)`)
    return
  }
  mkdirSync(outDir, { recursive: true })

  const system = [
    "You are the model-under-test in the pptfast benchmark, single-shot mode.",
    "You will receive the pptfast skill playbook, the tool's current vocabulary",
    "(IR JSON Schema, narrative presets, themes), and one deck request.",
    "Follow the playbook's content methodology to design the deck, then reply",
    "with ONLY the final IR JSON document (a single JSON object, no markdown",
    "fences, no commentary). You cannot run any command — pick narrative,",
    "theme, and components from the provided vocabulary and write the deck in",
    "one shot.",
  ].join(" ")
  const user = [
    "## Skill playbook (skills/pptfast/SKILL.md)\n\n" + shared.skill,
    "## IR JSON Schema (pptfast schema)\n\n```json\n" + shared.schema + "\n```",
    "## Narrative presets (pptfast narratives --json)\n\n```json\n" + shared.narratives + "\n```",
    "## Themes (pptfast themes --json)\n\n```json\n" + shared.themes + "\n```",
    "## Deck request\n\n" + prompt,
    "Reply with ONLY the IR JSON document.",
  ].join("\n\n---\n\n")

  const started = Date.now()
  const attempt = async () => {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(600_000),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 16384,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
  }
  let data: Awaited<ReturnType<typeof attempt>>
  try {
    data = await attempt().catch(() => attempt())
  } catch (e) {
    writeFileSync(
      join(outDir, "meta.json"),
      JSON.stringify({ model: cfg.model, mode: "single-shot", error: String(e).slice(0, 300) }, null, 2) + "\n",
    )
    console.error(`${qid}: failed after retry — ${String(e).slice(0, 120)}`)
    return
  }
  const answer = stripFence(data.choices[0]?.message.content ?? "")
  writeFileSync(join(outDir, "answer.json"), answer + "\n")
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify(
      {
        model: cfg.model,
        mode: "single-shot",
        duration_seconds: Math.round((Date.now() - started) / 100) / 10,
        tokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
      },
      null,
      2,
    ) + "\n",
  )
  let parse = "ok"
  try {
    JSON.parse(answer)
  } catch {
    parse = "UNPARSEABLE"
  }
  console.log(`${qid}: done (${answer.length} chars, json ${parse})`)
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2)
  const dirFlag = (name: string, fallback: string): string => {
    const prefix = `--${name}=`
    const hit = rawArgs.find((a) => a.startsWith(prefix))
    return hit ? resolve(ROOT, hit.slice(prefix.length)) : join(ROOT, fallback)
  }
  const questionsDir = dirFlag("questions-dir", "tests/bench/questions")
  const resultsDir = dirFlag("results-dir", "tests/bench/results")
  const modelOverride = flagValue(rawArgs, "model")
  const [prefixArg, ...qids] = rawArgs.filter((a) => !a.startsWith("--"))
  if (!prefixArg) throw new Error("usage: pnpm bench:run <env-prefix e.g. qwen|deepseek> [qids...] [--model=<id>]")
  const prefix = prefixArg.toUpperCase()
  const env = loadEnv()
  // `cfg.model` is also the result-directory tag (`runOne`'s `outDir` below
  // uses it directly) — a `--model` override therefore already lands runs
  // under the overridden model's own id, never mixed with `.env`'s
  // `<PREFIX>_MODEL` runs of the same prefix, with no extra tag-derivation
  // step needed (unlike `run-agentic.mts`'s `<prefix>-agentic` tag, which
  // does need one — see that file's `deriveModelTag`).
  const cfg = {
    baseUrl: env[`${prefix}_BASE_URL`],
    apiKey: env[`${prefix}_API_KEY`],
    model: modelOverride ?? env[`${prefix}_MODEL`],
  }
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) throw new Error(`missing ${prefix}_BASE_URL/_API_KEY/_MODEL in .env`)

  const questions =
    qids.length > 0 ? qids : readdirSync(questionsDir).filter((d) => /^[a-z]\d\d$/.test(d)).sort()
  const shared = {
    skill: readFileSync(join(ROOT, "skills/pptfast/SKILL.md"), "utf8"),
    schema: cliText(["schema"]),
    narratives: cliText(["narratives", "--json"]),
    themes: cliText(["themes", "--json"]),
  }
  console.log(`model ${cfg.model} · ${questions.length} questions · concurrency ${CONCURRENCY} · questions=${questionsDir} results=${resultsDir}`)
  const queue = [...questions]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let qid = queue.shift(); qid !== undefined; qid = queue.shift()) {
      await runOne({ baseUrl: cfg.baseUrl!, apiKey: cfg.apiKey!, model: cfg.model! }, qid, shared, {
        questionsDir,
        resultsDir,
      })
    }
  })
  await Promise.all(workers)
  console.log("run complete")
}

// Guarded the same way `run-agentic.mts` guards its own `main()` (added
// round-2, alongside that file's `--model` flag): unguarded top-level
// `await main()` ran unconditionally on import, which made this file
// impossible to import from a test for its pure helpers (`flagValue`)
// without also kicking off a real run. `main()` itself is unchanged.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
