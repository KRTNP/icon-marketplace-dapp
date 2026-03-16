const { defineConfig } = require("vite");

module.exports = defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4315",
        changeOrigin: true,
        secure: false
      }
    }
  }
});
