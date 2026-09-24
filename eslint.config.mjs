import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Sin console.log en producción: usar lib/log.ts (CLAUDE.md).
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Ningún texto fijo en componentes: todo sale de messages/es.json (CLAUDE.md).
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: false,
          ignoreProps: true,
          allowedStrings: ["·", "/", "×", "—", "–", "-", "|", ":", "%", "+", "→", "←", "*", "(", ")", "#", "…", "&nbsp;"],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.ts"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".data/**",
    "playwright-report/**",
    "test-results/**",
    "supabase/**",
  ]),
]);

export default eslintConfig;
