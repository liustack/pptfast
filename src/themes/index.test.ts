import { describe, it, expect } from "vitest";
import { getTheme, CANONICAL_THEME_IDS } from "./index";
import { TECH_TOKENS } from "./tech";
import { JOURNAL_TOKENS } from "./journal";

describe("getTheme", () => {
  it("返回 6 套主题的完整 token 包", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const theme = getTheme(id);
      expect(theme.colors.primary).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      expect(theme.fonts.heading.length).toBeGreaterThan(0);
      expect(theme.defaultBackgrounds.cover).toBeDefined();
      expect(theme.defaultBackgrounds.chapter).toBeDefined();
      expect(theme.defaultBackgrounds.content).toBeDefined();
      expect(theme.defaultBackgrounds.ending).toBeDefined();
    }
  });

  it("override 覆盖 primary 但保留灰阶", () => {
    const original = getTheme("tech");
    const overridden = getTheme("tech", { primary: "#FF0000" });
    expect(overridden.colors.primary).toBe("#FF0000");
    expect(overridden.colors.muted).toBe(original.colors.muted);
  });

  it("Editorial Dark 主题用 #E63946 红和 #D4A57C 驼色", () => {
    const t = getTheme("creative");
    expect(t.colors.primary).toBe("#E63946");
    expect(t.colors.accent).toBe("#D4A57C");
  });

  // Retired ids: ikb-swiss and anthropic-clay had their tokens/templates hard
  // deleted in the theme redesign. getTheme still accepts them (compat for
  // stored decks) but resolves onto the new theme that replaced them.
  it("ikb-swiss（legacy id）解析为 tech 的 token 包", () => {
    expect(getTheme("ikb-swiss")).toEqual(TECH_TOKENS);
  });

  it("anthropic-clay（legacy id）解析为 journal（原 magazine 人文观感继承者）的 token 包", () => {
    expect(getTheme("anthropic-clay")).toEqual(JOURNAL_TOKENS);
  });
});
