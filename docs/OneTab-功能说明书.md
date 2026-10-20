# OneTab 功能说明书（逆向与实现准备）

> 面向「my-tab」自研项目的可落地规格文档。整理日期 2026-10-13。
> 标记约定：**[已证实]** = 来自官方页面/商店/真实 manifest；**[待验证]** = 基于证据的推断，需解包后确认。

- 扩展 ID：`chphlpgkkbolifaimnlloiipkdnihall`
- 当前版本：v2.24（2026-10-11，2.87 MB）；商店展示 v2.18（2026-07-05，2.5 MiB，48 语言）
- 平台：Chrome / Firefox / Edge / Safari（Chrome 115+）
- 规模：Chrome 侧 200 万+ 用户，4.45 分（约 1.46 万评分）

---

## 0. 文档说明

**目的**：为 my-tab 提供可直接驱动开发的功能规格，覆盖「做什么」与「怎么做」，并区分事实与推断。

**方法**：抓取官网/Help/Troubleshooting/Tab Recovery 原文；核对商店数据；获取真实 `manifest.json`（v1.84）；交叉比对第三方评测与用户评价。

**未完成部分（重要）**：受网络限制（直连 `clients2.googleusercontent.com` 报 CONNECT 502、镜像站 Cloudflare 挑战），**未能下载并解包 .crx**。因此第 7 章的存储键名/序列化/加密为推断值；第 11 章给出取样与解包方法。真实 manifest 见附录 A。

---

## 1. 产品概述

**定位**：零门槛的「标签页收纳器」。点一下图标 → 当前窗口所有标签折叠成一张列表页并关闭 → 释放内存；需要时个别或整体还原。

**价值主张**
- 省内存：官方称最多省 95%（1981 MB → 99 MB），本质是减少活动标签数量。
- 降杂乱：标签栏从「一墙 favicon」变成可检索、可组织的列表。
- 零成本零注册：免费、无需账号、默认纯本地。
- 抗丢失：关闭页面/重启/崩溃都不丢（数据在扩展存储，不在页面）。

**平台与商业**
| 维度 | 内容 |
|---|---|
| 平台 | Chrome / Firefox / Edge / Safari 及 Chromium 系 |
| 内核 | Chrome 115+；依赖 tab groups 与 MV3（Safari 不支持文件夹/搜索/云同步等新功能）|
| 开发者 | OneTab Ltd（英国 Harrow）|
| 商业模式 | 扩展本体免费无上限；**加密云同步/备份为付费**（无公开定价页）|

**竞品坐标**（决定差异化空间）
| 产品 | 思路 | 组织 | 跨设备 | 定价 |
|---|---|---|---|---|
| **OneTab** | 一键折叠成列表 | 组/文件夹/搜索/星标/任务（v2）| 付费云同步 | 免费 + 付费同步 |
| Toby | 新标签页工作台 | Spaces+Collections（强）| 免费账号即同步 | 免费 60 条 / $4.5 起 |
| Workona | 项目工作区 | 最强 | 是 | 免费有限 / ~$7 |
| Amazing Tabs | 可搜索卡片 + ⌘K | 中 | 是 | 免费 100 条 / $2.9 起 |

> 护城河：一键、零配置、纯本地、免费无限量。弱点：组织/搜索弱于后来者、曾多次数据丢失、无免费同步。
> my-tab 切入点：保留一键心智 + 免费/自托管同步 + 更强检索与防丢失。

---

## 2. 核心概念

| 术语 | 英文 | 定义 |
|---|---|---|
| 标签页条目 | Tab / Tab item | 一条被收藏的链接：URL、标题、favicon、时间戳 |
| 标签组 | Tab Group | 一次「收起」产生的一组标签，列表页的卡片单位 |
| 文件夹 | Folder | v2 新增，容纳多个组，形成两级层级 |
| 快捷列表 | Quick List | 独立「固定/常用」列，可从图标弹窗访问 |
| 星标 | Star | 把组置顶（按加星顺序）|
| 锁定 | Lock | 防误删；从锁定组还原的标签仍留在列表 |
| 任务 | Task | 条目的待办标记，再点一次标记完成 |
| 备注 | Notes | 条目/组的文字说明 |
| 会话 | Session | 概念上=一次窗口收起结果，OneTab 未作为独立一级对象 |
| 分享为网页 | Share as a web page | 把组上传生成链接（**唯一外传出口**）|

