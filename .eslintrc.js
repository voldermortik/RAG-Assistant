/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ],
  rules: {
    // TypeScript
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-import-type-side-effects": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    "@typescript-eslint/require-await": "error",
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      { allowNumber: true, allowBoolean: true },
    ],

    // General
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-restricted-syntax": [
      "error",
      {
        selector: "ForInStatement",
        message:
          "for..in loops iterate over the entire prototype chain. Use Object.{keys,values,entries} instead.",
      },
    ],
    "prefer-const": "error",
    "object-shorthand": "error",
    "no-param-reassign": ["error", { props: false }],
  },
  overrides: [
    {
      files: ["**/*.tsx"],
      extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
      rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
      },
      settings: {
        react: {
          version: "detect",
        },
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
    {
      files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-require-imports": "off",
      },
    },
  ],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "build/",
    ".next/",
    "coverage/",
    "*.config.js",
    "*.config.ts",
    "*.config.mjs",
  ],
};
