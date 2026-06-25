#!/usr/bin/env node
"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const PORT = Number(process.env.LOGSEQ_GITHUB_SYNC_PORT || 31937);
const HOST = process.env.LOGSEQ_GITHUB_SYNC_HOST || "127.0.0.1";
const GRAPH_ROOT = expandHome(process.env.LOGSEQ_GITHUB_SYNC_GRAPH || "~/logseq-graph");
const SETTINGS_PATH = expandHome(process.env.LOGSEQ_GITHUB_SYNC_SETTINGS || "~/.logseq/settings/logseq-github-auto-sync.json");
const HELPER = path.join(__dirname, "sync-helper.js");
const NODE = process.execPath;
const MAX_BODY = 1024 * 1024;
const ALLOWED_COMMANDS = new Set(["sync", "scan"]);

function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (_error) {
    return {};
  }
}

function normalizeSettings(raw) {
  const cfg = Object.assign({}, readSettings(), raw || {});
  const pick = (key, fallback) => cfg[key] == null || cfg[key] === "" ? fallback : cfg[key];
  return {
    repoUrl: pick("repoUrl", ""),
    branch: pick("branch", "master"),
    remoteName: pick("remoteName", "origin"),
    agePath: pick("agePath", "/opt/homebrew/bin/age"),
    recipientsPath: pick("recipientsPath", "~/.config/logseq-github-auto-sync/recipients.txt"),
    identityPath: pick("identityPath", "~/.config/logseq-github-auto-sync/identity.txt"),
    largeFileStorage: Boolean(cfg.largeFileStorage),
    lfsThresholdMb: Number(pick("lfsThresholdMb", 50)),
    encryptedTags: pick("encryptedTags", "encrypted, secret"),
    commitMessage: pick("commitMessage", "Auto sync Logseq graph"),
    pullBeforePush: cfg.pullBeforePush !== false
  };
}

function helperArgs(command, cfg) {
  const args = [
    HELPER,
    command,
    "--branch", cfg.branch,
    "--remote-name", cfg.remoteName,
    "--age-path", cfg.agePath,
    "--recipients-path", cfg.recipientsPath,
    "--identity-path", cfg.identityPath,
    "--large-file-storage", String(cfg.largeFileStorage),
    "--lfs-threshold-mb", String(cfg.lfsThresholdMb),
    "--encrypted-tags", cfg.encryptedTags,
    "--commit-message", cfg.commitMessage,
    "--pull-before-push", String(cfg.pullBeforePush)
  ];
  if (cfg.repoUrl) args.push("--repo-url", cfg.repoUrl);
  return args;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(data);
}

function run(command, cfg) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`
    });
    const child = spawn(NODE, helperArgs(command, cfg), {
      cwd: GRAPH_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: stderr + error.message }));
    child.on("close", (code) => resolve({ exitCode: code == null ? 1 : code, stdout, stderr }));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, graphRoot: GRAPH_ROOT });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });

  const command = String(req.url || "").replace(/^\//, "");
  if (!ALLOWED_COMMANDS.has(command)) return send(res, 404, { error: "unknown command" });

  try {
    const rawBody = await readBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const cfg = normalizeSettings(body.settings || {});
    const result = await run(command, cfg);
    send(res, result.exitCode === 0 ? 200 : 500, result);
  } catch (error) {
    send(res, 500, { exitCode: 1, stdout: "", stderr: error && error.message ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`logseq-github-auto-sync server listening on http://${HOST}:${PORT}`);
  console.log(`graph root: ${GRAPH_ROOT}`);
});
