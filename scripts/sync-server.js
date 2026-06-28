#!/usr/bin/env node
"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const PORT = Number(process.env.LOGSEQ_GITHUB_SYNC_PORT || 31937);
const HOST = process.env.LOGSEQ_GITHUB_SYNC_HOST || "127.0.0.1";

/**
 * Detect the Logseq graph root directory.
 * Priority:
 * 1. LOGSEQ_GITHUB_SYNC_GRAPH environment variable (explicit)
 * 2. Current working directory (if it's a Logseq graph)
 * 3. Fallback to ~/logseq-graph (backward compatibility)
 */
function detectGraphRoot() {
  // 1. Environment variable
  const envGraph = process.env.LOGSEQ_GITHUB_SYNC_GRAPH;
  if (envGraph) return expandHome(envGraph);

  // 2. Current directory (check if it looks like a Logseq graph)
  try {
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, ".logseq")) || fs.existsSync(path.join(cwd, "logseq"))) {
      return cwd;
    }
  } catch (_) {}

  // 3. Default fallback
  return expandHome("~/logseq-graph");
}

const GRAPH_ROOT = detectGraphRoot();
const SETTINGS_PATH = expandHome(process.env.LOGSEQ_GITHUB_SYNC_SETTINGS || "~/.logseq/settings/logseq-github-auto-sync.json");
const HELPER = path.join(__dirname, "sync-helper.js");
const MAX_BODY = 1024 * 1024;
const ALLOWED_COMMANDS = new Set(["sync", "scan"]);
const ALLOWED_ORIGIN_PATTERNS = [
  /^lsp:\/\//i,
  /^logseq:\/\//i,
  /^app:\/\//i,
  /^file:\/\//i,
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i
];

function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function executableExists(commandPath) {
  return Boolean(commandPath && path.isAbsolute(commandPath) && fs.existsSync(commandPath));
}

function resolveNodeCommand() {
  const candidates = [
    process.env.LOGSEQ_GITHUB_SYNC_NODE,
    process.execPath,
    "node"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "node") return candidate;
    if (executableExists(candidate)) return candidate;
  }

  return "node";
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
    agePath: pick("agePath", "age"),
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(data);
}

function originAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function sendCors(res, req, status, payload) {
  const origin = req.headers.origin;
  const data = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  res.writeHead(status, headers);
  res.end(data);
}

function run(command, cfg) {
  return new Promise((resolve) => {
    const nodeCommand = resolveNodeCommand();
    const env = Object.assign({}, process.env, {
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`
    });
    const child = spawn(nodeCommand, helperArgs(command, cfg), {
      cwd: GRAPH_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message} (node: ${nodeCommand})` }));
    child.on("close", (code) => resolve({ exitCode: code == null ? 1 : code, stdout, stderr }));
  });
}

const server = http.createServer(async (req, res) => {
  if (!originAllowed(req.headers.origin)) {
    return send(res, 403, { error: "origin not allowed" });
  }
  if (req.method === "OPTIONS") return sendCors(res, req, 204, {});
  if (req.method === "GET" && req.url === "/health") {
    return sendCors(res, req, 200, { ok: true, graphRoot: GRAPH_ROOT });
  }
  if (req.method !== "POST") return sendCors(res, req, 405, { error: "method not allowed" });

  const command = String(req.url || "").replace(/^\//, "");
  if (!ALLOWED_COMMANDS.has(command)) return sendCors(res, req, 404, { error: "unknown command" });

  try {
    const rawBody = await readBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const cfg = normalizeSettings(body.settings || {});
    const result = await run(command, cfg);
    sendCors(res, req, result.exitCode === 0 ? 200 : 500, result);
  } catch (error) {
    sendCors(res, req, 500, { exitCode: 1, stdout: "", stderr: error && error.message ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`logseq-github-auto-sync server listening on http://${HOST}:${PORT}`);
  console.log(`graph root: ${GRAPH_ROOT}`);
});
