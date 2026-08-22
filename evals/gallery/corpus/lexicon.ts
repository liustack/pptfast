/**
 * Review-corpus vocabulary, one entry per language track.
 *
 * This is deliberately NOT `src/svg/audit/stress-fixtures.ts`. Those decks
 * are pathological by design (that file says so in its own header: "do not
 * tune the renderers to make these fixtures look good"). They answer "does
 * anything overflow". The visual review answers a different question —
 * "does this look like something a person would send" — and needs the
 * opposite kind of input: ordinary, plausible, well-behaved content, the
 * length a real author actually writes.
 *
 * Every string here is real prose about one coherent fictional subject, so
 * a reviewer paging through 400 slides reads a consistent story instead of
 * re-orienting on every page. The three tracks are the same company:
 *
 * - `zh`    CloudSeek collaboration SaaS, Chinese quarterly business review
 * - `en`    the same company's board deck, English
 * - `mixed` the same company's platform-migration deck, CJK prose carrying
 *           Latin product/tech names inline — the script mix that actually
 *           breaks line-breaking, not an artificial alternation
 *
 * Pools are typed by role rather than by component. A builder asks for
 * "short nominal labels" or "one-line claims" and slices what it needs, so
 * adding a component costs one builder, not three hand-written blobs.
 */

/** Fixed-length tuple helper — keeps the three tracks structurally parallel. */
type Pool = readonly string[]

export interface Metric {
  readonly value: string
  readonly unit?: string
  readonly label: string
  readonly delta?: "up" | "down" | "flat"
}

export interface Person {
  readonly name: string
  readonly role: string
  readonly org: string
}

export interface Lexicon {
  readonly id: LanguageId
  /** Human-readable name for the gallery's own shell. */
  readonly display: string

  readonly deckTitle: string
  readonly deckSubtitle: string
  readonly author: string
  readonly date: string

  /** Section/chapter titles — at least 6. */
  readonly chapters: Pool
  /** Page headings — at least 12. */
  readonly headings: Pool
  /** Short sub-headings / eyebrow lines. */
  readonly kickers: Pool

  /** Full prose paragraph, the length a real body paragraph runs. */
  readonly paragraph: string
  /**
   * The same argument at the length a *narrow* text column holds.
   *
   * A full-bleed image takeover leaves its prose a column roughly half the
   * page wide and a third of it tall — `image-split` gives 564x238, seven
   * lines of body text. `paragraph` is written for a full content rect and
   * runs 536 characters in English, thirteen lines, so the renderer
   * correctly truncates it and the review table ends up showing the
   * degrade path instead of the layout. Every track is sized against the
   * tightest of those columns, so no track truncates and none of them
   * looks half-empty either.
   */
  readonly shortParagraph: string
  /** Complete sentences, one clause of argument each — at least 10. */
  readonly sentences: Pool
  /**
   * Bullet-length lines — at least 6. Kept separate from `sentences`
   * because they are a different register, not a shorter cut of the same
   * text: a bullet is a claim stripped to its subject and verb, and the
   * renderer enforces that with a hard truncation limit a full sentence
   * blows straight past in English.
   */
  readonly bullets: Pool
  /** Noun phrases, card-title length — at least 12. */
  readonly phrases: Pool
  /** Short nominal labels, tag/node/axis length (<= 24 chars) — at least 16. */
  readonly labels: Pool

  /** Positive findings — SWOT strengths, advantages, wins. */
  readonly strengths: Pool
  /** Negative findings — SWOT weaknesses, gaps. */
  readonly weaknesses: Pool
  /** Forward-looking upside — SWOT opportunities. */
  readonly opportunities: Pool
  /** Downside risks — SWOT threats, warnings. */
  readonly threats: Pool