---

## 3. 功能地图

优先级：**P0** 必做核心 · **P1** 体验必备 · **P2** 增强 · **v2** = v2 新增。

| 功能域 | 能力 | 优先级 |
|---|---|---|
| A 收集 | 一键收起当前窗口全部标签 | P0 |
| | 收起 单/其他/左/右（右键菜单）| P0 |
| | 标签栏多选后只收选中项 | P1 |
| | 快捷键收起/打开 | P0 |
| | 固定标签处理策略 | P1 |
| | 无痕窗口支持 | P2 |
| | 重复标签处理策略 | P1 |
| B 恢复 | 单条恢复 | P0 |
| | 整组恢复 | P0 |
| | 全部恢复 | P1 |
| | 恢复目标窗口/恢复后是否移除 | P1 |
| C 组织 | 组内拖拽排序 | P1 |
| | 拖到空白新建组 | P1 |
| | 拖组入组=合并 | P1 |
| | 文件夹（两级）| v2 P1 |
| | 组重命名 | P1 |
| | 星标置顶/锁定 | P1 |
| | 多选与批量操作 | P1 |
| D 检索 | 页面搜索栏（`/` 聚焦）| v2 P0 |
| | 地址栏关键词（`11`+空格）| P1 |
| E 标记 | 任务/完成态 | v2 P2 |
| | 备注/星标 | v2 P2 |
| F 快捷列表 | Quick List + 图标弹窗入口 | v2 P2 |
| G 数据流转 | 导出/导入（URL 列表）| P0 |
| | 分享为网页（链接+二维码）| P1 |
| | 复制链接到剪贴板 | P2 |
| | 加密云同步/备份（跨浏览器 E2E）| P2 |
| H 设置 | 选项页（启动/恢复/固定标签/去重）| P0 |
| | 快捷键自定义 | P1 |
| | 深色模式 | P1 |

---

## 4. 详细功能说明

### 4.1 收集 / 收起
主操作：**点击工具栏图标 → 收起当前窗口全部标签**（读取元数据 → 批量关闭 → 写成新组 → 打开列表页）。

触发入口（4 类）：
1. **工具栏图标**：默认直接收起；若启用弹窗则改为打开弹窗。
2. **页面右键菜单**：发送 当前/所有/其他/左侧/右侧 标签。
3. **标签栏多选**：按住 `Ctrl`/`⌘`/`Shift` 多选后，只发送选中标签。
4. **快捷键**：默认 `Alt+Shift+1`（Win/Linux）、`Option+Shift+1`（Mac）；另有「模拟点击图标」的快捷键。

策略选项：固定标签是否一并收起、是否允许/自动去重、无痕模式（需浏览器层授权）。

> 省内存的真实机制是**关闭**标签页（渲染进程被回收）。网传「用 `chrome.tabs.discard()`」与官方「标签不再打开」的描述不符，**[待验证]**。

恢复语义：通过 `chrome.tabs.create()` 重开 URL；**不保证恢复页面状态**（滚动/表单/临时态），受浏览器安全模型限制。

### 4.2 查看与恢复
- OneTab 页面：全页列表，按组展示标签数量、标题、URL、favicon。
- 单条恢复：点击条目新标签打开。
- 整组恢复：一键打开整组。
- 全部恢复：恢复所有组。
- 恢复后行为可配置（是否从列表移除、恢复到当前/新窗口）。
- **锁定组**：从中还原的标签仍保留在列表（相当于「复制打开」）。

### 4.3 组织与整理
拖拽排序 / 拖到空白新建组 / 拖组入组合并 / 文件夹（v2）/ 重命名（More → Name the tab group）/ 星标置顶（More → Start this tab group，按加星顺序）/ 锁定（Lock this tab group）/ 多选（勾选图标，右键看批量操作）/ 删除与清空。

### 4.4 搜索
- 页面内搜索栏（v2）：即时过滤；按 `/` 聚焦。
- 地址栏：输入 `11` + 空格 + 关键词，直接在地址栏检索列表。
- 维度：标题、URL（是否含备注/文件夹名 **[待验证]**）。

### 4.5 任务 / 星标 / 备注（v2）
星标重要项；任务待办标记（再点标记完成）；备注说明「为什么留着这些标签」。

