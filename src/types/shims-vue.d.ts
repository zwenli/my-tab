/**
 * 纯 tsc 场景下的 `.vue` 模块兜底声明。
 *
 * 为什么单独一个文件、而不是写在 global.d.ts 里：
 * global.d.ts 有顶层 `export`，属于「模块」，其中的 `declare module '*.vue'`
 * 会被当成模块增强，通配符不生效 —— 于是 `tsc -p tsconfig.node.json`
 * 检查页面入口时会报 TS2307「Cannot find module './App.vue'」。
 *
 * 本文件没有任何顶层 import / export，是纯环境声明（script 文件），
 * 通配符声明才真正生效。vue-tsc 会优先按真实 SFC 解析，不会用到这里的兜底类型。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
