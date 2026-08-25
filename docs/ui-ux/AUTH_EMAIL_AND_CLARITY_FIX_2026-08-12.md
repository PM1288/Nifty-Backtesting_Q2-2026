# Email authentication and Microsoft Clarity repair

Executed: 2026-08-12 UTC

## Outcome

The deployed N50 application now submits Firebase verification-email requests successfully and Microsoft Clarity session collection is no longer blocked by Content Security Policy.

## Email-login diagnosis

The application uses Firebase Authentication for email/password signup, verification and login. It does not use SMTP for authentication email delivery.

The failing request was reproduced directly against the configured Firebase project:

```text
Account creation: accepted
Verification request with https://n50.nifty50today.co.in/n50/: rejected as UNAUTHORIZED_DOMAIN
Verification request without a custom continue URL: accepted
Email/password sign-in: accepted
```

The client was automatically constructing the current application URL as a verification `continueUrl`, even though that hostname is not allowlisted in Firebase Authentication. It then depended on a second fallback request.

## Repair

- A verification continue URL is now sent only when `VITE_FIREBASE_AUTH_CONTINUE_URL` is explicitly configured.
- Production defaults to Firebase's hosted verification completion page. This avoids the unauthorized-domain failure and remains compatible with the existing `I Have Verified` action.
- Compose now exposes `N50_FIREBASE_AUTH_CONTINUE_URL` and `N50_STAGE_FIREBASE_AUTH_CONTINUE_URL` as optional build configuration.
- These values must remain blank until their hostname has been added to Firebase Authentication's Authorized domains list.
- Existing 12-hour server-session settings remain unchanged.

Relevant files:

- `neon-stock-terminal/apps/web/src/lib/firebase.ts`
- `neon-stock-terminal/Dockerfile`
- `docker-compose.yml`

## Why Mailpit was not inserted into production authentication

Mailpit captures SMTP traffic from an application-controlled mail server. Firebase sends verification emails from Google's hosted Identity Toolkit service, so pointing this application at Mailpit would not intercept or validate those messages. Adding an unused SMTP service would provide false confidence and would not repair user login.

The replacement test is provider-native and exercises the real browser flow:

1. Create a disposable Firebase user.
2. Log in through the deployed N50 email form.
3. Confirm the explicit unverified-email gate.
4. Click `Resend Email`.
5. Assert the Firebase `sendOobCode` request returns HTTP 200.
6. Delete the disposable Firebase user.

No test credentials or API keys are stored in evidence.

## Clarity diagnosis and repair

The Clarity bootstrap and runtime scripts returned HTTP 200, but collection requests to `https://t.clarity.ms/collect` were blocked by CSP. The origin has been added to `connect-src` in both:

- `neon-stock-terminal/apps/api/src/server.ts`
- `compose/nginx/nginx.conf`

After deployment, the browser regression observed multiple Clarity collection responses with HTTP 204 and no blocked Clarity requests.

## Validation

| Check | Result |
|---|---:|
| API tests | 70 passed |
| Web tests | 13 passed |
| API typecheck | Passed |
| Web typecheck | Passed |
| Production build | Passed |
| Nginx configuration test | Passed |
| Email and Clarity browser regression | 8/8 passed |
| Firebase verification request | HTTP 200 |
| Clarity collection | HTTP 204 |
| Dashboard health | Healthy |

Evidence:

- `tools/playwright/auth-email-clarity-regression.mjs`
- `output/playwright/auth-email-clarity/results.json`
- `output/playwright/auth-email-clarity/email-verification-and-clarity-1366x768.png`

## Remaining optional configuration

To return users directly to the N50 application after verification:

1. Add `n50.nifty50today.co.in` to Firebase Authentication > Settings > Authorized domains.
2. Set `N50_FIREBASE_AUTH_CONTINUE_URL=https://n50.nifty50today.co.in/n50/`.
3. Rebuild the dashboard.
4. Re-run the browser regression.

Until then, the hosted Firebase completion page plus the application's `I Have Verified` button is the safe working flow.

## Rollback

- Clear `N50_FIREBASE_AUTH_CONTINUE_URL` if a configured redirect is rejected.
- Revert the Firebase client change to restore the previous two-request fallback, although this is not recommended.
- Removing `https://t.clarity.ms` from CSP disables Clarity collection again but does not affect authentication.
