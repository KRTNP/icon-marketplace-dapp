import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4315",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: "http://127.0.0.1:4315",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
