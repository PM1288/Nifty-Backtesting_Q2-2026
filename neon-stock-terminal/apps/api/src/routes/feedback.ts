import crypto from "node:crypto";
import type { Express, Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RequestAuthenticator } from "../auth/guard";
import { createRateLimiter } from "../security/rateLimit";
import { getFeedbackSigningSecret, isProductionEnv } from "../lib/runtimeConfig";

const FEEDBACK_TITLE_MAX = 120;
const FEEDBACK_SUMMARY_MAX = 600;
const FEEDBACK_DETAILS_MAX = 1400;
const FEEDBACK_EXPECTED_MAX = 480;
const FEEDBACK_CHALLENGE_TTL_MS = 20 * 60_000;
const FEEDBACK_MIN_SUBMIT_MS = 4_500;
const FEEDBACK_WEBHOOK_TIMEOUT_MS = 6_000;
const FEEDBACK_WEBHOOK_CHUNK_LIMIT = 1_800;
const FEEDBACK_CATEGORIES = ["bug_report", "data_issue", "improvement", "ux_feedback", "general_feedback"] as const;

type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
type FeedbackChallengePayload = {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

const attributionSchema = z
  .object({
    firstTouchSource: z.string().trim().max(160).nullable().optional(),
    firstTouchMedium: z.string().trim().max(160).nullable().optional(),
    firstTouchCampaign: z.string().trim().max(160).nullable().optional(),
    firstTouchContent: z.string().trim().max(160).nullable().optional(),
    firstTouchTerm: z.string().trim().max(160).nullable().optional(),
    firstTouchId: z.string().trim().max(160).nullable().optional(),
    firstTouchSourcePlatform: z.string().trim().max(160).nullable().optional(),
    firstTouchReferrer: z.string().trim().max(600).nullable().optional(),
    lastTouchSource: z.string().trim().max(160).nullable().optional(),
    lastTouchMedium: z.string().trim().max(160).nullable().optional(),
    lastTouchCampaign: z.string().trim().max(160).nullable().optional(),
    lastTouchContent: z.string().trim().max(160).nullable().optional(),
    lastTouchTerm: z.string().trim().max(160).nullable().optional(),
    lastTouchId: z.string().trim().max(160).nullable().optional(),
    lastTouchSourcePlatform: z.string().trim().max(160).nullable().optional(),
    lastTouchReferrer: z.string().trim().max(600).nullable().optional()
  })
  .partial()
  .default({});

const feedbackSubmitSchema = z.object({
  challengeToken: z.string().trim().min(24).max(1024),
  category: z.enum(FEEDBACK_CATEGORIES),
  title: z.string().trim().min(3).max(FEEDBACK_TITLE_MAX),
  summary: z.string().trim().min(12).max(FEEDBACK_SUMMARY_MAX),
  details: z.string().trim().max(FEEDBACK_DETAILS_MAX).optional().default(""),
  expectedOutcome: z.string().trim().max(FEEDBACK_EXPECTED_MAX).optional().default(""),
  sourcePath: z.string().trim().max(240).nullable().optional(),
  sourceLabel: z.string().trim().max(120).nullable().optional(),
  honeypot: z.string().max(0).optional().default(""),
  confirmAccurate: z.literal(true),
  attribution: attributionSchema
});

function requestIp(req: Request) {
  if (typeof req.ip === "string" && req.ip.trim().length > 0) return req.ip.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]?.trim()) {
    return forwarded[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function feedbackKey(req: Request) {
  const agent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 96) : "unknown";
  return `${requestIp(req)}|${agent}`;
}

const feedbackChallengeRateLimiter = createRateLimiter({
  name: "feedback_challenge",
  windowMs: 10 * 60_000,
  max: 30,
  keyGenerator: feedbackKey,
  code: "FEEDBACK_CHALLENGE_RATE_LIMITED",
  message: "Please wait a moment before opening another feedback form."
});

const feedbackSubmitBurstLimiter = createRateLimiter({
  name: "feedback_submit_burst",
  windowMs: 15 * 60_000,
  max: 3,
  keyGenerator: feedbackKey,
  code: "FEEDBACK_SUBMIT_RATE_LIMITED",
  message: "Too many feedback submissions from this connection. Please wait a little and try again."
});

const feedbackSubmitDailyLimiter = createRateLimiter({
  name: "feedback_submit_daily",
  windowMs: 24 * 60 * 60_000,
  max: 12,
  keyGenerator: feedbackKey,
  code: "FEEDBACK_DAILY_LIMIT_REACHED",
  message: "Feedback submission limit reached for today. Please try again tomorrow."
});

let ephemeralFeedbackSecret: string | null = null;

function feedbackSigningSecret() {
  const configured = getFeedbackSigningSecret();
  if (configured) return configured;
  if (isProductionEnv()) {
    throw new Error("FEEDBACK_SIGNING_SECRET is required in production.");
  }
  if (!ephemeralFeedbackSecret) {
    ephemeralFeedbackSecret = crypto.randomBytes(32).toString("base64url");
    // eslint-disable-next-line no-console
    console.warn("FEEDBACK_SIGNING_SECRET is not configured. Using an ephemeral in-memory secret in development mode.");
  }
  return ephemeralFeedbackSecret;
}

function encodeChallengeToken(payload: FeedbackChallengePayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", feedbackSigningSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyChallengeToken(token: string): FeedbackChallengePayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", feedbackSigningSecret()).update(encoded).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FeedbackChallengePayload;
    if (!parsed || typeof parsed.issuedAt !== "number" || typeof parsed.expiresAt !== "number" || typeof parsed.nonce !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function firstForwardedValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.split(",")[0]!.trim();
  if (Array.isArray(value) && value.length > 0) return value[0]!.split(",")[0]!.trim();
  return "";
}

function currentRequestOrigin(req: Pick<Request, "headers" | "secure">): string {
  const host = firstForwardedValue(req.headers["x-forwarded-host"]) || req.headers.host;
  if (!host) return "";
  const proto = firstForwardedValue(req.headers["x-forwarded-proto"]) || (req.secure ? "https" : "http");
  return normalizeOrigin(`${proto}://${host}`);
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((entry) => normalizeOrigin(entry))
      .filter(Boolean)
  );
}

