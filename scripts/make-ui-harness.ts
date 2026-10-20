/**
 * 生成 UI 操作演示外壳（仅用于本地视觉验收）。
 *
 * 用一个同源 iframe 载入 list.html，并在其中模拟点击（多选 / 打开分享弹窗 / 输入弹窗 / 顶部菜单），
 * 这样就能对「多选操作条」和「弹窗」这类需要交互才出现的界面截图验收。
 * 页面标题会被写成 `R|...诊断信息`，便于用 --dump-dom 抓取断言。
 *
 * 用法：tsx scripts/make-ui-harness.ts [--theme=dark] [--lang=zh-CN]
 *      http://<预览地址>/__ui.html#select  （多选态）
 *      http://<预览地址>/__ui.html#share   （分享弹窗）
 *      http://<预览地址>/__ui.html#prompt  （输入弹窗）
 *      http://<预览地址>/__ui.html#menu    （顶部菜单 → 确认弹窗）
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { buildDemoState } from './demo-state'
import { parseArgs } from './args'

const argv = parseArgs(process.argv.slice(2))

const state = buildDemoState({
  theme: argv.theme === 'light' ? 'light' : 'dark',
  language: argv.lang === 'en-US' ? 'en-US' : 'zh-CN'
})

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<title>MyTab UI harness</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0f141a; overflow: hidden; }
  iframe { border: 0; width: 100vw; height: 100vh; display: block; }
</style>
</head>
<body>
<iframe id="f" src="list.html"></iframe>
<script>
  localStorage.setItem('mytab:state', JSON.stringify(${JSON.stringify(state)}));
  localStorage.setItem('mytab:deviceId', JSON.stringify('demo-device-0001'));

  const mode = (location.hash || '#select').slice(1);
  const f = document.getElementById('f');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const byText = (doc, sel, text) => [...doc.querySelectorAll(sel)].find((el) => (el.textContent || '').includes(text));

  f.addEventListener('load', async () => {
    await wait(1200);
    const d = f.contentDocument;
    if (!d) { document.title = 'R|no-doc'; return; }
    const report = [];
    try {
      if (mode === 'select') {
        const btn = byText(d, '.sec-head button', '多选');
        report.push('selectBtn=' + !!btn);
        if (btn) btn.click();
        await wait(400);
        const boxes = [...d.querySelectorAll('.card.group .row .check input')];
        report.push('boxes=' + boxes.length);
        boxes.slice(0, 4).forEach((b) => b.click());
        await wait(500);
        report.push('bar=' + !!d.querySelector('.bar'));
      } else if (mode === 'share') {
        const shareBtn = d.querySelector('.card.group .acts button[data-tip="分享"]');
        report.push('shareBtn=' + !!shareBtn);
        if (shareBtn) shareBtn.click();
        await wait(1000);
        report.push('dialogs=' + d.querySelectorAll('[role="dialog"]').length);
        report.push('qr=' + d.querySelectorAll('.qr svg').length);
      } else if (mode === 'prompt') {
        const b = d.querySelector('.head button[data-tip="新建文件夹"]');
        report.push('btn=' + !!b);
        if (b) b.click();
        await wait(600);
        report.push('dialogs=' + d.querySelectorAll('[role="dialog"]').length);
        report.push('input=' + d.querySelectorAll('[role="dialog"] input').length);
      } else if (mode === 'menu') {
        const triggers = [...d.querySelectorAll('.head .dd > button')];
        report.push('triggers=' + triggers.length);
        if (triggers[0]) triggers[0].click();
        await wait(400);
        const items = [...d.querySelectorAll('.head .dd .mi')];
        report.push('menuItems=' + items.length);
        const clear = items.find((el) => el.textContent.includes('清空列表'));
        report.push('clear=' + !!clear);
        if (clear) clear.click();
        await wait(700);
        report.push('dialogs=' + d.querySelectorAll('[role="dialog"]').length);
      }
    } catch (e) {
      report.push('EX:' + e.message);
    }
    document.title = 'R|' + report.join(' ');
  });
</script>
</body>
</html>
`

const dest = fileURLToPath(new URL('../dist/__ui.html', import.meta.url))
writeFileSync(dest, html)
console.log(`✓ 已生成 ${dest}`)