  /** Process stage names, in order — at least 6. */
  readonly stages: Pool
  /** Time period labels, in order — at least 5. */
  readonly periods: Pool
  /**
   * The name of the dimension `periods` measures — "季度"/"Quarter", not
   * "第一季度"/"Q1".
   *
   * An axis title says what the axis *is*; a tick says where you are on it.
   * The corpus used to hand `periods[0]` to every chart's `x_title`, so the
   * gallery's own pages repeated their first tick under the axis and a
   * reviewer could not tell a corpus mistake from a renderer one (review
   * round 4, `theme--ember--zh--p05`).
   */
  readonly periodAxis: string
  /**
   * The name of the dimension the segment labels (`labels[8]` onward — the
   * ones the corpus uses as chart series and heatmap rows) belong to.
   * Same rule as `periodAxis`: the dimension, never one of its members.
   */
  readonly segmentAxis: string
  /** Organization names — at least 12 (logo wall needs up to 12). */
  readonly orgs: Pool
  /** Named people with roles. */
  readonly people: readonly Person[]
  /** Headline numbers. */
  readonly metrics: readonly Metric[]
  /** Technology / capability tags, <= 24 chars each. */
  readonly tags: Pool

  readonly quote: { readonly text: string; readonly attribution: string }
  readonly callouts: {
    readonly info: string
    readonly warn: string
    readonly tip: string
  }
  readonly code: { readonly language: string; readonly code: string }
  readonly verdicts: {
    readonly positive: string
    readonly warning: string
    readonly neutral: string
  }
  /** Source citations. */
  readonly sources: readonly { label: string; ref?: string; url?: string }[]
  /** Caption text for image slots. */
  readonly captions: Pool
  /** Browser address-bar text for the device mockup. */
  readonly url: string
}

export type LanguageId = "zh" | "en" | "mixed"

export const LANGUAGE_IDS: readonly LanguageId[] = ["zh", "en", "mixed"]

// ─────────────────────────────────────────────────────────────────────────
// zh — 中文季度业务评审
// ─────────────────────────────────────────────────────────────────────────

