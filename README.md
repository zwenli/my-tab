# MyTab

> 一键把「打开过多的标签页」折叠成一张可管理的列表，释放内存、减少杂乱；需要时再逐个或整体还原。

基于 **Vue 3 + Composition API + Vite 8 + Manifest V3** 完整实现 [`docs/功能说明.md`](docs/功能说明.md) 描述的全部功能。

架构遵循 **File over app** 理念：**资料库就是一个普通文件夹，里面的 `.json` 文件是唯一真相源**，用任何编辑器都能打开；`chrome.storage.local` 只是可随时重建的缓存。同步交给 OneDrive，不需要「导出/备份」功能。详见 [`docs/File-over-app-重构说明.md`](docs/File-over-app-重构说明.md)。

---

## 一、快速开始

```bash
pnpm install         # 安装依赖（包管理与锁文件统一用 pnpm）
pnpm icons           # 生成扩展图标（已生成，改设计时再跑）
pnpm build           # 产出 dist/ —— 可直接加载的扩展目录
pnpm test            # 运行核心逻辑单测（Vitest，58 项）
```

> Node 要求 **≥ 22.12**（Vite 8 / Vitest 5 的下限）。仓库已声明 `packageManager: pnpm@10`，用 `corepack enable` 可自动对齐版本。

### 在浏览器中安装

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择本项目的 `dist/` 目录。
4. 建议在「详情 → 键盘快捷键」中确认快捷键，并按需开启「在无痕模式下启用」。

### 开发模式

```bash
pnpm dev             # vite build --watch，改动自动重建
```

改完在 `chrome://extensions` 里点一次扩展卡片上的「刷新」即可生效。

### 本地预览界面（不用装扩展）

```bash
pnpm preview                                          # 等价于 vite preview --port 4173
pnpm demo                                             # 生成 dist/__demo.html + dist/__ui.html
```

普通浏览器下数据会自动回退到 `localStorage`，因此界面可以独立预览与截图验收：

- `http://[::1]:4173/__demo.html` — 深色 + 中文列表页
- `http://[::1]:4173/__demo.html?x#...`（配合 `--theme=light --lang=en-US` 可生成浅色英文版）
- `http://[::1]:4173/__ui.html#select` — 多选状态
- `http://[::1]:4173/__ui.html#share` — 分享弹窗
- `http://[::1]:4173/options.html#backup` — 设置页深链（`#collect` / `#backup` / `#data` …）

> `dist/` 里以 `__` 开头的文件都是本地验收用的临时页，`pnpm build` 会清空重建。

---

## 二、技术选型与设计系统

| 层 | 选型 | 说明 |
|---|---|---|
| UI 框架 | Vue 3.5（全部使用 `<script setup>` 组合式 API） | 无 Options API，无 class 组件 |
| 状态 | Pinia | `stores/data.js` 镜像持久化状态，`stores/ui.js` 管界面态 |
| 构建 | Vite 8（Rolldown 内核）+ `@vitejs/plugin-vue` 6 | 多 HTML 入口 + Service Worker 独立入口 |
| 包管理 | pnpm 10（`pnpm-lock.yaml` 为唯一锁文件） | 依赖隔离，避免幽灵依赖 |
| 单测 | Vitest 5（node 环境，零 DOM） | `tests/*.test.ts` 按领域拆分，`pnpm test` |
| 存储 | **资料库文件夹（真相源）+ `chrome.storage.local` 缓存** | 普通浏览器自动回退 `localStorage` 作为缓存 |
| 二维码 | `qrcode-generator` | 纯 JS、无网络、SVG 输出 |
| 样式 | 原生 CSS + CSS 变量 | 无 UI 框架，主题切换只切 `data-theme` |

**设计系统**（由 `ui-ux-pro-max` 引擎推导后人工校准）：

