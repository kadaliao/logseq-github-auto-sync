const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const pluginRoot = path.resolve(__dirname, "..");
const helper = path.join(pluginRoot, "scripts", "sync-helper.js");
const age = process.env.LOGSEQ_GITHUB_SYNC_AGE || "age";
const ageKeygen = process.env.LOGSEQ_GITHUB_SYNC_AGE_KEYGEN || "age-keygen";

function run(command, args, options = {}) {
  const result = execSync(`${command} ${args.join(" ")}`, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024, // Larger buffer for performance tests
    stdio: options.allowFailure ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
  });
  return result;
}

console.log("Running performance and edge case tests...");

// Performance test: Create a large graph and measure sync time
const perfTmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-perf-test-"));
const perfGraph = path.join(perfTmp, "graph");
const perfRemote = path.join(perfTmp, "remote.git");
const perfIdentity = path.join(perfTmp, "identity.txt");
const perfRecipients = path.join(perfTmp, "recipients.txt");

console.log("Setting up performance test graph (1000 files)...");
fs.mkdirSync(path.join(perfGraph, "pages"), { recursive: true });
fs.mkdirSync(path.join(perfGraph, "journals"), { recursive: true });
fs.mkdirSync(path.join(perfGraph, "assets"), { recursive: true });

// Initialize git
execSync("git init", { cwd: perfGraph, stdio: "pipe" });
execSync("git config user.name 'Perf Test'", { cwd: perfGraph, stdio: "pipe" });
execSync("git config user.email 'perf@test.invalid'", { cwd: perfGraph, stdio: "pipe" });

// Create test files (100 pages, 900 journals)
const secret = "sk-12345678901234567890123456789012";
for (let i = 0; i < 100; i++) {
  const content = i % 10 === 0 ? `tags:: encrypted\n- api_key = ${secret}\n` : "- test note\n";
  fs.writeFileSync(path.join(perfGraph, "pages", `Page${i}.md`), content);
}
for (let i = 0; i < 900; i++) {
  const date = new Date(2026, 0, 1 + i);
  const dateStr = `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, "0")}_${String(date.getDate()).padStart(2, "0")}`;
  fs.writeFileSync(path.join(perfGraph, "journals", `${dateStr}.md`), "- journal entry\n");
}
fs.writeFileSync(path.join(perfGraph, "assets", "test.txt"), "asset content\n");

execSync("git add .", { cwd: perfGraph, stdio: "pipe" });
execSync("git commit -m 'init'", { cwd: perfGraph, stdio: "pipe" });

// Setup remote and keys
execSync(`git init --bare ${perfRemote}`, { stdio: "pipe" });
execSync(`${ageKeygen} -o ${perfIdentity}`, { stdio: "pipe" });
const recipientsOutput = execSync(`${ageKeygen} -y ${perfIdentity}`, { cwd: perfTmp, encoding: "utf8" });
fs.writeFileSync(perfRecipients, recipientsOutput.trim());

console.log("Running performance sync...");
const startTime = Date.now();
const result = execSync(`node ${helper} sync --repo-url ${perfRemote} --age-path ${age} --recipients-path ${perfRecipients} --encrypted-tags encrypted --lfs-threshold-bytes 1024`, {
  cwd: perfGraph,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
const duration = Date.now() - startTime;

console.log(`Performance sync completed in ${duration}ms`);
assert(result.includes("sync complete"), "Sync should complete");
assert(duration < 30000, `Sync should complete in reasonable time (took ${duration}ms)`); // 30s timeout

// Edge case: Empty graph
console.log("Testing empty graph...");
const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-empty-test-"));
const emptyGraph = path.join(emptyTmp, "empty");
fs.mkdirSync(emptyGraph, { recursive: true });
execSync("git init", { cwd: emptyGraph, stdio: "pipe" });
execSync("git config user.name 'Empty'", { cwd: emptyGraph, stdio: "pipe" });
execSync("git config user.email 'empty@test.invalid'", { cwd: emptyGraph, stdio: "pipe" });
// Create a placeholder file to allow initial commit
fs.writeFileSync(path.join(emptyGraph, ".gitkeep"), "");
execSync("git add .gitkeep", { cwd: emptyGraph, stdio: "pipe" });
execSync("git commit -m 'init'", { cwd: emptyGraph, stdio: "pipe" });

const emptyRemote = path.join(emptyTmp, "remote.git");
execSync(`git init --bare ${emptyRemote}`, { stdio: "pipe" });
const emptyResult = execSync(`node ${helper} sync --repo-url ${emptyRemote} --age-path ${age} --recipients-path ${perfRecipients} --encrypted-tags encrypted`, {
  cwd: emptyGraph,
  encoding: "utf8"
});
assert(emptyResult.includes("sync complete"), "Empty graph should sync successfully");

// Edge case: Files with special characters
console.log("Testing files with special characters...");
const specialTmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-special-test-"));
const specialGraph = path.join(specialTmp, "special");
fs.mkdirSync(path.join(specialGraph, "pages"), { recursive: true });
execSync("git init", { cwd: specialGraph, stdio: "pipe" });
execSync("git config user.name 'Special'", { cwd: specialGraph, stdio: "pipe" });
execSync("git config user.email 'special@test.invalid'", { cwd: specialGraph, stdio: "pipe" });
fs.writeFileSync(path.join(specialGraph, "pages", "File with spaces.md"), "- note\n");
fs.writeFileSync(path.join(specialGraph, "pages", "中文测试.md"), "- chinese\n");
fs.writeFileSync(path.join(specialGraph, "pages", "Emoji 🔒.md"), "- emoji\n");
execSync("git add .", { cwd: specialGraph, stdio: "pipe" });
execSync("git commit -m 'init'", { cwd: specialGraph, stdio: "pipe" });

const specialRemote = path.join(specialTmp, "remote.git");
execSync(`git init --bare ${specialRemote}`, { stdio: "pipe" });
const specialResult = execSync(`node ${helper} sync --repo-url ${specialRemote} --age-path ${age} --recipients-path ${perfRecipients} --encrypted-tags encrypted`, {
  cwd: specialGraph,
  encoding: "utf8"
});
assert(specialResult.includes("sync complete"), "Graph with special characters should sync");

// Cleanup
try {
  fs.rmSync(perfTmp, { recursive: true, force: true });
  fs.rmSync(emptyTmp, { recursive: true, force: true });
  fs.rmSync(specialTmp, { recursive: true, force: true });
} catch (_) {
  // Best effort
}

console.log("Performance and edge case tests passed");
