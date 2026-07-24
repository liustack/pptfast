/**
 * 从 lucide 提取全量图标原语，生成 PPTX 图标目录（单源）：
 *   src/icons.ts
 * 该文件同时供 zod 枚举（IR 校验）与 pptx-svg 渲染消费。ops-kb 的 pydantic
 * Literal 手工镜像此名单（来源注释）。
 *
 * 数据源：`lucide`（框架无关核心包，非 `lucide-react`）—— 每个图标一个 ESM
 * 模块，default 导出就是裸 iconNode 数组（无 React key/无 createLucideIcon
 * 包装），文件名本身就是当前 canonical kebab 名，天然适合全量枚举。
 * 2026-07-18（W2.5）从 lucide-react 切换过来：旧脚本按 lucide-react ^1.7.0
 * 的 `dist/esm/icons/*.js` 深路径硬编码，装到的 lucide-react 已经是
 * 1.24.0（`.js` 变 `.mjs`，脚本对不上包结构），核心包的裸数组更适合
 * codegen，顺带甩掉一份没别处用到的 React 专用依赖。
 *
 * 兼容锁：W2.5 之前手工精选的 431 个名字（见 src/icons.legacy-names.ts）必须
 * 全部在生成结果里保留（超集扩张，不是替换）。lucide 升级偶尔会把旧名折进
 * 新名（如 v1.24 → v1.25 把 "home" 折进了 "house"，旧名不再是目录里的文件
 * 名），凡是全量目录里找不到的旧名，在下面 COMPAT_ALIASES 里手工补一条，
 * 指向它现在的 canonical 名，共用同一份图标数据。
 *
 * Run: pnpm exec tsx scripts/gen-pptx-icons.mts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 旧名 → 当前 canonical 名，两类来源，同一条救援路径（同一份图标数据，
 * 只是多注册一个可解析的名字）：
 *
 *  1. lucide 改名桥接（首 8 条）。发现方法：对比 icons.legacy-names.ts 的
 *     431 个名字与 lucide 全量图标目录的文件名列表，取差集（2026-07-18，
 *     lucide v1.25.0，差集共 8 个）。
 *  2. 模型预训练旧习惯名（`alert-circle`/`alert-triangle`，T0b 救援）：与
 *     第 1 类的触发原因不同——这两个名字从来不是本仓 LEGACY_ICON_NAMES 的
 *     一员（本仓自 W2.5 起就拼作 `circle-alert`/`triangle-alert`），而是
 *     模型从预训练记忆里吐出的旧版 lucide-react 命名。基准复测实测 6 次
 *     真实校验失败、跨 3 个模型（`.issues/notes/2026-07-24-bench-rerun.md`
 *     立即可修项 1）——单发模式下 "did you mean" 提示没有第二轮可读，别名
 *     救援是唯一有效防线。
 *
 * 目标名一定能在全量目录里解析到。
 */
const COMPAT_ALIASES: Readonly<Record<string, string>> = {
  home: "house",
  filter: "funnel",
  "git-commit": "git-commit-horizontal",
  "file-json": "file-braces",
  "file-warning": "file-exclamation-point",
  train: "tram-front",
  waves: "waves-horizontal",
  "circle-help": "circle-question-mark",
  // 模型预训练旧习惯名（非 lucide 改名桥接，见上方类别 2）：
  "alert-circle": "circle-alert",
  "alert-triangle": "triangle-alert",
}

const ALLOWED_TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"])
const ALLOWED_ATTRS = new Set([
  "d", "cx", "cy", "r", "x", "y", "width", "height", "rx", "ry",
  "x1", "y1", "x2", "y2", "points",
  // 仅允许 currentColor（下方逐值校验）：散点类图标的实心小圆点，
  // 渲染端（pptx-svg/icons.tsx）把它映射成图标颜色实心填充。
  "fill",
])

type IconNode = readonly (readonly [string, Record<string, string>])[]

