import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundedCache } from "./boundedCache";
test("cache expires observations and bounds unique credentials", () => {
 const cache = new BoundedCache<number>(2);
 cache.set("a",1,100,0);cache.set("b",2,100,0);cache.set("c",3,100,0);
 assert.equal(cache.size,2);assert.equal(cache.get("a",1),undefined);
 assert.equal(cache.get("b",100),undefined);
 cache.set("d",4,200,101); assert.equal(cache.size,1);
 cache.set("expired",5,100,101);assert.equal(cache.size,1);
});
