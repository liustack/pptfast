---
"@liustack/pptfast": minor
---

Brand extraction: `pptfast brand extract <file.thmx|.potx|.pptx> -o my-brand.theme.json` extracts brand colors and fonts from a user's own Office template into a pptfast theme file — entirely locally, the file never leaves the machine. The new `--theme-file <path>` flag loads such a file on `render`/`validate`/`audit`/`preview`/`serve`, and a deck project's `theme.json` auto-loads on every command with zero flags. Loading goes through `registerTheme`, so its contrast floor refuses an unreadable palette with the failing token, ratio, and background named; a custom theme can never shadow a builtin id. SDK: `extractBrandTheme`, `parseBrandThemeFile`, `registerBrandThemeFile`, `BrandThemeFileSchema` (all browser-safe).
