const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pluginRoot = path.resolve(__dirname, "..");
const coreCode = fs.readFileSync(path.join(pluginRoot, "dist", "sync-core.js"), "utf8");
const mainCode = fs.readFileSync(path.join(pluginRoot, "dist", "main.js"), "utf8");
function createContext(overrides = {}) {
  const fetchCalls = [];
  const messages = [];
  const commands = [];
  const uiItems = [];
  let readyPromise;
  const ctx = {
    console,
    URL,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        async text() {
          return JSON.stringify({ exitCode: 0, stdout: "raw helper stdout with branch detail", stderr: "" });
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
      settings: Object.assign({
        repoUrl: "git@github.com:kadaliao/logseq-graph.git",
        branch: "master",
        remoteName: "origin",
        encryptedSync: true,
        syncServerUrl: "http://127.0.0.1:31937"
      }, overrides.settings || {}),
      UI: {
        showMsg(message, type) {
          messages.push({ message, type });
        }
      },
      App: {
        registerUIItem(type, item) {
          uiItems.push({ type, item });
        },
        registerCommandPalette(command, handler) {
          commands.push({ command, handler });
        }
      },
      provideModel(model) {
        this.model = model;
      },
      useSettingsSchema(schema) {
        this.settingsSchema = schema;
      },
      ready(fn) {
        readyPromise = Promise.resolve(fn());
        return readyPromise;
      }
    }
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(coreCode, ctx);
  vm.runInContext(mainCode, ctx);
  return { context: ctx, fetchCalls, messages, commands, uiItems, get readyPromise() { return readyPromise; } };
}

(async () => {
  const { context, fetchCalls, messages, commands, uiItems, readyPromise } = createContext();
  await readyPromise;
  const toolbar = uiItems.find((item) => item.type === "toolbar" && item.item.key === "github-auto-sync");
  assert(toolbar, "expected toolbar item");
  assert(toolbar.item.template.includes("githubAutoSyncNow"), "expected toolbar sync action");
  assert(toolbar.item.template.includes("githubAutoSyncHistory"), "expected toolbar history action");
  assert(toolbar.item.template.includes("githubAutoSyncSettings"), "expected toolbar settings action");

  context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(fetchCalls.length, 1, "expected local sync server call");
  assert.strictEqual(fetchCalls[0].url, "http://127.0.0.1:31937/sync");
  const body = JSON.parse(fetchCalls[0].options.body);
  assert.strictEqual(body.settings.repoUrl, "git@github.com:kadaliao/logseq-graph.git");
  assert.strictEqual(body.settings.branch, "master");
  assert.strictEqual(body.settings.authorName, "");
  assert.strictEqual(body.settings.authorEmail, "");
  assert(messages.some((item) => item.message.includes("Sync started")), "expected start status message");
  assert(messages.some((item) => item.message.includes("Encrypted GitHub sync complete")), "expected completion summary");
  assert(!messages.some((item) => item.message.includes("raw helper stdout")), "expected detailed stdout to be hidden by default");
  assert(commands.some((item) => item.command.key === "github-auto-sync-last-log"), "expected last log command");
  assert(commands.some((item) => item.command.key === "github-auto-sync-history"), "expected sync history command");
  assert(context.logseq.settingsSchema.some((item) => item.key === "authorName"), "expected author name setting");
  assert(context.logseq.settingsSchema.some((item) => item.key === "authorEmail"), "expected author email setting");
  assert(context.logseq.settingsSchema.some((item) => item.key === "showDetailedLogs"), "expected detailed log setting");

  const lastLogCommand = commands.find((item) => item.command.key === "github-auto-sync-last-log");
  lastLogCommand.handler();
  assert(
    messages.some((item) => item.message.includes("raw helper stdout")),
    "expected last sync log command to show cached helper output"
  );

  const historyCommand = commands.find((item) => item.command.key === "github-auto-sync-history");
  historyCommand.handler();
  assert(
    messages.some((item) => item.message.includes("Recent GitHub Auto Sync history") && item.message.includes("toolbar")),
    "expected sync history command to show recent sync entries"
  );

  const authored = createContext({
    settings: {
      authorName: "Kada Liao",
      authorEmail: "kadaliao@gmail.com",
    },
  });
  await authored.readyPromise;
  authored.context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const authoredBody = JSON.parse(authored.fetchCalls[0].options.body);
  assert.strictEqual(authoredBody.settings.authorName, "Kada Liao");
  assert.strictEqual(authoredBody.settings.authorEmail, "kadaliao@gmail.com");

  const detailed = createContext({ settings: { showDetailedLogs: true } });
  await detailed.readyPromise;
  detailed.context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    detailed.messages.some((item) => item.message.includes("raw helper stdout")),
    "expected detailed stdout when detailed logs are enabled"
  );

  console.log("main plugin root tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
