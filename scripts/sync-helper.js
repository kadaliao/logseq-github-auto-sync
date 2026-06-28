#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const core = require("../dist/sync-core.js");

const AGE_HEADER = "age-encryption.org/v1";
const AGE_ARMOR_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
const STATE_DIR = ".logseq-github-auto-sync";
const STAGING_DIR = "sync-repo";
const DEFAULT_AUTHOR_NAME = "Logseq GitHub Auto Sync";
const DEFAULT_AUTHOR_EMAIL = "logseq-github-auto-sync.local";
const GIT = process.env.LOGSEQ_GITHUB_SYNC_GIT || "git";
const RSYNC = process.env.LOGSEQ_GITHUB_SYNC_RSYNC || "rsync";

// Generate cryptographically secure temporary file suffix
function generateTempSuffix() {
  return crypto.randomBytes(16).toString("hex");
}

// Safely clean up temporary files
function cleanupTempFiles(...paths) {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    } catch (_) {
      // Best effort cleanup
    }
  }
}

// Atomic rename with cleanup on failure
function atomicRename(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    cleanupTempFiles(src);
    throw error;
  }
}

function fail(message, code = 1) {
  console.error(core.redactGitOutput(message));
  process.exit(code);
}

function expandHome(value) {
  if (!value) return value;
  return String(value).replace(/^~(?=$|\/)/, os.homedir());
}

function parseArgs(argv) {
  const command = argv[2] || "help";
  const opts = {};
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const next = argv[i + 1];
    if (next == null || next.startsWith("--")) {
      opts[key] = "true";
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return { command, opts };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: options.encoding || "utf8",
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: Object.assign({}, process.env, options.env || {})
  });

  if (result.error && !options.allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${output}`);
  }
  return result;
}

function git(cwd, args, options = {}) {
  return run(GIT, args, Object.assign({}, options, { cwd }));
}

function getGraphRoot() {
  // 1. Environment variable (explicit)
  const envGraph = process.env.LOGSEQ_GITHUB_SYNC_GRAPH;
  if (envGraph) return expandHome(envGraph);

  // 2. Git top-level (if we're in a git repo)
  const result = git(process.cwd(), ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();

  // 3. Current directory
  return process.cwd();
}

function normalizeOptions(raw) {
  const cfg = core.normalizeSettings({
    repoUrl: raw.repoUrl || "",
    remoteName: raw.remoteName || "origin",
    branch: raw.branch || "master",
    pullBeforePush: false,
    commitMessage: raw.commitMessage || "Auto sync Logseq graph",
    encryptedTags: raw.encryptedTags || "encrypted, secret",
    agePath: raw.agePath || "age",
    recipientsPath: raw.recipientsPath || "~/.config/logseq-github-auto-sync/recipients.txt",
    identityPath: raw.identityPath || "~/.config/logseq-github-auto-sync/identity.txt",
    largeFileStorage: raw.largeFileStorage == null ? true : raw.largeFileStorage,
    lfsThresholdMb: raw.lfsThresholdMb || 50,
    authorName: raw.authorName || "",
    authorEmail: raw.authorEmail || ""
  });
  cfg.agePath = expandHome(cfg.agePath);
  cfg.recipientsPath = expandHome(cfg.recipientsPath);
  cfg.identityPath = expandHome(cfg.identityPath);
  cfg.lfsThresholdBytes = parseLfsThresholdBytes(raw, cfg.lfsThresholdMb);
  return cfg;
}

function parseLfsThresholdBytes(raw, thresholdMb) {
  if (raw.lfsThresholdBytes != null) {
    const bytes = Number(raw.lfsThresholdBytes);
    if (Number.isFinite(bytes) && bytes > 0) return Math.floor(bytes);
  }
  return Math.floor(Number(thresholdMb || 50) * 1024 * 1024);
}

function ensureExecutable(commandPath, label) {
  const result = run(commandPath, ["--version"], { allowFailure: true });
  if (result.status !== 0) {
    fail(`${label} is not executable: ${commandPath}`);
  }
}

function ensureFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyGraphToStaging(graphRoot, stagingRoot) {
  ensureDir(stagingRoot);
  const result = run(RSYNC, [
    "-a",
    "--delete",
    "--exclude=.git",
    `--exclude=${STATE_DIR}`,
    `${graphRoot.replace(/\/$/, "")}/`,
    `${stagingRoot.replace(/\/$/, "")}/`
  ], { allowFailure: true });
  if (result.status !== 0) {
    fail(`rsync failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
}

