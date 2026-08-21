import type { Slide } from "@/ir"

/**
 * Convert an em tracking value to SVG `letterSpacing` px at `fontSize`.
 * Kickers and attributions on the editorial-verse layouts use em tracking
 * (label grammar), and `fitSvgLine` budgets spacing in absolute px.
 */
export function trackingPx(fontSize: number, em: number): number {
  return Math.round(fontSize * em)
}

/**
 * Uppercase Latin letters only. CJK, digits, and punctuation pass through
 * unchanged (`String#toUpperCase` is a no-op on them), matching the
 * "uppercase for Latin labels, never for body" rule.
 */
export function latinUpper(text: string): string {
  return text.replace(/[A-Za-z]+/g, (run) => run.toUpperCase())
}

export function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

/**
 * Chapter-index kicker for `verse-chapter`. The large heading is the verse
 * itself, so the kicker carries only the index — duplicating `heading` here
 * would print the same line twice.
 */
export function chapterIndexKicker(n: number, heading: string | undefined): string {
  if (hasCjk(heading ?? "")) return `第 ${n} 章`
  return `CHAPTER ${String(n).padStart(2, "0")}`
}

/**
 * Attribution line for `statement`: the single legal body component is the
 * source, never a card. Quote attribution wins over quote text. Subheading
 * is the no-component fallback.
 */
export function statementAttribution(slide: Slide): string | undefined {
  const component = slide.components[0]
  if (component?.type === "quote") {
    const fromQuote = component.attribution?.trim() || component.text.trim()
    if (fromQuote) return fromQuote
  }
  if (component?.type === "paragraph") {
    const text = component.text.trim()
    if (text) return text
  }
  if (component?.type === "citation") {
    const label = component.sources[0]?.label?.trim()
    if (label) return label
  }
  const sub = slide.subheading?.trim()
  return sub || undefined
}

/**
 * Attribution line for `pull-quote`: quote/citation source, else subheading.
 * A paragraph component is the body, not the source.
 */
export function pullQuoteAttribution(slide: Slide): string | undefined {
  const component = slide.components[0]
  if (component?.type === "quote") {
    const fromQuote = component.attribution?.trim()
    if (fromQuote) return fromQuote
  }
  if (component?.type === "citation") {
    const label = component.sources[0]?.label?.trim()
    if (label) return label
  }
  const sub = slide.subheading?.trim()
  return sub || undefined
}

/** Body prose for `pull-quote`: only a paragraph component, never the quote itself. */
export function pullQuoteBody(slide: Slide): string | undefined {
  const component = slide.components[0]
  if (component?.type === "paragraph") {
    const text = component.text.trim()
    if (text) return text
  }
  return undefined
}

type KpiItem = { value: string; unit?: string; label: string; source?: string }

function kpiHero(slide: Slide): KpiItem | undefined {
  const component = slide.components[0]
  if (component?.type === "kpi_cards" && component.items.length > 0) {
    return component.items[0]
  }
  return undefined
}

/** Hero numeral for `stat-hero`: kpi_cards[0].value, else the heading. */
export function heroValue(slide: Slide): string {
  const kpi = kpiHero(slide)
  const fromKpi = kpi?.value.trim()
  if (fromKpi) return fromKpi
  return slide.heading?.trim() ?? ""
}

export function heroUnit(slide: Slide): string | undefined {
  const unit = kpiHero(slide)?.unit?.trim()
  return unit || undefined
}

export function heroCaption(slide: Slide): string | undefined {
  const kpi = kpiHero(slide)
  if (kpi) {
    const heading = slide.heading?.trim()
    if (heading && heading !== kpi.value.trim()) return heading
    const label = kpi.label.trim()
    return label || undefined
  }
  return slide.subheading?.trim() || undefined
}

export function heroSource(slide: Slide): string | undefined {
  const kpi = kpiHero(slide)
  const fromKpi = kpi?.source?.trim()
  if (fromKpi) return fromKpi
  const component = slide.components[0]
  if (!kpi && component?.type === "citation") {
    const label = component.sources[0]?.label?.trim()
    if (label) return label
  }
  if (!kpi && component?.type === "paragraph") {
    const text = component.text.trim()
    if (text) return text
  }
  const footnote = slide.footnote?.trim()
  if (footnote) return footnote
  if (kpi) {
    const sub = slide.subheading?.trim()
    if (sub) return sub
  }
  return undefined
}
