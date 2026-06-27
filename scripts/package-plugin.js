#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PLUGIN_NAME = "logseq-github-auto-sync";
const ROOT = path.resolve(__dirname, "..");

const FILES = [
  "package.json",
  "plugin.json",
  "README.md",
  "README-zh.md",
  "QUICKSTART.md",
  "QUICKSTART-zh.md",
  "ENCRYPTION-GUIDE.md",
  "ENCRYPTION-GUIDE-zh.md",
  "ARCHITECTURE.md",
  "ARCHITECTURE-zh.md",
  "CONTRIBUTING.md",
  "CONTRIBUTING-zh.md",
  "icon.svg",
];

const DIRS = [
  "dist",
  "scripts",
];

function parseArgs(argv) {
  const options = {
    out: path.join(ROOT, "release"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      options.out = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyEntry(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyEntry(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, stat.mode);
}

function assertExists(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required release entry is missing: ${relativePath}`);
  }
  return fullPath;
}

function runZip(workDir, zipPath, packageDirName) {
  const result = spawnSync("zip", ["-r", "-q", zipPath, packageDirName], {
    cwd: workDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(`zip failed: ${result.stderr || result.stdout || (result.error && result.error.message) || "unknown error"}`);
  }
}

function main() {
  const options = parseArgs(process.argv);
  const pkg = readPackage();
  const outDir = options.out;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${PLUGIN_NAME}-package-`));
  const packageRoot = path.join(tempRoot, PLUGIN_NAME);
  const zipName = `${PLUGIN_NAME}-${pkg.version}.zip`;
  const zipPath = path.join(outDir, zipName);

  try {
    rmrf(outDir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(packageRoot, { recursive: true });

    for (const file of FILES) {
      copyEntry(assertExists(file), path.join(packageRoot, file));
    }

    for (const dir of DIRS) {
      copyEntry(assertExists(dir), path.join(packageRoot, dir));
    }

    runZip(tempRoot, zipPath, PLUGIN_NAME);
    console.log(`created ${zipPath}`);
  } finally {
    rmrf(tempRoot);
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
