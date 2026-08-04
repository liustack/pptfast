// @vitest-environment node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildMeta,
  checkPathSafety,
  checkPptfastArgs,
  classifyModelTurn,
  copyQuestionAssets,
  extractCachedTokens,
  locateArtifact,
  placeArtifact,
  scriptedReplyFor,
  stripFence,
  truncateForModel,
} from "./run-agentic.mts"

// ── checkPathSafety — the tool-surface escape guard (plan 裁定 1) ──

describe("checkPathSafety", () => {
  const workspace = join(sep, "fake", "workspace")

  it("accepts a plain relative path inside the workspace", () => {
    const result = checkPathSafety(workspace, "deck.json")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved).toBe(join(workspace, "deck.json"))
  })

  it("accepts a nested relative path inside the workspace", () => {
    const result = checkPathSafety(workspace, "pages/p-cover.json")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved).toBe(join(workspace, "pages", "p-cover.json"))
  })

  it("accepts the workspace root itself (\".\")", () => {
    const result = checkPathSafety(workspace, ".")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved).toBe(workspace)
  })

  it("accepts a .. that stays inside the workspace", () => {
    const result = checkPathSafety(workspace, "pages/../deck.json")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved).toBe(join(workspace, "deck.json"))
  })

  it("rejects a .. that escapes the workspace", () => {
    const result = checkPathSafety(workspace, "../outside.json")
    expect(result.ok).toBe(false)
  })

  it("rejects a deeply nested .. escape", () => {
    const result = checkPathSafety(workspace, "pages/../../outside.json")
    expect(result.ok).toBe(false)
  })

  it("rejects an absolute path", () => {
    const result = checkPathSafety(workspace, "/etc/passwd")
    expect(result.ok).toBe(false)
  })

  it("rejects an absolute path even when it happens to be inside the workspace tree", () => {
    // Absolute paths are rejected outright regardless of where they point —
    // "no absolute paths" is the contract, not "no absolute paths outside
    // the workspace" (see run-agentic.mts's checkPathSafety doc comment).
    const result = checkPathSafety(workspace, join(workspace, "deck.json"))
    expect(result.ok).toBe(false)
  })

  it("rejects a sibling directory sharing the workspace name as a prefix", () => {
    // The classic prefix-trap: `/fake/workspace-evil/x` starts with
    // `/fake/workspace` as a raw string but is outside it — the guard must
    // compare against `workspace + sep`, not the bare prefix. (Wave-review
    // finding: the implementation was correct, this pins it.)
    const result = checkPathSafety(workspace, join("..", "workspace-evil", "x.json"))
    expect(result.ok).toBe(false)
  })

  it("accepts an empty path as the workspace root", () => {
    // `resolve(workspace, "")` is the workspace itself — same contract as
    // the explicit "." case above. Downstream fs calls on a directory fail
    // safely inside executeTool's try/catch, so ok:true here is harmless.
    const result = checkPathSafety(workspace, "")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved).toBe(workspace)
  })
})

// ── checkPptfastArgs — run_pptfast subcommand whitelist + path safety ──