### 4.6 快捷列表 Quick List（v2）
列表页独立「快捷列表」列，可拖入重要条目；启用弹窗时点击图标即可查看。

### 4.7 导出 / 导入 / 分享
导出为 URL 文本清单；导入还原；**分享为网页**上传到 `www.one-tab.com` 生成公开链接+二维码（唯一外传出口）；复制链接到剪贴板；旧浏览器可用官方 `datadump-1.1.zip` 临时扩展导出。

### 4.8 同步与备份

#### 4.8.1 OneTab 的做法（参考，v2 付费）
E2E AES-256（密钥只在用户手中）；跨 Chrome/Firefox/Edge 同步；免费仍为纯本地，云同步为付费。
> **[待验证]** 官方措辞「即将推出/已推出」并存，第三方普遍标注「未证实/无公开定价」。

#### 4.8.2 my-tab 方案：基于 OneDrive 的文件级同步与备份（设计决策）

> **决策**：**不**自建云端、**不**做 E2E 加密、**不**接 Microsoft Graph API。把 **OneDrive 当作纯粹的「文件搬运工」**：扩展只负责把整库导出一个 JSON 快照文件、以及从该文件读取恢复，跨设备同步完全交给 OneDrive 客户端完成。简单、可审计、零服务端成本、无需账号对接。

**职责边界**：my-tab 只做「读写一个本地 JSON 文件」；OneDrive 负责「把文件同步到云端和其他设备」。两者通过文件系统解耦。

**数据契约（快照文件）**
```json
{
  "format": "my-tab-backup",
  "schemaVersion": 1,
  "deviceId": "<uuid>",
  "exportedAt": 1730000000000,
  "store": { }
}
```
文件名建议固定 `my-tab-backup.json`；如需历史快照，另存 `my-tab-backup.<ISO时间戳>.json` 并保留最近 N 份。

**两条落地路径**
| 路径 | 做法 | 体验 | 兼容性 |
|---|---|---|---|
| **A · 目录句柄（推荐）** | 选项页点「选择 OneDrive 备份文件夹」→ File System Access API `showDirectoryPicker()` 取目录句柄 → 句柄存 IndexedDB → 之后可静默读写该目录下快照 | 一次授权，长期自动备份 | Chrome/Edge 支持；Firefox/Safari 不支持 |
| **B · 下载目录兜底** | `chrome.downloads` 把快照写入默认下载目录（如 `my-tab/backup.json`）；恢复用 `<input type=file>` 选回；用户把 OneDrive 指向该目录 | 需手动导出/导入 | 全平台可用 |

策略：优先 A，API 不可用时自动降级到 B。

**触发时机与冲突处理**
- 触发：① 收起/组织后（防抖）自动备份；② 浏览器启动时自动读取合并；③ 选项页「立即备份/立即恢复」。
- 合并：按 `id`(uuid) 并集，同 id 以 `updatedAt` 较新者为准（LWW）；删除用软删除标记 `deletedAt` 传递，避免「A 删除、B 合并后复活」。
- 冲突：写入前先读当前文件并合并再落盘；时间戳快照可作手工回滚点。
- 防呆：先写临时文件再替换，避免 OneDrive 上行时读到半截文件。

**明确不做的（保持简单）**
- ❌ Microsoft Graph API / OAuth（需 Azure 应用注册，复杂度高、收益低）
- ❌ 端到端加密（快照为明文 JSON；后续如需可加口令加密，不默认开启）
- ❌ 实时推送同步（改为 变更触发 + 启动拉取 + 手动）
- ❌ 自建服务端

### 4.9 设置项（options.html，独立标签页）
启动时是否打开 OneTab 页；固定标签是否收起；重复标签策略；恢复行为（目标窗口/是否移除/是否清空）；是否启用弹窗；快捷键入口；隐私相关；v2 新增语言/主题/保存模式/备份/回收站与重复链接管理/安全设置（**[待验证]**）。
**my-tab 备份相关设置**（见 4.8.2）：备份目录（OneDrive 文件夹）、自动备份开关与频率、启动时自动合并、保留快照份数、「立即备份/立即恢复」入口。

### 4.10 界面与主题
深色模式；v2 重设计更「应用化」（遭老用户吐槽，my-tab 应保留极简气质）；48 种语言（v1 早期 30 种）。

---

## 5. 交互与用户流程

