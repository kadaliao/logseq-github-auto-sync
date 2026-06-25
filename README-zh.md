# GitHub Auto Sync for Logseq

为 Logseq 提供加密 GitHub 同步功能，自动扫描敏感信息。

> 📖 **阅读**: [English](README.md) | [中文](README-zh.md)

## 功能特性

- 🔒 使用 **age** 加密标记文件后同步到 GitHub
- 🔍 推送前扫描敏感信息（API 密钥、令牌、密码）
- 📦 支持 Git LFS（大文件）
- ⏰ 可配置间隔的自动同步
- 🛡️ 无硬编码路径，适用于任意 Logseq 图库

## 快速开始

### 1. 安装依赖

```bash
# 安装 age 和 git-lfs
brew install age git-lfs  # macOS
# 或: sudo apt install age git-lfs  # Linux
```

### 2. 克隆插件

```bash
git clone git@github.com:kadaliao/logseq-github-auto-sync.git ~/logseq-github-auto-sync
```

### 3. 生成加密密钥

```bash
# 创建密钥目录
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync
umask 077

# 生成私钥（保存在 identity.txt）
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt

# 生成公钥（保存在 recipients.txt）
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

# 设置权限
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

⚠️ **务必备份 `identity.txt`！切勿提交到 Git。**

### 4. 安装到 Logseq

```bash
# macOS/Linux
mkdir -p ~/.logseq/plugins
cp -r ~/logseq-github-auto-sync/dist ~/.logseq/plugins/logseq-github-auto-sync
cp ~/logseq-github-auto-sync/icon.svg ~/.logseq/plugins/logseq-github-auto-sync/
cp ~/logseq-github-auto-sync/package.json ~/.logseq/plugins/logseq-github-auto-sync/
```

重启 Logseq → 设置 → 插件 → 启用 **GitHub Auto Sync**

### 5. 配置插件

- 设置 **GitHub 仓库 URL**（例如 `git@github.com:you/private-logseq.git`）
- 验证 **Age 路径** 和 **Recipients 路径**

## 使用方法

### 标记文件进行加密

在笔记中添加标签：

```markdown
tags:: encrypted
```

或行内标签：`#encrypted`

### 同步

点击工具栏中的 🔒 图标，或使用命令面板：

```
GitHub Auto Sync: encrypted sync now
```

## 插件设置

| 设置项 | 默认值 | 说明 |
|---------|--------|------|
| `repoUrl` | (必填) | GitHub 仓库 URL |
| `encryptedTags` | `encrypted, secret` | 触发加密的标签 |
| `agePath` | `/opt/homebrew/bin/age` | age 二进制文件路径 |
| `recipientsPath` | `~/.config/logseq-github-auto-sync/recipients.txt` | 公钥文件路径 |
| `autoSync` | `false` | 启用定时自动同步 |
| `syncIntervalMinutes` | `15` | 同步间隔（分钟，最小 1） |
| `lfsThresholdMb` | `50` | 大于此大小的文件使用 Git LFS |

## 敏感信息检测

如果未加密文件中发现高置信度敏感信息，将阻止同步：

- 私钥（RSA、SSH 等）
- AWS 访问密钥
- GitHub 令牌
- OpenAI API 密钥
- Slack 令牌
- 通用 `api_key`、`secret`、`password` 模式（16+ 字符）

## 系统要求

- **Logseq** 0.8.0+
- **Node.js** 18+（用于运行辅助脚本）
- **age** 1.0+（加密工具）
- **git** 2.30+
- **git-lfs**（可选，用于大文件）
- **rsync**（快速文件复制）

## 故障排查

### "同步服务器无法连接"

```bash
node ~/logseq-github-auto-sync/scripts/sync-server.js
```

### "发现未加密的敏感信息"

使用 `tags:: encrypted` 标记文件，或手动加密该文件。

### 大文件无法上传

```bash
brew install git-lfs
git lfs install
```

## 相关文档

- [完整文档](QUICKSTART.md) / [完整文档 (EN)](QUICKSTART.md)
- [架构说明](ARCHITECTURE.md) / [架构说明 (EN)](ARCHITECTURE.md)
- [贡献指南](CONTRIBUTING.md) / [贡献指南 (EN)](CONTRIBUTING.md)
- [加密与密钥管理](ENCRYPTION-GUIDE.md) / [Encryption & Key Management](ENCRYPTION-GUIDE.md)

## 许可证

MIT
