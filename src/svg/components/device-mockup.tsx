import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { metaInk } from "../ink"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type DeviceMockupComponent = Extract<Component, { type: "device_mockup" }>

/**
 * Height cap (px), same derivation and same number as `image.tsx`'s
 * `MAX_IMAGE_H` — both components occupy one visual-primary slot in the
 * same content-rect budget (smallest theme content-rect height ~380px minus
 * a caption/chrome allowance), so they share the same ceiling rather than
 * inventing a second number for what is the same geometric constraint.
 */
const MAX_DEVICE_H = 340

// ── browser chrome geometry ────────────────────────────────────────────
/** Top chrome bar height — enough for 3 traffic-light dots + a url pill at
 * a legible size, same order of magnitude as `image.tsx`'s 32px caption band. */
const CHROME_H = 32
const DOT_R = 4
const DOT_GAP = 8
const DOT_START_X = 16
const URLBAR_H = 18
const URLBAR_PAD_X = 10
const URLBAR_GAP = 12
const BROWSER_RADIUS = 8

/** Browser frame's own aspect ratio (裁定 3: "~16:10 含 chrome" — a
 * shallow, landscape "browser window" proportion), capped at `MAX_DEVICE_H`. */
function browserFrameH(w: number): number {
  return Math.min(Math.round(w / 1.6), MAX_DEVICE_H)
}

/**
 * Rounded-top, square-bottom bar path (verbatim technique from
 * `roadmap.tsx`/`insight-panel.tsx`'s own `roundedTopBarPath` — svg2pptx's
 * arc-segment support already handles this shape; duplicated per-component
 * rather than shared, matching those two files' own precedent) — the top
 * chrome bar's corners follow the outer frame's own radius so the bar never
 * overhangs the frame's rounded top corners, while its bottom edge stays
 * square where it meets the screen.
 */