### 5.1 收起流程
```
点击图标/快捷键/右键
  → tabs.query({currentWindow:true})
  → 按策略过滤（固定标签?/去重?/排除自身页?/多选子集）
  → 记录元数据 {url,title,favIconUrl,pinned,lastAccessed,windowId,index}
  → 写入 chrome.storage.local   ← 先落库！
  → tabs.remove([...tabIds])
  → 打开/聚焦列表页
```
> 「先持久化、再关闭」是防丢关键；反过来在写入前崩溃会丢全部标签。

### 5.2 恢复流程
```
点击条目/组恢复
  → 单条 tabs.create({url,active:false}) / 整组逐条 create / 全部遍历
  → 按设置决定是否从列表移除（锁定组不移除）
  → 写回存储并广播刷新 UI
```

### 5.3 关键竞态与边界
并发收起需串行化写入；MV3 SW 会休眠，状态必须落存储；多页面用 `storage.onChanged`/`sendMessage` 同步；排除扩展自身页面；整组恢复保持原 `index` 顺序。

---

## 6. 界面结构

| 界面 | 载体 | 职责 |
|---|---|---|
| 列表页 | 扩展页面（在标签中打开）| 组件/文件夹/快捷列表；搜索、拖拽、批量、恢复、分享 |
| 选项页 `options.html` | 独立标签页（`open_in_tab:true`）| 配置行为/快捷键/主题/备份 |
| 工具栏图标 | `action` | 默认=收起；可配置为弹窗 |
| 弹窗 | popup | 快捷列表与常用操作 |
| 右键菜单 | `contextMenus` | 按范围发送标签 |
| 地址栏 | omnibox（`11`+空格）| 免开页面检索 |
| 分享页 | 服务端网页 | 展示分享组 + 二维码 |

> 真实 manifest（v1.84）中 `action` **无 `default_popup`**，印证「默认点击即收起」；popup 属可选 v2 能力。

---

## 7. 数据模型（逆向重点）

> **[待验证]** 本章为推断模型，用于指导实现；真实键名与结构需按第 11 章解包校正。

### 7.1 存储位置 [已证实]
- 官方原文：「OneTab data is stored in **your browser's internal database**」→ 扩展持久化存储（`chrome.storage.local`，底层 profile 目录下 LevelDB）。
- manifest 申请 `storage` + `unlimitedStorage` → 数据可达很大、需突破默认配额。
- v2 提示「使用与 v1 不同的浏览器数据库」→ v2 更换存储后端（v1 可能为 `localStorage`，**[待验证]**）。
- 数据随 profile 走：卸载/重置即删除（官方反复警告）。

### 7.2 实体关系（推断）
```
Folder 1 ── * TabGroup 1 ── * TabItem
   │              ├─ name, star, locked, createdAt
   │              └─ note?
QuickList ── 引用若干 TabItem（跨组置顶）
Settings  ── 单例配置
Trash?    ── 回收站（v2 提及，待验证）
```

### 7.3 字段草案（my-tab 起步）
```ts
TabItem {
  id: string;             // uuid，稳定唯一
  url: string;
  title: string;
  favIconUrl: string | null;
  createdAt: number;
  pinned: boolean;
  starred?: boolean;
  task?: 'open' | 'done';
  note?: string;
  origin?: { windowId: number; index: number; lastAccessed?: number };
}
TabGroup {
  id: string; name?: string; folderId?: string | null;
  starred: boolean; locked: boolean; createdAt: number; tabs: TabItem[];
}
Folder { id: string; name: string; order: number; }
Settings { /* 见 4.9 */ }
Store { version: number; folders: Folder[]; groups: TabGroup[]; quickList: string[]; settings: Settings }
```

### 7.4 序列化/压缩/加密 [待验证]
本地很可能是 JSON 存 `chrome.storage.local`（必要时按组切键）；云同步宣称 AES-256 E2E，后端域名证据 `https://www.one-tab.com/*`；部分第三方克隆用 LZ-string 压缩 + AES-GCM（可作技术选型参考）。
> **my-tab 决策**（见 4.8.2）：**不做端到端加密**。本地与 OneDrive 快照均为**明文 JSON**；体积大时可选用 LZ-string 压缩（仅降体积，不涉安全）。保密性由 OneDrive 账号自身机制承担。

---

## 8. 技术架构（逆向准备）

