/**
 * 生成演示数据页（仅用于本地视觉验收，不参与扩展运行）。
 *
 * 作用：往 localStorage 写入一份示例状态，然后跳转到目标页面，
 * 便于在普通浏览器里预览真实外观（扩展环境下数据来自 chrome.storage.local）。
 *
 * 用法：tsx scripts/make-demo-page.ts [--theme=light] [--lang=en-US] [--out=__demo.html] [--to=list.html#...]
 *      打开 http://<预览地址>/__demo.html
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { buildDemoState } from './demo-state'
import { parseArgs } from './args'

const argv = parseArgs(process.argv.slice(2))

const theme = argv.theme === 'light' ? 'light' : 'dark'
const language = argv.lang === 'en-US' ? 'en-US' : 'zh-CN'
const outName = argv.out || '__demo.html'
const target = argv.to || 'list.html'

const state = buildDemoState({ theme, language })
const payload = JSON.stringify({ 'mytab:state': state, 'mytab:deviceId': 'demo-device-0001' })

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>MyTab 演示数据</title></head>
<body>
<p>正在写入演示数据并跳转…</p>
<script>
  const data = ${payload};
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
  location.replace(${JSON.stringify(target)});
</script>
</body>
</html>
`

const dest = fileURLToPath(new URL(`../dist/${outName}`, import.meta.url))
writeFileSync(dest, html)
console.log(`✓ 已生成 ${dest}`)
