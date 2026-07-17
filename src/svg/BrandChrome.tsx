import type { PptxIR, Slide } from "@/ir"
import type { BlockCtx } from "./blocks/types"
import { CONF_LABEL } from "../lib/conf-labels"
import { resolveBrand } from "../themes/definitions"
import { cachedDeckSeed, pickBySeed } from "./variety"

/**
 * Shared footer/logo chrome as an SVG fragment. Ported from MasterFrame so the
 * footer divider, confidentiality/org, version/date and brand logo are part of
 * the single-source svg (and thus exported). 页码已整体移除（2026-07-09 用户
 * 裁决「页码区块完全多此一举」）：预览静态页码与导出的原生动态页码一并删。
 */
export function BrandChrome({
  ir,
  slide,
  ctx,
}: {
  ir: PptxIR
  slide: Slide
  ctx: BlockCtx
}) {
  const { meta, brand, assets } = ir
  const conf = meta.confidentiality
  const org = meta.organization
  const version = meta.version
  const date = meta.date

  const logo = brand?.logo_asset_id ? assets.images[brand.logo_asset_id] : null
  const pos = brand?.position ?? "br"
  const logoBox =
    pos === "tl"
      ? { x: 64, y: 48 }
      : pos === "tr"
        ? { x: 1120, y: 48 }
        : pos === "bl"
          ? { x: 64, y: 630 }
          : { x: 1120, y: 630 }

  const muted = ctx.colors.muted
  const border = ctx.colors.border ?? ctx.colors.muted
  const font = ctx.fonts.body

  // 背景图 + 卡片态 content 页整页抑制页脚——是否生效由 theme 的 brand 配置
  // 驱动（W1 从 manifest.chrome 拆出，见 themes/definitions.ts resolveBrand；
  // enterprise 持有 suppressFooterOnCardContent，其余主题不设 = 默认 false）。
  const bgAsset =
    slide.background?.kind === "asset" ? assets.images[slide.background.asset_id] : null
  const brandConfig = resolveBrand(ir.theme.id, ir.theme.brand)
  const cardBgSuppressesFooter =
    Boolean(brandConfig.suppressFooterOnCardContent) &&
    slide.type === "content" &&
    !!(bgAsset?.src && !bgAsset.error)

  // image_split 通栏页（2026-07-09 用户裁决图列垂直铺满）：图占整列到页底，
  // 页脚分隔线与文字会压图——同 cardBgSuppressesFooter 先例整页抑制页脚
  // （org 已在该版式的 kicker 里，无信息损失）。
  const imageSplitBleed =
    slide.variant === "image_split" && slide.blocks.some((b) => b.type === "image")

  // image_bottom 通栏页（2026-07-09 用户裁决）：底图铺满页缘，meta 信息
  // 改用遮罩浮层 footer（暗条白字压图），无 meta 则什么都不画。
  const imageBottomBleed =
    slide.variant === "image_bottom" && slide.blocks.some((b) => b.type === "image")

  const showFooter =
    slide.type === "content" && !cardBgSuppressesFooter && !imageSplitBleed && !imageBottomBleed
  const showOverlayFooter =
    slide.type === "content" && imageBottomBleed && Boolean(conf || org || version || date)

  return (
    <>
      {logo?.src && !logo.error ? (
        <image
          href={logo.src}
          x={logoBox.x}
          y={logoBox.y}
          width="96"
          height="40"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}

      {showFooter && (
        <>
          {/* 分隔线可被 theme 的 brand.suppressFooterRule 抑制（主题自带
              版框线时避免双线，ink 先例，2026-07-10 用户裁决） */}
          {!brandConfig.suppressFooterRule && (
            <line x1="56" y1="664" x2="1224" y2="664" stroke={border} strokeWidth="1.2" />
          )}
          {/* meta 两端排布（2026-07-10 用户裁决：时间居中而右侧空很奇怪）：
              org 组与 date 组各占一端，左右归属随 deck seed 交换（多样性——
              固定位置会千篇一律） */}
          {(() => {
            const orgGroup = [conf ? CONF_LABEL[conf] : null, org].filter(Boolean).join(" · ")
            const dateGroup = [version, date].filter(Boolean).join(" · ")
            const swapped = pickBySeed(cachedDeckSeed(ir), "footer-side", [false, true])
            const leftText = swapped ? dateGroup : orgGroup
            const rightText = swapped ? orgGroup : dateGroup
            return (
              <>
                {leftText && (
                  <text x="56" y="700" fontSize="20" fill={muted} fontFamily={font} dominantBaseline="alphabetic">
                    {leftText}
                  </text>
                )}
                {rightText && (
                  <text
                    x="1224"
                    y="700"
                    fontSize="20"
                    textAnchor="end"
                    fill={muted}
                    fontFamily={font}
                    dominantBaseline="alphabetic"
                  >
                    {rightText}
                  </text>
                )}
              </>
            )
          })()}
        </>
      )}

      {showOverlayFooter && (
        <>
          <rect x={0} y={680} width={1280} height={40} fill="#0A0E14" fillOpacity={0.55} />
          {(conf || org) && (
            <text
              x="56"
              y="705"
              fontSize="18"
              fill="#FFFFFF"
              fillOpacity={0.92}
              fontFamily={font}
              dominantBaseline="alphabetic"
            >
              {[conf ? CONF_LABEL[conf] : null, org].filter(Boolean).join(" · ")}
            </text>
          )}
          {(version || date) && (
            <text
              x="1224"
              y="705"
              fontSize="18"
              textAnchor="end"
              fill="#FFFFFF"
              fillOpacity={0.92}
              fontFamily={font}
              dominantBaseline="alphabetic"
            >
              {[version, date].filter(Boolean).join(" · ")}
            </text>
          )}
        </>
      )}
    </>
  )
}