- 产品类型匹配 **SaaS / B2B**（置信 5.019），匹配到风格 **Minimalism**（备选 Bento Grid / Glassmorphism）；
- 调色板 **#13 Calm Triadic**，正文/背景对比度 15.66:1（WCAG AA 要求 ≥ 4.5）；
- 字体 **Inter**（回退系统字体栈，不加载任何远程字体，避免 CSP 与离线问题）；
- 深色/浅色双主题，全部色值集中在 [`src/styles/tokens.css`](src/styles/tokens.css)；
- 交付门禁（P0）落地：每个可交互元素有可访问名称、可见焦点环、键盘可达、不单靠颜色传达信息、`prefers-reduced-motion` 降级。

---

## 三、目录结构

```
my-tab/
├─ manifest.json            # MV3 清单（构建时复制到 dist/）
├─ list.html / popup.html / options.html / share.html   # 四个页面入口
├─ public/
│  ├─ icons/                # 由 scripts/make-icons.mjs 生成
│  └─ _locales/             # 清单层多语言（zh_CN / en）
├─ scripts/
│  ├─ make-icons.mjs        # 纯 Node 手写 PNG 编码器生成图标
│  ├─ selftest.mjs          # 核心逻辑自检
│  ├─ demo-state.mjs        # 演示数据构造
│  ├─ make-demo-page.mjs    # 生成界面预览页
│  └─ make-ui-harness.mjs   # 生成交互演示外壳
└─ src/
   ├─ core/                 # 与框架无关的数据层（后台与页面共用）
   │  ├─ constants.js       # 常量、默认设置、设置项元数据
   │  ├─ model.js           # 数据模型、工厂、归一化、迁移、统计
   │  ├─ mutations.js       # 全部状态变更操作（纯函数）
   │  ├─ libraryFormat.js   # 资料库文件格式：序列化 / 解析（纯函数，可单测）
   │  ├─ library.js         # 资料库读写：目录句柄、扫全库、差异同步、回收站
   │  ├─ storage.js         # 缓存层 + 变更后差异同步到资料库
   │  ├─ idb.js             # IndexedDB（存资料库目录句柄）
   │  ├─ exportImport.js    # 文本 / JSON / 书签 HTML 导出与导入（互操作用）
   │  ├─ share.js           # 分享载荷编解码 + 独立 HTML 生成
   │  ├─ qrcode.js          # 二维码
   │  ├─ search.js          # 检索与打分
   │  ├─ tabs.js            # chrome.tabs / windows 封装
   │  └─ utils.js
   ├─ background/           # Service Worker
   │  ├─ index.js           # 生命周期、图标点击、快捷键、消息订阅
   │  ├─ collect.js         # 收集逻辑（按范围 / 多选 / 顺序安全关闭）
   │  ├─ menus.js           # 右键菜单
   │  ├─ omnibox.js         # 地址栏搜索
   │  ├─ router.js          # 消息路由
   │  └─ librarySync.js     # 变更防抖落盘 + 启动/手动重扫
   ├─ stores/               # Pinia
   ├─ composables/          # useI18n / useTheme / useActions / useMessaging
   ├─ components/           # 复用组件（含 dialogs/）
   ├─ pages/                # list / popup / options / share
   ├─ i18n/                 # 运行时语言包（zh-CN / en-US）
   └─ styles/               # tokens.css + base.css
```

---

## 四、功能实现对照

