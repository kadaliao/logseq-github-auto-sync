# GitHub Auto Sync for Logseq

A local Logseq plugin that syncs this graph to GitHub through an encrypted staging repository. Local Logseq files stay plaintext and editable. Files tagged with configured encryption tags are copied to the staging repo as **age ciphertext** before Git commit/push.

## Architecture

```
┌─────────────┐
│   Logseq    │
│   (Plugin)  │
└──────┬──────┘
       │ fetch("/sync")
       ▼
┌─────────────────────┐
│  Local Sync Server  │  ←─ Port 31937 (localhost only)
│   (sync-server.js)  │
└──────┬──────────────┘
       │ spawn
       ▼
┌──────────────────────────────────┐
│  Encrypted Staging Repo          │
│  (.logseq-github-auto-sync/)     │
│                                  │
│  1. rsync graph → staging        │
│  2. encrypt tagged files (age)   │
│  3. scan for remaining secrets   │
│  4. git add + commit + push      │
└──────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   GitHub    │
│  (encrypted)│
└─────────────┘
```

### Sync Flow

1. **rsync** copies the graph to `.logseq-github-auto-sync/sync-repo/`
2. **age** encrypts files with `tags:: encrypted` or `#encrypted`
3. **Secret scanner** checks for remaining unencrypted secrets
4. **Git** commits and pushes to remote (with LFS for large files)

### Security Model

- **Local files**: Plaintext, editable by Logseq
- **GitHub files**: Encrypted with age (only tagged files)
- **Key management**: Private key stays local (`~/.config/logseq-github-auto-sync/identity.txt`)
- **Secret scanning**: High-confidence patterns blocked before push
- **LFS**: Large assets tracked separately to avoid GitHub blob limits

## What is protected

- Tagged page and journal Markdown files are encrypted in the GitHub repo.
- Local files in `~/logseq-graph` remain plaintext so Logseq can edit them normally.
- The plugin never stores the age identity secret in Git or in plugin settings.
- The sync helper aborts if high-confidence secrets remain in unencrypted `pages`, `journals`, or text `assets` files.
- Large assets are stored with Git LFS in the staging repo so GitHub accepts attachments above the normal Git blob limit.

The first implementation encrypts whole files by tag. It intentionally does not attempt block-level encryption because Git sync is file-based and block parsing can miss children, code blocks, and references.

## Secret Detection

The plugin scans for these high-confidence patterns:

**Single-line:**
- `BEGIN RSA PRIVATE KEY` / `BEGIN OPENSSH PRIVATE KEY`
- AWS access keys: `AKIA[0-9A-Z]{16}`
- GitHub tokens: `gh[pousr]_[A-Za-z0-9_]{20,}`
- OpenAI keys: `sk-[A-Za-z0-9_-]{20,}`
- Slack tokens: `xox[baprs]-[A-Za-z0-9-]{10,}`
- Generic: `api_key = <16+ chars>`, `secret = <16+ chars>`, etc.

**Multi-line:**
```
api_key: "
abcdefghijklmnop
"  ← Detected as "multiline-secret"
```

Files with detected secrets must be either:
- Tagged with `encrypted` or `secret` (for notes)
- Manually encrypted by the user (for assets)

## Local key setup

This machine has age installed at:

```text
/opt/homebrew/bin/age
```

The local age identity and recipient files are:

```text
~/.config/logseq-github-auto-sync/identity.txt
~/.config/logseq-github-auto-sync/recipients.txt
```

Back up `identity.txt` yourself, for example in 1Password Secure Note or an offline encrypted backup. Do not paste the private key into Logseq and do not commit it. The `recipients.txt` file only contains the public recipient and can be used in plugin settings.

If you need to generate a new key manually:

```bash
mkdir -p ~/.config/logseq-github-auto-sync
chmod 700 ~/.config/logseq-github-auto-sync
umask 077
age-keygen -o ~/.config/logseq-github-auto-sync/identity.txt
age-keygen -y ~/.config/logseq-github-auto-sync/identity.txt > ~/.config/logseq-github-auto-sync/recipients.txt
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

## Plugin settings

- `repoUrl`: GitHub SSH or HTTPS URL, for example `git@github.com:USER/private-logseq.git`.
- `branch`: remote branch for the encrypted staging repo, default `master`.
- `encryptedTags`: comma-separated tags, default `encrypted, secret`.
- `agePath`: path to age, default `/opt/homebrew/bin/age`.
- `recipientsPath`: public recipient file, default `~/.config/logseq-github-auto-sync/recipients.txt`.
- `identityPath`: private identity file for restore/decrypt helper, default `~/.config/logseq-github-auto-sync/identity.txt`.
- `largeFileStorage`: use Git LFS for large assets, default `true`.
- `lfsThresholdMb`: file size threshold for Git LFS, default `50`.

## Commands

- `GitHub Auto Sync: encrypted sync now`
- `GitHub Auto Sync: show encryption status`
- `GitHub Auto Sync: open settings`

## Restore on another machine

1. Install `age` and `git-lfs`, then restore your `identity.txt` private key.
2. Clone the encrypted GitHub repo.
3. From the cloned repo root, decrypt tagged files in place:

```bash
node logseq/plugins/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree \
  --age-path /opt/homebrew/bin/age \
  --identity-path ~/.config/logseq-github-auto-sync/identity.txt
