const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const gitOps = require("../src/git/operations.js");
const fileWalker = require("../src/file/walker.js");
const ageCrypto = require("../src/crypto/age-crypto.js");

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return result;
}

function write(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode == null ? undefined : { mode });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-src-modules-test-"));

try {
  const remote = path.join(tmp, "remote.git");
  const writer = path.join(tmp, "writer");
  const staging = path.join(tmp, "staging repo");

  run("git", ["init", "--bare", remote]);
  fs.mkdirSync(writer, { recursive: true });
  run("git", ["init"], { cwd: writer });
  run("git", ["config", "user.name", "Module Test"], { cwd: writer });
  run("git", ["config", "user.email", "module@test.invalid"], { cwd: writer });
  write(path.join(writer, "README.md"), "hello\n");
  run("git", ["add", "README.md"], { cwd: writer });
  run("git", ["commit", "-m", "init"], { cwd: writer });
  run("git", ["branch", "-M", "main"], { cwd: writer });
  run("git", ["remote", "add", "origin", remote], { cwd: writer });
  run("git", ["push", "-u", "origin", "main"], { cwd: writer });

  fs.mkdirSync(staging, { recursive: true });
  run("git", ["init"], { cwd: staging });
  run("git", ["remote", "add", "origin", remote], { cwd: staging });
  assert.strictEqual(gitOps.remoteBranchExists(staging, "origin", "main"), true);
  assert.strictEqual(gitOps.remoteBranchExists(staging, "origin", "missing"), false);

  const fakeBin = path.join(tmp, "fake-bin");
  const fakeLog = path.join(tmp, "fake-rsync-args.json");
  fs.mkdirSync(fakeBin, { recursive: true });
  write(path.join(fakeBin, "rsync"), `#!/usr/bin/env node
const fs = require("fs");
fs.writeFileSync(${JSON.stringify(fakeLog)}, JSON.stringify(process.argv.slice(2)));
`, 0o755);

  const oldPath = process.env.PATH;
  process.env.PATH = `${fakeBin}${path.delimiter}${oldPath || ""}`;
  try {
    fileWalker.copyGraphToStaging(path.join(tmp, "graph with spaces"), path.join(tmp, "stage with spaces"), ["skip this"]);
  } finally {
    process.env.PATH = oldPath;
  }
  const rsyncArgs = JSON.parse(fs.readFileSync(fakeLog, "utf8"));
  assert(rsyncArgs.includes("-a"));
  assert(rsyncArgs.includes("--delete"));
  assert(rsyncArgs.includes("--exclude=skip this"));
  assert(rsyncArgs.some((arg) => arg.endsWith("/graph with spaces/")));
  assert(rsyncArgs.some((arg) => arg.endsWith("/stage with spaces/")));

  const fakeAgeLog = path.join(tmp, "fake-age-args.json");
  const fakeAge = path.join(fakeBin, "fake age");
  write(fakeAge, `#!/usr/bin/env node
const fs = require("fs");
fs.writeFileSync(${JSON.stringify(fakeAgeLog)}, JSON.stringify(process.argv.slice(2)));
const outIndex = process.argv.indexOf("-o");
if (outIndex !== -1) fs.writeFileSync(process.argv[outIndex + 1], "age-encryption.org/v1\\n");
`, 0o755);
  const recipients = path.join(tmp, "recipients with spaces.txt");
  const plain = path.join(tmp, "plain input.txt");
  const encrypted = path.join(tmp, "encrypted output.txt");
  write(recipients, "age1test\n");
  write(plain, "secret\n");
  ageCrypto.encryptFile(fakeAge, recipients, plain, encrypted);
  const ageArgs = JSON.parse(fs.readFileSync(fakeAgeLog, "utf8"));
  assert.deepStrictEqual(ageArgs, ["-R", recipients, "-o", `${encrypted}.age-tmp-${ageArgs[3].split(".age-tmp-")[1]}`, plain]);
  assert(fs.readFileSync(encrypted, "utf8").startsWith("age-encryption.org/v1"));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("src module tests passed");
