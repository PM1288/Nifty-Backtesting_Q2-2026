import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { generateDashboard } from "./data/generator.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 5174);
const serveClient = process.env.SERVE_CLIENT === "1" || process.env.NODE_ENV === "production";

const api = express.Router();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * GET /api/dashboard?mins=120&seed=1337
 */
api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

api.get("/dashboard", (req, res) => {
  const minsRaw = Number(req.query.mins ?? 120);
  const mins = Math.max(30, Math.min(390, Number.isFinite(minsRaw) ? minsRaw : 120));
  const seedRaw = Number(req.query.seed ?? 1337);
  const seed = Number.isFinite(seedRaw) ? seedRaw : 1337;

  const payload = generateDashboard(mins, seed);
  res.json(payload);
});

app.use("/api", api);
app.use("/api/tree", api);
app.use("/api/parrot", api);

if (serveClient) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDist = path.resolve(__dirname, "../../client/dist");

  if (existsSync(clientDist)) {
    const indexFile = path.join(clientDist, "index.html");
    app.use(express.static(clientDist));
    app.use("/tree", express.static(clientDist));
    app.use("/parrot", express.static(clientDist));
    app.get("/", (_req, res) => res.sendFile(indexFile));
    app.get("/tree", (_req, res) => res.sendFile(indexFile));
    app.get("/tree/*", (_req, res) => res.sendFile(indexFile));
    app.get("/parrot", (_req, res) => res.sendFile(indexFile));
    app.get("/parrot/*", (_req, res) => res.sendFile(indexFile));
  } else {
    console.warn(`[tree] client dist not found at ${clientDist}`);
  }
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});
