import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const gatewayTarget = process.env.VITE_DEV_GATEWAY_TARGET ?? "http://localhost:19090";
const appBasePath = process.env.VITE_BASE_PATH ?? "/n50/";

function n50Proxy(options?: Partial<ProxyOptions>): ProxyOptions {
  return {
    target: gatewayTarget,
    changeOrigin: true,
    secure: false,
    ws: true,
    rewrite: (path) => `/n50${path}`,
    ...options
  };
}

export default defineConfig({
  base: appBasePath,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) return undefined;
          if (normalizedId.includes("/node_modules/echarts/")) {
            return "vendor-echarts";
          }
          if (normalizedId.includes("/node_modules/zrender/")) return "vendor-zrender";
          if (
            normalizedId.includes("/node_modules/firebase/") ||
            normalizedId.includes("/node_modules/@firebase/")
          ) {
            return "vendor-firebase";
          }
          if (normalizedId.includes("/node_modules/@tanstack/react-query/")) return "vendor-query";
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": n50Proxy(),
      "/v1": n50Proxy(),
      "/api/v1": n50Proxy(),
      "/option-chain": {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false
      },
      "/watcher": {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
