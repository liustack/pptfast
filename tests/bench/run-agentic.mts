#!/usr/bin/env -S pnpm exec tsx
/**
 * Agentic tool-loop benchmark runner against an external OpenAI-compatible
 * API (BENCH-01, `.issues/2026-08-03-bench-agentic/plan.md`). Unlike
 * `run.mts` (one completion, model must answer with bare IR text), this
 * runner gives the model-under-test real function-calling tools — write a
 * file, read a file, list a directory, run the pptfast CLI — inside a
 * private per-question workspace, and lets it iterate: write IR, run
 * `validate`/`audit`, read the findings, fix, repeat. This is the mode
 * `tests/bench/README.md`'s "Run protocol" describes end to end; `run.mts`
 * is the stricter single-shot floor measurement next to it.
 *
 * Tool surface (deliberately minimal and neutral, plan 裁定 1): no general
 * shell. `run_pptfast` only accepts a whitelisted, read-only/artifact
 * subcommand — no `serve` (interactive), no `plan`/`scenarios` (removed
 * vocabulary-v4 aliases), no `check-update`/`self-update` (network side
 * effects unrelated to the benchmark). Every path argument to any tool —
 * `write_file`/`read_file`/`list_files`'s own `path`, and every non-flag
 * `run_pptfast` argument — is resolved against the workspace and rejected
 * if it is absolute or escapes the workspace via `..`. Symlink-based
 * escapes are out of scope (not checked) — the workspace is a
 * harness-created scratch directory the model itself populates, not
 * attacker-controlled input.
 *
 * No pre-injected vocabulary (schema/narratives/themes JSON) in the system
 * prompt — unlike `run.mts`, whose model has no tools and depends entirely
 * on injection. This runner's model can call `run_pptfast schema` /
 * `narratives --json` / `themes --json` itself, exactly what
 * `tests/bench/README.md`'s run protocol and the SKILL playbook already
 * describe ("give the model SKILL.md + prompt.md, let it run the SKILL's
 * workflow"). Injecting the vocabulary anyway would be a convenience that
 * the protocol never asked for and that `run.mts` already covers as the
 * no-tools floor measurement — dropping it here is more protocol-faithful,
 * not a shortcut, and it is most of this runner's ~83k-token-per-round
 * system prompt cost.
 *
 * Tool-result cap: every tool's return string is capped at
 * `TOOL_RESULT_MAX_CHARS` before it goes back into the conversation — see
 * that constant's own comment for the size and the truncate-from-the-end
 * rationale.
 *
 * Round cap: `ROUND_CAP` chat-completion calls total (plan 裁定 2, raised
 * twice since — see that constant's own doc comment for the history) — one
 * round may contain several tool calls, they all count as one round. Hitting
 * the cap stops the run with `cap_hit: true` in meta.json; whatever the
 * model wrote up to that point is left in place, same as a natural stop.
 *
 * meta.json is harness-written, never model-self-reported (2026-07-20's
 * archived round found model-reported identity untrustworthy) — it records
 * both `model_requested` (the .env `<PREFIX>_MODEL` value we asked for) and
 * `model_reported` (the `model` field the API actually echoed back, per
 * round, deduplicated) side by side without reconciling them.
 *
 * Usage: `pnpm bench:agentic <prefix> [q01 q02 ...]` (default: all
 * questions in questionsDir). Same `.env` credential shape as `run.mts`:
 * `<PREFIX>_BASE_URL` / `<PREFIX>_API_KEY` / `<PREFIX>_MODEL`.
 */
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const CLI = join(ROOT, "dist/cli.js")
/** Fixed round cap, identical across every question and model in a batch.
 *  Raised 24 → 32 before the first full batch: the post-slim smoke (q01,
 *  the bank's gentlest question, on the stronger of the two weak models)
 *  already used 21 rounds once vocabulary self-querying replaced injection.
 *  Raised 32 → 48 before round 2 (`.issues/notes/2026-08-04-bench-first-agentic.md`):
 *  the first full batch hit the 32-round cap on 8 of 40 deepseek runs and 7
 *  of 40 qwen runs, concentrated in the five deck-project questions
 *  (q03/q06/q08/q13/q17) — their five-phase spec→pages→assemble→validate→
 *  render workflow eats rounds faster than a single bare-IR file. Those
 *  runs' half-finished artifacts (an unfilled placeholder page, an item
 *  missing a field) scored as failures purely from running out of budget,
 *  not from producing wrong content — round 1's own report calls the
 *  resulting scores "a conservative lower bound".
 *  The cap is a cost guard, not part of the benchmark's difficulty — a cap
 *  tight enough to clip real runs would measure budget, not capability. */
