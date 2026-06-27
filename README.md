# GitHub Auto Sync for Logseq

Encrypt and sync your Logseq graph to GitHub with automatic secret scanning.

> 📖 **阅读 / Read**: [中文版](README-zh.md) | English (this page)

## Features

- 🔒 Encrypts tagged files with **age** before syncing
- 🔍 Scans for secrets (API keys, tokens, passwords) before push
- 📦 Git LFS support for large files
- ⏰ Auto-sync with configurable intervals
- 🛡️ Works with any Logseq graph (no hardcoded paths)

## Quick Start

### 1. Install

```bash
# Install dependencies
brew install age git-lfs  # macOS
# or: sudo apt install age git-lfs  # Linux
```

### 2. Install Plugin

Download `logseq-github-auto-sync-<version>.zip` from the [GitHub releases](https://github.com/kadaliao/logseq-github-auto-sync/releases), unzip it, and place the extracted `logseq-github-auto-sync` folder under `~/.logseq/plugins/`.

For local development or manual installation from source:

```bash
git clone git@github.com:kadaliao/logseq-github-auto-sync.git ~/logseq-github-auto-sync
npm --prefix ~/logseq-github-auto-sync run package
unzip ~/logseq-github-auto-sync/release/logseq-github-auto-sync-*.zip -d ~/.logseq/plugins
```

### 3. Setup Encryption Keys

```bash
# Create key directory
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync
umask 077

# Generate keys (keep identity.txt secret!)
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt

chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

⚠️ **Backup `identity.txt` to a safe location! Never commit it to Git.**

### 4. Start Local Sync Server

```bash
node ~/.logseq/plugins/logseq-github-auto-sync/scripts/sync-server.js
```

Keep the local server running while syncing. Restart Logseq → Settings → Plugins → Enable **GitHub Auto Sync**.

### 5. Configure

- Set **GitHub repo URL** (e.g., `git@github.com:you/private-logseq.git`)
- Verify **Age path** and **Recipients path**

## Usage

### Mark Files for Encryption

Add tags to your notes:

```markdown
tags:: encrypted
```

Or inline: `#encrypted`

### Sync

Click 🔒 in the toolbar or use Command Palette:

```
GitHub Auto Sync: encrypted sync now
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `repoUrl` | (required) | GitHub repository URL |
| `encryptedTags` | `encrypted, secret` | Tags that trigger encryption |
| `agePath` | `/opt/homebrew/bin/age` | Path to age binary |
| `recipientsPath` | `~/.config/logseq-github-auto-sync/recipients.txt` | Public key file |
| `autoSync` | `false` | Enable timed auto-sync |
| `syncIntervalMinutes` | `15` | Sync interval (min: 1) |
| `lfsThresholdMb` | `50` | Files ≥ this size use Git LFS |

## Secret Detection

Blocks sync if high-confidence secrets are found in unencrypted files:

- Private keys (RSA, SSH, etc.)
- AWS access keys
- GitHub tokens
- OpenAI API keys
- Slack tokens
- Generic `api_key`, `secret`, `password` patterns (16+ chars)

## Requirements

- **Logseq** 0.8.0+
- **Node.js** 18+ (for helper scripts)
- **age** 1.0+ (encryption)
- **git** 2.30+
- **git-lfs** (optional, for large files)
- **rsync** (fast file copying)

## Troubleshooting

### "Sync server is not reachable"
```bash
node ~/logseq-github-auto-sync/scripts/sync-server.js
```

### "Remaining likely secrets"
Tag the file with `tags:: encrypted` or manually encrypt it.

### Large files not uploading
```bash
brew install git-lfs
git lfs install
```

## Docs

- 📖 [Full Documentation (EN)](QUICKSTART.md) | [完整文档 (中文)](QUICKSTART-zh.md)
- 🏗️ [Architecture (EN)](ARCHITECTURE.md) | [架构说明 (中文)](ARCHITECTURE-zh.md)
- 🔐 [Encryption & Key Management (EN)](ENCRYPTION-GUIDE.md) | [加密与密钥管理 (中文)](ENCRYPTION-GUIDE-zh.md)
- 🤝 [Contributing (EN)](CONTRIBUTING.md) | [贡献指南 (中文)](CONTRIBUTING-zh.md)

## License

MIT
