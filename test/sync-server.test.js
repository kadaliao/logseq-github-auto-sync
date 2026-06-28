const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const pluginRoot = path.resolve(__dirname, "..");
const serverScript = path.join(pluginRoot, "scripts", "sync-server.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "logseq-server-test-"));
const graph = path.join(tmp, "graph");
const port = 32000 + Math.floor(Math.random() * 2000);
const nodeProbePort = port + 2000;
const nodeWrapperLog = path.join(tmp, "node-wrapper.log");
const nodeWrapper = path.join(tmp, "node-wrapper.js");
const nodeCommand = fs.existsSync("/opt/homebrew/bin/node")
  ? "/opt/homebrew/bin/node"
  : fs.existsSync(process.execPath)
    ? process.execPath
    : "node";

const serverSource = fs.readFileSync(serverScript, "utf8");
for (const hardcodedNodePath of ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]) {
  assert(
    !serverSource.includes(JSON.stringify(hardcodedNodePath)),
    `sync server should resolve node from PATH instead of hardcoding ${hardcodedNodePath}`
  );
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

write(nodeWrapper, `#!/usr/bin/env node
const fs = require("fs");
const { spawnSync } = require("child_process");
fs.appendFileSync(${JSON.stringify(nodeWrapperLog)}, process.argv.slice(2).join(" ") + "\\n");
const result = spawnSync(${JSON.stringify(nodeCommand)}, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status == null ? 1 : result.status);
`);
fs.chmodSync(nodeWrapper, 0o755);

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`server did not start\n${output}`)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("server listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}\n${output}`));
    });
  });
}

function request(portNumber, method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port: portNumber,
      path: requestPath,
      method,
      headers: Object.assign({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      }, headers),
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

(async () => {
  fs.mkdirSync(graph, { recursive: true });
  const badNodePath = path.join(tmp, "missing-node");
  const staleExecPathChild = spawn(nodeCommand, [
    "-e",
    `
process.execPath = ${JSON.stringify(badNodePath)};
require(${JSON.stringify(serverScript)});
setTimeout(() => {}, 1000000);
`
  ], {
    cwd: graph,
    env: Object.assign({}, process.env, {
      LOGSEQ_GITHUB_SYNC_GRAPH: graph,
      LOGSEQ_GITHUB_SYNC_PORT: String(nodeProbePort),
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(staleExecPathChild);
    const scan = await request(nodeProbePort, "POST", "/scan", { settings: {} }, { Origin: "lsp://logseq.io" });
    assert.strictEqual(scan.statusCode, 200);
    const payload = JSON.parse(scan.body);
    assert.strictEqual(payload.exitCode, 0);
    assert.notStrictEqual(payload.stderr.includes(`spawn ${badNodePath} ENOENT`), true);
  } finally {
    staleExecPathChild.kill();
  }

  write(path.join(graph, "pages", "A.md"), "- hello\n");
  const child = spawn(nodeCommand, [serverScript], {
    cwd: graph,
    env: Object.assign({}, process.env, {
      LOGSEQ_GITHUB_SYNC_GRAPH: graph,
      LOGSEQ_GITHUB_SYNC_PORT: String(port),
      LOGSEQ_GITHUB_SYNC_NODE: nodeWrapper,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const blocked = await request(port, "POST", "/scan", { settings: {} }, { Origin: "https://example.invalid" });
    assert.strictEqual(blocked.statusCode, 403);
    assert(!blocked.headers["access-control-allow-origin"]);

    const preflight = await request(port, "OPTIONS", "/scan", null, { Origin: "https://example.invalid" });
    assert.strictEqual(preflight.statusCode, 403);

    const allowed = await request(port, "POST", "/scan", { settings: {} }, { Origin: "lsp://logseq.io" });
    assert.strictEqual(allowed.statusCode, 200);
    assert.strictEqual(allowed.headers["access-control-allow-origin"], "lsp://logseq.io");
    const payload = JSON.parse(allowed.body);
    assert.strictEqual(payload.exitCode, 0);

    const authorScan = await request(port, "POST", "/scan", {
      settings: {
        authorName: "Kada Liao",
        authorEmail: "kadaliao@gmail.com",
      },
    }, { Origin: "lsp://logseq.io" });
    assert.strictEqual(authorScan.statusCode, 200);
    const authorPayload = JSON.parse(authorScan.body);
    assert.strictEqual(authorPayload.exitCode, 0);
    const helperArgsLog = fs.readFileSync(nodeWrapperLog, "utf8");
    assert.match(helperArgsLog, /--author-name Kada Liao/);
    assert.match(helperArgsLog, /--author-email kadaliao@gmail\.com/);
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("sync-server tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
