/** @type {import("lint-staged").Config} */
const config = {
  "**/*.{ts,tsx}": [
    "eslint --fix --max-warnings 0",
    "prettier --write",
  ],
  "**/*.{js,jsx,mjs,cjs}": [
    "eslint --fix --max-warnings 0",
    "prettier --write",
  ],
  "**/*.{json,md,yaml,yml,css}": [
    "prettier --write",
  ],
};

module.exports = config;
