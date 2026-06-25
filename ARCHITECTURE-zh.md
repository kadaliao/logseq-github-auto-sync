# 架构说明

> 📖 **阅读**: [English](ARCHITECTURE.md) | [中文](ARCHITECTURE-zh.md)

本文档描述了 `logseq-github-auto-sync` 插件的架构设计。

## 概述

该插件使用**加密暂存仓库**模式，将本地 Logseq 图库加密并同步到 GitHub。

```
┌─────────────┐      ┌─────────────────────┐      ┌─────────────┐
│   Logseq    │─────▶│  Local Sync Server   │─────▶│   GitHub    │
│   (Plugin)  │ fetch│   (sync-server.js)   │ spawn│  (encrypted)│
└─────────────┘      └─────────────────────┘      └─────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Sync Helper          │
                  │  (sync-helper.js)     │
                  └──────────────────────┘
```

## 组件

### 1. Logseq 插件 (`dist/main.js`)

**职责**：用户界面和编排

**主要职责**：
- 注册工具栏按钮和命令面板条目
- 管理同步状态（防止重复同步）
- 调度定期同步
- 通过 HTTP 调用本地同步服务器

**生命周期**：
```
logseq.ready(main)
  ├─ 注册命令
  ├─ 注册工具栏按钮
  ├─ 加载设置
  ├─ 调度定时器（如果启用 autoSync）
  └─ 运行启动同步（如果启用 syncOnStart）

logseq.beforeunload
  └─ 运行关闭同步（如果启用 syncOnShutdown）

logseq.onSettingsChanged
  └─ 重新调度定时器
```

### 2. 同步服务器 (`scripts/sync-server.js`)

**职责**：在 Logseq 插件沙箱和 Node.js 之间架起桥梁

**存在原因**：Logseq 插件在沙箱化的浏览器环境中运行。服务器作为本地 Node.js 进程运行，以执行文件系统操作。

**API**：
```
POST /sync      → 运行加密同步
POST /scan      → 预览加密状态
GET  /health    → 健康检查
```

**安全性**：默认仅监听 localhost。不会暴露到网络。

### 3. 同步辅助工具 (`scripts/sync-helper.js`)

**职责**：核心同步逻辑

**工作流程**：
```
1. 确保暂存仓库存在 (.logseq-github-auto-sync/sync-repo/)
   ├─ git init（如需要）
   ├─ git config user.name/email
   └─ git remote add origin <url>

2. 复制图库到暂存区
   └─ rsync --exclude=.git --exclude=.logseq-github-auto-sync

3. 加密标记的文件
   ├─ 扫描 pages/ 和 journals/ 中的 tags:: encrypted 或 #encrypted
   ├─ age -R recipients.txt -o <tmp> <file>
   └─ 原子重命名 tmp → file

4. 扫描剩余敏感信息
   ├─ 检查 pages/、journals/、assets/ 中的高置信度模式
   └─ 如果发现敏感信息则中止（除非已加密）

5. 配置 Git LFS
   ├─ git lfs install --local
   └─ git lfs track -- <大文件>

6. 提交并推送
   ├─ git add -A
   ├─ git commit -m "Auto sync ..."
   └─ git push origin master
```

**错误处理**：
- `fail()` → 记录错误并 `process.exit(1)`
- 失败时清理临时文件
- 重置前中止正在进行的 git 操作

### 4. 核心工具库 (`dist/sync-core.js`)

**职责**：插件和辅助工具共享的工具函数

**导出**：
- `normalizeSettings()` - 验证并合并设置
- `contentHasEncryptedTag()` - 检查内容是否有加密标签
- `redactGitOutput()` - 从日志中删除敏感信息
- `detectLikelySecrets()` - 扫描文本中的敏感信息模式
- `summarizeHits()` - 格式化扫描结果

**设计**：
- UMD 包装器，支持浏览器/Node.js 兼容
- 纯函数（无副作用）
- 被插件、sync-helper 和测试使用

## 数据流

### 同步流程

```
用户触发同步
  │
  ├─ [插件] logseq.provideModel.githubAutoSyncNow()
  │
  ├─ [插件] fetch("http://127.0.0.1:31937/sync", { settings })
  │
  ├─ [服务器] POST /sync → spawn(sync-helper.js sync)
  │
  ├─ [辅助工具] rsync graph → staging
  │
  ├─ [辅助工具] age -R <recipients> -o <tmp> <file>（每个标记文件）
  │
  ├─ [辅助工具] 扫描剩余敏感信息
  │
  ├─ [辅助工具] git add + commit + push
  │
  └─ [插件] notify("sync complete")
```

### 解密流程

```bash
# 在另一台机器上
$ node scripts/sync-helper.js decrypt-working-tree --identity-path ~/.config/.../identity.txt

# 对于每个文件：
$ age -d -i identity.txt -o <tmp> <encrypted-file>
$ mv <tmp> <encrypted-file>
```

## 文件布局

