import { CLASSROOM_TOKENS } from "./classroom";
import type { StyleTokens } from "./tokens";

/** bloom 自己的色板——preset 与 classroom 的**全部**差异就是这五行加下面
 * 那三枚语义色。 */
const BG = "#F5EDEA"; // 樱粉纸
const SURFACE = "#FCF8F6"; // 樱粉纸白
const PRIMARY = "#92535E"; // 干玫瑰（压 bg 5.02:1，白字 5.80:1）
const ACCENT = "#6E8B74"; // 苔绿——批改笔换绿（3.24:1）
const BORDER = "#DCC9C4"; // 横线簿格线的粉调

/**
 * bloom（柔美庆典）——2026-07-13 memphis 拆分主题 B（用户拍板：命名 bloom
 * + 紫粉杏方向，参考「素雅水彩风婚庆策划」类模板）。面向婚庆策划/庆典邀约/
 * 花艺母婴美妆等柔美生活方式品牌。
 *
 * **柔和组皮肤重设计（2026-08-20，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html` 的
 * `section#g4`）：bloom 从此是 classroom 的色板 preset，全仓首例。**
 *
 * 「preset」在这里是字面意思，不是修辞：本对象直接 spread
 * {@link CLASSROOM_TOKENS}，只覆盖 `id`、五个色值、三枚语义色（`danger`/
 * `warning`/`success`，第四轮评审后各主题自填）、以及由那五个色值推导出来
 * 的 `defaultBackgrounds`。字体、圆角/间距、`text`/`muted`/`chartPalette`
 * 全部继承——不是「抄成一样」，是同一份值。结构行早就已经是共用同一个对象了
 * （`definitions.ts` 的 `CLASSROOM_STRUCTURE`，theme-structure-allocation
 * wave 会话 0 裁决 3：两家四轴判成同一格，那就是同一个结构身份，差别只在
 * 色板），这一轮把 motif 与其余 token 也并过去，两家从此真的只差色板。
 *
 * 随之退役的东西，如实记在这里而不是让 git blame 去挖：
 *   - 旧色板（暖奶白 `#F6F1EA` / 紫藤 `#6F6190` / 杏粉 `#D89A8E` / 深紫灰
 *     `#4A4258` / `#746A83` / `#E8E0D8` / 水彩四色）整套换掉。
 *   - **宋体衬线标题退役**：旧值 `["SimSun", "宋体", "Georgia", "serif"]`
 *     是婚庆报题气质（journal 先例）。preset 继承 classroom 的雅黑之后，
 *     bloom 离开 `definitions.test.ts` 的 `nonExactHeadingBuiltins`
 *     ——雅黑有逐字精确宽表（`hasExactWidthTable`），标题排版从估算改为
 *     实测，是纯改善（vermilion 在 gov-theme 波做过同一次移动，先例在
 *     `new-themes.test.ts`）。
 *   - `shape.radius` 6 → 12（继承 classroom 的最圆润档）。
 *   - 专属 `bloom-motif`（Tyler Hobbs 水彩晕染算法 + 植物细线）**整个文件
 *     删除**：设计板 classroom 那格写着「现状斑块水彩退役」，而 motif 锚点
 *     一旦指向 `classroom-motif`，全仓再没有第二家借用它（借用网只有
 *     classroom/bloom 互为候选，`motif-selection.ts` 的 `MOTIF_CANDIDATES`
 *     已查）。留一个没人渲的注册项不是保守，是死代码。
 *
 * **红线不变：bloom 这个 theme id 永不删除**（既有 deck 里写着它）。
 * 「20 个 theme id、19 个结构身份」的口径也不变，只是现在连 motif 和字体
 * 也一并镜像了。
 *
 * 对比度实测（`svg/ink.ts` 的 `contrastRatio`，压 `bg` `#F5EDEA`）：
 * primary 5.02:1、accent 3.24:1、text 12.86:1、muted 5.21:1（压 surface
 * 5.70:1）、chart 雾蓝 4.83 / 陶土 3.44 / 鼠尾草 3.16 / 砂黄 3.28。
 * chapter 底取 primary，白字压 primary 5.80:1。三枚语义色压 `surface`：
 * danger 7.73:1、warning 4.47:1、success 5.09:1。
 *
 * **一处偏离设计板 hex（板上数字赢）**：板上 primary 写的是 `#9E5A66`，
 * 自标 5:1，实测压 bg 只有 **4.43:1**——跌破正文 4.5:1 门槛（primary 在
 * 多个封面构造里就是引首行那一号小字），落在 group2 给 terra/ember 修
 * primary 时的同一个坑里。按同色相压暗到 `#92535E`，实测 5.02:1，正是板上
 * 自己写的那个数。其余四色（bg/surface/accent/border）与板一字不差。
 * classroom 那边的砂黄偏离见 `./classroom.ts` 的文件头，本主题继承那一格。
 */
export const BLOOM_TOKENS: StyleTokens = {
  ...CLASSROOM_TOKENS,
  id: "bloom",
  colors: {
    ...CLASSROOM_TOKENS.colors,
    bg: BG,
    surface: SURFACE,
    primary: PRIMARY,
    accent: ACCENT,
    border: BORDER,
    danger: "#8C2E3E", // 深芍药红（压 surface 7.73:1）
    warning: "#A3652C", // 金盏花（4.47:1）——花园语系的警戒色
    success: "#4E7355", // 叶绿（5.09:1），苔绿 accent 压深一档
  },
  // 结构与 classroom 逐字段相同（cover/content/ending 取 bg，chapter 取
  // primary），值是 bloom 自己的——preset 的可见半边。
  defaultBackgrounds: {
    cover: { kind: "color", value: BG },
    chapter: { kind: "color", value: PRIMARY },
    content: { kind: "color", value: BG },
    ending: { kind: "color", value: BG },
  },
};
