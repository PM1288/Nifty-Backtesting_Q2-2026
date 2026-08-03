import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, CheckCircle2, MessageSquareText } from "lucide-react";
import { DataState, ButtonLink, ButtonSecondary } from "../components/ui/DashboardPrimitives";
import { trackAnalyticsEvent } from "../lib/analytics";
import {
  FEEDBACK_CATEGORY_OPTIONS,
  fetchFeedbackChallenge,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackChallengeResponse
} from "../lib/feedback";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader } from "./AnalyticsChrome";
import pageStyles from "./AnalyticsPage.module.css";
import styles from "./FeedbackPage.module.css";

type FeedbackFormState = {
  category: FeedbackCategory;
  title: string;
  summary: string;
  honeypot: string;
  confirmAccurate: boolean;
};

const DEFAULT_FORM_STATE: FeedbackFormState = {
  category: "general_feedback",
  title: "",
  summary: "",
  honeypot: "",
  confirmAccurate: false
};

function clampInput(value: string, limit: number) {
  return value.length > limit ? value.slice(0, limit) : value;
}

function remaining(limit: number, value: string) {
  return Math.max(0, limit - value.length);
}

export function FeedbackPage() {
  const { t, tr } = useI18n();
  const { authReady, user, openAuthGate } = useAuthGate();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sourcePath = query.get("from");
  const sourceLabel = query.get("label");

  const [challenge, setChallenge] = useState<FeedbackChallengeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"delivered" | "saved" | null>(null);
  const [form, setForm] = useState<FeedbackFormState>(DEFAULT_FORM_STATE);

  useEffect(() => {
    void trackAnalyticsEvent("feedback_view", {
      page_path: location.pathname,
      source_path: sourcePath ?? undefined
    });
  }, [location.pathname, sourcePath]);

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }

    if (!user) {
      setChallenge(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void fetchFeedbackChallenge()
      .then((payload) => {
        if (!active) return;
        setChallenge(payload);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : tr("Feedback is unavailable right now."));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authReady, tr, user]);

  const limits = challenge?.limits ?? {
    title: 120,
    summary: 600,
    details: 1400,
    expectedOutcome: 480
  };

  const categoryOptions = FEEDBACK_CATEGORY_OPTIONS.map((option) => ({
    ...option,
    label: tr(option.label)
  }));

  const sourceDescriptor = sourceLabel ?? sourcePath;

  const submitDisabled =
    submitting ||
    !challenge ||
    !form.confirmAccurate ||
    form.title.trim().length < 3 ||
    form.summary.trim().length < 12;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge || submitDisabled) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await submitFeedback({
        challengeToken: challenge.token,
        category: form.category,
        title: form.title.trim(),
        summary: form.summary.trim(),
        details: "",
        expectedOutcome: "",
        sourcePath,
        sourceLabel,
        honeypot: form.honeypot,
        confirmAccurate: true
      });

      setSubmitted(response.status);
      setForm(DEFAULT_FORM_STATE);
      void trackAnalyticsEvent("feedback_submit", {
        category: form.category,
        source_path: sourcePath ?? undefined,
        delivery_status: response.status
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : tr("Feedback could not be sent right now.");
      setError(message);
      void trackAnalyticsEvent("feedback_submit_failed", {
        category: form.category,
        source_path: sourcePath ?? undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DataState
        kind="loading"
        title={tr("Loading feedback")}
        body={tr("Preparing the feedback workspace so you can send a clear note without leaving the dashboard.")}
      />
    );
  }

  if (authReady && !user) {
    return (
      <DataState
        kind="empty"
        title={tr("Sign in to share feedback")}
        body={tr("Feedback is available to signed-in members so we can keep the channel useful and reduce spam.")}
        action={
          <ButtonSecondary onClick={openAuthGate}>
            {tr("Sign in")}
          </ButtonSecondary>
        }
      />
    );
  }

  if (error && !challenge) {
    return (
      <DataState
        kind="error"
        title={tr("Feedback is unavailable")}
        body={error}
        action={
          <ButtonSecondary onClick={() => window.location.reload()}>
            {tr("Try again")}
          </ButtonSecondary>
        }
      />
    );
  }

  return (
    <div className={pageStyles.page}>
      <AnalyticsHeader
        title={tr("Share feedback")}
        meta={
          sourceDescriptor
            ? t("feedback.openedFrom", "Opened from {{source}}", { source: sourceDescriptor })
            : tr("Signed-in feedback channel")
        }
        subtitle={tr("Use this page for product feedback, data issues, usability gaps, or ideas worth improving. Keep it concrete and tell us what you expected to see.")}
        learningPrompt={tr("The best notes say what happened, where you saw it, and what a better result would look like.")}
        action={
          <ButtonLink to={sourcePath || "/"} variant="secondary">
            {tr("Back to dashboard")}
          </ButtonLink>
        }
      />

      <section className={styles.layout}>
        <form className={styles.formCard} onSubmit={onSubmit}>
          <div className={styles.formHeader}>
            <div>
              <div className={styles.cardEyebrow}>{tr("Feedback form")}</div>
              <h2 className={styles.cardTitle}>{tr("Tell us what needs work")}</h2>
            </div>
            {challenge ? (
              <div className={styles.helperText}>
                {t("ui.feedbackMinReview", "Take at least {{seconds}} seconds to review before sending.", {
                  seconds: challenge.minSubmitSeconds
                })}
              </div>
            ) : null}
          </div>

          {submitted ? (
            <div className={styles.notice} data-tone="success">
              <CheckCircle2 size={18} />
              <div>
                <div className={styles.noticeTitle}>{tr("Thanks for the feedback")}</div>
                <div className={styles.noticeBody}>
                  {submitted === "delivered"
                    ? tr("Your note was received successfully.")
                    : tr("Your note was saved successfully.")}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className={styles.notice} data-tone="error">
              <AlertCircle size={18} />
              <div>
                <div className={styles.noticeTitle}>{tr("Could not send feedback")}</div>
                <div className={styles.noticeBody}>{error}</div>
              </div>
            </div>
          ) : null}

          <label className={styles.field}>
            <span className={styles.label}>{tr("Category")}</span>
            <select
              className={pageStyles.input}
              value={form.category}
              onChange={(event) => {
                const nextCategory = event.currentTarget.value as FeedbackCategory;
                setForm((current) => ({ ...current, category: nextCategory }));
              }}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{tr("Title")}</span>
            <input
              className={pageStyles.input}
              type="text"
              maxLength={limits.title}
              placeholder={tr("Brief headline for the issue or idea")}
              value={form.title}
              onChange={(event) => {
                const nextTitle = clampInput(event.currentTarget.value, limits.title);
                setForm((current) => ({ ...current, title: nextTitle }));
              }}
            />
            <span className={styles.counter}>{remaining(limits.title, form.title)} {tr("characters left")}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{tr("What happened?")}</span>
            <textarea
              className={styles.textarea}
              rows={10}
              maxLength={limits.summary}
              placeholder={tr("Describe the issue clearly. Mention the page, chart, table, symbol, expiry, or action you were using and what felt wrong.")}
              value={form.summary}
              onChange={(event) => {
                const nextSummary = clampInput(event.currentTarget.value, limits.summary);
                setForm((current) => ({ ...current, summary: nextSummary }));
              }}
            />
            <span className={styles.counter}>{remaining(limits.summary, form.summary)} {tr("characters left")}</span>
          </label>

          <label className={styles.honeypotField} aria-hidden="true">
            <span>{tr("Leave this field blank")}</span>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.honeypot}
              onChange={(event) => {
                const nextHoneypot = event.currentTarget.value;
                setForm((current) => ({ ...current, honeypot: nextHoneypot }));
              }}
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.confirmAccurate}
              onChange={(event) => {
                const nextConfirmAccurate = event.currentTarget.checked;
                setForm((current) => ({ ...current, confirmAccurate: nextConfirmAccurate }));
              }}
            />
            <span>{tr("I confirm this is genuine product feedback and not automated or promotional content.")}</span>
          </label>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              data-disabled={submitDisabled ? "true" : "false"}
              disabled={submitDisabled}
            >
              {submitting ? tr("Sending…") : tr("Send feedback")}
            </button>
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => {
                setForm(DEFAULT_FORM_STATE);
                setError(null);
                setSubmitted(null);
              }}
            >
              {tr("Clear form")}
            </button>
          </div>
        </form>

        <aside className={styles.sideCard}>
          <div className={styles.cardEyebrow}>{tr("What helps most")}</div>
          <h2 className={styles.cardTitle}>{tr("Fastest path to a useful fix")}</h2>
          <div className={styles.sideList}>
            <div className={styles.sideItem}>
              <MessageSquareText size={16} />
              <span>{tr("Mention the page, chart, or table where you saw the issue.")}</span>
            </div>
            <div className={styles.sideItem}>
              <MessageSquareText size={16} />
              <span>{tr("Describe what happened before describing the fix you want.")}</span>
            </div>
            <div className={styles.sideItem}>
              <MessageSquareText size={16} />
              <span>{tr("If this was a data issue, include the symbol, timeframe, or expiry you were looking at.")}</span>
            </div>
          </div>

          {sourceDescriptor ? (
            <div className={styles.contextBox}>
              <div className={styles.contextLabel}>{tr("Current context")}</div>
              <div className={styles.contextValue}>{sourceDescriptor}</div>
            </div>
          ) : null}

          <div className={styles.contextBox}>
            <div className={styles.contextLabel}>{tr("Review before sending")}</div>
            <div className={styles.contextValue}>
              {tr("Short title, clear issue, expected result, and the confirmation tick are required.")}
            </div>
          </div>

          <div className={styles.secondaryActions}>
            <Link
              to={sourcePath || "/"}
              className={styles.inlineLink}
              onClick={() => {
                void trackAnalyticsEvent("cta_click", {
                  cta_name: "feedback_back_to_dashboard",
                  page_section: "feedback"
                });
              }}
            >
              {tr("Return to the dashboard")}
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
