export const predictorModels: Record<
  string,
  { name: string; description: string }
> = {
  "no-change": {
    name: "No-change benchmark",
    description:
      "Tests whether learning improves on keeping the morning price.",
  },
  ridge: {
    name: "Regularised regression",
    description:
      "Learns restrained relationships between gap, momentum, volatility and the closing move.",
  },
  "similar-days": {
    name: "Similar-day matching",
    description:
      "Averages closing returns from 25 historically similar opening conditions.",
  },
};
export type PredictorRow = {
  id: string;
  day: string;
  symbol: string;
  model: string;
  version: string;
  published_at: string;
  target_at: string;
  source_at: string;
  payload: {
    reference: number;
    open: number;
    predicted: number;
    low: number;
    high: number;
    probabilityAboveReference: number;
    sampleCount: number;
    trainedThrough: string;
    condition: string;
    eligibility: { route: string };
    [key: string]: unknown;
  };
  outcome: null | {
    actual: number;
    absoluteErrorPct: number;
    directionCorrect: boolean;
    covered: boolean;
    brier: number;
    actualMovePct: number;
  };
};
export type StudyRow = {
  model: string;
  day: string;
  condition: string;
  actual: number;
  predicted: number;
  error: number;
  directionCorrect: boolean;
};
export type PredictorData = {
  generatedAt: string;
  selectedDay: string;
  dates: string[];
  forecasts: PredictorRow[];
  studies: {
    day: string;
    symbol: string;
    generated_at: string;
    payload: {
      rows: StudyRow[];
      usableSessions: number;
      excludedSessions: number;
      historyThrough: string;
      limitation: string;
    };
  }[];
  status: null | {
    updated_at: string;
    payload: {
      day: string;
      state: string;
      nextSession: null | { day: string };
      candidateCount?: number;
      eligibility: {
        symbol: string;
        direction: string;
        state: string;
        eligibility?: {
          gates: {
            name: string;
            actual: number | null;
            reference: number | null;
            passed: boolean | null;
            operator: string;
          }[];
        };
      }[];
    };
  };
  version: string;
};
export function predictorLeaderboard(rows: PredictorRow[]) {
  const cohorts = new Map<string, Set<string>>();
  rows.forEach((r) => {
    if (r.outcome) {
      const key = `${r.day}:${r.symbol}:${r.version}`;
      const set = cohorts.get(key) ?? new Set();
      set.add(r.model);
      cohorts.set(key, set);
    }
  });
  return Object.keys(predictorModels)
    .map((model) => {
      const eligible = rows.filter(
        (r) =>
          r.model === model &&
          r.outcome &&
          cohorts.get(`${r.day}:${r.symbol}:${r.version}`)?.size === 3,
      );
      const n = eligible.length,
        avg = (key: "absoluteErrorPct" | "brier") =>
          n ? eligible.reduce((s, r) => s + r.outcome![key], 0) / n : null;
      return {
        model,
        n,
        mae: avg("absoluteErrorPct"),
        brier: avg("brier"),
        hits: n
          ? eligible.filter((r) => r.outcome!.directionCorrect).length / n
          : null,
        coverage: n
          ? eligible.filter((r) => r.outcome!.covered).length / n
          : null,
      };
    })
    .sort(
      (a, b) =>
        (a.mae ?? Infinity) - (b.mae ?? Infinity) ||
        a.model.localeCompare(b.model),
    );
}
export function studyLeaderboard(rows: StudyRow[]) {
  return Object.keys(predictorModels)
    .map((model) => {
      const selected = rows.filter((r) => r.model === model),
        n = selected.length;
      return {
        model,
        n,
        mae: n ? selected.reduce((s, r) => s + Math.abs(r.error), 0) / n : null,
        hit: n ? selected.filter((r) => r.directionCorrect).length / n : null,
      };
    })
    .sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));
}