function ensureStagingRepo(stagingRoot, cfg, graphRoot) {
  ensureDir(stagingRoot);
  if (!fs.existsSync(path.join(stagingRoot, ".git"))) {
    git(stagingRoot, ["init"], { allowFailure: false });
  }

  abortInProgressGitOperation(stagingRoot);
  git(stagingRoot, ["config", "user.name", resolveCommitAuthorName(cfg, graphRoot)], { allowFailure: false });
  git(stagingRoot, ["config", "user.email", resolveCommitAuthorEmail(cfg, graphRoot)], { allowFailure: false });

  const remote = git(stagingRoot, ["remote", "get-url", cfg.remoteName], { allowFailure: true });
  if (remote.status !== 0 || !remote.stdout.trim()) {
    git(stagingRoot, ["remote", "add", cfg.remoteName, cfg.repoUrl], { allowFailure: false });
  } else if (remote.stdout.trim() !== cfg.repoUrl) {
    git(stagingRoot, ["remote", "set-url", cfg.remoteName, cfg.repoUrl], { allowFailure: false });
  }

  resetStagingToRemoteBase(stagingRoot, cfg);
}

function abortInProgressGitOperation(stagingRoot) {
  const gitDir = path.join(stagingRoot, ".git");
  if (!fs.existsSync(gitDir)) return;
  clearStaleIndexLock(stagingRoot);
  if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) {
    git(stagingRoot, ["rebase", "--abort"], { allowFailure: true });
  }
  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
    git(stagingRoot, ["merge", "--abort"], { allowFailure: true });
  }
}

function clearStaleIndexLock(stagingRoot) {
  const lockPath = path.join(stagingRoot, ".git", "index.lock");
  if (!fs.existsSync(lockPath)) return;
  fs.rmSync(lockPath, { force: true });
  console.log("removed stale git index lock");
}

function resetStagingToRemoteBase(stagingRoot, cfg) {
  if (remoteBranchExists(stagingRoot, cfg)) {
    git(stagingRoot, ["fetch", cfg.remoteName, cfg.branch], { allowFailure: false });
    git(stagingRoot, ["checkout", "-B", cfg.branch, `${cfg.remoteName}/${cfg.branch}`], { allowFailure: false });
    git(stagingRoot, ["reset", "--hard", `${cfg.remoteName}/${cfg.branch}`], { allowFailure: false });
    git(stagingRoot, ["clean", "-fdx"], { allowFailure: false });
    return;
  }

  git(stagingRoot, ["checkout", "-B", cfg.branch], { allowFailure: false });
  git(stagingRoot, ["reset", "--hard"], { allowFailure: true });
  git(stagingRoot, ["clean", "-fdx"], { allowFailure: true });
}

function gitConfigOrDefault(repoRoot, key, fallback) {
  const local = git(repoRoot, ["config", key], { allowFailure: true });
  if (local.status === 0 && local.stdout.trim()) return local.stdout.trim();
  const global = run(GIT, ["config", "--global", key], { allowFailure: true });
  if (global.status === 0 && global.stdout.trim()) return global.stdout.trim();
  return fallback;
}

function sourceGraphGitStatus(graphRoot) {
  const inside = git(graphRoot, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return "source graph git status: unavailable not_git_repo=true";
  }

  const status = git(graphRoot, ["status", "--porcelain=v1", "--untracked-files=all"], { allowFailure: true });
  if (status.status !== 0) {
    return "source graph git status: unavailable git_status_failed=true";
  }

  const lines = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.slice(3).startsWith(`${STATE_DIR}/`));
  if (lines.length === 0) return "source graph git status: clean";

  let tracked = 0;
  let untracked = 0;
  let deleted = 0;
  for (const line of lines) {
    const code = line.slice(0, 2);
    if (code === "??") {
      untracked += 1;
      continue;
    }
    tracked += 1;
    if (code.includes("D")) deleted += 1;
  }

  return `source graph git status: dirty tracked_changes=${tracked} untracked=${untracked} deleted=${deleted}`;
}

