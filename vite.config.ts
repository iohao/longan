import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Tauri webview 使用现代 Chromium/WebKit，跳过旧版降级转译
  build: {
    target: "esnext",
  },
  // Tauri 要求固定的开发服务器端口与清晰的错误输出
  clearScreen: false,
  server: {
    port: 13000,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/_local/**",
        "**/.*/**",
        "**/openwiki/**",
      ],
    },
  },
});
