import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'
import { resolve } from 'path'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
const appVersion = process.env.APP_VERSION || process.env.VITE_APP_VERSION || packageJson.version
const appChannel = process.env.APP_CHANNEL || process.env.VITE_APP_CHANNEL || 'test'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_CHANNEL__: JSON.stringify(appChannel)
  },
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      resolvers: [VantResolver()],
    }),
    Components({
      resolvers: [VantResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/*.tmp', '**/apple-v4*', '**/APPLE-V4*', '**/browser-screenshots/**', '**/backups/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
