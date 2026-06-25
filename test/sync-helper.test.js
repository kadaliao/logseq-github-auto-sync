const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const pluginRoot = path.resolve(__dirname, "..");
const helper = path.join(pluginRoot, "scripts", "sync-helper.js");
const age = process.env.LOGSEQ_GITHUB_SYNC_AGE || "/opt/homebrew/bin/age";
const ageKeygen = process.env.LOGSEQ_GITHUB_SYNC_AGE_KEYGEN || "/opt/homebrew/bin/age-keygen";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: options.encoding || "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return result;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-age-sync-test-"));
const graph = path.join(tmp, "graph");
const remote = path.join(tmp, "remote.git");
const clone = path.join(tmp, "clone");
const identity = path.join(tmp, "identity.txt");
const recipients = path.join(tmp, "recipients.txt");
const secret = `sk-${"a".repeat(28)}`;

fs.mkdirSync(graph, { recursive: true });
run("git", ["init"], { cwd: graph });
run("git", ["config", "user.name", "Test User"], { cwd: graph });
run("git", ["config", "user.email", "test@example.invalid"], { cwd: graph });
write(path.join(graph, "pages", "Secret.md"), `tags:: encrypted\n- api_key = ${secret}\n`);
write(path.join(graph, "pages", "Public.md"), "- hello public note\n");
write(path.join(graph, "journals", "2026_05_22.md"), "- plain journal\n");
write(path.join(graph, "assets", "config.yaml"), `api_key: ${secret}\n`);
write(path.join(graph, "assets", "large.bin"), "x".repeat(128));
run("git", ["add", "pages", "journals", "assets"], { cwd: graph });
run("git", ["commit", "-m", "source graph"], { cwd: graph });

run("git", ["init", "--bare", remote]);
run(ageKeygen, ["-o", identity]);
run(ageKeygen, ["-y", identity], { allowFailure: false }).stdout.trim();
fs.writeFileSync(recipients, run(ageKeygen, ["-y", identity]).stdout);

const sync = run("node", [
  helper,
  "sync",
  "--repo-url", remote,
  "--branch", "master",
  "--age-path", age,
  "--recipients-path", recipients,
  "--encrypted-tags", "encrypted",
  "--lfs-threshold-bytes", "64",
  "--commit-message", "test encrypted sync",
], { cwd: graph });
assert.match(sync.stdout, /sync complete/);

const other = path.join(tmp, "other-writer");
run("git", ["clone", remote, other]);
run("git", ["config", "user.name", "Other Writer"], { cwd: other });
run("git", ["config", "user.email", "other@example.invalid"], { cwd: other });
write(path.join(other, "pages", "Secret.md"), "age-encryption.org/v1\nother encrypted snapshot\n");
run("git", ["add", "pages/Secret.md"], { cwd: other });
run("git", ["commit", "-m", "other encrypted snapshot"], { cwd: other });
run("git", ["push", "origin", "master"], { cwd: other });

write(path.join(graph, "pages", "Secret.md"), `tags:: encrypted\n- api_key = ${secret}\n- changed after first sync\n`);
const repeatSync = run("node", [
  helper,
  "sync",
  "--repo-url", remote,
  "--branch", "master",
  "--age-path", age,
  "--recipients-path", recipients,
  "--encrypted-tags", "encrypted",
  "--lfs-threshold-bytes", "64",
  "--commit-message", "test encrypted sync repeat",
], { cwd: graph });
assert.match(repeatSync.stdout, /sync complete/);

