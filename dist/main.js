(function () {
  "use strict";

  const core = window.LogseqGitHubSyncCore;
  let timerId = null;
  let syncPromise = null;
  let lastStatus = "Not synced yet";
  let lastLog = "No sync log yet.";
  const syncHistory = [];

  // Safe API wrapper with feature detection
  const api = {
    showSettings: () => {
      if (typeof logseq?.showSettingsUI === "function") {
        logseq.showSettingsUI();
      } else {
        console.warn("logseq.showSettingsUI not available in this version");
      }
    },
    showMessage: (message, type) => {
      if (typeof logseq?.UI?.showMsg === "function") {
        logseq.UI.showMsg(String(message || "").slice(0, 1200), type || "success");
      } else {
        console.log(`[GitHub Auto Sync] ${type || "info"}: ${message}`);
      }
    }
  };

  const settingsSchema = [
    {
      key: "repoUrl",
      type: "string",
      default: "",
      title: "GitHub repo URL",
      description: "SSH or HTTPS remote, for example git@github.com:user/private-logseq.git."
    },
    {
      key: "branch",
      type: "string",
      default: "master",
      title: "Branch",
      description: "The branch to push from the encrypted staging repo."
    },
    {
      key: "remoteName",
      type: "string",
      default: "origin",
      title: "Remote name",
      description: "Usually origin."
    },
    {
      key: "syncServerUrl",
      type: "string",
      default: "http://127.0.0.1:31937",
      title: "Local sync server URL",
      description: "Local helper server used to run encrypted sync outside the Logseq plugin sandbox."
    },
    {
      key: "encryptedSync",
      type: "boolean",
      default: true,
      title: "Use encrypted staging sync",
      description: "Copy the graph to a local staging repo, encrypt tagged files, then push only the sanitized copy."
    },
    {
      key: "encryptedTags",
      type: "string",
      default: "encrypted, secret",
      title: "Encrypted tags",
      description: "Comma-separated Logseq tags. Files containing tags:: encrypted or #encrypted are encrypted in GitHub."
    },
    {
      key: "agePath",
      type: "string",
      default: "age",
      title: "age executable path",
      description: "age CLI command or path. Use age when it is available in PATH."
    },
    {
      key: "recipientsPath",
      type: "string",
      default: "~/.config/logseq-github-auto-sync/recipients.txt",
      title: "age recipients file",
      description: "Public recipient file used for encryption. Safe to back up."
    },
    {
      key: "identityPath",
      type: "string",
      default: "~/.config/logseq-github-auto-sync/identity.txt",
      title: "age identity file",
      description: "Private identity file used only by the restore/decrypt helper. Never commit or paste it."
    },
    {
      key: "largeFileStorage",
      type: "boolean",
      default: true,
      title: "Use Git LFS for large files",
      description: "Track large assets in the encrypted staging repo with Git LFS so GitHub accepts the full graph."
    },
    {
      key: "lfsThresholdMb",
      type: "number",
      default: 50,
      title: "Git LFS threshold MB",
      description: "Files at or above this size are tracked with Git LFS. GitHub rejects normal Git blobs over 100 MB."
    },
    {
      key: "autoSync",
      type: "boolean",
      default: false,
      title: "Enable timed auto sync",
      description: "Run encrypted sync on a timer while Logseq is open. Manual sync always remains available."
    },
    {
      key: "syncIntervalMinutes",
      type: "number",
      default: 15,
      title: "Sync interval minutes",
      description: "Minimum is 1 minute. Used only when timed auto sync is enabled."
    },
    {
      key: "syncOnStart",
      type: "boolean",
      default: false,
      title: "Sync after plugin starts",
      description: "Run one sync shortly after Logseq loads the plugin."
    },
    {
      key: "syncOnShutdown",
      type: "boolean",
      default: true,
      title: "Sync when Logseq closes",
      description: "Best-effort sync in the plugin beforeunload hook."
    },
    {
      key: "pullBeforePush",
      type: "boolean",
      default: true,
      title: "Pull with rebase before push",
      description: "Run git pull --rebase --autostash in the encrypted staging repo before pushing when the remote branch exists."
    },
    {
      key: "commitMessage",
      type: "string",
      default: "Auto sync Logseq graph",
      title: "Commit message",
      description: "Message used for automatic commits. A timestamp is appended."
    },
    {
      key: "authorName",
      type: "string",
      default: "",
      title: "Commit author name",
      description: "Leave empty to use this graph's git user.name, then global git user.name, then the plugin default."
    },
    {
      key: "authorEmail",
      type: "string",
      default: "",
      title: "Commit author email",
      description: "Leave empty to use this graph's git user.email, then global git user.email, then the plugin default."
    },
    {
      key: "showDetailedLogs",
      type: "boolean",
      default: false,
      title: "Show detailed sync logs",
      description: "Show command output in sync popups. Keep this off for quieter notifications."
    }
  ];

  function settings() {
    return core.normalizeSettings(logseq.settings || {});
  }

  function notify(message, type) {
    api.showMessage(message, type);
  }

  function syncServerUrl(cfg) {
    return String(cfg.syncServerUrl || "http://127.0.0.1:31937").replace(/\/+$/, "");
  }

  function cleanOutput(result) {
    return core.redactGitOutput(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`).trim();
  }

  function syncSummary(result) {
    const output = cleanOutput(result);
    const match = output.match(/sync complete: committed=(\w+) encrypted_files=(\d+) lfs_files=(\d+)/);
    if (!match) return "Encrypted GitHub sync complete.";
    const committed = match[1] === "true" ? "committed changes" : "no changes to commit";
    return `Encrypted GitHub sync complete: ${committed}, encrypted ${match[2]} file(s), LFS ${match[3]} file(s).`;
  }

  function rememberLog(status, result) {
    const output = cleanOutput(result);
    lastLog = `${status}\n${output || "No command output."}`.slice(0, 4000);
  }

  function rememberHistory(entry) {
    syncHistory.unshift(entry);
    if (syncHistory.length > 10) syncHistory.length = 10;
  }

  function showHistory() {
    if (syncHistory.length === 0) {
      notify("Recent GitHub Auto Sync history\nNo sync attempts in this Logseq session yet.", "info");
      return;
    }
    const lines = syncHistory.map((item, index) =>
      `${index + 1}. ${item.time} - ${item.trigger} - ${item.status}${item.summary ? ` - ${item.summary}` : ""}`
    );
    notify(`Recent GitHub Auto Sync history\n${lines.join("\n")}`, "info");
  }

  async function runHelper(command, cfg, options) {
    const url = `${syncServerUrl(cfg)}/${command}`;
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: cfg })
      });
    } catch (error) {
      throw new Error(
        "Local sync server is not reachable. Start the Logseq GitHub Auto Sync server, then try again. " +
          (error && error.message ? error.message : error)
      );
    }

    const text = await response.text();
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch (_error) {
      result = { exitCode: response.ok ? 0 : 1, stdout: text, stderr: "" };
    }

    const exitCode = Number(result.exitCode != null ? result.exitCode : response.ok ? 0 : 1);
    const normalized = {
      exitCode,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || "")
    };
    if (exitCode !== 0 && !(options && options.allowFailure)) {
      const output = core.redactGitOutput(normalized.stderr || normalized.stdout || `exit ${exitCode}`);
      throw new Error(output);
    }
    return normalized;
  }

  async function syncNow(trigger) {
    if (syncPromise) {
      notify("GitHub Auto Sync is already running.", "warning");
      return;
    }

    const cfg = settings();
    if (!cfg.encryptedSync) {
      notify("Plain direct push is disabled for safety. Keep encryptedSync enabled.", "error");
      return;
    }
    if (!cfg.repoUrl) {
      notify("Set GitHub repo URL in GitHub Auto Sync settings before syncing.", "warning");
      api.showSettings();
      return;
    }

    syncPromise = (async () => {
      try {
        notify(`GitHub Auto Sync: Sync started (${trigger || "manual"}).`, "info");
        const result = await runHelper("sync", cfg);
        lastStatus = `Last encrypted sync: ${new Date().toLocaleString()} (${trigger || "manual"})`;
        rememberLog(lastStatus, result);
        const output = cleanOutput(result);
        rememberHistory({
          time: new Date().toLocaleString(),
          trigger: trigger || "manual",
          status: "success",
          summary: syncSummary(result)
        });
        notify(cfg.showDetailedLogs && output ? `${syncSummary(result)}\n${output}` : syncSummary(result), "success");
      } catch (error) {
        lastStatus = `Last encrypted sync failed: ${new Date().toLocaleString()}`;
        lastLog = `${lastStatus}\n${core.redactGitOutput(error && error.message ? error.message : error)}`.slice(0, 4000);
        rememberHistory({
          time: new Date().toLocaleString(),
          trigger: trigger || "manual",
          status: "failed",
          summary: core.redactGitOutput(error && error.message ? error.message : error).slice(0, 180)
        });
        notify(lastLog, "error");
        throw error;
      } finally {
        syncPromise = null;
      }
    })();

    try {
      await syncPromise;
    } catch (_) {
      // Error already handled above
    }
  }

  async function showStatus() {
    const cfg = settings();
    const result = await runHelper("scan", cfg, { allowFailure: true });
    const output = core.redactGitOutput(result.stdout || result.stderr || "No status output.").trim();
    notify(`${lastStatus}\n${output.slice(0, 900)}`, result.exitCode === 0 ? "success" : "warning");
  }

  function showLastLog() {
    notify(lastLog, "info");
  }

  function reschedule() {
    // Clear existing timer first to prevent duplicates
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }

    const cfg = settings();
    if (cfg.autoSync && cfg.repoUrl) {
      const intervalMs = Math.max(60 * 1000, cfg.syncIntervalMinutes * 60 * 1000);
      timerId = setInterval(() => {
        syncNow("timer").catch((error) => console.error("GitHub Auto Sync timer failed", error));
      }, intervalMs);
    }
  }

  async function main() {
    logseq.provideModel({
      githubAutoSyncNow() {
        syncNow("toolbar").catch((error) => console.error(error));
      },
      githubAutoSyncSettings() {
        if (typeof logseq.showSettingsUI === "function") logseq.showSettingsUI();
      },
      githubAutoSyncHistory() {
        showHistory();
      }
    });

    logseq.App.registerUIItem("toolbar", {
      key: "github-auto-sync",
      template:
        '<div class="github-auto-sync-toolbar" style="display: inline-flex; align-items: center; gap: 2px">' +
        '<a class="button" data-on-click="githubAutoSyncNow" title="GitHub Auto Sync: encrypted sync now">' +
        '<span class="github-auto-sync-icon" style="font-size: 17px; line-height: 1">🔒</span>' +
        "</a>" +
        '<a class="button" data-on-click="githubAutoSyncHistory" title="GitHub Auto Sync: recent sync history">' +
        '<span class="github-auto-sync-icon" style="font-size: 15px; line-height: 1">🕘</span>' +
        "</a>" +
        '<a class="button" data-on-click="githubAutoSyncSettings" title="GitHub Auto Sync: open settings">' +
        '<span class="github-auto-sync-icon" style="font-size: 15px; line-height: 1">⚙</span>' +
        "</a>" +
        "</div>"
    });

    logseq.App.registerCommandPalette(
      { key: "github-auto-sync-now", label: "GitHub Auto Sync: encrypted sync now" },
      () => syncNow("palette").catch((error) => console.error(error))
    );
    logseq.App.registerCommandPalette(
      { key: "github-auto-sync-status", label: "GitHub Auto Sync: show encryption status" },
      () => showStatus().catch((error) => console.error(error))
    );
    logseq.App.registerCommandPalette(
      { key: "github-auto-sync-last-log", label: "GitHub Auto Sync: show last sync log" },
      () => showLastLog()
    );
    logseq.App.registerCommandPalette(
      { key: "github-auto-sync-history", label: "GitHub Auto Sync: show recent sync history" },
      () => showHistory()
    );
    logseq.App.registerCommandPalette(
      { key: "github-auto-sync-settings", label: "GitHub Auto Sync: open settings" },
      () => {
        if (typeof logseq.showSettingsUI === "function") logseq.showSettingsUI();
      }
    );

    if (typeof logseq.onSettingsChanged === "function") logseq.onSettingsChanged(() => reschedule());
    if (typeof logseq.beforeunload === "function") {
      logseq.beforeunload(async () => {
        const cfg = settings();
        if (cfg.syncOnShutdown && cfg.repoUrl) await syncNow("shutdown");
      });
    }

    reschedule();
    const cfg = settings();
    if (cfg.syncOnStart && cfg.repoUrl) {
      setTimeout(() => syncNow("startup").catch((error) => console.error(error)), 5000);
    }

    notify("GitHub Auto Sync loaded with encrypted staging enabled.", "success");
  }

  logseq.useSettingsSchema(settingsSchema);
  logseq.ready(main).catch((error) => console.error("GitHub Auto Sync failed to start", error));
})();