const zh: Lexicon = {
  id: "zh",
  display: "中文",

  deckTitle: "云觅科技 2026 年第二季度业务评审",
  deckSubtitle: "工作区席位订阅业务的增长质量与下半年投入方向",
  author: "战略与运营部",
  date: "2026 年 7 月",

  chapters: [
    "本季度概览",
    "客户与收入结构",
    "产品与交付",
    "成本与效率",
    "风险与应对",
    "下半年重点",
  ],

  headings: [
    "续约率回升，但新签仍然依赖三个大客户",
    "付费席位量首次突破十万席",
    "协作活跃率提升带来的会议次数减少",
    "开通周期从九周压缩到五周",
    "毛利改善主要来自自建基建替换",
    "华东区域的渗透率仍然落后于华南",
    "客户成功人力是当前最硬的瓶颈",
    "竞品在中小客户市场的价格压力",
    "产品团队的迭代节奏与销售预期存在落差",
    "三条产品线的资源分配需要重新排序",
    "客户成功团队的响应时间已达行业前列",
    "下半年的三项确定性投入",
    "从方案设计到席位开通，实施仍接不住完整一圈",
  ],

  kickers: ["经营分析", "客户洞察", "产品进展", "风险提示", "资源规划", "结论"],

  paragraph:
    "本季度付费席位量首次突破十万席，同比增长六成七，其中新增部分有将近一半来自存量客户的席位扩容，而不是新签。这个结构说明产品在已验证场景里的复制成本正在下降，但也意味着增长的天花板取决于我们能否打开新的客群场景。咨询和软件两个客群的验证已经完成，教育的采购周期比预期更长，开通链路还需要一个季度的打磨。",

  shortParagraph:
    "本季度付费席位量首次突破十万席，同比增长六成七，其中将近一半来自存量客户的席位扩容，而不是新签。这个结构说明产品在已验证客群里的复制成本正在下降，但天花板仍取决于能否打开新的客群场景。咨询和软件的验证已经完成，教育的采购周期比预期更长，开通链路还要一个季度。",

  sentences: [
    "续约率回升到百分之九十一，是过去六个季度的最高点。",
    "新签合同额同比增长两成三，但三个头部客户贡献了其中的六成。",
    "协作活跃率提升到百分之八十八，直接把客户的跨团队协同时间压低了四成。",
    "开通周期从九周压缩到五周，主要靠标准化开通模板。",
    "自建基建替换公有云托管，单个席位的月度成本下降三成一。",
    "华东区域的渗透率是华南的一半，销售覆盖密度是主要原因。",
    "客户成功工程师的人均负荷已经接近上限，扩张速度受制于招聘。",
    "两家竞品在中小客户市场以低于成本的价格投标，短期内难以正面应对。",
    "产品团队的版本迭代周期是六周，销售侧期望是三周。",
    "三条产品线共用一支实施团队，资源冲突在本季度出现过四次。",
    "客户成功团队的首次响应时间中位数是十七分钟。",
    "下半年的投入集中在渠道下沉、客群模板和开通自动化三处。",
  ],

  bullets: [
    "续约率回到九成一，六个季度最高",
    "新签同比增长两成三，集中度偏高",
    "协作活跃率八成八，会议时间降四成",
    "开通周期九周压到五周",
    "自建基建让单席月成本降三成一",
    "华东渗透率只有华南的一半",
  ],

  phrases: [
    "存量客户席位扩容",
    "标准化开通模板",
    "自建基建替换",
    "客群场景复制",
    "开通流程自动化",
    "渠道伙伴培育",
    "产品迭代提速",
    "数据质量治理",
    "协作网络下沉",
    "客户健康度分层",
    "实施资源池化",
    "定价体系重构",
  ],

  labels: [
    "席位开通",
    "用量采集",
    "模板配置",
    "权限建模",
    "知识检索",
    "消息触达",
    "开通闭环",
    "效果复盘",
    "咨询",
    "软件",
    "教育",
    "金融",
    "华东",
    "华南",
    "华北",
    "西南",
  ],

  strengths: [
    "协作活跃率领先同行两个身位",
    "存量客户复购意愿强",
    "开通模板已覆盖四个客群",
    "自建基建显著改善毛利",
  ],
  weaknesses: [
    "新签过度依赖头部客户",
    "客户成功人力接近饱和",
    "华东销售覆盖密度不足",
    "产品迭代周期长于销售预期",
  ],
  opportunities: [
    "教育客群尚无成熟供应商",
    "咨询公司愿意做联合方案",
    "地方信创采购补贴窗口",
    "海外东南亚分支扩张需求",
  ],
  threats: [
    "竞品在中小市场低价投标",
    "大客户自建团队替代意愿",
    "客户数据合规要求收紧",
    "关键连接器供应周期拉长",
  ],

  stages: ["需求确认", "方案设计", "席位开通", "权限配置", "试运行", "验收交付"],
  periods: ["第一季度", "第二季度", "第三季度", "第四季度", "明年上半年"],
  periodAxis: "季度",
  segmentAxis: "客群",

  orgs: [
    "临江咨询",
    "北岸软件",
    "云山教育",
    "东启金融",
    "永固传媒",
    "远洋咨询",
    "金穗学堂",
    "华瑞基金",
    "南港广告",
    "泰和保险",
    "启明数据",
    "长风设计",
  ],

  people: [
    { name: "陈砚清", role: "首席技术官", org: "云觅科技" },
    { name: "林知远", role: "交付负责人", org: "云觅科技" },
    { name: "苏未晚", role: "产品总监", org: "云觅科技" },
    { name: "赵长风", role: "协作总监", org: "临江咨询" },
    { name: "何予安", role: "数字化负责人", org: "北岸软件" },
    { name: "顾南乔", role: "知识经理", org: "云山教育" },
  ],

  metrics: [
    { value: "10.2", unit: "万席", label: "付费席位总量", delta: "up" },
    { value: "91", unit: "%", label: "客户续约率", delta: "up" },
    { value: "88", unit: "%", label: "工作区周活跃率", delta: "up" },
    { value: "5", unit: "周", label: "平均开通周期", delta: "down" },
    { value: "31", unit: "%", label: "单席月度成本降幅", delta: "down" },
    { value: "17", unit: "分钟", label: "首次响应中位数", delta: "flat" },
  ],

  tags: [
    "工作区订阅",
    "实时协作",
    "知识库检索",
    "会议纪要",
    "项目看板",
    "权限中心",
    "单点登录",
    "用量分析",
    "席位占用预测",
    "SCIMv2",
    "审计日志",
    "Kubernetes",
  ],

  quote: {
    text: "我们不是在卖席位，是在卖一个团队少开一场会。客户能不能感知到这件事，决定了这单能不能续。",
    attribution: "陈砚清，云觅科技首席技术官",
  },

  callouts: {
    info: "本报告的口径与上季度一致，付费席位量按季度末在线状态统计，不含试运行期席位。",
    warn: "教育客群的开通链路仍在打磨，第三季度的客群收入预测存在正负两成的偏差空间。",
    tip: "客群模板复用可以把新客户的开通工时压到原来的四成，优先在软件线推广。",
  },

  code: {
    language: "python",
    code: `def seat_occupancy(signal: Series, model: Model) -> float:
    """按滑窗特征估计席位剩余配额（席均）。"""
    features = extract_features(signal, window="7d")
    if features.coverage < 0.8:
        raise DataQualityError("活跃覆盖率不足，拒绝给出预测")
    return model.predict(features).clip(lower=0.0)`,
  },

  verdicts: {
    positive: "续约与活跃率双双改善，本季度经营质量优于预期",
    warning: "新签集中度过高，头部客户流失将直接击穿全年目标",
    neutral: "三条产品线的资源排序结论待下月经营会确认",
  },

  sources: [
    { label: "云觅科技 2026 年第二季度经营数据", ref: "内部口径，7 月 5 日封账" },
    { label: "中国协作软件订阅市场规模测算", ref: "行业研究院，2026" },
    { label: "客户满意度年度调研", url: "https://example.com/survey-2026" },
  ],

  captions: [
    "临江咨询三号团队的协作工作区",
    "文档模板库在咨询项目中的复用位置",
    "客户成功的实时健康看板",
    "实施工程师使用管理端完成席位开通",
  ],

  url: "portal.cloudseek.example.com/workspaces",
}

