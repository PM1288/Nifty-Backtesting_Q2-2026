import { sendMobileEvent, type MobileNotificationEvent } from "../services/firebaseMessaging";

const modes = ["standard", "live-start", "live-update", "live-complete", "live-cancel"] as const;
const mode = process.argv[2] as (typeof modes)[number] | undefined;
const token = process.env.FCM_TEST_TOKEN;
if (!mode || !modes.includes(mode) || !token) {
  console.error("Usage: FCM_TEST_TOKEN=<token> pnpm notification:test <standard|live-start|live-update|live-complete|live-cancel>");
  process.exit(2);
}

const now = new Date().toISOString();
const action = mode === "standard" ? "standard" : mode.replace("live-", "") as MobileNotificationEvent["action"];
const progress = action === "update" ? "50" : action === "complete" ? "100" : "0";
const event: MobileNotificationEvent = {
  event_id: `cli-${Date.now()}`,
  type: action === "standard" ? "paper_target_hit" : "live_activity",
  action,
  activity_id: "cli-paper-trade",
  notification_id: "505101",
  title: action === "standard" ? "N50 · Target reached" : "N50 · Active trade monitor",
  body: action === "standard" ? "Paper target milestone confirmed." : `Monitored activity ${progress}% complete.`,
  short_text: action === "complete" ? "Done" : `${progress}%`,
  progress,
  stage: action,
  route: "/paper-trades/cli-paper-trade",
  event_at: now,
  data_as_of: now,
};

async function main() {
  const result = await sendMobileEvent([token!], event);
  console.log(JSON.stringify({ mode, ...result }));
  if (result.failureCount) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
