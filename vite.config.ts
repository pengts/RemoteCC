import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $messages: path.resolve("./messages"),
    },
  },
  build: {
    target: ["safari16", "chrome105", "edge105"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: [".", "messages"],
    },
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
      },
    },
    watch: {
      // Ignore non-frontend paths to prevent CLI agent file operations
      // from triggering page reloads during active sessions.
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/build/**",
        "**/target/**",
        "**/apps/**",
        "**/packages/**",
        "**/.next/**",
        "**/dist/**",
        "**/.claude/**",
        "**/.opencovibe/**",
        "**/tmp/**",
        "**/memory/**",
      ],
    },
  },
});
