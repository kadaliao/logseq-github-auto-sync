# 快速开始指南

> 📖 **阅读**: [English](QUICKSTART.md) | [中文](QUICKSTART-zh.md)

## 5 分钟快速设置

### 1. 安装依赖

```bash
# 安装 age（加密工具）
brew install age  # macOS
# 或: sudo apt install age  # Debian/Ubuntu

# 安装 git-lfs（用于 >50MB 的文件）
brew install git-lfs
git lfs install
```

### 2. 安装插件

从 [GitHub releases](https://github.com/kadaliao/logseq-github-auto-sync/releases) 下载 `logseq-github-auto-sync-<version>.zip`，然后解压到 Logseq 插件目录：

```bash
mkdir -p ~/.logseq/plugins
unzip ~/Downloads/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

如果要从源码本地安装：

```bash
mkdir -p ~/.logseq/plugins
git clone git@github.com:kadaliao/logseq-github-auto-sync.git ~/logseq-github-auto-sync
npm --prefix ~/logseq-github-auto-sync run package
unzip ~/logseq-github-auto-sync/release/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

### 3. 设置加密密钥

```bash
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync
umask 077

# 生成私钥（务必保密！）
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt

# 生成公钥（可以分享）
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

**⚠️ 重要**：务必备份 `identity.txt` 到安全位置（密码管理器、加密备份）。**切勿将此文件提交到 Git。**

### 4. 启动本地同步服务

```bash
node ~/.logseq/plugins/logseq-github-auto-sync/scripts/sync-server.js
```

同步时保持这个进程运行。如果图库不是当前工作目录，请设置 `LOGSEQ_GITHUB_SYNC_GRAPH=/path/to/graph`。

### 5. 重启 Logseq

- 关闭并重新打开 Logseq
- 进入 **设置 → 插件 → GitHub Auto Sync**
- 启用插件

### 6. 配置插件

在插件设置中：

1. **GitHub 仓库 URL**：`git@github.com:your-username/your-private-logseq.git`
2. **加密标签**：`encrypted, secret`（默认）
3. **Age 路径**：`age`（如果 age 不在 PATH 中，也可以填绝对路径）
4. **Recipients 路径**：`~/.config/logseq-github-auto-sync/recipients.txt`
5. **启用自动同步**：可选（默认：关闭）

### 7. 首次同步

点击工具栏中的 🔒 按钮，或运行：

```
GitHub Auto Sync: encrypted sync now
```

## 使用方法

### 手动同步

点击工具栏中的 🔒 锁图标，或使用命令面板：

```
GitHub Auto Sync: encrypted sync now
```

同步会立刻显示开始提示。默认完成弹窗保持简短；需要排查时，在设置中打开 **Show detailed sync logs**，弹窗会显示命令输出。

### 自动同步

在设置中启用：
- **启用定时自动同步**：✅
- **同步间隔（分钟）**：`15`（每 15 分钟同步一次）
- **插件启动后同步**：可选
- **Logseq 关闭时同步**：✅（推荐）

### 标记文件进行加密

在笔记中添加标签：

```markdown
tags:: encrypted
```

或使用行内标签：

```markdown
#encrypted
此内容将在 GitHub 上加密。
```

加密文件会保存为 ASCII armored age 文本，GitHub 可以把密文按文本显示。

### 查看状态

```
GitHub Auto Sync: show encryption status
```

显示内容：
- 上次同步时间
- 将要加密的文件列表
- 检测到的敏感信息

### 查看最近同步日志

```
GitHub Auto Sync: show last sync log
```

显示最近一次同步结果和已脱敏的 helper 输出。

## 故障排查

### "同步服务器无法连接"

同步服务器必须正在运行。手动启动：

```bash
cd ~/logseq-github-auto-sync
node scripts/sync-server.js
```

或添加到 shell 配置文件中：

```bash
# ~/.zshrc 或 ~/.bashrc
alias logseq-sync-server='node ~/logseq-github-auto-sync/scripts/sync-server.js'

# 后台启动
logseq-sync-server &
```

### "age 加密失败"

```bash
# 检查 age 是否已安装
which age

# 验证 recipients 文件
cat ~/.config/logseq-github-auto-sync/recipients.txt

# 检查文件权限
ls -l ~/.config/logseq-github-auto-sync/
```

### "发现未加密的敏感信息" 错误

敏感信息扫描器在未标记的文件中发现了高置信度敏感信息。

**解决方法**：使用 `tags:: encrypted` 标记文件，或手动加密该文件。

如果误报：
1. 使用 `encrypted` 标签标记文件
2. 将文件移到 `pages/`、`journals/` 或 `assets/` 之外

### 文件未同步

```bash
# 检查服务器是否运行
curl http://127.0.0.1:31937/health

# 查看日志
tail -f ~/logseq-github-auto-sync/server.log
```

### 大文件上传失败

```bash
# 安装 git-lfs
brew install git-lfs
git lfs install

# 在你的 Logseq 图库中：
cd ~/logseq-graph
git lfs track "*.bin" "*.zip"  # 按需添加模式
```

## 高级配置

### 自定义图库位置

默认情况下，插件使用当前目录。要使用特定图库：

```bash
# 使用明确的图库路径启动服务器
LOGSEQ_GITHUB_SYNC_GRAPH=~/path/to/graph node ~/logseq-github-auto-sync/scripts/sync-server.js
```

或在 shell 配置文件中设置环境变量：

```bash
export LOGSEQ_GITHUB_SYNC_GRAPH=~/Documents/LogseqGraph
```

### 自定义端口

```bash
LOGSEQ_GITHUB_SYNC_PORT=4096 node ~/logseq-github-auto-sync/scripts/sync-server.js
```

### 多个接收者（团队使用）

要为多个团队成员加密：

1. 收集每个成员的 `recipients.txt` 内容
2. 创建合并的 recipients 文件：

```bash
# ~/.config/logseq-github-auto-sync/recipients-team.txt
cat ~/.config/logseq-github-auto-sync/recipients.txt
cat ~/.config/logseq-github-auto-sync/alice-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients.txt
cat ~/.config/logseq-github-auto-sync/bob-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients.txt
```

3. 在插件设置中将 `recipientsPath` 设置为 `~/.config/logseq-github-auto-sync/recipients-team.txt`

### 插件自动启动（macOS）

创建 `~/Library/LaunchAgents/com.logseq.github-sync.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.logseq.github-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-lc</string>
        <string>exec node "$HOME/.logseq/plugins/logseq-github-auto-sync/scripts/sync-server.js"</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>LOGSEQ_GITHUB_SYNC_GRAPH</key>
        <string>~/logseq-graph</string>
        <key>LOGSEQ_GITHUB_SYNC_PORT</key>
        <string>31937</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/logseq-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/logseq-sync.log</string>
</dict>
</plist>
```

加载它：

```bash
launchctl load ~/Library/LaunchAgents/com.logseq.github-sync.plist
```

如果你的 graph 不在 `~/logseq-graph`，把 `LOGSEQ_GITHUB_SYNC_GRAPH` 改成自己的 graph 路径。

## 更新插件

```bash
rm -rf ~/.logseq/plugins/logseq-github-auto-sync
unzip ~/Downloads/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

重启 Logseq 以应用更新。

## 获取帮助

- 📖 [完整文档](README.md) / [完整文档 (EN)](README.md)
- 🏗️ [架构说明](ARCHITECTURE.md) / [架构说明 (EN)](ARCHITECTURE.md)
- 🐛 [报告问题](https://github.com/kadaliao/logseq-github-auto-sync/issues)
- 💬 [讨论区](https://github.com/kadaliao/logseq-github-auto-sync/discussions)
- 🔐 [加密与密钥管理](ENCRYPTION-GUIDE.md) / [Encryption & Key Management](ENCRYPTION-GUIDE.md)

## 许可证

MIT