| 功能说明.md 条目 | 实现位置 |
|---|---|
| 一键收起 / 按范围收集 / 只收选中项 / 快捷键 | `background/collect.js`、`background/menus.js`、`background/index.js`（`commands`）、`core/tabs.js#resolveTabsByMode` |
| 收集策略（固定标签、重复标签） | `core/constants.js#DEFAULT_SETTINGS` + `core/mutations.js#collectTabs` |
| 单条 / 整组 / 全部恢复，恢复方式可设置 | `composables/useActions.js#restoreItems`、`GroupCard.vue`、`AppHeader.vue` |
| 拖拽排序 / 拖出建组 / 拖入合并 | `pages/list/App.vue`（画布重排 + 新建组）、`GroupCard.vue`（拖入合并） |
| 文件夹、重命名、星标置顶、锁定 | `SideBar.vue`、`GroupCard.vue`、`core/mutations.js` |
| 多选与批量、删除与清空 | `SelectionBar.vue`、`stores/ui.js`、`AppHeader.vue` |
| 页面内搜索 + 地址栏搜索 | `SearchResults.vue`、`core/search.js`、`background/omnibox.js` |
| 星标 / 任务 / 备注 | `TabRow.vue`、`GroupCard.vue`、`core/mutations.js` |
| 快捷列表 | `QuickListPanel.vue`、`core/mutations.js#addToQuickList` |
| 导出 / 导入 / 分享为网页（二维码）/ 复制链接 | `dialogs/DataDialog.vue`、`core/exportImport.js`、`dialogs/ShareDialog.vue`、`core/share.js` |
| 资料库（文件夹即数据） | `core/library.js`、`core/libraryFormat.js`、`background/librarySync.js`、`pages/options/App.vue#library` |
| 设置（全部 9 项） | `pages/options/App.vue` + `core/constants.js#SETTING_GROUPS` |
| 深色模式、多语言、拖拽/多选/搜索 | `composables/useTheme.js`、`i18n/`、`styles/tokens.css` |

界面验收截图见 [`docs/screenshots/`](docs/screenshots/)。

---

## 五、数据模型与资料库

### 内存中的状态（只是缓存）

```js
{
  schemaVersion: 1,
  meta: { deviceId, createdAt, updatedAt },
  folders:   [{ id, name, color, collapsed, createdAt, updatedAt, deletedAt }],
  groups:    [{ id, title, note, folderId, starred, locked, color, collapsed,
                createdAt, updatedAt, deletedAt, items: [TabItem] }],
  quickList: [TabItem],
  settings:  { ...DEFAULT_SETTINGS }   // 本机偏好，不入资料库
}
// TabItem = { id, url, title, favIconUrl, createdAt, updatedAt, deletedAt,
//             starred, task: { done, completedAt } | null, note }
```

- **数组顺序即显示顺序**，拖拽直接改数组；组的顺序同时写进 `library.json` 的 `groupOrder`。
- 所有写操作集中在 [`core/mutations.js`](src/core/mutations.js)，页面与后台共用同一套函数，不存在两套逻辑。
- 这份状态**可以随时从资料库重建**，它只是缓存。

### 资料库文件夹（真相源）

```
<资料库>/
├── library.json           库身份 + 组顺序
├── folders.json           文件夹
├── quicklist.json         快捷列表
├── groups/
│   └── 标题 [短id].json    一个组一个文件
└── _trash/                删除的组（移到回收站，不直接抹掉）
```

- 文件是**排过版的 JSON**：键按字母排序、时间用 ISO 8601、默认值全部省略 —— 写给人看，也可以手写。
- 文件名只是给人看的，身份来自文件内部的 `id`：**改名、挪位置、手写新增都会被识别**。
- 格式与解析是纯函数，见 [`core/libraryFormat.js`](src/core/libraryFormat.js)；磁盘读写见 [`core/library.js`](src/core/library.js)。

### 怎么同步

1. 把资料库文件夹放在 OneDrive 里，**由 OneDrive 客户端负责跨设备同步**；扩展不上传任何服务器、不做端到端加密、不接 Microsoft Graph API。
2. 用 **File System Access API** 在设置页一次性选中该文件夹，句柄存 IndexedDB，之后可静默读写（后台也能写）。
3. **没有数据库语义的多设备合并** —— 文件夹本身就是共享状态，多设备读写的是同一份文件。OneDrive 产生「冲突副本」时会提示手动确认，不会静默合并。
4. 不做备份功能：Time Machine / OneDrive 的历史版本就是备份。
5. 浏览器不支持直读文件夹（Firefox / Safari）时，用「导出 / 导入」兜底。

