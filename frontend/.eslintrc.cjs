// Prüfregeln (ersetzen die von Create React App, BACKLOG W3): echte Fehler + Hook-Regeln.
module.exports = {
  root: true,
  env: { browser: true, es2023: true, node: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react", "react-hooks"],
  settings: { react: { version: "detect" } },
  extends: ["eslint:recommended"],
  rules: {
    "react/jsx-uses-vars": "error",
    "react/jsx-no-undef": "error", // nicht importierte Komponenten (no-undef prüft JSX nicht)
    "react/jsx-uses-react": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_", caughtErrors: "none" }],
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  overrides: [
    { files: ["**/*.test.js", "**/*.test.jsx"], env: { node: true }, globals: { describe: "readonly", test: "readonly", it: "readonly", expect: "readonly", beforeEach: "readonly", afterEach: "readonly", vi: "readonly" } },
  ],
  ignorePatterns: ["build/", "node_modules/", "public/"],
};
