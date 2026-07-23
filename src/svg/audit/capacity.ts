/**
 * 安全内容预算（容量表）。由 1280×720 页面几何推导，是前端 ir-quality
 * 质量门与后端 pptx_create 内容 lint（ops-kb，计划二 A-2）的共同数值来源。
 * 修改任何渲染几何常量（templates/*.tsx 的 rect、layout.ts 的 GAP、
 * blocks 内的字号/行高）后必须复核本表，并同步交接文档
 * `.issues/plans/pptx-capacity-table.md`。
 *
 * 核实过的几何输入（执行时勿凭记忆重猜）：
 * - 页面像素↔英寸换算 96px = 1in（`constants.ts` PX_PER_IN，
 *   1280×720px = 13.333×7.5in）。
 * - 内容区最窄矩形：`custom.tsx` `CustomContent` 背景图态
 *   （`withBg` 分支）最窄：`{ w: 1096, h: 400 }`（其余：custom 白底态
 *   1152×420|460、creative 1168×380|400|420|460）。academic 已随
 *   Task 2 换骨改为编号导轨式（见下），不再是 1120×380|400 的贡献者。
 *   ikb-swiss/anthropic-clay 已随主题换骨硬删（Task 5），不再计入。
 *   tech 走卡片拼盘（`bento-layout.ts`），不经
 *   `layoutContentFit`/两栏切分，不引入比 1096 更窄的矩形，同样不改变本表。
 * - **consulting 结论横幅式换骨（Task 1，2026-07-06）**：Content 页改为
 *   `MckinseyNavyContent`（`consulting.tsx`）——顶部一条 `x=96 w=1088` 的
 *   filled 断言横幅（1 行标题高 88px / 2 行 132px），`SvgContent` 内容矩形随
 *   横幅高度下移，`y = 横幅底 + 32`，底边固定 620，故 `h` 在 384px（2 行
 *   横幅）～428px（1 行横幅）之间——不再有 `contentH = footnote ? 380 : 400`
 *   的按 footnote 收窄分支（来源行改为固定 y=648 的细线 + 线下 footnote，
 *   与内容矩形高度解耦）。宽度 1088 比本表此前引用的最窄矩形 custom 1096
 *   更窄 8px，two_column 单列会算出 `(1088 - 32) / 2 = 528px`（比下面基准
 *   532px 更窄，但仍宽于 magazine 已验证过的 424px）——沿用与
 *   magazine 相同的结论：`audit-baseline.test.ts` 对 consulting 在
 *   新 528px 单列下跑全部压力 fixture（含 `bullets`/`chart` 的 `two_column`
 *   变体）零溢出门 100% 通过，证明动态缩字号/换行/截断已经兜住，不需要为
 *   这一更窄场景收紧本表任何常量。高度上界（384px）仍不小于本表其余数字所
 *   依赖的 380px 基准（该基准现由 academic 单独提供，见下），故
 *   `maxBlocksPerSlide`/`bullets.maxItems` 均不受影响。
 * - **magazine 窄栏复核（Task 6，2026-07-06 已做）**：内容栏刻意收窄到
 *   880（`magazine.tsx` `COLUMN_W`，杂志窄栏版式），且 `arrangement` 原样
 *   透传给 `SvgContent`——`two_column` 页会把这 880 再按下面的
 *   `(rect.w - COLUMN_GAP) / 2` 切成两栏，得到 `(880 - 32) / 2 = 424px`，比
 *   下面 two_column 单列基准 532px 更窄。已用 `audit-baseline.test.ts` 的
 *   `bullets`/`chart` 压力 fixture（均含 `two_column` 变体）在新 6 主题矩阵
 *   下对 magazine 实测：零溢出门 48/48 全绿，证明 424px 下
 *   `fitSvgLine`/`layoutSvgText` 的动态缩字号 + 换行 + 截断已经兜住渲染安全，
 *   不依赖本表的经验值。**结论：不收紧 `bullets.maxUnitsPerItem`**——
 *   `ir-quality.ts` 消费该常量时是主题/版式无关的单一 flat 阈值（判断时既不
 *   知道块最终落在 single 还是 two_column，也不知道目标主题），为
 *   magazine 一个主题的 two_column 分支把它收紧到 42
 *   （`floor(424 / 20 * 2)`），会让其余 5 套主题的 single 变体（880/1096
 *   全宽）在完全不需要的地方多报 `bullet_item_long` 警告——用渲染期已验证
 *   兜底的安全，换一个只在极端主题×版式组合下才有意义的更紧软警告阈值，不
 *   划算。若未来要做主题感知的精确预算，应先把 `ir-quality.ts` 改造成按
 *   `(theme, arrangement)` 查表，而不是在这里硬调一个全局数字。
 * - 内容区最窄高度（含 footnote 时收窄）：academic 此前的
 *   `contentH = slide.footnote ? 380 : 400` → 380px 已随 Task 2 换骨废弃
 *   （改为编号导轨式：`SvgContent` 矩形 `y = 标题末行 + 36`、`h = 640 - y`，
 *   标题与徽章行垂直居中在固定枢轴 `BADGE_CENTER_Y` 上）。**Fix wave 1
 *   （2026-07-06，见 templates/academic.test.tsx 同批断言）**：编号徽章
 *   `BADGE_Y` 从 64 下移到 96（避让 BrandChrome 左上 logo 带 x 64-160 /
 *   y 48-88），`BADGE_CENTER_Y = BADGE_Y + BADGE_H/2` 随之从 80 变为
 *   112——最坏场景仍是 2 行标题、`minPt = 24`：
 *   `lineHeight = round(24 * 1.08) = 26`，`headingFudge = round(24 * 0.32)
 *   = 8`，`titleLastY = 112 + (2-1)*26/2 + 8 = 133`（原 101），
 *   `h = 640 - (133 + 36) = 471px`（原 503px）——仍远高于 380px，不再贡献
 *   这一基准的结论不变。consulting 同样已随 Task 1 换骨改为横幅
 *   行数驱动的 384～428px（见上）。**380px 基准现仅由 creative 提供**
 *   （该主题未随本轮换骨改动，仍是 `contentH` 公式最窄的贡献者），下面依赖
 *   此基准的常量（`maxBlocksPerSlide`/`bullets.maxItems`）不受影响。
 * - two_column 单列宽 `(rect.w - COLUMN_GAP) / 2`，`COLUMN_GAP = 32`
 *   （`layout.ts`），代入最窄 rect.w=1096 → `(1096 - 32) / 2 = 532px`。
 * - `BLOCK_GAP = 16`（`layout.ts`，`stackFrom` 块间距）。
 *
 * **Task 5 副题句复核（2026-07-07）**：六套主题的 content 页新增消费
 * `slide.subheading`——有副题句时 contentH 再减一个「slot」（22px 行高 +
 * 与标题间距，见各 `templates/*.tsx` 的 `SUBHEADING_SLOT`
 * /`SUBHEADING_SLOT_STACKED`）。按 emerald 教训「最坏推导方向＝按最大字号算」
 * （一个标题恰好换行到 2 行、而不是靠 minPt 兜底截断时，用的是未收缩的声明
 * 字号——此时 `lineHeight` 最大，对内容区的挤占也最狠，不是直觉上的"字越小
 * 行越挤"）逐主题复核 titleLastY→内容区推导（用 `fitHeadingLines` 实测二分
 * 找出"恰好 2 行仍是满字号"的最长文本验证过每个数字，而非手算假设）：
 *   - consulting：`bannerH` 是 1/2 行的固定字面量（88/132px），不随字号
 *     变化，无最大字号歧义。2 行横幅 + 副题句最坏：
 *     `h = 620 - (72+132+32+38) = 346px`。
 *   - academic：`headingFudge`/`lineHeight` 都随 `heading.fontSize` 走，
 *     最大字号（40pt，而非下面 fix-wave 注释沿用的 `minPt=24`）下 2 行：
 *     `lineHeight=round(40*1.08)=43`，`headingFudge=round(40*0.32)=13`，
 *     `titleLastY=112+43/2+13=146.5`。+ 副题句：
 *     `h=640-(146.5+36+45)=412.5px`。
 *   - creative（降级堆叠分支）：2 行标题最大字号 50pt（非 minPt 26）
 *     下 `lineHeight=54`。+ footnote + 副题句最坏：
 *     `h=max(120,420-54-46)=320px`。
 *   - magazine：2 行标题最大字号 60pt 下 `lineHeight=65`。+ 副题句：
 *     `h=640-(190+65+40+68)=277px`——六主题中最紧。
 *   - custom 白底态：2 行标题最大字号 46pt 下 `lineHeight=50`。+ footnote +
 *     副题句最坏：`h=max(120,420-50-46)=324px`。
 *   - custom 背景图态：2 行标题最大字号 44pt 下 `lineHeight=48`。+ 副题句：
 *     `h=max(120,400-48-46)=306px`。
 *   - tech：不走本文件的线性堆叠预算模型（见上，网格布局靠真实渲染
 *     零溢出验证，不是公式推导）。2 行标题最大字号 44pt 下 `lineHeight=48`。
 *     + 副题句：`h=640-(150+48+36+46)=360px`——仅供参考，不影响下面任何
 *     常量。
 *
 * **S3b 复核（2026-07-07）**：波次 B 统一了六主题的副题句基线公式
 * （`subheadingY = titleLastY + 22 + 14 + round(0.12*titleFontSize)`，见
 * 各 `templates/*.tsx` 自己的 S3b 注释），随基线偏移增量同步调整了对应
 * slot（34px → 各主题新值，见上）——上面每条推导已按新 slot 重算，`h` 全部
 * 比 Task 5 落地时的数字更紧（因为 slot 变大，挤占内容区的量也变大）。
 * consulting 是唯一的基线不变来源不同的例外：它的副题句锚定横幅底边
 * （无字形 descent），S3b 把 `bannerBottom+20` 改为 `+24`（flat +4，非
 * 公式推导），slot 同步从 34 到 38。
 *
 * **S3b 二次修正（同日，真机复核发现）**：creative（降级分支）与
 * magazine 的副题句都用 `fonts.heading`（衬线字体）而非其余四套主题
 * 用的 `fonts.body`（无衬线）——"0.12×字号" 的字形底近似是按 body 衬线字体
 * 校准的，衬线字体的真实字形 descent 远超这个假设（真机 getBBox 实测：
 * magazine 的 SimSun 系字体 descent 比例 ≈0.34×字号，creative
 * 的 Georgia/Songti SC 回退栈 ≈0.22×字号），首轮按通用公式套出的
 * magazine +44、creative +42 在真机两行标题场景下副题句仍贴字形
 * （实测间隙 0-5px，远低于 14px 目标，即用户两次截图复现的 bug）。已按
 * 真实测量重新校准：magazine → +64（slot 34→68），creative
 * 降级分支 → +50（slot 34→46，`SUBHEADING_SLOT_STACKED`，与该主题海报分支
 * 自己不变的 `SUBHEADING_SLOT`=34 分离，因为海报分支基线本轮不动，且海报
 * 分支的 +46 早先已用真机验证过）。上面「按最大字号」的两条推导已按二次
 * 修正后的 slot（46/68）重算。
 *
 * **复核顺带发现的既有偏差（非 Task 5/S3b 引入，如实记录，不在本次改动范围内
 * 回填）**：本文件此前称「380px 基准现仅由 creative 提供」，但按上面
 * 同一套「最大字号」方向重算（而非该分支自己隐含的 minPt 假设）显示：
 * creative 降级分支不带副题句时的真实最坏值是 366px（非 380px），且
 * magazine 不带副题句时已是 345px——比 380px 更紧，此前从未被计入
 * 「最窄矩形」候选。换言之「380px」这个历史基准本身已不准，Task 5 复核
 * titleLastY→内容区推导时顺带发现，留给专门复核本文件的后续任务处理（下面
 * 按新真实最坏值 277px 重算的下游常量结论不受这处历史偏差是否回填影响）。
 *
 * **按新真实最坏值（277px，magazine + 副题句，S3b 二次修正——原
 * Task 5 数字是 311px，S3b 首轮误算为 297px）复核下游常量**：
 *   - `maxBlocksPerSlide`：`floor(277/80)=3`（原按 380 算得 4，与 Task 5 时
 *     的 311px 结论相同，仍是 3）
 *   - `bullets.maxItems`：`floor(277/64)=4`（原按 380 算得 5，与 Task 5 时
 *     的 311px 结论相同，仍是 4）
 *   - `citation.maxSources`：`floor(277/28)=9`（原按 380 算得 13，S3b 首轮
 *     误算按 297px 得 10，二次修正后再收紧 1 到 9）
 * 三者理论上都会收紧，但本任务不在这次改动里下调这三个常量，理由：
 *   1. 它们是 IR 层的软预算/lint 提示，真正的渲染期安全网是
 *      `layoutContentFit` 的间距收紧+丢块兜底、以及 `fitSvgLine`/
 *      `layoutSvgText` 的动态缩字号/截断，取值宽松不会导致真实溢出——
 *      `citation.tsx` 是例外，见下。
 *   2. 本任务的零溢出真机门与 svg 全量 vitest 套件已跑过，正是本文件
 *      一贯依赖的"用真实渲染验证、不依赖表内经验值"方法论（参见上面
 *      magazine/consulting 两轮复核的同一结论句式）。
 *   3. 下调是一次跨主题、跨场景的 `ir-quality.ts` lint 阈值变更，影响面覆盖
 *      所有主题的所有内容页（不止带副题句的），应作为独立评审的任务，不
 *      适合作为模板几何任务的隐性副作用捎带下调。
 * `citation.maxSources` 例外说明：`citation.tsx` 逐条按整块计量
 * （`sources.length * ROW`），不像 `bullets`/`paragraph` 那样有单块内动态
 * 换行/截断兜底——13 条源在 277px 预算下会被 `layoutContentFit` 判定整块
 * 不 fit，触发丢块保护（不会溢出，但可能比预期更早丢内容，见 `layout.ts`
 * 的 `layoutContentFit` 丢块分支）。如实记录，是否收紧留给后续任务判断。
 * **后续任务已接手（carried-items 波，2026-07-24）**：三者中的 `citation`
 * 一支已按这里推导的 9（277px 基准）重命名为 `warnSources` 并真正接入
 * `ir-quality.ts`（`citation_overflow` warn），见该字段自己的新推导注释。
 * `maxBlocksPerSlide`/`bullets.maxItems` 仍不在本次改动范围内，维持上面
 * 第 3 点理由（跨主题跨场景的独立评审范畴）不变。
 *
 * **S3c 标点权重复核**：`svg-text-layout.ts` 的 `measureTextUnits` 把
 * U+2014（em dash）与 U+2018 到 U+201F（引号子区段）从「其他」0.46 权重
 * 改判为 CJK 满宽 1.0（这两个子区段此前不在 `WIDE_CHAR_RE` 里，其余「CJK
 * 标点区段」——U+3000 到 U+303F、U+FF00 到 U+FFEF——其实早已覆盖，权重本就是
 * 1.0，未受本次改动影响，见该文件 `WIDE_CHAR_RE` 自己的注释）。逐条复核本表
 * 是否有推导依赖旧的 0.46：
 *   - `headingMaxChars`（48）：走 `heading-fit.ts` 自己的 `visualUnits`
 *     （CJK 权重 1.2），与 `measureTextUnits` 是两套独立权重表（见上方推导
 *     注释原文），不受影响。
 *   - `bullets.maxUnitsPerItem`（53）：推导假设「纯 CJK 场景」（权重 1.0
 *     早已是满权重，不是 0.46 那档），不受影响。
 *   - `kpi.valueMaxChars`（9）/`kpi.labelMaxUnits`（15）：分别走数字权重
 *     0.56 与原始 units（未除以任何权重），都不是 0.46 那档，不受影响。
 *   - `iconCards.titleMaxUnits`（18）/`textMaxUnits`（44）、
 *     `steps.titleMaxUnits`（7）/`textMaxUnits`（30）、
 *     `verdictBanner.textMaxUnits`（175）：推导用的是「代表性权重」
 *     （纯 CJK 1.0、数字/字母 0.56、混排折中 0.64），同样都不是 0.46 那档，
 *     算术上不需要重推。但这五个值建模的现实文本（断言短句/说明句/结论句）
 *     一旦真的夹带 em dash 或引号，运行时 `measureTextUnits` 现在会比这里
 *     假设的代表性权重多算一些——不影响安全性，因为这五个值本就是「未接入
 *     `ir-quality.ts` 校验的软预算」（见各自推导注释），真正兜底渲染安全的
 *     是 `iconCards.tsx`/`steps.tsx`/`verdict-banner.tsx` 各自调用
 *     `fitSvgLine`/`layoutSvgText`/`truncateEmphasisSegments` 时用的
 *     运行时权重（本就已经是修正后的新值），不是本表的经验估算。
 *   - 结论：本表五个既有 units 数字都不需要因本次改动重新推导；已用
 *     `pnpm exec vitest run src/modules/knowledge/chat/generated-file`
 *     （909 用例 / 85 文件，含本文件覆盖的 `iconCards`/`steps`/
 *     `verdictBanner` 各自 block 测试）与零溢出双门验证过修正后的估算器
 *     不引入新的渲染期溢出。
 * - **ops-kb 联动缺口（如实记录，本任务未跨仓修复）**：
 *   `ops-kb/src/ops_kb/services/tools/pptx_create/content_lint.py` 的
 *   `measure_text_units` 逐字符镜像了旧版 `WIDE_CHAR_RE`（其自身注释明确
 *   写着「mirrors frontend measureTextUnits char-for-char」），本次改动后
 *   该 Python 镜像仍按旧权重把 em dash/引号计成 0.46——即含这两类字符的
 *   文本，ops-kb 的 `lint_ir`/`lint_ir_warnings`（`_BULLETS_MAX_UNITS_
 *   PER_ITEM`/`_KPI_LABEL_MAX_UNITS`/`_ICON_CARDS_*`/`_STEPS_*`/
 *   `_VERDICT_BANNER_TEXT_MAX_UNITS` 各处调用点）会比前端实际渲染宽松
 *   （低估真实宽度）。方向上是「偏松」而非「偏紧拒绝合法内容」，且前端自身
 *   的动态 fit 链仍是渲染安全的最终兜底，不构成安全回归，但两侧数值已经
 *   出现漂移，需要后续任务把这两个字符区段同步进 Python 侧的
 *   `_WIDE_CHAR_RE`。
 *
 * **S3e 标点权重复核（`heading-fit.ts` 自己的独立权重表）**：`heading-
 * fit.ts` 的 `visualUnits`（`fitHeadingPt` 用）同样把 U+2014/U+2018 到
 * U+201F 从「其他」0.56 权重改判为 CJK 满宽 1.2（该文件 `CJK_WIDE` 自己的
 * 注释）——与上面 S3c 复核的 `measureTextUnits` 是完全独立的两套权重表
 * （权重值本身也不同：1.2 vs 1.0，见本表下方 `headingMaxChars` 自己的推导
 * 注释），互不影响。复核 `headingMaxChars`（48）：其推导已经假设「全 CJK」
 * 场景（即每个字符都已经是 1.2 满权重），本次改动只是把此前被误判为「其他」
 * 0.56 档的两个标点子区段挪进 1.2 档，不改变 1.2 这个值本身，故推导公式
 * `floor(58.71 / 1.2) = 48` 不受影响，无需重算。另外，`fitHeadingPt`/
 * `visualUnits` 目前不被任何 `templates/*.tsx` 消费（六套模板的标题渲染
 * 全部走 `fitHeadingLines`→`layoutSvgText`→`measureTextUnits`，S3c 已修），
 * 只被本文件的 `headingMaxChars` 推导注释与 `heading-fit.test.ts` 直接测试
 * 消费——本次改动因此不改变任何模板的实际换行/缩字号渲染结果（已用
 * `pnpm vitest run src/modules/knowledge/chat/generated-file` 全量验证零
 * 回归），纯粹是权重表自身的一致性修正。
 */
