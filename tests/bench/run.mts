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
 *   pnpm bench:run <prefix> [q01 q02 ...]   (default: all 20 questions)
 * e.g. pnpm bench:run qwen · pnpm bench:run deepseek q01 q07
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

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

/** Strip a ```json fence when the model wraps its answer in one. */
function stripFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(text)
  return (fenced ? fenced[1]! : text).trim()
}

async function runOne(
  cfg: { baseUrl: string; apiKey: string; model: string },
  qid: string,
  shared: { skill: string; schema: string; narratives: string; themes: string },
): Promise<void> {
  const promptPath = join(ROOT, "tests/bench/questions", qid, "prompt.md")
  const prompt = readFileSync(promptPath, "utf8")
  const outDir = join(ROOT, "tests/bench/results", cfg.model, qid)
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
  const [prefixArg, ...qids] = process.argv.slice(2)
  if (!prefixArg) throw new Error("usage: pnpm bench:run <env-prefix e.g. qwen|deepseek> [qids...]")
  const prefix = prefixArg.toUpperCase()
  const env = loadEnv()
  const cfg = { baseUrl: env[`${prefix}_BASE_URL`], apiKey: env[`${prefix}_API_KEY`], model: env[`${prefix}_MODEL`] }
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) throw new Error(`missing ${prefix}_BASE_URL/_API_KEY/_MODEL in .env`)

  const questions =
    qids.length > 0 ? qids : readdirSync(join(ROOT, "tests/bench/questions")).filter((d) => /^q\d\d$/.test(d)).sort()
  const shared = {
    skill: readFileSync(join(ROOT, "skills/pptfast/SKILL.md"), "utf8"),
    schema: cliText(["schema"]),
    narratives: cliText(["narratives", "--json"]),
    themes: cliText(["themes", "--json"]),
  }
  console.log(`model ${cfg.model} · ${questions.length} questions · concurrency ${CONCURRENCY}`)
  const queue = [...questions]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let qid = queue.shift(); qid !== undefined; qid = queue.shift()) {
      await runOne({ baseUrl: cfg.baseUrl!, apiKey: cfg.apiKey!, model: cfg.model! }, qid, shared)
    }
  })
  await Promise.all(workers)
  console.log("run complete")
}

await main()
