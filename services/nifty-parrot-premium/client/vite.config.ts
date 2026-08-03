import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/tree/" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5174",
        changeOrigin: true
      },
      "/health": {
        target: "http://localhost:5174",
        changeOrigin: true
      }
    }
  }
}));
