/**
 * File system utilities for walking and filtering files.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Iteratively walk a directory tree and collect files.
 * This avoids recursion depth issues with deeply nested directories.
 *
 * @param {string} root - Root directory to walk
 * @param {function} [predicate] - Optional filter function (filePath) => boolean
 * @returns {string[]} Array of absolute file paths
 */
function walkFiles(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (!predicate || predicate(full)) {
          out.push(full);
        }
      }
    } catch (error) {
      // Skip directories we can't read (permission errors, etc.)
      console.warn(`Cannot read directory ${current}: ${error.message}`);
    }
  }
  return out;
}

/**
 * Walk working tree files, excluding .git directory.
 *
 * @param {string} root - Root directory
 * @returns {string[]} Array of file paths
 */
function walkWorkingTree(root) {
  return walkFiles(root, (file) => {
    const relative = path.relative(root, file).split(path.sep);
    return !relative.includes(".git");
  });
}

/**
 * Get all Logseq note files (pages/ and journals/).
 *
 * @param {string} root - Graph root
 * @returns {string[]} Array of .md file paths
 */
function getNoteFiles(root) {
  const noteDirs = [path.join(root, "pages"), path.join(root, "journals")];
  return noteDirs.flatMap((dir) =>
    walkFiles(dir, (file) => file.endsWith(".md"))
  );
}

/**
 * Get all files that can be decrypted (pages/, journals/, assets/).
 *
 * @param {string} root - Graph root
 * @returns {string[]} Array of file paths
 */
function getDecryptableFiles(root) {
  return ["pages", "journals", "assets"].flatMap((dirName) =>
    walkFiles(path.join(root, dirName))
  );
}

/**
 * Get relative path from root, normalizing separators to forward slashes.
 *
 * @param {string} root - Base directory
 * @param {string} file - File path
 * @returns {string} Relative path with forward slashes
 */
function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/**
 * Check if a buffer is likely a text file.
 * Checks the first 4096 bytes for null bytes.
 *
 * @param {Buffer} buffer - File buffer
 * @returns {boolean}
 */
function isLikelyText(buffer) {
  if (!buffer || buffer.length === 0) return true;
  return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
}

/**
 * Check if a buffer starts with age encryption header.
 *
 * @param {Buffer} buffer - File buffer
 * @returns {boolean}
 */
function isAgeEncrypted(buffer) {
  const header = "age-encryption.org/v1";
  return buffer.subarray(0, header.length).toString("utf8") === header;
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Ensure a file exists.
 *
 * @param {string} filePath - File path
 * @param {string} label - Error label
 */
function ensureFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

/**
 * Expand ~ to home directory.
 *
 * @param {string} value - Path potentially starting with ~
 * @returns {string} Expanded path
 */
function expandHome(value) {
  if (!value) return value;
  return String(value).replace(/^~(?=$|\/)/, require("os").homedir());
}

/**
 * Copy graph to staging directory using rsync.
 *
 * @param {string} graphRoot - Source (graph root)
 * @param {string} stagingRoot - Destination (staging repo)
 * @param {string[]} excludedPaths - Paths to exclude
 */
function copyGraphToStaging(graphRoot, stagingRoot, excludedPaths = [".git", ".logseq-github-auto-sync"]) {
  ensureDir(stagingRoot);
  const args = [
    "-a",
    "--delete",
    ...excludedPaths.flatMap((p) => [`--exclude=${p}`]),
    `${graphRoot.replace(/\/$/, "")}/`,
    `${stagingRoot.replace(/\/$/, "")}/`
  ];

  const result = spawnSync("rsync", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    const output = result.stderr || result.stdout || (result.error && result.error.message) || "unknown error";
    throw new Error(`rsync failed: ${output}`);
  }
}

module.exports = {
  walkFiles,
  walkWorkingTree,
  getNoteFiles,
  getDecryptableFiles,
  relativePath,
  isLikelyText,
  isAgeEncrypted,
  ensureDir,
  ensureFile,
  expandHome,
  copyGraphToStaging
};
