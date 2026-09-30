import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs, so no FlatCompat wrapper.
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Destructuring to discard keys is how a subset of an object is built.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      ".cache/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
