import type { Express } from "express";
import { asyncRoute } from "../lib/asyncRoute";
import { createCryptoMarket } from "../services/cryptoMarket";

export function registerCryptoMarket(app: Express) {
  const snapshot = createCryptoMarket();
  // Registered behind the existing /v1 session guard.
  app.get("/v1/crypto-market", asyncRoute(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await snapshot());
  }));
}
