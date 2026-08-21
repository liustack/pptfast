/**
 * One-off visual dump of the first-batch sparse faces.
 * Not part of the CLI. Run: `pnpm exec tsx scripts/dump-sparse-b1-samples.ts`
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderSlideSvg } from "../src/api"
import type { PptxIR, Slide } from "../src/ir"

const OUT = resolve("scratchpad/sparse-b1-samples")

const chapter = (heading: string): Slide =>
  ({ type: "chapter", heading, components: [] }) as Slide

function deck(theme: string, slides: Slide[], extra: Partial<PptxIR> = {}): PptxIR {
  return {
    version: "4",
    filename: `${theme}-sparse.pptx`,
    theme: { id: theme },
    meta: { organization: "岭原智能", date: "2026" },
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

const statHero = (value: string, caption: string): Slide =>
  ({
    type: "content",
    layout: "stat-hero",
    heading: value,
    subheading: caption,
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

const monoBleed = (heading: string): Slide =>
  ({ type: "content", layout: "mono-bleed", heading, components: [] }) as Slide

const ATTR = "陈砚清 · 首席技术官"
const QUOTE = "最贵的停机，是没人预料到的**那一次**。"
const VERSE = "设备不会突然坏，只是没人**听它说话**。"
const VERSE_LISTEN = "设备不会突然坏，只是没人**听**它说话。"
const CLAIM = "维护工单平均提前 **6.5 天** 生成"
const NOTE = "试点产线 90 天 · 全部 217 张工单"

const SAMPLES: { theme: string; layout: string; slides: Slide[]; index: number }[] = [
  { theme: "stage", layout: "statement", slides: [statement(VERSE)], index: 0 },
  { theme: "stage", layout: "stat-hero", slides: [chapter("非计划停机降幅"), statHero("43%", "试点产线 · 90 天")], index: 1 },
  { theme: "stage", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
  {
    theme: "lecture",
    layout: "statement",
    slides: [{ ...statement(VERSE), subheading: "预测性维护开课第一句" } as Slide],
    index: 0,
  },
  { theme: "lecture", layout: "stat-hero", slides: [chapter("九十天试点，写在黑板上的那个数："), statHero("43%", "非计划停机时长下降")], index: 1 },
  { theme: "lecture", layout: "one-evidence", slides: [oneEvidence(CLAIM, NOTE)], index: 0 },
  { theme: "swiss", layout: "stat-hero", slides: [statHero("43%", "非计划停机时长下降"), { type: "content", heading: "x", components: [] } as Slide, { type: "content", heading: "y", components: [] } as Slide], index: 0 },
  { theme: "swiss", layout: "statement", slides: [statement(VERSE)], index: 0 },
  { theme: "swiss", layout: "one-evidence", slides: [oneEvidence(CLAIM, "217 张工单全量统计，无一例外")], index: 0 },
  { theme: "memo", layout: "pull-quote", slides: [pullQuote("「最贵的停机，是没人预料到的**那一次**。」", ATTR)], index: 0 },
  { theme: "memo", layout: "stat-hero", slides: [statHero("43%", "非计划停机时长，试点产线 90 天")], index: 0 },
  { theme: "memo", layout: "statement", slides: [statement("设备不会突然坏，只是没人听它说话。")], index: 0 },
  { theme: "playbill", layout: "statement", slides: [chapter("预测性维护 · 开演"), statement(VERSE_LISTEN)], index: 1 },
  { theme: "playbill", layout: "stat-hero", slides: [statHero("-43%", "非计划停机 · 试点 90 天")], index: 0 },
  { theme: "playbill", layout: "mono-bleed", slides: [monoBleed("凌晨两点的巡检，以后交给传感器")], index: 0 },
  { theme: "museum", layout: "statement", slides: [chapter("第二展厅 · 预测"), statement("设备不会突然坏，只是没人听它说话。")], index: 1 },
  { theme: "museum", layout: "one-evidence", slides: [oneEvidence("工单平均提前 **6.5 天**", NOTE)], index: 0 },
  { theme: "museum", layout: "stat-hero", slides: [statHero("43%", "非计划停机时长下降 · 90 天")], index: 0 },
  { theme: "luxe", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
  { theme: "luxe", layout: "stat-hero", slides: [statHero("43%", "非计划停机 · 九十日")], index: 0 },
  { theme: "luxe", layout: "statement", slides: [statement("设备不会突然坏，只是没人听它说话。")], index: 0 },
  { theme: "ink", layout: "statement", slides: [statement("设备不会突然坏，只是没人听它说话。")], index: 0 },
  { theme: "ink", layout: "stat-hero", slides: [statHero("43%", "非计划停机时长下降 · 九十日为期")], index: 0 },
  { theme: "ink", layout: "pull-quote", slides: [pullQuote(QUOTE, ATTR)], index: 0 },
]

mkdirSync(OUT, { recursive: true })
for (const sample of SAMPLES) {
  const svg = renderSlideSvg(deck(sample.theme, sample.slides), sample.index)
  const file = resolve(OUT, `${sample.theme}-${sample.layout}.svg`)
  writeFileSync(file, svg)
  console.log(file)
}
