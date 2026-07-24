import { describe, expect, it } from "vitest"
import {
  fitSvgLine,
  layoutSvgText,
  measureTextUnits,
  truncateToUnits,
} from "./svg-text-layout"

describe("svg text layout", () => {
  it("wraps long mixed CJK title into bounded lines", () => {
    const layout = layoutSvgText(
      "平台架构演进 — 从单体到云原生的技术实践（紫蓝渐变背景）",
      {
        maxWidth: 1088,
        fontSize: 92,
        maxLines: 2,
      }
    )

    expect(layout.lines.length).toBeLessThanOrEqual(2)
    expect(layout.lines.join("")).toContain("平台架构演进")
    expect(layout.fontSize).toBeLessThanOrEqual(92)
  })

  it("scales a single line down when one line is required", () => {
    const layout = layoutSvgText(
      "very-long-file-name-for-quarterly-review.pptx",
      {
        maxWidth: 320,
        fontSize: 40,
        maxLines: 1,
      }
    )

    expect(layout.lines).toHaveLength(1)
    expect(layout.fontSize).toBeLessThan(40)
  })

  it("treats CJK characters as wider than Latin letters", () => {
    expect(measureTextUnits("容量评估")).toBeGreaterThan(
      measureTextUnits("opsx")
    )
  })
})

describe("truncateToUnits", () => {
  it("returns short text unchanged", () => {
    expect(truncateToUnits("短", 10)).toBe("短")
  })
  it("truncates and appends ellipsis within budget", () => {
    const out = truncateToUnits("微服务架构下的分布式事务一致性", 6)
    expect(out.endsWith("…")).toBe(true)
    expect(measureTextUnits(out)).toBeLessThanOrEqual(6)
  })
  it("returns empty string when even the ellipsis exceeds the budget", () => {
    const out = truncateToUnits("任意文本", 0.3)
    expect(out).toBe("")
    expect(measureTextUnits(out)).toBeLessThanOrEqual(0.3)
  })
  it("returns bare ellipsis when budget exactly covers its cost", () => {
    const out = truncateToUnits("任意文本", 0.46)
    expect(out).toBe("…")
    expect(measureTextUnits(out)).toBeLessThanOrEqual(0.46)
  })
})

