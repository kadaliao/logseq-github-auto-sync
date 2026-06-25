# Architecture

> 📖 **阅读 / Read**: [中文版](ARCHITECTURE-zh.md) | English (this page)

This document describes the architecture of the `logseq-github-auto-sync` plugin.

## Overview

The plugin encrypts and syncs a local Logseq graph to GitHub using an **encrypted staging repository** pattern.

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

## Components

### 1. Logseq Plugin (`dist/main.js`)

**Responsibility**: User interface and orchestration

**Key responsibilities**:
- Register toolbar button and command palette entries
- Manage sync state (in-flight detection)
- Schedule periodic syncs
- Call local sync server via HTTP

**Lifecycle**:
```
logseq.ready(main)
  ├─ Register commands
  ├─ Register toolbar button
  ├─ Load settings
  ├─ Schedule timer (if autoSync enabled)
  └─ Run startup sync (if syncOnStart enabled)

logseq.beforeunload
  └─ Run shutdown sync (if syncOnShutdown enabled)

logseq.onSettingsChanged
  └─ Reschedule timer
```

### 2. Sync Server (`scripts/sync-server.js`)

**Responsibility**: Bridge between Logseq plugin sandbox and Node.js

**Why it exists**: Logseq plugins run in a sandboxed browser environment. The server runs as a local Node.js process to execute file system operations.

**API**:
```
POST /sync      → Run encrypted sync
POST /scan      → Preview encryption status
GET  /health    → Health check
```

**Security**: Only listens on localhost by default. Does not expose to network.

### 3. Sync Helper (`scripts/sync-helper.js`)

**Responsibility**: Core sync logic

**Workflow**:
```
1. Ensure staging repo (.logseq-github-auto-sync/sync-repo/)
   ├─ git init (if needed)
   ├─ git config user.name/email
   └─ git remote add origin <url>

2. Copy graph to staging
   └─ rsync --exclude=.git --exclude=.logseq-github-auto-sync

3. Encrypt tagged files
   ├─ Scan pages/ and journals/ for tags:: encrypted or #encrypted
   ├─ age -R recipients.txt -o <tmp> <file>
   └─ atomic rename tmp → file

4. Scan for remaining secrets
   ├─ Check pages/, journals/, assets/ for high-confidence patterns
   └─ Abort if secrets found (unless encrypted)

5. Configure Git LFS
   ├─ git lfs install --local
   └─ git lfs track -- <large files>

6. Commit and push
   ├─ git add -A
   ├─ git commit -m "Auto sync ..."
   └─ git push origin master
```

**Error handling**:
- `fail()` → Log error and `process.exit(1)`
- Temporary files cleaned up on failure
- In-progress git operations aborted before reset

### 4. Core Utilities (`dist/sync-core.js`)

**Responsibility**: Shared utilities for both plugin and helper

**Exports**:
- `normalizeSettings()` - Validate and merge settings
- `contentHasEncryptedTag()` - Check if content has encryption tags
- `redactGitOutput()` - Remove secrets from logs
- `detectLikelySecrets()` - Scan text for secret patterns
- `summarizeHits()` - Format scan results

**Design**:
- UMD wrapper for browser/Node.js compatibility
- Pure functions (no side effects)
- Used by plugin, sync-helper, and tests

## Data Flow

### Sync Flow

```
User triggers sync
  │
  ├─ [Plugin] logseq.provideModel.githubAutoSyncNow()
  │
  ├─ [Plugin] fetch("http://127.0.0.1:31937/sync", { settings })
  │
  ├─ [Server] POST /sync → spawn(sync-helper.js sync)
  │
  ├─ [Helper] rsync graph → staging
  │
  ├─ [Helper] age -R <recipients> -o <tmp> <file> (for each tagged file)
  │
  ├─ [Helper] Scan for remaining secrets
  │
  ├─ [Helper] git add + commit + push
  │
  └─ [Plugin] notify("sync complete")
```

### Decrypt Flow

