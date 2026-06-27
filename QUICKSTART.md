# Quick Start Guide

> 📖 **阅读 / Read**: [中文版](QUICKSTART-zh.md) | English (this page)

## 5-Minute Setup

### 1. Install Prerequisites

```bash
# Install age (encryption tool)
brew install age  # macOS
# or: sudo apt install age  # Debian/Ubuntu

# Install git-lfs (for files >50MB)
brew install git-lfs
git lfs install
```

### 2. Install the Plugin

Download `logseq-github-auto-sync-<version>.zip` from the [GitHub releases](https://github.com/kadaliao/logseq-github-auto-sync/releases), then unzip it into Logseq's plugin directory:

```bash
mkdir -p ~/.logseq/plugins
unzip ~/Downloads/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

For local development or manual installation from source:

```bash
mkdir -p ~/.logseq/plugins
git clone git@github.com:kadaliao/logseq-github-auto-sync.git ~/logseq-github-auto-sync
npm --prefix ~/logseq-github-auto-sync run package
unzip ~/logseq-github-auto-sync/release/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

### 3. Setup Encryption Keys

```bash
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync
umask 077

# Generate private key (KEEP THIS SECRET!)
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt

# Generate public recipients file (safe to share)
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

**⚠️ Important**: Backup `identity.txt` to a safe location (password manager, encrypted backup). **Never commit this file to Git.**

### 4. Start the Local Sync Server

```bash
node ~/.logseq/plugins/logseq-github-auto-sync/scripts/sync-server.js
```

Keep this process running while Logseq syncs. If your graph is not the current working directory, set `LOGSEQ_GITHUB_SYNC_GRAPH=/path/to/graph`.

### 5. Restart Logseq

- Close and reopen Logseq
- Go to **Settings → Plugins → GitHub Auto Sync**
- Enable the plugin

### 6. Configure

In the plugin settings:

1. **GitHub repo URL**: `git@github.com:your-username/your-private-logseq.git`
2. **Encrypted tags**: `encrypted, secret` (default)
3. **Age path**: `/opt/homebrew/bin/age` (or `age` if in PATH)
4. **Recipients path**: `~/.config/logseq-github-auto-sync/recipients.txt`
5. **Enable auto-sync**: Optional (default: off)

### 7. First Sync

Click the 🔒 button in the toolbar or run:

```
GitHub Auto Sync: encrypted sync now
```

## Usage

### Manual Sync

Click the 🔒 lock icon in the toolbar, or use Command Palette:

```
GitHub Auto Sync: encrypted sync now
```

### Auto Sync

Enable in settings:
- **Enable timed auto sync**: ✅
- **Sync interval minutes**: `15` (sync every 15 minutes)
- **Sync after plugin starts**: Optional
- **Sync when Logseq closes**: ✅ (recommended)

### Mark Files for Encryption

Add these tags to your notes:

```markdown
tags:: encrypted
```

Or use inline tags:

```markdown
#encrypted
This content will be encrypted in GitHub.
```

### Check Status

```
GitHub Auto Sync: show encryption status
```

Shows:
- Last sync time
- Files that will be encrypted
- Any detected secrets

## Troubleshooting

### "Sync server is not reachable"

The sync server must be running. Start it manually:

```bash
cd ~/logseq-github-auto-sync
node scripts/sync-server.js
```

Or add to your shell profile:

```bash
# ~/.zshrc or ~/.bashrc
alias logseq-sync-server='node ~/logseq-github-auto-sync/scripts/sync-server.js'

# Start in background
logseq-sync-server &
```

### "age encryption failed"

```bash
# Check age is installed
which age

# Verify recipients file
cat ~/.config/logseq-github-auto-sync/recipients.txt

# Check permissions
ls -l ~/.config/logseq-github-auto-sync/
```

### "Remaining likely secrets" error

The secret scanner found high-confidence secrets in untagged files.

**Fix**: Add `tags:: encrypted` to the note, or manually encrypt the file.

If it's a false positive, you can:
1. Tag the file with `encrypted`
2. Move it outside `pages/`, `journals/`, or `assets/`

### Files not syncing

```bash
# Check if server is running
curl http://127.0.0.1:31937/health

# View logs
tail -f ~/logseq-github-auto-sync/server.log
```

### Large files failing to upload

```bash
# Install git-lfs
brew install git-lfs
git lfs install

# In your Logseq graph:
cd ~/logseq-graph
git lfs track "*.bin" "*.zip"  # Add patterns as needed
```

## Advanced Configuration

### Custom Graph Location

By default, the plugin uses the current directory. To use a specific graph:

```bash
# Start server with explicit graph
LOGSEQ_GITHUB_SYNC_GRAPH=~/path/to/graph node ~/logseq-github-auto-sync/scripts/sync-server.js
```

Or set environment variable in shell profile:

```bash
export LOGSEQ_GITHUB_SYNC_GRAPH=~/Documents/LogseqGraph
```

### Custom Port

```bash
LOGSEQ_GITHUB_SYNC_PORT=4096 node ~/logseq-github-auto-sync/scripts/sync-server.js
```

### Multiple Recipients (Team Use)

To encrypt for multiple team members:

1. Collect each member's `recipients.txt` content
2. Create a combined recipients file:

```bash
# ~/.config/logseq-github-auto-sync/recipients-team.txt
cat ~/.config/logseq-github-auto-sync/recipients.txt
cat ~/.config/logseq-github-auto-sync/alice-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients.txt
cat ~/.config/logseq-github-auto-sync/bob-recipients.txt >> ~/.config/logseq-github-auto-sync/recipients.txt
```

3. Set `recipientsPath` in plugin settings to `~/.config/logseq-github-auto-sync/recipients-team.txt`

### Plugin Auto-Start (macOS)

Create `~/Library/LaunchAgents/com.logseq.github-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.logseq.github-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USER/logseq-github-auto-sync/scripts/sync-server.js</string>
    </array>
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

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.logseq.github-sync.plist
```

## Updating

```bash
rm -rf ~/.logseq/plugins/logseq-github-auto-sync
unzip ~/Downloads/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

Restart Logseq to apply updates.

## Getting Help

- 📖 [Full Documentation (EN)](README.md) | [完整文档 (中文)](README-zh.md)
- 🏗️ [Architecture (EN)](ARCHITECTURE.md) | [架构说明 (中文)](ARCHITECTURE-zh.md)
- 🔐 [Encryption & Key Management (EN)](ENCRYPTION-GUIDE.md) | [加密与密钥管理 (中文)](ENCRYPTION-GUIDE-zh.md)
- 🤝 [Contributing (EN)](CONTRIBUTING.md) | [贡献指南 (中文)](CONTRIBUTING-zh.md)
