import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Strict, type-aware lint stack mirroring the homepage project, adapted from
// Next.js to this Vite + React 19 (React Compiler) + Tauri app:
//   - @eslint/js recommended
//   - typescript-eslint strict + stylistic, *type-checked* (needs type info)
//   - the full React Compiler ruleset (eslint-plugin-react-hooks v7) at error
//   - eslint-config-prettier last, so formatting is a formatter's job
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "target/**",
      "scripts/**",
      "coverage/**",
      // Separate sub-projects with their own tooling, not in this tsconfig.
      "site/**",
      "design-system/**",
      // Vendored skill scripts (their own repos / not in this tsconfig).
      ".claude/**",
      ".agents/**",
      "eslint.config.mjs",
      "vite.config.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsxA11y.flatConfigs.recommended,
  eslintConfigPrettier,
  {
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // React Compiler recommended baseline for this plugin version…
      ...reactHooks.configs["recommended-latest"].rules,

      // The one strict rule homepage turns off — more noise than signal here.
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Numbers in template literals are safe and idiomatic (`${count} items`).
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // A focusable `separator` is a valid window-splitter widget (WAI-ARIA APG).
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "separator"], allowExpressionValues: true },
      ],
      // Base UI's headless controls are the real (accessible) control inside a label.
      "jsx-a11y/label-has-associated-control": [
        "error",
        { controlComponents: ["Checkbox.Root"] },
      ],

      // Full React Compiler / hooks ruleset at error (parity with homepage,
      // mapped to eslint-plugin-react-hooks v7.1 rule names — e.g. the old
      // `automatic-effect-dependencies` is now `exhaustive-effect-dependencies`).
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/incompatible-library": "error",
      "react-hooks/unsupported-syntax": "error",
      "react-hooks/todo": "error",
      "react-hooks/syntax": "error",
      "react-hooks/hooks": "error",
      "react-hooks/capitalized-calls": "error",
      "react-hooks/rule-suppression": "error",
      "react-hooks/no-deriving-state-in-effects": "error",
      "react-hooks/void-use-memo": "error",
      "react-hooks/exhaustive-effect-dependencies": "error",
      "react-hooks/memoized-effect-dependencies": "error",
    },
  },
  {
    // Test files: vitest globals, and relax type-aware rules that fight common
    // testing patterns (non-null assertions, mocks typed as any).
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.vitest },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/unbound-method": "off",
      // Test doubles / DOM mocks are routinely empty no-ops.
      "@typescript-eslint/no-empty-function": "off",
      // Test setup polyfills APIs the DOM lib types claim always exist but
      // jsdom lacks (ResizeObserver, getAnimations, matchMedia) — the guards
      // are load-bearing at runtime even though TS thinks them redundant.
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
);
