/**
 * One-off visual dump of the second-batch sparse faces.
 * Not part of the CLI. Run: `pnpm exec tsx scripts/dump-sparse-b2-samples.ts`
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderSlideSvg } from "../src/api"
import type { PptxIR, Slide } from "../src/ir"

const OUT = resolve("scratchpad/sparse-b2-samples")

const chapter = (heading: string): Slide =>
  ({ type: "chapter", heading, components: [] }) as Slide

function deck(theme: string, slides: Slide[], extra: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: `${theme}-sparse.pptx`,
    theme: { id: theme },
    meta: { organization: "云觅科技", date: "2026" },
    assets: { images: {} },
    slides,
    ...extra,
  } as PptxIR
}

const statement = (heading: string): Slide =>
  ({ type: "content", layout: "statement", heading, components: [] }) as Slide

const pullQuote = (heading: string, attribution: string): Slide =>
  ({
    type: "content",
    layout: "pull-quote",
    heading,
    subheading: attribution,
    components: [],
  }) as Slide

const statHero = (value: string, caption: string, footnote?: string): Slide =>
  ({
    type: "content",
    layout: "stat-hero",
    heading: value,
    subheading: caption,
    footnote,
    components: [],
  }) as Slide

const oneEvidence = (heading: string, note: string): Slide =>
  ({
    type: "content",
    layout: "one-evidence",
    heading,
    subheading: note,
    footnote: "来源：2026 Q2 运行数据",
    components: [],
  }) as Slide

const ATTR = "陈砚清 · 首席技术官"
const QUOTE = "最贵的停机，是没人预料到的那一次。"
const VERSE = "设备不会突然坏，只是没人听它说话。"
const VERSE_LISTEN = "设备不会突然坏，只是没人**听它说话**。"
const CONSULTING_VERSE = "工作区订阅值得**全线推开**，而且应该从今天开始。"
const CLAIM = "维护工单平均提前 6.5 天生成"
const NOTE = "217 张工单全量统计 · 无一例外"

const SAMPLES: { theme: string; layout: string; slides: Slide[]; index: number; extra?: Partial<PptxIR> }[] = [
  {
    theme: "consulting",
    layout: "statement",
    slides: [{ ...statement(CONSULTING_VERSE), components: [{ type: "paragraph", text: "试点复盘纪要" }] } as Slide],
    index: 0,
  },
  { theme: "consulting", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升", "试点客户 90 天 · 2026 Q2 运行数据")], index: 0 },
  { theme: "consulting", layout: "one-evidence", slides: [oneEvidence(CLAIM, NOTE)], index: 0 },
  {
    theme: "insight",
    layout: "statement",
    slides: [statement(VERSE)],
    index: 0,
    extra: { meta: { organization: "云觅科技", date: "2026-05-20" } },
  },
  {
    theme: "insight",
    layout: "stat-hero",
    slides: [statHero("-43%", "席位净流失 · 环比", "PILOT LINE · 90D WINDOW")],
    index: 0,
    extra: { meta: { organization: "云觅科技", date: "2026-05-20" } },
  },
  { theme: "insight", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
  { theme: "tech", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升", "试点客户 · 90 天窗口")], index: 0 },
  { theme: "tech", layout: "statement", slides: [statement(VERSE_LISTEN)], index: 0 },
  { theme: "tech", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计 · 2026 Q2")], index: 0 },
  { theme: "heritage", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
  { theme: "heritage", layout: "statement", slides: [statement(VERSE)], index: 0 },
  { theme: "heritage", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升 · 九十日")], index: 0 },
  {
    theme: "vermilion",
    layout: "statement",
    slides: [statement(VERSE)],
    index: 0,
    extra: { meta: { organization: "云觅科技", date: "2026-08" } },
  },
  { theme: "vermilion", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升 · 试点客户九十日")], index: 0 },
  { theme: "vermilion", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计 · 2026 Q2")], index: 0 },
  { theme: "journal", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
  { theme: "journal", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升 · 九十日为证")], index: 0 },
  { theme: "journal", layout: "statement", slides: [statement(VERSE)], index: 0 },
  { theme: "campaign", layout: "statement", slides: [statement(VERSE_LISTEN)], index: 0 },
  {
    theme: "campaign",
    layout: "stat-hero",
    slides: [chapter("九十天，一个数"), statHero("43%", "订阅续约率同比回升")],
    index: 1,
  },
  { theme: "campaign", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计 · 2026 Q2")], index: 0 },
  { theme: "arena", layout: "stat-hero", slides: [statHero("43%", "席位净流失 · 降幅")], index: 0 },
  { theme: "arena", layout: "statement", slides: [statement(VERSE_LISTEN)], index: 0 },
  { theme: "arena", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计 · 2026 Q2")], index: 0 },
  { theme: "terra", layout: "statement", slides: [statement(VERSE)], index: 0 },
  { theme: "terra", layout: "stat-hero", slides: [statHero("43%", "订阅续约率同比回升", "试点客户 · 90 天 · 现场实测")], index: 0 },
  { theme: "terra", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计 · 2026 Q2")], index: 0 },
  {
    theme: "academic",
    layout: "pull-quote",
    slides: [pullQuote(QUOTE, "陈砚清，运维成本年度复盘，2026")],
    index: 0,
  },
  {
    theme: "academic",
    layout: "stat-hero",
    slides: [statHero("43%", "订阅续约率同比回升", "试点客户 90 天窗口")],
    index: 0,
  },
  {
    theme: "academic",
    layout: "statement",
    slides: [chapter("命题 3.1"), statement(VERSE)],
    index: 1,
  },
]

mkdirSync(OUT, { recursive: true })
for (const sample of SAMPLES) {
  const svg = renderSlideSvg(deck(sample.theme, sample.slides, sample.extra), sample.index)
  const file = resolve(OUT, `${sample.theme}-${sample.layout}.svg`)
  writeFileSync(file, svg)
  console.log(file)
}
