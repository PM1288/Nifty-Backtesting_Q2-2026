import { getDisclosuresApiBaseUrl, getDisclosuresTimeoutMs } from "./runtimeConfig";

export type DisclosuresHealthResponse = {
  status: string;
};

export type DisclosuresLatestRunResponse = {
  path: string;
  latest_run: Record<string, unknown>;
};

export type DisclosuresRunRequest = {
  symbols?: string[];
  nse_fin_start_date?: string;
  nse_fin_end_date?: string;
  corp_actions_start_date?: string;
  corp_actions_end_date?: string;
  event_start_date?: string;
  event_end_date?: string;
  load_postgres?: boolean;
  truncate_tables_on_load?: boolean;
};

export type DisclosuresRunResponse = {
  run_id: string;
  run_root: string;
  combined_dir: string;
  manifest_path: string;
  error_log_path: string;
  dataset_row_counts: Record<string, number>;
  effective_symbols: string[];
  load_results: Array<Record<string, unknown>>;
};

export type DisclosuresLoadRequest = {
  run_id?: string;
  truncate_tables_on_load?: boolean;
};

export type DisclosuresLoadResponse = {
  run_id?: string | null;
  combined_dir: string;
  manifest_path: string;
  load_results: Array<Record<string, unknown>>;
};

type FetchLike = typeof fetch;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function parseErrorDetail(res: Response) {
  const text = (await res.text()).trim();
  return text.slice(0, 400);
}

export function createDisclosuresClient(options?: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? getDisclosuresApiBaseUrl());
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? getDisclosuresTimeoutMs();

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
        throw new Error(`Disclosures service ${response.status} on ${pathname}: ${detail}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Disclosures service timeout on ${pathname}.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getHealth() {
      return requestJson<DisclosuresHealthResponse>("/health");
    },
    getLatestRun() {
      return requestJson<DisclosuresLatestRunResponse>("/latest-run");
    },
    runPipeline(payload: DisclosuresRunRequest) {
      return requestJson<DisclosuresRunResponse>("/run", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    loadRun(payload: DisclosuresLoadRequest) {
      return requestJson<DisclosuresLoadResponse>("/load", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  };
}

export type DisclosuresClient = ReturnType<typeof createDisclosuresClient>;
