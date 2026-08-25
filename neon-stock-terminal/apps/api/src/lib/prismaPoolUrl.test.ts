import assert from "node:assert/strict";
import test from "node:test";
import { databaseUrlWithPool } from "./prismaPoolUrl";

test("databaseUrlWithPool replaces pool settings without exposing or changing credentials", () => {
  const result = new URL(databaseUrlWithPool("postgresql://user:p%40ss@db:5432/app?schema=public&connection_limit=4", 3, 20));
  assert.equal(result.username, "user");
  assert.equal(result.password, "p%40ss");
  assert.equal(result.searchParams.get("schema"), "public");
  assert.equal(result.searchParams.get("connection_limit"), "3");
  assert.equal(result.searchParams.get("pool_timeout"), "20");
});
