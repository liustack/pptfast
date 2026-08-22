import type { StyleTokens } from "./tokens";

/**
 * runway（时尚秀场）——2026-07-10 拆分后的新主题（初名 magazine，用户
 * 裁决时尚主题不叫 magazine；magazine 转为 legacy id 指向 journal，存量
 * 人文观感 deck 回放不再突变）。高对比时尚大片风：秀场米白 + 秀场黑报头 +
 * 绯红一滴，面向时尚品牌/潮流生活/品牌大片场景。
 * **零版式代码**：与 journal 共享 masthead 报头家族（报头体正是时尚杂志
 * 的语言，同版式不同 tokens 气质大变——luxe 借 creative 家族的同款先例），
 * corner-ornament 角饰是人文感，本主题不带 motif。
 * 报头字体保持衬线（SimSun 承载 CJK，Didot 类报头是时尚杂志国际惯例），
 * 正文无衬线。
 *
 * **编辑组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group5-editorial-boards.dc.html` 里 `section#g5` runway 的色板角色表
 * + 字级阶梯规范）**：runway 是定稿分配表里 decor=none 的唯一一家
 * （`structure-map.md` 会话 0 裁决 2：「runway 不补 motif，decor=none 成为
 * 正式的、可测试的身份值」，对应 `definitions.ts` 的两版 motif 均被用户
 * 裁撤）。所以本轮它**装饰侧零改动**，落地只有两件事：色板，和把「视觉
 * 事件全部由排印落差制造」这句话写成真实的字级阶梯。
 *
 * 色板逐条来历：
 *   - `bg` `#FFFFFF` → `#F2F0EB`：纯白 → 秀场米白。纯白是「没选颜色」，
 *     压不住黑白对比的硬度；米白一进来，黑才读成秀场黑而不是印刷黑。
 *   - `surface` `#FFFFFF` → `#FAF9F5`：look 卡白，跟着底色暖半档，卡片
 *     终于能靠色差而不只靠描边与纸底分开。
 *   - `primary` `#0A0A0A` → `#141414`：秀场黑。实测压 bg 16.18:1（板上
 *     自标 17:1），承白字 18.42:1——黑白即全部主张。
 *   - `accent` `#D80027` → `#B0483C`：口红正红 → 绯红一滴。旧值是广告红，
 *     一出现就抢掉整页；绯红是「一副手套的量」，只给页码与一个词。实测
 *     压 bg 4.80:1（板上自标 5.5:1，实测低 0.7 仍在 4.5:1 正文门槛的正确
 *     一侧），压满版 primary 封面底 3.37:1（封面上它只落在展示级大字上，
 *     大字门槛 3:1）。
 *   - `text` `#111417` → `#191919`：正文黑脱开偏蓝的色相，与秀场黑同族。
 *     实测 15.44:1。
 *   - `muted` `#626266` → `#646460`：石灰，同样脱开偏蓝。板上给的 hex 是
 *     `#6B6B66`，压 bg 只有 4.70:1，而板上自标 5:1——照「数字赢」压深到
 *     `#646460`（压 bg 5.22:1、压 surface 5.64:1）。硬理由同 journal：
 *     `#6B6B66` 压 `content-matrix` 最难的一档 tone 混合格底（accent 混
 *     16%，`#eeddd7`）只有 4.07:1，正文 4.5:1 门槛失守；压深之后三档实测
 *     4.52 / 4.80 / 5.07:1 全过。
 *   - `border` / `cardStroke` `#E8E8E8` → `#DCD9D0`：细栏线跟着米白底走。
 *   - `chartPalette` 换成板上的黑白为主四色：黑 / 绯红 / 石灰 / 亚麻。
 *     实测 16.18 / 4.80 / 3.05 / 1.60:1。末格板上自己就写明「仅底纹」，
 *     1.60:1 是声明过的意图，不是漏检。
 *
 * 板上自标与实测的差一律留板上 hex（本组纪律：只有掉到功能门槛**之下**
 * 才照数字改 hex，runway 没有这样的格子）：primary 16.18 vs 17、accent
 * 4.80 vs 5.5、muted 4.70 vs 5、石灰 3.05 vs 3.8（仍在 3.0 装饰线之上）。
 *
 * **字级阶梯（板上「代替 motif 图」的那张规范）——本轮未落地，附实测理由**：
 * 板上给的阶梯是展示 132 / 标题 44 / 正文 22 / 注脚 15，展示级对标题级恒
 * ≥3:1。落不下去的原因是这张阶梯整个是按「浅底封面」画的，而 runway 的封面
 * 至今是满版 primary 黑底（`cover-fashion-masthead.tsx`，2026-07-10 用户
 * 裁决「封面不能白底」把白底版升级成满版色块）。逐档实测：
 *   - **正文 22**：板上这一档在浅底上走 `muted`，搬进黑底构造就得走
 *     `readableOn(primary)` 的 0.72 淡出复合色。实测把该行从 30px 降到
 *     22px，会让复合色从「大字 3:1 门槛」掉进「正文 4.5:1 门槛」，
 *     classroom 3.79 / pulse 4.17 / ember 3.44 / vermilion
 *     4.14 五家组外主题当场新增违例（`fashion-masthead` 是全主题共享构造）。
 *     变异先跑后宣称：这一档一降就是五条新审计发现，不是零新增。
 *   - **展示 132**：该版式的字号常量是**上限**不是定值，真实渲染由
 *     `fitHeadingLines` 收缩决定——本仓库语料的中文标题实渲 84px。把上限
 *     从 150 改成 132 只会让它更小或不变，做不到板上写的「再放大一档」；
 *     真正的杠杆在共享的断行/收缩机器，远超一次主题换肤的边界。
 *   - **标题 44**：非封面页走全主题共享的通用版式，主题层今天没有字号
 *     token 可钉（`themes/tokens.ts` 的 `StyleShape` 只有 `radius`/
 *     `gapScale`），无处安放。
 * 三档一并记进编辑组报告的「板与版式差距清单」，等封面构造那一条裁定
 * （照 academic 上一轮同类情形的处理）。本轮 runway 的装饰侧与版式侧
 * **零改动**，只换色板——decor=none 由 `motif-selection.ts` 的守卫与
 * `new-themes.test.ts` 的断言钉住。
 */
export const RUNWAY_TOKENS: StyleTokens = {
  id: "runway",
  colors: {
    bg: "#F2F0EB", // 秀场米白
    surface: "#FAF9F5", // look 卡白
    primary: "#141414", // 秀场黑（16.18:1）——黑白即全部主张
    accent: "#B0483C", // 绯红一滴（4.80:1）——只给页码与一个词
    text: "#191919", // 正文黑（15.44:1）
    muted: "#646460", // 石灰（5.22:1）——照板上自标的 5:1 压深，见文件头
    border: "#DCD9D0", // 细栏线
    danger: "#A32017", // 绯红压深（7.18:1）
    warning: "#8F6A21", // 烟草金（4.69:1）
    success: "#4A6B3F", // 橄榄绿（5.75:1）
    cardStroke: "#DCD9D0", // 米白底浅卡靠描边区分
    chartPalette: ["#141414", "#B0483C", "#8A8A84", "#C4C0B4"], // 黑/绯红/石灰/亚麻（末格仅底纹）
  },
  fonts: {
    heading: ["SimSun", "宋体", "Georgia", "serif"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 0.95 }, // 时尚硬朗+密排（spec 提案）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F2F0EB" },
    chapter: { kind: "color", value: "#F2F0EB" },
    content: { kind: "color", value: "#F2F0EB" },
    ending: { kind: "color", value: "#F2F0EB" },
  },
};
