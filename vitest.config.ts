import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置（与 vite.config.ts 分开）
 *
 * 理由：构建配置里有只在 build 阶段生效的插件（copyManifest）和 rollup 输出策略，
 * 跑测试时完全用不到；单测只覆盖 src/core 下的纯函数，保持 node 环境、零 DOM。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 纯函数、无全局副作用，开多线程反而起得慢
    pool: 'threads',
    testTimeout: 10_000
  }
})