describe("checkPptfastArgs", () => {
  const workspace = join(sep, "fake", "workspace")

  it("allows a whitelisted read-only subcommand with an in-workspace path", () => {
    expect(checkPptfastArgs(["validate", "deck.json"], workspace)).toEqual({ ok: true })
  })

  it("allows every documented whitelisted subcommand", () => {
    for (const cmd of ["render", "validate", "audit", "asset-brief", "schema", "assemble", "disassemble", "migrate", "themes", "narratives", "preview"]) {
      expect(checkPptfastArgs([cmd], workspace).ok).toBe(true)
    }
  })

  it("allows the one permitted spec sub-subcommand", () => {
    expect(checkPptfastArgs(["spec", "validate", "deck.spec.json"], workspace)).toEqual({ ok: true })
  })

  it("rejects other spec sub-subcommands", () => {
    expect(checkPptfastArgs(["spec", "assemble"], workspace).ok).toBe(false)
  })

  it("rejects serve (interactive, out of the neutral tool surface)", () => {
    expect(checkPptfastArgs(["serve", "deck.json"], workspace).ok).toBe(false)
  })

  it("rejects check-update / self-update (network side effects)", () => {
    expect(checkPptfastArgs(["check-update"], workspace).ok).toBe(false)
    expect(checkPptfastArgs(["self-update"], workspace).ok).toBe(false)
  })

  it("rejects removed vocabulary-v4 aliases (plan/scenarios)", () => {
    expect(checkPptfastArgs(["plan", "validate", "x.json"], workspace).ok).toBe(false)
    expect(checkPptfastArgs(["scenarios"], workspace).ok).toBe(false)
  })

  it("rejects an unknown subcommand", () => {
    expect(checkPptfastArgs(["frobnicate"], workspace).ok).toBe(false)
  })

  it("rejects empty args", () => {
    expect(checkPptfastArgs([], workspace).ok).toBe(false)
  })

  it("rejects a path argument escaping the workspace via ..", () => {
    expect(checkPptfastArgs(["validate", "../../etc/passwd"], workspace).ok).toBe(false)
  })

  it("rejects an absolute path argument", () => {
    expect(checkPptfastArgs(["render", "deck.json", "-o", "/tmp/out.pptx"], workspace).ok).toBe(false)
  })

  it("rejects an escaping path passed via --flag=value", () => {
    expect(checkPptfastArgs(["render", "deck.json", "--output=../outside.pptx"], workspace).ok).toBe(false)
  })

  it("allows a safe --flag=value path", () => {
    expect(checkPptfastArgs(["render", "deck.json", "--output=out.pptx"], workspace)).toEqual({ ok: true })
  })

  it("allows a non-path flag value like a theme id or boolean flag", () => {
    expect(checkPptfastArgs(["render", "deck.json", "-o", "out.pptx", "--theme", "luxe"], workspace)).toEqual({
      ok: true,
    })
    expect(checkPptfastArgs(["audit", "deck.json", "--json"], workspace)).toEqual({ ok: true })
  })
})

// ── classifyModelTurn / scriptedReplyFor — README's two fixed human lines ──

describe("classifyModelTurn", () => {
  it("classifies a spec-confirmation question", () => {
    expect(classifyModelTurn("Here is my proposed spec. Can you confirm this spec before I proceed?")).toBe(
      "spec-confirmation",
    )
  })

  it("classifies a spec-confirmation question phrased as deck.spec.json", () => {
    expect(classifyModelTurn("I've drafted deck.spec.json — should I proceed with this plan?")).toBe(
      "spec-confirmation",
    )
  })

  it("classifies an other clarifying question with no spec mention", () => {
    expect(classifyModelTurn("Should the chart use blue or green for the trend line?")).toBe("other-question")
  })

  it("classifies a confirmation-seeking statement with no question mark as a question", () => {
    expect(classifyModelTurn("Please confirm before I continue.")).toBe("other-question")
  })

  it("classifies a plain completion statement as a stop", () => {
    expect(classifyModelTurn("The deck is complete: validate and audit both pass, render succeeded.")).toBe("stop")
  })

  it("classifies empty content as a stop", () => {
    expect(classifyModelTurn("")).toBe("stop")
    expect(classifyModelTurn("   ")).toBe("stop")
  })

  it("classifies a bare IR JSON answer (no tool calls, no question) as a stop", () => {
    expect(classifyModelTurn('{"slides": [{"components": []}]}')).toBe("stop")
  })
})

describe("scriptedReplyFor", () => {
  it("returns the exact verbatim spec-confirmation line", () => {
    expect(scriptedReplyFor("spec-confirmation")).toBe("Spec confirmed, proceed.")
  })

  it("returns the exact verbatim other-question line", () => {
    expect(scriptedReplyFor("other-question")).toBe("Proceed with your best judgment.")
  })
})

// ── stripFence — reused from run.mts's single-shot answer convention ──

