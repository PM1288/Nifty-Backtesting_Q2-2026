import { test } from "node:test";
import assert from "node:assert/strict";
import { isFirebaseError } from "../src/lib/firebaseError";
test("Firebase errors use the public name/code contract without importing SDKs", () => {
 assert.equal(isFirebaseError(Object.assign(new Error("failed"),{name:"FirebaseError",code:"auth/invalid-credential"})),true);
 assert.equal(isFirebaseError({name:"FirebaseError",code:"auth/failed"}),false);
 assert.equal(isFirebaseError(new Error("failed")),false);
});
