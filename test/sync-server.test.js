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

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

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

function request(method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
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
  write(path.join(graph, "pages", "A.md"), "- hello\n");
  const child = spawn(process.execPath, [serverScript], {
    cwd: graph,
    env: Object.assign({}, process.env, {
      LOGSEQ_GITHUB_SYNC_GRAPH: graph,
      LOGSEQ_GITHUB_SYNC_PORT: String(port),
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const blocked = await request("POST", "/scan", { settings: {} }, { Origin: "https://example.invalid" });
    assert.strictEqual(blocked.statusCode, 403);
    assert(!blocked.headers["access-control-allow-origin"]);

    const preflight = await request("OPTIONS", "/scan", null, { Origin: "https://example.invalid" });
    assert.strictEqual(preflight.statusCode, 403);

    const allowed = await request("POST", "/scan", { settings: {} }, { Origin: "lsp://logseq.io" });
    assert.strictEqual(allowed.statusCode, 200);
    assert.strictEqual(allowed.headers["access-control-allow-origin"], "lsp://logseq.io");
    const payload = JSON.parse(allowed.body);
    assert.strictEqual(payload.exitCode, 0);
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("sync-server tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
