const assert = require("assert");
const core = require("../dist/sync-core.js");

const settings = core.normalizeSettings({
  syncIntervalMinutes: "0",
  branch: "",
  encryptedTags: " encrypted, [[Private]] ",
  agePath: "",
});
assert.strictEqual(settings.syncIntervalMinutes, 1);
assert.strictEqual(settings.branch, "master");
assert.strictEqual(settings.agePath, "age");
assert.strictEqual(settings.showDetailedLogs, false);
assert.strictEqual(settings.authorName, "");
assert.strictEqual(settings.authorEmail, "");
assert.deepStrictEqual(core.splitEncryptedTags(settings.encryptedTags), ["encrypted", "Private"]);

const detailedLogSettings = core.normalizeSettings({ showDetailedLogs: true });
assert.strictEqual(detailedLogSettings.showDetailedLogs, true);

const customAuthorSettings = core.normalizeSettings({
  authorName: "  Kada Liao  ",
  authorEmail: "  kadaliao@gmail.com  ",
});
assert.strictEqual(customAuthorSettings.authorName, "Kada Liao");
assert.strictEqual(customAuthorSettings.authorEmail, "kadaliao@gmail.com");

const customServer = core.normalizeSettings({ syncServerUrl: "http://127.0.0.1:4096/" });
assert.strictEqual(customServer.syncServerUrl, "http://127.0.0.1:4096/");

assert.strictEqual(core.contentHasEncryptedTag("tags:: encrypted, Work", "encrypted"), true);
assert.strictEqual(core.contentHasEncryptedTag("- tags:: [[Private]], Work", "private"), true);
assert.strictEqual(core.contentHasEncryptedTag("- nested #encrypted note", "encrypted"), true);
assert.strictEqual(core.contentHasEncryptedTag("- not encrypted as plain text", "encrypted"), false);

const clean = core.detectLikelySecrets("+normal note line\n+token idea without a value", { diffOnly: true });
assert.strictEqual(clean.length, 0);

const dirty = core.detectLikelySecrets("diff --git a/pages/a.md b/pages/a.md\n+api_key = sk-123456789012345678901234", { diffOnly: true });
assert.strictEqual(dirty.length, 1);
assert.strictEqual(dirty[0].path, "pages/a.md");

const redacted = core.redactGitOutput("identity AGE-SECRET-KEY-ABCDEFGHIJKLMNOPQRSTUVWXYZ and token sk-123456789012345678901234");
assert(!redacted.includes("AGE-SECRET-KEY"));
assert(!redacted.includes("sk-123456"));

// Test edge cases
assert.strictEqual(core.contentHasEncryptedTag("", "encrypted"), false);
assert.strictEqual(core.contentHasEncryptedTag(null, "encrypted"), false);
assert.deepStrictEqual(core.splitEncryptedTags(""), []);
assert.deepStrictEqual(core.splitEncryptedTags("  "), []);
assert.deepStrictEqual(core.splitEncryptedTags("a,b,c"), ["a", "b", "c"]);

// Test ignored paths
const diffWithIgnore = `diff --git a/pages/a.md b/pages/a.md
+api_key = sk-123456789012345678901234`;
const ignored = core.detectLikelySecrets(diffWithIgnore, {
  diffOnly: true,
  ignoredPaths: ["pages/a.md"]
});
assert.strictEqual(ignored.length, 0);

console.log("sync-core tests passed");