### 8.1 真实 manifest 解读（v1.84）[已证实]
| 字段 | 值/含义 |
|---|---|
| `manifest_version` | 3（MV3）|
| `background.service_worker` | `ext-onetab-concatenated-sources-background.js` → 构建把多源文件**拼接成单一后台脚本** |
| `options_ui` | `options.html`，`open_in_tab:true` |
| `commands` | `display-onetab`（默认 `Alt+Shift+1`）、`send-current-tab-to-onetab` |
| `action` | 仅图标（19/38），**无 default_popup** |
| `permissions` | `favicon, unlimitedStorage, storage, activeTab, scripting, tabs, contextMenus` |
| `optional_permissions` | `tabGroups` |
| CSP `img-src` | 允许 `https://t2.gstatic.com` → Google 生成域名图标 |
| `key` | base64 公钥，固定扩展 ID |

### 8.2 组件与数据流
```
工具栏图标/右键/快捷键 ──▶ Background Service Worker
                            · 收/恢复编排 · 菜单构建
                            · omnibox(11) 搜索 · storage 读写(唯一权威)
列表页/弹窗/options ◀──▶ SW（runtime message / storage.onChanged）
                            │
                            ▼
                   chrome.storage.local（本地库）
                            │ (付费/E2E)
                            ▼
                   www.one-tab.com / 分享页服务
```

### 8.3 依赖的 Chrome API
| API | 用途 | 权限 |
|---|---|---|
| `tabs` | query/create/remove/update | `tabs` |
| `tabGroups` | 原生标签组互操作 | `tabGroups`(可选) |
| `storage`(+`unlimitedStorage`) | 本地持久化 | `storage` |
| `contextMenus` | 右键菜单 | `contextMenus` |
| `commands` | 快捷键 | 无需额外 |
| `scripting`+`activeTab` | 按需注入 | `scripting`/`activeTab` |
| `favicon` | 站点图标 | `favicon` |
| `omnibox` | `11` 关键词搜索 | 无需额外 |
| `readingList`/`bookmarks` | v2 可选集成 | optional |
| `alarms`/`identity`/`notifications` | 同步/备份（**[待验证]**）| 视实现 |
| `downloads` *(my-tab)* | 导出快照到下载目录（OneDrive 兜底路径）| `downloads` |
| File System Access API *(my-tab)* | 选择 OneDrive 备份目录并静默读写快照 | Web 标准，无需扩展权限（用户手势授权目录句柄）|

### 8.4 网络端点
- `https://clients2.google.com/service/update2/crx`（更新）
- `https://t2.gstatic.com`（favicon 图源）
- `https://www.one-tab.com/*`（分享/v2 同步后端）

### 8.5 MV2→MV3 迁移痕迹
v1.18（MV2）权限：`tabs, <all_urls>, webRequest, webRequestBlocking, contextMenus`；1.58→1.61 改用 `scripting`+`favicon` 并移除 `chrome://favicon/`；1.69→1.72 增加可选 `tabGroups`。

---

## 9. 权限与隐私模型

### 9.1 权限逐项（v2.x）
| 权限 | 用途 | 风险 |
|---|---|---|
| `tabs` | 读所有标签 url/title/favicon | 可感知浏览习惯（官方声明不外传）|
| `storage` | 存列表与设置 | 低 |
| `unlimitedStorage` | 突破 5MB 配额 | 低 |
| `contextMenus` | 右键入口 | 低 |
| `activeTab` | 用户主动操作时临时访问当前页 | 低（比 `<all_urls>` 收敛）|
| `scripting` | 按需注入 | 中 |
| `favicon` | 生成域名图标 | 低 |
| 可选 `tabGroups` | 原生标签组互操作 | 低 |
| 可选 host `www.one-tab.com/*` | 分享/云同步 | 仅自家域名 |
| 可选 `readingList`/`bookmarks` | v2 集成 | 中 |

> 第三方评估：**中等风险影响 / 极低风险可能性**（权限较敏感但发布者信誉良好）。

### 9.2 隐私承诺（官方原文要点）
标签 URL **绝不外传**；域名图标由 Google 生成；**唯一例外**=主动「分享为网页」；商店声明「不收集/不使用你的数据」。

> 启示：「本地优先 + 唯一明确出口」是信任叙事核心。my-tab 应默认纯本地，任何外传都显式可审计。

---

## 10. 边界与已知问题

