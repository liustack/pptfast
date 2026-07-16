/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { THEME_TOKENS } from "./index";

describe("theme registry v2", () => {
  it("has enterprise (ex-custom/gallery/avant), not retired ids", () => {
    expect(THEME_TOKENS["enterprise"]).toBeTruthy();
    expect((THEME_TOKENS as any)["stripe-purple"]).toBeUndefined();
    // 2026-07-10 custom→gallery→avant：旧 id 均非 canonical（legacy map 兜底）
    expect((THEME_TOKENS as any)["custom"]).toBeUndefined();
    expect((THEME_TOKENS as any)["gallery"]).toBeUndefined();
    expect((THEME_TOKENS as any)["avant"]).toBeUndefined();
  });
  it("enterprise defaults to gallery-white bg + IKB primary/accent + blue-tint chart palette", () => {
    expect(THEME_TOKENS["enterprise"].colors.bg).toBe("#FFFFFF");
    expect(THEME_TOKENS["enterprise"].colors.primary).toBe("#002FA7");
    // 点缀=IKB 本色（企业单色系裁决），图表色阶天蓝/蓝灰
    expect(THEME_TOKENS["enterprise"].colors.accent).toBe("#002FA7");
    expect(THEME_TOKENS["enterprise"].colors.chartPalette).toEqual(["#002FA7", "#5B8DEF", "#8FA3C8", "#C9D3E8"]);
    expect(THEME_TOKENS["enterprise"].defaultBackgrounds.cover).toEqual({
      kind: "color",
      value: "#FFFFFF",
    });
  });
});
