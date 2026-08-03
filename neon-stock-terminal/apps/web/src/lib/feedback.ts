import { getAttributionPayload } from "./attribution";

const FALLBACK_API_BASE = "";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE;

export const FEEDBACK_CATEGORY_OPTIONS = [
  { value: "bug_report", label: "Bug report" },
  { value: "data_issue", label: "Data issue" },
  { value: "improvement", label: "Improvement idea" },
  { value: "ux_feedback", label: "Design or usability" },
  { value: "general_feedback", label: "General feedback" }
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORY_OPTIONS)[number]["value"];

export type FeedbackChallengeResponse = {
  token: string;
  minSubmitSeconds: number;
  expiresInSeconds: number;
  limits: {
    title: number;
    summary: number;
    details: number;
    expectedOutcome: number;
  };
  categories: FeedbackCategory[];
};

export type FeedbackSubmitResponse = {
  ok: true;
  referenceId: string;
  status: "delivered" | "saved";
};

type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type FeedbackSubmitInput = {
  challengeToken: string;
  category: FeedbackCategory;
  title: string;
  summary: string;
  details: string;
  expectedOutcome: string;
  sourcePath?: string | null;
  sourceLabel?: string | null;
  honeypot?: string;
  confirmAccurate: true;
};

function parseApiError(res: Response, body: string) {
  try {
    const parsed = JSON.parse(body) as ApiErrorShape;
    const message = parsed.error?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  } catch {
    // Ignore parse failure and fall back to raw text.
  }
  return body.trim() || `Request failed with ${res.status}.`;
}

export async function fetchFeedbackChallenge(): Promise<FeedbackChallengeResponse> {
  const res = await fetch(`${API_BASE_URL}/v1/feedback/challenge`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(parseApiError(res, body));
  }

  return JSON.parse(body) as FeedbackChallengeResponse;
}

export async function submitFeedback(input: FeedbackSubmitInput): Promise<FeedbackSubmitResponse> {
  const res = await fetch(`${API_BASE_URL}/v1/feedback`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...input,
      attribution: getAttributionPayload()
    })
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(parseApiError(res, body));
  }

  return JSON.parse(body) as FeedbackSubmitResponse;
}
