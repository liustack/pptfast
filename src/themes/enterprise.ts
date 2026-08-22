import type { StyleTokens } from "./tokens";

/**
 * enterprise（企业蓝）——原 custom→gallery→avant 的最终定名
 * （2026-07-10 用户四轮裁决收官：转企业风后 avant「先锋设计」名实不符，
 * 改 enterprise，场景词「企业介绍/产品方案/商务提案」）。以下沿革注释保留：
 * avant——原 custom→gallery 改造的形态（2026-07-10 用户视觉伴侣
 * 三轮裁决）：白墙 + 正宗国际克莱因蓝 IKB + 天蓝单色系辅助，企业风。
 * 演化链：custom（自定义，白底黑字）→ gallery（克莱因蓝 v1，冷白底
 * #F8F9FC + #1F3BC4，tone-adaptive 低色彩版式）→ avant（本形态）。
 * gallery v1 被否原因：①冷白底灰调显脏 ②撞色弱——根因是 tone-adaptive
 * 版式家族本身低色彩（巨号是浅灰水印、主题色少有上场机会），色值再艳也
 * 出不来。故 avant 同时换 tokens（白墙/正 IKB #002FA7）和
 * manifest 版式（IKB 斜切封面/IKB 巨号章节/IKB 横幅内容/IKB 大字结尾）。
 * 存量 custom/gallery deck 经 LEGACY_THEME_MAP 兜底到本主题。
 *
 * **冷调组皮肤重设计（2026-08-20，`.issues/2026-08-18-theme-redesign/skins/`
 * 的 `group3-cool-boards.dc.html` 里 enterprise 的色板角色表 + 封面样例）**：
 * enterprise 在冷调三家里拿到的语域是「IKB 白墙」——画廊白墙上的工业秩序，
 * 设计板当时把蓝橘对撞写成本家签名（**第四轮评审已推翻这半句，见下面
 * `accent` 与 `chartPalette` 两条：装饰、强调与图表面上不再出现暖色。留在
 * 表里的暖色只剩语义色 `warning` 的深琥珀，那是警示岗位，不参与配色语言**）。
 * 逐条来历：
 *   - `bg` `#FFFFFF` → `#F7F7F4`：纯白 → 画廊白墙（微暖不刺）。旧值让
 *     `surface` 无处可站——底与卡同为纯白，白卡全靠 `cardStroke` 一根发丝线
 *     才勉强分得开。压掉这一档之后纯白卡自己就是一张卡。
 *   - `surface` `#FFFFFF` 不动：Swiss 的干净，现在它终于在墙上浮起来了。
 *   - `primary` `#002FA7` → `#0032A0`：正 IKB 的另一个通用写法，实测压新底
 *     9.96:1（板上自标 10:1），横幅/色块直接承白字（白压 primary 10.69:1）。
 *   - `accent` `#002FA7` → `#E85D1F` →（第四轮评审）`#2F6FBF`：这一格改过
 *     两次。2026-07-10 否掉炸橘、点缀改用 IKB 本色，理由是「橘只在小元素出现
 *     无大色块，撞色名不副实」；2026-08-20 的设计板把炸橘收回来，给了它明确
 *     的岗位（只给方块与强调线，不承正文），蓝橘对撞由此写成本家签名，实测
 *     压 bg 3.25:1。**第四轮评审把这个签名整个否掉**：用户逐页看到 p09
 *     （banner-motif 的顶缘规矩线，橘色起手段与 IKB 主段首尾相接）与 p10
 *     （enterprise-motif 的右上 IKB 方块阶 + 左下一枚橘方块）之后写下
 *     「我不知道 claude design 为什么又把橙配蓝弄出来，这个真的太丑了，应该
 *     列为禁忌」「不要蓝配橙，超级丑」。谁是主谁是客没有悬念：本主题名字就叫
 *     企业蓝，primary 是正 IKB，橘是客，客走。
 *     改的是 token 本身而不是某一支装饰：`accent` 在 enterprise 的每一个落点
 *     都是「蓝旁边的橙」（p01 封面标题条压顶缘蓝线、p04/p06 的 kicker 方块与
 *     标题下强调线压右上蓝方块阶、p09 的橘色起手段、p03/p07/p08/p10 的左下
 *     橘方块），而其中 p09 那一支来自 banner-motif——journal 与 consulting
 *     共用的同一支装饰，改不得。治在 token 上，一刀全主题一致。
 *     取值 `#2F6FBF`（工业蓝）：同一冷语系里比 IKB 亮一大档（Lab L 26 → 47），
 *     退掉撞色又不退成单色泥。同一轮评审里另有一刀（单独一支分支）把
 *     `chartPalette` 第二格的炸橘也换成这一支工业蓝，两刀合上之后本主题只剩
 *     一条冷阶 IKB → 工业蓝 → 工业青 → 机灰。实测压 bg 4.72:1、压 surface
 *     5.06:1、压 panel 4.43:1（旧值分别是 3.25 / 3.49 / 3.05）。
 *     **副作用记在这里**：4.72:1 过了 `accessibleInk` 的 4.5:1 正文门槛，
 *     旧炸橘过不了。所以凡是把 accent 交给 `accessibleInk` 的小字（如
 *     `content-banner-heading` 的 Chapter kicker）从此真的印成 accent，
 *     而不再退回中性墨——上面那句「不承正文」的限制随这次换色一并解除。
 *     压 panel 的 4.43:1 仍差一点，落在 panel 上的小字继续退回中性墨。
 *   - `text` `#14161F` → `#17181A`：蓝调墨 → 硬黑（工业铭牌），16.55:1。
 *   - `muted` `#5F626C` → `#5C6066`：机械灰。实测压 bg 5.89:1、压 surface
 *     6.33:1、压 `content-matrix` 的三档 tone 混合格底 5.22/5.49/5.65:1，
 *     全部过 4.5:1 正文门槛。
 *   - `border` `#E8E8EC` → `#DEE0DB`：网格线，压灰底上要再深一档才看得见。
 *   - `chartPalette`：IKB / 工业蓝 / 工业青 / 机灰。实测压 bg
 *     9.96 / 4.72 / 4.61 / 3.75:1，四格全过 3.0 装饰线。旧表的天蓝→蓝灰
 *     渐次（`#5B8DEF`/`#8FA3C8`/`#C9D3E8`）是企业单色系时代的产物，最浅的
 *     一格压新底只有 1.36:1，随撞色回归一并退役。
 *     **第二格在第四轮评审里又换了一次**：设计板给的是炸橘 `#E85D1F`
 *     3.25:1，用户逐页看到之后否掉——p09「我不知道 claude design 为什么
 *     又把橙配蓝弄出来，这个真的太丑了，应该列为禁忌」、p10「不要蓝配橙，
 *     超级丑」。谁是主谁是客没有悬念：本主题名字就叫企业蓝，primary 是正
 *     IKB，橘是客。改成工业蓝 `#2F6FBF` 4.72:1——同一冷语系里比 IKB 亮
 *     一大档（Lab L 26 → 47），既退掉撞色又不退成单色泥。
 *     代价记在这里：四色全冷之后彼此的 ΔE 从炸橘时代的 82-127 掉到
 *     35-47，比暖冷对撞时低，但四格仍两两可辨，色盲模拟最近的一格
 *     ΔE 28.6（deuteranopia，对工业青）。
 *     **`accent` 仍是炸橘，本次未动**：那是方块与强调线的岗位，属于 motif
 *     与版式的作用面，不在「图表配色」这一刀的范围里。用户 p09/p10 看到的
 *     蓝橘其实来自 motif（右上 IKB 方块阶 + 左下一枚炸橘方块），要一并治
 *     得单独立一刀，见 `motif-enterprise-motif.tsx`。
 *   - `panel` / `cardStroke` 板上没给（板的角色表只列七格 + chart）。两者
 *     按它们与 `bg`/`border` 的旧关系平移进新的中性族，免得白墙上浮一张
 *     冷灰卡：`panel` 取 bg 与 border 之间的一档 `#F0F0EC`，`cardStroke`
 *     取 border 上浮半档 `#E4E6E1`（旧值 `#E4E4E9` 对 `#E8E8EC` 也是这个
 *     关系）。
 *   - `defaultBackgrounds` 四档跟着 `bg` 走（旧值四档同为纯白，同一条
 *     「四档＝bg」的关系原样保留）。
 *
 * 对比度实测（本仓库 `svg/audit/deck-audit.ts` 的 `contrastRatio`，压 `bg`
 * `#F7F7F4`）：primary 9.96:1、accent 4.72:1（第四轮评审换色前的炸橘是
 * 3.25:1）、text 16.55:1、muted 5.89:1
 * （压 surface 6.33:1）、chart IKB 9.96 / 工业蓝 4.72 / 工业青 4.61 / 机灰
 * 3.75。设计板自查写的 10 / 3.5 / 16 / 5.5 / 10·3.5·4.5·3.5 与实测同向，
 * 逐格以实测为准（chart 第二格已不是板上的炸橘，见上）。primary 压 bg 9.96:1 远超 3:1，`accessibleInk` 在本主题
 * 上是逐字节 no-op（深底组给 `cover-banner-title` 等四处加的那道自适应
 * 不会在这里改任何一个字节）。
 *
 * 装饰见 `src/svg/motifs/motif-enterprise-motif.tsx`（方块秩序 v3，第八波
 * 制度板对账）：封面只留右上阶 0.28，删左下孤立 accent 方块，chapter 浅底
 * 可画顶缘刻度尺。封面 / ending 的满版 IKB 由 pinOnly 版式自己铺
 * （`paintsOwnBackground`），本文件 `defaultBackgrounds.cover/ending` 仍走
 * 浅底，避免 `assertContrastFloor` 拿深字压深底判红。chapter / content 保持
 * 画廊白墙。
 */
