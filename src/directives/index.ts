/**
 * 全局指令注册。各页面入口统一 `app.use(directives)`。
 */
import type { App } from 'vue'
import { vTip } from './tip'

export const directives = {
  install(app: App): void {
    app.directive('tip', vTip)
  }
}

export { vTip }
export type { TipDir, TipOptions, TipValue } from './tip'