const ROUND_CAP = 48
/** Tool-result content is truncated before it goes back to the model — a
 *  validate/audit dump or a long file read should not blow the context
 *  window on its own, and an unbounded result is the other big lever on
 *  this runner's per-round token cost next to the vocabulary-injection cut
 *  above (plan 裁定 2). 8000 chars (~2000 tokens) is standard agent-harness
 *  practice for a single tool result — generous enough that a real
 *  `validate`/`audit` dump or a normal IR file read round-trips intact for
 *  a single deck (empirically a few KB), while still bounding the
 *  pathological case (a huge stray file the model asks to read back). */
const TOOL_RESULT_MAX_CHARS = 8_000
/** Per-completion-call network timeout. A single round's `max_tokens` here
 *  (8192) is far smaller than `run.mts`'s single-shot 16384, so it needs
 *  much less time than that runner's 10-minute allowance — 3 minutes is
 *  generous headroom for a slow provider while still failing a genuinely
 *  hung request well before the harness's own process-level timeout would
 *  otherwise be the only thing to notice. */
const ROUND_TIMEOUT_MS = 180_000
/** Overall wall-clock budget for one question's whole tool loop, independent
 *  of the round cap — `ROUND_CAP` rounds at the per-round timeout above
 *  could in the worst case take hours; a batch runner that can hang for
 *  hours on one question is not shippable (found the hard way: a first smoke attempt ran
 *  past this harness's own orchestrating process's timeout with no internal
 *  deadline of its own to explain why). Checked before starting each new
 *  round, not mid-round — a round already in flight is left to its own
 *  `ROUND_TIMEOUT_MS` (worst case ~2× that, since `callRound` retries a
 *  failed request once — the run can overshoot this deadline by up to
 *  ~6 minutes, which is acceptable slack for a kill-switch, not a
 *  scheduler). */
const RUN_DEADLINE_MS = 25 * 60_000

// ── shared with run.mts (small enough to duplicate rather than couple two
// independently-runnable scripts to a new shared module — see task report) ──

export function loadEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) throw new Error(".env not found at repo root — see tests/bench/run.mts header")
  const out: Record<string, string> = {}
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (m) out[m[1]!] = m[2]!
  }
  return out
}

/** Strip a ```json fence when the model wraps its answer in one — same
 *  convention as `run.mts`'s single-shot answer handling. */
export function stripFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(text)
  return (fenced ? fenced[1]! : text).trim()
}

// ── path safety (plan 裁定 1: reject `..`/absolute escapes; symlinks out of scope) ──

export interface PathCheckOk {
  ok: true
  resolved: string
}
export interface PathCheckFail {
  ok: false
  reason: string
}
export type PathCheck = PathCheckOk | PathCheckFail

/**
 * Resolves `relPath` against `workspace` and confirms the result stays
 * inside it. Rejects an absolute `relPath` outright (an absolute path is an
 * escape attempt by construction — resolving it against workspace would
 * just discard workspace and use the absolute path verbatim), and rejects
 * any `..` traversal that walks the resolved path outside workspace. A
 * `..` that stays inside workspace (e.g. `a/../b`) is allowed — the
 * contract is "stay inside", not "never write `..`". Symlink escapes
 * (a workspace-relative path that resolves lexically inside workspace but
 * points, via a symlink, at a target outside it) are not checked — out of
 * scope for this harness, see file header.
 */
export function checkPathSafety(workspace: string, relPath: string): PathCheck {
  if (isAbsolute(relPath)) {
    return { ok: false, reason: `absolute path not allowed: ${relPath}` }
  }
  const resolved = resolve(workspace, relPath)
  if (resolved !== workspace && !resolved.startsWith(workspace + sep)) {
    return { ok: false, reason: `path escapes workspace: ${relPath}` }
  }
  return { ok: true, resolved }
}

/** Pulls the path-ish value out of a `run_pptfast` argv token for the
 *  safety scan below: a bare positional token is checked as-is, an
 *  `--opt=value`/`-o=value` token is checked on its `value` half, and a
 *  bare flag name (`--json`, or `-o` whose value is the *next* token) is
 *  skipped here — the next token, not starting with `-`, gets checked on
 *  its own turn. This intentionally also runs the check against non-path
 *  values (a theme id, a port number) — resolving `"luxe"` against
 *  workspace just yields `workspace/luxe`, which is trivially inside
 *  workspace, so it passes harmlessly. */
