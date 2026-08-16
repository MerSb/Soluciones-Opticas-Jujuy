// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Backend/tooling code (scripts/, prisma/) runs under Node, not a
    // browser — needed so process/console/URL etc. resolve under no-undef.
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Express middleware signatures are positional (e.g. an error
      // handler must take exactly 4 params to be recognized as one) —
      // leading-underscore names intentionally-unused params/vars.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/build/**", "**/.vercel/**", "**/node_modules/**"],
  },
);
