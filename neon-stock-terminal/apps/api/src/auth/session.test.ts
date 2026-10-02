import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCookies } from "./session";
test("malformed cookies cannot crash session parsing", () => {
 const result = parseCookies("bad=%E0%A4%A; __Host-session=valid%20id; malformed; empty=");
 assert.equal(result.has("bad"),false);
 assert.equal(result.get("__Host-session"),"valid id");
 assert.equal(result.get("empty"),"");
 assert.equal(parseCookies(undefined).size,0);
});
