const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pluginRoot = path.resolve(__dirname, "..");
const coreCode = fs.readFileSync(path.join(pluginRoot, "dist", "sync-core.js"), "utf8");
const mainCode = fs.readFileSync(path.join(pluginRoot, "dist", "main.js"), "utf8");
const fetchCalls = [];
let readyPromise;

const context = {
  console,
  URL,
  fetch: async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      async text() {
        return JSON.stringify({ exitCode: 0, stdout: "sync complete", stderr: "" });
      }
    };
  },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout(fn) { Promise.resolve().then(fn); return 1; },
  document: {
    currentScript: null,
    scripts: [
      { src: `file://${pluginRoot}/dist/lsplugin.user.js` },
      { src: `file://${pluginRoot}/dist/sync-core.js` },
      { src: `file://${pluginRoot}/dist/main.js` }
    ],
    getElementsByTagName(name) {
      return name === "script" ? this.scripts : [];
    }
  },
  window: {},
  logseq: {
    settings: {
      repoUrl: "git@github.com:kadaliao/logseq-graph.git",
      branch: "master",
      remoteName: "origin",
      encryptedSync: true,
      syncServerUrl: "http://127.0.0.1:31937"
    },
    UI: { showMsg() {} },
    App: {
      registerUIItem() {},
      registerCommandPalette() {}
    },
    provideModel(model) {
      this.model = model;
    },
    useSettingsSchema() {},
    ready(fn) {
      readyPromise = Promise.resolve(fn());
      return readyPromise;
    }
  }
};
context.globalThis = context;
context.window = context;

vm.createContext(context);
vm.runInContext(coreCode, context);
vm.runInContext(mainCode, context);

(async () => {
  await readyPromise;
  context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(fetchCalls.length, 1, "expected local sync server call");
  assert.strictEqual(fetchCalls[0].url, "http://127.0.0.1:31937/sync");
  const body = JSON.parse(fetchCalls[0].options.body);
  assert.strictEqual(body.settings.repoUrl, "git@github.com:kadaliao/logseq-graph.git");
  assert.strictEqual(body.settings.branch, "master");
  console.log("main plugin root tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
