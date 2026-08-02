/// <reference types="vitest/config" />
// Separate from vite.config.ts on purpose: the app config's async factory and
// Tauri dev-server settings have no business loading in the test pipeline.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    clearMocks: true,
  },
});
