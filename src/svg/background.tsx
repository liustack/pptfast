import type { BackgroundSpec } from "@/ir"
import { CANVAS_W_PX, CANVAS_H_PX } from "../constants"
import { gradientBands } from "./gradient-bands"

/** Number of solid-fill rect bands used to approximate a gradient. */
const GRADIENT_BAND_COUNT = 24

/**
 * Full-bleed slide background as pure SVG. Solid colors and asset images map
 * cleanly to DrawingML. Gradients are approximated with multiple solid-fill
 * <rect> bands (no linearGradient/defs/url()) so each band converts to a
 * native DrawingML rect — preview and export stay consistent.
 *
 * This band approximation never emits `<linearGradient>`/`url(#...)`, so it
 * never touches `pptx/svg2pptx/gradient.ts`'s native `<a:gradFill>`
 * converter — that converter is separate, currently-unwired infrastructure
 * for arbitrary shapes (rect/circle/ellipse/polygon/polyline/path) that carry
 * a real gradient `url(#...)` fill, meant as groundwork for a future theme
 * decoration layer / chart gradients, not for slide backgrounds. The two
 * approaches coexist without conflict simply because this component never
 * produces the `url(#...)` input the other one looks for — if this band
 * approximation is ever replaced with a real `<linearGradient>`, it would
 * start flowing through that converter instead (see its doc comment for the
 * reverse pointer back here).
 */
/**
 * Auto-scrim opacity。设计主题上「背景图」的语义是**加了图像纹理的主题
 * 底色**——模板文字色是为各页型默认底色 baked 的（不走 ctx.colors、无法
 * 反色），scrim 把图拉回那个底色保证文字可读。0.8 时用户裁决「看不清
 * 背景」（2026-07-09），降 0.66：矩阵最坏组合（浅主题深字 × 暗照片）
 * 实测仍可读，图像内容清晰可辨。均匀单 rect：opacity 渐变 bands 叠在
 * 图像上会在每条边界产生肉眼可见的透出率突变（实色 gradient bands 无此
 * 问题），实测有横纹，弃用。
 */
const AUTO_SCRIM_OPACITY = 0.66

export function Background({
  spec,
  images,
  autoScrimColor,
}: {
  spec: BackgroundSpec
  images?: Record<string, { src: string }>
  /**
   * 图片排版 P1：设计主题传主题 surface 色——asset 背景**未显式给 overlay**
   * 时自动叠上浅下深的对比度遮罩（把图往主题底色拉，保证前景 tokens 文字
   * 可读）。custom 主题不传（保持裸背景，兼容存量行为）。显式 overlay 永远
   * 优先于自动 scrim。
   */
  autoScrimColor?: string
}) {
  const W = CANVAS_W_PX
  const H = CANVAS_H_PX

  if (spec.kind === "color") {
    return <rect x={0} y={0} width={W} height={H} fill={spec.value} />
  }

  if (spec.kind === "gradient") {
    const n = GRADIENT_BAND_COUNT
    const bands = gradientBands(spec.from, spec.to, n)
    const isLR = spec.direction === "lr"

    // tb (default) & diagonal → horizontal bands stacked top-to-bottom.
    // lr → vertical bands placed left-to-right.
    // Each band slightly oversized (+1 px) to avoid sub-pixel seams.
    if (isLR) {
      const bandW = W / n
      return (
        <>
          {bands.map((fill, i) => (
            <rect
              key={i}
              x={Math.round(bandW * i)}
              y={0}
              width={Math.ceil(bandW) + 1}
              height={H}
              fill={fill}
            />
          ))}
        </>
      )
    }

    // tb / diagonal: horizontal bands
    const bandH = H / n
    return (
      <>
        {bands.map((fill, i) => (
          <rect
            key={i}
            x={0}
            y={Math.round(bandH * i)}
            width={W}
            height={Math.ceil(bandH) + 1}
            fill={fill}
          />
        ))}
      </>
    )
  }

  // asset
  const src = images?.[spec.asset_id]?.src
  return (
    <>
      {src ? (
        <image
          href={src}
          x={0}
          y={0}
          width={W}
          height={H}
          preserveAspectRatio={spec.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
        />
      ) : (
        <rect x={0} y={0} width={W} height={H} fill="#1A1A1A" />
      )}
      {spec.overlay ? (
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill={spec.overlay.color}
          fillOpacity={spec.overlay.opacity}
        />
      ) : autoScrimColor ? (
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill={autoScrimColor}
          fillOpacity={AUTO_SCRIM_OPACITY}
        />
      ) : null}
    </>
  )
}