```

Then open the decrypted folder as a Logseq graph.

## Development and verification

```bash
npm test
node scripts/sync-helper.js scan --encrypted-tags encrypted,secret
```

The helper uses `.logseq-github-auto-sync/sync-repo` as the sanitized staging repository and excludes that directory from copies.

## Troubleshooting

### Sync fails with "age encryption failed"

```bash
# Check age is installed
which age

# Verify recipients file
cat ~/.config/logseq-github-auto-sync/recipients.txt

# Check file permissions
ls -l ~/.config/logseq-github-auto-sync/
```

### Sync fails with "remaining likely secrets"

The secret scanner detected high-confidence secrets in unencrypted files.

**For notes**: Add `tags:: encrypted` or `#encrypted` to the note frontmatter.

**For assets**: The file will be auto-encrypted during sync if it contains secrets. If scanning is too aggressive, you can:
1. Move the file outside `assets/`
2. Encrypt it manually with age
3. Adjust the scanner settings (advanced)

### Large files not uploading

```bash
# Install Git LFS
brew install git-lfs

# Verify LFS is working
git lfs version

# Check threshold in settings
# Default: 50 MB (lfsThresholdMb)
```

### Sync server not reachable

```bash
# Start the local sync server
node logseq/plugins/logseq-github-auto-sync/scripts/sync-server.js

# Verify it's running
curl http://127.0.0.1:31937/health
```

### Permission denied errors

```bash
# Fix config directory permissions
chmod 700 ~/.config/logseq-github-auto-sync
chmod 600 ~/.config/logseq-github-auto-sync/identity.txt
chmod 644 ~/.config/logseq-github-auto-sync/recipients.txt
```

## Performance

### Benchmarks (typical graph)

| Operation | Time | Notes |
|-----------|------|-------|
| Scan (1000 files) | ~2s | Includes secret scanning |
| Sync (1000 files, 50 encrypted) | ~10s | Includes rsync + encryption + git push |
| Decrypt working tree | ~3s | Depends on number of encrypted files |

### Optimization tips

1. **Use SSD**: rsync and file I/O are the bottleneck
2. **Exclude large binaries**: Put them in `.gitignore` or outside `assets/`
3. **Adjust LFS threshold**: Set `lfsThresholdMb` to your needs (default: 50 MB)
4. **Batch operations**: The plugin already batches file operations for memory efficiency

## Advanced Usage

### Custom encryption tags

You can use any tags you want, including wiki-style tags:

```yaml
tags:: [[Sensitive]], private, confidential
```

### Multiple recipients

To encrypt for multiple recipients (e.g., team members):

1. Collect their public recipient keys
2. Create a combined recipients file:

```bash
cat ~/.config/logseq-github-auto-sync/recipients.txt
# age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqg
# age1xyz... (team member 2)
# age1abc... (team member 3)
```

3. Set `recipientsPath` in plugin settings to the combined file

### Manual sync from CLI

```bash
cd ~/logseq-graph

# Preview what will be encrypted
node logseq/plugins/logseq-github-auto-sync/scripts/sync-helper.js scan

# Run sync manually
node logseq/plugins/logseq-github-auto-sync/scripts/sync-helper.js sync

# Decrypt working tree (restore on another machine)
node logseq/plugins/logseq-github-auto-sync/scripts/sync-helper.js decrypt-working-tree
```

### CI/CD Integration

The staging repo can be used in CI/CD pipelines. Add to your workflow:

```yaml
- name: Decrypt secrets
  run: |
    age -d -i ~/.secrets/identity.txt -o secrets.yaml secrets.yaml.age

- name: Run tests
  run: npm test
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Migration from previous versions

### v0.1.0 → v0.2.0

- Temp files now use cryptographically secure suffixes
- walkFiles uses iterative traversal (no recursion limit)
- Multi-line secret detection added

### Manual migration

If you're upgrading from a manually configured setup:

1. **Backup your graph**: `cp -r ~/logseq-graph ~/logseq-graph-backup`
2. **Update plugin**: Copy new `dist/` files
3. **Restart Logseq**: Reload the plugin
4. **Test sync**: Run a manual sync and verify GitHub repo

## Contributing

### Running tests

```bash
npm test
```

### Project structure

```
logseq/plugins/logseq-github-auto-sync/
├── dist/                    # Compiled plugin code
│   ├── main.js             # Plugin entry point
│   ├── sync-core.js        # Core utilities
│   └── lsplugin.user.js    # Logseq plugin SDK
├── scripts/                # CLI helpers
│   ├── sync-helper.js      # Main sync logic
│   └── sync-server.js      # Local HTTP server
├── src/                    # New modular source (WIP)
│   ├── config/             # Configuration
│   ├── crypto/             # Encryption
│   ├── file/               # File operations
│   ├── git/                # Git operations
│   └── scanner/            # Secret scanning
└── test/                   # Test suites
```

### Development workflow

```bash
# Run tests
npm test

# Manual sync
node scripts/sync-helper.js scan

# Start sync server
npm run server
```

## License

MIT

