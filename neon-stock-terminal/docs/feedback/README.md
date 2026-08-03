# Feedback Flow

This product includes a first-party feedback page at `/feedback` in both `PROD` and `STAGE`.

## What it does

- adds a top-bar `Feedback` action in the main N50 shell
- opens a dedicated feedback page instead of an inline popup
- accepts structured product feedback with section-level character limits
- stores each submission in `app_feedback_submission`
- delivers the submission through the server-side feedback webhook

## Security model

The client never sees the webhook URL.

Protections in the feedback API:

- same-origin validation against the current app host
- signed short-lived challenge token
- minimum fill time before submit
- required confirmation checkbox
- hidden honeypot field
- burst and daily per-connection rate limiting
- duplicate-content suppression for recent submissions

## Environment variables

Set these for both `PROD` and `STAGE` dashboard containers:

- `N50_FEEDBACK_WEBHOOK_URL`
- `N50_FEEDBACK_SIGNING_SECRET`

`N50_FEEDBACK_SIGNING_SECRET` should be a long random secret. If it is missing, the server falls back to an ephemeral in-memory secret and logs a warning.

## Database

Feedback is stored in:

- `app_feedback_submission`

The table keeps:

- category
- page/source context
- title, summary, details, expected outcome
- guest vs signed-in state
- attribution payload
- delivery status and timestamps

## UI rules

- no mention of the downstream delivery system appears in the UI
- no internal developer text is shown to users
- the feedback page stays inside the existing app shell and dark-theme language

## Operational note

If the webhook is unavailable, the submission is still stored and the API returns a non-failing saved status so the product team can review it later from the database.
