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
  const providedUis = [];
  const styles = [];
  let readyPromise;
  let mainUIVisible = false;
  const ctx = {
    console,
    URL,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      const result = overrides.fetchResult || {
        exitCode: 0,
        stdout: "source graph git status: clean\nsync complete: committed=true encrypted_files=1 lfs_files=0",
        stderr: ""
      };
      return {
        ok: result.exitCode === 0,
        async text() {
          return JSON.stringify(result);
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
      provideUI(ui) {
        providedUis.push(ui);
      },
      provideStyle(style) {
        styles.push(style);
      },
      setMainUIInlineStyle(style) {
        this.mainUIStyle = style;
      },
      showMainUI() {
        mainUIVisible = true;
      },
      hideMainUI() {
        mainUIVisible = false;
      },
      showSettingsUI() {
        this.settingsVisible = true;
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
  return {
    context: ctx,
    fetchCalls,
    messages,
    commands,
    uiItems,
    providedUis,
    styles,
    get mainUIVisible() { return mainUIVisible; },
    get readyPromise() { return readyPromise; }
  };
}

(async () => {
  const { context, fetchCalls, messages, commands, uiItems, providedUis, styles, readyPromise } = createContext();
  await readyPromise;
  assert(styles.some((item) => item.key === "github-auto-sync-ui"), "expected plugin UI styles");
  const toolbar = uiItems.find((item) => item.type === "toolbar" && item.item.key === "github-auto-sync");
  assert(toolbar, "expected toolbar item");
  assert(toolbar.item.template.includes("githubAutoSyncMenu"), "expected toolbar menu action");
  assert(!toolbar.item.template.includes("githubAutoSyncHistory"), "toolbar should not expose history as a second icon");
  assert(!toolbar.item.template.includes("githubAutoSyncSettings"), "toolbar should not expose settings as a third icon");
  assert.strictEqual((toolbar.item.template.match(/data-on-click/g) || []).length, 1, "toolbar should expose one clickable icon");

  context.logseq.model.githubAutoSyncMenu();
  assert.strictEqual(providedUis.length, 1, "expected toolbar click to render a menu");
  assert(providedUis[0].template.includes("github-auto-sync-popover-menu"), "expected toolbar click to render a compact menu");
  assert(!providedUis[0].template.includes("Current status"), "toolbar menu should not render the full status panel");
  assert(!providedUis[0].template.includes("github-auto-sync-status-card"), "toolbar menu should not render status cards");
  assert(providedUis[0].template.includes("Sync now"), "expected menu sync action");
  assert(providedUis[0].template.includes("Show status"), "expected menu status action");
  assert(providedUis[0].template.includes("Recent history"), "expected menu history action");
  assert(providedUis[0].template.includes("Open settings"), "expected menu settings action");
  assert.strictEqual(context.logseq.mainUIStyle.position, "fixed", "expected popover to be fixed");
  assert.strictEqual(context.logseq.mainUIStyle.width, "320px", "expected compact popover width");
  assert.strictEqual(context.logseq.mainUIStyle.maxWidth, "calc(100vw - 24px)", "expected mobile-safe popover width");
  assert.strictEqual(context.logseq.mainUIStyle.height, "auto", "expected popover not to fill page height");
  assert.strictEqual(context.logseq.mainUIStyle.background, "transparent", "expected transparent outer main UI");
  assert.strictEqual(context.logseq.mainUIStyle.pointerEvents, "auto", "expected popover actions to remain clickable");

  context.logseq.model.githubAutoSyncStatus();
  assert(
    providedUis.at(-1).template.includes("Current status") &&
      providedUis.at(-1).template.includes("Source graph Git") &&
      providedUis.at(-1).template.includes("github-auto-sync-status-row"),
    "expected status action to render compact status rows"
  );

  const fetchesBeforeSync = fetchCalls.length;
  context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(fetchCalls.length, fetchesBeforeSync + 1, "expected one local sync server call");
  const syncCall = fetchCalls[fetchesBeforeSync];
  assert.strictEqual(syncCall.url, "http://127.0.0.1:31937/sync");
  const body = JSON.parse(syncCall.options.body);
  assert.strictEqual(body.settings.repoUrl, "git@github.com:kadaliao/logseq-graph.git");
  assert.strictEqual(body.settings.branch, "master");
  assert.strictEqual(body.settings.authorName, "");
  assert.strictEqual(body.settings.authorEmail, "");
  assert(messages.some((item) => item.message.includes("Sync started")), "expected start status message");
  assert(messages.some((item) => item.message.includes("GitHub staging sync complete")), "expected completion summary");
  assert(!messages.some((item) => item.message.includes("source graph git status")), "expected detailed stdout to be hidden by default");
  assert(commands.some((item) => item.command.key === "github-auto-sync-last-log"), "expected last log command");
  assert(commands.some((item) => item.command.key === "github-auto-sync-history"), "expected sync history command");
  assert(context.logseq.settingsSchema.some((item) => item.key === "authorName"), "expected author name setting");
  assert(context.logseq.settingsSchema.some((item) => item.key === "authorEmail"), "expected author email setting");
  assert(context.logseq.settingsSchema.some((item) => item.key === "showDetailedLogs"), "expected detailed log setting");

  const lastLogCommand = commands.find((item) => item.command.key === "github-auto-sync-last-log");
  lastLogCommand.handler();
  assert(
    messages.some((item) => item.message.includes("source graph git status")),
    "expected last sync log command to show cached helper output"
  );

  const historyCommand = commands.find((item) => item.command.key === "github-auto-sync-history");
  historyCommand.handler();
  assert(
    providedUis.some((item) => item.template.includes("Recent GitHub Auto Sync history") && item.template.includes("✅") && item.template.includes("toolbar")),
    "expected sync history panel to show successful recent sync entries"
  );

  const dirty = createContext({
    fetchResult: {
      exitCode: 0,
      stdout: "source graph git status: dirty tracked_changes=3 untracked=2 deleted=1\nsync complete: committed=true encrypted_files=1 lfs_files=0",
      stderr: ""
    }
  });
  await dirty.readyPromise;
  dirty.context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  dirty.context.logseq.model.githubAutoSyncHistory();
  assert(
    dirty.providedUis.some((item) =>
      item.template.includes("Recent GitHub Auto Sync history") &&
      item.template.includes("⚠") &&
      item.template.includes("Source graph Git still has local changes")
    ),
    "expected dirty source graph Git to be recorded as a warning"
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
    detailed.messages.some((item) => item.message.includes("source graph git status")),
    "expected detailed stdout when detailed logs are enabled"
  );

  const warning = createContext({ settings: { repoUrl: "" } });
  await warning.readyPromise;
  warning.context.logseq.model.githubAutoSyncNow();
  await new Promise((resolve) => setTimeout(resolve, 20));
  warning.context.logseq.model.githubAutoSyncHistory();
  assert(
    warning.providedUis.some((item) => item.template.includes("Recent GitHub Auto Sync history") && item.template.includes("⚠") && item.template.includes("GitHub repo URL")),
    "expected sync history panel to distinguish warning entries"
  );

  console.log("main plugin root tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