function assertFeedbackOrigin(req: Request) {
  const originHeader = typeof req.headers.origin === "string" ? normalizeOrigin(req.headers.origin) : "";
  if (!originHeader) return;
  const allowedOrigins = parseAllowedOrigins(
    process.env.AUTH_ALLOWED_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_APP_ORIGIN
  );
  if (allowedOrigins.has(originHeader)) return;
  const requestOrigin = currentRequestOrigin(req);
  if (!requestOrigin || requestOrigin !== originHeader) {
    throw Object.assign(new Error("Origin validation failed."), {
      status: 403,
      code: "ORIGIN_MISMATCH"
    });
  }
}

function sanitizeMultiline(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function compactWhitespace(value: string) {
  return sanitizeMultiline(value).replace(/[ \t]{2,}/g, " ");
}

function hashFeedbackContent(parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => compactWhitespace(part ?? "").toLowerCase())
    .filter(Boolean)
    .join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function ensureFeedbackStoreReady(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    create table if not exists app_feedback_submission (
      id text primary key,
      category text not null,
      source_path text null,
      source_label text null,
      title text not null,
      summary text not null,
      details text null,
      expected_outcome text null,
      session_mode text not null,
      user_uid text null,
      message_hash text not null,
      attribution jsonb not null default '{}'::jsonb,
      metadata_json jsonb not null default '{}'::jsonb,
      delivery_status text not null default 'pending',
      delivery_attempts integer not null default 0,
      delivery_error text null,
      delivered_at timestamptz null,
      created_at timestamptz not null default now()
    );
  `);
  await prisma.$executeRawUnsafe(
    `create index if not exists idx_app_feedback_submission_created_at on app_feedback_submission (created_at desc);`
  );
  await prisma.$executeRawUnsafe(
    `create index if not exists idx_app_feedback_submission_message_hash_created_at on app_feedback_submission (message_hash, created_at desc);`
  );
  await prisma.$executeRawUnsafe(
    `create index if not exists idx_app_feedback_submission_delivery_status_created_at on app_feedback_submission (delivery_status, created_at desc);`
  );
}

function buildFeedbackSections(input: {
  referenceId: string;
  category: FeedbackCategory;
  sourcePath: string | null;
  sourceLabel: string | null;
  title: string;
  summary: string;
  details: string;
  expectedOutcome: string;
  sessionMode: "guest" | "signed_in";
  attributionSummary: string | null;
}) {
  const sections = [
    `Feedback Ref: ${input.referenceId}`,
    `Category: ${input.category.replace(/_/g, " ")}`,
    `Session: ${input.sessionMode}`,
    input.sourcePath ? `Page: ${input.sourcePath}` : null,
    input.sourceLabel ? `Area: ${input.sourceLabel}` : null,
    input.attributionSummary ? `Source: ${input.attributionSummary}` : null,
    "",
    `Title\n${input.title}`,
    "",
    `Summary\n${input.summary}`
  ];

  if (input.details) {
    sections.push("", `Details\n${input.details}`);
  }
  if (input.expectedOutcome) {
    sections.push("", `Expected outcome\n${input.expectedOutcome}`);
  }

  return sections.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function splitWebhookChunks(sections: string[]) {
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim().length > 0) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const section of sections) {
    if (section.length > FEEDBACK_WEBHOOK_CHUNK_LIMIT) {
      const lines = section.split("\n");
      let lineChunk = "";
      for (const line of lines) {
        if (`${lineChunk}${line}\n`.length > FEEDBACK_WEBHOOK_CHUNK_LIMIT) {
          if (lineChunk.trim().length > 0) {
            if (`${current}\n${lineChunk.trim()}`.trim().length > FEEDBACK_WEBHOOK_CHUNK_LIMIT) {
              pushCurrent();
            }
            current = `${current}\n${lineChunk.trim()}`.trim();
            pushCurrent();
          }
          lineChunk = line;
        } else {
          lineChunk = `${lineChunk}${line}\n`;
        }
      }
      if (lineChunk.trim().length > 0) {
        if (`${current}\n${lineChunk.trim()}`.trim().length > FEEDBACK_WEBHOOK_CHUNK_LIMIT) {
          pushCurrent();
        }
        current = `${current}\n${lineChunk.trim()}`.trim();
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length > FEEDBACK_WEBHOOK_CHUNK_LIMIT) {
      pushCurrent();
      current = section;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks.map((chunk, index) =>
    chunks.length > 1 ? `Feedback (${index + 1}/${chunks.length})\n\n${chunk}` : chunk
  );
}

async function postFeedbackWebhook(url: string, sections: string[]) {
  const chunks = splitWebhookChunks(sections);

  for (const content of chunks) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(FEEDBACK_WEBHOOK_TIMEOUT_MS)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook delivery failed with ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
    }
  }
}

function summarizeAttribution(attribution: z.infer<typeof attributionSchema>) {
  const source = attribution.lastTouchSource ?? attribution.firstTouchSource;
  const medium = attribution.lastTouchMedium ?? attribution.firstTouchMedium;
  const campaign = attribution.lastTouchCampaign ?? attribution.firstTouchCampaign;
  return [source, medium, campaign].filter(Boolean).join(" / ") || null;
}

export function registerFeedbackRoutes(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  const ensureStore = ensureFeedbackStoreReady(prisma);

  app.get("/v1/feedback/challenge", feedbackChallengeRateLimiter, async (req, res) => {
    const session = await auth.getSession(req);
    if (!session?.user) {
      return res.status(401).json({
        error: {
          code: "FEEDBACK_AUTH_REQUIRED",
          message: "Please sign in to share feedback."
        }
      });
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + FEEDBACK_CHALLENGE_TTL_MS;
    const token = encodeChallengeToken({
      nonce: crypto.randomUUID(),
      issuedAt,
      expiresAt
    });

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      token,
      minSubmitSeconds: Math.ceil(FEEDBACK_MIN_SUBMIT_MS / 1000),
      expiresInSeconds: Math.ceil(FEEDBACK_CHALLENGE_TTL_MS / 1000),
      limits: {
        title: FEEDBACK_TITLE_MAX,
        summary: FEEDBACK_SUMMARY_MAX,
        details: FEEDBACK_DETAILS_MAX,
        expectedOutcome: FEEDBACK_EXPECTED_MAX
      },
      categories: FEEDBACK_CATEGORIES
    });
  });

  app.post("/v1/feedback", feedbackSubmitBurstLimiter, feedbackSubmitDailyLimiter, async (req, res) => {
    await ensureStore;

    try {
      assertFeedbackOrigin(req);
    } catch (error) {
      const err = error as { status?: number; code?: string; message?: string };
      return res.status(err.status ?? 403).json({
        error: {
          code: err.code ?? "ORIGIN_MISMATCH",
          message: err.message ?? "Origin validation failed."
        }
      });
    }

    const session = await auth.getSession(req);
    if (!session?.user) {
      return res.status(401).json({
        error: {
          code: "FEEDBACK_AUTH_REQUIRED",
          message: "Please sign in to share feedback."
        }
      });
    }

    const parsed = feedbackSubmitSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "FEEDBACK_INVALID",
          message: "Please review the form fields and try again."
        }
      });
    }

    const payload = parsed.data;
    const challenge = verifyChallengeToken(payload.challengeToken);
    const now = Date.now();
    if (!challenge || challenge.expiresAt <= now) {
      return res.status(400).json({
        error: {
          code: "FEEDBACK_CHALLENGE_EXPIRED",
          message: "The feedback form expired. Please reload the page and try again."
        }
      });
    }
    if (now - challenge.issuedAt < FEEDBACK_MIN_SUBMIT_MS) {
      return res.status(400).json({
        error: {
          code: "FEEDBACK_SUBMIT_TOO_FAST",
          message: "Please take a moment to review your feedback before sending it."
        }
      });
    }
    if (payload.honeypot.trim().length > 0) {
      return res.status(400).json({
        error: {
          code: "FEEDBACK_REJECTED",
          message: "Feedback could not be submitted."
        }
      });
    }

    const title = compactWhitespace(payload.title);
    const summary = sanitizeMultiline(payload.summary);
    const details = sanitizeMultiline(payload.details);
    const expectedOutcome = sanitizeMultiline(payload.expectedOutcome);
    const sourcePath = payload.sourcePath ? compactWhitespace(payload.sourcePath) : null;
    const sourceLabel = payload.sourceLabel ? compactWhitespace(payload.sourceLabel) : null;
    const messageHash = hashFeedbackContent([payload.category, sourcePath, title, summary, details, expectedOutcome]);

    const duplicateRows = (await prisma.$queryRawUnsafe(
      `
        select id
        from app_feedback_submission
        where message_hash = $1
          and created_at >= now() - interval '24 hours'
        order by created_at desc
        limit 1
      `,
      messageHash
    )) as Array<{ id: string }>;

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        error: {
          code: "FEEDBACK_DUPLICATE",
          message: "This feedback looks like a recent duplicate. Please update the details before sending it again."
        }
      });
    }

    const submissionId = crypto.randomUUID();
    const sessionMode = "signed_in";
    const metadata = {
      challengeIssuedAt: challenge.issuedAt,
      challengeAgeMs: now - challenge.issuedAt,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 180) : null,
      ipHash: crypto
        .createHash("sha256")
        .update(`${feedbackSigningSecret()}:${requestIp(req)}`)
        .digest("hex")
    };

    await prisma.$executeRawUnsafe(
      `
        insert into app_feedback_submission (
          id,
          category,
          source_path,
          source_label,
          title,
          summary,
          details,
          expected_outcome,
          session_mode,
          user_uid,
          message_hash,
          attribution,
          metadata_json,
          delivery_status,
          delivery_attempts
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, 'pending', 0)
      `,
      submissionId,
      payload.category,
      sourcePath,
      sourceLabel,
      title,
      summary,
      details || null,
      expectedOutcome || null,
      sessionMode,
      session.user.uid,
      messageHash,
      JSON.stringify(payload.attribution ?? {}),
      JSON.stringify(metadata)
    );

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          event: "feedback_webhook_missing",
          submissionId
        })
      );
      await prisma.$executeRawUnsafe(
        `
          update app_feedback_submission
          set delivery_status = 'stored',
              delivery_error = $2,
              delivery_attempts = delivery_attempts + 1
          where id = $1
        `,
        submissionId,
        "FEEDBACK_WEBHOOK_URL is not configured."
      );
      return res.status(202).json({
        ok: true,
        referenceId: submissionId,
        status: "saved"
      });
    }

    const startedAt = Date.now();
    const sections = buildFeedbackSections({
      referenceId: submissionId,
      category: payload.category,
      sourcePath,
      sourceLabel,
      title,
      summary,
      details,
      expectedOutcome,
      sessionMode,
      attributionSummary: summarizeAttribution(payload.attribution ?? {})
    });

    try {
      await postFeedbackWebhook(webhookUrl, sections);
      await prisma.$executeRawUnsafe(
        `
          update app_feedback_submission
          set delivery_status = 'delivered',
              delivery_attempts = delivery_attempts + 1,
              delivered_at = now(),
              delivery_error = null
          where id = $1
        `,
        submissionId
      );
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          event: "feedback_submitted",
          submissionId,
          category: payload.category,
          sourcePath,
          sessionMode,
          durationMs: Date.now() - startedAt
        })
      );
      return res.json({
        ok: true,
        referenceId: submissionId,
        status: "delivered"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 600) : "Feedback delivery failed.";
      await prisma.$executeRawUnsafe(
        `
          update app_feedback_submission
          set delivery_status = 'stored',
              delivery_attempts = delivery_attempts + 1,
              delivery_error = $2
          where id = $1
        `,
        submissionId,
        message
      );
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          event: "feedback_delivery_failed",
          submissionId,
          category: payload.category,
          sourcePath,
          sessionMode,
          durationMs: Date.now() - startedAt,
          error: message
        })
      );
      return res.status(202).json({
        ok: true,
        referenceId: submissionId,
        status: "saved"
      });
    }
  });
}