export const ENTERPRISE_TOKENS: StyleTokens = {
  id: "enterprise",
  colors: {
    bg: "#F7F7F4", // 画廊白墙（微暖不刺）
    surface: "#FFFFFF", // 纯白卡，Swiss 的干净
    panel: "#F0F0EC", // 板上未给，按旧 panel↔bg 关系平移进新中性族（见文件头）
    primary: "#0032A0", // 正 IKB（9.96:1），横幅直接承白字
    accent: "#2F6FBF", // 工业蓝（4.72:1）——蓝配橙禁忌，炸橘退场，见文件头
    text: "#17181A", // 硬黑（16.55:1），工业铭牌
    muted: "#5C6066", // 机械灰（5.89:1）
    border: "#DEE0DB", // 网格线
    danger: "#C0231A", // 信号红（6.01:1）——瑞士工业的警示色
    warning: "#A85F00", // 深琥珀（4.88:1）——刻意压暗（原因是不与当时的炸橘 accent 混，
    // accent 换成工业蓝之后这条理由失效，但语义色本轮不动，hex 原样保留）
    success: "#0F7355", // 工业青绿（5.83:1），与 chart 的工业青同族
    cardStroke: "#E4E6E1", // 板上未给，按旧 cardStroke↔border 关系平移（见文件头）
    chartPalette: ["#0032A0", "#2F6FBF", "#0E7C86", "#7A7F87"], // IKB/工业蓝/工业青/机灰
  },
  fonts: {
    heading: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: {
    radius: 8, // 企业圆润（spec 提案）
    cover: { textAnchor: "start", bandY: 256, bandH: 220, bandMark: true },
  },
  defaultBackgrounds: {
    // 四档保持浅底。封面 / ending 的 IKB 满版由 ikb-field-cover /
    // signoff-ending 自己铺，不把 cover/ending 的 default 改成 primary。
    cover: { kind: "color", value: "#F7F7F4" },
    chapter: { kind: "color", value: "#F7F7F4" },
    content: { kind: "color", value: "#F7F7F4" },
    ending: { kind: "color", value: "#F7F7F4" },
  },
};