// ─────────────────────────────────────────────────────────────────────────
// en — the same company, English board deck
// ─────────────────────────────────────────────────────────────────────────

const en: Lexicon = {
  id: "en",
  display: "English",

  deckTitle: "CloudSeek Collaboration Q2 2026 Business Review",
  deckSubtitle: "Growth quality in paid workspace seating and where the second half goes",
  author: "Strategy & Operations",
  date: "July 2026",

  chapters: [
    "Quarter at a Glance",
    "Customers and Revenue Mix",
    "Product and Delivery",
    "Cost and Efficiency",
    "Risks and Responses",
    "Second-Half Priorities",
  ],

  headings: [
    "Renewals recovered, but new business still leans on three accounts",
    "Workspace headcount passed one hundred thousand seats",
    "Better activation coverage translated directly into less friction",
    "Delivery time compressed from nine weeks to five",
    "Margin improvement came mostly from moving workloads in-house",
    "East China penetration still trails the South",
    "Success staff headcount is the hardest constraint we have",
    "Competitors are pricing below cost in the mid-market",
    "The build iteration cadence lags what the business expects",
    "Three product lines are competing for one delivery team",
    "Customer success response times now lead the category",
    "Three commitments for the second half",
    "The loop from access mapping to a closed seat grant still breaks on the floor",
  ],

  kickers: ["Performance", "Customers", "Product", "Risk", "Resourcing", "Conclusion"],

  paragraph:
    "Workspace headcount passed one hundred thousand seats this quarter, up sixty-seven percent year over year, and close to half of that growth came from existing customers expanding onto new seat allocations rather than from new logos. That mix tells us the cost of replicating the product inside a proven setting is falling, but it also means our ceiling depends on opening new customer segments. Consulting plus software are validated. Campus buyers turned out to be slower to land, and the data path there needs another quarter of work.",

  shortParagraph:
    "Workspace headcount passed one hundred thousand seats this quarter, up sixty-seven percent year over year. Close to half of that growth came from existing customers expanding onto new seat allocations rather than from new logos.",

  sentences: [
    "Renewal rate recovered to ninety-one percent, the highest in six quarters.",
    "New bookings grew twenty-three percent, but three accounts contributed sixty percent of that.",
    "Activation coverage reached eighty-eight percent, cutting unplanned meetings by forty percent.",
    "Delivery time fell from nine weeks to five, largely through standardized onboarding templates.",
    "Moving workloads off public cloud dropped per-seat monthly cost by thirty-one percent.",
    "East China penetration is half of South China, and sales coverage density is the main reason.",
    "Client managers are running near their load ceiling, so expansion is gated on hiring.",
    "Two competitors are bidding below cost in the mid-market, which we cannot meet head-on.",
    "The product team ships feature updates every six weeks. The business asks for three.",
    "Three product lines share one delivery team, and that collided four times this quarter.",
    "Median first response from customer success is seventeen minutes.",
    "Second-half investment concentrates on in-house hosting, segment playbooks, and channel build-out.",
  ],

  bullets: [
    "Renewals back to 91%, a six-quarter high",
    "Bookings up 23%, still too concentrated",
    "Activity at 88%, meetings down 40%",
    "Delivery cut from nine weeks to five",
    "In-house hosting cut seat cost by 31%",
    "East China at half of South China",
  ],

  phrases: [
    "Seat expansion in existing accounts",
    "Standardized onboarding templates",
    "In-house workspace compute",
    "Vertical playbook replication",
    "Staffing-path automation",
    "Channel partner enablement",
    "Faster build iteration",
    "Data quality governance",
    "Search index push-down",
    "Customer health tiering",
    "Pooled delivery capacity",
    "Pricing structure rebuild",
  ],

  labels: [
    "Onboarding",
    "Seat setup",
    "Access models",
    "Meetings",
    "Knowledge",
    "Mentions",
    "Seat change",
    "Review",
    "Consulting",
    "Platforms",
    "K-12",
    "Credit",
    "East",
    "South",
    "North",
    "Southwest",
  ],

  strengths: [
    "Activity leads the category by a clear margin",
    "Existing customers reliably expand",
    "Onboarding templates cover four industries",
    "In-house hosting materially lifts margin",
  ],
  weaknesses: [
    "New bookings concentrated in three accounts",
    "Success bench capacity near saturation",
    "Thin sales coverage across East China",
    "Build iteration slower than the business wants",
  ],
  opportunities: [
    "No mature vendor serves campus buyers yet",
    "Consulting firms want joint offerings",
    "Regional upgrade subsidies are open",
    "Southeast Asian new-office demand",
  ],
  threats: [
    "Below-cost bids in the mid-market",
    "Large accounts building in-house teams",
    "Tightening workplace data regulations",
    "Longer lead times on key add-ons",
  ],

  stages: ["Scoping", "Solutioning", "Seat setup", "Access setup", "Pilot run", "Acceptance"],
  periods: ["Q1", "Q2", "Q3", "Q4", "H1 next year"],
  periodAxis: "Quarter",
  segmentAxis: "Vertical",

  orgs: [
    "Linjiang Group",
    "Northshore Software",
    "Yunshan School",
    "Dongqi Fund",
    "Yonggu Market",
    "Ocean Education",
    "Jinsui Study",
    "Huarui Equity",
    "Nangang Brand",
    "Taihe Holdings",
    "Qiming Digital Lab",
    "Changfeng Designers",
  ],

  people: [
    { name: "Yanqing Chen", role: "Chief Technology Officer", org: "CloudSeek Collaboration" },
    { name: "Zhiyuan Lin", role: "Head of Delivery", org: "CloudSeek Collaboration" },
    { name: "Weiwan Su", role: "Director of Workspaces", org: "CloudSeek Collaboration" },
    { name: "Changfeng Zhao", role: "Chief Collaboration Lead", org: "Linjiang Group" },
    { name: "Yuan He", role: "Head of Digital", org: "Northshore Software" },
    { name: "Nanqiao Gu", role: "Collaboration Lead", org: "Yunshan School" },
  ],

  metrics: [
    { value: "102k", unit: "seats", label: "Workspace headcount", delta: "up" },
    { value: "91", unit: "%", label: "Renewal rate", delta: "up" },
    { value: "88", unit: "%", label: "Activation coverage", delta: "up" },
    { value: "5", unit: "weeks", label: "Average delivery time", delta: "down" },
    { value: "31", unit: "%", label: "Seat cost reduction", delta: "down" },
    { value: "17", unit: "min", label: "Median first response", delta: "flat" },
  ],

  tags: [
    "Workspace subscription",
    "Team folders",
    "Content search",
    "Meeting minutes AI",
    "Shared calendar",
    "Access roles",
    "SCIM identity sync",
    "Activity insights",
    "Seat occupancy",
    "OpenID",
    "LDAP",
    "Kubernetes",
  ],

  quote: {
    text: "We are not selling an interface. We are selling one fewer status meeting on a weekly calendar. Whether the customer can feel that is what decides the renewal.",
    attribution: "Yanqing Chen, CTO, CloudSeek Collaboration",
  },

  callouts: {
    info: "Definitions match last quarter. Workspace headcount counts seats online at quarter end and excludes pilot deployments.",
    warn: "The campus-pilot data path is still being reworked, so the Q3 forecast for that segment carries a twenty percent band either way.",
    tip: "Reusing the industry template cuts onboarding effort to roughly forty percent of a cold start. Push it through the education line first.",
  },

  code: {
    language: "python",
    code: `def seat_occupancy(signal: Series, model: Model) -> float:
    """Estimate remaining unused seats from a seven-day sliding window."""
    features = extract_features(signal, window="7d")
    if features.coverage < 0.8:
        raise DataQualityError("activation coverage too low to predict")
    return model.predict(features).clip(lower=0.0)`,
  },

  verdicts: {
    positive: "Renewals and activity both improved. Quarter quality ran ahead of plans",
    warning: "Booking concentration is high enough that losing one top account breaks the annual target",
    neutral: "Resource ordering across the three product lines is pending next month's review",
  },

  sources: [
    { label: "CloudSeek Workspaces Q2 2026 operating data", ref: "internal, books closed 5 July" },
    { label: "China workspace subscription market sizing", ref: "Industry Research Institute, 2026" },
    { label: "Annual customer satisfaction survey", url: "https://example.com/survey-2026" },
  ],

  captions: [
    "Onboarding session with team three at Linjiang Group",
    "Template gallery placement on the home sidebar",
    "Live usage wall in the workspaces center",
    "A client manager closing a seat grant from mobile",
  ],

  url: "portal.cloudseek.example.com/workspaces",
}

