import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";

export type MobileNotificationEvent = {
  event_id: string;
  type: "paper_trade_opened" | "paper_target_hit" | "paper_trade_closed" | "day_start_summary" | "day_end_summary" | "live_activity";
  action: "standard" | "start" | "update" | "complete" | "cancel";
  activity_id: string;
  notification_id: string;
  title: string;
  body: string;
  short_text: string;
  progress: string;
  stage: string;
  route: string;
  event_at: string;
  data_as_of: string;
};

function messaging() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  return getMessaging(app);
}

export async function sendMobileEvent(tokens: string[], event: MobileNotificationEvent) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, messageIds: [], invalidTokenIndexes: [] };
  const isStandard = event.action === "standard";
  const message: MulticastMessage = {
    tokens,
    data: event,
    android: {
      priority: "high",
      collapseKey: `${event.activity_id}:${event.action}`,
      notification: isStandard ? {
        channelId: event.type === "day_start_summary" || event.type === "day_end_summary" ? "market_updates_v1" : "trade_critical_v1",
        title: event.title,
        body: event.body,
        tag: event.notification_id,
      } : undefined,
    },
  };
  const result = await messaging().sendEachForMulticast(message);
  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    messageIds: result.responses.flatMap((response) => response.messageId ? [response.messageId] : []),
    invalidTokenIndexes: result.responses.flatMap((response, index) =>
      response.error?.code === "messaging/registration-token-not-registered" ? [index] : []),
  };
}