describe("stripFence", () => {
  it("strips a ```json fence", () => {
    expect(stripFence('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it("strips a bare ``` fence with no language tag", () => {
    expect(stripFence('```\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it("leaves unfenced text untouched (trimmed)", () => {
    expect(stripFence('  {"a": 1}  ')).toBe('{"a": 1}')
  })
})

// ── truncateForModel — per-tool-result cap, truncate from the end (plan 裁定 2) ──

describe("truncateForModel", () => {
  it("returns short text untouched, no marker appended", () => {
    expect(truncateForModel("exit 0\nok", 100)).toBe("exit 0\nok")
  })

  it("returns text exactly at the cap untouched", () => {
    const text = "a".repeat(100)
    expect(truncateForModel(text, 100)).toBe(text)
  })

  it("truncates from the end, keeping the head, when text exceeds the cap", () => {
    const text = "a".repeat(50) + "b".repeat(50) // head is 'a's, tail is 'b's
    const result = truncateForModel(text, 50)
    expect(result.startsWith("a".repeat(50))).toBe(true)
    expect(result).not.toContain("b")
  })

  it("appends a marker line stating the cap and the original length", () => {
    const text = "x".repeat(9000)
    const result = truncateForModel(text, 8000)
    expect(result).toContain("[truncated: 8000 of 9000 chars shown]")
  })

  it("keeps the exact head content before the marker", () => {
    const text = "0123456789".repeat(10) // 100 chars, distinct content
    const result = truncateForModel(text, 30)
    expect(result.startsWith(text.slice(0, 30))).toBe(true)
    expect(result).toContain("[truncated: 30 of 100 chars shown]")
  })
})

// ── buildMeta — harness-written, requested vs reported identity (plan 裁定 2) ──

describe("buildMeta", () => {
  it("assembles every documented field, keeping requested and reported identity separate", () => {
    const meta = buildMeta({
      providerPrefix: "QWEN",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      modelRequested: "qwen3.6-27b",
      modelReported: new Set(["qwen3.6-27b-20260801"]),
      rounds: 7,
      toolCalls: 12,
      promptTokens: 15000,
      completionTokens: 2200,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_042_000,
      capHit: false,
      deadlineHit: false,
      scriptedReplies: 1,
      cachedPromptTokens: 9000,
    })
    expect(meta).toEqual({
      provider_prefix: "QWEN",
      base_url_host: "dashscope.aliyuncs.com",
      model_requested: "qwen3.6-27b",
      model_reported: ["qwen3.6-27b-20260801"],
      mode: "agentic",
      rounds: 7,
      tool_calls: 12,
      prompt_tokens: 15000,
      completion_tokens: 2200,
      started_at: new Date(1_700_000_000_000).toISOString(),
      duration_seconds: 42,
      cap_hit: false,
      deadline_hit: false,
      scripted_replies: 1,
      cached_prompt_tokens: 9000,
    })
  })

  it("does not reconcile a mismatch between requested and reported model — both survive as-is", () => {
    const meta = buildMeta({
      providerPrefix: "QWEN",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      modelRequested: "qwen3.6-27b",
      modelReported: new Set(["some-other-served-model"]),
      rounds: 1,
      toolCalls: 0,
      promptTokens: 100,
      completionTokens: 10,
      startedAt: 0,
      finishedAt: 1000,
      capHit: false,
      deadlineHit: false,
      scriptedReplies: 0,
      cachedPromptTokens: 0,
    })
    expect(meta.model_requested).toBe("qwen3.6-27b")
    expect(meta.model_reported).toEqual(["some-other-served-model"])
  })

  it("sorts and dedupes model_reported (a Set collected across rounds may vary in insertion order)", () => {
    const meta = buildMeta({
      providerPrefix: "DEEPSEEK",
      baseUrl: "https://api.deepseek.com/v1",
      modelRequested: "deepseek-v4-flash",
      modelReported: new Set(["b-model", "a-model", "a-model"]),
      rounds: 2,
      toolCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      startedAt: 0,
      finishedAt: 0,
      capHit: true,
      deadlineHit: false,
      scriptedReplies: 0,
      cachedPromptTokens: 0,
    })
    expect(meta.model_reported).toEqual(["a-model", "b-model"])
    expect(meta.cap_hit).toBe(true)
  })

  it("records deadline_hit separately from cap_hit — the overall run-deadline guard", () => {
    const meta = buildMeta({
      providerPrefix: "QWEN",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      modelRequested: "qwen3.6-27b",
      modelReported: new Set(),
      rounds: 3,
      toolCalls: 5,
      promptTokens: 1000,
      completionTokens: 100,
      startedAt: 0,
      finishedAt: 1_500_000,
      capHit: false,
      deadlineHit: true,
      scriptedReplies: 0,
      cachedPromptTokens: 0,
    })
    expect(meta.deadline_hit).toBe(true)
    expect(meta.cap_hit).toBe(false)
  })

  it("records cached_prompt_tokens as a plain additive field, 0 when no provider reported any", () => {
    const meta = buildMeta({
      providerPrefix: "QWEN",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      modelRequested: "qwen3.6-27b",
      modelReported: new Set(),
      rounds: 1,
      toolCalls: 0,
      promptTokens: 500,
      completionTokens: 50,
      startedAt: 0,
      finishedAt: 1000,
      capHit: false,
      deadlineHit: false,
      scriptedReplies: 0,
      cachedPromptTokens: 0,
    })
    expect(meta.cached_prompt_tokens).toBe(0)
  })
})

// ── extractCachedTokens — provider prompt-cache-hit fields (plan 裁定 3) ──

describe("extractCachedTokens", () => {
  it("returns 0 when usage is undefined", () => {
    expect(extractCachedTokens(undefined)).toBe(0)
  })

  it("returns 0 when usage carries neither cache field", () => {
    expect(extractCachedTokens({ prompt_tokens: 100, completion_tokens: 10 })).toBe(0)
  })

  it("reads DeepSeek's prompt_cache_hit_tokens field", () => {
    expect(extractCachedTokens({ prompt_tokens: 1000, prompt_cache_hit_tokens: 400 })).toBe(400)
  })

  it("reads dashscope/OpenAI-shaped prompt_tokens_details.cached_tokens field", () => {
    expect(extractCachedTokens({ prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 250 } })).toBe(250)
  })

  it("treats a present but undefined cached_tokens as 0", () => {
    expect(extractCachedTokens({ prompt_tokens: 1000, prompt_tokens_details: {} })).toBe(0)
  })

  it("takes ONE field when a response carries both aliases, never sums", () => {
    // First-batch evidence (2026-08-04): DeepSeek populates BOTH fields
    // with the same value on every response — they alias one quantity.
    // The original sum double-counted every question at ratio ~2.0
    // (archived metas in results-archive/2026-08-04-first-full-agentic/).
    expect(
      extractCachedTokens({
        prompt_tokens: 1000,
        prompt_cache_hit_tokens: 300,
        prompt_tokens_details: { cached_tokens: 300 },
      }),
    ).toBe(300)
  })

  it("prefers the provider-specific field when the aliases disagree", () => {
    // Disagreement should not happen in practice; the deterministic rule
    // is documented field precedence, not summing.
    expect(
      extractCachedTokens({
        prompt_tokens: 1000,
        prompt_cache_hit_tokens: 300,
        prompt_tokens_details: { cached_tokens: 100 },
      }),
    ).toBe(300)
  })
})

// ── locateArtifact / placeArtifact — bridging workspace/ to the result root score.mts reads ──

describe("locateArtifact + placeArtifact", () => {
  let workspace: string
  let resultDir: string

  afterEach(() => {
    if (workspace) rmSync(join(workspace, ".."), { recursive: true, force: true })
  })

  function setup(): void {
    const base = mkdtempSync(join(tmpdir(), "bench-agentic-test-"))
    workspace = join(base, "workspace")
    resultDir = base
    mkdirSync(workspace, { recursive: true })
  }

  it("finds a single bare IR json file at the workspace root", () => {
    setup()
    writeFileSync(join(workspace, "deck.json"), '{"slides": []}')
    const located = locateArtifact(workspace)
    expect(located).toEqual({ kind: "bare-ir", file: join(workspace, "deck.json") })
    const note = placeArtifact(located, resultDir)
    expect(note).toMatch(/copied bare IR/)
  })

  it("prefers a deck-project directory over any stray json files", () => {
    setup()
    mkdirSync(join(workspace, "pages"), { recursive: true })
    writeFileSync(join(workspace, "deck.spec.json"), "{}")
    writeFileSync(join(workspace, "pages", "p-cover.json"), "{}")
    writeFileSync(join(workspace, "notes.json"), "{}") // stray, not part of the project
    const located = locateArtifact(workspace)
    expect(located).toEqual({ kind: "deck-project", dir: workspace })
    placeArtifact(located, resultDir)
    // deck.spec.json + pages/ land at the result root; the stray notes.json does not.
    expect(() => statSync(join(resultDir, "deck.spec.json"))).not.toThrow()
    expect(() => statSync(join(resultDir, "pages", "p-cover.json"))).not.toThrow()
  })

  it("picks the conventional deck.json among several candidates when no deck project exists", () => {
    setup()
    writeFileSync(join(workspace, "scratch.json"), "{}")
    writeFileSync(join(workspace, "deck.json"), '{"slides": []}')
    const located = locateArtifact(workspace)
    expect(located).toEqual({ kind: "bare-ir", file: join(workspace, "deck.json") })
  })

  it("reports none when the workspace has no json artifact at all", () => {
    setup()
    writeFileSync(join(workspace, "notes.txt"), "not json")
    expect(locateArtifact(workspace)).toEqual({ kind: "none" })
  })

  it("copies a bare IR's sibling assets/ directory alongside deck.json (round-2 image-question fix)", () => {
    setup()
    writeFileSync(join(workspace, "deck.json"), '{"slides": []}')
    mkdirSync(join(workspace, "assets"), { recursive: true })
    writeFileSync(join(workspace, "assets", "hero.png"), "fake-png-bytes")
    const located = locateArtifact(workspace)
    const note = placeArtifact(located, resultDir)
    expect(readFileSync(join(resultDir, "assets", "hero.png"), "utf8")).toBe("fake-png-bytes")
    expect(note).toContain("assets/")
  })

  it("does not create an assets/ dir in the result root when the workspace has none", () => {
    setup()
    writeFileSync(join(workspace, "deck.json"), '{"slides": []}')
    const located = locateArtifact(workspace)
    placeArtifact(located, resultDir)
    expect(existsSync(join(resultDir, "assets"))).toBe(false)
  })
})

// ── copyQuestionAssets — provisions a question's assets/ into the workspace
// before round 1 (round-2 image-question fix, checkPathSafety-style escape
// guard reused even though the question bank is trusted content) ──

describe("copyQuestionAssets", () => {
  let base: string
  let questionDir: string
  let workspace: string

  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true })
  })

  function setup(): void {
    base = mkdtempSync(join(tmpdir(), "bench-agentic-assets-test-"))
    questionDir = join(base, "q02")
    workspace = join(base, "workspace")
    mkdirSync(questionDir, { recursive: true })
    mkdirSync(workspace, { recursive: true })
  }

  it("returns 0 and copies nothing when the question has no assets/ directory", () => {
    setup()
    expect(copyQuestionAssets(questionDir, workspace)).toBe(0)
    expect(existsSync(join(workspace, "assets"))).toBe(false)
  })

  it("copies every file under assets/ into workspace/assets/", () => {
    setup()
    mkdirSync(join(questionDir, "assets"), { recursive: true })
    writeFileSync(join(questionDir, "assets", "hero.png"), "hero-bytes")
    writeFileSync(join(questionDir, "assets", "case.png"), "case-bytes")
    const copied = copyQuestionAssets(questionDir, workspace)
    expect(copied).toBe(2)
    expect(readFileSync(join(workspace, "assets", "hero.png"), "utf8")).toBe("hero-bytes")
    expect(readFileSync(join(workspace, "assets", "case.png"), "utf8")).toBe("case-bytes")
  })

  it("preserves a nested directory structure under assets/", () => {
    setup()
    mkdirSync(join(questionDir, "assets", "photos"), { recursive: true })
    writeFileSync(join(questionDir, "assets", "photos", "team.png"), "team-bytes")
    copyQuestionAssets(questionDir, workspace)
    expect(readFileSync(join(workspace, "assets", "photos", "team.png"), "utf8")).toBe("team-bytes")
  })

  it("never writes outside the workspace even if a crafted entry name tries to escape", () => {
    setup()
    mkdirSync(join(questionDir, "assets"), { recursive: true })
    writeFileSync(join(questionDir, "assets", "safe.png"), "safe-bytes")
    // Simulate a malicious/misconfigured question dir with a symlink escape
    // attempt inside assets/ — readdirSync withFileTypes reports a symlink
    // as neither isFile() nor isDirectory(), so walkFiles never traverses
    // it; this test pins that a symlink entry is silently skipped, not
    // followed, and every legitimate file still copies correctly.
    const outsideTarget = join(base, "outside-secret.txt")
    writeFileSync(outsideTarget, "should never appear in workspace")
    try {
      symlinkSync(outsideTarget, join(questionDir, "assets", "escape.png"))
    } catch {
      // symlink creation can fail without elevated perms on some platforms
      // (notably Windows) — the property under test is "no escape occurs",
      // which trivially holds if the symlink was never created at all.
    }
    const copied = copyQuestionAssets(questionDir, workspace)
    expect(readFileSync(join(workspace, "assets", "safe.png"), "utf8")).toBe("safe-bytes")
    expect(existsSync(join(workspace, "assets", "escape.png"))).toBe(false)
    expect(copied).toBe(1)
  })
})
