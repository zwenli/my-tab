# File over app 重构说明

> 依据 Steph Ango 的《[File over app](https://stephango.com/file-over-app)》与 Vimpo《[为什么没有数据库](https://vimpo.app/zh/blog/file-over-app/)》的理念，对 my-tab 做的一次架构反转。

## 一、理念要点

文章的核心只有一句话：

> **App 是短暂的，但你的文件有机会留存下来。**

推论出四条可执行的原则：

1. **你创造的东西必须是你能掌控的文件**，且用任何工具都能打开 —— App 会停更、公司会倒闭，文件不会。
2. **不要数据库** —— 数据库文件离开 App 就是一堆看不懂的二进制；放进同步盘容易冲突损坏；在 Finder 里改名、拖动都没有意义。
3. **Finder 里做的事，App 都要认** —— 每次回到 App 就重新扫一遍目录：改名还是同一个东西、手写文件也能读、删掉文件夹就等于删除。
4. **删除不直接抹掉** —— 移到废纸箱 / 回收站，而不是 `rm`。
5. **App 自己需要的东西留在外面** —— 「你创造的东西进资料库，App 自己需要的东西留在外面」。

一个附带的结论：**有了文件夹，就不需要「导出」和「备份」功能了** —— 同步交给 OneDrive/iCloud/Dropbox，备份交给 Time Machine。

## 二、重构前的问题

| 文章批评的 | my-tab 重构前的状态 |
|---|---|
| 离开 App 就是一坨二进制 | 全部数据在一个 `chrome.storage.local` 的巨型 JSON blob 里（LevelDB），用户看不见摸不着 |
| 放进同步盘容易冲突 | 同步方式是「导出/导入一个 `my-tab-backup.json` 快照」—— 文件是**派生产物**，不是真相源 |
| Finder 里的操作没意义 | 在 Finder 里动任何东西都无效，一切必须通过扩展 UI |
| 不需要导出和备份 | 专门实现了「自动备份 / 启动合并 / 立即备份 / 立即恢复 / 从文件恢复」一整套 |
| —— | 数据模型里塞满数据库式概念：`revision`、`tombstones`(墓碑)、LWW 合并、Diff |

**根因**：真相源在 App 内部，文件只是它的投影。

## 三、重构后的架构

### 3.1 资料库 = 一个普通文件夹

```
<资料库>/                      ← 用户自己选（建议放在 OneDrive 里）
├── library.json              库身份 + 组顺序
├── folders.json              文件夹（数组顺序即显示顺序）
├── quicklist.json            快捷列表
├── groups/
│   └── 前端性能优化 [6f1c2a9e].json    一个组一个文件
└── _trash/                   删除的组（不直接抹掉）
```

一个组文件长这样（键按字母排序、时间用 ISO 8601、默认值全部省略）：

```json
{
  "createdAt": "2026-10-13T09:41:07Z",
  "id": "6f1c2a9e-...",
  "items": [
    {
      "createdAt": "2026-10-13T09:41:07Z",
      "id": "...",
      "title": "Web Vitals",
      "url": "https://web.dev/vitals"
    }
  ],
  "locked": false,
  "starred": true,
  "title": "前端性能优化",
  "updatedAt": "2026-10-14T21:03:55Z"
}
```

- **文件名只是给人看的**（`标题 [短id].json`），身份来自文件内部的 `id`，所以改名、挪位置都不影响。
- 你甚至可以**手写**一个组文件放进去，扩展下次扫描就能读进来；缺 `id` 会自动补。

### 3.2 角色分工

| 位置 | 装什么 | 是否可以删掉 |
|---|---|---|
| **资料库文件夹** | 组、文件夹、快捷列表 —— **真相源** | 不可以（删了就真没了） |
| `chrome.storage.local` | 内容缓存镜像 + **本机设置**（主题/语言/还原行为…） | **可以**，随时能从资料库重建 |
| IndexedDB | 资料库目录的句柄（`FileSystemDirectoryHandle`） | 可以（重新授权即可） |

对应文章的原则：**你创造的东西（标签组）进资料库，App 自己需要的东西（设置、句柄、缓存）留在外面**。

### 3.3 数据流

```
页面 / 后台发起变更
      │
      ▼
mutate()：读缓存 → 深拷贝一份 before → 应用变更 → 写缓存
      │
      ▼
syncLibrary(next, before)：逐文件 diff
      ├─ 内容变了 → 写文件
      └─ 文件没了 → 移进 _trash/      ← 而不是删除
      ▼
OneDrive 客户端负责把这个文件夹同步到其他设备

另一个设备 / Finder 改了文件
      │
      ▼
启动时 scanOnStartup()、回到列表页 silentRescan()、或点「重新扫描」
      ├─ 有 library.json → 用文件内容覆盖状态
      └─ 没有（全新空目录）→ 把当前内容写出去，完成「落户」
```

## 四、关键实现

| 关注点 | 做法 | 代码 |
|---|---|---|
| 文件长什么样 | 纯函数：排序键、ISO 时间、省略默认值、slug 文件名 | `src/core/libraryFormat.ts` |
| 怎么碰磁盘 | 目录句柄、权限校验、扫全库、差异写入、移入回收站 | `src/core/library.ts` |
| 真相 vs 缓存 | 写缓存后差异同步；未连接时只写缓存（本地暂存） | `src/core/storage.ts` |
| 何时写/读 | 变更防抖 1.2s 落盘；启动扫描；列表页静默重扫 | `src/background/librarySync.ts` |
| 多设备冲突 | **不再做 LWW/墓碑合并** —— 文件夹本身就是共享状态；只检测 OneDrive 的「冲突副本」并提示 | `isConflictCopy()` |

**被删除的东西**：`core/merge.ts`、`core/backup.ts`、`background/backupScheduler.ts`，以及数据模型里的 `tombstones` / `revision` / `lastBackupAt`，还有设置里的「变更后自动备份 / 启动时自动合并 / 备份文件名」。

> 保留 `exportImport.ts`：导出/导入仍有价值，但定位从「备份」变成了**与他人和其他工具的互操作**。

## 五、首次使用的迁移

1. 未连接资料库时，扩展照常用 —— 数据写在本机缓存里（界面会提示「尚未连接资料库，数据暂存在本机」）。
2. 在设置页 → 资料库 → 「选择 / 新建资料库」，选一个文件夹（建议 OneDrive 下的空文件夹）。
3. 若选中的是**空目录**：把当前本机内容全部写出去，完成落户。
4. 若选中的是**已有资料库**（里面有 `library.json`）：以文件夹内容为准，读进来。

## 六、边界与后续

- **只有 Chrome / Edge 支持**直接读写文件夹（File System Access API）。Firefox / Safari 上请用「导出 / 导入」。
- **后台无法弹授权框**：请先在设置页完成一次目录授权。
- **授权按会话，绑定不会丢**：Chrome 在「关掉这个来源的最后一批标签页」（重启浏览器就是这种情况）之后会把
  `requestPermission` 的授权退回 `prompt`，但 **IndexedDB 里的目录句柄仍然有效**。
  所以重启后不是「未连接」，而是「需要重新确认一次」：
  - 状态用 `libraryAccessLevel()` 分成 `unsupported / unbound / needs-grant / denied / ok`，**不能再用 `permission === 'granted'` 当唯一口径**；
  - 列表页 `/ 设置页 / 数据弹窗` 给一个「恢复访问」按钮，走 `restoreLibraryAccess()`：复用已有句柄 `requestPermission()`，
    **不弹文件夹选择器**；授权框里选「每次访问都允许」之后就是永久的；
  - 页面加载后的**第一次用户手势**会自动补一次授权（`useLibraryAutoRestore`），用户通常什么都不用做；
  - 授权失效期间写操作会静默失败，改动只停在缓存里 —— 用 `mytab:pendingWrite` 标记（跨页面共享）记账：
    恢复授权时**有欠写就补写，没欠写才按「文件即真相」重读**，避免把另一台设备的改动覆盖掉。
  - 回归验收：`pnpm check:library`（桩住 `indexedDB`，模拟 `permission=prompt` 的真实状态）。
- **冲突副本不自动合并**：OneDrive 生成 `xxx (冲突副本).json` 时会提示你手动处理 —— 这是刻意的，静默合并更危险。
- 每次扫描要把资料库整个读一遍。一个人的标签库（几百到几千组）成本很低；真到扫不动那天，再加一个可随时删除、可从文件重建的索引也不迟 —— 但它只会是**缓存**。
