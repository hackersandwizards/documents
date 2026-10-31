import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", ".claude/**", ".githooks/**", "components/**", "specimen/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
  prettier,
);