function resolveCommitAuthorName(cfg, graphRoot) {
  return cfg.authorName || gitConfigOrDefault(graphRoot, "user.name", DEFAULT_AUTHOR_NAME);
}

function resolveCommitAuthorEmail(cfg, graphRoot) {
  return cfg.authorEmail || gitConfigOrDefault(graphRoot, "user.email", DEFAULT_AUTHOR_EMAIL);
}

function walkFiles(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;

  // Use iterative approach with explicit stack to avoid recursion depth issues
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

function walkWorkingTreeFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;

  // Use iterative approach with explicit stack to avoid recursion depth issues
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    try {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name === ".git") continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else {
          out.push(full);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Cannot read directory ${current}: ${error.message}`);
    }
  }
  return out;
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function isLikelyText(buffer) {
  if (!buffer || buffer.length === 0) return true;
  return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
}

function isAgeEncrypted(buffer) {
  const head = buffer.subarray(0, Math.max(AGE_HEADER.length, AGE_ARMOR_HEADER.length)).toString("utf8");
  return head.startsWith(AGE_HEADER) || head.startsWith(AGE_ARMOR_HEADER);
}

function noteFiles(root) {
  return [path.join(root, "pages"), path.join(root, "journals")].flatMap((dir) =>
    walkFiles(dir, (file) => file.endsWith(".md"))
  );
}

function decryptableFiles(root) {
  return ["pages", "journals", "assets"].flatMap((dirName) =>
    walkFiles(path.join(root, dirName))
  );
}

function encryptTaggedFiles(stagingRoot, cfg) {
  const encrypted = [];
  for (const file of noteFiles(stagingRoot)) {
    const buffer = fs.readFileSync(file);
    if (isAgeEncrypted(buffer)) continue;
    if (!isLikelyText(buffer)) continue;

    const content = buffer.toString("utf8");
    if (!core.contentHasEncryptedTag(content, cfg.encryptedTags)) continue;

    const tmp = `${file}.age-tmp-${generateTempSuffix()}`;
    try {
      const result = run(cfg.agePath, ["-a", "-R", cfg.recipientsPath, "-o", tmp, file], { allowFailure: true });
      if (result.status !== 0) {
        throw new Error(`age encryption failed: ${result.stderr || result.stdout}`);
      }
      atomicRename(tmp, file);
      encrypted.push(relativePath(stagingRoot, file));
    } catch (error) {
      cleanupTempFiles(tmp);
      fail(`age encryption failed for ${relativePath(stagingRoot, file)}: ${error.message}`);
    }
  }
  return encrypted;
}

function encryptLikelySecretAssets(stagingRoot, cfg) {
  const encrypted = [];
  const assetsRoot = path.join(stagingRoot, "assets");
  for (const file of walkFiles(assetsRoot)) {
    const buffer = fs.readFileSync(file);
    if (isAgeEncrypted(buffer)) continue;
    if (!isLikelyText(buffer)) continue;
    const rel = relativePath(stagingRoot, file);
    const hits = scanLikelySecrets(stagingRoot, { includeOnlyPaths: new Set([rel]) });
    if (hits.length === 0) continue;
    const tmp = `${file}.age-tmp-${generateTempSuffix()}`;
    try {
      const result = run(cfg.agePath, ["-a", "-R", cfg.recipientsPath, "-o", tmp, file], { allowFailure: true });
      if (result.status !== 0) {
        throw new Error(`age encryption failed: ${result.stderr || result.stdout}`);
      }
      atomicRename(tmp, file);
      encrypted.push(rel);
    } catch (error) {
      cleanupTempFiles(tmp);
      fail(`age encryption failed for ${rel}: ${error.message}`);
    }
  }
  return encrypted;
}

function decryptWorkingTree(root, cfg) {
  ensureFile(cfg.identityPath, "age identity file");
  const decrypted = [];
  for (const file of decryptableFiles(root)) {
    const buffer = fs.readFileSync(file);
    if (!isAgeEncrypted(buffer)) continue;
    const tmp = `${file}.plain-tmp-${generateTempSuffix()}`;
    try {
      const result = run(cfg.agePath, ["-d", "-i", cfg.identityPath, "-o", tmp, file], { allowFailure: true });
      if (result.status !== 0) {
        throw new Error(`age decrypt failed: ${result.stderr || result.stdout}`);
      }
      atomicRename(tmp, file);
      decrypted.push(relativePath(root, file));
    } catch (error) {
      cleanupTempFiles(tmp);
      fail(`age decrypt failed for ${relativePath(root, file)}: ${error.message}`);
    }
  }
  return decrypted;
}

function scanLikelySecrets(root, options = {}) {
  const hits = [];
  const scanRoots = ["pages", "journals", "assets"].map((name) => path.join(root, name));
  for (const scanRoot of scanRoots) {
    for (const file of walkFiles(scanRoot)) {
      const buffer = fs.readFileSync(file);
      if (isAgeEncrypted(buffer)) continue;
      if (!isLikelyText(buffer)) continue;

      const rel = relativePath(root, file);
      if (options.includeOnlyPaths && !options.includeOnlyPaths.has(rel)) continue;
      const content = buffer.toString("utf8");
      if (options.onlyUntaggedNotes && (rel.startsWith("pages/") || rel.startsWith("journals/"))) {
        if (core.contentHasEncryptedTag(content, options.encryptedTags)) continue;
      }

      // Scan line by line for single-line patterns
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const secrets = core.detectLikelySecrets(line);
        for (const hit of secrets) {
          hits.push({ path: rel, line: idx + 1, kind: hit.kind });
          break;
        }
      });

      // Scan for multi-line patterns (e.g., key on line N, value on line N+1 or N+2)
      for (let i = 0; i < lines.length; i++) {
        // Check if this line contains a secret key
        const multilinePattern = /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key)\b\s*[:=]/i;
        if (multilinePattern.test(lines[i])) {
          // Check next 2 lines for the value
          for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
            const nextLine = lines[j];
            // Match a value that looks like a secret (16+ chars of base64/hex/alphanumeric)
            const valueMatch = nextLine.match(/["']?([A-Za-z0-9_./+=-]{16,})["']?\s*$/);
            if (valueMatch && !core.detectLikelySecrets(nextLine).length) {
              hits.push({
                path: rel,
                line: j + 1,
                kind: "multiline-secret"
              });
              break; // Only report once per key
            }
          }
        }
      }
    }
  }
  return hits;
}

function scanTaggedFiles(root, encryptedTags) {
  return noteFiles(root)
    .filter((file) => {
      const buffer = fs.readFileSync(file);
      return isLikelyText(buffer) && core.contentHasEncryptedTag(buffer.toString("utf8"), encryptedTags);
    })
    .map((file) => relativePath(root, file));
}

function printHits(label, hits) {
  console.log(`${label}: ${hits.length}`);
  for (const hit of hits.slice(0, 40)) {
    console.log(`${hit.path}:${hit.line} (${hit.kind})`);
  }
  if (hits.length > 40) console.log(`+${hits.length - 40} more`);
}

function remoteBranchExists(stagingRoot, cfg) {
  const result = git(stagingRoot, ["ls-remote", "--exit-code", "--heads", cfg.remoteName, cfg.branch], {
    allowFailure: true
  });
  return result.status === 0;
}

function configureLargeFileStorage(stagingRoot, cfg) {
  if (!cfg.largeFileStorage) return [];
  const largeFiles = walkWorkingTreeFiles(stagingRoot)
    .filter((file) => fs.statSync(file).size >= cfg.lfsThresholdBytes)
    .map((file) => relativePath(stagingRoot, file))
    .sort();

  if (largeFiles.length === 0) return [];

  const lfs = git(stagingRoot, ["lfs", "version"], { allowFailure: true });
  if (lfs.status !== 0) {
    fail("git-lfs is required for large files. Install it with: brew install git-lfs");
  }
  git(stagingRoot, ["lfs", "install", "--local"], { allowFailure: false });
  for (const rel of largeFiles) {
    git(stagingRoot, ["lfs", "track", "--", rel], { allowFailure: false });
  }
  return largeFiles;
}

function commitAndPush(stagingRoot, cfg, encryptedCount, lfsCount) {
  git(stagingRoot, ["add", "-A"], { allowFailure: false });
  const diff = git(stagingRoot, ["diff", "--cached", "--quiet"], { allowFailure: true });
  let committed = false;

  if (diff.status !== 0) {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    git(stagingRoot, ["commit", "-m", `${cfg.commitMessage} (${timestamp})`], { allowFailure: false });
    committed = true;
  }

  git(stagingRoot, ["push", "-u", cfg.remoteName, cfg.branch], { allowFailure: false });
  console.log(`sync complete: committed=${committed} encrypted_files=${encryptedCount} lfs_files=${lfsCount}`);
}

function commandSync(cfg) {
  if (!cfg.repoUrl) fail("repoUrl is required for sync");
  ensureExecutable(cfg.agePath, "age");
  ensureFile(cfg.recipientsPath, "age recipients file");

  const graphRoot = getGraphRoot();
  const sourceStatus = sourceGraphGitStatus(graphRoot);
  const stateRoot = path.join(graphRoot, STATE_DIR);
  const stagingRoot = path.join(stateRoot, STAGING_DIR);
  ensureDir(stateRoot);
  ensureStagingRepo(stagingRoot, cfg, graphRoot);
  copyGraphToStaging(graphRoot, stagingRoot);

  const encrypted = encryptTaggedFiles(stagingRoot, cfg);
  const encryptedAssets = encryptLikelySecretAssets(stagingRoot, cfg);
  const remainingHits = scanLikelySecrets(stagingRoot, { encryptedTags: cfg.encryptedTags });
  if (remainingHits.length > 0) {
    printHits("remaining likely secrets after encryption", remainingHits);
    fail("sync aborted because likely secrets remain outside encrypted tagged files", 2);
  }

  const lfsFiles = configureLargeFileStorage(stagingRoot, cfg);
  console.log(sourceStatus);
  commitAndPush(stagingRoot, cfg, encrypted.length + encryptedAssets.length, lfsFiles.length);
}

function commandScan(cfg) {
  const graphRoot = getGraphRoot();
  console.log(sourceGraphGitStatus(graphRoot));
  console.log(`commit author: ${resolveCommitAuthorName(cfg, graphRoot)} <${resolveCommitAuthorEmail(cfg, graphRoot)}>`);
  const tagged = scanTaggedFiles(graphRoot, cfg.encryptedTags);
  const hits = scanLikelySecrets(graphRoot, {
    onlyUntaggedNotes: true,
    encryptedTags: cfg.encryptedTags
  });
  const assetHits = hits.filter((hit) => hit.path.startsWith("assets/"));
  const untaggedNoteHits = hits.filter((hit) => !hit.path.startsWith("assets/"));
  console.log(`encrypted tags: ${core.splitEncryptedTags(cfg.encryptedTags).join(", ")}`);
  console.log(`tagged note files: ${tagged.length}`);
  tagged.slice(0, 40).forEach((file) => console.log(file));
  if (tagged.length > 40) console.log(`+${tagged.length - 40} more tagged files`);
  printHits("untagged note likely secrets", untaggedNoteHits);
  printHits("asset likely secrets auto-encrypted during sync", assetHits);
  if (untaggedNoteHits.length > 0) process.exit(2);
}

function commandDecryptWorkingTree(cfg) {
  ensureExecutable(cfg.agePath, "age");
  const root = getGraphRoot();
  const decrypted = decryptWorkingTree(root, cfg);
  console.log(`decrypted files: ${decrypted.length}`);
  decrypted.slice(0, 40).forEach((file) => console.log(file));
  if (decrypted.length > 40) console.log(`+${decrypted.length - 40} more decrypted files`);
}

function commandHelp() {
  console.log(`Usage:
  sync-helper.js sync --repo-url <url> --recipients-path <path> [--branch master] [--encrypted-tags encrypted,secret]
  sync-helper.js scan [--encrypted-tags encrypted,secret]
  sync-helper.js decrypt-working-tree --identity-path <path>
`);
}

const { command, opts } = parseArgs(process.argv);
const cfg = normalizeOptions(opts);

try {
  if (command === "sync") commandSync(cfg);
  else if (command === "scan") commandScan(cfg);
  else if (command === "decrypt-working-tree") commandDecryptWorkingTree(cfg);
  else commandHelp();
} catch (error) {
  fail(error && error.message ? error.message : String(error));
}
