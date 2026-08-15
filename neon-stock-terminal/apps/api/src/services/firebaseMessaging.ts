import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { mobileNotificationEventSchema, type MobileNotificationEvent } from "./notificationSystem";

export type { MobileNotificationEvent } from "./notificationSystem";

function messaging() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  return getMessaging(app);
}

export function buildMobileMessage(tokens: string[], rawEvent: MobileNotificationEvent): MulticastMessage {
  const event = mobileNotificationEventSchema.parse(rawEvent);
  const expiresAt = event.expires_at ? Date.parse(event.expires_at) : Number.NaN;
  const ttl = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : undefined;
  return {
    tokens,
    // N50 always uses data-only payloads. The React Native background handler
    // validates the contract and invokes the Kotlin BigText/Inbox/ProgressStyle
    // renderer, preventing Android from generating a duplicate generic card.
    data: event,
    android: {
      priority: event.priority === "high" || event.action === "start" || event.action === "complete" ? "high" : "normal",
      collapseKey: event.action === "update" ? event.dedupe_key.slice(0, 64) : undefined,
      ttl
    }
  };
}

export async function sendMobileEvent(tokens: string[], event: MobileNotificationEvent) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, messageIds: [], invalidTokenIndexes: [] };
  const result = await messaging().sendEachForMulticast(buildMobileMessage(tokens, event));
  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    messageIds: result.responses.flatMap((response) => response.messageId ? [response.messageId] : []),
    invalidTokenIndexes: result.responses.flatMap((response, index) =>
      response.error?.code === "messaging/registration-token-not-registered" ? [index] : [])
  };
}
