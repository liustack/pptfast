import type {
  ChapterArchetypeId,
  ContentArchetypeId,
  CoverArchetypeId,
  EndingArchetypeId,
  MotifArchetypeId,
} from "../svg/archetypes/types"
import { resolveThemeId, type CanonicalThemeId } from "./index"

/**
 * Personality manifest（spec §3.3）：主题的「选择权」配置——允许哪些
 * archetype。排印/色彩在 tokens，这里只放集合。P2 扩展到四页型 + motif。
 * 页型空集 = 该页型回落调用侧兜底（Wave 5 删旧模板后六主题四页型均非空）。
 */
export interface PersonalityManifest {
  archetypes: {
    cover: readonly CoverArchetypeId[]
    chapter: readonly ChapterArchetypeId[]
    content: readonly ContentArchetypeId[]
    ending: readonly EndingArchetypeId[]
  }
  /** Motif：单值，非 allowed-set（spec §3.3 示意 YAML 的形态）。undefined = 该主题无 motif 装饰（Wave 5 后六主题均已设 motif）。 */
  motif?: MotifArchetypeId
}

export const THEME_MANIFESTS: Record<CanonicalThemeId, PersonalityManifest> = {
  // Wave 4 Task 23：六主题四页型 + motif 全量接线（迁移完成、观感不变）。
  // consulting 的 cover 保留双元素 ["banner-title","poster-center"]——P2 首个
  // 增量（2026-07-09）已人工审通过的多样性增量，不在本任务收窄回单元素。
  // 其余五主题、以及 consulting 的 chapter/content/ending 均填各自「原生」
  // 单 archetype：不引入跨主题多样化（P3 item①②的范围）。
  consulting: {
    archetypes: {
      cover: ["banner-title", "poster-center", "split-diagonal"],
      chapter: ["banner-chapter"],
      content: ["banner-heading", "two-column"],
      ending: ["banner-ending"],
    },
    motif: "banner-motif",
  },
  insight: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      // 2026-07-12 财经借鉴：章节页升级罗马数字+圆环光晕（roman-chapter）
      chapter: ["roman-chapter"],
      content: ["stacked-poster", "two-column"],
      ending: ["poster-ending"],
    },
    motif: "poster-motif",
  },
  academic: {
    archetypes: {
      cover: ["left-anchor", "split-diagonal"],
      chapter: ["rail-chapter"],
      content: ["rail-numbered", "two-column"],
      ending: ["rail-ending"],
    },
    motif: "rail-motif",
  },
  tech: {
    archetypes: {
      cover: ["constellation", "split-diagonal"],
      chapter: ["constellation-chapter"],
      content: ["bento-panel", "two-column"],
      ending: ["constellation-ending"],
    },
    motif: "constellation-motif",
  },
  // magazine（时尚杂志，2026-07-10 拆分）：与 journal 共享 masthead 报头
  // 家族（同版式不同 tokens 气质大变），角饰是人文感故不带 motif。
  // 2026-07-10 冲击力返工（用户否三个换皮色板）：冲击力=超大排印+满版
  // 色块（检索背书），fashion-masthead/fashion-chapter 是 magazine 专属新表达。
  // 2026-07-10 二轮返工（用户裁决「不同页型不能全白底」）：满版-留白节奏
  // ——黑封面→红章节→白内容（黑横幅压顶）→黑结尾，黑红交替是杂志语法。
  runway: {
    archetypes: {
      cover: ["fashion-masthead"],
      chapter: ["fashion-chapter"],
      content: ["banner-heading", "two-column"],
      ending: ["fashion-ending"],
    },
    // motif 刻意不配（2026-07-10 全覆盖时曾加「时尚编辑标记」，两版均被
    // 用户裁难看后撤销）：runway 的语言=满版色块+超大排印+留白，content
    // 页已有黑色大横幅，任何附加装饰都是画蛇添足——排印至上是终审裁决。
  },
  // journal（人文期刊，原 magazine 纯改名）：全套继承，观感零变化。
  journal: {
    archetypes: {
      cover: ["editorial-masthead"],
      chapter: ["masthead-chapter"],
      content: ["narrow-column", "two-column"],
      ending: ["masthead-ending"],
    },
    motif: "corner-ornament-motif",
  },
  // avant（原 custom→gallery 二次返工，2026-07-10）：白墙+正 IKB+炸橘的
  // 高色彩版式组合——gallery v1 撞色弱的根因是 tone-adaptive 家族本身低
  // 色彩，故版式整体换 IKB 斜切封面/巨号章节/横幅内容/大字结尾（banner
  // 横幅 baked 白字在 IKB #002FA7 上对比充足）。motif 留空（白墙不加装饰）。
  enterprise: {
    archetypes: {
      cover: ["split-diagonal"],
      chapter: ["poster-chapter"],
      content: ["banner-heading", "two-column"],
      ending: ["banner-ending"],
    },
    // 2026-07-10 motif 全覆盖：IKB 方块秩序
    motif: "enterprise-motif",
  },
  // luxe（原 retail 黑金重定位，2026-07-10）：零版式代码——全借 creative
  // 家族深底 poster 版式 + two-column 轮换 + split-diagonal（金斜切块封面，
  // readableOn 出深字）。**content 禁配 banner-heading**：其横幅文字是
  // baked 白字，香槟金横幅上白字不可读。motif 留空（验证可选性的先例保留）。
  luxe: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      chapter: ["poster-chapter"],
      content: ["stacked-poster", "two-column"],
      ending: ["poster-ending"],
    },
    // 2026-07-10 motif 全覆盖：烫金细线（原 P3「motif 可选」验证品，补齐）
    motif: "luxe-motif",
  },
  // campaign（活力营销，2026-07-13 memphis 拆分 A）：零版式代码——深紫
  // 底多彩笔刷由专属 campaign-motif 承载，版式借 luxe 同款深底家族。
  // 品红横幅白字对比不足（~3.2:1）——content 禁配 banner-heading（luxe 先例）。
  campaign: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      chapter: ["poster-chapter"],
      content: ["stacked-poster", "two-column"],
      ending: ["poster-ending"],
    },
    motif: "campaign-motif",
  },
  // classroom（教学课堂，2026-07-13 第 13 主题）：零版式代码——莫兰迪
  // 灰调+平滑斑块手绘点线由专属 classroom-motif 承载，版式借 academic
  // 的 rail 编号家族（圆徽章与参考图编号语言契合）。雾蓝横幅白字
  // ~2.9:1 不足——content 禁配 banner-heading（luxe 先例）。
  classroom: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      chapter: ["rail-chapter"],
      content: ["rail-numbered", "two-column"],
      ending: ["rail-ending"],
    },
    motif: "classroom-motif",
  },
  // bloom（柔美庆典，2026-07-13 memphis 拆分 B）：零版式代码——奶白底
  // 水彩晕染+植物细线由专属 bloom-motif 承载，版式借 heritage 同款浅底
  // 家族（紫藤横幅白字 ~6:1 可配 banner-heading）。
  bloom: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      chapter: ["poster-chapter"],
      content: ["banner-heading", "two-column"],
      ending: ["banner-ending"],
    },
    motif: "bloom-motif",
  },
  // ink（水墨国风，2026-07-10 真创意子类②，用户点名例子）：零版式代码——
  // 宣纸/墨/朱砂/楷体靠 tokens + 专属 ink-motif（古籍版框+朱砂印章+淡墨
  // 远山），content 用窄栏（文人排版）+two-column 轮换。
  ink: {
    archetypes: {
      cover: ["poster-center"],
      chapter: ["poster-chapter"],
      content: ["narrow-column", "two-column"],
      ending: ["banner-ending"],
    },
    motif: "ink-motif",
    // ink-motif 自带古籍版框线，MasterChrome 的页脚分隔线会形成双线
    // （2026-07-10 用户截图指出）——style 的 master.suppressFooterRule
    // 抑制该分隔线（W1 从这里的 chrome 拆到 themes/styles.ts），meta 文字照排。
  },
  // heritage（第 8 主题，2026-07-10）：勃艮第×焦糖 putty，零版式代码——
  // 沿用原 retail v1 验证过的浅底混搭（creative cover/chapter + consulting
  // content/ending + two-column 轮换）。酒红横幅上 baked 白字对比充足。
  heritage: {
    archetypes: {
      cover: ["poster-center", "split-diagonal"],
      chapter: ["poster-chapter"],
      content: ["banner-heading", "two-column"],
      ending: ["banner-ending"],
    },
    // 2026-07-10 motif 全覆盖：典藏纹饰（徽记/角花/页缘线）
    motif: "heritage-motif",
  },
}

export function getManifest(id: string): PersonalityManifest {
  return THEME_MANIFESTS[resolveThemeId(id)] ?? THEME_MANIFESTS.enterprise
}
