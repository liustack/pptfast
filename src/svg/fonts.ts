/**
 * Safe-font resolution for the single-source SVG renderer.
 *
 * pptxgenjs writes a single `fontFace` name into the .pptx; whatever the target
 * machine lacks gets silently substituted by PowerPoint. The 6 themes lead with
 * designer fonts (Sectra / Inter / Lora …) that are absent on a stock Windows
 * install, so we resolve each font stack down to the first member PowerPoint can
 * actually render, falling back to a CJK+Latin-covering default by role.
 *
 * The set is intentionally Windows-guaranteed. Latin faces here (Georgia, Arial,
 * Consolas …) also ship on macOS, but Mac-only faces (PingFang SC) are excluded
 * so a deck authored on a Mac still renders predictably on Windows.
 */

export type FontRole = "heading" | "body" | "mono"

/** Lower-cased names of fonts preinstalled on a stock Windows (and, for Latin, macOS). */
export const SAFE_FONTS: Set<string> = new Set(
  [
    // Latin sans
    "Arial",
    "Calibri",
    "Tahoma",
    "Verdana",
    "Segoe UI",
    // Latin serif
    "Georgia",
    "Times New Roman",
    "Cambria",
    // Latin mono
    "Consolas",
    "Courier New",
    "Lucida Console",
    // CJK (Windows)
    "Microsoft YaHei",
    "微软雅黑",
    "SimSun",
    "宋体",
    "SimHei",
    "黑体",
    "KaiTi",
    "楷体",
    "FangSong",
    "仿宋",
  ].map((f) => f.toLowerCase()),
)

const ROLE_DEFAULT: Record<FontRole, string> = {
  heading: "Microsoft YaHei",
  body: "Microsoft YaHei",
  mono: "Consolas",
}

/**
 * Pick the first font in `stack` that PowerPoint can render on a stock machine,
 * or the role default when none qualify.
 */
export function resolveFontFace(stack: string[], role: FontRole): string {
  for (const raw of stack) {
    const name = raw.replace(/['"]/g, "").trim()
    if (SAFE_FONTS.has(name.toLowerCase())) return name
  }
  return ROLE_DEFAULT[role]
}

/** Lower-cased safe faces that read as serif, used to pick a preview fallback family below. */
const SERIF_SAFE_FACES = new Set(
  ["Georgia", "Times New Roman", "Cambria", "SimSun", "宋体", "FangSong", "仿宋", "KaiTi", "楷体"].map(
    (f) => f.toLowerCase(),
  ),
)

/** Preview-only fallback families, keyed by the resolved face's rendered look. */
const PREVIEW_FALLBACK = {
  serif: "Songti SC, STSong, serif",
  sans: "PingFang SC, Helvetica Neue, sans-serif",
  mono: "Menlo, monospace",
} as const

/**
 * Resolve `stack` to a CSS font-family list: the Windows-safe face `resolveFontFace`
 * picks (unchanged — svg2pptx's `firstFontFamily` still reads this as the exported
 * `fontFace`) followed by a macOS-available fallback so the in-app SVG preview
 * doesn't silently drop to a generic sans-serif when the resolved face (e.g.
 * SimSun) isn't installed on the machine rendering the preview.
 */
export function resolveFontStack(stack: string[], role: FontRole): string {
  const face = resolveFontFace(stack, role)
  const fallback =
    role === "mono"
      ? PREVIEW_FALLBACK.mono
      : SERIF_SAFE_FACES.has(face.toLowerCase())
        ? PREVIEW_FALLBACK.serif
        : PREVIEW_FALLBACK.sans
  return `${face}, ${fallback}`
}
