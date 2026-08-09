import type { Express } from "express";
import type { RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import type { RequestAuthenticator } from "../auth/guard";
import { registerAuthRoutes } from "./auth";
import { registerAnalytics } from "./analytics";
import { registerAnalyticsEvents } from "./analyticsEvents";
import { registerAnalyticsEventContext } from "./analyticsEventContext";
import { registerAnalyticsDailySetups } from "./analyticsDailySetups";
import { registerAnalyticsLeadership } from "./analyticsLeadership";
import { registerAnalyticsMarketState } from "./analyticsMarketState";
import { registerAnalyticsFiiFlow } from "./analyticsFiiFlow";
import { registerAnalyticsOptionsStructure } from "./analyticsOptionsStructure";
import { registerAnalyticsStrategyEvaluation } from "./analyticsStrategyEvaluation";
import { registerChangeHeatmap } from "./changeHeatmap";
import { registerHealth } from "./health";
import { registerIndicatorEducation } from "./indicatorEducation";
import { registerIndicatorStrategySnapshots } from "./indicatorStrategySnapshots";
import { registerInternalRoutes } from "./internal";
import { registerBacktesting } from "./backtesting";
import { registerBacktestingLab } from "./backtestingLab";
import { registerFeedbackRoutes } from "./feedback";
import { registerFiiReports } from "./fiiReports";
import { registerOverview } from "./overview";
import { registerRsiSurface } from "./rsiSurface";
import { registerStocks } from "./stocks";
import { registerDisclosures } from "./disclosures";
import { registerDiscordMarketStream } from "./discordMarketStream";
import { registerSupportingMetrics } from "./supportingMetrics";
import { registerWillSurface } from "./willSurface";
import { registerOiisLive, registerOiisLivePublic } from "./oiisLive";

export function registerRoutes(
  app: Express,
  prisma: PrismaClient,
  authGuard: RequestHandler,
  authRuntime: RequestAuthenticator
) {
  registerHealth(app, prisma, authRuntime);
  registerInternalRoutes(app, prisma);
  registerAuthRoutes(app, prisma, authRuntime);
  registerFeedbackRoutes(app, prisma, authRuntime);
  registerOiisLivePublic(app, prisma);
  app.use("/v1", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/v1", authGuard);
  registerAnalytics(app, prisma);
  registerAnalyticsDailySetups(app, prisma);
  registerAnalyticsEventContext(app, prisma);
  registerAnalyticsEvents(app, prisma);
  registerAnalyticsFiiFlow(app, prisma);
  registerAnalyticsLeadership(app, prisma);
  registerAnalyticsMarketState(app, prisma);
  registerAnalyticsOptionsStructure(app, prisma);
  registerAnalyticsStrategyEvaluation(app, prisma);
  registerBacktesting(app, prisma);
  registerBacktestingLab(app, prisma, authRuntime);
  registerChangeHeatmap(app, prisma);
  registerIndicatorEducation(app, prisma);
  registerIndicatorStrategySnapshots(app, prisma);
  registerOverview(app, prisma);
  registerRsiSurface(app, prisma);
  registerDiscordMarketStream(app, prisma);
  registerDisclosures(app);
  registerFiiReports(app);
  registerSupportingMetrics(app, prisma);
  registerWillSurface(app, prisma);
  registerStocks(app, prisma);
  registerOiisLive(app, prisma);
}