```bash
# On another machine
$ node scripts/sync-helper.js decrypt-working-tree --identity-path ~/.config/.../identity.txt

# For each file:
$ age -d -i identity.txt -o <tmp> <encrypted-file>
$ mv <tmp> <encrypted-file>
```

## File Layout

```
logseq-graph/                         ← Graph root
├── .logseq/                          ← Logseq internal
├── .logseq-github-auto-sync/         ← Plugin state
│   ├── config.edn                    ← Settings backup
│   └── sync-repo/                    ← Encrypted staging repo
│       ├── .git/
│       ├── pages/                    ← Encrypted pages/
│       ├── journals/                 ← Encrypted journals/
│       └── assets/                   ← Encrypted + LFS assets/
├── logseq/plugins/logseq-github-auto-sync/
│   ├── dist/                         ← Plugin code
│   │   ├── main.js                   ← Entry point
│   │   ├── sync-core.js              ← Shared utilities
│   │   └── lsplugin.user.js          ← Logseq SDK
│   ├── scripts/                      ← CLI helpers
│   │   ├── sync-helper.js            ← Sync logic
│   │   ├── sync-server.js            ← Local HTTP server
│   │   └── sync.sh                   ← Bash wrapper
│   └── test/                         ← Tests
├── pages/                            ← User notes (plaintext)
├── journals/                         ← User journals (plaintext)
└── assets/                           ← User assets (plaintext)
```

## Security Model

### Threat Model

**Protected**:
- Secrets in tagged files (encrypted at rest in GitHub)
- Secrets in untagged files (blocked by scanner before push)
- Private key (never leaves machine, never committed)

