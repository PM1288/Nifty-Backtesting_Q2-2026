import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RequestAuthenticator } from "../auth/guard";
import { authLoginRateLimiter, authSignupRateLimiter } from "../security/rateLimit";
import {
  getDevLocalAuthDisplayName,
  getDevLocalAuthEmail,
  getDevLocalAuthPassword,
  isDevLocalAuthEnabled
} from "../lib/runtimeConfig";

const devLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(256)
});

const signupProfileSchema = z.object({
  idToken: z.string().min(32).max(4096),
  displayName: z.string().trim().min(2).max(80),
  mobileCanonical: z.string().regex(/^\+91[6-9]\d{9}$/),
  mobileNational: z.string().regex(/^[6-9]\d{9}$/),
  mobileRawInput: z.string().trim().min(10).max(32),
  mobileRiskScore: z.number().int().min(0).max(100),
  mobileRiskFlags: z.array(z.string().trim().min(1).max(48)).max(8),
  attribution: z.object({
    firstTouchSource: z.string().trim().max(160).nullable(),
    firstTouchMedium: z.string().trim().max(160).nullable(),
    firstTouchCampaign: z.string().trim().max(160).nullable(),
    firstTouchContent: z.string().trim().max(160).nullable(),
    firstTouchTerm: z.string().trim().max(160).nullable(),
    firstTouchId: z.string().trim().max(160).nullable(),
    firstTouchSourcePlatform: z.string().trim().max(160).nullable(),
    firstTouchReferrer: z.string().trim().max(600).nullable(),
    lastTouchSource: z.string().trim().max(160).nullable(),
    lastTouchMedium: z.string().trim().max(160).nullable(),
    lastTouchCampaign: z.string().trim().max(160).nullable(),
    lastTouchContent: z.string().trim().max(160).nullable(),
    lastTouchTerm: z.string().trim().max(160).nullable(),
    lastTouchId: z.string().trim().max(160).nullable(),
    lastTouchSourcePlatform: z.string().trim().max(160).nullable(),
    lastTouchReferrer: z.string().trim().max(600).nullable()
  })
});

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    code?: unknown;
    meta?: { code?: unknown; target?: unknown; cause?: unknown } | null;
    message?: unknown;
  };
  const directCode = typeof record.code === "string" ? record.code : null;
  const metaCode = record.meta && typeof record.meta.code === "string" ? record.meta.code : null;
  const message = typeof record.message === "string" ? record.message : "";
  const target =
    record.meta && Array.isArray(record.meta.target)
      ? record.meta.target.join(",")
      : typeof record.meta?.target === "string"
        ? record.meta.target
        : "";
  return (
    directCode === "23505" ||
    metaCode === "23505" ||
    (directCode === "P2010" && /duplicate key|unique constraint/i.test(message)) ||
    /mobile_canonical/i.test(target) ||
    /mobile_canonical|duplicate key|unique constraint/i.test(message)
  );
}

