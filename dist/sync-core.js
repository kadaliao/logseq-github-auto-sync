(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LogseqGitHubSyncCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = {
    repoUrl: "",
    remoteName: "origin",
    branch: "master",
    autoSync: false,
    syncIntervalMinutes: 15,
    syncOnStart: false,
    syncOnShutdown: true,
    pullBeforePush: true,
    commitMessage: "Auto sync Logseq graph",
    encryptedSync: true,
    encryptedTags: "encrypted, secret",
    agePath: "/opt/homebrew/bin/age",
    recipientsPath: "~/.config/logseq-github-auto-sync/recipients.txt",
    identityPath: "~/.config/logseq-github-auto-sync/identity.txt",
    largeFileStorage: true,
    lfsThresholdMb: 50,
    secretScanMode: "encrypted-sync-gate",
    syncServerUrl: "http://127.0.0.1:31937"
  };

  const SECRET_PATTERNS = [
    { name: "private-key", re: /BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY/ },
    { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
    { name: "github-token", re: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
    { name: "openai-token", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
    // Single-line secret assignment (key: value or key = value)
    {
      name: "generic-secret-assignment",
      re: /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b.{0,32}[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i
    },
    // Multi-line secret assignment (key on one line, value on next line with up to 2 lines gap)
    {
      name: "multiline-secret",
      re: /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b\s*[:=]\s*["']?\s*(?:\r?\n\s*){1,2}["']?([A-Za-z0-9_./+=-]{16,})/i
    }
  ];

  const SECRET_GREP_PATTERN = [
    "BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY",
    "AKIA[0-9A-Z]{16}",
    "gh[pousr]_[A-Za-z0-9_]{20,}",
    "sk-[A-Za-z0-9_-]{20,}",
    "xox[baprs]-[A-Za-z0-9-]{10,}"
  ].join("|");

  function asBool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  }

  function asNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cleanText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || fallback;
  }

  function splitEncryptedTags(value) {
    return String(value == null ? "" : value)
      .split(/[\n,]/)
      .map((tag) => tag.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, ""))
      .filter(Boolean);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function contentHasEncryptedTag(content, encryptedTags) {
    const tags = splitEncryptedTags(encryptedTags).map((tag) => tag.toLowerCase());
    if (tags.length === 0) return false;
    const lines = String(content || "").split(/\r?\n/);

    for (const line of lines) {
      const lower = line.toLowerCase();
      const propertyMatch = lower.match(/^\s*-?\s*tags::\s*(.+)$/);
      if (propertyMatch) {
        const normalized = propertyMatch[1].replace(/\[\[|\]\]/g, "");
        for (const tag of tags) {
          const re = new RegExp(`(^|[,\\s])${escapeRegExp(tag)}([,\\s]|$)`, "i");
          if (re.test(normalized)) return true;
        }
      }

      for (const tag of tags) {
        if (lower.includes(`#${tag}`) || lower.includes(`#[[${tag}]]`)) return true;
      }
    }

    return false;
  }

  function normalizeSettings(raw) {
    const merged = Object.assign({}, DEFAULTS, raw || {});
    return {
      repoUrl: cleanText(merged.repoUrl, ""),
      remoteName: cleanText(merged.remoteName, DEFAULTS.remoteName),
      branch: cleanText(merged.branch, DEFAULTS.branch),
      autoSync: asBool(merged.autoSync, DEFAULTS.autoSync),
      syncIntervalMinutes: Math.max(1, asNumber(merged.syncIntervalMinutes, DEFAULTS.syncIntervalMinutes)),
      syncOnStart: asBool(merged.syncOnStart, DEFAULTS.syncOnStart),
      syncOnShutdown: asBool(merged.syncOnShutdown, DEFAULTS.syncOnShutdown),
      pullBeforePush: asBool(merged.pullBeforePush, DEFAULTS.pullBeforePush),
      commitMessage: cleanText(merged.commitMessage, DEFAULTS.commitMessage),
      encryptedSync: asBool(merged.encryptedSync, DEFAULTS.encryptedSync),
      encryptedTags: cleanText(merged.encryptedTags, DEFAULTS.encryptedTags),
      agePath: cleanText(merged.agePath, DEFAULTS.agePath),
      recipientsPath: cleanText(merged.recipientsPath, DEFAULTS.recipientsPath),
      identityPath: cleanText(merged.identityPath, DEFAULTS.identityPath),
      largeFileStorage: asBool(merged.largeFileStorage, DEFAULTS.largeFileStorage),
      lfsThresholdMb: Math.max(1, asNumber(merged.lfsThresholdMb, DEFAULTS.lfsThresholdMb)),
      syncServerUrl: cleanText(merged.syncServerUrl, DEFAULTS.syncServerUrl),
      secretScanMode: DEFAULTS.secretScanMode
    };
  }

  function redactGitOutput(text) {
    return String(text || "")
      .replace(/BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY[\s\S]*?END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY/g, "[redacted private key]")
      .replace(/AGE-SECRET-KEY-[A-Z0-9]+/g, "[redacted age identity]")
      .replace(/AKIA[0-9A-Z]{16}/g, "[redacted aws key]")
      .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted github token]")
      .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[redacted token]")
      .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, "[redacted slack token]");
  }

  function shouldIgnorePath(path, ignoredPaths) {
    if (!path) return false;
    return (ignoredPaths || []).some((prefix) => path === prefix || path.startsWith(prefix));
  }

  function detectLikelySecrets(text, options) {
    const opts = Object.assign({ diffOnly: false, ignoredPaths: [] }, options || {});
    const hits = [];
    let currentPath = "";

    String(text || "").split(/\r?\n/).forEach((line, index) => {
      const diffHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (diffHeader) currentPath = diffHeader[2];
      if (shouldIgnorePath(currentPath, opts.ignoredPaths)) return;
      if (/^(---|\+\+\+|@@)/.test(line)) return;
      if (opts.diffOnly && !line.startsWith("+")) return;

      const content = line.replace(/^[+\- ]/, "");
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.re.test(content)) {
          hits.push({ line: index + 1, path: currentPath, kind: pattern.name });
          break;
        }
      }
    });

    return hits;
  }

  function extractGrepHits(stdout) {
    const hits = [];
    String(stdout || "").split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const match = line.match(/^(.+?):(\d+):/);
      hits.push({ path: match ? match[1] : "unknown", line: match ? Number(match[2]) : 0, kind: "full-graph-scan" });
    });
    return hits;
  }

  function summarizeHits(hits, limit) {
    const max = limit || 8;
    const seen = new Set();
    const summary = [];
    for (const hit of hits || []) {
      const label = hit.path ? `${hit.path}${hit.line ? `:${hit.line}` : ""}` : `diff line ${hit.line}`;
      const item = `${label} (${hit.kind})`;
      if (!seen.has(item)) {
        seen.add(item);
        summary.push(item);
      }
      if (summary.length >= max) break;
    }
    const extra = hits && hits.length > summary.length ? `, +${hits.length - summary.length} more` : "";
    return summary.join(", ") + extra;
  }

  return {
    DEFAULTS,
    SECRET_GREP_PATTERN,
    normalizeSettings,
    splitEncryptedTags,
    contentHasEncryptedTag,
    redactGitOutput,
    detectLikelySecrets,
    extractGrepHits,
    summarizeHits
  };
});
