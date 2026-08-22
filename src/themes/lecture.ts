import type { StyleTokens } from "./tokens";

/**
 * lecture（黑板夜校）——2026-08-21 新增第 22 个 theme id（第 21 个结构身份）。
 * 性格：灯灭之后的大学黑板，粉笔只划一道
 * 重点。目标场景：大学/成人课程、技术分享、内训。与 classroom（小学生
 * 白日讲义纸）分昼夜，与 academic（祖母绿压暖象牙纸的书卷）分底色。
 *
 * 全仓唯一绿底。深底第七色温：insight 暖黑终端 `#0F1216` / tech 蓝黑
 * `#0A0F1E` / luxe 真黑 `#0B0908` / arena 紫黑 `#120B22` / museum 棕黑
 * `#211A12` / stage 青灰黑 `#141C22` 之后，lecture 墨绿板面 `#1C2823`
 * （RGB 28,40,35，H 155.0，L 0.133）。缩略图里是那块绿，不是又一块死黑。
 * 与最近六家深底的 CIE76 ΔE（本仓库实测）：stage 9.85 / museum 11.01 /
 * insight 12.29 / luxe 14.16 / tech 18.07 / arena 23.58。最近的是 stage，
 * 色相差 51°（绿板 vs 青灰黑），大色块一眼可辨。
 *
 * 黄粉笔与两家金分家（设计板点名写进注释）：
 *   - lecture `#E9C46A` H 42.5 / L 0.665 / S 0.743。板上的亮黄粉，只划重点。
 *   - luxe `#C6A15B` H 39.3 / L 0.567 / S 0.484。请柬浅香槟。色相近（ΔH
 *     3.2°），明度低一档、饱和低一截。ΔE 15.2。lecture 是粉笔，luxe 是烫金。
 *   - museum `#BE7A28` H 32.8 / L 0.451 / S 0.652。展签铜牌，更橙更暗。
 *     ΔH 9.7°，ΔL 0.21，ΔE 29.5。
 *
 * 逐条来历（设计源 `theme-wave7/Lecture.dc.html`，surface / chart / 语义
 * 三色自推，本仓库 `svg/ink.ts` 的 `contrastRatio` 压 `bg #1C2823` 实测）：
 *   - `bg` `#1C2823`：墨绿板面。
 *   - `surface` `#26342E`：板面同族抬升一档。深底不出白卡。
 *   - `primary` `#2E4038`：深色块，让黄粉笔唱主角。白字压 primary 11.01:1。
 *   - `accent` `#E9C46A`：黄粉笔（9.13:1），可直接承大标题。
 *   - `text` `#EFF3EC`：粉笔白（13.58:1）。
 *   - `muted` `#A9BCAF`：退淡的粉笔灰（7.62:1，压 surface 6.51:1）。
 *   - `border` `#35443C`：粉笔槽。motif 细框取这个角色。
 *   - `chartPalette` 四色：粉笔白 / 黄粉笔 / 灰蓝 / 陶土。灰蓝 `#8A9EAA`
 *     饱和 0.158，不进 vivid-blue 带（195-260 且 S≥0.35）。陶土 `#C47A68`
 *     H 11.7，落在红段，不进蓝配橙禁忌带。四格压 bg 13.58 / 9.13 / 5.48 /
 *     4.60，全过 3.0 装饰线。两两 ΔE 33-61。
 *
 * 语义三色压 `surface` 校准（kpi 箭头是字，callout 的 warning 是线与图标）：
 *   - `danger` `#E08070`：粉笔珊瑚（4.64:1）。
 *   - `warning` `#E9C46A`：黄粉笔本色（7.79:1），只作线与图标。
 *   - `success` `#7AAB7E`：粉笔鼠尾草（4.93:1），不是 arena 电光绿。
 *
 * 字体：heading SimSun 族（journal / heritage / luxe / museum 先例），
 * Windows 安全面打头保导出无 tofu。body 仍是雅黑。圆角 0 + gapScale 0.9
 * （tight 档，arena 同值）。
 *
 * 装饰见 `../svg/motifs/motif-lecture-motif.tsx`（26px 内缩 1px 粉笔槽细框。
 * light 档，单锚。板上标题下的黄粉笔弧不进 motif，见该文件头）。
 *
 * 四轴：L / top-band / light / tight。最近邻 enterprise（L / top / medium /
 * tight），岔装饰轴。封面倾向 banner-title / tone-adaptive-header。
 *
 * 可拉伸性：黄粉笔即参数（夜校品牌分享可换成品牌色，仍避开香槟金 / 铜金）。
 * 细框几何不动，不升级成双线，不加印章。
 */
export const LECTURE_TOKENS: StyleTokens = {
  id: "lecture",
  colors: {
    bg: "#1C2823", // 墨绿板面——H 155，全仓唯一绿底
    surface: "#26342E", // 板面同族抬升
    primary: "#2E4038", // 深色块（让 accent 唱主角，白字 11.01:1）
    accent: "#E9C46A", // 黄粉笔（9.13:1）——比 luxe 香槟金更亮更饱和
    text: "#EFF3EC", // 粉笔白（13.58:1）
    muted: "#A9BCAF", // 退淡粉笔灰（7.62:1）
    border: "#35443C", // 粉笔槽
    danger: "#E08070", // 粉笔珊瑚（压 surface 4.64:1）
    warning: "#E9C46A", // 黄粉笔本色（7.79:1），只作线与图标
    success: "#7AAB7E", // 粉笔鼠尾草（4.93:1）
    chartPalette: ["#EFF3EC", "#E9C46A", "#8A9EAA", "#C47A68"], // 粉笔白/黄粉笔/灰蓝/陶土
  },
  fonts: {
    // 板书衬线：SimSun/宋体 是 SAFE_FONTS 里的 CJK 衬线，放首位保导出。
    // Songti SC/STSong 留作 macOS 预览回退（journal/heritage/luxe/museum 同款）。
    heading: ["SimSun", "宋体", "Songti SC", "STSong", "serif"],
    body: ["Microsoft YaHei", "Helvetica Neue", "Arial", "system-ui"],
  },
  shape: { radius: 0, gapScale: 0.9 }, // 黑板直角 + tight 留白（arena 同档）
  defaultBackgrounds: {
    cover: { kind: "color", value: "#1C2823" },
    chapter: { kind: "color", value: "#1C2823" },
    content: { kind: "color", value: "#1C2823" },
    ending: { kind: "color", value: "#1C2823" },
  },
};
