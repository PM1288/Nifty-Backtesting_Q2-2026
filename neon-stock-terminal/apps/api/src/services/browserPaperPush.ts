import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type JsonWebKey,
} from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import type { RequestAuthenticator } from "../auth/guard";
import { asyncRoute } from "../lib/asyncRoute";

const hosts = [
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.microsoft.com",
];

export function isBrowserPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1 &&
      hosts.some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    );
  } catch {
    return false;
  }
}

async function loadIdentity(db: PrismaClient) {
  const read = () =>
    db.$queryRaw<
      { private_jwk: JsonWebKey }[]
    >`select private_jwk from mobile_notifications.web_push_identity where singleton`;
  let [row] = await read();
  if (!row) {
    const jwk = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }).privateKey.export({ format: "jwk" });
    await db.$executeRaw`insert into mobile_notifications.web_push_identity values (true, ${JSON.stringify(jwk)}::jsonb) on conflict do nothing`;
    [row] = await read();
  }
  const jwk = row.private_jwk;
  const publicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]).toString("base64url");
  return { publicKey, key: createPrivateKey({ key: jwk, format: "jwk" }) };
}

export function registerBrowserPaperPush(
  app: Express,
  db: PrismaClient,
  auth: RequestAuthenticator,
) {
  let identity: ReturnType<typeof loadIdentity> | undefined;
  const keys = () =>
    (identity ??= loadIdentity(db).catch((error) => {
      identity = undefined;
      throw error;
    }));
  const route = "/v1/paper/browser-alerts";
  app.get(
    route,
    asyncRoute(async (_req, res) => {
      res.json({ publicKey: (await keys()).publicKey });
    }),
  );
  app.post(
    route,
    asyncRoute(async (req, res) => {
      const session = await auth.getSession(req);
      if (!session) return res.sendStatus(401);
      auth.requireCsrf(req, session);
      const uid = session.user.uid;
      const { endpoint, action } = req.body ?? {};
      if (
        !isBrowserPushEndpoint(endpoint) ||
        !["enable", "disable", "status", "test"].includes(action)
      )
        return res.sendStatus(400);
      const hash = createHash("sha256").update(endpoint).digest("hex");
      if (action === "enable") {
        await db.$executeRaw`insert into mobile_notifications.web_push_subscription(endpoint_hash,endpoint,user_uid,cursor_id)
        values (${hash},${endpoint},${uid},(select coalesce(max(outbox_id),0) from mobile_notifications.event_outbox))
        on conflict(endpoint_hash) do update set user_uid=excluded.user_uid,cursor_id=excluded.cursor_id,
          registered_at=now(),failures=0,available_at=now(),lease=null
        where web_push_subscription.user_uid <> excluded.user_uid`;
      } else if (action === "test") {
        const changed =
          await db.$executeRaw`update mobile_notifications.web_push_subscription set
          test_requested_at=now(),available_at=case when lease is null then now() else available_at end
          where endpoint_hash=${hash} and user_uid=${uid}
            and (test_requested_at is null or test_requested_at<now()-interval '1 minute')`;
        if (!changed)
          return res
            .status(429)
            .json({ error: "Wait a minute before testing again." });
      } else if (action === "disable") {
        await db.$executeRaw`delete from mobile_notifications.web_push_subscription where endpoint_hash=${hash} and user_uid=${uid}`;
      }
      const rows =
        (await db.$queryRaw`select 1 from mobile_notifications.web_push_subscription where endpoint_hash=${hash} and user_uid=${uid}`) as unknown[];
      res.json({ enabled: rows.length > 0 });
    }),
  );

  if (process.env.N50_MOBILE_NOTIFICATION_DISPATCHER_ENABLED !== "1") return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Coalesce simultaneous events into one private lock-screen alert per device.
      const rows = await db.$queryRaw<
        {
          endpoint_hash: string;
          endpoint: string;
          lease: string;
          latest: bigint;
          remaining: number;
        }[]
      >`
        with pending as (
          select s.endpoint_hash, coalesce(ev.outbox_id,s.cursor_id) as outbox_id, coalesce(ev.remaining,60) as remaining from mobile_notifications.web_push_subscription s
          left join lateral (
            select o.outbox_id,extract(epoch from e.event_time + interval '5 minutes' - now())::int as remaining
            from mobile_notifications.event_outbox o join paper_trading.trade_events e using(event_id)
            where o.outbox_id>s.cursor_id and e.event_time>=s.registered_at and e.event_time>now()-interval '5 minutes'
              and e.event_type in ('com.papertrading.trade_leg.opened.v1','com.papertrading.target_track.closed.v1')
            order by o.outbox_id desc limit 1
          ) ev on true where s.available_at<=now()
            and (ev.outbox_id is not null or (s.test_requested_at>now()-interval '1 minute'
              and s.test_requested_at>coalesce(s.test_sent_at,'-infinity'::timestamptz))) order by s.available_at limit 12 for update of s skip locked
        )
        update mobile_notifications.web_push_subscription s set lease=gen_random_uuid(),available_at=now()+interval '45 seconds'
        from pending p where p.endpoint_hash=s.endpoint_hash returning s.endpoint_hash,s.endpoint,s.lease::text,p.outbox_id as latest,p.remaining`;
      if (!rows.length) return;
      const { key, publicKey } = await keys();
      await Promise.all(
        rows.map(async (row) => {
          let status = 0;
          try {
            const encode = (v: object) =>
              Buffer.from(JSON.stringify(v)).toString("base64url");
            const claim =
              encode({ typ: "JWT", alg: "ES256" }) +
              "." +
              encode({
                aud: new URL(row.endpoint).origin,
                exp: Math.floor(Date.now() / 1000) + 3600,
                sub: "https://n50.nifty50today.co.in/",
              });
            const signature = sign("sha256", Buffer.from(claim), {
              key,
              dsaEncoding: "ieee-p1363",
            }).toString("base64url");
            const response = await fetch(row.endpoint, {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(8000),
              headers: {
                Authorization:
                  "vapid t=" + claim + "." + signature + ", k=" + publicKey,
                TTL: String(Math.max(0, row.remaining)),
                Urgency: "high",
                "Content-Length": "0",
              },
            });
            status = response.status;
            await response.body?.cancel();
          } catch {
            /* A transport failure retries while the event is fresh. */
          }
          if (status === 404 || status === 410) {
            await db.$executeRaw`delete from mobile_notifications.web_push_subscription where lease=${row.lease}::uuid and endpoint_hash=${row.endpoint_hash}`;
          } else {
            const accepted = status >= 200 && status < 300;
            await db.$executeRaw`update mobile_notifications.web_push_subscription set
            test_sent_at=case when ${accepted} then now() else test_sent_at end,
            cursor_id=case when ${accepted} then ${row.latest} else cursor_id end,lease=null,
            failures=case when ${accepted} then 0 else least(6,failures+1) end,
            available_at=now()+case when ${accepted} then interval '0' else interval '5 seconds'*power(2,least(6,failures)) end
            where lease=${row.lease}::uuid and endpoint_hash=${row.endpoint_hash}`;
          }
          console.info(
            JSON.stringify({ event: "browser_paper_push_delivery", status }),
          );
        }),
      );
    } catch {
      console.error(
        JSON.stringify({ event: "browser_paper_push_poll_failed" }),
      );
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 15000).unref();
}