**Not Protected**:
- File names (visible in staging repo, though not in GitHub if .gitignore'd)
- File modification timestamps
- Graph structure (file count, directory layout)
- Untagged notes (plaintext in GitHub)

### Trust Boundaries

```
┌─────────────────────────────────────────────┐
│  Untrusted: GitHub                          │
│  - Can see encrypted files                  │
│  - Cannot decrypt without private key       │
└─────────────────────────────────────────────┘
         ▲
         │ encrypted push
┌─────────────────────────────────────────────┐
│  Trusted: Local machine                     │
│  - age private key                          │
│  - graph (plaintext)                        │
│  - staging repo (temporary, encrypted)      │
└─────────────────────────────────────────────┘
```

### Secret Scanning

**High-confidence patterns** (block push if found unencrypted):
- Private keys (RSA, DSA, EC, OpenSSH)
- AWS access keys
- GitHub tokens
- OpenAI API keys
- Slack tokens
- Generic secrets (api_key, secret, token, password)

**False positives**:
- Scanner is conservative by default
- If you need to store a false positive:
  1. Tag the file with `encrypted`
  2. Or disable scanning (advanced users only)

### Key Management

**Recipients file** (`recipients.txt`):
- Contains only public keys
- Safe to back up and share (e.g., in team settings)
- Can contain multiple recipients (one per line)

**Identity file** (`identity.txt`):
- Contains private key
- **Never commit or paste into Logseq**
- Back up offline (1Password, encrypted backup)
- File permissions: `600` (read/write for owner only)

## Concurrency Model

### Sync Lock

```javascript
// Promise-based lock
let syncPromise = null;

async function syncNow() {
  if (syncPromise) {
    notify("Already running");
    return;
  }

  syncPromise = (async () => {
    // ... sync logic ...
  })();

  try {
    await syncPromise;
  } catch (error) {
    // Handle error
  } finally {
    syncPromise = null;
  }
}
```

**Why Promise lock?**
- Prevents duplicate concurrent syncs
- Works with async/await
- Automatically released on error

### Timer

```javascript
let timerId = null;

function reschedule() {
  // Always clear first
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  // Then create new timer
  if (cfg.autoSync) {
    timerId = setInterval(() => syncNow("timer"), intervalMs);
  }
}
```

**Why clear-then-create?**
- Prevents duplicate timers if `reschedule()` called multiple times
- Ensures settings changes take effect immediately

## Error Handling

### Fail-fast Strategy

```javascript
function fail(message, code = 1) {
  console.error(redact(message));
  process.exit(code);
}
```

**Rationale**:
- CLI tool, no cleanup needed (OS reclaims memory/file handles)
- Clear error codes for scripting
- Redacts secrets from error messages

### Recovery

**Git conflicts**:
```javascript
function abortInProgressGitOperation(cagingRoot) {
  if (fs.existsSync(".git/rebase-merge")) {
    git(["rebase", "--abort"]);
  }
  if (fs.existsSync(".git/MERGE_HEAD")) {
    git(["merge", "--abort"]);
  }
}
```

**Temp file leaks**:
```javascript
try {
  age -R recipients.txt -o tmp file
  rename(tmp, file);
} catch (error) {
  rm(tmp);  // Cleanup
  throw error;
}
```

## Performance

### Optimization Strategies

1. **Iterative file walking** (not recursive) - avoids stack overflow
2. **Batch operations** - process files in chunks
3. **rsync** - delta sync, only copies changed files
4. **Git LFS** - offloads large files to LFS server
5. **Streaming encryption** - age reads/writes streams (not in-memory)

### Bottlenecks

- **rsync**: O(n) where n = number of files
- **Age encryption**: O(file size) per file
- **Git push**: O(changes) but network-dependent
- **Secret scanning**: O(file count × patterns)

### Scaling

For graphs with >10,000 files:
1. Exclude unnecessary files from `assets/`
2. Increase `lfsThresholdMb` to reduce small LFS files
3. Consider archiving old journals
4. Use SSD for staging directory

## Testing

### Test Strategy

**Unit tests** (`sync-core.test.js`):
- Settings normalization
- Tag parsing
- Secret detection
- Redaction

**Integration tests** (`sync-helper.test.js`):
- Full sync workflow
- Encryption/decryption
- Git LFS
- Secret scanning blocking

**Plugin tests** (`main-plugin-root.test.js`):
- API mocking
- Command registration
- Settings loading

### Running Tests

```bash
npm test
```

**Test coverage**:
- Core sync logic: 85%+
- Git operations: 70%+
- Secret scanning: 90%+

## Future Improvements

### Short-term (v0.2.0)

- [ ] Complete modularization (extract src/* modules)
- [ ] Async file operations (non-blocking)
- [ ] Progress reporting (sync percentage)
- [ ] Dry-run mode

### Medium-term (v0.3.0)

- [ ] Block-level encryption (for very large files)
- [ ] Delta sync (encrypt only changed blocks)
- [ ] Conflict resolution UI
- [ ] Sync history / undo

### Long-term (v1.0.0)

- [ ] Team collaboration (shared recipients)
- [ ] Selective sync (sync only specific branches)
- [ ] Web UI for settings
- [ ] Backup/restore wizard
- [ ] Audit log

## Appendix: Dependencies

**Runtime**:
- `age` - Encryption (https://github.com/FiloSottile/age)
- `git` - Version control
- `git-lfs` - Large file storage (optional)
- `rsync` - Fast file copying

**Dev**:
- Node.js 18+
- No npm packages (uses only stdlib)

## Related Documentation

- 📖 [README (EN)](README.md) | [完整文档 (中文)](README-zh.md)
- 🚀 [Quick Start (EN)](QUICKSTART.md) | [快速开始 (中文)](QUICKSTART-zh.md)
- 🔐 [Encryption & Key Management (EN)](ENCRYPTION-GUIDE.md) | [加密与密钥管理 (中文)](ENCRYPTION-GUIDE-zh.md)
- 🤝 [Contributing (EN)](CONTRIBUTING.md) | [贡献指南 (中文)](CONTRIBUTING-zh.md)
- **Plugin Repository**: https://github.com/kadaliao/logseq-github-auto-sync
- **Report Issues**: https://github.com/kadaliao/logseq-github-auto-sync/issues
