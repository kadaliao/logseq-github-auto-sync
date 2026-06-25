/**
 * Secret scanning utilities.
 * Detects potential secrets in files using regex patterns.
 */

const SECRET_PATTERNS = [
  { name: "private-key", re: /BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-token", re: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: "openai-token", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: "generic-secret-assignment",
    re: /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b.{0,32}[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i
  }
];

const GREP_PATTERN = [
  "BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY",
  "AKIA[0-9A-Z]{16}",
  "gh[pousr]_[A-Za-z0-9_]{20,}",
  "sk-[A-Za-z0-9_-]{20,}",
  "xox[baprs]-[A-Za-z0-9-]{10,}"
].join("|");

/**
 * Detect secrets in a single line of text.
 *
 * @param {string} text - Line to scan
 * @returns {Array<{kind: string}>} Array of detected secret types
 */
function detectInLine(text) {
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(text)) {
      hits.push({ kind: pattern.name });
      break; // Only report first match per line
    }
  }
  return hits;
}

/**
 * Scan file content for secrets, including multi-line patterns.
 *
 * @param {string} content - Full file content
 * @returns {Array<{line: number, kind: string}>} Array of hits with line numbers
 */
function scanContent(content) {
  const hits = [];
  const lines = content.split(/\r?\n/);

  // Scan single-line patterns
  lines.forEach((line, idx) => {
    for (const hit of detectInLine(line)) {
      hits.push({ line: idx + 1, kind: hit.kind });
      break;
    }
  });

  // Scan for multi-line patterns (key on one line, value on next 1-2 lines)
  for (let i = 0; i < lines.length; i++) {
    const keyPattern = /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b\s*[:=]/i;
    if (!keyPattern.test(lines[i])) continue;

    // Check next 2 lines for a value
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const valueMatch = lines[j].match(/["']?([A-Za-z0-9_./+=-]{16,})["']?\s*$/);
      if (valueMatch && !detectInLine(lines[j]).length) {
        hits.push({ line: j + 1, kind: "multiline-secret" });
        break;
      }
    }
  }

  return hits;
}

/**
 * Scan files in a directory for potential secrets.
 *
 * @param {string} root - Root directory to scan
 * @param {object} options - Scan options
 * @param {Set<string>} [options.includeOnlyPaths] - Only scan these relative paths
 * @param {boolean} [options.onlyUntaggedNotes] - Only scan untagged notes
 * @param {string[]} [options.encryptedTags] - Tags that mark files as encrypted
 * @param {function} [options.isEncrypted] - Check if a file is encrypted
 * @param {function} [options.isText] - Check if a file is text
 * @returns {Array<{path: string, line: number, kind: string}>} Array of hits
 */
function scanFiles(root, options = {}) {
  const {
    includeOnlyPaths,
    onlyUntaggedNotes,
    encryptedTags = [],
    isEncrypted = () => false,
    isText = () => true,
    walkFiles = require("fs").readdirSync // Fallback, should be injected
  } = options;

  const hits = [];
  const scanRoots = ["pages", "journals", "assets"].map((name) => require("path").join(root, name));

  for (const scanRoot of scanRoots) {
    if (!require("fs").existsSync(scanRoot)) continue;

    const files = walkFiles(scanRoot);
    for (const file of files) {
      let buffer;
      try {
        buffer = require("fs").readFileSync(file);
      } catch {
        continue; // Skip unreadable files
      }

      if (isEncrypted(buffer)) continue;
      if (!isText(buffer)) continue;

      const rel = require("path").relative(root, file).split(require("os").platform() === "win32" ? "\\" : "/").join("/");
      if (includeOnlyPaths && !includeOnlyPaths.has(rel)) continue;

      const content = buffer.toString("utf8");
      if (onlyUntaggedNotes && (rel.startsWith("pages/") || rel.startsWith("journals/"))) {
        // Check if file has encrypted tag (simplified check)
        if (content.includes("tags::") && encryptedTags.some((tag) => content.includes(`#${tag}`))) {
          continue;
        }
      }

      hits.push(...scanContent(content).map((hit) => ({ path: rel, ...hit })));
    }
  }

  return hits;
}

/**
 * Get grep pattern for command-line scanning.
 * @returns {string}
 */
function getGrepPattern() {
  return GREP_PATTERN;
}

/**
 * Format scan hits for display.
 *
 * @param {string} label - Label for the scan
 * @param {Array} hits - Scan hits
 * @param {number} [limit] - Max hits to show
 * @returns {string} Formatted string
 */
function formatHits(label, hits, limit = 40) {
  const lines = [`${label}: ${hits.length}`];
  for (const hit of hits.slice(0, limit)) {
    lines.push(`${hit.path}:${hit.line} (${hit.kind})`);
  }
  if (hits.length > limit) {
    lines.push(`+${hits.length - limit} more`);
  }
  return lines.join("\n");
}

module.exports = {
  detectInLine,
  scanContent,
  scanFiles,
  getGrepPattern,
  formatHits,
  SECRET_PATTERNS
};
