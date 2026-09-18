import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runPredictor } from "../lib/predictorService";
const prisma = new PrismaClient();
runPredictor(prisma)
  .then((result) =>
    console.info(
      JSON.stringify({
        event: "predictor_completed",
        state: result.state,
        forecasts: result.forecastCount,
        evaluated: result.evaluated,
      }),
    ),
  )
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "predictor_failed",
        errorType: error instanceof Error ? error.name : "Unknown",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
