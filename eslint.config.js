import js from "@eslint/js"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain-JS scripts (unlike *.ts/*.mts) aren't type-aware, so ESLint's base
    // recommended config doesn't know about Node globals — declare the ones
    // scripts/docs-list.js actually uses instead of pulling in the `globals` package.
    files: ["scripts/**/*.js"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    // 迁移自 ops-web 的 svg/*.tsx 里带 react-refresh 的 eslint-disable 注释——
    // 该规则本身对纯库构建（无 HMR）没有实际意义，注册插件只是为了让 ESLint
    // 认得注释里引用的规则名，避免 "Definition for rule ... was not found"。
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": "off", // SSR-only 库无 HMR，规则不适用（插件仅为识别迁移注释中的规则名）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "prefer-const": "off"
    }
  }
)
