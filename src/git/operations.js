/**
 * Git operations wrapper with error handling.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

class GitError extends Error {
  constructor(message, command, cwd) {
    super(message);
    this.command = command;
    this.cwd = cwd;
    this.name = "GitError";
  }
}

/**
 * Run a git command in the given directory.
 * @param {string} cwd - Working directory
 * @param {string[]} args - Git arguments (without 'git' itself)
 * @param {object} options - Execution options
 * @returns {object} { stdout, stderr, status }
 */
function git(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: Object.assign({}, process.env, options.env || {}),
    stdio: ["ignore", "pipe", "pipe"]
  });

  const normalized = {
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error ? result.error.message : ""),
    status: result.status == null ? (result.error ? 1 : 0) : result.status
  };

  if (normalized.status !== 0 && !options.allowFailure) {
    throw new GitError(
      `git ${args.join(" ")} failed: ${normalized.stderr || normalized.stdout}`,
      `git ${args.join(" ")}`,
      cwd
    );
  }

  return normalized;
}

/**
 * Check if a git remote branch exists.
 */
function remoteBranchExists(cwd, remoteName, branch) {
  const result = git(cwd, ["ls-remote", "--exit-code", "--heads", remoteName, branch], {
    allowFailure: true
  });
  return result.status === 0;
}

/**
 * Get git config value (local then global).
 */
function getConfig(cwd, key, fallback) {
  try {
    const local = git(cwd, ["config", key], { allowFailure: true });
    if (local.stdout.trim()) return local.stdout.trim();
  } catch {}

  try {
    const global = git(process.cwd(), ["config", "--global", key], { allowFailure: true });
    if (global.stdout.trim()) return global.stdout.trim();
  } catch {}

  return fallback;
}

/**
 * Initialize or update a git repository.
 */
function ensureRepo(cwd, remoteUrl, remoteName, branch) {
  // Initialize if needed
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    git(cwd, ["init"]);
  }

  // Set author
  const authorName = getConfig(process.cwd(), "user.name", "Logseq GitHub Auto Sync");
  const authorEmail = getConfig(process.cwd(), "user.email", "logseq-github-auto-sync.local");
  git(cwd, ["config", "user.name", authorName]);
  git(cwd, ["config", "user.email", authorEmail]);

  // Configure remote
  try {
    const remote = git(cwd, ["remote", "get-url", remoteName], { allowFailure: true });
    if (remote.status !== 0 || !remote.stdout.trim()) {
      git(cwd, ["remote", "add", remoteName, remoteUrl]);
    } else if (remote.stdout.trim() !== remoteUrl) {
      git(cwd, ["remote", "set-url", remoteName, remoteUrl]);
    }
  } catch (error) {
    console.warn(`Failed to configure remote: ${error.message}`);
  }
}

/**
 * Reset repository to remote branch state.
 */
function resetToRemote(cwd, remoteName, branch) {
  if (remoteBranchExists(cwd, remoteName, branch)) {
    git(cwd, ["fetch", remoteName, branch]);
    git(cwd, ["checkout", "-B", branch, `${remoteName}/${branch}`]);
    git(cwd, ["reset", "--hard", `${remoteName}/${branch}`]);
    git(cwd, ["clean", "-fdx"]);
  } else {
    git(cwd, ["checkout", "-B", branch]);
    git(cwd, ["reset", "--hard"]);
    git(cwd, ["clean", "-fdx"]);
  }
}

/**
 * Abort in-progress git operations (rebase, merge).
 */
function abortInProgressOperations(cwd) {
  const gitDir = path.join(cwd, ".git");
  if (!fs.existsSync(gitDir)) return;

  try {
    if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) {
      git(cwd, ["rebase", "--abort"], { allowFailure: true });
    }
    if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
      git(cwd, ["merge", "--abort"], { allowFailure: true });
    }
  } catch (error) {
    console.warn(`Failed to abort git operation: ${error.message}`);
  }
}

/**
 * Commit and push changes.
 */
function commitAndPush(cwd, remoteName, branch, message) {
  git(cwd, ["add", "-A"]);

  // Check if there are changes to commit
  const diff = git(cwd, ["diff", "--cached", "--quiet"], { allowFailure: true });
  let committed = false;

  if (diff.status !== 0) {
    git(cwd, ["commit", "-m", message]);
    committed = true;
  }

  git(cwd, ["push", "-u", remoteName, branch]);
  return committed;
}

/**
 * Pull with rebase before push.
 */
function pullWithRebase(cwd, remoteName, branch) {
  try {
    git(cwd, ["pull", "--rebase", "--autostash", remoteName, branch]);
  } catch (error) {
    throw new GitError(`Pull with rebase failed: ${error.message}`, `git pull --rebase`, cwd);
  }
}

/**
 * Configure Git LFS tracking.
 */
function configureLfs(cwd, files) {
  try {
    git(cwd, ["lfs", "version"]);
  } catch {
    throw new Error("git-lfs is required for large files. Install it with: brew install git-lfs");
  }

  git(cwd, ["lfs", "install", "--local"]);
  for (const file of files) {
    git(cwd, ["lfs", "track", "--", file]);
  }
}

module.exports = {
  git,
  GitError,
  remoteBranchExists,
  getConfig,
  ensureRepo,
  resetToRemote,
  abortInProgressOperations,
  commitAndPush,
  pullWithRebase,
  configureLfs
};