```
logseq-graph/                         ← 图库根目录
├── .logseq/                          ← Logseq 内部
├── .logseq-github-auto-sync/         ← 插件状态
│   ├── config.edn                    ← 设置备份
│   └── sync-repo/                    ← 加密暂存仓库
│       ├── .git/
│       ├── pages/                    ← 加密的 pages/
│       ├── journals/                 ← 加密的 journals/
│       └── assets/                   ← 加密 + LFS 资产/
├── logseq/plugins/logseq-github-auto-sync/
│   ├── dist/                         ← 插件代码
│   │   ├── main.js                   ← 入口点
│   │   ├── sync-core.js              ← 共享工具
│   │   └── lsplugin.user.js          ← Logseq SDK
│   ├── scripts/                      ← CLI 辅助工具
│   │   ├── sync-helper.js            ← 同步逻辑
│   │   ├── sync-server.js            ← 本地 HTTP 服务器
│   │   └── sync.sh                   ← Bash 包装器
│   └── test/                         ← 测试套件
├── pages/                            ← 用户笔记（明文）
├── journals/                         ← 用户日记（明文）
└── assets/                           ← 用户附件（明文）
```

## 安全模型

### 威胁模型

**受保护**：
- 标记文件中的敏感信息（在 GitHub 中加密存储）
- 未标记文件中的敏感信息（推送前被扫描器阻止）
- 私钥（永不离开机器，永不提交）

**未受保护**：
- 文件名（在暂存仓库中可见，如果在 .gitignore 中则不在 GitHub 中）
- 文件修改时间戳
- 图库结构（文件数、目录布局）
- 未标记笔记（在 GitHub 中为明文）

### 信任边界

```
┌─────────────────────────────────────────────┐
│  不可信: GitHub                             │
│  - 可以看到加密文件                          │
│  - 没有私钥无法解密                          │
└─────────────────────────────────────────────┘
         ▲
         │ encrypted push
┌─────────────────────────────────────────────┐
│  可信: 本地机器                             │
│  - age 私钥                                  │
│  - 图库（明文）                              │
│  - 暂存仓库（临时，加密）                    │
└─────────────────────────────────────────────┘
```

### 敏感信息扫描

**高置信度模式**（如果未加密则阻止推送）：
- 私钥（RSA、DSA、EC、OpenSSH）
- AWS 访问密钥
- GitHub 令牌
- OpenAI API 密钥
- Slack 令牌
- 通用敏感信息（api_key、secret、token、password）

### 密钥管理

**Recipients 文件**（`recipients.txt`）：
- 仅包含公钥
- 安全备份和分享（例如在团队设置中）
- 可包含多个接收者（每行一个）

**Identity 文件**（`identity.txt`）：
- 包含私钥
- **绝不提交或粘贴到 Logseq**
- 离线备份（1Password、加密备份）
- 文件权限：`600`（仅所有者可读写）

## 并发模型

### 同步锁

```javascript
// 基于 Promise 的锁
let syncPromise = null;

async function syncNow() {
  if (syncPromise) {
    notify("Already running");
    return;
  }

  syncPromise = (async () => {
    // ... 同步逻辑 ...
  })();

  try {
    await syncPromise;
  } catch (error) {
    // 处理错误
  } finally {
    syncPromise = null;
  }
}
```

**为什么用 Promise 锁？**
- 防止重复并发同步
- 支持 async/await
- 出错时自动释放

### 定时器

```javascript
let timerId = null;

function reschedule() {
  // 先清除旧定时器
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  // 再创建新定时器
  if (cfg.autoSync) {
    timerId = setInterval(() => syncNow("timer"), intervalMs);
  }
}
```

**为什么 clear-then-create？**
- 防止 `reschedule()` 被多次调用时产生重复定时器
- 确保设置更改立即生效

## 性能

### 优化策略

1. **迭代文件遍历**（非递归）- 避免栈溢出
2. **批量操作** - 分批处理文件
3. **rsync** - 增量同步，仅复制更改的文件
4. **Git LFS** - 将大文件卸载到 LFS 服务器
5. **流式加密** - age 读/写流（非内存中）

### 瓶颈

- **rsync**：O(n)，n = 文件数
- **Age 加密**：每个文件 O(文件大小)
- **Git push**：O(更改数)，但依赖网络
- **敏感信息扫描**：O(文件数 × 模式数)

### 扩展性

对于 >10,000 个文件的图库：
1. 从 `assets/` 中排除不必要的文件
2. 增加 `lfsThresholdMb` 以减少小 LFS 文件
3. 考虑归档旧日记
4. 对暂存目录使用 SSD

## 测试

### 测试策略

**单元测试**（`sync-core.test.js`）：
- 设置规范化
- 标签解析
- 敏感信息检测
- 脱敏

**集成测试**（`sync-helper.test.js`）：
- 完整同步工作流
- 加密/解密
- Git LFS
- 敏感信息扫描阻止

**插件测试**（`main-plugin-root.test.js`）：
- API 模拟
- 命令注册
- 设置加载

## 未来改进

### 短期（v0.2.0）

- [ ] 完成模块化（提取 src/* 模块）
- [ ] 异步文件操作（非阻塞）
- [ ] 进度报告（同步百分比）
- [ ] 演练模式

### 中期（v0.3.0）

- [ ] 块级加密（用于非常大的文件）
- [ ] 增量同步（仅加密更改的块）
- [ ] 冲突解决 UI
- [ ] 同步历史 / 撤销

### 长期（v1.0.0）

- [ ] 团队协作（共享接收者）
- [ ] 选择性同步（仅同步特定分支）
- [ ] Web UI 设置
- [ ] 备份/恢复向导
- [ ] 审计日志

## 附录：依赖项

**运行时**：
- `age` - 加密（https://github.com/FiloSottile/age）
- `git` - 版本控制
- `git-lfs` - 大文件存储（可选）
- `rsync` - 快速文件复制

**开发**：
- Node.js 18+
- 无 npm 包（仅使用标准库）
