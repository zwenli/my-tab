import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 把根目录的 manifest.json 原样复制到 dist/，
 * 让构建产物本身就是可直接「加载已解压的扩展程序」的目录。
 */
function copyManifest(): Plugin {
  return {
    name: 'mytab-copy-manifest',
    apply: 'build',
    closeBundle() {
      const src = fileURLToPath(new URL('./manifest.json', import.meta.url))
      const dest = fileURLToPath(new URL('./dist/manifest.json', import.meta.url))
      const raw = readFileSync(src, 'utf8')
      JSON.parse(raw) // 早失败：manifest 必须是合法 JSON
      writeFileSync(dest, raw)
    }
  }
}

/**
 * MyTab 构建配置
 *
 * 采用「根目录 HTML 入口」策略，让 dist/ 直接就是可加载的扩展根目录：
 *   dist/manifest.json、dist/list.html、dist/popup.html、dist/assets/background.js
 *
 * 关键点：
 * - background service worker 作为独立 rollup 入口，固定输出为 assets/background.js，
 *   manifest 里用 "type": "module" 直接引用它。
 * - 关闭 hash 化的入口文件名，保证 manifest 引用稳定。
 * - 关闭 modulePreload 的 polyfill 内联，避免 MV3 CSP 下的内联脚本问题。
 */
export default defineConfig({
  plugins: [vue(), copyManifest()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    modulePreload: { polyfill: false },
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        list: fileURLToPath(new URL('./list.html', import.meta.url)),
        popup: fileURLToPath(new URL('./popup.html', import.meta.url)),
        options: fileURLToPath(new URL('./options.html', import.meta.url)),
        share: fileURLToPath(new URL('./share.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background/index.ts', import.meta.url))
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
