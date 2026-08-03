import type { DashboardPayload } from "./types";

const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "/api" : "/api/tree");

export async function fetchDashboard(mins = 120, seed = 1337): Promise<DashboardPayload> {
  const url = `${API_BASE}/dashboard?mins=${encodeURIComponent(mins)}&seed=${encodeURIComponent(seed)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return (await res.json()) as DashboardPayload;
}