describe("fitSvgLine", () => {
  it("keeps font size when text fits", () => {
    expect(fitSvgLine("OK", { maxWidth: 200, fontSize: 20 })).toEqual({
      text: "OK",
      fontSize: 20,
      truncated: false,
    })
  })
  it("shrinks font down to the floor before truncating", () => {
    const r = fitSvgLine("一二三四五六七八九十", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    expect(r.fontSize).toBe(12)
    expect(r.text).toBe("一二三四五六七八九十") // 10 单位 × 12 = 120，恰好放下
    // Exactly fits at the floor — no character was dropped, so this must not
    // read as a truncation (bench-driven fix round, defect E: `truncated`
    // reports real content loss, not merely a smaller font size).
    expect(r.truncated).toBe(false)
  })
  it("truncates at the floor when still too wide", () => {
    const r = fitSvgLine("一二三四五六七八九十一二", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    expect(r.fontSize).toBe(12)
    expect(r.text.endsWith("…")).toBe(true)
    expect(measureTextUnits(r.text) * 12).toBeLessThanOrEqual(120)
    expect(r.truncated).toBe(true)
  })

  // Regression for the in-browser getBBox audit (Task 12): callers that
  // render the fitted line with an SVG `letterSpacing` attribute (every
  // theme's section-label "kicker" does, e.g. `Chapter 01 · <section>`) add
  // (charCount - 1) * letterSpacing extra real px that the unit-based
  // estimate below didn't know about, so long labels overflowed past the
  // page in a real browser despite passing the estimator-only audit.
  it("shrinks harder to leave room for letterSpacing", () => {
    const withoutSpacing = fitSvgLine("一二三四五六七八九十", { maxWidth: 200, fontSize: 20 })
    const withSpacing = fitSvgLine("一二三四五六七八九十", {
      maxWidth: 200,
      fontSize: 20,
      letterSpacing: 4,
    })
    // 10 chars → 9 gaps × 4px = 36px of letterSpacing to budget out of 200.
    expect(withSpacing.fontSize).toBeLessThan(withoutSpacing.fontSize)
    const charCount = 10
    const totalWidth =
      measureTextUnits(withSpacing.text) * withSpacing.fontSize +
      (charCount - 1) * 4
    expect(totalWidth).toBeLessThanOrEqual(200)
  })

  it("truncates harder (not just shrinks) when letterSpacing alone would blow the budget at the floor", () => {
    const r = fitSvgLine("一二三四五六七八九十一二三四五六七八九十", {
      maxWidth: 120,
      fontSize: 20,
      minFontSize: 12,
      letterSpacing: 4,
    })
    expect(r.fontSize).toBe(12)
    const charCount = Array.from(r.text).length
    const totalWidth = measureTextUnits(r.text) * 12 + Math.max(0, charCount - 1) * 4
    expect(totalWidth).toBeLessThanOrEqual(120)
    expect(r.truncated).toBe(true)
  })

  it("is a no-op when letterSpacing is omitted (existing callers unaffected)", () => {
    const withDefault = fitSvgLine("一二三四五六七八九十", { maxWidth: 120, fontSize: 20, minFontSize: 12 })
    const explicitZero = fitSvgLine("一二三四五六七八九十", {
      maxWidth: 120,
      fontSize: 20,
      minFontSize: 12,
      letterSpacing: 0,
    })
    expect(explicitZero).toEqual(withDefault)
  })
})

describe("layoutSvgText balanceLines (widow avoidance)", () => {
  // 用户复验 backlog#3：emerald 封面「年度战略回顾」在 360px/64px 下贪心断行成
  // 「年度战略回」+「顾」——孤字末行。balanceLines 按 total/N 预算重排为 3+3。
  it("re-balances a CJK widow into even lines when enabled", () => {
    const r = layoutSvgText("年度战略回顾", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战", "略回顾"])
    expect(r.fontSize).toBe(64)
  })

  it("keeps the greedy wrap by default (existing callers unaffected)", () => {
    const r = layoutSvgText("年度战略回顾", { maxWidth: 360, fontSize: 64, maxLines: 3 })
    expect(r.lines).toEqual(["年度战略回", "顾"])
  })

  it("balances space-delimited text without splitting words", () => {
    // 贪心：["Alpha Beta Gamma Delta", "X"]（孤词末行）。平衡预算从
    // max(total/2, 最长词) 起步，逐步放宽，绝不触发 splitLongToken 拆词。
    const r = layoutSvgText("Alpha Beta Gamma Delta X", {
      maxWidth: 806.4, // 12.6 units × 64px
      fontSize: 64,
      maxLines: 2,
      balanceLines: true,
    })
    expect(r.lines.length).toBe(2)
    const greedyLast = "X"
    expect(r.lines[1]).not.toBe(greedyLast)
    for (const line of r.lines) {
      expect(line.split(" ").every((w) => "Alpha Beta Gamma Delta X".includes(w))).toBe(true)
    }
  })

  it("leaves explicit newlines alone", () => {
    const r = layoutSvgText("年度战略回\n顾", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战略回", "顾"])
  })

  it("does not rebalance when the last line is reasonably full", () => {
    // 「微服务架构下的分布式一致」12 字在 5.625 units 预算下 5+5+2？——用 2 行
    // 且末行 ≥ 50% 最宽行的用例：8 字 → 5+3，3/5=0.6 ≥ 0.5，保持贪心结果。
    const r = layoutSvgText("年度战略回顾报告", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
      balanceLines: true,
    })
    expect(r.lines).toEqual(["年度战略回", "顾报告"])
  })
})

describe("tokenize atomic Latin/digit runs (task R2: fused-prefix wrap fix)", () => {
  // 缺陷（修复前）：无空格分支旧实现把整串按字符切 token（`Array.from`），
  // 一个粘在 CJK 中间、自身无空格的拉丁 run（本仓惯用语，如
  // "...OpenAPIGateway让..."）因此完全没有"整词"保护——贪心逐行填充可以在
  // run 内部任意字符处断行，且因为从未落进 `truncateToUnits`，`truncated`
  // 仍报 false，缺陷完全静默。
  //
  // R2 review 的 Important finding（test 诚实性，2026-07-24）：上一轮实现
  // 把 brief 原始 repro（run 在 STRING POSITION 0——串首即拉丁 run，典型如
  // 英文品牌名前缀，无任何 CJK 前导字符）换成了 run 在 position ≥1（前面
  // 垫了 5 个 CJK 字符）的变体，回避了真正的失败用例：position ≥1 时前导
  // CJK 先吸收第 1 行的预算，run 到达行尾前就已经该整体换行了，从不需要
  // 收缩字号即可保持完整；position 0 没有这层保护——`layoutSvgText` 的重试
  // 阶梯（retry ladder，本轮 review 判定的 SCOPE EXTENSION）总是收敛到
  // "允许拆分"能达到更大字号的那一档，run 依旧被从中间切断。下面先恢复
  // brief 原始 pin 串作为主用例（position 0），position ≥1 的钉子保留在本
  // describe 块末尾作为补充覆盖（守护"已经工作的那一半"，不删除）。
  const POSITION_0_PIN = "Brandxxxxxxxxxxxxxxx：让工程团队将大模型推理性能提升"
  const POSITION_0_RUN = "Brandxxxxxxxxxxxxxxx" // len 20 —— brief 原文字面 repro 串

  it("keeps the brief's own literal position-0 pin string intact at cover-left-anchor's own 360/64/3 budget (R2 review: restored primary case)", () => {
    const r = layoutSvgText(POSITION_0_PIN, { maxWidth: 360, fontSize: 64, maxLines: 3 })
    expect(r.lines).toEqual(["Brandxxxxxxxxxxxxxxx", "：让工程团队将大模型推", "理性能提升"])
    // run 独占第 1 行、从串首（position 0）开始——不是"某行包含 run"这种弱
    // 断言，而是直接锁死"第 1 行 === run 本身"，排除任何形式的中间切断。
    expect(r.lines[0]).toBe(POSITION_0_RUN)
    expect(r.lines.join("")).toBe(POSITION_0_PIN) // 无丢字/无重排
    expect(r.truncated).toBe(false)
  })

  it("keeps the same literal position-0 pin string intact at cover-split-diagonal's own 588/76/3 budget (R2 review: restored primary case)", () => {
    const r = layoutSvgText(POSITION_0_PIN, { maxWidth: 588, fontSize: 76, maxLines: 3 })
    expect(r.lines).toEqual(["Brandxxxxxxxxxxxxxxx", "：让工程团队将大模型推", "理性能提升"])
    expect(r.lines[0]).toBe(POSITION_0_RUN)
    expect(r.lines.join("")).toBe(POSITION_0_PIN)
    expect(r.truncated).toBe(false)
  })

  describe("sweep-derived position-0 regression thresholds (reviewer's measured mid-run-break range, no font-size floor)", () => {
    // review 的 sweep 脚本（r2-review-probes/sweep-run0-prefix.ts）在这两个
    // 真实预算点上实测：修复前 run 长度 16-45（360px）/ 15-40（588px）区间
    // 内 position-0 均 mid-run 断裂。这里钉 review 指定的四个具体长度，取值
    // 均由本文件同款 `layoutSvgText` 直调（不带 minPt，与上面两条主钉同一
    // 惯例）复算并核对，不是手估。
    function buildPin(runLen: number): { heading: string; run: string } {
      const run = runLen <= 5 ? "Brand".slice(0, runLen) : "Brand" + "x".repeat(runLen - 5)
      return { heading: `${run}：让工程团队将大模型推理性能提升`, run }
    }

    it.each([
      { label: "L=16 @360px (cover-left-anchor's own budget)", runLen: 16, maxWidth: 360, fontSize: 64 },
      { label: "L=20 @360px (cover-left-anchor's own budget)", runLen: 20, maxWidth: 360, fontSize: 64 },
      { label: "L=15 @588px (cover-split-diagonal's own budget)", runLen: 15, maxWidth: 588, fontSize: 76 },
      { label: "L=24 @588px (cover-split-diagonal's own budget)", runLen: 24, maxWidth: 588, fontSize: 76 },
    ])("$label: no mid-run break post-fix", ({ runLen, maxWidth, fontSize }) => {
      const { heading, run } = buildPin(runLen)
      const r = layoutSvgText(heading, { maxWidth, fontSize, maxLines: 3 })
      expect(r.lines[0]).toBe(run) // run 完整独占第 1 行，从 position 0 起无切断
      expect(r.lines.join("")).toBe(heading)
      expect(r.truncated).toBe(false)
    })
  })

  // Position ≥1 (a CJK prefix precedes the run) — already fixed by the
  // original R2 tokenize fix on its own, since the leading CJK chars absorb
  // line 1's budget and the run wraps whole to line 2 without ever needing
  // a smaller font. Kept as additional coverage guarding this already-
  // working half, per the R2 review's own instruction — not deleted.
  const FUSED = "统一接入层OpenAPIGateway让跨团队协作效率显著提升"
  const RUN = "OpenAPIGateway"

  it("keeps a fused Latin run intact at a narrow real call-site budget, run at position ≥1 (additional coverage — guards the already-working half)", () => {
    const r = layoutSvgText(FUSED, { maxWidth: 360, fontSize: 64, maxLines: 3 })
    expect(r.lines).toEqual(["统一接入层", "OpenAPIGateway让跨", "团队协作效率显著提升"])
    expect(r.lines.join("")).toBe(FUSED) // 无丢字/无重排
    expect(r.truncated).toBe(false)
  })

  it("keeps the same fused run intact at a second real call-site budget, run at position ≥1 (additional coverage — guards the already-working half)", () => {
    const r = layoutSvgText(FUSED, { maxWidth: 588, fontSize: 76, maxLines: 3 })
    expect(r.lines).toEqual(["统一接入层", "OpenAPIGateway让跨团", "队协作效率显著提升"])
    expect(r.lines.some((l) => l.includes(RUN))).toBe(true)
  })

  it("pure CJK (no space anywhere) wraps byte-identically to pre-fix behavior — the no-space branch's per-character CJK tokenization is untouched (regression pin)", () => {
    // 钉值取自修复前（未改动 tokenize）代码的实测输出，见任务报告：纯 CJK
    // 串本就一字一 token，新正则的「其余字符」分支与旧 `Array.from` 逐字符
    // 行为完全一致，这两个用例证明字节不变。
    const r1 = layoutSvgText("平台架构演进从单体到云原生的技术实践紫蓝渐变背景", {
      maxWidth: 1088,
      fontSize: 92,
      maxLines: 2,
    })
    expect(r1.lines).toEqual(["平台架构演进从单体到云原生", "的技术实践紫蓝渐变背景"])
    expect(r1.fontSize).toBe(83)
    expect(r1.truncated).toBe(false)

    const r2 = layoutSvgText("年度战略回顾报告全文完整版本不删减", {
      maxWidth: 360,
      fontSize: 64,
      maxLines: 3,
    })
    expect(r2.lines).toEqual(["年度战略回顾", "报告全文完整", "版本不删减"])
    expect(r2.fontSize).toBe(60)
  })

  it("space-delimited English wraps byte-identically to pre-fix behavior — that tokenize() branch is untouched by this fix (regression pin)", () => {
    const r = layoutSvgText("The Quick Brown Fox Jumps Over The Lazy Dog Repeatedly", {
      maxWidth: 400,
      fontSize: 40,
      maxLines: 3,
    })
    expect(r.lines).toEqual(["The Quick Brown Fox", "Jumps Over The Lazy", "Dog Repeatedly"])
    expect(r.fontSize).toBe(38)
  })

  it("an atomic run wider than any achievable line still falls back to splitLongToken -- no infinite loop, no dropped text", () => {
    // 自查点 (d)：原子 run 本身就超过整行预算时，splitLongToken 仍是唯一
    // 出路（不可能不切）——本用例证明该保底路径未被破坏：有限步内终止、
    // 拼回后与原文一致、且每行仍在预算内。
    const LONG = "Supercalifragilisticexpialidocious文本"
    const r = layoutSvgText(LONG, { maxWidth: 60, fontSize: 20, maxLines: 10 })
    expect(r.lines.join("")).toBe(LONG) // 无丢字
    expect(r.lines.length).toBeGreaterThan(1) // 确实被切开了，不是静默溢出成一行
    const maxUnits = 60 / 20
    for (const line of r.lines) {
      expect(measureTextUnits(line)).toBeLessThanOrEqual(maxUnits + 1e-9)
    }
  })

  describe("self-review: mixed-script / connector / accent boundary cases", () => {
    it("keeps a hyphen+percent run ('60-85%') atomic -- moves wholly to its own line rather than splitting", () => {
      const r = layoutSvgText("业务提升幅度达到60-85%这是核心指标", {
        maxWidth: 140,
        fontSize: 40,
        maxLines: 6,
      })
      expect(r.lines).toContain("60-85%")
    })

    it("keeps a dotted version string ('v2.3.1-rc.4') atomic when the line budget can fit it", () => {
      const r = layoutSvgText("本次发布对应版本号v2.3.1-rc.4请各团队升级验证", {
        maxWidth: 200,
        fontSize: 30,
        maxLines: 6,
      })
      expect(r.lines).toContain("v2.3.1-rc.4")
    })

    it("lets a trailing connector ('etc.') detach from the run -- the period can start the next line, but 'etc' itself never splits", () => {
      const r = layoutSvgText("支etc.以及后续会持续增加的更多类型说明", {
        maxWidth: 108,
        fontSize: 40,
        maxLines: 10,
      })
      const idx = r.lines.findIndex((l) => l.endsWith("etc"))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(r.lines[idx + 1]?.startsWith(".")).toBe(true)
    })

    it("lets a leading connector ('-flag') detach from the run -- the hyphen can end the previous line, but 'flag' itself never splits", () => {
      const r = layoutSvgText("命令行参数新增了一个重要的-flag选项用于控制", {
        maxWidth: 130,
        fontSize: 40,
        maxLines: 8,
      })
      const idx = r.lines.findIndex((l) => l.endsWith("-"))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(r.lines[idx + 1]?.startsWith("flag")).toBe(true)
    })

    it("documents the ASCII-only boundary: an accented Latin letter ('café') does NOT extend the atomic run, so a break can land between 'caf' and 'é'", () => {
      // 有意为之、与 brief 范围一致的已知边界：run 正则是 `[A-Za-z0-9]`，不含
      // `\p{L}`，重音拉丁字母不算 run 的延伸字符，退回逐字符 token（与 CJK
      // 同一处理路径）。这不是本任务要修的缺陷范围——诚实钉出这条边界，
      // 而非悄悄扩大正则去覆盖全部 Unicode 字母表。
      const r = layoutSvgText("这家连锁咖啡品牌café在全球范围内开设", {
        maxWidth: 90,
        fontSize: 40,
        maxLines: 6,
      })
      expect(r.lines).toContain("品牌caf")
      expect(r.lines).toContain("é在全球")
    })
  })
})

describe("layoutSvgText word-integrity retry-ladder preference (task R2 scope extension, 2026-07-24)", () => {
  // Critical finding fix: the retry ladder in `layoutSvgText` always
  // converged on the *largest* font satisfying `maxLines`, and character-
  // level `splitLongToken` output can always hit a target line count at a
  // smaller-or-equal budget than keeping a run whole — so a position-0 run
  // (see the describe block above) kept getting cut mid-run even after the
  // tokenizer itself learned to treat it as one atomic token. These tests
  // pin the ladder's own new selection rule directly (independent of any
  // one archetype's exact pixel budget): prefer a split-free candidate
  // whenever one exists within `maxLines` and (when supplied) `minPt`,
  // otherwise fall back to exactly what the ladder always returned.
  const POSITION_0_PIN = "Brandxxxxxxxxxxxxxxx：让工程团队将大模型推理性能提升"

  it("prefers a split-free layout over the legacy split once minPt allows it (588/76/3, minPt 44)", () => {
    const withoutFloor = layoutSvgText(POSITION_0_PIN, { maxWidth: 588, fontSize: 76, maxLines: 3 })
    const withFloor = layoutSvgText(POSITION_0_PIN, { maxWidth: 588, fontSize: 76, maxLines: 3, minPt: 44 })
    // minPt=44 does not further constrain this particular search (the
    // split-free candidate's own font, 52, already clears it) -- supplying
    // it changes nothing here, which is itself worth pinning: `minPt` only
    // ever narrows the search, never widens or otherwise perturbs it.
    expect(withFloor).toEqual(withoutFloor)
    expect(withFloor.lines).toEqual(["Brandxxxxxxxxxxxxxxx", "：让工程团队将大模型推", "理性能提升"])
    expect(withFloor.fontSize).toBe(52)
  })

  it("falls back to the legacy split, byte-identical to the pre-task-R2-retry-ladder-fix algorithm, when the run is genuinely wider than a full line even at minPt (360/64/3, minPt 32)", () => {
    // Verified by direct measurement (not estimated): this 20-char run's own
    // width is ~12.04 units at Regular weight, but `maxWidth/minPt =
    // 360/32 = 11.25` units is the widest a single line can ever be once
    // the font has shrunk to the floor -- the run categorically cannot fit
    // one line without going under `minPt` (margin ≈ -2.1pt against the
    // best achievable split-free font, 29). This is exactly the documented
    // fallback condition ("run genuinely wider than a full line at minPt"):
    // splitting is the *correct*, intended outcome here, not a residual
    // defect -- see this task's report for the full margin table across
    // nearby lengths (the crossover sits between 18, which resolves, and
    // 19, which doesn't, at this exact budget).
    const withFloor = layoutSvgText(POSITION_0_PIN, { maxWidth: 360, fontSize: 64, maxLines: 3, minPt: 32 })
    // Cross-verified (scratch harness, not shipped) against the reviewer's
    // own pre-fix reference module (r2-review-probes/pre-fix/svg-text-
    // layout.ts, which has no `minPt` parameter at all -- called with the
    // same maxWidth/fontSize/maxLines): byte-identical output, confirming
    // this is genuinely "fall back to the current behavior", not a new,
    // merely-similar-looking split.
    expect(withFloor.lines).toEqual(["Brandxxxxxxxxxxx", "xxxx：让工程团队将", "大模型推理性能提升"])
    expect(withFloor.fontSize).toBe(38)
    expect(withFloor.truncated).toBe(false)
    expect(withFloor.lines.join("")).toBe(POSITION_0_PIN) // still lossless -- split, not dropped
  })

  it("without a minPt floor, the same run finds a smaller but split-free font instead (contrast against the minPt-bounded fallback above)", () => {
    // Same string, same maxWidth/fontSize/maxLines as the fallback test
    // above -- only `minPt` differs (omitted here). Without a floor to
    // respect, the search is bounded only by the legacy ladder's own reach
    // (`baseUnits * 1.14^8`, see the "Supercalifragilisticexpialidocious"
    // test in the describe block above for when even *that* is exceeded),
    // which is generous enough here to find a whole-run layout.
    const r = layoutSvgText(POSITION_0_PIN, { maxWidth: 360, fontSize: 64, maxLines: 3 })
    expect(r.lines).toEqual(["Brandxxxxxxxxxxxxxxx", "：让工程团队将大模型推", "理性能提升"])
    expect(r.fontSize).toBe(31)
    expect(r.truncated).toBe(false)
  })

  it("leaves zero-split content byte-identical regardless of minPt (design constraint: the preference only ever reorders outcomes when a split actually appears)", () => {
    const pureCjk = "年度战略回顾报告全文完整版本不删减"
    const withoutFloor = layoutSvgText(pureCjk, { maxWidth: 360, fontSize: 64, maxLines: 3 })
    // minPt set to exactly this content's own natural fontSize (60) -- an
    // adversarial edge value, not a comfortably-clear one -- to prove the
    // branch genuinely never activates for split-free content, not merely
    // that it happens not to matter for an easy value.
    const withFloor = layoutSvgText(pureCjk, { maxWidth: 360, fontSize: 64, maxLines: 3, minPt: 60 })
    expect(withFloor).toEqual(withoutFloor)
    expect(withFloor.lines).toEqual(["年度战略回顾", "报告全文完整", "版本不删减"])
    expect(withFloor.fontSize).toBe(60)
  })

  it("maxLines=1 is a degenerate case for this preference: single-line output is invariant to it, with or without minPt", () => {
    // Self-review question (hostile pass): does maxLines=1 force the
    // fallback, since a single line leaves nowhere for a whole run to go?
    // Investigated directly rather than assumed -- the answer is no, for a
    // structural reason: whenever the ladder can't reach `maxLines` lines
    // on its own, `layoutSvgText`'s forced-merge fallback concatenates
    // every remaining line into one with no separator (this content has no
    // spaces), which reconstructs the original string exactly regardless of
    // where any *intermediate* wrap step happened to break it. "Mid-run
    // break" is a property of a boundary *between* array elements — with
    // exactly one element, there is no boundary for it to land on. Both
    // calls below therefore produce the identical single line, whether or
    // not `minPt` is supplied.
    const withoutFloor = layoutSvgText(POSITION_0_PIN, { maxWidth: 360, fontSize: 64, maxLines: 1 })
    const withFloor = layoutSvgText(POSITION_0_PIN, { maxWidth: 360, fontSize: 64, maxLines: 1, minPt: 32 })
    expect(withFloor).toEqual(withoutFloor)
    expect(withFloor.lines).toEqual([POSITION_0_PIN])
    expect(withFloor.fontSize).toBe(13)
    expect(withFloor.lines.join("")).toBe(POSITION_0_PIN)
  })

  it("is a pure function of its inputs -- repeated calls with identical arguments produce identical output (no hidden nondeterminism in the search)", () => {
    const opts = { maxWidth: 360, fontSize: 64, maxLines: 3, minPt: 32 } as const
    const a = layoutSvgText(POSITION_0_PIN, opts)
    const b = layoutSvgText(POSITION_0_PIN, opts)
    const c = layoutSvgText(POSITION_0_PIN, opts)
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})