function pathishToken(token: string): string | null {
  if (!token.startsWith("-")) return token
  const eq = token.indexOf("=")
  return eq === -1 ? null : token.slice(eq + 1)
}

// ── run_pptfast subcommand whitelist (plan 裁定 1: read-only/artifact only, no serve) ──

/** Top-level subcommands allowed through `run_pptfast`. Excludes `serve`
 *  (interactive/long-running), `plan`/`scenarios` (removed vocabulary-v4
 *  aliases that only exist to print a rename error), and
 *  `check-update`/`self-update` (network side effects with no benchmark
 *  value). `init` is excluded too — nothing in the SKILL workflow this
 *  harness exercises needs a scaffolded `pptfast.config.json`. */
const ALLOWED_SUBCOMMANDS = new Set([
  "render",
  "validate",
  "audit",
  "asset-brief",
  "schema",
  "assemble",
  "disassemble",
  "migrate",
  "themes",
  "narratives",
  "preview",
])

export interface ArgsCheck {
  ok: boolean
  reason?: string
}

/** Validates a `run_pptfast` argv array before it is ever spawned: the
 *  subcommand (and, for the `spec` group, its one allowed sub-subcommand
 *  `spec validate`) must be on the whitelist, and every path-ish token must
 *  stay inside `workspace` (see `checkPathSafety`). */
export function checkPptfastArgs(args: string[], workspace: string): ArgsCheck {
  if (args.length === 0) return { ok: false, reason: "no subcommand given" }
  const [head, ...rest] = args
  if (head === "spec") {
    if (rest[0] !== "validate") {
      return { ok: false, reason: `subcommand not allowed: spec ${rest[0] ?? ""} (only "spec validate" is)` }
    }
  } else if (!ALLOWED_SUBCOMMANDS.has(head!)) {
    return {
      ok: false,
      reason: `subcommand not allowed: ${head} (allowed: ${[...ALLOWED_SUBCOMMANDS].join(", ")}, spec validate)`,
    }
  }
  for (const token of args) {
    const pathish = pathishToken(token)
    if (pathish === null) continue
    const check = checkPathSafety(workspace, pathish)
    if (!check.ok) return { ok: false, reason: check.reason }
  }
  return { ok: true }
}

// ── scripted-reply classification (README's two fixed human lines) ──

export type ModelTurnKind = "spec-confirmation" | "other-question" | "stop"

const SPEC_CONFIRMATION_REPLY = "Spec confirmed, proceed."
const OTHER_QUESTION_REPLY = "Proceed with your best judgment."

/**
 * Classifies a model turn that made no tool calls: is it asking for
 * confirmation of a spec it just proposed (README's Phase 2 "propose and
 * confirm" gate — gets the verbatim `"Spec confirmed, proceed."` line), some
 * other clarifying question (gets `"Proceed with your best judgment."`), or
 * a genuine stop (no scripted reply — the run ends)? Heuristic, not a
 * language-understanding classifier: a turn "looks like a question" when it
 * ends in `?` or uses one of a small set of confirmation-seeking phrases,
 * and among those, one "mentions a spec" when it names `spec`/`deck.spec`/
 * `plan`. A weak model's phrasing varies — this is deliberately generous on
 * the question side (a false-positive "question" just spends one scripted
 * reply and one extra round, cheap) and narrow on the spec side (a
 * false-positive "spec confirmation" would put words about spec approval
 * into the model's mouth for an unrelated question).
 */
export function classifyModelTurn(content: string): ModelTurnKind {
  const trimmed = content.trim()
  if (!trimmed) return "stop"
  const looksLikeQuestion =
    /\?\s*$/.test(trimmed) ||
    /\b(confirm|shall i|should i proceed|is this (ok|okay|good)|please (advise|confirm)|may i proceed)\b/i.test(
      trimmed,
    )
  if (!looksLikeQuestion) return "stop"
  const mentionsSpec = /\b(spec|deck\.spec|plan)\b/i.test(trimmed)
  return mentionsSpec ? "spec-confirmation" : "other-question"
}

export function scriptedReplyFor(kind: "spec-confirmation" | "other-question"): string {
  return kind === "spec-confirmation" ? SPEC_CONFIRMATION_REPLY : OTHER_QUESTION_REPLY
}

