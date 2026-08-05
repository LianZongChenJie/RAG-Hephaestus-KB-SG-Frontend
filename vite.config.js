import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// ---------- 配置常量 ----------
const DEV_PORT = 5173
const BACKEND_TARGET = 'http://127.0.0.1:8000'
// ------------------------------

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: DEV_PORT,
    // 局域网设备访问同一 host:5173，/api 由本机代理到后端，避免写死 localhost
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('chat-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
    },
  },
})