export const CAPACITY = {
  /**
   * `fitHeadingPt`（heading-fit.ts）地板 `minPt = 28`、最窄可用宽
   * 1096px ≈ 11.4167in（96px=1in）、预算 2 行：
   *   maxVisualUnits = 72 * 11.4167in * 2行 / 28pt ≈ 58.71
   * `ir-quality.ts` 的 `charLen()` 按 `.length` 计数（不区分中英文宽度），
   * 用 heading-fit.ts 自身的 CJK 权重 1.2 单位/字（`visualUnits`，与
   * svg-text-layout.ts 的 `measureTextUnits` 不同，那个 CJK 权重是 1.0）
   * 换算最保守（全 CJK 标题）场景下的字数上限：
   *   headingMaxChars = floor(58.71 / 1.2) = floor(48.93) = 48
   */
  headingMaxChars: 48,
  /**
   * bullets 几何硬截断上界（借鉴波任务 2，2026-07-21）。区别于
   * `PACING_BUDGETS[pacing].bullets.maxUnitsPerItem`（30/40/48，编辑性「精简
   * 到 2 行内」建议值，本任务不动）——这是与 pacing 无关的物理硬界：过线真的
   * 会被渲染器截断（省略号丢字），不是「显得啰嗦」。
   *
   * 起因：借鉴波事实报告 Q3 节边界扫描证明，旧的「任意 finding 都硬阻断」
   * 设计下，validateIr 在 44 CJK 字处拒绝生成，而 6 组 主题×排布 组合下真实
   * 渲染首次截断都在 156 字——约 3.5 倍差距，且该差距是结构性的（不分
   * CJK/Latin），源头是编辑性预算从未对齐 `bullets.tsx` 真正的渲染安全网。
   *
   * `bullets.tsx` 的安全网是两个与 pacing 无关的定值：`MIN_FONT = 14`（收缩
   * 地板）与 `maxLines: 2`（`layoutItems` 传给 `layoutSvgText` 的换行上限）。
   * 起始字号由 pacing 决定（`bodyBaselinePx` 20/24/32），但一旦某条要点把
   * 同组件内共享字号压到地板，容量就只由「地板字号 + 可用宽度」决定，与起始
   * 字号无关——这正是任务简报「2 行 × 24→14 收缩 × 实测盒宽」公式的来源。
   *
   * 实测盒宽（本文件既有「内容区最窄矩形」基准的复用，非新测）：
   * `content-narrow-column.tsx`（magazine 主题窄栏版式）`COLUMN_W = 880`，
   * 是本文件已确认的全局最窄单栏内容区（见文件头「magazine 窄栏复核」）。
   * two_column 对半分（`layout.ts` `COLUMN_GAP = 32`）：
   *   twoColumnW = (880 - 32) / 2 = 424px
   * （1/3 宽的 `aside` 侧栏更窄，但该 arrangement 的 schema 注释明确写着侧栏
   * 留给 callout/quote/kpi「大号观点」，不是 bullets 的常规去处——按下面
   * 「已知缺口」记录，不并入最坏宽度，否则会把上界拖到比 pacing 编辑预算
   * 还紧，违背「error 应严格宽于每档 warn」的设计目标。）
   *
   * `bullets.tsx` `TEXT_INDENT = 26`（"default" 样式项目符号圆点的左缩进，
   * 是三种缩进约定里最窄的一档——"numbered"/"checklist" 不占用额外
   * maxWidth，只在文本本身吃掉 1-2 个前缀 unit，量级相近但更难封闭推导，
   * 取 "default" 已是更保守的一侧）：
   *   maxWidth = 424 - 26 = 398px
   *   capacity = floor(2 行 * 398 / MIN_FONT(14)) = floor(56.86) = 56 units
   *
   * 实测复核（非纯公式外推）：`installNodePlatform()` +
   * `renderSlideSvg()` 对 magazine 主题、`layout: "narrow-column"`、
   * `arrangement: "two_column"`（两个真实 bullets 组件，避免 <2 块退化单栏
   * 的陷阱）、"default" 样式，逐字符扫描 CJK 长度：56 字零 `data-truncated`，
   * 57 字首次出现——与上面 floor(56.86)=56 的推导一致（在 1 unit 内）。
   *
   * 安全余量（简报明确要求「留安全余量」）：套用当时全仓唯一的既有渲染安全
   * 折扣先例（`code.tsx` 的 `MONO_WIDTH_SAFETY`，同一种「给估算器打折」
   * 思路，不另造新系数）取值 0.9：
   *   itemOverflowUnits = floor(56 * 0.9) = floor(50.4) = 50
   *
   * 与三档 pacing 的 `bullet_item_long` warn 阈值（30/40/48）比较：50 严格
   * 大于全部三档，包括最紧的 dense（48）——dual-threshold 的「error 恒宽于
   * warn」在最紧档也成立，只是余量最小（2 units），符合 dense pacing 本身
   * 就是「更贴边」这一档位语义。
   *
   * **借用值澄清（borrow-wave Task 3，2026-07-21，修复轮更新）**：`code.tsx`
   * 的 `MONO_WIDTH_SAFETY` 经过两轮变动。首轮（同日稍早）用真机 Consolas
   * 数据重新校准为 0.82（原 0.9 的校准对象是 Menlo，非真身导出字体）。
   * 修复轮（审校发现首轮的「比例加权估算 × 安全系数」方案对深缩进代码行
   * 有结构性失效——8/16/24/32 空格缩进的真实偏差 +44.69%~+52.97%，远超
   * 0.82 系数留出的 ~22% 余量，见 code.tsx 自身推导注释与
   * task-3-review.md Important-2）换成精确模型：`resolveLayout` 直接按
   * Consolas 实测的逐字符统一前进宽度（0.5498em/字，见 svg-text-layout.ts
   * `measureMonoTextUnits` 推导注释）计算，不再有比例估算误差需要安全系数
   * 去覆盖，`MONO_WIDTH_SAFETY` 因此改为 1.0（不留系数——本任务的替身字体
   * 变异量测数据不支持任何非零残余量，见 code.tsx 该常量自己的推导注释）。
   * 上面这条 bullets 容量推导借用的始终只是「0.9 这个具体数字」作为一次性
   * 安全折扣，不是对 `MONO_WIDTH_SAFETY` 常量的引用——CJK bullets 容量与
   * mono 字体度量是两件不相关的事，只是曾经共用过同一个圆整系数。
   * `itemOverflowUnits = 50` 这个结论本身不随 `MONO_WIDTH_SAFETY` 任何一轮
   * 改变而改变，此处不随之重算，如实记录来源以免误读为仍在引用 `code.tsx`
   * 的当前值（该常量现在已不再是「打折系数」语义，借用关系至此彻底脱钩）。
   *
   * **Truncation-visibility 修复轮复核（2026-07-22，上面这处已知缺口已修）**：
   * 缺口根因是 `bullets.tsx` 把前缀（"1. "/"☐ "）和条目正文拼成同一个字符串
   * 再喂给 `layoutSvgText`——前缀里那一个空格会把 `svg-text-layout.ts`
   * `tokenize()` 从逐字符分词误判成空格分词（纯 CJK 正文没有其他空格，拼接
   * 后整段只切出「前缀」「一整块正文」两个"词"），贪心换行随即把整行预算
   * 耗在 1-2 字符的前缀上，浪费掉一整行——真实截断边界因此腰斩到约
   * plain/default/divided 家族（约 57-61）的一半：numbered 约 30-31 units，
   * checklist 约 23-24 units（探针测法同下）。
   *
   * 修复选在组合层（composition seam，`bullets.tsx` 自己），不动共享的
   * `tokenize()`：前缀不再进入 wrap/truncate 数学，只用条目正文本身走
   * `layoutSvgText`（纯 CJK 正文因此照常落回逐字符分词），预留出前缀宽度后
   * 单独拼回首行渲染——`bullets.tsx` 是全仓唯一在 `layoutSvgText` 调用前
   * 拼接「短、带空格字面量前缀 + 任意（可能无空格的 CJK）调用方内容」的
   * 组件，改这里不影响 heading/paragraph/kpi/citation/icon-cards/steps/
   * verdict-banner 共享的同一套 wrap 引擎。
   *
   * 同一测法（`installNodePlatform()` + `renderSlideSvg()`，magazine 主题、
   * `layout: "narrow-column"`、`arrangement: "two_column"`）复测五种样式，
   * 逐字符扫描 CJK 长度（数字为「零 `data-truncated` 的最长字数 / 首次出现
   * 的字数」）：
   *   - plain: 60 / 61（不变）
   *   - default: 56 / 57（不变，与上面 floor(56.86)=56 的公式推导一致）
   *   - divided: 60 / 61（不变）
   *   - numbered: 56 / 57（原 30 / 31）
   *   - checklist: 58 / 59（原 23 / 24）
   *
   * numbered/checklist 的真实边界从「约为 plain 家族的一半」收敛到「贴着
   * plain 家族」——差距即前缀自身的预留宽度（1-2 units 量级：numbered
   * "1. " ≈1.37 units、checklist "☐ " ≈0.81 units，乘以 MIN_FONT=14 后
   * 换算成 px 从 `maxWidth` 里扣掉），不再是结构性缺口。**结论：五种样式的
   * 边界现在全部 ≥56，严格高于 `itemOverflowUnits=50`——本常量对全部 5 种
   * bullets 样式现在都是滴水不漏的硬界**，`ir-quality.ts` 的
   * `bullet_item_overflow` 硬校验错误（本就对全部样式统一套用同一个
   * `measureTextUnits(item)` 上界，从未按样式分支）现在真正兑现了它的承诺：
   * 只要某条要点没触发这条 error，它就不会在渲染时被截断，不分样式——
   * README.md/README.zh-CN.md/skills/pptfast/SKILL.md 已同步删除
   * numbered/checklist「可能在 validate 报错前先被截断，靠 `pptfast audit`
   * 兜底」的例外措辞。`bullets.tsx` 对全部样式无条件都会设置的
   * `data-truncated="1"`（真正超出新边界的条目照常触发）作为渲染期兜底信号
   * 保留，未受这次改动影响——具体机制见该文件 `layoutItems` 自己的推导
   * 注释。
   */
  bullets: {
    itemOverflowUnits: 50,
    /**
     * bullets 条目**数量**的 error 级二级升级阈值（P0 hardening, robustness
     * deep-review D1，warn 二级升级——borrow 波 Task 2 同款 dual-threshold
     * 架构，此前只覆盖单条要点的字符长度即上面 `itemOverflowUnits`，本条
     * 补上"条目数"这一维）。与 `itemOverflowUnits` 同款设计：**与 pacing
     * 无关的扁平物理/合理性硬界**，不是 `PACING_BUDGETS[pacing].bullets
     * .maxItems`（4/5/6，编辑性「建议拆页」warn 预算，本任务不动）的倍数
     * ——过线意味着"优雅截断"这个描述已经不诚实，该拒绝而不是悄悄丢弃几乎
     * 全部内容，且这条判断不应该因为 pacing 档位不同而摇摆。
     *
     * 起因（本任务 render 侧修复之后）：`bullets.tsx`/`comparison.tsx` 等
     * 现在会把渲染项数钳制到 `box.h` 能容纳的范围并画 `data-dropped` 标记
     * （同一任务），所以极端条目数不再让渲染器崩溃或撞上 pptxgenjs
     * `getSmartParseNumber()` 陷阱（见 `chart-svg.tsx`
     * `MAX_CHART_GEOMETRY_PX` 同源问题）。但这只解决了"不崩"，没解决
     * "该不该"——20000 项要点里 render 层最多能落地几十项，其余全部变成
     * 一行「+19970 more」，这已经不是"截断"，是"几乎丢光"。该在 validate
     * 阶段就诚实拒绝，而不是悄悄生成一份 99%+ 内容缺失的文件。
     *
     * 阈值推导（两头夹逼，而非单侧外推）：
     *   下界——D 报告压测场景本身（`bigArrayBullets`，500 项，`scratchpad
     *   dr/gen-deck.mts` `buildPathologicalDeck`）被明确要求保持"优雅落地"
     *   （render 侧截断 + `data-dropped`，validate 不拦），阈值必须严格
     *   高于 500，并留出安全余量，不能让"一个作者手滑多写了几百条"这种
     *   仍然可辨认是真实内容的输入被拒收。
     *
     *   上界——`bullets.tsx` `MIN_FONT=14` 收缩地板下单行项最小占位
     *   `lineHeight(20) + ITEM_GAP(8) = 28px`，即便把整块 720px 画布
     *   （`CANVAS_H_PX`，`constants.ts`，无标题无页边距——比任何真实内容区
     *   都宽松）全部让给 bullets，物理上也只能显示
     *   `floor(720/28) = 25` 项左右。1000 项是这个"慷慨到不现实"的物理
     *   显示上限的 40 倍——任何越过这条线的输入，无论 pacing 档位如何，
     *   都已经不是"排版偏挤"，而是"99%+ 的内容注定悄悄消失"。
     *
     *   取 1000：500（D 报告下界，必须放行）到 1000 有 2× 安全余量；1000
     *   到 20000（D 报告另一压测场景，`big-bullets.mts` n=20000，必须拒收）
     *   有 20× 安全余量——两头都留了充足空间，不是卡在某个测试用例的边缘。
     */
    countOverflowItems: 1000,
  },
  kpi: {
    /**
     * `kpi_focus` 变体单行铺满最窄 rect.w=1096（`layout.ts` kpi_focus 分支
     * 用 `rect.w` 整体传给 stackFrom），4 卡沿用既有约定（Task 3 压力
     * fixture `kpi_focus 1 页 4 卡`，`audit/stress-fixtures.ts`）：
     *   cardW = (1096 - GAP(16) * (4-1)) / 4 = 1048 / 4 = 262px
     */
    maxItems: 4,
    /**
     * value 字号 40（`kpi.tsx`），左侧留 20px 内边距（`x = cardX + 20`），
     * 右侧对称预留 20px（给可能的 unit tspan/卡片边距）：
     *   可用宽 = 262 - 40 = 222px
     *   maxUnits = 222 / 40 = 5.55
     * 数字权重 0.56/字（`measureTextUnits` 的 digit 权重）：
     *   valueMaxChars = floor(5.55 / 0.56) = floor(9.91) = 9
     */
    valueMaxChars: 9,
    /**
     * label 字号 16（`kpi.tsx`），仅左侧留 20px（`x = cardX + 20`，label 无
     * 尾随 tspan，不需对称右侧预留）：
     *   可用宽 = 262 - 20 = 242px
     *   labelMaxUnits = floor(242 / 16) = floor(15.125) = 15
     */
    labelMaxUnits: 15,
  },
  /**
   * `citation.tsx` 每条源单行堆叠，行高 `ROW = 28`，无额外间距，且不参与
   * 换行修复（后续修复仅缩字+截断，行数不变）。
   *
   * **carried-items 波（2026-07-24）改口径**：本字段原名 `maxSources`，
   * 值 13（`floor(minRectH(380)/28)`，旧 380px 基准），仅供文档参考，从未
   * 接入 `ir-quality.ts`——本文件当时的 S3b 复核已指出新真实最坏值
   * （277px）会把这个数收紧到 `floor(277/28)=9`，但"本次改动不下调"，把
   * 接线留给后续任务（见文件头「按新真实最坏值复核下游常量」一节）。本波
   * 就是那个后续任务：P0 hardening 给 `citation.tsx` 加了 render-time
   * box.h 截断+`data-dropped`标记（同 bullets.tsx 家族），但截断前从没有
   * 编辑性预警——弱模型看不到警告就先丢内容。现在把这个字段真正接入
   * `ir-quality.ts`（`citation_overflow` warn），改用当时已推导但未采用的
   * 277px 基准，重命名为 `warnSources` 以反映"现在是活跃阈值而非文档参考
   * 值"这一语义变化：
   *   warnSources = floor(277 / 28) - 0 = 9（`citation.tsx`
   *   自身的截断公式 `naturalHeight(=count*28) > truncBudget` 在
   *   count=9 时 252<=277 不截断，count=10 时 280>277 才开始截断——9 正是
   *   最坏情况下"一条不丢"的最大条数，即真实渲染容量本身）
   *
   * `errorSources`（新增，error 级，两头夹逼——同
   * `CAPACITY.bullets.countOverflowItems` 的括号法，非同一组数字，各自
   * 独立核对）：
   *   下界——carried-items 波新立的"必须优雅落地"夹具（300 条，与
   *   `comparison.errorRows` 的同名夹具同一量级，family 内部一致，见该
   *   夹具本身）必须放行，errorSources 需严格大于 300。
   *   上界——把整块 720px 画布（`CANVAS_H_PX`，无标题无页边距）全部让给
   *   citation 这一个"慷慨到不现实"的物理显示上限：
   *     floor(720 / 28) = 25 条
   *   （与 bullets 物理上限恰好相同——两者共享同一个 28px/条的几何量级，
   *   非巧合）。取 1000（`errorSources`），与 `CAPACITY.bullets
   *   .countOverflowItems` 同值且推导比例几乎相同：1000/25=40×物理上限，
   *   与 `CAPACITY.bullets.countOverflowItems`'s own 1000/25=40× 逐位对齐
   *   ——citation 与 bullets 共享同一个 28px 行高基准，这不是巧合而是同一
   *   何几何量级的直接结果。1000 相对 300 下界留 3.3× 余量，相对 20000
   *   （新立的"明显病态、必须拒收"夹具，量级同 D 报告 bullets 20000 例）
   *   留 20× 余量，两头都留了充足空间。
   *
   * 物理上限说明：该值曾是文档参考值（`maxSources`，从未拦截任何输入）
   * ——citation 块通常与标题/其他块共页，实际可用高度更小，由
   * `maxBlocksPerSlide` 与「一页一观点」设计原则另行约束，`warnSources`
   * 现在是真正接入 `ir-quality.ts` 的活跃编辑性预警阈值，不再只是参考。
   */
  citation: { warnSources: 9, errorSources: 1000 },
  /**
   * `comparison.tsx`（carried-items 波新增字段，P0 hardening 已给
   * `comparison.tsx` 加了 render-time box.h 截断+`data-dropped`标记，同
   * bullets/citation/architecture 家族，但截断前从没有编辑性预警）。每行
   * 固定 `ROW = 44` px（含表头行），不随内容/字号变化——列内文字自身会
   * 缩字号/截断，但行高本身是硬常量。
   *
   * `warnRows`（warn 级，几何渲染容量推导，同 citation.warnSources 的口径
   * ——两者共享同一个"最坏内容区高度 277px"基准，见文件头「按新真实最坏值
   * 复核下游常量」S3b 二次修正结论）：`comparison.tsx` 自身的截断公式是
   * `naturalHeight(=(rows+1)*44，+1 为表头行) > truncBudget` 时才截断，
   * 故"一行不丢"的最大数据行数：
   *   rows <= 277/44 - 1 = 6.2955 - 1 = 5.2955 → floor → 5
   * 实测代入：5 行时 naturalHeight=(5+1)*44=264<=277 不截断，6 行时
   * (6+1)*44=308>277 触发截断（表头行独占的名额已经在 -1 里扣掉，不需要
   * 再额外减）。
   *   warnRows = 5
   *
   * `errorRows`（error 级，两头夹逼，同 `CAPACITY.bullets
   * .countOverflowItems` 的括号法）：
   *   下界——`depth-axis-hardening.test.ts` 既有的"500-item bullets +
   *   300-row comparison: graceful landing"夹具（P0 hardening 本身的
   *   D1 复现场景）已经把 300 行 comparison 钉成"必须优雅落地，
   *   generatePptx 必须成功"——errorRows 必须严格大于 300，且不能把这个
   *   已发布的保证测崩。
   *   上界——把整块 720px 画布（`CANVAS_H_PX`，无标题无页边距）全部让给
   *   comparison 这一个"慷慨到不现实"的物理显示上限：
   *     floor(720 / 44) = 16 行
   *   取 1000（`errorRows`），换算成物理上限的倍数：1000/16≈62.5×，比
   *   bullets/citation 自己的 40× 倍数更宽松（更保守，不会误拒合法但夸张
   *   的输入）。1000 相对 300 下界留 3.3× 余量，相对 20000（新立的"明显
   *   病态、必须拒收"夹具，量级同 D 报告 bullets 20000 例）留 20× 余量，
   *   两头都留了充足空间。
   */
  comparison: { warnRows: 5, errorRows: 1000 },
  /**
   * `architecture.tsx`（carried-items 波新增字段，同 comparison/citation
   * 的补漏理由）。每层固定 `LAYER_H + GAP = 72 + 12 = 84` px（末层不含尾随
   * GAP），行高同样是硬常量，不随内容缩放。
   *
   * `warnLayers`（warn 级，几何渲染容量推导，同一个 277px 最坏内容区高度
   * 基准）：`architecture.tsx` 自身的截断公式是
   * `naturalHeight(=count*84-12) > truncBudget` 时才截断，故"一层不丢"的
   * 最大层数：
   *   count*84 - 12 <= 277 → count <= 289/84 = 3.4405 → floor → 3
   * 实测代入：3 层时 naturalHeight=3*84-12=240<=277 不截断，4 层时
   * 4*84-12=324>277 触发截断。
   *   warnLayers = 3
   *
   * `errorLayers`（error 级，两头夹逼，同上，但下界/上界都按 architecture
   * 自己的更粗几何量级重新取值，不沿用 comparison/citation 的 300/1000
   * ——84px/层比 28-44px/项粗得多，物理上限本身就小得多，沿用同一对数字
   * 会显得脱离本组件自己的几何现实）：
   *   下界——carried-items 波新立的"必须优雅落地"夹具取 150 层（比
   *   comparison/citation 的 300 缩小一半，仍然是"一张图纸荒谬多的系统
   *   层"，但与 architecture 自己粗得多的 84px/层几何更匹配）。
   *   上界——把整块 720px 画布（`CANVAS_H_PX`，无标题无页边距）全部让给
   *   architecture 这一个"慷慨到不现实"的物理显示上限：
   *     floor(720 / 84) = 8 层
   *   取 500（`errorLayers`），换算成物理上限的倍数：500/8=62.5×（与
   *   comparison 的 62.5× 倍数一致，同一套"留足够但不过量余量"的尺度）。
   *   500 相对 150 下界留 3.3× 余量（与 comparison/citation 的 3.3× 一
   *   致），相对 20000（新立的"明显病态、必须拒收"夹具，量级同 D 报告
   *   bullets 20000 例）留 40× 余量，比 comparison/citation 的 20× 更宽
   *   松（architecture 的下界本身更小，上界维持同一个 20000 病态参照，
   *   自然留出更大余量，不是额外加码）。
   */
  architecture: { warnLayers: 3, errorLayers: 500 },
  /**
   * `blocks/icon-cards.tsx`（Task 2，2026-07-07）。items 等宽横排，
   * `cardW = (w - GAP(16) * (n-1)) / n`——n 越大卡越窄，最坏情况是 schema
   * 允许的上限 `n=4`：取全宽内容区最窄场景 `w=1088`（同本文件其余行的
   * "内容区最窄矩形" 基准）：
   *   cardW = (1088 - 16*3) / 4 = 1040 / 4 = 260px
   * `title`/`text` 的 `maxWidth` 都是 `卡宽 - PAD_X(24)*2 = 260 - 48 = 212px`
   * （`icon-cards.tsx` `PAD_X`）。
   *
   * title（`fitSvgLine`，字号 20，minFontSize 14）：先按未收缩字号折算
   * "原始 units"（1 unit ≈ 1 个 fontSize 宽字符）：
   *   rawUnits = 212 / 20 = 10.6
   * 断言短句常是中英文混排的紧凑短语（而非纯 CJK 陈述句），比照
   * `kpi.tsx`/本文件 `kpi.valueMaxChars` 对数字/字母内容的权重换算方式
   * （`measureTextUnits` 的小写字母/数字权重 0.56/字），把 rawUnits 换算成
   * "等效字符数"：
   *   titleMaxUnits = floor(rawUnits / 0.56) = floor(18.93) = 18
   *
   * text（`layoutSvgText`，字号 15，2 行，行高 21）：同样先取原始 units：
   *   rawUnits = (212 / 15) * 2行 = 28.27
   * "说明" 是较长的自然语言短句，中英文混排比例通常比 title 更偏 CJK，
   * 取纯 CJK 权重（1.0，`measureTextUnits` WIDE_CHAR）与纯数字/字母权重
   * （0.56）之间的折中权重 0.64（两者的粗略中点，偏向 CJK 一侧）：
   *   textMaxUnits = floor(rawUnits / 0.64) = floor(44.17) = 44
   *
   * 这两个「units 上限」都是软预算（当前未接入 `ir-quality.ts` 校验，
   * 仅供后续内容 lint / 后端 pptx_create 参考）——`icon-cards.tsx` 自身的
   * `fitSvgLine`/`layoutSvgText` 已经用动态缩字号/截断兜底渲染期不溢出，
   * 这里的数字不是渲染安全的硬约束。
   */
  iconCards: { maxItems: 4, titleMaxUnits: 18, textMaxUnits: 44 },
  /**
   * `blocks/steps.tsx`（Task 3，2026-07-07）。横排模式 items 等宽卡片，卡间留
   * `GAP(40)` 作箭头走廊——`cardW = (w - 40*(n-1)) / n`，n 越大卡越窄，最坏
   * 情况是 schema 允许的上限 `n=5`：取全宽内容区最窄场景 `w=1088`（同本文件
   * 其余行的"内容区最窄矩形"基准）：
   *   cardW = (1088 - 40*4) / 5 = 928 / 5 = 185.6px
   * `title`/`text` 的 `maxWidth` 都是 `卡宽 - PAD_X(24)*2 = 185.6 - 48 = 137.6px`
   * （`steps.tsx` `PAD_X`，与 `icon-cards.tsx` 同值）。低于 `MIN_CARD_W(180)`
   * 时切换纵排——`n=5` 恰好卡在临界点（`5*180+4*40=1060`，仅当 `w<=1060`
   * 才会纵排），本行按横排最坏场景估算，纵排走全宽文本列不受这里的窄卡宽
   * 约束（详见 `steps.tsx` `TEXT_X_VERTICAL`）。
   *
   * title（`fitSvgLine`，字号 18，minFontSize 13）：先按未收缩字号折算
   * "原始 units"：
   *   rawUnits = 137.6 / 18 = 7.64
   * 步骤标题是极短的中文动宾短语（如"注册账号""发布上线"），比 icon_cards
   * 的"断言短句"更纯粹是 CJK（不倾向夹杂数字/字母），取纯 CJK 权重
   * （1.0，`measureTextUnits` WIDE_CHAR）：
   *   titleMaxUnits = floor(rawUnits / 1.0) = floor(7.64) = 7
   *
   * text（`layoutSvgText`，字号 14，2 行，行高 20）：同样先取原始 units：
   *   rawUnits = (137.6 / 14) * 2行 = 19.66
   * "说明"同 icon_cards 的判断——较长的自然语言短句，中英文混排比例通常比
   * title 更偏 CJK，取同一折中权重 0.64：
   *   textMaxUnits = floor(rawUnits / 0.64) = floor(30.71) = 30
   *
   * 同 iconCards 行——这两个「units 上限」都是软预算（当前未接入
   * `ir-quality.ts` 校验，仅供后续内容 lint / 后端 pptx_create 参考）——
   * `steps.tsx` 自身的 `fitSvgLine`/`layoutSvgText` 已经用动态缩字号/截断/
   * 纵排降级兜底渲染期不溢出，这里的数字不是渲染安全的硬约束。
   */
  steps: { maxItems: 5, titleMaxUnits: 7, textMaxUnits: 30 },
  /**
   * `blocks/verdict-banner.tsx`（Task 4，2026-07-07）。页级结论条，恒定全宽
   * 渲染——不像 icon_cards/steps 那样按 items 数切分等宽卡（这里没有 items
   * 数组，只有一条 `text`），直接取本文件"内容区最窄矩形"基准 `w=1088` 作为
   * 推导输入（brief 明确要求按全宽推导；IR 理论上仍可能被塞进 two_column
   * 半宽列，但那是渲染期由 `layoutSvgText`/`truncateEmphasisSegments` 兜底的
   * 安全问题，不是这里要建模的软预算——同 iconCards/steps 行的既有原则）。
   *
   * 文本区宽度按"最坏情况"（带 icon）推导——`verdict-banner.tsx` 的
   * `PAD_X(24)`/`ICON_SIZE(20)`/`GAP_ICON_TEXT(12)`：
   *   textW = 1088 - (PAD_X + ICON_SIZE + GAP_ICON_TEXT) - PAD_X
   *         = 1088 - 56 - 24 = 1008px
   * （无 icon 时文本左移到 `PAD_X=24` 起，`textW=1040px`，更宽，不是约束项）。
   *
   * text（`layoutSvgText`，字号 18，2 行，行高 24）：先取原始 units：
   *   rawUnits = (1008 / 18) * 2行 = 112
   * 结论句是完整的自然语言陈述（如 ppt-master 示例"数学上严格保留目标分布 →
   * 答案分布完全不变，零质量损失"），机制上与 icon_cards/steps 的"说明"字段
   * 同属 `layoutSvgText` 2 行自然语言这一类（而非 `fitSvgLine` 单行短语），
   * 沿用同一折中权重 0.64（`measureTextUnits` 纯 CJK 权重 1.0 与纯数字/字母
   * 权重 0.56 之间，偏 CJK 一侧——见 iconCards/steps 行的同一推导）：
   *   textMaxUnits = floor(112 / 0.64) = floor(175) = 175
   *
   * 同 iconCards/steps 行——这是软预算（未接入 `ir-quality.ts` 校验）——
   * `verdict-banner.tsx` 自身用 `truncateEmphasisSegments` 在渲染期于固定
   * 18px 字号下逐行截断超宽内容，2 行高度上限（64/88px）由字面量常量保证，
   * 不依赖这里的字数估算兜底安全。
   */
  verdictBanner: { textMaxUnits: 175 },
} as const