// ── meta.json assembly (plan 裁定 2: harness-written, requested vs reported) ──

export interface RunMeta {
  provider_prefix: string
  base_url_host: string
  model_requested: string
  model_reported: string[]
  mode: "agentic"
  rounds: number
  tool_calls: number
  prompt_tokens: number
  completion_tokens: number
  started_at: string
  duration_seconds: number
  cap_hit: boolean
  /** True when the run stopped early because it hit `RUN_DEADLINE_MS`
   *  (25 minutes), separate from `cap_hit` (the `ROUND_CAP`-round cap) — additive
   *  field beyond plan 裁定 2's base meta shape, added after a first smoke
   *  attempt had no overall deadline of its own and outlived this harness's
   *  own orchestrating process with no record of why. `cap_hit` keeps its
   *  documented meaning (round cap only); this field names the other way a
   *  run can stop short of a natural finish. */
  deadline_hit: boolean
  scripted_replies: number
  /** Sum, across every round, of whatever prompt-cache-hit field the
   *  provider's response carries (plan 裁定 3) — DeepSeek's
   *  `usage.prompt_cache_hit_tokens`, dashscope/OpenAI-shaped
   *  `usage.prompt_tokens_details.cached_tokens`. Read defensively: a
   *  provider that reports neither field contributes 0, not undefined.
   *  Additive field beyond plan 裁定 2's base meta shape — a diagnostic
   *  alongside `prompt_tokens`, not used in any pass/fail decision. */
  cached_prompt_tokens: number
}

export function buildMeta(params: {
  providerPrefix: string
  baseUrl: string
  modelRequested: string
  modelReported: Set<string>
  rounds: number
  toolCalls: number
  promptTokens: number
  completionTokens: number
  startedAt: number
  finishedAt: number
  capHit: boolean
  deadlineHit: boolean
  scriptedReplies: number
  cachedPromptTokens: number
}): RunMeta {
  return {
    provider_prefix: params.providerPrefix,
    base_url_host: new URL(params.baseUrl).host,
    model_requested: params.modelRequested,
    model_reported: [...params.modelReported].sort(),
    mode: "agentic",
    rounds: params.rounds,
    tool_calls: params.toolCalls,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    started_at: new Date(params.startedAt).toISOString(),
    duration_seconds: Math.round((params.finishedAt - params.startedAt) / 100) / 10,
    cap_hit: params.capHit,
    deadline_hit: params.deadlineHit,
    scripted_replies: params.scriptedReplies,
    cached_prompt_tokens: params.cachedPromptTokens,
  }
}

// ── artifact placement: score.mts reads `<resultsDir>/<model-tag>/<qid>/`
// directly (a bare *.json or a deck.spec.json project), not the workspace/
// subdirectory the model actually worked in — so after the run ends, the
// harness (not the model) locates the model's final artifact inside
// workspace/ and copies it up one level into the question's result root. ──

export type LocatedArtifact =
  | { kind: "deck-project"; dir: string }
  | { kind: "bare-ir"; file: string }
  | { kind: "none" }

/** Depth-first walk of `dir`, returning every file's path relative to
 *  `base`. Small, bounded workspaces only (a benchmark question's own
 *  output) — no symlink handling, no cycle guard, matching this file's
 *  documented "symlink tricks out of scope". */
function walkFiles(dir: string, base: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(full, base))
    else if (e.isFile()) out.push(relative(base, full))
  }
  return out
}

/** Same walk, but returns every entry (files and directories, directories
 *  suffixed `/`) — used for the `list_files` tool so the model can see
 *  workspace structure, not just leaf files. */
function walkEntries(dir: string, base: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      out.push(relative(base, full) + "/")
      out.push(...walkEntries(full, base))
    } else {
      out.push(relative(base, full))
    }
  }
  return out
}

/**
 * Finds the model's final deck artifact inside `workspaceDir`. Preference
 * order: (1) a deck-project directory — the shallowest `deck.spec.json`
 * found anywhere in the workspace — copied whole (its `deck.spec.json`,
 * `pages/`, and `assets/` if present); (2) if no deck project exists,
 * exactly one bare `*.json` file anywhere in the workspace; (3) with
 * several `*.json` candidates and no deck project, prefer one literally
 * named `deck.json` or `ir.json` (the convention the harness preamble asks
 * the model to use), else the most recently modified one — documented
 * best-effort tie-break, not a hard guarantee of picking the "right" file
 * for a model that scattered several unrelated JSON files around.
 */