// ─────────────────────────────────────────────────────────────────────────
// mixed — CJK prose carrying Latin product and technology names inline
// ─────────────────────────────────────────────────────────────────────────

const mixed: Lexicon = {
  id: "mixed",
  display: "中英混排",

  deckTitle: "云觅科技平台迁移方案：从 ECS 自建到 Kubernetes 托管",
  deckSubtitle: "Terraform + ArgoCD 双轨落地，2026 Q3 完成灰度",
  author: "Platform Engineering 团队",
  date: "2026 年 7 月",

  chapters: [
    "为什么要迁移 Kubernetes",
    "现有 ECS 架构的问题",
    "目标架构与 SLO",
    "迁移路径与 rollback",
    "成本与 FinOps 测算",
    "Q3 排期与 owner",
  ],

  headings: [
    "现有 ECS 部署的伸缩窗口是 12 分钟，SLO 要求 90 秒",
    "把 workspace 服务下沉到 edge node 之后的延迟分布",
    "Terraform state 拆分带来的 blast radius 收敛",
    "ArgoCD 的 app-of-apps 模式如何管住 40 个 service",
    "Prometheus + Loki 替换自建 ELK 的成本对比",
    "灰度期间 canary 流量的切分策略",
    "PodDisruptionBudget 配错导致的一次演练失败",
    "多可用区部署下 etcd 的写放大问题",
    "Service Mesh 引入与否的取舍",
    "镜像构建从 Jenkins 迁到 GitHub Actions 的收益",
    "on-call 轮值与 runbook 的补齐进度",
    "Q3 需要冻结的三件事",
    "Canary 切流到 rollback 的演练还没有形成闭环",
  ],

  kickers: ["Why now", "现状盘点", "目标架构", "风险 & rollback", "成本测算", "排期"],

  paragraph:
    "现有 ECS 自建部署的伸缩窗口是 12 分钟，而业务侧的 SLO 要求 90 秒内完成扩容，这中间的差距靠加机器填不平。迁到 Kubernetes 之后，HPA 配合预热的 warm pool 可以把 P95 扩容时间压到 40 秒左右，代价是我们要重建整套 observability：Prometheus 抓指标、Loki 收日志、Tempo 做 trace，三件事都得在灰度之前跑通，否则出问题时连排查入口都没有。",

  shortParagraph:
    "现有 ECS 自建部署的伸缩窗口是 12 分钟，而业务侧的 SLO 要求 90 秒内完成扩容，这中间的差距靠加机器填不平。迁到 Kubernetes 之后，HPA 配合预热的 warm pool 可以把 P95 压到 40 秒左右，代价是要重建整套 observability。",

  sentences: [
    "现有 ECS 部署的扩容窗口是 12 分钟，业务 SLO 要求 90 秒。",
    "HPA 加 warm pool 可以把 P95 扩容时间压到 40 秒。",
    "Terraform state 按 environment 拆成 6 份，blast radius 收敛到单环境。",
    "ArgoCD 用 app-of-apps 管理 40 个 service，同步策略统一为 automated + prune。",
    "Prometheus + Loki 的年度成本比自建 ELK 低 38%，运维工时减少更多。",
    "灰度按 canary 5% → 25% → 100% 三档推进，每档观察 48 小时。",
    "上次演练因为 PodDisruptionBudget 写成 maxUnavailable: 0 而卡死，已修。",
    "跨 AZ 部署下 etcd 的写放大在压测中达到 3.2 倍，需要调 compaction 周期。",
    "Service Mesh 本期不引入，Istio 的运维负担超过它解决的问题。",
    "镜像构建从 Jenkins 迁到 GitHub Actions，平均构建时长从 11 分钟降到 4 分钟。",
    "on-call runbook 已补齐 28 条，还差 9 条 SSO 相关的。",
    "Q3 需要冻结的是 API 版本、镜像基线和 Terraform provider 版本。",
  ],

  bullets: [
    "ECS 扩容 12 分钟，SLO 要求 90 秒",
    "HPA + warm pool 把 P95 压到 40 秒",
    "Terraform state 拆成 6 份，收敛 blast radius",
    "ArgoCD app-of-apps 纳管 40 个 service",
    "Prometheus + Loki 比自建 ELK 省 38%",
    "Canary 三档推进，每档观察 48 小时",
  ],

  phrases: [
    "HPA 弹性伸缩",
    "Terraform state 拆分",
    "ArgoCD app-of-apps",
    "Prometheus 指标采集",
    "Loki 日志聚合",
    "Canary 灰度发布",
    "PDB 与 rollback",
    "多 AZ etcd 部署",
    "GitHub Actions 构建",
    "Image 基线冻结",
    "on-call runbook",
    "FinOps 成本归因",
  ],

  labels: [
    "ECS 自建",
    "K8s 托管",
    "Ingress",
    "HPA",
    "PDB",
    "etcd",
    "Prometheus",
    "Loki",
    "Tempo",
    "ArgoCD",
    "Terraform",
    "Canary",
    "Staging",
    "Prod",
    "AZ-A",
    "AZ-B",
  ],

  strengths: [
    "Kubernetes 生态成熟，招人不难",
    "ArgoCD 的 GitOps 审计链完整",
    "Terraform 已覆盖 90% 基础设施",
    "团队有两次小规模 K8s 上线经验",
  ],
  weaknesses: [
    "observability 栈需要整套重建",
    "etcd 跨 AZ 写放大尚未解决",
    "on-call runbook 还差 9 条",
    "缺少 chaos engineering 的常态演练",
  ],
  opportunities: [
    "云厂商托管 control plane 免费",
    "Spot 实例可覆盖 60% 的 batch 负载",
    "内部平台可对外做 PaaS 复用",
    "统一 CI 后可接入 SLSA 供应链签名",
  ],
  threats: [
    "迁移期间双栈成本翻倍",
    "CVE 响应窗口被 image 冻结拉长",
    "K8s minor 版本每年两次强制升级",
    "关键人员依赖，bus factor 为 2",
  ],

  stages: ["方案评审", "Terraform 重构", "Staging 迁移", "Canary 灰度", "全量切换", "ECS 下线"],
  periods: ["Q3 第 1 月", "Q3 第 2 月", "Q3 第 3 月", "Q4 第 1 月", "Q4 第 2 月"],
  periodAxis: "月份",
  segmentAxis: "平台组件",

  orgs: [
    "Linjiang Group 临江咨询",
    "Northshore 北岸软件",
    "Yunshan 云山教育",
    "Dongqi 东启金融",
    "Yonggu 永固传媒",
    "Ocean 远洋咨询",
    "Jinsui 金穗学堂",
    "Huarui 华瑞基金",
    "Nangang 南港广告",
    "Taihe 泰和保险",
    "Qiming 启明数据",
    "Changfeng 长风设计",
  ],

  people: [
    { name: "陈砚清", role: "CTO", org: "云觅科技" },
    { name: "Zhiyuan Lin", role: "Platform Lead", org: "云觅科技" },
    { name: "苏未晚", role: "SRE Manager", org: "云觅科技" },
    { name: "Changfeng Zhao", role: "Infra Architect", org: "云觅科技" },
    { name: "何予安", role: "Security Engineer", org: "云觅科技" },
    { name: "Nanqiao Gu", role: "FinOps Analyst", org: "云觅科技" },
  ],

  metrics: [
    { value: "40", unit: "s", label: "P95 扩容耗时", delta: "down" },
    { value: "38", unit: "%", label: "observability 成本降幅", delta: "down" },
    { value: "40", unit: "个", label: "纳管 service 数", delta: "up" },
    { value: "4", unit: "min", label: "平均构建时长", delta: "down" },
    { value: "99.95", unit: "%", label: "目标可用性 SLO", delta: "flat" },
    { value: "3.2", unit: "x", label: "etcd 写放大", delta: "up" },
  ],

  tags: [
    "Kubernetes",
    "Terraform",
    "ArgoCD",
    "Prometheus",
    "Loki",
    "Tempo",
    "HPA 弹性",
    "Canary 灰度",
    "GitOps",
    "Spot 实例",
    "PostgreSQL RDS",
    "SLSA 签名",
  ],

  quote: {
    text: "迁移不是把 workload 搬过去就算完，observability 没跑通之前，Kubernetes 只是一个你看不见内部的黑盒。",
    attribution: "苏未晚，云觅科技 SRE Manager",
  },

  callouts: {
    info: "本方案的成本测算基于 2026 Q2 的实际用量，Spot 折扣按 60% 覆盖率保守估计。",
    warn: "灰度期间 ECS 与 Kubernetes 双栈并行，月度成本会短暂翻倍，财务侧已知会。",
    tip: "先把 Prometheus + Loki 在 staging 跑满两周，再动 production 的任何 workload。",
  },

  code: {
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: workspace-api       # 协作网关，灰度期间双栈并存
spec:
  replicas: 6
  strategy:
    rollingUpdate: { maxSurge: 2, maxUnavailable: 0 }`,
  },

  verdicts: {
    positive: "Staging 全链路已跑通，Canary 具备进入条件",
    warning: "etcd 跨 AZ 写放大未解决，全量切换前必须收敛",
    neutral: "Service Mesh 是否引入，留到 Q4 单独评审",
  },

  sources: [
    { label: "云觅科技 Platform 团队压测报告", ref: "2026-06-28" },
    { label: "Kubernetes 官方 SLO 指南", url: "https://kubernetes.io/docs/" },
    { label: "云厂商 Q2 账单与 FinOps 归因", ref: "内部口径" },
  ],

  captions: [
    "Staging 集群的 ArgoCD 应用拓扑",
    "Canary 灰度期间的 P95 延迟分布",
    "Grafana 上的 etcd 写放大面板",
    "GitHub Actions 构建流水线视图",
  ],

  url: "argocd.cloudseek.example.com/v/applications",
}

export const LEXICONS: Readonly<Record<LanguageId, Lexicon>> = { zh, en, mixed }
