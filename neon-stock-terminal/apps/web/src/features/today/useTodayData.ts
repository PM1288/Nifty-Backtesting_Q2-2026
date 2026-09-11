import { useMemo } from "react";
import { useAuthGate } from "../../auth/AuthGateProvider";
import { useLiveQuotesWithStatus, useOverview, useScalperProgression } from "../../lib/hooks";
import { useProfileIndex } from "../../lib/stockProfiles";
import { buildTodayModel } from "./todayModel";

export function useTodayData() {
  const { authReady, user } = useAuthGate();
  const overview = useOverview(authReady);
  const progression = useScalperProgression(authReady && Boolean(user));
  const profiles = useProfileIndex();
  const symbols = useMemo(() => overview.data ? [
    "NIFTY50", "BANKNIFTY", "INDIAVIX",
    ...overview.data.sectors.flatMap((sector) => sector.stocks.map((stock) => stock.symbol)),
  ] : [], [overview.data]);
  const live = useLiveQuotesWithStatus(symbols, authReady && Boolean(user));
  const model = useMemo(() => overview.data ? buildTodayModel(overview.data, live.quotes) : null, [overview.data, live.quotes]);
  return { overview, progression, profiles, live, model, authReady };
}
