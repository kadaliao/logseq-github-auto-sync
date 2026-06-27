const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const pluginRoot = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-package-test-"));
const outDir = path.join(tmp, "release output");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || pluginRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return result;
}

try {
  const result = run("node", ["scripts/package-plugin.js", "--out", outDir]);
  assert.match(result.stdout, /created .+logseq-github-auto-sync-0\.2\.0\.zip/);

  const zipPath = path.join(outDir, "logseq-github-auto-sync-0.2.0.zip");
  assert(fs.existsSync(zipPath), "expected release zip to exist");

  const listing = run("unzip", ["-Z1", zipPath]).stdout.trim().split(/\r?\n/).sort();
  const requiredEntries = [
    "logseq-github-auto-sync/dist/index.html",
    "logseq-github-auto-sync/dist/main.js",
    "logseq-github-auto-sync/dist/sync-core.js",
    "logseq-github-auto-sync/icon.svg",
    "logseq-github-auto-sync/package.json",
    "logseq-github-auto-sync/plugin.json",
    "logseq-github-auto-sync/README.md",
    "logseq-github-auto-sync/scripts/sync-helper.js",
    "logseq-github-auto-sync/scripts/sync-server.js",
  ];
  for (const entry of requiredEntries) {
    assert(listing.includes(entry), `missing zip entry: ${entry}`);
  }
  assert(!listing.some((entry) => entry.includes("/test/")), "release zip should not include tests");
  assert(!listing.some((entry) => entry.includes("/.git/")), "release zip should not include git metadata");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("package plugin tests passed");