### 10.1 数据丢失场景（官方排障页）
| 原因 | 说明 |
|---|---|
| 卸载/重装 | 浏览器删除扩展数据（官方警告勿用重装修复）|
| 第三方清理软件 | BleachBit、Advanced SystemCare 等破坏内部数据库 |
| Firefox「刷新」 | 误点重置为默认，删除数据 |
| 磁盘满 | 写入失败致损坏/删除 |
| 崩溃/硬件故障 | 写入中崩溃致损坏 |
| profile 切换/重置 | 各 profile 独立 |

> 官方建议定期导出或用云备份。**用户评价中「更新导致数据消失」是最常见差评** → my-tab 必须把「升级不丢数据」当一等公民。

### 10.2 兼容与性能
需 Chrome 115+；老 Chromebook 不兼容；Safari 不支持新功能；第三方 Safari 扩展可能干扰；重站点/非 Chromium 有性能问题，数千条时变慢。

### 10.3 功能缺口（用户呼声）
缺整组保存/恢复与文件夹层级状态保留；v2 UI 改版引发不满（偏好 v1 极简）；同步定价与可靠性未明。

---

## 11. 逆向工程路线图

### 11.1 获取 .crx
```bash
BASE='https://clients2.google.com/service/update2/crx'
PARAMS='response=redirect&os=win&arch=x86-64&os_arch=x86-64&prod=chromecrx&prodchannel=unknown&prodversion=120.0.0.0&acceptformat=crx2,crx3'
curl -sSL "$BASE?$PARAMS&x=id%3Dchphlpgkkbolifaimnlloiipkdnihall%26uc" -o onetab.crx
```
> 本次环境限制：直连 `clients2.googleusercontent.com` → CONNECT 502；`crx4chrome.com` 镜像 → Cloudflare 挑战。请在可直连 Google 的机器执行，或用浏览器手动下载。
>
> **备用（最省事）**：本机 Chrome 安装后在 `<Profile>\Extensions\chphlpgkkbolifaimnlloiipkdnihall\<version>\` 即为解压可读源码（Profile 路径见 `chrome://version`）。

### 11.2 解包与静态分析
```bash
python -c "d=open('onetab.crx','rb').read();i=d.find(b'PK\x03\x04');open('onetab.zip','wb').write(d[i:])"
unzip -o onetab.zip -d onetab_unpacked

grep -rn "storage.local" onetab_unpacked/
grep -rnoE "chrome\.(tabs|tabGroups|storage|contextMenus|omnibox|commands|scripting|readingList|bookmarks|alarms|identity)\.[a-zA-Z]+" onetab_unpacked/ | sort -u
grep -rn "one-tab.com" onetab_unpacked/
grep -rniE "AES|encrypt|decrypt|PBKDF|salt|iv" onetab_unpacked/
cat onetab_unpacked/_locales/zh_CN/messages.json   # 反推全部功能文案
```

### 11.3 动态分析
加载解包扩展 → 打开 SW 的 DevTools → 用 Application/Storage Inspector 看 `chrome.storage.local` 真实键名与结构 → Network 抓分享/同步请求 → 在 1.84/2.18/2.24 间 diff 定位 v1→v2 迁移逻辑。

### 11.4 待确认清单
1. 存储键名与结构（单体大对象 vs 分组多键）
2. `chrome.storage.local` 还是 IndexedDB？v1 是否 `localStorage`？迁移如何触发
3. 用 `tabs.discard` 还是纯 `remove`
4. 同步加密算法/密钥派生/后端契约
5. omnibox `11` 与快捷列表的实现
6. `scripting`+`activeTab` 的具体用途

---

## 12. my-tab 复刻实现建议

**MVP 范围**
- P0：一键收起 → 写存储 → 列表页展示 → 单/整组/全部恢复 → 导出/导入 → 选项页 → 快捷键
- P1：拖拽、多选、重命名、星标/锁定、文件夹、搜索栏+omnibox、深色模式
- P2：任务/备注、快捷列表、分享、**基于 OneDrive 的同步与备份**（见 4.8.2）、回收站与防丢失

**架构**
- MV3 + Service Worker；状态全落 `chrome.storage`，SW 只编排
- **单写者模型**：SW 串行处理写操作；页面只发消息；`storage.onChanged` 广播刷新
- 技术栈：原生 JS（最轻）或 Vite + React/Preact（交互复杂时）
- 列表页与选项页复用数据层（storage 适配器 + 纯函数 reducer）