export function locateArtifact(workspaceDir: string): LocatedArtifact {
  const allFiles = walkFiles(workspaceDir, workspaceDir)
  const specFiles = allFiles
    .filter((f) => f === "deck.spec.json" || f.endsWith(`${sep}deck.spec.json`) || f.endsWith("/deck.spec.json"))
    .sort((a, b) => a.length - b.length)
  if (specFiles.length > 0) {
    return { kind: "deck-project", dir: join(workspaceDir, dirname(specFiles[0]!)) }
  }
  const jsonFiles = allFiles.filter((f) => f.endsWith(".json"))
  if (jsonFiles.length === 0) return { kind: "none" }
  if (jsonFiles.length === 1) return { kind: "bare-ir", file: join(workspaceDir, jsonFiles[0]!) }
  const conventional = jsonFiles.find((f) => f === "deck.json" || f === "ir.json")
  if (conventional) return { kind: "bare-ir", file: join(workspaceDir, conventional) }
  const newest = jsonFiles
    .map((f) => ({ f, mtime: statSync(join(workspaceDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]!.f
  return { kind: "bare-ir", file: join(workspaceDir, newest) }
}

/** Copies the located artifact into `resultDir` (the question root
 *  `score.mts` reads), returns a short description for logging. `none`
 *  leaves `resultDir` with only meta.json — a legitimate, recorded failure
 *  (`score.mts`'s "no artifact found" reason), not a thrown error. */
export function placeArtifact(located: LocatedArtifact, resultDir: string): string {
  if (located.kind === "none") return "no artifact found in workspace"
  if (located.kind === "bare-ir") {
    const dest = join(resultDir, "deck.json")
    cpSync(located.file, dest)
    return `copied bare IR ${relative(resultDir, located.file)} -> deck.json`
  }
  // deck-project: copy deck.spec.json + pages/ + assets/ (if present) — the
  // parts `readDeckDir` (src/cli/deck-dir.ts) looks for.
  for (const name of ["deck.spec.json", "pages", "assets"]) {
    const src = join(located.dir, name)
    if (existsSync(src)) cpSync(src, join(resultDir, name), { recursive: true })
  }
  return `copied deck project ${relative(resultDir, located.dir)} -> result root`
}

// ── tool implementations ──

/**
 * Caps a tool result at `maxChars`, truncating from the end and keeping the
 * head — a CLI error or summary line leads its own output, so the part worth
 * keeping under a cap is the start, not the tail (plan 裁定 2). An over-cap
 * result gets a trailing marker line stating the original length, so the
 * model (and a human reading a transcript) can tell truncation happened and
 * how much was cut, rather than mistaking a cut-off result for the whole
 * thing. Pure and exported for unit testing; production call sites pass the
 * module constant `TOOL_RESULT_MAX_CHARS`.
 */
export function truncateForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[truncated: ${maxChars} of ${text.length} chars shown]`
}

function doWriteFile(workspace: string, args: unknown): string {
  const { path, content } = (args ?? {}) as { path?: unknown; content?: unknown }
  if (typeof path !== "string" || typeof content !== "string") {
    return "ERROR: write_file requires {path: string, content: string}"
  }
  const check = checkPathSafety(workspace, path)
  if (!check.ok) return `ERROR: ${check.reason}`
  mkdirSync(dirname(check.resolved), { recursive: true })
  writeFileSync(check.resolved, content, "utf8")
  return `wrote ${Buffer.byteLength(content, "utf8")} bytes to ${path}`
}

function doReadFile(workspace: string, args: unknown): string {
  const { path } = (args ?? {}) as { path?: unknown }
  if (typeof path !== "string") return "ERROR: read_file requires {path: string}"
  const check = checkPathSafety(workspace, path)
  if (!check.ok) return `ERROR: ${check.reason}`
  if (!existsSync(check.resolved)) return `ERROR: no such file: ${path}`
  if (statSync(check.resolved).isDirectory()) return `ERROR: ${path} is a directory, not a file`
  return truncateForModel(readFileSync(check.resolved, "utf8"), TOOL_RESULT_MAX_CHARS)
}

function doListFiles(workspace: string, args: unknown): string {
  const raw = (args ?? {}) as { path?: unknown }
  const rel = typeof raw.path === "string" ? raw.path : "."
  const check = checkPathSafety(workspace, rel)
  if (!check.ok) return `ERROR: ${check.reason}`
  if (!existsSync(check.resolved)) return `ERROR: no such path: ${rel}`
  if (!statSync(check.resolved).isDirectory()) return `ERROR: not a directory: ${rel}`
  const listing = walkEntries(check.resolved, check.resolved)
  return truncateForModel(listing.length > 0 ? listing.join("\n") : "(empty)", TOOL_RESULT_MAX_CHARS)
}

function doRunPptfast(workspace: string, args: unknown): string {
  const raw = (args ?? {}) as { args?: unknown }
  if (!Array.isArray(raw.args) || !raw.args.every((a): a is string => typeof a === "string")) {
    return 'ERROR: run_pptfast requires {args: string[]}, e.g. {"args": ["validate", "deck.json"]}'
  }
  const argv = raw.args
  const check = checkPptfastArgs(argv, workspace)
  if (!check.ok) return `ERROR: ${check.reason}`
  try {
    const stdout = execFileSync("node", [CLI, ...argv], {
      encoding: "utf8",
      cwd: workspace,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    return truncateForModel(`exit 0\n${stdout}`, TOOL_RESULT_MAX_CHARS)
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message: string }
    const body = [err.stdout, err.stderr].filter(Boolean).join("\n") || err.message
    return truncateForModel(`exit ${err.status ?? "?"}\n${body}`, TOOL_RESULT_MAX_CHARS)
  }
}

interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

function executeTool(tc: ToolCall, workspace: string): string {
  let args: unknown
  try {
    args = JSON.parse(tc.function.arguments || "{}")
  } catch (e) {
    return `ERROR: malformed arguments JSON for ${tc.function.name}: ${(e as Error).message}`
  }
  try {
    switch (tc.function.name) {
      case "write_file":
        return doWriteFile(workspace, args)
      case "read_file":
        return doReadFile(workspace, args)
      case "list_files":
        return doListFiles(workspace, args)
      case "run_pptfast":
        return doRunPptfast(workspace, args)
      default:
        return `ERROR: unknown tool ${tc.function.name}`
    }
  } catch (e) {
    return truncateForModel(`ERROR: ${(e as Error).message}`, TOOL_RESULT_MAX_CHARS)
  }
}

// ── tool schema (OpenAI-compatible function calling) ──

const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file inside your private workspace. Parent directories are created automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to your workspace root. No absolute paths, no .. escapes." },
          content: { type: "string", description: "Full file content to write." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file inside your private workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path relative to your workspace root." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories under a path inside your private workspace (recursive).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to your workspace root. Defaults to the workspace root." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_pptfast",
      description:
        'Run the pptfast CLI inside your workspace, e.g. {"args": ["validate", "deck.json"]}. Only read-only and ' +
        "artifact-producing subcommands are available: render, validate, audit, asset-brief, schema, assemble, " +
        "disassemble, migrate, themes, narratives, preview, spec validate. There is no serve command.",
      parameters: {
        type: "object",
        properties: {
          args: { type: "array", items: { type: "string" }, description: 'CLI arguments, e.g. ["validate", "deck.json"].' },
        },
        required: ["args"],
      },
    },
  },
] as const

// ── chat completion round ──

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

interface ChatCompletionUsage {
  prompt_tokens?: number
  completion_tokens?: number
  /** DeepSeek's cache-hit field (plan 裁定 3). */
  prompt_cache_hit_tokens?: number
  /** dashscope/OpenAI-shaped cache-hit field (plan 裁定 3). */
  prompt_tokens_details?: { cached_tokens?: number }
}

interface ChatCompletionResponse {
  model?: string
  choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>
  usage?: ChatCompletionUsage
}

/**
 * Reads whichever prompt-cache-hit field a provider's `usage` object
 * carries (plan 裁定 3): DeepSeek's `prompt_cache_hit_tokens`, or
 * dashscope/OpenAI-shaped `prompt_tokens_details.cached_tokens`. Purely
 * defensive — a field a provider doesn't report is treated as 0, never
 * undefined, and an `usage` that is itself absent (a failed/malformed
 * response) also reads as 0.
 *
 * The two fields are ALIASES for the same quantity, never independent
 * counters — take one, never sum. The first full batch (2026-08-04)
 * proved DeepSeek populates both with the same value on every response;
 * the original "sum both" implementation double-counted every question
 * at exactly ratio 1.96-2.00 (archived metas are the evidence), which
 * overstated cached volume and initially misread the round's hit rate.
 */
export function extractCachedTokens(usage: ChatCompletionUsage | undefined): number {
  if (!usage) return 0
  return usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0
}

async function callRound(
  cfg: { baseUrl: string; apiKey: string; model: string },
  messages: ChatMessage[],
): Promise<ChatCompletionResponse> {
  const attempt = async () => {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(ROUND_TIMEOUT_MS),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 8192,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as ChatCompletionResponse
  }
  return attempt().catch(() => attempt())
}

// ── per-question run ──

async function runOneAgentic(
  cfg: { baseUrl: string; apiKey: string; model: string },
  providerPrefix: string,
  qid: string,
  shared: { skill: string },
  dirs: { questionsDir: string; resultsDir: string },
  modelTag: string,
): Promise<void> {
  const prompt = readFileSync(join(dirs.questionsDir, qid, "prompt.md"), "utf8")
  const resultDir = join(dirs.resultsDir, modelTag, qid)
  const workspace = join(resultDir, "workspace")
  if (existsSync(join(resultDir, "meta.json"))) {
    console.log(`${qid}: already run, skipping (resume mode)`)
    return
  }
  mkdirSync(workspace, { recursive: true })

  const system = [
    "You are the model-under-test in the pptfast benchmark, agentic tool-loop mode.",
    "You have four tools: write_file(path, content), read_file(path), list_files(path?), run_pptfast(args).",
    "All paths are relative to your private workspace directory — you cannot read or write anything outside",
    "it, and absolute paths or \"..\" paths that escape the workspace are rejected.",
    "run_pptfast runs the pptfast CLI (node dist/cli.js) with your workspace as its current directory; only",
    "read-only and artifact-producing subcommands are available (render, validate, audit, asset-brief, schema,",
    "assemble, disassemble, migrate, themes, narratives, preview, spec validate) — there is no interactive",
    "serve command and no general shell access.",
    "The IR JSON Schema, narrative presets, and theme catalog are not preloaded below — run",
    "run_pptfast(['schema']) / run_pptfast(['narratives', '--json']) / run_pptfast(['themes', '--json']) yourself",
    "whenever you need them, the same way the SKILL playbook expects.",
    "Use the SKILL playbook below to design and build the deck: write your IR (or deck-project files) with",
    "write_file, run validate/audit with run_pptfast, read what they report, and fix what needs fixing — the",
    "same self-check loop the playbook describes, with real tool access instead of imagined output.",
    "Save your final deck as a single IR JSON file at your workspace root (e.g. deck.json), or, for the",
    "deck-project workflow, as deck.spec.json plus pages/ at your workspace root.",
    `You have at most ${ROUND_CAP} completion turns total for this question (a turn spent making tool calls still`,
    "counts once, no matter how many tools it calls in that turn) — use them efficiently. When the deck is",
    "finished, stop calling tools and reply in plain text confirming it's done.",
  ].join(" ")
  const user = [
    "## Skill playbook (skills/pptfast/SKILL.md)\n\n" + shared.skill,
    "## Deck request\n\n" + prompt,
  ].join("\n\n---\n\n")

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ]

  const startedAt = Date.now()
  let roundsCompleted = 0
  let toolCalls = 0
  let scriptedReplies = 0
  let promptTokens = 0
  let completionTokens = 0
  let cachedPromptTokens = 0
  const modelReported = new Set<string>()
  let finalText: string | undefined
  let deadlineHit = false

  try {
    while (roundsCompleted < ROUND_CAP) {
      if (Date.now() - startedAt >= RUN_DEADLINE_MS) {
        deadlineHit = true
        break
      }
      roundsCompleted++
      const data = await callRound(cfg, messages)
      if (data.model) modelReported.add(data.model)
      promptTokens += data.usage?.prompt_tokens ?? 0
      completionTokens += data.usage?.completion_tokens ?? 0
      cachedPromptTokens += extractCachedTokens(data.usage)

      const msg = data.choices[0]?.message
      const assistantMsg: ChatMessage = { role: "assistant", content: msg?.content ?? null }
      if (msg?.tool_calls && msg.tool_calls.length > 0) assistantMsg.tool_calls = msg.tool_calls
      messages.push(assistantMsg)

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        toolCalls += assistantMsg.tool_calls.length
        for (const tc of assistantMsg.tool_calls) {
          const result = executeTool(tc, workspace)
          messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result })
        }
        continue
      }

      const content = assistantMsg.content ?? ""
      const kind = classifyModelTurn(content)
      if (kind === "stop") {
        finalText = content
        break
      }
      scriptedReplies++
      messages.push({ role: "user", content: scriptedReplyFor(kind) })
    }
  } catch (e) {
    writeFileSync(
      join(resultDir, "meta.json"),
      JSON.stringify(
        {
          provider_prefix: providerPrefix,
          base_url_host: new URL(cfg.baseUrl).host,
          model_requested: cfg.model,
          mode: "agentic",
          rounds: roundsCompleted,
          error: String(e).slice(0, 300),
        },
        null,
        2,
      ) + "\n",
    )
    console.error(`${qid}: failed after ${roundsCompleted} round(s) — ${String(e).slice(0, 200)}`)
    return
  }

  const capHit = !deadlineHit && finalText === undefined && roundsCompleted >= ROUND_CAP

  const located = locateArtifact(workspace)
  let placementNote: string
  if (located.kind !== "none") {
    placementNote = placeArtifact(located, resultDir)
  } else if (finalText !== undefined && stripFence(finalText).length > 0) {
    const text = stripFence(finalText)
    try {
      JSON.parse(text)
      writeFileSync(join(resultDir, "answer.json"), text + "\n")
      placementNote = "no workspace artifact — saved final message text as answer.json (single-shot convention)"
    } catch {
      placementNote = "no workspace artifact and final message text is not parseable JSON — nothing saved"
    }
  } else {
    placementNote = "no workspace artifact and no final message text — nothing saved"
  }

  const meta = buildMeta({
    providerPrefix,
    baseUrl: cfg.baseUrl,
    modelRequested: cfg.model,
    modelReported,
    rounds: roundsCompleted,
    toolCalls,
    promptTokens,
    completionTokens,
    startedAt,
    finishedAt: Date.now(),
    capHit,
    deadlineHit,
    scriptedReplies,
    cachedPromptTokens,
  })
  writeFileSync(join(resultDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n")
  console.log(
    `${qid}: done — ${roundsCompleted} round(s), ${toolCalls} tool call(s), ${scriptedReplies} scripted repl(y/ies), ` +
      `cap_hit=${capHit} deadline_hit=${deadlineHit} — ${placementNote}`,
  )
}

// ── CLI entry ──

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2)
  const dirFlag = (name: string, fallback: string): string => {
    const prefix = `--${name}=`
    const hit = rawArgs.find((a) => a.startsWith(prefix))
    return hit ? resolve(ROOT, hit.slice(prefix.length)) : join(ROOT, fallback)
  }
  const questionsDir = dirFlag("questions-dir", "tests/bench/questions")
  const resultsDir = dirFlag("results-dir", "tests/bench/results")
  const [prefixArg, ...qids] = rawArgs.filter((a) => !a.startsWith("--"))
  if (!prefixArg) throw new Error("usage: pnpm bench:agentic <env-prefix e.g. qwen|deepseek> [qids...]")
  const prefix = prefixArg.toUpperCase()
  const env = loadEnv(join(ROOT, ".env"))
  const cfg = { baseUrl: env[`${prefix}_BASE_URL`], apiKey: env[`${prefix}_API_KEY`], model: env[`${prefix}_MODEL`] }
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) throw new Error(`missing ${prefix}_BASE_URL/_API_KEY/_MODEL in .env`)
  const modelTag = `${prefix.toLowerCase()}-agentic`

  const questions = qids.length > 0 ? qids : readdirSync(questionsDir).filter((d) => /^[a-z]\d\d$/.test(d)).sort()
  // Unlike run.mts's shared object, no schema/narratives/themes CLI calls
  // here — the agentic model queries live vocabulary itself via run_pptfast
  // (plan 裁定 1, see file header).
  const shared = {
    skill: readFileSync(join(ROOT, "skills/pptfast/SKILL.md"), "utf8"),
  }
  console.log(
    `model-tag ${modelTag} · ${questions.length} question(s) · round cap ${ROUND_CAP} · sequential · ` +
      `questions=${questionsDir} results=${resultsDir}`,
  )
  for (const qid of questions) {
    await runOneAgentic(
      { baseUrl: cfg.baseUrl!, apiKey: cfg.apiKey!, model: cfg.model! },
      prefix,
      qid,
      shared,
      { questionsDir, resultsDir },
      modelTag,
    )
  }
  console.log("run complete")
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
