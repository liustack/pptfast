 
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
  it("enterprise defaults to gallery-white bg + IKB primary/accent + blue-tint chart palette", () => {
    expect(THEME_STYLES["enterprise"].colors.bg).toBe("#FFFFFF");
    expect(THEME_STYLES["enterprise"].colors.primary).toBe("#002FA7");
    // 点缀=IKB 本色（企业单色系裁决），图表色阶天蓝/蓝灰
    expect(THEME_STYLES["enterprise"].colors.accent).toBe("#002FA7");
    expect(THEME_STYLES["enterprise"].colors.chartPalette).toEqual(["#002FA7", "#5B8DEF", "#8FA3C8", "#C9D3E8"]);
    expect(THEME_STYLES["enterprise"].defaultBackgrounds.cover).toEqual({
      kind: "color",
      value: "#FFFFFF",
    });
  });
});
