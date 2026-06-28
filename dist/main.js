(function () {
  "use strict";

  const core = window.LogseqGitHubSyncCore;
  let timerId = null;
  let syncPromise = null;
  let lastStatus = "Not synced yet";
  let lastLog = "No sync log yet.";
  const syncHistory = [];
  const panelKey = "github-auto-sync-panel";
  let statusPanel = {
    sync: { icon: "⚪", label: "Not synced yet", detail: "No sync attempt in this Logseq session yet." },
    source: { icon: "⚪", label: "Source graph Git", detail: "Unknown until the helper runs." }
  };

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
    if (!match) return "GitHub staging sync complete.";
    const committed = match[1] === "true" ? "committed changes" : "no changes to commit";
    return `GitHub staging sync complete: ${committed}, encrypted ${match[2]} file(s), LFS ${match[3]} file(s).`;
  }

  function sourceGraphStatus(result) {
    const output = cleanOutput(result);
    const match = output.match(/source graph git status: ([^\n]+)/);
    if (!match) {
      return { state: "unknown", icon: "⚪", label: "Source graph Git", detail: "Not reported by helper." };
    }
    const value = match[1].trim();
    if (value === "clean") {
      return { state: "clean", icon: "✅", label: "Source graph Git clean", detail: "The original graph Git working tree is clean." };
    }
    if (value.startsWith("dirty")) {
      const tracked = (value.match(/tracked_changes=(\d+)/) || [])[1] || "0";
      const untracked = (value.match(/untracked=(\d+)/) || [])[1] || "0";
      const deleted = (value.match(/deleted=(\d+)/) || [])[1] || "0";
      return {
        state: "dirty",
        icon: "⚠",
        label: "Source graph Git still has local changes",
        detail: `${tracked} tracked, ${untracked} untracked, ${deleted} deleted. GitHub staging sync can still be complete.`
      };
    }
    return { state: "unknown", icon: "⚠", label: "Source graph Git status unavailable", detail: value };
  }

  function rememberLog(status, result) {
    const output = cleanOutput(result);
    lastLog = `${status}\n${output || "No command output."}`.slice(0, 4000);
  }

  function rememberHistory(entry) {
    syncHistory.unshift(entry);
    if (syncHistory.length > 10) syncHistory.length = 10;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function historyIcon(status) {
    if (status === "success") return "✅";
    if (status === "warning") return "⚠";
    if (status === "failed") return "❌";
    return "•";
  }

  function panelActionsHtml() {
    return [
      '<button data-on-click="githubAutoSyncNow" class="github-auto-sync-menu-button primary">Sync now</button>',
      '<button data-on-click="githubAutoSyncShowHistory" class="github-auto-sync-menu-button">Recent history</button>',
      '<button data-on-click="githubAutoSyncSettings" class="github-auto-sync-menu-button">Open settings</button>',
      '<button data-on-click="githubAutoSyncClosePanel" class="github-auto-sync-menu-button ghost">Close</button>'
    ].join("");
  }

  function historyHtml(limit) {
    const items = syncHistory.slice(0, limit || 5);
    if (items.length === 0) {
      return '<div class="github-auto-sync-empty">No sync attempts in this Logseq session yet.</div>';
    }
    return items.map((item) =>
      `<div class="github-auto-sync-history-row ${escapeHtml(item.status)}">` +
      `<span class="github-auto-sync-history-icon">${historyIcon(item.status)}</span>` +
      '<span class="github-auto-sync-history-body">' +
      `<strong>${escapeHtml(item.time)} · ${escapeHtml(item.trigger)}</strong>` +
      `<small>${escapeHtml(item.summary || item.status)}</small>` +
      "</span>" +
      "</div>"
    ).join("");
  }

  function renderPanel(title, options) {
    const opts = Object.assign({ historyLimit: 4, historyOnly: false }, options || {});
    const body = opts.historyOnly
      ? `<section><h2>Recent GitHub Auto Sync history</h2>${historyHtml(10)}</section>`
      : [
        '<section><h2>Current status</h2>',
        '<div class="github-auto-sync-status-grid">',
        '<div class="github-auto-sync-status-card">',
        `<span>${escapeHtml(statusPanel.sync.icon)}</span><strong>${escapeHtml(statusPanel.sync.label)}</strong>`,
        `<small>${escapeHtml(statusPanel.sync.detail)}</small>`,
        '</div>',
        '<div class="github-auto-sync-status-card">',
        `<span>${escapeHtml(statusPanel.source.icon)}</span><strong>${escapeHtml(statusPanel.source.label)}</strong>`,
        `<small>${escapeHtml(statusPanel.source.detail)}</small>`,
        '</div>',
        '</div></section>',
        `<section><h2>Recent history</h2>${historyHtml(opts.historyLimit)}</section>`
      ].join("");

    const template =
      '<main class="github-auto-sync-panel">' +
      `<header><h1>${escapeHtml(title || "GitHub Auto Sync")}</h1><button data-on-click="githubAutoSyncClosePanel" aria-label="Close">×</button></header>` +
      body +
      `<footer>${panelActionsHtml()}</footer>` +
      '</main>';

    if (typeof logseq.provideUI === "function") logseq.provideUI({ key: panelKey, template });
    if (typeof logseq.setMainUIInlineStyle === "function") {
      logseq.setMainUIInlineStyle({
        position: "fixed",
        top: "52px",
        right: "18px",
        width: "420px",
        maxWidth: "calc(100vw - 24px)",
        zIndex: 9999
      });
    }
    if (typeof logseq.showMainUI === "function") logseq.showMainUI({ autoFocus: false });
  }

  function showHistory() {
    renderPanel("GitHub Auto Sync", { historyOnly: true });
  }

  function showMenu() {
    renderPanel("GitHub Auto Sync");
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
      rememberHistory({
        time: new Date().toLocaleString(),
        trigger: trigger || "manual",
        status: "warning",
        summary: "GitHub Auto Sync is already running."
      });
      statusPanel.sync = { icon: "⚠", label: "Sync already running", detail: "Wait for the current helper run to finish." };
      showMenu();
      return;
    }

    const cfg = settings();
    if (!cfg.encryptedSync) {
      const summary = "Plain direct push is disabled for safety. Keep encryptedSync enabled.";
      notify(summary, "error");
      rememberHistory({ time: new Date().toLocaleString(), trigger: trigger || "manual", status: "failed", summary });
      statusPanel.sync = { icon: "❌", label: "Sync blocked", detail: summary };
      showMenu();
      return;
    }
    if (!cfg.repoUrl) {
      const summary = "Set GitHub repo URL in GitHub Auto Sync settings before syncing.";
      notify(summary, "warning");
      rememberHistory({ time: new Date().toLocaleString(), trigger: trigger || "manual", status: "warning", summary });
      statusPanel.sync = { icon: "⚠", label: "Sync needs configuration", detail: summary };
      showMenu();
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
        const sourceStatus = sourceGraphStatus(result);
        const isWarning = sourceStatus.state === "dirty" || sourceStatus.state === "unknown";
        const summary = isWarning ? `${sourceStatus.label}: ${sourceStatus.detail}` : syncSummary(result);
        statusPanel.sync = {
          icon: "✅",
          label: "GitHub staging sync complete",
          detail: syncSummary(result)
        };
        statusPanel.source = sourceStatus;
        rememberHistory({
          time: new Date().toLocaleString(),
          trigger: trigger || "manual",
          status: isWarning ? "warning" : "success",
          summary
        });
        notify(cfg.showDetailedLogs && output ? `${syncSummary(result)}\n${output}` : syncSummary(result), isWarning ? "warning" : "success");
        showMenu();
      } catch (error) {
        lastStatus = `Last encrypted sync failed: ${new Date().toLocaleString()}`;
        lastLog = `${lastStatus}\n${core.redactGitOutput(error && error.message ? error.message : error)}`.slice(0, 4000);
        statusPanel.sync = {
          icon: "❌",
          label: "GitHub staging sync failed",
          detail: core.redactGitOutput(error && error.message ? error.message : error).slice(0, 180)
        };
        rememberHistory({
          time: new Date().toLocaleString(),
          trigger: trigger || "manual",
          status: "failed",
          summary: core.redactGitOutput(error && error.message ? error.message : error).slice(0, 180)
        });
        notify(lastLog, "error");
        showMenu();
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
    statusPanel.source = sourceGraphStatus(result);
    statusPanel.sync = {
      icon: result.exitCode === 0 ? "✅" : "⚠",
      label: result.exitCode === 0 ? "Encryption scan complete" : "Encryption scan needs attention",
      detail: output.slice(0, 240)
    };
    renderPanel("GitHub Auto Sync");
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
      githubAutoSyncMenu() {
        showMenu();
      },
      githubAutoSyncSettings() {
        if (typeof logseq.showSettingsUI === "function") logseq.showSettingsUI();
      },
      githubAutoSyncHistory() {
        showHistory();
      },
      githubAutoSyncShowHistory() {
        showHistory();
      },
      githubAutoSyncClosePanel() {
        if (typeof logseq.hideMainUI === "function") logseq.hideMainUI({ restoreEditingCursor: true });
      }
    });

    if (typeof logseq.provideStyle === "function") {
      logseq.provideStyle({
        key: "github-auto-sync-ui",
        style: `
          .github-auto-sync-panel {
            box-sizing: border-box;
            width: 100%;
            max-height: calc(100vh - 76px);
            overflow: auto;
            border: 1px solid var(--ls-border-color, rgba(120, 120, 120, .25));
            border-radius: 8px;
            background: var(--ls-primary-background-color, #fff);
            color: var(--ls-primary-text-color, #222);
            box-shadow: 0 14px 34px rgba(0, 0, 0, .18);
            padding: 12px;
            font-size: 13px;
          }
          .github-auto-sync-panel header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 10px;
          }
          .github-auto-sync-panel h1,
          .github-auto-sync-panel h2 {
            margin: 0;
            font-size: 14px;
            font-weight: 650;
          }
          .github-auto-sync-panel h2 {
            margin-bottom: 8px;
            color: var(--ls-secondary-text-color, #5a5a5a);
          }
          .github-auto-sync-panel header button {
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 20px;
            cursor: pointer;
          }
          .github-auto-sync-panel section {
            margin: 10px 0;
          }
          .github-auto-sync-status-grid {
            display: grid;
            gap: 8px;
          }
          .github-auto-sync-status-card,
          .github-auto-sync-history-row {
            display: grid;
            grid-template-columns: 24px 1fr;
            gap: 8px;
            align-items: start;
            border: 1px solid var(--ls-border-color, rgba(120, 120, 120, .2));
            border-radius: 8px;
            padding: 8px;
          }
          .github-auto-sync-status-card strong,
          .github-auto-sync-history-row strong {
            display: block;
            line-height: 1.35;
          }
          .github-auto-sync-status-card small,
          .github-auto-sync-history-row small,
          .github-auto-sync-empty {
            display: block;
            margin-top: 2px;
            color: var(--ls-secondary-text-color, #666);
            line-height: 1.35;
          }
          .github-auto-sync-history-row {
            margin-bottom: 6px;
          }
          .github-auto-sync-panel footer {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
          }
          .github-auto-sync-menu-button {
            border: 1px solid var(--ls-border-color, rgba(120, 120, 120, .3));
            border-radius: 6px;
            background: var(--ls-secondary-background-color, #f5f5f5);
            color: inherit;
            padding: 6px 9px;
            cursor: pointer;
          }
          .github-auto-sync-menu-button.primary {
            background: var(--ls-link-text-color, #2563eb);
            border-color: var(--ls-link-text-color, #2563eb);
            color: #fff;
          }
          .github-auto-sync-menu-button.ghost {
            margin-left: auto;
          }
        `
      });
    }

    logseq.App.registerUIItem("toolbar", {
      key: "github-auto-sync",
      template:
        '<a class="button" data-on-click="githubAutoSyncMenu" title="GitHub Auto Sync: status and actions">' +
        '<span class="github-auto-sync-icon" style="font-size: 17px; line-height: 1">🔒</span>' +
        "</a>"
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
