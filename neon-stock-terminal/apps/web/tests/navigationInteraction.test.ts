import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualPath,
  readNavigationContext,
  safeReturnPath,
} from "../src/interaction/navigationContext";
import { routeCommandItems } from "../src/interaction/routeCatalog";
import { STRATEGY_MENU_ROUTES, WORKSPACE_ROUTES, resolveWorkspaceRoute } from "../src/components/chrome/workspaceRoutes";

test("strategic context survives URL serialisation", () => {
  const path = contextualPath(
    "/analytics/stock/RELIANCE",
    {
      instrumentId: "NSE_EQ_RELIANCE",
      strategy: "oiis-live",
      runId: "run-17",
      horizon: "5d",
      selectedEntityId: "candidate-4",
    },
    "/strategy/oiis-live?date=2026-08-12",
  );
  const context = readNavigationContext(path.split("?")[1] ?? "");
  assert.equal(context.instrumentId, "NSE_EQ_RELIANCE");
  assert.equal(context.strategy, "oiis-live");
  assert.equal(context.horizon, "5d");
  assert.equal(context.returnTo, "/strategy/oiis-live?date=2026-08-12");
});

test("return paths reject protocol-relative and external destinations", () => {
  assert.equal(safeReturnPath("/paper-trading?tradeId=pt-1"), "/paper-trading?tradeId=pt-1");
  assert.equal(safeReturnPath("//example.com"), null);
  assert.equal(safeReturnPath("https://example.com"), null);
});

test("command registry covers every legacy dashboard and seven canonical workspaces", () => {
  const items = routeCommandItems(true);
  const dashboardIds = new Set(items.filter((item) => item.group === "Go to" || item.group === "Strategies").map((item) => item.id));
  assert.ok(dashboardIds.size >= 42, `expected at least 42 dashboard destinations, received ${dashboardIds.size}`);
  for (const path of ["/", "/analytics", "/analytics/indicators", "/strategy/oiis-live", "/paper-trading", "/options/intelligence", "/analytics/system/quality"]) {
    assert.ok(items.some((item) => item.to === path), `missing canonical workspace ${path}`);
  }
  const rollingMonthly = items.find((item) => item.to === "/strategy/rolling-monthly");
  assert.ok(rollingMonthly, "standalone Rolling Monthly remains discoverable");
  assert.match(`${rollingMonthly?.label} ${rollingMonthly?.description}`, /60.session/i, "Rolling 60-session wording finds the governed Rolling Strategy route");
});

test("admin commands are capability filtered", () => {
  assert.equal(routeCommandItems(false).some((item) => item.to === "/control-plane"), false);
  assert.equal(routeCommandItems(true).some((item) => item.to === "/control-plane"), true);
});

test("top Strategy workspace groups independent strategy dashboards without merging routes", () => {
  const strategy = WORKSPACE_ROUTES.find((route) => route.id === "oiis-lab");
  assert.equal(strategy?.label, "Strategy");
  assert.deepEqual(STRATEGY_MENU_ROUTES.map((route) => route.label), [
    "Trendlyne Summary",
    "OIIS Lab",
    "OISS v1.202608",
    "Monthly Strategy",
    "Rolling Strategy",
    "Long Options",
    "NIFTY Options",
  ]);
  assert.equal(resolveWorkspaceRoute("/strategy/oiis-live").id, "oiis-lab");
  assert.equal(resolveWorkspaceRoute("/strategy/oiss-v1-202608").id, "oiis-lab");
  assert.equal(resolveWorkspaceRoute("/strategy/rolling-monthly").parentId, "oiis-lab");
  assert.equal(resolveWorkspaceRoute("/strategy/nifty-options").parentId, "oiis-lab");
});