run("git", ["clone", remote, clone]);
const encrypted = fs.readFileSync(path.join(clone, "pages", "Secret.md"), "utf8");
assert(encrypted.startsWith("age-encryption.org/v1"));
assert(!encrypted.includes(secret));
const publicNote = fs.readFileSync(path.join(clone, "pages", "Public.md"), "utf8");
assert(publicNote.includes("hello public note"));
const encryptedAsset = fs.readFileSync(path.join(clone, "assets", "config.yaml"), "utf8");
assert(encryptedAsset.startsWith("age-encryption.org/v1"));
assert(!encryptedAsset.includes(secret));
const lfsPointer = run("git", ["show", "HEAD:assets/large.bin"], { cwd: clone }).stdout;
assert(lfsPointer.startsWith("version https://git-lfs.github.com/spec/v1"));
assert(fs.readFileSync(path.join(clone, ".gitattributes"), "utf8").includes("assets/large.bin filter=lfs"));

const decrypted = run(age, ["-d", "-i", identity, path.join(clone, "pages", "Secret.md")]).stdout;
assert(decrypted.includes(secret));
assert(decrypted.includes("changed after first sync"));
assert(decrypted.includes("tags:: encrypted"));

const decryptInPlace = run("node", [helper, "decrypt-working-tree", "--age-path", age, "--identity-path", identity], { cwd: clone });
assert.match(decryptInPlace.stdout, /decrypted files: 2/);
assert(fs.readFileSync(path.join(clone, "pages", "Secret.md"), "utf8").includes(secret));
assert(fs.readFileSync(path.join(clone, "assets", "config.yaml"), "utf8").includes(secret));


const secondRemote = path.join(tmp, "second-remote.git");
const secondClone = path.join(tmp, "second-clone");
run("git", ["init", "--bare", secondRemote]);
const secondSync = run("node", [
  helper,
  "sync",
  "--repo-url", secondRemote,
  "--branch", "master",
  "--age-path", age,
  "--recipients-path", recipients,
  "--encrypted-tags", "encrypted",
  "--commit-message", "test encrypted sync to new remote",
], { cwd: graph });
assert.match(secondSync.stdout, /sync complete/);
run("git", ["clone", secondRemote, secondClone]);
assert(fs.readFileSync(path.join(secondClone, "pages", "Secret.md"), "utf8").startsWith("age-encryption.org/v1"));

const badGraph = path.join(tmp, "bad-graph");
fs.mkdirSync(path.join(badGraph, "pages"), { recursive: true });
run("git", ["init"], { cwd: badGraph });
write(path.join(badGraph, "pages", "Leak.md"), `- api_key = ${secret}\n`);
const scan = run("node", [helper, "scan", "--encrypted-tags", "encrypted"], { cwd: badGraph, allowFailure: true });
assert.strictEqual(scan.status, 2);
assert(scan.stdout.includes("pages/Leak.md:1"));
assert(!scan.stdout.includes(secret));

// Additional test: Multiline secret detection
const multilineGraph = path.join(tmp, "multiline-graph");
fs.mkdirSync(path.join(multilineGraph, "pages"), { recursive: true });
run("git", ["init"], { cwd: multilineGraph });
write(path.join(multilineGraph, "pages", "MultilineLeak.md"), `api_key: "
${secret}
"\n`);
const multilineScan = run("node", [helper, "scan", "--encrypted-tags", "encrypted"], {
  cwd: multilineGraph,
  allowFailure: true
});
assert.strictEqual(multilineScan.status, 2);
assert(multilineScan.stdout.includes("pages/MultilineLeak.md"));
assert(!multilineScan.stdout.includes(secret));

// Additional test: Verify encrypted files are not scanned
const encryptedGraph = path.join(tmp, "encrypted-graph");
fs.mkdirSync(path.join(encryptedGraph, "pages"), { recursive: true });
run("git", ["init"], { cwd: encryptedGraph });
const encryptedContent = `tags:: encrypted\n- secret = ${secret}\n`;
write(path.join(encryptedGraph, "pages", "EncryptedSecret.md"), encryptedContent);
const encryptedScan = run("node", [helper, "scan", "--encrypted-tags", "encrypted"], {
  cwd: encryptedGraph,
  allowFailure: true
});
// Should pass because file is tagged
assert.strictEqual(encryptedScan.status, 0);

// Cleanup
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (_) {
  // Best effort cleanup
}

console.log("sync-helper tests passed");
