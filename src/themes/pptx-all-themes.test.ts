 
import { describe, it, expect } from "vitest";
import { THEME_STYLES } from "./index";

describe("theme registry v2", () => {
  it("has enterprise (ex-custom/gallery/avant), not retired ids", () => {
    expect(THEME_STYLES["enterprise"]).toBeTruthy();
    expect((THEME_STYLES as any)["stripe-purple"]).toBeUndefined();
    // 无 legacy id 兜底：这些旧 id 均非 canonical，不在 THEME_STYLES 里注册
    expect((THEME_STYLES as any)["custom"]).toBeUndefined();
    expect((THEME_STYLES as any)["gallery"]).toBeUndefined();
    expect((THEME_STYLES as any)["avant"]).toBeUndefined();
  });
  // 冷调组皮肤重设计（2026-08-20）：白墙从纯白压到 #F7F7F4（纯白让给
  // surface），accent 从 IKB 本色换回炸橘（设计板给了它「只给方块与强调线」
  // 的岗位，推翻 2026-07-10 的单色系裁决）。图表四色当时也跟着换成
  // IKB/炸橘/工业青/机灰，但第四轮评审把炸橘那一格换掉了（用户 p09/p10：
  // 「不要蓝配橙，超级丑」）——现在是 IKB/工业蓝/工业青/机灰，accent 的
  // 炸橘不动，只剩 motif 方块与强调线这一个岗位。逐条来历见
  // `themes/enterprise.ts` 的文件头。
  it("enterprise defaults to gallery-white bg + IKB primary + blast-orange accent + an all-cool chart palette", () => {
    expect(THEME_STYLES["enterprise"].colors.bg).toBe("#F7F7F4");
    expect(THEME_STYLES["enterprise"].colors.surface).toBe("#FFFFFF");
    expect(THEME_STYLES["enterprise"].colors.primary).toBe("#0032A0");
    expect(THEME_STYLES["enterprise"].colors.accent).toBe("#E85D1F");
    expect(THEME_STYLES["enterprise"].colors.chartPalette).toEqual(["#0032A0", "#2F6FBF", "#0E7C86", "#7A7F87"]);
    expect(THEME_STYLES["enterprise"].defaultBackgrounds.cover).toEqual({
      kind: "color",
      value: "#F7F7F4",
    });
  });
});