async function ensureAuthSignupProfiles(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    create table if not exists app_auth_signup_profile (
      uid text primary key,
      email text null,
      display_name text not null,
      mobile_canonical text not null unique,
      mobile_national text not null,
      mobile_raw_input text not null,
      mobile_risk_score integer not null default 0,
      mobile_risk_flags jsonb not null default '[]'::jsonb,
      mobile_verified boolean not null default false,
      first_touch_source text null,
      first_touch_medium text null,
      first_touch_campaign text null,
      first_touch_content text null,
      first_touch_term text null,
      first_touch_id text null,
      first_touch_source_platform text null,
      first_touch_referrer text null,
      last_touch_source text null,
      last_touch_medium text null,
      last_touch_campaign text null,
      last_touch_content text null,
      last_touch_term text null,
      last_touch_id text null,
      last_touch_source_platform text null,
      last_touch_referrer text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_source text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_medium text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_campaign text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_content text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_term text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_id text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_source_platform text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists first_touch_referrer text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_source text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_medium text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_campaign text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_content text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_term text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_id text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_source_platform text null;`);
  await prisma.$executeRawUnsafe(`alter table app_auth_signup_profile add column if not exists last_touch_referrer text null;`);
}

export function registerAuthRoutes(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  const ensureStoreReady = ensureAuthSignupProfiles(prisma);

  app.use("/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/auth/session", async (req, res) => {
    const session = await auth.getSession(req);
    if (!session) {
      return res.json({ authenticated: false, user: null, csrfToken: null });
    }
    return res.json({
      authenticated: true,
      user: session.user,
      csrfToken: session.csrfToken
    });
  });

  app.get("/auth/csrf", async (req, res) => {
    const session = await auth.getSession(req);
    if (!session) {
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Active session required." } });
    }
    return res.json({ csrfToken: session.csrfToken });
  });

  app.post("/auth/session/login", authLoginRateLimiter, async (req, res) => {
    const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
    try {
      const result = await auth.loginWithIdToken(req, res, idToken);
      return res.json({
        authenticated: true,
        user: result.user,
        csrfToken: result.csrfToken
      });
    } catch (err) {
      if (err instanceof Error && "status" in err && "code" in err) {
        const status = Number((err as any).status) || 401;
        const code = String((err as any).code || "AUTH_FAILED");
        return res.status(status).json({
          error: { code, message: err.message || "Authentication failed." }
        });
      }
      return res.status(401).json({ error: { code: "AUTH_FAILED", message: "Authentication failed." } });
    }
  });

  app.post("/auth/session/dev-login", authLoginRateLimiter, async (req, res) => {
    if (!isDevLocalAuthEnabled()) {
      return res.status(404).json({ error: { code: "DEV_AUTH_DISABLED", message: "Dev local auth is disabled." } });
    }

    const parsed = devLoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "DEV_AUTH_INVALID", message: "Invalid dev auth payload." } });
    }

    const expectedEmail = getDevLocalAuthEmail();
    const expectedPassword = getDevLocalAuthPassword();
    const displayName = getDevLocalAuthDisplayName() ?? "Local Admin";
    const providedEmail = parsed.data.email.trim().toLowerCase();

    if (!expectedEmail || !expectedPassword) {
      return res
        .status(503)
        .json({ error: { code: "DEV_AUTH_MISCONFIGURED", message: "Dev local auth is not configured." } });
    }

    if (providedEmail !== expectedEmail.toLowerCase() || parsed.data.password !== expectedPassword) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } });
    }

    try {
      const result = await auth.loginWithTrustedUser(req, res, {
        uid: `dev-local:${expectedEmail.toLowerCase()}`,
        email: expectedEmail,
        emailVerified: true,
        displayName
      });
      return res.json({
        authenticated: true,
        user: result.user,
        csrfToken: result.csrfToken
      });
    } catch (err) {
      if (err instanceof Error && "status" in err && "code" in err) {
        const status = Number((err as any).status) || 401;
        const code = String((err as any).code || "AUTH_FAILED");
        return res.status(status).json({
          error: { code, message: err.message || "Authentication failed." }
        });
      }
      return res.status(401).json({ error: { code: "AUTH_FAILED", message: "Authentication failed." } });
    }
  });

  app.post("/auth/session/logout", async (req, res) => {
    try {
      const session = await auth.getSession(req);
      if (session) {
        auth.requireCsrf(req, session);
      }
      await auth.clearSession(req, res);
      return res.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && "status" in err && "code" in err) {
        const status = Number((err as any).status) || 403;
        const code = String((err as any).code || "CSRF_INVALID");
        return res.status(status).json({
          error: { code, message: err.message || "Logout failed." }
        });
      }
      return res.status(403).json({ error: { code: "CSRF_INVALID", message: "Logout failed." } });
    }
  });

  app.post("/auth/profile/signup", authSignupRateLimiter, async (req, res) => {
    await ensureStoreReady;
    const parsed = signupProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "SIGNUP_PROFILE_INVALID", message: "Invalid signup profile payload." }
      });
    }

    try {
      const user = await auth.verifyIdToken(req, parsed.data.idToken);
      await prisma.$executeRawUnsafe(
        `
          insert into app_auth_signup_profile (
            uid,
            email,
            display_name,
            mobile_canonical,
            mobile_national,
            mobile_raw_input,
            mobile_risk_score,
            mobile_risk_flags,
            mobile_verified,
            first_touch_source,
            first_touch_medium,
            first_touch_campaign,
            first_touch_content,
            first_touch_term,
            first_touch_id,
            first_touch_source_platform,
            first_touch_referrer,
            last_touch_source,
            last_touch_medium,
            last_touch_campaign,
            last_touch_content,
            last_touch_term,
            last_touch_id,
            last_touch_source_platform,
            last_touch_referrer,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, false, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, now())
          on conflict (uid) do update
            set email = excluded.email,
                display_name = excluded.display_name,
                mobile_canonical = excluded.mobile_canonical,
                mobile_national = excluded.mobile_national,
                mobile_raw_input = excluded.mobile_raw_input,
                mobile_risk_score = excluded.mobile_risk_score,
                mobile_risk_flags = excluded.mobile_risk_flags,
                first_touch_source = excluded.first_touch_source,
                first_touch_medium = excluded.first_touch_medium,
                first_touch_campaign = excluded.first_touch_campaign,
                first_touch_content = excluded.first_touch_content,
                first_touch_term = excluded.first_touch_term,
                first_touch_id = excluded.first_touch_id,
                first_touch_source_platform = excluded.first_touch_source_platform,
                first_touch_referrer = excluded.first_touch_referrer,
                last_touch_source = excluded.last_touch_source,
                last_touch_medium = excluded.last_touch_medium,
                last_touch_campaign = excluded.last_touch_campaign,
                last_touch_content = excluded.last_touch_content,
                last_touch_term = excluded.last_touch_term,
                last_touch_id = excluded.last_touch_id,
                last_touch_source_platform = excluded.last_touch_source_platform,
                last_touch_referrer = excluded.last_touch_referrer,
                updated_at = now()
        `,
        user.uid,
        user.email,
        parsed.data.displayName,
        parsed.data.mobileCanonical,
        parsed.data.mobileNational,
        parsed.data.mobileRawInput,
        parsed.data.mobileRiskScore,
        JSON.stringify(parsed.data.mobileRiskFlags),
        parsed.data.attribution.firstTouchSource,
        parsed.data.attribution.firstTouchMedium,
        parsed.data.attribution.firstTouchCampaign,
        parsed.data.attribution.firstTouchContent,
        parsed.data.attribution.firstTouchTerm,
        parsed.data.attribution.firstTouchId,
        parsed.data.attribution.firstTouchSourcePlatform,
        parsed.data.attribution.firstTouchReferrer,
        parsed.data.attribution.lastTouchSource,
        parsed.data.attribution.lastTouchMedium,
        parsed.data.attribution.lastTouchCampaign,
        parsed.data.attribution.lastTouchContent,
        parsed.data.attribution.lastTouchTerm,
        parsed.data.attribution.lastTouchId,
        parsed.data.attribution.lastTouchSourcePlatform,
        parsed.data.attribution.lastTouchReferrer
      );

      return res.json({
        ok: true,
        profile: {
          uid: user.uid,
          email: user.email,
          mobileCanonical: parsed.data.mobileCanonical,
          mobileVerified: false
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "MOBILE_ALREADY_IN_USE", message: "This mobile number is already registered. Please log in instead." }
        });
      }
      if (err instanceof Error && "status" in err && "code" in err) {
        return res.status(Number((err as any).status) || 401).json({
          error: { code: String((err as any).code || "AUTH_FAILED"), message: err.message || "Signup profile failed." }
        });
      }
      return res.status(500).json({ error: { code: "SIGNUP_PROFILE_FAILED", message: "Unable to save signup profile." } });
    }
  });
}
