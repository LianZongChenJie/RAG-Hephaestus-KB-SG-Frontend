import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

// ---------- 配置常量 ----------
const DEV_PORT = 5173;
// ------------------------------

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const BACKEND_TARGET = env.VITE_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [vue()],
    server: {
      host: true,
      port: DEV_PORT,
      proxy: {
        "/xzqdd/api": {
          target: BACKEND_TARGET,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
        "/api": {
          target: BACKEND_TARGET,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
          configure(proxy) {
            proxy.on("proxyRes", (proxyRes, req) => {
              if (req.url?.includes("chat-stream")) {
                proxyRes.headers["cache-control"] = "no-cache, no-transform";
                proxyRes.headers["x-accel-buffering"] = "no";
              }
            });
          },
        },
      },
    },
  };
});