---

## 六、权限说明

| 权限 | 用途 |
|---|---|
| `storage` / `unlimitedStorage` | 保存标签数据；数据量大时不触发配额限制 |
| `tabs` | 读取标签标题与网址、收起与还原标签 |
| `contextMenus` | 「按范围收集」右键菜单 |
| `activeTab` / `scripting` | 为后续按需注入预留 |
| `downloads` | 导出清单与快照文件 |
| `favicon` | 用浏览器缓存渲染站点图标（`_favicon/`），不额外联网 |
| `optional_permissions: tabGroups` | 预留，未强制申请 |
| `host_permissions: <all_urls>` | 读取标签 URL 需要 |

---

## 七、已知边界

- 收起后原标签会被关闭；**还原时重新打开网页，不保留页面状态**（滚动位置、已填表单等），这是浏览器本身的限制。
- **未连接资料库时**，数据只暂存在本机缓存里，界面会提示；连接后自动写入文件夹。
- 只有 **Chrome / Edge 支持**直接读写文件夹（File System Access API）；Firefox / Safari 请用「导出 / 导入」。
- 后台自动写入没有用户手势，无法弹授权框；请先在设置页完成一次目录授权。
- 云盘产生的**冲突副本不会自动合并**，会提示手动确认 —— 这是刻意的。
- 二维码容量上限约 2.9 KB：组很大时分享弹窗会自动提示改用「下载网页文件」。

---

## 八、测试

### 单元测试（Vitest）

`pnpm test` 覆盖 58 项，全部通过。用例按领域拆到 `tests/`，与 `src/core` 的纯函数一一对应：

| 文件 | 覆盖内容 |
|---|---|
| `tests/model.test.ts` | 数据模型：结构完整性、脏数据归一化、坏数据丢弃、非法枚举回落、默认组名 |
| `tests/mutations.test.ts` | 变更操作：收集过滤与去重、组合并、跨组迁移、锁定保护、任务三态、快捷列表、文件夹回落、清空与清理、统计与徽标 |
| `tests/library-format.test.ts` | 资料库文件格式：状态 ⇄ 文件集往返、人可读 JSON（键排序 / ISO 时间 / 省略默认值）、手写与改名文件识别、`groupOrder` 排序、冲突副本识别、文件名清洗 |
| `tests/search.test.ts` | 检索：标题/域名命中、多词元 AND、URL 匹配开关、组名与备注命中分组（组内条目命中不算）、默认组名可搜 |
| `tests/export-import.test.ts` | 导出导入：文本往返等价、书签 HTML 转义 |
| `tests/share.test.ts` | 分享：压缩载荷往返、独立页面自包含且防注入、纯文本与链接清单 |
| `tests/drag-order.test.ts` | 拖拽排序数学：插入点、可视视图重排、星标夹取、命中判定 |
| `tests/tip-geometry.test.ts` | 提示气泡方向与坐标夹取 |
| `tests/library-access.test.ts` | 资料库访问等级与「轻量恢复」判定 |

```bash
pnpm test            # 单次运行
pnpm test:watch      # 监视模式
```

### 浏览器验收（无头 Chromium + CDP）

交互类问题单测管不到（事件顺序、状态残留），由三个脚本兜底。前提：`pnpm build && pnpm demo` + `pnpm preview` + 无头 Chrome 9222。

```bash
pnpm check:dnd       # 18 项：拖拽排序 / 合并 / 插入线
pnpm check:library   # 16 项：重启后资料库授权恢复
pnpm check:search    # 21 项：组名检索、点分组定位、#g= 直达、空结果文案
```

> 三个脚本共用同一个 CDP page target，**不要并行跑**，否则会互相踩状态。

界面侧另用无头 Chromium 走查了列表页（深/浅色、中/英）、多选态、分享弹窗、输入弹窗、下拉菜单、设置页各分区与分享落地页。
