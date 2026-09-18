import { fork } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
export function startPredictorScheduler() {
  if (process.env.PREDICTOR_ENABLED === "false") return;
  const file = path.join(__dirname, "../scripts/predictorJob.js");
  if (!existsSync(file)) {
    console.info(JSON.stringify({ event: "predictor_requires_built_worker" }));
    return;
  }
  let busy = false;
  const run = () => {
    if (busy) return;
    busy = true;
    const child = fork(file, [], {
      stdio: "inherit",
      execArgv: ["--max-old-space-size=256"],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 270000);
    const finish = () => {
      clearTimeout(timeout);
      busy = false;
    };
    child.once("exit", finish);
    child.once("error", finish);
  };
  setTimeout(run, 15000).unref();
  setInterval(run, 5 * 60000).unref();
}
