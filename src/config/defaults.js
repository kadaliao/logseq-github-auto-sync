/**
 * Centralized defaults for logseq-github-auto-sync.
 * All modules should import from here instead of hardcoding values.
 */

const DEFAULTS = Object.freeze({
  // Git configuration
  git: {
    defaultAuthorName: "Logseq GitHub Auto Sync",
    defaultAuthorEmail: "logseq-github-auto-sync.local",
    command: process.env.LOGSEQ_GITHUB_SYNC_GIT || "git",
    rsyncCommand: process.env.LOGSEQ_GITHUB_SYNC_RSYNC || "rsync"
  },

  // Age encryption
  age: {
    header: "age-encryption.org/v1",
    defaultPath: "age",
    defaultRecipientsPath: "~/.config/logseq-github-auto-sync/recipients.txt",
    defaultIdentityPath: "~/.config/logseq-github-auto-sync/identity.txt"
  },

  // Sync state
  state: {
    dir: ".logseq-github-auto-sync",
    stagingDir: "sync-repo"
  },

  // Git LFS
  lfs: {
    enabled: true,
    defaultThresholdMb: 50,
    defaultThresholdBytes: 50 * 1024 * 1024
  },

  // Sync behavior
  sync: {
    defaultBranch: "master",
    defaultRemoteName: "origin",
    defaultCommitMessage: "Auto sync Logseq graph",
    pullBeforePush: true,
    encryptedSync: true,
    defaultEncryptedTags: "encrypted, secret"
  },

  // Secret scanning
  scanning: {
    defaultMaxBuffer: 20 * 1024 * 1024,
    textDetectionBytes: 4096,
    secretScanMode: "encrypted-sync-gate"
  },

  // Server
  server: {
    defaultPort: 31937,
    defaultHost: "127.0.0.1",
    defaultUrl: "http://127.0.0.1:31937",
    maxBodySize: 1024 * 1024
  },

  // Timer
  timer: {
    minIntervalMinutes: 1,
    defaultIntervalMinutes: 15,
    defaultAutoSync: false,
    defaultSyncOnStart: false,
    defaultSyncOnShutdown: true
  }
});

// Pre-compiled secret patterns for performance
const SECRET_PATTERNS = Object.freeze([
  { name: "private-key", re: /BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-token", re: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: "openai-token", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: "generic-secret-assignment",
    re: /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b.{0,32}[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i
  },
  // Multi-line secret patterns (key on one line, value on next)
  {
    name: "multiline-secret",
    re: /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["']?\s*\r?\n\s*["']?([A-Za-z0-9_./+=-]{16,})/i
  }
]);

// Grep pattern for command-line secret scanning
const SECRET_GREP_PATTERN = Object.freeze([
  "BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY",
  "AKIA[0-9A-Z]{16}",
  "gh[pousr]_[A-Za-z0-9_]{20,}",
  "sk-[A-Za-z0-9_-]{20,}",
  "xox[baprs]-[A-Za-z0-9-]{10,}"
].join("|"));

// Directories to exclude during sync
const EXCLUDED_PATHS = Object.freeze([
  ".git",
  ".logseq-github-auto-sync"
]);

module.exports = {
  DEFAULTS,
  SECRET_PATTERNS,
  SECRET_GREP_PATTERN,
  EXCLUDED_PATHS
};
