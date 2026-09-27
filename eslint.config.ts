import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import oxlint from "eslint-plugin-oxlint";

export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },
  {
    name: "app/files-to-ignore",
    ignores: [
      "**/dist/**",
      "**/dist-ssr/**",
      "**/coverage/**",
      "**/src-tauri/**",
      "**/_local/**",
      "**/scripts/**",
    ],
  },
  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,
  oxlint.configs["flat/recommended"],
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
