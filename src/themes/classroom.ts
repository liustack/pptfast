import type { StyleTokens } from "./tokens";

/**
 * classroom（教学课堂）——2026-07-13 第 13 主题（用户参考三张莫兰迪教学
 * 模板拍板新增教育培训类）。莫兰迪灰调（雾蓝/藕粉/灰绿薄荷/奶咖）+
 * 米白纸调底，柔润亲和的课堂课件气质，面向教学课件/课堂授课/培训机构/
 * K12 儿童教育。与 academic（深绿严肃学术研究/答辩）场景切分：classroom
 * 主打「亲和的教与学」，academic 主打「严谨的学术」。
 * 色域盘点：莫兰迪灰调（低饱和加灰色系）此前完全空缺。
 * **零版式代码**：借 academic 的 rail 编号家族（左轨圆徽章与参考图的
 * 圆形编号徽章语言天然契合）+ 共享 cover/two-column，气质由专属
 * classroom-motif（平滑有机斑块+手绘点线装饰，与 bloom 的水彩纹理
 * 刻意区分——参考图斑块是平滑的）+ tokens 承载。
 * 对比度：雾蓝 #7A98A6 横幅白字仅 ~2.9:1——content 禁配 banner-heading
 * （luxe 先例），rail-numbered 徽章数字白字在雾蓝上是小元素大字重可读。
 * chartPalette 即莫兰迪装饰四色（motif 零 hex 纪律）。
 */
export const CLASSROOM_TOKENS: StyleTokens = {
  id: "classroom",
  colors: {
    bg: "#F4F1EB", // 米白纸调
    surface: "#FFFFFF",
    primary: "#6E8E9E", // 雾蓝（标题/徽章）
    accent: "#D89A88", // 藕粉珊瑚
    text: "#48545C", // 灰蓝黑
    muted: "#98A2A6",
    border: "#E2DDD4",
    chartPalette: ["#7A98A6", "#D89A88", "#AEBCA4", "#C9B49C"], // 雾蓝/藕粉/灰绿薄荷/奶咖=莫兰迪装饰四色
  },
  fonts: {
    heading: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
    body: ["Microsoft YaHei", "PingFang SC", "Helvetica Neue", "system-ui"],
  },
  shape: { radius: 12, gapScale: 1.1 }, // 全主题最圆润档（课堂亲和）+呼吸感
  defaultBackgrounds: {
    cover: { kind: "color", value: "#F4F1EB" },
    // chapter 走 primary 雾蓝底（rail-chapter 标题是白字，academic 同款
    // per-type 深底约定——米白底会白字不可见）
    chapter: { kind: "color", value: "#6E8E9E" },
    content: { kind: "color", value: "#F4F1EB" },
    ending: { kind: "color", value: "#F4F1EB" },
  },
};
