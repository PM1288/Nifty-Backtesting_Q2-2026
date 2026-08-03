import { getFiiReportsApiBaseUrl, getFiiReportsTimeoutMs } from "./runtimeConfig";

export type FiiReportsHealthResponse = {
  status: string;
  scheduler_enabled: boolean;
  scheduler_running: boolean;
};

export type FiiReportsLatestRunResponse = {
  output_dir: string;
  latest_run_path: string;
  latest_daily_path: string;
  latest_backfill_path: string;
  latest_run: Record<string, unknown> | null;
  latest_daily: Record<string, unknown> | null;
  latest_backfill: Record<string, unknown> | null;
};

export type FiiReportsRunsResponse = {
  output_dir: string;
  daily_runs: Array<Record<string, unknown>>;
  backfill_runs: Array<Record<string, unknown>>;
};

export type FiiReportsRunDetailResponse = Record<string, unknown>;

export type FiiReportsLatestPullRequest = {
  as_of_date?: string;
  max_lookback_days?: number;
  save_parsed?: boolean;
};

export type FiiReportsBackfillRequest = {
  start_date: string;
  end_date: string;
  save_parsed?: boolean;
  continue_on_error?: boolean;
};

export type FiiReportsLoadRequest = {
  kind?: "daily" | "backfill";
  run_id?: string;
  truncate_tables_on_load?: boolean;
};

export type FiiReportsRunResponse = Record<string, unknown>;

type FetchLike = typeof fetch;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function parseErrorDetail(res: Response) {
  const text = (await res.text()).trim();
  return text.slice(0, 400);
}

export function createFiiReportsClient(options?: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? getFiiReportsApiBaseUrl());
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? getFiiReportsTimeoutMs();

  async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (init?.body) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, {
        ...init,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await parseErrorDetail(response);
        throw new Error(`FII reports service ${response.status} on ${pathname}: ${detail}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`FII reports service timeout on ${pathname}.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getHealth() {
      return requestJson<FiiReportsHealthResponse>("/health");
    },
    getLatestRun() {
      return requestJson<FiiReportsLatestRunResponse>("/latest-run");
    },
    listRuns(limit = 20) {
      return requestJson<FiiReportsRunsResponse>(`/runs?limit=${encodeURIComponent(String(limit))}`);
    },
    getRunDetail(kind: "daily" | "backfill", runId: string) {
      return requestJson<FiiReportsRunDetailResponse>(`/runs/${encodeURIComponent(kind)}/${encodeURIComponent(runId)}`);
    },
    pullLatest(payload: FiiReportsLatestPullRequest) {
      return requestJson<FiiReportsRunResponse>("/pull-latest", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    backfill(payload: FiiReportsBackfillRequest) {
      return requestJson<FiiReportsRunResponse>("/backfill", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    load(payload: FiiReportsLoadRequest) {
      return requestJson<FiiReportsRunResponse>("/load", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  };
}

export type FiiReportsClient = ReturnType<typeof createFiiReportsClient>;