**数据结构**：沿用 7.3；`uuid` 作稳定 id；`store.version` 做 schema 版本化（主动设计迁移器）；大量标签按组切键。

**关键技术点与坑**
- 先写库再关标签，对部分失败做补偿
- 排除自身页面
- 去重按归一化 URL（去 fragment/tracking 参数）
- favicon 优先 `favicon` 权限或 `t2.gstatic.com`，离线降级默认图标
- 无痕模式注意隔离与授权
- 列表页虚拟滚动（超越 OneTab 的短板）
- 防丢失：导出快照 + 升级前备份 + 回收站软删除
- **OneDrive 同步备份**（见 4.8.2）：只读写一个 JSON 快照文件，同步交给 OneDrive 客户端；用目录句柄实现静默自动备份，不可用时降级 `chrome.downloads` 手动导出；按 `id`+`updatedAt` LWW 合并，`deletedAt` 软删除传递防复活

**迭代路线**：M1 骨架+收/恢复+本地存储+列表页 → M2 组织+搜索+选项页 → M3 防丢失+性能 → M4 OneDrive 同步备份+分享+跨浏览器。

---

## 附录 A · 真实 manifest.json（OneTab v1.84，原文）

```json
{
  "update_url": "https://clients2.google.com/service/update2/crx",
  "manifest_version": 3,
  "name": "OneTab",
  "description": "__MSG_manifestDescription__",
  "version": "1.84",
  "default_locale": "en",
  "key": "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDs2r/nSa4MRBoDT1pBx+Q9gI0JaTBaIrsD4uKT9oA4HUF2xboeOA1BDw3lmoJ4G8BL0tAbJTcEnxlkTsCY7C413MojaeDZy4pza3RJqkMAKiJisl8t8eiP+c0ox3l1syb1xmI7EEIouXIxlCX8LGoguB0AuWtunGLCjiLoM2vJLQIDAQAB",
  "commands": {
    "display-onetab": {
      "suggested_key": { "default": "Alt+Shift+1" },
      "description": "__MSG_displayOneTab__"
    },
    "send-current-tab-to-onetab": { "description": "__MSG_sendCurrentTabToOneTab__" }
  },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "icons": {
    "128": "images/extension-icon128.png",
    "64": "images/extension-icon64.png",
    "48": "images/extension-icon48.png",
    "32": "images/extension-icon32.png",
    "16": "images/extension-icon16.png"
  },
  "optional_permissions": ["tabGroups"],
  "permissions": ["favicon", "unlimitedStorage", "storage", "activeTab", "scripting", "tabs", "contextMenus"],
  "action": { "default_icon": { "19": "images/icon19.png", "38": "images/icon38.png" } },
  "background": { "service_worker": "ext-onetab-concatenated-sources-background.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; img-src 'self' data: https://t2.gstatic.com;"
  }
}
```
> v2.2 起新增可选主机权限 `https://www.one-tab.com/*` 与可选权限 `readingList`、`bookmarks`（v1.84 尚未出现）。

## 附录 B · 版本与权限变迁

| 时间 | 版本 | 变化 |
|---|---|---|
| 2026-10-11 | 2.24 | 2.87 MB（最新）|
| 2026-07-05 | 2.18 | 商店展示版，2.5 MiB，48 语言 |
| 2026-03-22 | 2.14 | — |
| 2026-03 | 2.x 全量 | v2 重写推送全体 |
| 2025-09-24 | 1.86→2.2 | 新增可选 host `www.one-tab.com/*`；可选权限 `readingList`、`bookmarks` |
| 2024-06-11 | 1.86 | v1 末版 |
| 2023-10-09 | 1.84 | 本说明书 manifest 取样版本 |
| 2023-06-26 | 1.69→1.72 | 新增可选权限 `tabGroups` |
| 2023-05-30 | 1.58→1.61 | 新增 `scripting`、`favicon`；移除 `chrome://favicon/` |
| MV2 时代 | 1.18 | 权限 `tabs, <all_urls>, webRequest, webRequestBlocking, contextMenus` |

## 附录 C · 资料来源
官网 zh-CN、Help、Troubleshooting、Tab Recovery；Chrome Web Store；chrome-stats.com；ilovechrome.com / crx4chrome.com；百度百科；第三方对比评测（Amazing Tabs / Uncluttr / Blackmount）。
