import assert from "node:assert/strict";
import test from "node:test";
import { currentClientBuildVersion, remoteClientBuildVersion, shouldReloadForVersion } from "../src/lib/appVersion";

test("current version is derived from the loaded Vite entry script", () => {
  assert.equal(currentClientBuildVersion([{ src: "/n50/assets/index-old.js" }], "https://example.test/n50/"), "index-old.js");
});

test("version guard reloads only for a different valid deployment", () => {
  assert.equal(shouldReloadForVersion("index-old.js", "index-new.js", null), true);
  assert.equal(shouldReloadForVersion("index-new.js", "index-new.js", null), false);
  assert.equal(shouldReloadForVersion("index-old.js", "index-new.js", "index-new.js"), false);
  assert.equal(shouldReloadForVersion(null, "index-new.js", null), false);
});

test("version response accepts only a Vite entry fingerprint", () => {
  assert.equal(remoteClientBuildVersion({ version: "index-DxMXbZzT.js" }), "index-DxMXbZzT.js");
  assert.equal(remoteClientBuildVersion({ version: "main.js" }), null);
  assert.equal(remoteClientBuildVersion({ version: 42 }), null);
});
