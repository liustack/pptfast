/**
 * 从 lucide-react 提取精选图标原语，生成 PPTX 图标目录（单源）：
 *   src/icons.ts
 * 该文件同时供 zod 枚举（IR 校验）与 pptx-svg 渲染消费。ops-kb 的 pydantic
 * Literal 手工镜像此名单（来源注释）。
 *
 * Run: pnpm exec tsx scripts/gen-pptx-icons.mts
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 精选子集：运维/咨询语义优先。名称 = lucide v1.7 的 kebab 名。
const NAMES = [
  // 状态与提示（callout 既有映射依赖前 4 个）
  "info", "triangle-alert", "lightbulb", "check",
  "circle-check", "circle-x", "circle-alert",
  // 趋势与图表
  "trending-up", "trending-down", "activity", "chart-column", "chart-line", "chart-pie", "gauge",
  // 基础设施
  "server", "database", "hard-drive", "cpu", "cloud", "network", "globe", "layers", "package", "boxes",
  // 安全
  "shield", "shield-check", "lock", "key",
  // 人与协作
  "users", "user", "handshake",
  // 目标与行动
  "target", "rocket", "flag", "zap", "wrench", "settings", "search",
  // 流程与交付
  "git-branch", "refresh-cw", "clock", "calendar", "download", "upload", "link",
  // 商业
  "dollar-sign", "percent", "briefcase", "file-text", "folder",
  // ── 扩充批（2026-07-06，总数 ≥100）──
  // 设备与研发
  "monitor", "laptop", "smartphone", "terminal", "bug", "code", "workflow",
  "git-merge", "git-pull-request", "component", "blocks", "container", "cog", "puzzle",
  // 清单与文档
  "list-checks", "clipboard-list", "clipboard-check", "book-open", "files", "archive",
  "file-check", "file-plus", "file-search", "inbox", "send", "list", "list-ordered", "table",
  // 成就与评价
  "award", "trophy", "medal", "star", "heart", "thumbs-up", "crown", "badge-check",
  // 通知与沟通
  "bell", "megaphone", "mail", "message-square", "phone", "video", "camera", "mic",
  "share-2", "external-link", "qr-code", "hash", "at-sign",
  // 网络与硬件
  "wifi", "signal", "plug", "power",
  // 状态与自然
  "sun", "moon", "flame", "droplets", "snowflake", "wind", "thermometer", "infinity",
  // 地理与物流
  "map", "map-pin", "compass", "navigation", "route", "truck", "plane", "ship",
  "building", "building-2", "factory", "warehouse", "store", "home", "landmark",
  // 金融
  "banknote", "credit-card", "wallet", "coins", "piggy-bank", "receipt", "calculator", "scale",
  // 时间
  "timer", "hourglass", "alarm-clock", "history",
  // 交互与视图
  "filter", "sliders-horizontal", "layout-grid", "eye", "play", "pause", "repeat",
  "undo-2", "redo-2", "maximize-2", "zoom-in",
  // 人与身份
  "user-check", "user-plus", "gift",
  // ── 扩充批（2026-07-08）──
  // 医疗健康
  "stethoscope", "pill", "syringe", "heart-pulse", "ambulance", "hospital", "dna",
  "brain", "bandage", "microscope",
  // 教育科研
  "graduation-cap", "school", "university", "library", "book", "flask-conical",
  "test-tube", "beaker", "atom", "telescope", "notebook", "pencil", "ruler",
  // AI 与数据
  "brain-circuit", "bot", "sparkles", "binary", "braces", "regex", "variable",
  "sigma", "pi", "microchip", "memory-stick", "gpu", "circuit-board", "scan", "radar",
  // 太空与网络
  "orbit", "satellite", "satellite-dish", "webhook", "waypoints",
  // 图表补充
  "chart-area", "chart-bar", "chart-scatter", "chart-spline", "chart-gantt",
  "chart-candlestick", "chart-network", "chart-no-axes-combined", "trending-up-down",
  "goal", "crosshair",
  // 运维扩展
  "server-cog", "server-crash", "server-off", "database-backup", "database-search",
  "database-zap", "monitor-check", "monitor-cog", "ethernet-port", "router", "cable",
  "usb", "unplug", "hard-drive-download", "hard-drive-upload", "cloud-cog", "cloud-off",
  "cloud-upload", "cloud-download", "cloud-check", "cloud-alert", "wifi-off", "logs",
  // 研发流程补充
  "git-commit", "git-compare", "git-fork", "git-graph", "square-terminal", "bug-off",
  // 安全补充
  "shield-alert", "shield-x", "shield-off", "shield-plus", "lock-open", "key-round",
  "siren", "ban", "cctv", "fire-extinguisher", "door-closed", "door-open", "vault",
  // 文件与文档补充
  "file-code", "file-json", "file-spreadsheet", "file-archive", "file-diff",
  "file-clock", "file-warning", "file-x", "file-down", "file-up", "file-stack",
  "folder-open", "folder-tree", "folder-cog", "folder-check", "save", "scroll-text",
  "sticky-note", "notepad-text", "newspaper", "signature", "stamp", "paperclip",
  "pin", "bookmark",
  // 商业金融补充
  "shopping-cart", "shopping-bag", "gem", "euro", "bitcoin", "japanese-yen",
  "currency", "badge-dollar-sign", "badge-percent", "gavel", "tag", "tags",
  "ticket", "barcode",
  // 沟通协作补充
  "users-round", "user-cog", "user-search", "user-x", "user-minus", "id-card",
  "speech", "messages-square", "message-circle", "reply", "heart-handshake",
  "hand-helping", "hand-coins", "phone-call", "headset", "headphones",
  "presentation", "projector", "printer", "screen-share", "cast",
  // 交通物流补充
  "car", "bus", "train", "bike", "sailboat", "anchor", "fuel", "traffic-cone",
  "milestone", "signpost", "luggage", "helicopter", "forklift", "tractor", "drone",
  "package-check", "package-search", "package-open",
  // 能源与自然
  "leaf", "sprout", "recycle", "solar-panel", "battery", "battery-charging",
  "ev-charger", "dam", "radiation", "mountain", "trees", "waves", "earth",
  "sunrise", "sunset", "cloud-rain", "cloud-snow", "cloud-lightning", "umbrella",
  "tornado",
  // 生活
  "coffee", "utensils", "chef-hat", "wheat", "apple", "dumbbell",
  // 时间日程补充
  "calendar-days", "calendar-clock", "calendar-check", "calendar-x",
  "calendar-range", "clock-alert", "watch",
  // 视图与布局补充
  "layout-dashboard", "layout-list", "layout-template", "kanban", "columns-3",
  "rows-3", "grid-3x3", "list-todo", "list-tree", "list-filter", "eye-off",
  "focus", "locate-fixed", "minimize-2", "zoom-out", "mouse-pointer",
  "mouse-pointer-click", "keyboard", "mouse", "loader-circle", "shuffle", "merge",
  "split", "shapes", "box", "pyramid",
  // 箭头与流转
  "arrow-right", "arrow-left", "arrow-up", "arrow-down", "arrow-up-right",
  "arrow-down-right", "arrow-left-right", "arrow-up-down", "chevron-right",
  "chevrons-right", "corner-down-right", "iteration-cw", "rotate-cw", "rotate-ccw",
  "refresh-ccw", "expand", "shrink", "log-in", "log-out",
  // 评价与情感
  "star-half", "thumbs-down", "smile", "frown", "meh", "party-popper", "ribbon",
  // 工程制造
  "hammer", "anvil", "drill", "pickaxe", "hard-hat", "construction", "magnet",
  "bolt", "paintbrush", "palette", "scissors", "flashlight", "life-buoy",
  // 状态补充
  "octagon-alert", "octagon-x", "badge-alert", "badge-info", "circle-help",
  "bell-ring", "bell-off",
] as const

const ALLOWED_TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"])
const ALLOWED_ATTRS = new Set([
  "d", "cx", "cy", "r", "x", "y", "width", "height", "rx", "ry",
  "x1", "y1", "x2", "y2", "points",
  // 仅允许 currentColor（下方逐值校验）：散点类图标的实心小圆点，
  // 渲染端（pptx-svg/icons.tsx）把它映射成图标颜色实心填充。
  "fill",
])

const here = path.dirname(fileURLToPath(import.meta.url))
const lucideDir = path.resolve(here, "../node_modules/lucide-react/dist/esm/icons")

async function main() {
  const entries: string[] = []
  for (const name of NAMES) {
    const resolveIconNode = async (
      icon: string,
      depth = 0,
    ): Promise<[string, Record<string, string>][]> => {
      const file = path.join(lucideDir, `${icon}.js`)
      const mod = (await import(file)) as {
        __iconNode?: [string, Record<string, string>][]
        default?: { iconNode?: [string, Record<string, string>][] }
      }
      const node = mod.__iconNode ?? mod.default?.iconNode
      if (node) return node
      // 别名壳（如 home → house）：读源码找 re-export 目标，跟一层
      if (depth < 2) {
        const src = readFileSync(file, "utf8")
        const m = /export \{ default \} from '\.\/([a-z0-9-]+)\.js'/.exec(src)
        if (m) return resolveIconNode(m[1], depth + 1)
      }
      throw new Error(`${icon}: 未找到 __iconNode 导出`)
    }
    const iconNode = await resolveIconNode(name)
    const prims = iconNode.map(([tag, attrs]) => {
      if (!ALLOWED_TAGS.has(tag)) throw new Error(`${name}: 不支持的原语 <${tag}>`)
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "key") continue
        if (!ALLOWED_ATTRS.has(k)) throw new Error(`${name}: 不支持的属性 ${k}`)
        if (k === "fill" && v !== "currentColor")
          throw new Error(`${name}: fill 仅允许 currentColor，实际 ${v}`)
        clean[k] = String(v)
      }
      return [tag, clean] as const
    })
    entries.push(`  "${name}": ${JSON.stringify(prims)},`)
  }

  const out = `/**
 * PPTX 图标目录（生成文件，勿手改）。
 * 由 scripts/gen-pptx-icons.mts 从 lucide-react v1.7.0（ISC License）提取。
 * 单源：zod 枚举（IR）与 pptx-svg 渲染共用。ops-kb pydantic Literal 手工镜像。
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
  console.log(`wrote ${dest} with ${NAMES.length} icons`)
}

main()
