import assert from "node:assert/strict";
import test from "node:test";
import { extractClientBuildVersion } from "./clientBuildVersion";

test("client build version comes from the Vite entry asset fingerprint", () => {
  assert.equal(
    extractClientBuildVersion('<script type="module" crossorigin src="/n50/assets/index-AbC123.js"></script>'),
    "index-AbC123.js",
  );
});

test("client build version rejects development and unrelated scripts", () => {
  assert.equal(extractClientBuildVersion('<script type="module" src="/src/main.tsx"></script>'), null);
  assert.equal(extractClientBuildVersion('<script src="/n50/assets/vendor.js"></script>'), null);
});