const here = path.dirname(fileURLToPath(import.meta.url))
const lucideDir = path.resolve(here, "../node_modules/lucide")
const lucideIconsDir = path.join(lucideDir, "dist/esm/icons")

function sanitize(name: string, iconNode: IconNode) {
  return iconNode.map(([tag, attrs]) => {
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`${name}: 不支持的原语 <${tag}>`)
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "key") continue // lucide 核心包不带 key，防御性保留跳过
      if (!ALLOWED_ATTRS.has(k)) throw new Error(`${name}: 不支持的属性 ${k}`)
      if (k === "fill" && v !== "currentColor")
        throw new Error(`${name}: fill 仅允许 currentColor，实际 ${v}`)
      clean[k] = String(v)
    }
    return [tag, clean] as const
  })
}

async function loadIconNode(canonicalName: string): Promise<IconNode> {
  const file = path.join(lucideIconsDir, `${canonicalName}.mjs`)
  const mod = (await import(file)) as { default?: IconNode }
  if (!mod.default) throw new Error(`${canonicalName}: 未找到 default 导出`)
  return mod.default
}

async function main() {
  const canonicalNames = readdirSync(lucideIconsDir)
    .filter((f) => f.endsWith(".mjs") && !f.endsWith(".mjs.map"))
    .map((f) => f.slice(0, -".mjs".length))
    .sort()

  const seen = new Set<string>()
  const rows: [name: string, json: string][] = []

  for (const name of canonicalNames) {
    const prims = sanitize(name, await loadIconNode(name))
    seen.add(name)
    rows.push([name, JSON.stringify(prims)])
  }

  for (const [legacyName, targetName] of Object.entries(COMPAT_ALIASES)) {
    if (seen.has(legacyName)) {
      throw new Error(
        `${legacyName}: COMPAT_ALIASES 条目多余 —— lucide 全量目录里已有同名 canonical 图标`,
      )
    }
    if (!canonicalNames.includes(targetName)) {
      throw new Error(`${legacyName}: 别名目标 "${targetName}" 不在 lucide 全量目录里`)
    }
    const prims = sanitize(legacyName, await loadIconNode(targetName))
    seen.add(legacyName)
    rows.push([legacyName, JSON.stringify(prims)])
  }

  rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const { version: lucideVersion } = JSON.parse(
    readFileSync(path.join(lucideDir, "package.json"), "utf8"),
  ) as { version: string }
  const aliasCount = Object.keys(COMPAT_ALIASES).length

  const entries = rows.map(([name, json]) => `  "${name}": ${json},`)

  const out = `/**
 * PPTX 图标目录（生成文件，勿手改）。
 * 由 scripts/gen-pptx-icons.mts 从 lucide v${lucideVersion}（ISC License，框架无关
 * 核心包）提取全量图标 + ${aliasCount} 个手工兼容别名（该脚本 COMPAT_ALIASES，
 * 桥接 lucide 改名前的旧名）。单源：zod 枚举（IR）与 pptx-svg 渲染共用。
 * ops-kb pydantic Literal 手工镜像。
 * 重新生成：pnpm exec tsx scripts/gen-pptx-icons.mts
 */

/** SVG 原语：与 svg2pptx 受控子集一致（path 含贝塞尔、circle/rect/line/polyline/polygon）。 */
export type PptxIconPrimitive = readonly [tag: string, attrs: Readonly<Record<string, string>>]

export const PPTX_ICONS: Readonly<Record<string, readonly PptxIconPrimitive[]>> = {
${entries.join("\n")}
} as const

export const PPTX_ICON_NAMES = Object.keys(PPTX_ICONS) as [string, ...string[]]
`
  const dest = path.resolve(here, "../src/icons.ts")
  writeFileSync(dest, out)
  console.log(
    `wrote ${dest} with ${rows.length} icons (${canonicalNames.length} canonical + ${aliasCount} compat aliases)`,
  )
}

main()
