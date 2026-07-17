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
   * 内容页 blocks 上限。假设每块最小可读高度为「2 行体文字」（呼应下方
   * bullets 的 2 行预算）+ 块间距 `BLOCK_GAP = 16`：
   *   perBlock = 2 * LINE_HEIGHT(32) + BLOCK_GAP(16) = 80px
   *   maxBlocksPerSlide = floor(minRectH(380) / 80) = floor(4.75) = 4
   *
   * 这个推导假设的是「单列竖直堆叠」几何（每块占满宽度、纵向叠加），对 5 套
   * 线性堆叠主题（consulting/academic/creative/custom/
   * magazine）成立。
   *
   * **tech 主题差异（Task 4 拼盘扩容复核，2026-07-06）**：tech
   * 的 Content 页不走线性堆叠，而是 `layoutBento`（`bento-layout.ts`）把
   * blocks 摆成 3x2/3+2 网格（`BentoTechContent`，`templates/tech.tsx`），
   * 上面「每块 80px 竖直叠加」的推导对它不成立——网格允许多块并排。已用真实
   * 渲染 + `auditSvgMarkup` 零溢出核验（`templates/tech.test.tsx`）：
   * 5 个普通段落块（3+2 网格，非 kpi_cards 展开）与 6 个普通段落块/6 个短
   * bullets 块（3x2 网格）均零溢出通过、且真实渲染为 panel 卡片网格（非降级
   * 兜底）。超出网格容量（>6 units）或单卡内容超预算时
   * `BentoTechContent` 会整页降级为单栏堆叠（`cellOverBudget`/`degraded`
   * 门，同样有测试覆盖），所以 6 不是「盲目放宽」，而是有渲染期兜底的真实
   * 上限。因此 `maxBlocksPerSlideOverrides` 下面为 tech 单独把
   * `ir-quality.ts` 的密度检查阈值从 4 提到 6，其余主题不变。
   *
   * **注意（IR block ≠ bento unit）**：`explodeIntoUnits`
   * （`bento-layout.ts`）会把一个 `kpi_cards` block 炸开成 N 个 kpi-item
   * unit，所以 bento 的真实网格容量（6 units）和这里检查的 IR
   * `slide.blocks.length` 不是同一个量纲——只有在没有 kpi_cards 块（或
   * kpi_cards 恰好 1 项）时两者才 1:1。这里的 6 只覆盖「blocks.length ==
   * units.length」这一常见情况，kpi_cards 展开后 units 更多的场景本就不受
   * 这个 IR 层面的密度检查约束（它数的是 blocks，不是 units）。
   *
   * **后端联动**：本表文件头声明是前端 ir-quality 与后端 pptx_create 内容
   * lint（ops-kb）的共同数值来源——若 ops-kb 真的直接引用这个 4，需要同步
   * 补一条 tech 例外分支到 6，否则后端会对合法的 5~6 块 tech
   * 页面重复报警/拒绝（本次改动只落地了前端 `ir-quality.ts` 一侧）。
   *
   * **Task 5/S3b 副题句复核**：新最坏 minRectH（277px，magazine +
   * 副题句，S3b 二次修正——原 Task 5 数字是 311px）按同一公式会把这个 4 降到
   * 3（三轮结论相同）——本次改动不下调，理由见文件头顶部大注释「按新真实
   * 最坏值复核下游常量」一节。
   */
  maxBlocksPerSlide: 4,
  /**
   * 按主题覆盖 `maxBlocksPerSlide`（`ir-quality.ts` 的 `checkSlide` 查此表，
   * 查不到的主题回退到上面的 flat 4）。目前只有 tech 需要覆盖，见上方
   * 推导。
   */
  maxBlocksPerSlideOverrides: {
    "tech": 6,
  } as Record<string, number>,
  bullets: {
    /**
     * `bullets.tsx` 当前逐条单行堆叠（`LINE_HEIGHT = 32`，条目间无额外
     * 间距，pre-fix 状态）。预算假设每条最坏情况占 2 行——呼应后续换行
     * 修复（同计划 Task 7 `layoutSvgText maxLines: 2`）将带来的排版，而非
     * 当前单行渲染：
     *   perItem = 2 * LINE_HEIGHT(32) = 64px
     *   maxItems = floor(minRectH(380) / 64) = floor(5.94) = 5
     * 注：早期草案曾拍 ≤6（`.issues/plans/2026-07-05-pptx-two-stage-and-
     * render-hardening.md` §2.2「一页一观点」guess），6 条 × 64px = 384px
     * 已超出最窄高度 380px（含 footnote 场景），按最窄高度严格核算收窄到
     * 5——后端 A-2 lint 须采用本值而非旧草案数字。
     *
     * **Task 5/S3b 副题句复核**：新最坏 minRectH（277px，S3b 二次修正——原
     * Task 5 数字是 311px）会把这个 5 降到 `floor(277/64)=4`（三轮结论
     * 相同）——本次改动不下调，理由见文件头顶部大注释「按新真实最坏值复核
     * 下游常量」一节。
     */
    maxItems: 5,
    /**
     * 单列最窄宽 532px（two_column，见上）、字号 20、预算 2 行：
     *   maxUnits = floor(532 / 20 * 2) = floor(53.2) = 53
     * 用 `measureTextUnits`（svg-text-layout.ts，CJK 权重 = 1.0）计量，
     * 纯 CJK 场景下 ≈ 53 字等价。
     */
    maxUnitsPerItem: 53,
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
   * 换行修复（后续修复仅缩字+截断，行数不变）。按最窄内容区高度整段占满
   * 估算物理可放条数（该值是物理上限，不代表「设计建议」条数——citation
   * 块通常与标题/其他块共页，实际可用高度更小，由 `maxBlocksPerSlide` 与
   * 「一页一观点」设计原则另行约束）：
   *   maxSources = floor(minRectH(380) / 28) = floor(13.57) = 13
   *
   * **Task 5/S3b 副题句复核**：新最坏 minRectH（277px，S3b 二次修正——原
   * Task 5 数字是 311px）会把这个 13 降到 `floor(277/28)=9`（比 Task 5
   * 时的 11 又收紧了 2）——本次改动不下调，理由见文件头顶部大注释「按新
   * 真实最坏值复核下游常量」一节。这一个例外不只是「更保守而已」：
   * citation.tsx 整块计量、无块内截断兜底，13 条在 277px 预算下会被
   * `layoutContentFit` 判定整块不 fit 而触发丢块保护（不会溢出，但可能比
   * 预期更早丢内容）。
   */
  citation: { maxSources: 13 },
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