function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return (
    `M ${x} ${y + rr} ` +
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y} ` +
    `L ${x + w - rr} ${y} ` +
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
    `L ${x + w} ${y + h} ` +
    `L ${x} ${y + h} Z`
  )
}

// ── phone chrome geometry ───────────────────────────────────────────────
/** Portrait height:width ratio (裁定 3: "~9:19 竖构图") — a modern
 * edge-to-edge phone silhouette, not the wider iPhone-classic 9:16. */
const PHONE_ASPECT = 19 / 9
const PHONE_BEZEL = 10
const PHONE_RADIUS = 32
const PHONE_SCREEN_RADIUS = PHONE_RADIUS - PHONE_BEZEL
const PHONE_NOTCH_W = 90
const PHONE_NOTCH_H = 18
const PHONE_HOME_W = 90
const PHONE_HOME_H = 4
const PHONE_HOME_MARGIN = 8

/**
 * Phone frame's own natural size at a `MAX_DEVICE_H`-tall budget, clamped to
 * the column width `w` when the column itself is narrower than that natural
 * width (裁定 3's own flagged risk: "phone 窄高构图在列布局里的表现要人检" —
 * this is the resulting maxH constraint, `MAX_IMAGE_H` precedent applied to
 * a portrait aspect instead of a landscape one). The device is centered
 * horizontally within `w` at render time — a phone mockup is never
 * stretched to fill a wide column, it stays phone-shaped.
 */
function phoneFrameSize(w: number): { w: number; h: number } {
  let deviceW = Math.round(MAX_DEVICE_H / PHONE_ASPECT)
  if (deviceW > w) deviceW = w
  const deviceH = Math.round(deviceW * PHONE_ASPECT)
  return { w: deviceW, h: deviceH }
}

/** Missing-asset placeholder — identical fallback to `image.tsx`'s (裁定 2's
 * iron rule: never render fake screen content, the only raster exit is a
 * real asset's `<image>`). Drawn inside the screen's own local coordinate
 * space (0,0)-(w,h), same as every caller below passes it. */
function ScreenPlaceholder({ w, h, ctx }: { w: number; h: number; ctx: ComponentCtx }) {
  return (
    <>
      <rect x={0} y={0} width={w} height={h} fill={ctx.colors.surface} />
      <text
        textAnchor="middle"
        x={w / 2}
        y={h / 2}
        fill={ctx.colors.muted}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        Image missing
      </text>
    </>
  )
}

/** Caption band — verbatim style copy of `image.tsx`'s bottom color band
 * (primary bg 88% opacity + centered white text), rendered inside the
 * screen's own local coordinate space so it never collides with either
 * device's own chrome (browser's top bar, phone's bezel/home-indicator). */
function CaptionBand({
  caption,
  w,
  h,
  ctx,
}: {
  caption: string
  w: number
  h: number
  ctx: ComponentCtx
}) {
  const fitted = fitSvgLine(caption, { maxWidth: w - 24, fontSize: 15, minFontSize: 12 })
  return (
    <>
      <rect x={0} y={h - 32} width={w} height={32} fill={ctx.colors.primary} fillOpacity={0.88} />
      <text
        data-truncated={fitted.truncated ? "1" : undefined}
        x={w / 2}
        y={h - 11}
        textAnchor="middle"
        fontSize={fitted.fontSize}
        fill={ctx.colors.surface}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
    </>
  )
}

export const deviceMockup: SvgComponent<DeviceMockupComponent> = {
  measure(component, w) {
    return component.device === "browser" ? browserFrameH(w) : phoneFrameSize(w).h
  },
  render(component, box, ctx) {
    const src = ctx.images?.[component.asset_id]?.src
    // A11Y-01 alt chain (new emission site, plan 裁定 2 + Global Constraint
    // 3): identical single-attribute `aria-label` wiring to `image.tsx` —
    // no `<title>` child, nothing emitted when there's no alt text.
    const alt = ctx.images?.[component.asset_id]?.alt

    if (component.device === "browser") {
      const frameH = browserFrameH(box.w)
      const screenH = frameH - CHROME_H
      const dotsRightEdge = DOT_START_X + 2 * (DOT_R * 2 + DOT_GAP) + DOT_R
      const urlBarX = dotsRightEdge + URLBAR_GAP
      const urlBarW = box.w - urlBarX - DOT_START_X
      const fittedUrl =
        component.url && urlBarW > URLBAR_PAD_X * 2
          ? fitSvgLine(component.url, { maxWidth: urlBarW - URLBAR_PAD_X * 2, fontSize: 12, minFontSize: 10 })
          : undefined

      return (
        <g transform={`translate(${box.x},${box.y})`}>
          <path d={roundedTopBarPath(0, 0, box.w, CHROME_H, BROWSER_RADIUS)} fill={ctx.colors.surface} />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={DOT_START_X + i * (DOT_R * 2 + DOT_GAP)}
              cy={CHROME_H / 2}
              r={DOT_R}
              fill={ctx.colors.border ?? ctx.colors.muted}
            />
          ))}
          {fittedUrl && urlBarW > URLBAR_PAD_X * 2 && (
            <>
              <rect
                x={urlBarX}
                y={(CHROME_H - URLBAR_H) / 2}
                width={urlBarW}
                height={URLBAR_H}
                rx={URLBAR_H / 2}
                fill={ctx.colors.bg}
              />
              <text
                data-truncated={fittedUrl.truncated ? "1" : undefined}
                // Tier B, meta-information (docs/contrast-system.md's
                // three-tier policy): a browser address bar is real
                // information (it's the whole "this is really running"
                // signal p09's evidence names) but deliberately understated
                // chrome text, not page content — same tier as a copyright
                // line or page number, not tier A body copy. `metaInk`
                // blends `colors.muted` toward `readableOn` only as far as
                // the tier's 3:1 hard floor requires against the url pill's
                // own `colors.bg` fill (not the ambient page background —
                // the pill paints its own surface underneath this text).
                // `data-contrast-tier="meta"` tells deck-audit's contrast
                // walk to hold this text to 3:1 instead of the default
                // 4.5:1 (same protocol as `ending-rail-ending.tsx`'s
                // copyright line / `ending-banner-ending.tsx`'s own — see
                // `deck-audit.ts`'s `META_CONTRAST_TIER`).
                data-contrast-tier="meta"
                x={urlBarX + URLBAR_PAD_X}
                y={CHROME_H / 2 + 4}
                fontSize={fittedUrl.fontSize}
                fill={metaInk(ctx.colors.muted, ctx.colors.bg)}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {fittedUrl.text}
              </text>
            </>
          )}
          <g transform={`translate(0,${CHROME_H})`}>
            {src ? (
              <image
                href={src}
                x={0}
                y={0}
                width={box.w}
                height={screenH}
                preserveAspectRatio="xMidYMid slice"
                aria-label={alt || undefined}
              />
            ) : (
              <ScreenPlaceholder w={box.w} h={screenH} ctx={ctx} />
            )}
            {component.caption && <CaptionBand caption={component.caption} w={box.w} h={screenH} ctx={ctx} />}
          </g>
          <rect
            x={0.5}
            y={0.5}
            width={box.w - 1}
            height={frameH - 1}
            rx={BROWSER_RADIUS}
            fill="none"
            stroke={ctx.colors.border ?? ctx.colors.muted}
            strokeWidth={1}
          />
        </g>
      )
    }

    // device === "phone"
    const { w: deviceW, h: deviceH } = phoneFrameSize(box.w)
    const offsetX = (box.w - deviceW) / 2
    const screenX = PHONE_BEZEL
    const screenY = PHONE_BEZEL
    const screenW = deviceW - PHONE_BEZEL * 2
    const screenH = deviceH - PHONE_BEZEL * 2

    return (
      <g transform={`translate(${box.x + offsetX},${box.y})`}>
        <rect x={0} y={0} width={deviceW} height={deviceH} rx={PHONE_RADIUS} fill={ctx.colors.border ?? ctx.colors.muted} />
        <rect x={screenX} y={screenY} width={screenW} height={screenH} rx={PHONE_SCREEN_RADIUS} fill={ctx.colors.surface} />
        <g transform={`translate(${screenX},${screenY})`}>
          {src ? (
            <image
              href={src}
              x={0}
              y={0}
              width={screenW}
              height={screenH}
              preserveAspectRatio="xMidYMid slice"
              aria-label={alt || undefined}
            />
          ) : (
            <ScreenPlaceholder w={screenW} h={screenH} ctx={ctx} />
          )}
          {component.caption && <CaptionBand caption={component.caption} w={screenW} h={screenH} ctx={ctx} />}
        </g>
        {/* notch */}
        <rect
          x={(deviceW - PHONE_NOTCH_W) / 2}
          y={0}
          width={PHONE_NOTCH_W}
          height={PHONE_NOTCH_H}
          rx={PHONE_NOTCH_H / 2}
          fill={ctx.colors.border ?? ctx.colors.muted}
        />
        {/* home indicator */}
        <rect
          x={(deviceW - PHONE_HOME_W) / 2}
          y={deviceH - PHONE_HOME_MARGIN - PHONE_HOME_H}
          width={PHONE_HOME_W}
          height={PHONE_HOME_H}
          rx={PHONE_HOME_H / 2}
          fill={ctx.colors.surface}
          fillOpacity={0.9}
        />
      </g>
    )
  },
}

export const renderDef: RenderDef<DeviceMockupComponent> = {
  type: "device_mockup",
  measure: deviceMockup.measure,
  render: deviceMockup.render,
}
