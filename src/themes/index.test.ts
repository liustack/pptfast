import { describe, it, expect } from "vitest";
import { resolveStyle, CANONICAL_THEME_IDS } from "./index";

describe("resolveStyle", () => {
  it("返回 6 套主题的完整 token 包", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const theme = resolveStyle(id);
      expect(theme.colors.primary).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      expect(theme.fonts.heading.length).toBeGreaterThan(0);
      expect(theme.defaultBackgrounds.cover).toBeDefined();
      expect(theme.defaultBackgrounds.chapter).toBeDefined();
      expect(theme.defaultBackgrounds.content).toBeDefined();
      expect(theme.defaultBackgrounds.ending).toBeDefined();
    }
  });

  it("tokens 覆盖 primary 但保留灰阶", () => {
    const original = resolveStyle("tech");
    const overridden = resolveStyle("tech", { colors: { primary: "#FF0000" } });
    expect(overridden.colors.primary).toBe("#FF0000");
    expect(overridden.colors.muted).toBe(original.colors.muted);
  });

  // 2026-08-19 深底组皮肤重设计：insight 从「深底红金」换成「暖黑终端底 +
  // 终端琥珀」。primary 不再是抢眼的正红，而是让位给 accent 的墨蓝色块底
  // （设计稿的角色定义，见 themes/insight.ts 的改动来历）。
  it("insight 主题用 #16202B 墨蓝色块底和 #F0A63C 终端琥珀", () => {
    const t = resolveStyle("insight");
    expect(t.colors.primary).toBe("#16202B");
    expect(t.colors.accent).toBe("#F0A63C");
  });

  it("未知 id 回落到 consulting 的 token 包", () => {
    expect(resolveStyle("nonexistent-theme")).toEqual(resolveStyle("consulting"));
  });
});
