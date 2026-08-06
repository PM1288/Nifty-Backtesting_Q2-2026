export type Direction = "up" | "down" | "flat";

export type QuoteLite = {
  symbol: string;
  last: number;
  changePct: number;
};

export type Quote = {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  sector?: string | null;
  volume?: number | string | null;
  timestamp?: string;
  rsi?: number | null;
  willr?: number | null;
};

export type SectorGroup = {
  sector: string;
  stocks: Quote[];
};

export type OverviewResponse = {
  asOf: string;
  market: {
    isOpen: boolean;
    label: "OPEN" | "CLOSED";
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
  nifty: Quote;
  sectors: SectorGroup[];
  leaderboards: {
    gainers: Quote[];
    losers: Quote[];
  };
  tickerTape: QuoteLite[];
};

export type IntradayBar = {
  t: string; // ISO
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

export type StockDetailResponse = {
  asOf: string;
  range?: "1D" | "5D" | "1M" | "6M" | "1Y";
  stock: Quote & {
    sector?: string | null;
    day?: {
      prevClose: number;
      open: number;
      high: number;
      low: number;
      volume?: number | string | null;
    };
  };
  intraday: IntradayBar[];
};

export type LeaderboardResponse = {
  asOf: string;
  items: Quote[];
  gainers: Quote[];
  losers: Quote[];
};

export type AnalyticsMarketSummary = {
  tradeDate: string;
  marketRegime: string;
  securitiesCount: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  positiveRatio: number;
  avgDailyReturn: number;
  medianDailyReturn: number;
  totalTurnoverLacs: number;
  avgVolumeRel20: number;
  avgDeliveryRel20: number;
  breakoutCount: number;
  breakdownCount: number;
  accumulationCount: number;
  distributionCount: number;
  eventCount: number;
  anomalyCount: number;
  riskCount: number;
  niftyClose: number;
  niftyReturn: number;
};

export type AnalyticsRegimePoint = {
  tradeDate: string;
  marketRegime: string;
  positiveRatio: number;
  avgDailyReturn: number;
  breakoutCount: number;
  breakdownCount: number;
  eventCount: number;
  anomalyCount: number;
};

export type AnalyticsWatchlistItem = {
  tradeDate: string;
  symbol: string;
  series: string;
  securityName: string;
  closePrice: number;
  dailyReturn: number;
  volumeRel20: number;
  deliveryRel20: number;
  compositeTrendScore: number;
  compositeAnomalyScore: number;
  compositeRiskScore: number;
  maxSignalStrength: number;
  signals: string[];
};

export type AnalyticsSignalGroup = {
  analysisType: string;
  items: Array<{
    signalName: string;
    signalDirection: string;
    signalCount: number;
    avgSignalStrength: number;
    maxSignalStrength: number;
  }>;
};

export type AnalyticsSignalPerformanceItem = {
  analysisType: string;
  signalName: string;
  signalDirection: string;
  sampleSize: number;
  hitRate5d: number;
  avgForwardReturn5d: number;
  medianForwardReturn5d: number;
};

export type AnalyticsDashboardResponse = {
  asOf: string;
  tradeDate: string;
  marketSummary: AnalyticsMarketSummary;
  regimeHistory: AnalyticsRegimePoint[];
  watchlist: AnalyticsWatchlistItem[];
  signalGroups: AnalyticsSignalGroup[];
  signalPerformance: AnalyticsSignalPerformanceItem[];
};

export type AnalyticsFlowLeader = {
  tradeDate: string;
  symbol: string;
  series: string;
  securityName: string;
  closePrice: number;
  dailyReturn: number;
  volumeRel20: number;
  deliveryRel20: number;
  shortSellQty: number;
  marginFinancedQty: number;
  avgApplicableMarginRate: number;
  hasAnnouncement: boolean;
};

export type AnalyticsEventItem = {
  reportDate: string;
  eventType: string;
  symbol: string;
  headline: string;
};

export type AnalyticsDealItem = {
  tradeDate: string;
  symbol: string;
  clientName: string;
  side: string;
  quantityTraded: number;
  tradePrice: number;
};

export type AnalyticsFlowsResponse = {
  asOf: string;
  tradeDate: string;
  flowLeaders: AnalyticsFlowLeader[];
  announcements: AnalyticsEventItem[];
  bulkDeals: AnalyticsDealItem[];
  blockDeals: AnalyticsDealItem[];
};

export type AnalyticsEventsHeatmapDay = {
  date: string;
  count: number;
};

export type AnalyticsCalendarEventRow = {
  runId: string;
  symbol: string;
  companyName: string | null;
  purpose: string | null;
  details: string | null;
  eventDate: string | null;
  broadcastDatetime: string | null;
  attachment: string | null;
  source: string;
};

export type AnalyticsEventsResponse = {
  asOf: string;
  latestRunId: string | null;
  latestLoadedAt: string | null;
  latestCombinedFile: string | null;
  summary: {
    totalEvents: number;
    uniqueSymbols: number;
    upcomingEvents: number;
    attachmentCount: number;
    loadedRowCount: number;
    dateRange: {
      start: string | null;
      end: string | null;
    };
    busiestDay: {
      date: string | null;
      count: number;
    };
  };
  symbols: string[];
  topSymbols: Array<{
    symbol: string;
    count: number;
  }>;
  heatmap: AnalyticsEventsHeatmapDay[];
  events: AnalyticsCalendarEventRow[];
};

export type AnalyticsEventCatalystRow = {
  id: string;
  symbol: string;
  securityName: string | null;
  sectorName: string;
  catalystType: string;
  timingType: string;
  eventDate: string | null;
  reportDate: string | null;
  headline: string;
  detail: string;
  tradeabilityImpact: string;
  priceContext: string;
  informative: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
};

export type AnalyticsEventSectorCluster = {
  sectorName: string;
  eventCount: number;
  uniqueSymbols: number;
  upcomingCount: number;
  recentCount: number;
  dealValueCr: number;
  overlayLabel: string;
  confirmsFlow: boolean;
};

export type AnalyticsEventContextResponse = {
  asOf: string;
  latestTradeDate: string | null;
  latestEventDate: string | null;
  summary: {
    upcomingCount: number;
    recentCount: number;
    latestFeatureTradeDate: string | null;
    latestEventDate: string | null;
    institutionalBackdrop: string;
    clusteredSectorCount: number;
    informativeDealSectorCount: number;
    trustRule: string;
    contextRule: string;
  };
  upcomingCatalysts: AnalyticsEventCatalystRow[];
  recentCatalysts: AnalyticsEventCatalystRow[];
  sectorClusters: AnalyticsEventSectorCluster[];
  dataQualityFlags: string[];
  charts: {
    eventCalendarHeatmap: Array<{ date: string; count: number }>;
    boardMeetingSchedule: Array<{ date: string; eventType: string; label: string; count: number; symbols: string[] }>;
    corporateActionTimeline: Array<{ date: string | null; symbol: string; sectorName: string; purpose: string; timingType: string }>;
    blockBulkDealValueBySector: Array<{ sectorName: string; bulkValueCr: number; blockValueCr: number; totalValueCr: number; informativeScore: number }>;
    eventDensityVsForwardReturn: Array<{ tradeDate: string; eventCount: number; avgForwardReturn1d: number | null; avgForwardReturn3d: number | null; avgForwardReturn5d: number | null }>;
    institutionalContextOverlayBySector: AnalyticsEventSectorCluster[];
  };
};

export type MarketStateMinutePoint = {
  minuteNo: number;
  minuteTs: string | null;
  minuteLabel: string;
  lastPrice: number | null;
  changePct: number | null;
  breadthUpPct: number | null;
  breadthAboveVwapPct: number | null;
  weightedParticipationPct: number | null;
  top10ConcentrationPct: number | null;
  sessionState: string;
};

export type MarketStateHistoryStat = {
  primaryState: string;
  label: string;
  sessionCount: number;
  avgSessionChangePct: number | null;
  avgGapPct: number | null;
  avgBreadthUpPct: number | null;
  avgBreadthAboveVwapPct: number | null;
  avgTop10ConcentrationPct: number | null;
  avgNextDayChangePct: number | null;
  nextDayFollowthroughPct: number | null;
};

export type MarketStateAnalog = {
  tradeDate: string | null;
  primaryState: string | null;
  label: string;
  changePct: number | null;
  gapPct: number | null;
  closeLocationPct: number | null;
  breadthUpPct: number | null;
  breadthAboveVwapPct: number | null;
  weightedParticipationPct: number | null;
  top10ConcentrationPct: number | null;
  nextDayChangePct: number | null;
  similarityScore: number | null;
};

export type AnalyticsMarketStateResponse = {
  asOf: string;
  tradeDate: string | null;
  session: {
    tradeDate: string | null;
    asOf: string | null;
    generatedAt: string | null;
    indexCode: string;
    indexName: string | null;
    lastPrice: number | null;
    prevClose: number | null;
    changePct: number | null;
    gapPct: number | null;
    sessionRangePct: number | null;
    closeLocationPct: number | null;
    openRange15Pct: number | null;
    breadthUpPct: number | null;
    breadthAboveVwapPct: number | null;
    breadthAboveOrHighPct: number | null;
    breadthBelowOrLowPct: number | null;
    dispersionPct: number | null;
    weightedParticipationPct: number | null;
    top10ConcentrationPct: number | null;
    participationLabel: string | null;
    primaryState: string | null;
    secondaryStates: string[];
    confidenceScore: number | null;
    gapFilled: boolean;
    failedOpen: boolean;
    lateDayReversal: boolean;
    highVolatilityChop: boolean;
    narrowLeadership: boolean;
    broadParticipation: boolean;
    narrative: string | null;
  } | null;
  officialContext: {
    nifty50: {
      tradeDate: string | null;
      close: number | null;
      changePct: number | null;
    } | null;
    indiaVix: {
      tradeDate: string | null;
      close: number | null;
      changePct: number | null;
    } | null;
  } | null;
  minuteSeries: MarketStateMinutePoint[];
  stateStats: MarketStateHistoryStat[];
  exactStateStats: MarketStateHistoryStat | null;
  analogs: MarketStateAnalog[];
  verdict: {
    dominantState: string;
    preferredEnvironment: string;
  } | null;
};

export type AnalyticsOptionsStructureWall = {
  strike: number;
  distanceFromSpot: number | null;
  openInterest: number | null;
  changeInOi: number | null;
  side: "call" | "put";
};

export type AnalyticsOptionsStructureStrikeRow = {
  strike: number;
  distanceFromSpot: number | null;
  callLtp: number | null;
  putLtp: number | null;
  callIv: number | null;
  putIv: number | null;
  callOi: number | null;
  putOi: number | null;
  callChangeOi: number | null;
  putChangeOi: number | null;
  callVolume: number | null;
  putVolume: number | null;
  gammaExposure: number | null;
  deltaExposure: number | null;
};

export type AnalyticsOptionsStructurePcrRow = {
  expiry: string | null;
  capturedAt: string | null;
  pcr: number | null;
  callOi: number | null;
  putOi: number | null;
};

export type AnalyticsOptionsStructureMaxPainPoint = {
  expiry: string | null;
  updatedAt: string | null;
  maxPainStrike: number | null;
  spotPrice: number | null;
  distanceFromSpot: number | null;
  staleDays: number | null;
};

export type AnalyticsOptionsStructureTermPoint = {
  expiry: string | null;
  capturedAt: string | null;
  referenceStrike: number | null;
  atmIv: number | null;
  delta: number | null;
  gamma: number | null;
  currentExpirySkew: number | null;
};

export type AnalyticsOptionsStructureWallMigrationPoint = {
  capturedAt: string | null;
  expiryDate: string | null;
  spot: number | null;
  optionType: "CE" | "PE";
  strike: number | null;
  openInterest: number | null;
  changeInOi: number | null;
};

export type AnalyticsOptionsStructureGammaDeltaPoint = {
  strike: number;
  gammaExposure: number | null;
  deltaExposure: number | null;
};

export type AnalyticsOptionsStructureEquilibriumCurrent = {
  expiry: string | null;
  strike: number | null;
  refPrice: number | null;
  ceNorm: number | null;
  peNorm: number | null;
  updatedAt: string | null;
  staleDays: number | null;
};

export type AnalyticsOptionsStructureEquilibriumMeanPoint = {
  ts: string | null;
  expiry: string | null;
  ceMeanNorm: number | null;
  peMeanNorm: number | null;
  ceCount: number | null;
  peCount: number | null;
  lookbackMinutes: number | null;
};

export type AnalyticsOptionsStructureResponse = {
  asOf: string;
  symbol: string;
  underlying: string;
  latestSnapshot: {
    capturedAt: string | null;
    expiryDate: string | null;
    spot: number | null;
    atmStrike: number | null;
  } | null;
  summary: {
    structureSummary: string;
    nearestStructure: {
      callWall: number | null;
      putWall: number | null;
    };
    spotState: string;
    optionsVsSpot: string;
    pcrContext: string;
    maxPainContext: string;
    equilibriumContext: string;
    dataQualityFlags: string[];
  } | null;
  nearestCallWalls: AnalyticsOptionsStructureWall[];
  nearestPutWalls: AnalyticsOptionsStructureWall[];
  strikeLadder: AnalyticsOptionsStructureStrikeRow[];
  pcrByExpiry: AnalyticsOptionsStructurePcrRow[];
  maxPainDrift: AnalyticsOptionsStructureMaxPainPoint[];
  termStructure: AnalyticsOptionsStructureTermPoint[];
  wallMigration: AnalyticsOptionsStructureWallMigrationPoint[];
  gammaDeltaConcentration: AnalyticsOptionsStructureGammaDeltaPoint[];
  equilibrium: {
    current: AnalyticsOptionsStructureEquilibriumCurrent | null;
    meanSeries: AnalyticsOptionsStructureEquilibriumMeanPoint[];
  };
};

export type LeadershipCategory =
  | "true leader"
  | "orderly follower"
  | "catch-up candidate"
  | "reversal candidate"
  | "avoid / noisy";

export type AnalyticsLeadershipStock = {
  symbol: string;
  securityName: string | null;
  sectorName: string;
  lastPrice: number | null;
  absoluteReturnPct: number | null;
  residualReturn60mPct: number | null;
  relativeStrengthBps: number | null;
  vwapHoldQualityScore: number | null;
  rsPersistenceScore: number | null;
  volumeCurveSurprise: number | null;
  continuationScore: number | null;
  reversalScore: number | null;
  catchUpScore: number | null;
  betaFollowScore: number | null;
  headlineSpikeScore: number | null;
  compositeTrendScore: number | null;
  compositeRiskScore: number | null;
  hasAnnouncement: boolean;
  category: LeadershipCategory;
  leadershipScore: number;
  categoryRank: number;
  convictionLabel: string;
  explanation: string;
  reasons: string[];
};

export type AnalyticsLeadershipSector = {
  sectorName: string;
  stockCount: number;
  avgResidualReturn60mPct: number;
  avgLeadershipScore: number;
  avgContinuationScore: number;
  avgReversalScore: number;
  avgVwapHoldScore: number;
  trueLeaderCount: number;
  avoidCount: number;
  confirmation: string;
  contradiction: string;
};

export type AnalyticsLeadershipResponse = {
  asOf: string;
  tradeDate: string | null;
  marketState: {
    generatedAt: string | null;
    dominantState: string;
    continuationBias: string;
    indexChangePct: number | null;
    breadthUpPct: number | null;
    breadthAboveVwapPct: number | null;
    weightedParticipationPct: number | null;
    top10ConcentrationPct: number | null;
  } | null;
  coverage: {
    stockCount: number;
    sectorCount: number;
    asOf: string | null;
  };
  summary: {
    dominantState: string;
    continuationBias: string;
    trueLeaderCount: number;
    followerCount: number;
    catchUpCount: number;
    reversalCount: number;
    avoidCount: number;
    strongestSector: string | null;
    weakestSector: string | null;
    leadershipVsBeta: string;
    marketSupportNote: string;
  } | null;
  topLeaders: AnalyticsLeadershipStock[];
  falseLeaders: AnalyticsLeadershipStock[];
  catchUpCandidates: AnalyticsLeadershipStock[];
  reversalCandidates: AnalyticsLeadershipStock[];
  rankingBoard: AnalyticsLeadershipStock[];
  sectorStrength: AnalyticsLeadershipSector[];
};

export type DailySetupStyle =
  | "breakout continuation"
  | "pullback entry"
  | "relative-strength hold"
  | "mean-reversion only"
  | "avoid";

export type DailySetupQuality = "constructive" | "mixed" | "deceptive";

export type AnalyticsDailySetupRow = {
  symbol: string;
  securityName: string | null;
  closePrice: number | null;
  dailyReturn: number | null;
  volumeRel20: number | null;
  deliveryRel20: number | null;
  distanceFrom52wHighPct: number | null;
  analysisType: string | null;
  signalName: string | null;
  signalDirection: string | null;
  signalStrength: number | null;
  rationale: string | null;
  sampleSize: number;
  marketRegime: string;
  hitRate1d: number | null;
  hitRate3d: number | null;
  hitRate5d: number | null;
  hitRate10d: number | null;
  avgForwardReturn1d: number | null;
  avgForwardReturn3d: number | null;
  avgForwardReturn5d: number | null;
  avgForwardReturn10d: number | null;
  breakout20d: boolean;
  breakdown20d: boolean;
  highVolume: boolean;
  highDelivery: boolean;
  hasAnnouncement: boolean;
  hasBoardMeeting: boolean;
  hasCorporateAction: boolean;
  compositeTrendScore: number | null;
  compositeReversalScore: number | null;
  compositeRiskScore: number | null;
  setupStyle: DailySetupStyle;
  qualityLabel: DailySetupQuality;
  rankingScore: number;
  reasons: string[];
  cautionFlags: string[];
};

export type AnalyticsDailyBucket = {
  bucketLabel: string;
  bucketOrder: number;
  sampleSize: number;
  hitRate5d: number | null;
  avgForwardReturn1d: number | null;
  avgForwardReturn3d: number | null;
  avgForwardReturn5d: number | null;
  avgForwardReturn10d: number | null;
  medianForwardReturn5d: number | null;
};

export type AnalyticsDailySignalHitRate = {
  analysisType: string;
  signalName: string;
  signalDirection: string;
  sampleSize: number;
  hitRate1d: number | null;
  hitRate3d: number | null;
  hitRate5d: number | null;
  hitRate10d: number | null;
  avgForwardReturn1d: number | null;
  avgForwardReturn3d: number | null;
  avgForwardReturn5d: number | null;
  avgForwardReturn10d: number | null;
};

export type AnalyticsDailyRegimePerformance = {
  analysisType: string;
  signalName: string;
  signalDirection: string;
  marketRegime: string;
  sampleSize: number;
  avgForwardReturn1d: number | null;
  avgForwardReturn3d: number | null;
  avgForwardReturn5d: number | null;
  avgForwardReturn10d: number | null;
};

export type AnalyticsDailySetupsResponse = {
  asOf: string;
  tradeDate: string | null;
  marketContext: {
    tradeDate: string | null;
    marketRegime: string;
    breakoutCount: number;
    breakdownCount: number;
    accumulationCount: number;
    distributionCount: number;
    positiveRatio: number | null;
    avgDailyReturn: number | null;
  } | null;
  summary: {
    currentRegime: string;
    activeSetupCount: number;
    constructiveCount: number;
    deceptiveCount: number;
    positiveExpectancySignals: number;
    regimeMessage: string;
  } | null;
  currentSetups: AnalyticsDailySetupRow[];
  bestCurrentSetups: AnalyticsDailySetupRow[];
  deceptiveSetups: AnalyticsDailySetupRow[];
  breakoutBreakdownHistory: Array<{
    tradeDate: string | null;
    marketRegime: string;
    breakoutCount: number;
    breakdownCount: number;
  }>;
  volumeBuckets: AnalyticsDailyBucket[];
  deliveryBuckets: AnalyticsDailyBucket[];
  distanceBuckets: AnalyticsDailyBucket[];
  signalHitRates: AnalyticsDailySignalHitRate[];
  regimePerformance: AnalyticsDailyRegimePerformance[];
};

export type FiiRunKind = "daily" | "backfill";

export type FiiRunSummary = {
  kind: FiiRunKind;
  run_id: string;
  output_dir: string;
  manifest_path: string;
  generated_at?: string | null;
  trade_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  report_count?: number | null;
  report_names?: string[] | null;
  dates_touched?: number | null;
  reports_downloaded?: number | null;
  reports_missing?: number | null;
  summary_path?: string | null;
  missing_path?: string | null;
};

export type FiiDailyReportRow = {
  report_key: string;
  source_url?: string | null;
  raw_path?: string | null;
  parsed_path?: string | null;
  bytes?: number | null;
  parsed?: boolean | null;
  row_count?: number | null;
};

export type AnalyticsFiiFlowBackdrop = "supportive" | "contrarian" | "stretched" | "neutral";

export type AnalyticsFiiFlowParticipant = {
  clientType: string;
  oiLongContracts: number;
  oiShortContracts: number;
  oiNetContracts: number;
  oiNetPct: number | null;
  oiPercentile: number | null;
  dayOverDayOiChangeContracts: number | null;
  dayOverDayOiChangePctPoints: number | null;
  volumeBuyContracts: number;
  volumeSellContracts: number;
  volumeNetContracts: number;
  volumeNetPct: number | null;
};

export type AnalyticsFiiFlowDivergence = {
  title: string;
  spreadPctPoints: number;
  detail: string;
};

export type AnalyticsFiiFlowPercentileBucket = {
  label: string;
  sampleSize: number;
  avgNextSessionReturnPct: number | null;
  hitRatePositivePct: number | null;
};

export type AnalyticsFiiFlowMatrixRow = {
  clientType: string;
  longSharePct: number | null;
  shortSharePct: number | null;
  netPct: number | null;
};

export type AnalyticsFiiFlowSpreadPoint = {
  tradeDate: string;
  fiiNetPct: number | null;
  clientNetPct: number | null;
  spreadPct: number | null;
  nextSessionReturnPct: number | null;
};

export type AnalyticsFiiFlowProductPoint = {
  product: string;
  buyValueCr: number | null;
  sellValueCr: number | null;
  openInterestValueCr: number | null;
  netValueCr: number | null;
};

export type AnalyticsFiiFlowPercentilePoint = {
  tradeDate: string;
  fiiNetPct: number | null;
  percentile: number | null;
  nextSessionReturnPct: number | null;
};

export type AnalyticsFiiFlowRegimePoint = {
  tradeDate: string;
  fiiNetPct: number | null;
  percentile: number | null;
  regimeBucket: string;
  niftyReturnPct: number | null;
  nextSessionReturnPct: number | null;
};

export type AnalyticsFiiFlowChangePoint = {
  tradeDate: string;
  clientType: string;
  oiNetPct: number | null;
  dayChangePctPoints: number | null;
};

export type AnalyticsFiiFlowResponse = {
  asOf: string;
  latestTradeDate: string | null;
  reportLagDays: number | null;
  contextLayer: string;
  backdrop: AnalyticsFiiFlowBackdrop;
  marketContext: {
    tradeDate: string | null;
    niftyClose: number | null;
    niftyReturnPct: number | null;
    nextSessionReturnPct: number | null;
  } | null;
  summary: {
    regimeLabel: string;
    backdrop: AnalyticsFiiFlowBackdrop;
    text: string;
    nextSessionBias: string;
    sizingNote: string;
    reportLagNote: string;
  } | null;
  participants: AnalyticsFiiFlowParticipant[];
  divergences: AnalyticsFiiFlowDivergence[];
  percentileBuckets: AnalyticsFiiFlowPercentileBucket[];
  diagnostics: {
    sampleSize: number;
    averageFiiNetPct: number | null;
    sameDirectionPct: number | null;
    nextSessionStdDev: number | null;
  };
  charts: {
    clientLongShortMatrix: AnalyticsFiiFlowMatrixRow[];
    fiiVsClientSpread: AnalyticsFiiFlowSpreadPoint[];
    productValueByProduct: AnalyticsFiiFlowProductPoint[];
    positioningPercentile: AnalyticsFiiFlowPercentilePoint[];
    regimeOverlay: AnalyticsFiiFlowRegimePoint[];
    dayOverDayPositioningChange: AnalyticsFiiFlowChangePoint[];
  };
};

export type AnalyticsStrategyEvaluationSetup = {
  symbol: string;
  sectorName: string;
  action: string;
  direction: string;
  signalFamily: string;
  finalScore: number | null;
  confidenceScore: number | null;
  confidenceLabel: string;
  signalQuality: number | null;
  regimeFit: number | null;
  historicalEdge: number | null;
  riskPenalty: number | null;
  anomalyPenalty: number | null;
  expectancy: {
    sampleCount: number;
    winRatePct: number | null;
    avgReturnPct: number | null;
    medianReturnPct: number | null;
  };
  reason: string;
};

export type AnalyticsStrategyEvaluationScorePoint = {
  symbol: string;
  action: string;
  direction: string;
  finalScore: number | null;
  signalQuality: number | null;
  regimeFit: number | null;
  historicalEdge: number | null;
  riskPenalty: number | null;
  anomalyPenalty: number | null;
};

export type AnalyticsStrategyEvaluationForwardPoint = {
  label: string;
  action: string;
  direction: string;
  sampleCount: number;
  avgRet15mPct: number | null;
  avgRet30mPct: number | null;
  avgRet60mPct: number | null;
  avgRetClosePct: number | null;
  winRate30mPct: number | null;
};

export type AnalyticsStrategyEvaluationFamilyPoint = {
  signalFamily: string;
  sampleCount: number;
  hitRatePct: number | null;
  avgRet15mPct: number | null;
  avgRet30mPct: number | null;
  avgRet60mPct: number | null;
  avgRetClosePct: number | null;
  regimeAvgReturnPct: number | null;
  regimeWinRatePct: number | null;
  regimeSampleCount: number;
};

export type AnalyticsStrategyEvaluationDrawdownPoint = {
  date: string;
  drawdownPct: number | null;
};

export type AnalyticsStrategyEvaluationRegimePoint = {
  regime: string;
  tradeCount: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  maxDrawdownContributionPct: number | null;
  avgHoldDays: number | null;
  totalCharges: number | null;
};

export type AnalyticsStrategyEvaluationSectorPoint = {
  sectorName: string;
  stockCount: number;
  totalNetPnl: number | null;
  avgReturnPct: number | null;
  signalCount: number;
};

export type AnalyticsStrategyEvaluationResponse = {
  generatedAt: string;
  asOfDate: string | null;
  latestAsofTs: string | null;
  indexCode: string;
  horizon: string;
  summary: {
    currentRegime: string;
    currentDirection: string;
    regimeScore: number | null;
    signalCount: number;
    avgFinalScore: number | null;
    avgHistoricalEdge: number | null;
    avgRegimeFit: number | null;
    avgRiskPenalty: number | null;
    avgAnomalyPenalty: number | null;
    modelBias: string;
    confidenceLabel: string;
    concentrationRisk: string;
    topSector: string;
    topSignalFamily: string;
    actionCounts: {
      buyNow: number;
      pullback: number;
      watchOnly: number;
      avoid: number;
      anomalyReview: number;
    };
    regimeDependence: string;
    costNote: string;
    takeaway: string;
  } | null;
  currentSetups: AnalyticsStrategyEvaluationSetup[];
  cautionSetups: Array<{
    symbol: string;
    sectorName: string;
    action: string;
    direction: string;
    signalFamily: string;
    finalScore: number | null;
    riskPenalty: number | null;
    anomalyPenalty: number | null;
    reason: string;
  }>;
  referenceStrategy: {
    strategyId: string;
    displayName: string;
    archetype: string;
    capitalMode: string;
    totalReturnPct: number | null;
    excessOverFd: number | null;
    maxDrawdownPct: number | null;
    winRatePct: number | null;
    totalCharges: number | null;
  } | null;
  diagnostics: {
    currentSampleSize: number;
    historicalActionSamples: number;
    historicalFamilySamples: number;
    regimeScorecardCount: number;
  };
  charts: {
    scoreDecomposition: AnalyticsStrategyEvaluationScorePoint[];
    forwardReturnByActionDirection: AnalyticsStrategyEvaluationForwardPoint[];
    hitRateBySignalFamily: AnalyticsStrategyEvaluationFamilyPoint[];
    equityCurveVsBenchmark: BacktestingLinePoint[];
    drawdownCurve: AnalyticsStrategyEvaluationDrawdownPoint[];
    performanceByRegime: AnalyticsStrategyEvaluationRegimePoint[];
    sectorContribution: AnalyticsStrategyEvaluationSectorPoint[];
  };
};

export type FiiReportsRunsResponse = {
  output_dir: string;
  daily_runs: FiiRunSummary[];
  backfill_runs: FiiRunSummary[];
};

export type FiiReportsRunDetailResponse = {
  kind: FiiRunKind;
  run: FiiRunSummary;
  manifest?: Record<string, unknown> | null;
  report_rows?: FiiDailyReportRow[];
  summary?: Record<string, unknown> | null;
  manifest_rows?: Array<Record<string, string>>;
  missing_rows?: Array<Record<string, string>>;
};

export type AnalyticsQualityResponse = {
  asOf: string;
  expectedTradeDate: string | null;
  summary: {
    trustScore: number;
    verdict: "healthy" | "mixed" | "fragile";
    safeModuleCount: number;
    downgradedModuleCount: number;
    hiddenModuleCount: number;
    synopsis: string;
    schemaBoundaryRisk: string;
  };
  freshnessBySource: Array<{
    sourceKey: string;
    label: string;
    lastSeenDate: string | null;
    lastLoadedAt: string | null;
    lagSessions: number | null;
    recentRows: number | null;
    status: "fresh" | "delayed" | "stale";
    note: string;
  }>;
  moduleStatus: Array<{
    moduleKey: string;
    label: string;
    route: string;
    status: "safe" | "downgraded" | "hidden";
    trustScore: number;
    lastSeenDate: string | null;
    expectedTradeDate: string | null;
    expectedCount: number | null;
    actualCount: number | null;
    coverageRatio: number | null;
    reason: string;
    staleNote: string;
    safeToTrust: boolean;
    visible: boolean;
    dependencies: string[];
  }>;
  safeModules: string[];
  downgradedModules: string[];
  hiddenModules: string[];
  schemaBoundary: {
    cutoverDate: string;
    latestPreDate: string | null;
    earliestPostDate: string | null;
    latestPostDate: string | null;
    overlapDates: string[];
    riskLabel: "low" | "medium" | "high";
    message: string;
  };
  routeDependencies: Array<{
    moduleKey: string;
    label: string;
    route: string;
    dependencies: string[];
  }>;
  charts: {
    freshnessBySource: Array<{
      sourceKey: string;
      label: string;
      lagSessions: number | null;
      recentRows: number | null;
      status: "fresh" | "delayed" | "stale";
    }>;
    coverageByModule: Array<{
      moduleKey: string;
      label: string;
      coverageRatio: number | null;
      expectedCount: number | null;
      actualCount: number | null;
      status: "safe" | "downgraded" | "hidden";
    }>;
    missingBarHeatmap: Array<{
      tradeDate: string | null;
      symbol: string;
      barsSeen: number | null;
      barsExpected: number | null;
      missingBars: number | null;
    }>;
    failedJobsTimeline: Array<{
      jobDate: string | null;
      jobName: string;
      status: string;
      count: number;
    }>;
    expectedVsSeenInstruments: Array<{
      moduleKey: string;
      label: string;
      expectedCount: number | null;
      actualCount: number | null;
    }>;
    missingDateLedger: Array<{
      tradeDate: string;
      moduleKey: string;
      label: string;
      present: boolean;
      reason: string;
    }>;
  };
  diagnostics: {
    latestJobRuns: Array<{
      jobName: string;
      startedAt: string | null;
      finishedAt: string | null;
      status: string;
      notes: string | null;
    }>;
    latestQualityChecks: Array<{
      checkName: string;
      severity: string;
      status: string;
      observedValue: number | null;
      threshold: number | null;
      checkedAt: string | null;
    }>;
    pipelineAudit: Array<{
      reportName: string;
      latestSourceDate: string | null;
      latestLoadedAt: string | null;
      loadedFiles15d: number;
      failedFiles15d: number;
      rowsLoaded15d: number;
    }>;
  };
};

export type AnalyticsBoardBriefResponse = {
  asOf: string;
  sessionReference: {
    label: string;
    tradeDate: string | null;
    timestamp: string;
    expectedTradeDate: string | null;
    freshness: string;
    mode: string;
    marketStatus: string;
    confidenceScore: number;
    overallBias: string;
  };
  decoratedHeader: string[];
  marketHeadline: string;
  headline: string;
  marketBias: string;
  keyConclusions: string[];
  indexSnapshot: string[];
  optionsSnapshot: string[];
  fiiSnapshot: string[];
  sectorSnapshot: string[];
  fullStockSnapshot: {
    columns: string[];
    rows: Array<{
      symbol: string;
      sector: string;
      last: string;
      chg_pct: string;
      weight_pct: string;
      contrib_pct: string;
      daily_rsi14: string;
      intraday_rsi14: string;
      vwap_dev_pct: string;
      volume_ratio: string;
      signal_state: string;
      entry_style: string;
      risk_flag: string;
    }>;
    topLeaders: string[];
    topWeakest: string[];
    continuationCandidates: string[];
    reversalCandidates: string[];
  };
  bestEntries: {
    continuation: string[];
    pullback: string[];
    reversal: string[];
    avoid: string[];
  };
  riskFlags: string[];
  nextAlerts: string[];
  watchNext: string[];
  changedVsPriorSession: string;
  moduleAlignment: {
    confirming: string[];
    contradicting: string[];
    qualityFlags: string[];
  };
  moduleStatus: Array<{
    moduleKey: string;
    label: string;
    status: "safe" | "downgraded" | "hidden";
    note: string;
    route: string;
  }>;
  howToReadToday: string[];
  dataQuality: string[];
  llm_brief: string;
  machineFacts: string[];
  rootRouteTakeaway: string;
};

export type SupportingMetricQuote = {
  code: string;
  label: string;
  value: number | null;
  changeValue: number | null;
  changePct: number | null;
  currency: string;
  unit: string;
  asOf: string | null;
  source: string;
  delayed: boolean;
  providerSymbol: string | null;
  quality: string;
  notes: string[];
  meta: Record<string, unknown>;
  description: string | null;
};

export type SupportingMetricsResponse = {
  asOf: string;
  gateway: {
    ok: boolean;
    generatedAt: string;
    service: string;
    version: string;
    fredKeyConfigured: boolean;
    cacheEntries: number;
  };
  summary: {
    primaryCount: number;
    globalIndexCount: number;
    delayedCount: number;
    officialCount: number;
    approximateCount: number;
    errorCount: number;
  };
  defaultCodes: string[];
  supportedDescriptions: Record<string, string>;
  primaryMetrics: SupportingMetricQuote[];
  globalIndices: SupportingMetricQuote[];
  errors: Array<{
    scope: string;
    message: string;
  }>;
};

export type SemanticDirection = "up" | "down" | "neutral";
export type AccentToken = "green" | "red" | "white";

export type DashboardSummaryPayload = {
  trade_date: string;
  generated_at: string;
  is_stale: boolean;
  accent_token: AccentToken;
  hero: {
    index_name: string;
    last_value: number | null;
    delta_value: number | null;
    change_pct: number | null;
    as_of: string | null;
    direction: SemanticDirection;
    accent_token: AccentToken;
    arrow: "▲" | "▼" | "•";
  };
  top_gainers: Array<Record<string, unknown>>;
  top_losers: Array<Record<string, unknown>>;
  sector_groups: Array<Record<string, unknown>>;
  ticker_tape: Array<Record<string, unknown>>;
  summary_cards: Array<Record<string, unknown>>;
  footer_disclaimer: string;
  educational_purpose_only: true;
};

export type DashboardSectionPayload = {
  trade_date: string;
  section_slug: string;
  title: string;
  direction: SemanticDirection;
  accent_token: AccentToken;
  generated_at: string | null;
  summary_metrics: Record<string, unknown>;
  highlights: string[];
  narrative: string | null;
  rows: Array<Record<string, unknown>>;
  historical_context: Record<string, unknown> | null;
};

export type WatchlistsPayload = {
  items: Array<Record<string, unknown>>;
};

export type WatchlistPayload = {
  trade_date?: string;
  generated_at?: string | null;
  watchlist: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
};

export type WatchlistHistoryPayload = {
  watchlist: Record<string, unknown>;
  days: number;
  rows: Array<Record<string, unknown>>;
};

export type OpsRunsPayload = {
  items: Array<Record<string, unknown>>;
};

export type OpsQualityPayload = {
  items: Array<Record<string, unknown>>;
};

export type ExportManifestPayload = {
  items: Array<Record<string, unknown>>;
};

export type IntradayAnalyticsSummaryPayload = {
  trade_date: string;
  index_code: string;
  as_of: string;
  state: Record<string, unknown>;
  breadth: Record<string, unknown>;
  summary_table: Array<Record<string, unknown>>;
  footer_disclaimer: string;
};

export type IntradayAnalyticsStockPayload = {
  trade_date: string;
  as_of: string;
  symbol: string;
  sector_name: string | null;
  last_price: string | number | null;
  change_pct_from_prev_close: string | number | null;
  dominant_signal: string | null;
  direction: SemanticDirection;
  accent_token: AccentToken;
  conclusion: string | null;
  history_context: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  explanation: {
    scores?: Record<string, number>;
    quality?: Record<string, number>;
    raw_vs_residual?: Record<string, number>;
  } | null;
  series?: Array<Record<string, unknown>>;
};

export type RsiSurfaceDrop = {
  symbol: string;
  latestRsi: number;
  prevRsi: number;
  drop: number;
  severity: "high" | "medium";
  timestamp: string;
};

export type RsiSurfaceRow = {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  latestRsi: number;
};

export type RsiSurfaceSector = {
  sector: string;
  startIndex: number;
  count: number;
  avgRsi: number;
  rows: RsiSurfaceRow[];
};

export type RsiSurfaceResponse = {
  asOf: string;
  refreshSeconds: number;
  tradeDate: string;
  session: {
    start: string;
    end: string;
  };
  timestamps: string[];
  rows: RsiSurfaceRow[];
  sectors: RsiSurfaceSector[];
  values: number[][];
  planes: {
    oversold: number;
    overbought: number;
  };
  colorScale: {
    min: number;
    max: number;
    neutralPivot: number;
    greenPivot: number;
  };
  stats: {
    min: number;
    max: number;
    avg: number;
    niftyRsi: number | null;
    universeAvgRsi: number;
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
};

export type AnalyticsSimulatorUniverseItem = {
  symbol: string;
  display_name: string;
  instrument_type: "equity" | "index";
};

export type AnalyticsSimulatorUniverseResponse = {
  items: AnalyticsSimulatorUniverseItem[];
};

export type AnalyticsSimulatorChargeBreakdown = {
  brokerage: number;
  stt: number;
  transaction_charges: number;
  sebi_charges: number;
  gst: number;
  stamp_duty: number;
  dp_charges: number;
  total: number;
};

export type AnalyticsSimulatorTimelinePoint = {
  date: string;
  close: number;
  invested_principal: number;
  cash_outflow: number;
  strategy_value: number;
  strategy_profit: number;
  fd_value: number;
  fd_profit: number;
  open_lots: number;
  cash_remaining: number | null;
  executed_buys: number;
  skipped_triggers: number;
};

export type AnalyticsSimulatorTrade = {
  lot_id: number;
  buy_date: string;
  entry_price: number;
  quantity: number;
  principal: number;
  buy_charges: number;
  buy_outflow: number;
  target_price: number;
  sell_date: string | null;
  sell_price: number | null;
  sell_turnover: number | null;
  sell_charges: number | null;
  net_proceeds: number | null;
  net_pnl: number | null;
  holding_days: number | null;
  status: "open" | "closed";
};

export type AnalyticsSimulatorScenarioResult = {
  invested_principal: number;
  cash_outflow: number;
  net_strategy_value: number;
  net_profit: number;
  net_return_pct: number;
  fd_value: number;
  fd_profit: number;
  fd_return_pct: number;
  fd_delta_vs_strategy: number;
  charges_paid: AnalyticsSimulatorChargeBreakdown;
  estimated_exit_charges_today: AnalyticsSimulatorChargeBreakdown;
  open_lots: number;
  closed_lots: number;
  trigger_count: number;
  executed_buys: number;
  skipped_triggers: number;
  cash_remaining: number | null;
  timeline: AnalyticsSimulatorTimelinePoint[];
  trades: AnalyticsSimulatorTrade[];
};

export type AnalyticsSimulatorCapitalScenario = {
  capital_label: string;
  capital_amount: number | null;
  buy_and_hold: AnalyticsSimulatorScenarioResult;
  buy_on_dip_sell_on_target: AnalyticsSimulatorScenarioResult;
};

export type AnalyticsSimulatorResponse = {
  as_of: string;
  symbol: string;
  display_name: string;
  instrument_type: "equity" | "index";
  series: string | null;
  window: {
    start_date: string;
    end_date: string;
    trading_days: number;
  };
  latest_close: number;
  assumptions: {
    dip_pct: number;
    target_pct: number;
    fd_rate_pct: number;
    lot_amount: number;
    lookback_days: number;
    capital_caps: number[];
    include_infinite: boolean;
    trigger_logic: string;
    exit_logic: string;
    index_note: string;
  };
  charges_model: {
    brokerage_delivery_equity: number;
    stt_delivery_rate: number;
    transaction_charge_rate_nse_equity_cash: number;
    sebi_charge_per_crore: number;
    gst_rate: number;
    stamp_duty_buy_rate_delivery: number;
    dp_charge_sell_order_total: number;
  };
  trigger_dates: string[];
  capital_scenarios: AnalyticsSimulatorCapitalScenario[];
};

export type BacktestingOption = {
  value: string;
  label: string;
};

export type BacktestingFilterModel = {
  strategies: BacktestingOption[];
  versions: BacktestingOption[];
  universeModes: BacktestingOption[];
  capitalModes: BacktestingOption[];
  dateRanges: BacktestingOption[];
  stocks: BacktestingOption[];
};

export type BacktestingStrategyRegistryItem = {
  strategyId: string;
  strategySlug: string;
  displayName: string;
  description: string;
  archetype?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type BacktestingStrategyVersion = {
  strategyVersionId: string;
  strategyId: string;
  versionNumber: number;
  config: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  feeProfileId: string | null;
  createdAt: string;
  createdBy: string | null;
  isActiveVersion: boolean;
};

export type BacktestingRunRow = {
  runId: string;
  strategyVersionId: string;
  asOfDate: string;
  generatedAt: string;
  status: string;
  universeMode: string;
  capitalMode: string;
  snapshotKey: string | null;
  rowsProcessed: number;
  warningsCount: number;
  errorsCount: number;
  symbolsCovered?: number;
  tradeCount?: number;
  netPnl?: number;
  taxDeducted?: number;
  afterTaxNetPnl?: number;
  benchmarkLabel?: string;
};

export type BacktestingValidationRow = {
  runId: string;
  validationName: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type BacktestingScenarioSummary = {
  investedAmount: number;
  currentValue: number;
  realizedPnl: number;
  preTaxRealizedPnl?: number;
  profitTaxRate?: number;
  taxDeducted?: number;
  afterTaxRealizedPnl?: number;
  unrealizedPnl: number;
  totalReturnPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  totalCharges: number;
  openPositions: number;
  maxOpenPositionsReached: number;
  avgHoldDays: number;
  maxHoldDays: number;
  cashBalance: number | null;
  exposurePct: number;
  fdFinalValue: number | null;
  excessOverFd: number | null;
  benchmarkFinalValue?: number | null;
  excessOverBenchmark?: number | null;
  benchmarkLabel?: string;
};

export type BacktestingLinePoint = {
  date: string;
  strategyValue: number;
  benchmarkValue: number | null;
};

export type BacktestingDrawdownPoint = {
  date: string;
  drawdownPct: number;
};

export type BacktestingDeploymentPoint = {
  date: string;
  deployedCapital: number;
  openPositions: number;
};

export type BacktestingRollingWinRatePoint = {
  date: string;
  winRate3m: number;
  winRate6m: number;
};

export type BacktestingHistogramBucket = {
  bucketLabel: string;
  count: number;
};

export type BacktestingMonthlyReturn = {
  month: string;
  pnl: number;
  returnPct: number;
};

export type BacktestingOpenPosition = {
  symbol: string;
  entryDate: string;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPct: number;
  unrealizedPnl: number;
  regimeOnEntry: string;
  stopStatus: string;
};

export type BacktestingTrade = {
  symbol: string;
  signalDate: string;
  entryDate: string;
  exitDate: string | null;
  exitReason: string;
  returnPct: number;
  charges: number;
  holdingDays: number;
  regimeOnEntry: string;
  status: string;
};

export type BacktestingSkippedSignal = {
  date: string;
  symbol: string;
  reason: string;
  detail: string;
};

export type BacktestingRegimeRow = {
  regime: string;
  tradeCount: number;
  winRatePct: number;
  avgReturnPct: number;
  medianReturnPct: number;
  maxDrawdownContributionPct: number;
  avgHoldDays: number;
  totalCharges: number;
};

export type BacktestingStockRow = {
  symbol: string;
  signalCount: number;
  acceptedTrades: number;
  skippedTrades: number;
  winRatePct: number;
  avgReturnPct: number;
  medianReturnPct: number;
  maxGainPct: number;
  maxLossPct: number;
  avgHoldDays: number;
  maxHoldDays: number;
  totalInvested: number;
  currentValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  charges: number;
  lastSignalDate: string;
  openPosition: boolean;
  totalNetPnl?: number;
  bestRegime?: string;
  worstRegime?: string;
};

export type BacktestingPriceIndicatorPoint = {
  date: string;
  price: number;
  rsi: number;
  willr: number;
  buyMarker: boolean;
  sellMarker: boolean;
};

export type BacktestingPriceIndicatorChart = {
  symbol: string;
  priceAxis: string;
  indicatorAxis: string;
  points: BacktestingPriceIndicatorPoint[];
} | null;

export type BacktestingChargesRow = {
  label: string;
  value: number;
  display: string;
};

export type BacktestingScenario = {
  scenarioKey: string;
  universeMode: string;
  capitalMode: string;
  stock: string | null;
  label: string;
  benchmarkMode: "finite_fd" | "normalized_fd" | "nifty50_price";
  summary: BacktestingScenarioSummary;
  equityCurve: BacktestingLinePoint[];
  drawdownCurve: BacktestingDrawdownPoint[];
  capitalDeploymentCurve: BacktestingDeploymentPoint[];
  rollingWinRate: BacktestingRollingWinRatePoint[];
  tradeReturnHistogram: BacktestingHistogramBucket[];
  holdingDurationHistogram: BacktestingHistogramBucket[];
  monthlyReturns: BacktestingMonthlyReturn[];
  priceIndicatorChart: BacktestingPriceIndicatorChart;
  openPositions: BacktestingOpenPosition[];
  trades: BacktestingTrade[];
  skippedSignals: BacktestingSkippedSignal[];
  regimeBreakdown: BacktestingRegimeRow[];
  stockBreakdown: BacktestingStockRow[];
  chargesSummary: BacktestingChargesRow[];
};

export type BacktestingScenarioOption = {
  key: string;
  label: string;
  universeMode: string;
  capitalMode: string;
  stock: string | null;
};

export type BacktestingOverviewResponse = {
  generatedAt: string;
  asOfDate: string;
  marketDate: string;
  snapshotAgeLabel: string;
  activeStrategies: number;
  symbolsCovered: number;
  latestSnapshot: {
    generatedAt: string;
    marketDate: string;
    openPositionsToday: number;
  };
  selectedScenarioKey: string;
  quickStats: BacktestingScenarioSummary;
  miniEquityCurve: BacktestingLinePoint[];
  miniDrawdownCurve: BacktestingDrawdownPoint[];
  shortcuts: Array<{ label: string; to: string }>;
};

export type BacktestingStrategiesResponse = {
  generatedAt: string;
  asOfDate: string;
  items: Array<{
    strategyId: string;
    strategySlug: string;
    displayName: string;
    description: string;
    archetype: string;
    status: string;
    scope: string;
    supportedCapitalModes: string[];
    activeVersionNumber: number;
    activeVersionId: string | null;
    latestRunStatus: string;
    latestAsOfDate: string;
  }>;
};

export type BacktestingStrategyDetailResponse = {
  generatedAt: string;
  asOfDate: string;
  strategy: BacktestingStrategyRegistryItem;
  version: BacktestingStrategyVersion;
  latestRuns: BacktestingRunRow[];
  chargesModel: Record<string, number>;
  evaluation: {
    policyVersion: string;
    resultType: "OPPORTUNITY_SCAN" | "SIGNAL_STUDY" | "TRUE_BACKTEST_ISOLATED" | "TRUE_BACKTEST_PORTFOLIO" | "WALK_FORWARD_VALIDATION" | "PAPER_SHADOW_FORWARD";
    rankabilityStatus: "RANKABLE" | "NOT_RANKABLE";
    rating: "A" | "B" | "C" | "D" | "E" | "NR";
    qualityScore: number | null;
    revenueCapacityScore: number | null;
    validationStatus: "PASS" | "WARN" | "FAIL" | "NOT_ASSESSED";
    validations: Record<string, { status: "PASS" | "WARN" | "FAIL" | "NOT_ASSESSED"; reason: string }>;
    goodWhen: Array<{ context: string; value: string; sample_size: number; metrics: Record<string, number | null> }>;
    avoidWhen: Array<{ context: string; value: string; sample_size: number; metrics: Record<string, number | null> }>;
    watch: Array<{ context: string; value: string; sample_size: number; metrics: Record<string, number | null> }>;
    limitations: string[];
    evaluatedAt: string;
  } | null;
  filters: BacktestingFilterModel;
  defaultScenarioKey: string;
  scenarioOptions: BacktestingScenarioOption[];
  scenarios: Record<string, BacktestingScenario>;
};

export type BacktestingDailySummaryResponse = {
  generatedAt: string;
  asOfDate: string;
  latestEntries: Array<{ symbol: string; entryDate: string; returnPct: number }>;
  latestExits: Array<{ symbol: string; exitDate: string | null; exitReason: string; returnPct: number }>;
  currentOpenPositions: BacktestingOpenPosition[];
  skippedSignals: BacktestingSkippedSignal[];
  deployment: {
    openPositions: number;
    exposurePct: number;
    dailyPortfolioDelta: number;
    dailyBenchmarkDelta: number;
  };
};

export type BacktestingCompareResponse = {
  generatedAt: string;
  asOfDate: string;
  rows: Array<{
    strategyId: string;
    strategySlug: string;
    displayName: string;
    archetype: string;
    versionNumber: number;
    universeMode: string;
    capitalMode: string;
    stock: string | null;
    currentValue: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalReturnPct: number;
    excessOverFd: number | null;
    winRatePct: number;
    totalClosedTrades: number;
    openPositions: number;
    maxDrawdownPct: number;
    avgHoldDays: number;
    minHoldDays: number;
    maxHoldDays: number;
    totalCharges: number;
    exposurePct: number;
    avgExposurePct: number;
    latestSnapshotAge: string;
    regimeStrengthSummary: {
      bestRegime: string | null;
      worstRegime: string | null;
    };
    topPerformingStock: string | null;
    worstPerformingStock: string | null;
  }>;
  equityCurves: Array<{
    strategyId: string;
    displayName: string;
    archetype: string;
    universeMode: string;
    capitalMode: string;
    points: BacktestingLinePoint[];
  }>;
  regimeCompare: Array<{
    strategyId: string;
    displayName: string;
    archetype: string;
    universeMode: string;
    capitalMode: string;
    regimes: BacktestingRegimeRow[];
  }>;
  stockSuitability: Array<{
    strategyId: string;
    displayName: string;
    archetype: string;
    universeMode: string;
    capitalMode: string;
    symbol: string;
    signalCount: number;
    acceptedTrades: number;
    skippedTrades: number;
    winRatePct: number;
    avgReturnPct: number;
    medianReturnPct: number;
    totalNetPnl: number;
    bestRegime: string;
    worstRegime: string;
    lastSignalDate: string;
    openPosition: boolean;
  }>;
  capitalSensitivity: Array<{
    strategyId: string;
    displayName: string;
    archetype: string;
    capitalMode: string;
    totalReturnPct: number;
    excessOverFd: number | null;
    maxDrawdownPct: number;
    winRatePct: number;
    currentValue: number;
  }>;
};

export type BacktestingRunsResponse = {
  generatedAt: string;
  asOfDate: string;
  runs: BacktestingRunRow[];
  validations: BacktestingValidationRow[];
  lastKnownGoodSnapshot: {
    key: string;
    generatedAt: string;
    asOfDate: string;
  };
};

export type IndicatorThresholdBand = {
  key: string;
  label: string;
  rangeLabel: string;
  interpretation: string;
  lowerBound: number | null;
  upperBound: number | null;
  tone: AccentToken;
};

export type IndicatorChartLabels = {
  priceAxis: string;
  indicatorAxis: string;
  heatmapLegend: string;
  equityAxis: string;
  drawdownAxis: string;
  capitalAxis: string;
  returnAxis: string;
  holdingAxis: string;
};

export type IndicatorChartHelpText = {
  priceIndicatorSignalChart: string;
  forwardReturnHeatmap: string;
  equityCurveChart: string;
  drawdownChart: string;
  tradeReturnDistribution: string;
  holdingDurationChart: string;
  capitalDeploymentChart: string;
};

export type IndicatorGlossaryTerm = {
  term: string;
  definition: string;
};

export type IndicatorDescriptor = {
  slug: string;
  displayName: string;
  shortDescription: string;
};

export type IndicatorStatusMetric = {
  label: string;
  value: string;
  helper: string;
  tone: AccentToken;
};

export type IndicatorBandCount = {
  key: string;
  label: string;
  tone: AccentToken;
  count: number;
  sharePct: number;
};

export type IndicatorCurrentLeader = {
  symbol: string;
  name: string;
  sector: string;
  currentValue: number;
  changePct: number;
  tone: AccentToken;
  delta?: number | null;
};

export type IndicatorSectorSnapshot = {
  sector: string;
  avgValue: number;
  count: number;
  tone: AccentToken;
};

export type IndicatorCurrentStatusSummary = {
  asOf: string;
  tradeDate: string;
  isStale: boolean;
  lastUpdatedDate?: string;
  narrative: string;
  metrics: IndicatorStatusMetric[];
  bandCounts: IndicatorBandCount[];
  strongestReadings: IndicatorCurrentLeader[];
  weakestReadings: IndicatorCurrentLeader[];
  oversoldNames: IndicatorCurrentLeader[];
  overboughtNames: IndicatorCurrentLeader[];
  strongestReversals: IndicatorCurrentLeader[];
  sectorLeaders: IndicatorSectorSnapshot[];
  sectorLaggards: IndicatorSectorSnapshot[];
};

export type IndicatorPricePoint = {
  date: string;
  price: number;
  indicatorValue: number | null;
};

export type ForwardReturnHeatmapCell = {
  bandKey: string;
  bandLabel: string;
  horizonDays: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  hitRatePct: number | null;
  sampleSize: number;
};

export type IndicatorEvidenceSection = {
  isStale: boolean;
  sampleSize: number;
  priceSeries: IndicatorPricePoint[];
  heatmapCells: ForwardReturnHeatmapCell[];
};

export type StrategyMetric = {
  label: string;
  value: string;
  helper: string;
  tone: AccentToken;
};

export type EquityCurvePoint = {
  date: string;
  equityIndex: number;
  strategyValue?: number | null;
  benchmarkIndex?: number | null;
};

export type DrawdownPoint = {
  date: string;
  drawdownPct: number;
};

export type DistributionBucket = {
  bucketLabel: string;
  count: number;
};

export type CapitalDeploymentPoint = {
  date: string;
  activePositions: number;
  activePct: number;
  deployedCapital?: number | null;
  totalEquity?: number | null;
};

export type IndicatorStrategyCapitalMode = {
  key: string;
  label: string;
  scenarioId: string;
  capitalModel: string;
  startingCapital: number | null;
  isDefault: boolean;
};

export type IndicatorStrategyFamily = {
  key: string;
  label: string;
  shortDescription: string;
  entryRule: string;
  exitRule: string;
  capitalModes: IndicatorStrategyCapitalMode[];
};

export type IndicatorSignalMarker = {
  date: string;
  price: number | null;
  indicatorValue: number | null;
  label: string;
};

export type IndicatorStrategySignalChart = {
  symbol: string;
  name: string;
  sector: string;
  entryRule: string;
  exitRule: string;
  thresholdLines: {
    entryThreshold: number | null;
    exitThresholdAbove: number | null;
    exitThresholdBelow: number | null;
  };
  points: IndicatorPricePoint[];
  entryMarkers: IndicatorSignalMarker[];
  exitMarkers: IndicatorSignalMarker[];
};

export type IndicatorStrategySummary = {
  totalTrades: number;
  closedTrades: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  totalReturnPct: number | null;
  maxDrawdownPct: number | null;
  avgHoldingDays: number | null;
  maxHoldingDays: number | null;
  currentPortfolioValue: number | null;
  currentInvestedAmount: number | null;
  cashBalance: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  openPositionsCount: number;
  valueMode: "currency" | "index";
};

export type IndicatorStrategyPerStockRow = {
  symbol: string;
  name: string;
  sector: string;
  tradeCount: number;
  closedTradeCount: number;
  openTradeCount: number;
  winRatePct: number | null;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  maxGainPct: number | null;
  maxLossPct: number | null;
  avgHoldingDays: number | null;
  maxHoldingDays: number | null;
  totalInvested: number | null;
  currentValue: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  totalNetPnl: number | null;
  openPositionFlag: boolean;
  lastSignalDate: string | null;
  currentStatus: string;
};

export type IndicatorStrategyOpenPosition = {
  symbol: string;
  name: string;
  sector: string;
  signalTradeDate: string;
  entryDate: string;
  asOfDate: string;
  entryPrice: number | null;
  currentPrice: number | null;
  currentIndicatorValue: number | null;
  targetPrice: number | null;
  daysOpen: number;
  entryShares: number | null;
  allocatedCapital: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedReturnPct: number | null;
};

export type IndicatorStrategyCurrentStatus = {
  asOfDate: string;
  currentPortfolioValue: number | null;
  currentInvestedAmount: number | null;
  cashBalance: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  openPositionsCount: number;
  activeSymbols: string[];
  averageDaysInTrade: number | null;
  maxDaysInTrade: number | null;
};

export type IndicatorStrategyScenario = {
  scenarioId: string;
  key: string;
  label: string;
  generatedAt?: string;
  dataAsOfDate?: string;
  capitalModeKey: string;
  capitalModeLabel: string;
  shortDescription: string;
  entryRule: string;
  exitRule: string;
  maxHoldDays: number;
  capitalModel: string;
  startingCapital: number | null;
  ticketSizeRule: string;
  maxOpenPositions: number | null;
  priorityRule: string;
  priorityRuleNote: string;
  transactionCostBps: number;
  slippageBps: number;
  executionAssumptions: Record<string, unknown>;
  isStale: boolean;
  tradeCount: number;
  summary: IndicatorStrategySummary;
  summaryMetrics: StrategyMetric[];
  equityCurve: EquityCurvePoint[];
  drawdownSeries: DrawdownPoint[];
  tradeReturnDistribution: DistributionBucket[];
  holdingDurationDistribution: DistributionBucket[];
  capitalDeployment: CapitalDeploymentPoint[];
  currentStatus: IndicatorStrategyCurrentStatus;
  perStockSummary: IndicatorStrategyPerStockRow[];
  currentOpenPositions: IndicatorStrategyOpenPosition[];
  tradeLog: Array<Record<string, unknown>>;
  signalChart: IndicatorStrategySignalChart | null;
};

export type IndicatorStockResultRow = {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  currentValue: number;
  bandLabel: string;
  percentile3y: number | null;
  sampleSize3y: number;
  avgForwardReturn20dSameBand: number | null;
  hitRate20dSameBand: number | null;
};

export type IndicatorEducationResponse = {
  slug: string;
  displayName: string;
  shortDescription: string;
  oneLineSummary: string;
  formulaText: string;
  whatItIs: string[];
  howToRead: string[];
  thresholdBands: IndicatorThresholdBand[];
  chartLabels: IndicatorChartLabels;
  chartHelpText: IndicatorChartHelpText;
  glossaryTerms: IndicatorGlossaryTerm[];
  availableIndicators: IndicatorDescriptor[];
  freshness: {
    snapshotGeneratedAt: string;
    lastMarketDate: string;
    currentStatusDate: string;
    evidenceStartDate: string;
    evidenceEndDate: string;
    evidenceRangeLabel: string;
  };
  currentStatus: IndicatorCurrentStatusSummary;
  evidence: IndicatorEvidenceSection;
  strategyEvaluator: {
    defaultScenarioKey: string;
    defaultCapitalModeKey: string;
    scenarioFamilies: IndicatorStrategyFamily[];
  };
  assumptions: string[];
  limitations: string[];
  stockResults: IndicatorStockResultRow[];
};

export type WillSurfaceRow = {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  latestWillr: number;
};

export type WillSurfaceSector = {
  sector: string;
  startIndex: number;
  count: number;
  avgWillr: number;
  rows: WillSurfaceRow[];
};

export type WillSurfaceResponse = {
  asOf: string;
  refreshSeconds: number;
  tradeDate: string;
  session: {
    start: string;
    end: string;
  };
  timestamps: string[];
  rows: WillSurfaceRow[];
  sectors: WillSurfaceSector[];
  values: number[][];
  planes: {
    oversold: number;
    overbought: number;
  };
  colorScale: {
    min: number;
    max: number;
    neutralPivot: number;
    greenPivot: number;
  };
  stats: {
    min: number;
    max: number;
    avg: number;
    niftyWillr: number | null;
    universeAvgWillr: number;
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
};

export type ChangeHeatmapRow = {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  latestChangePct: number;
};

export type ChangeHeatmapSector = {
  sector: string;
  startIndex: number;
  count: number;
  avgChangePct: number;
  rows: ChangeHeatmapRow[];
};

export type ChangeHeatmapResponse = {
  asOf: string;
  refreshSeconds: number;
  tradeDate: string;
  session: {
    start: string;
    end: string;
  };
  timestamps: string[];
  rows: ChangeHeatmapRow[];
  sectors: ChangeHeatmapSector[];
  values: number[][];
  planes: {
    lower: number;
    upper: number;
  };
  colorScale: {
    min: number;
    max: number;
    center: number;
  };
  stats: {
    min: number;
    max: number;
    avg: number;
    niftyChangePct: number | null;
    universeAvgChangePct: number;
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
};

export type LiveQuote = {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  timestamp: string;
};

export type OptionChainSnapshot = {
  id: number;
  capturedAt: string;
  symbol: string;
  expiryDate: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  strikesAround: number;
  fetchMs: number | null;
};

export type OptionChainLeg = {
  strike: number;
  optionType: "CE" | "PE";
  lastPrice: number | null;
  change: number | null;
  iv: number | null;
  volume: number | null;
  oi: number | null;
  chgOi: number | null;
  bidQty: number | null;
  bidPrice: number | null;
  askQty: number | null;
  askPrice: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  instrumentIdentifier: string | null;
};

export type OptionChainCompareOk = {
  ok: true;
  requestedMinutes: number;
  windowMinutes: number;
  actualAgoMinutes: number;
  snapshot: OptionChainSnapshot;
  legs: OptionChainLeg[];
};

export type OptionChainCompareError = {
  ok: false;
  requestedMinutes: number;
  windowMinutes: number;
  error: string;
};

export type OptionChainWatcherState = {
  startedAt: string | null;
  lastPollAt: string | null;
  lastPollOkAt: string | null;
  lastError: string | null;
};

export type OptionChainLatestResponse = {
  ok: true;
  snapshot: OptionChainSnapshot;
  legs: OptionChainLeg[];
  compare?: OptionChainCompareOk | OptionChainCompareError;
  watcherState: OptionChainWatcherState;
  capabilities: {
    screenshotEnabled: boolean;
  };
};

export type OptionChainSeriesPoint = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  ceLtp: number | null;
  peLtp: number | null;
  ceIv: number | null;
  peIv: number | null;
  ceDelta: number | null;
  peDelta: number | null;
};

export type OptionChainSeriesResponse = {
  ok: true;
  minutes: number;
  points: OptionChainSeriesPoint[];
};

export type OptionChainAnalyticsStrikeSnapshot = {
  strike: number;
  ceClose: number | null;
  peClose: number | null;
  ceNorm: number | null;
  peNorm: number | null;
};

export type OptionChainAnalyticsEquilibriumPoint = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  ceAggregateNorm: number | null;
  peAggregateNorm: number | null;
  equilibriumSpread: number | null;
  equilibriumFlag: boolean;
  crossoverFlag: boolean;
  ceCount: number;
  peCount: number;
};

export type OptionChainAnalyticsAtmComboPoint = {
  capturedAt: string;
  underlyingValue: number | null;
  atmStrike: number | null;
  ceLtp: number | null;
  peLtp: number | null;
  atmCombo: number | null;
  sessionOpenCombo: number | null;
  comboDelta: number | null;
  comboDeltaPct: number | null;
  comboDirection: "up" | "down" | "flat" | "na";
  atmStrikeChanged: boolean;
};

export type OptionChainAnalyticsPayload = {
  snapshot: OptionChainSnapshot;
  legs: OptionChainLeg[];
  availableExpiries: string[];
  tradeDate: string;
  strikeWindow: {
    baseAtmStrike: number | null;
    strikes: number[];
    strikesAround: number;
    tieBreakRule: "lower_on_tie";
    tieBreakUsed: boolean;
  };
  expiryContext: {
    selectedExpiry: string;
    nextExpiry: string;
    dteDays: number | null;
    dteHours: number | null;
    expiryProgressPct: number | null;
    currentAtmStrike: number | null;
    currentSpot: number | null;
    spotToAtmDistance: number | null;
    currentEquilibriumSpread: number | null;
    currentSideDominance: "CE dominant" | "PE dominant" | "Near equilibrium" | "Unavailable";
    lastCrossoverAt: string | null;
  };
  equilibrium: {
    epsilon: number;
    points: OptionChainAnalyticsEquilibriumPoint[];
    latestStrikes: OptionChainAnalyticsStrikeSnapshot[];
    ceAggregateCurrent: number | null;
    peAggregateCurrent: number | null;
    currentSpread: number | null;
    currentDominance: "CE dominant" | "PE dominant" | "Near equilibrium" | "Unavailable";
    lastCrossoverAt: string | null;
  };
  atmCombo: {
    openCombo: number | null;
    currentCombo: number | null;
    currentDelta: number | null;
    currentDeltaPct: number | null;
    points: OptionChainAnalyticsAtmComboPoint[];
  };
  diagnostics: {
    freshnessMinutes: number | null;
    strikeCount: number;
    strikeWindowSize: number;
    missingCeSeriesCount: number;
    missingPeSeriesCount: number;
    timestampDriftSeconds: number;
    normalizationFallbackCount: number;
    crossoverCount: number;
    cacheMode: "live_db";
    queryMode: "batched_intraday_snapshot";
    latestSnapshotAt: string | null;
    latestPollOkAt: string | null;
  };
};

export type OptionChainAnalyticsResponse = {
  ok: true;
  analytics: OptionChainAnalyticsPayload;
  compare: OptionChainCompareOk | OptionChainCompareError;
  compareSeries?: OptionChainCompareOk[];
  watcherState: OptionChainWatcherState;
  capabilities: {
    screenshotEnabled: boolean;
  };
};

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
};

export type SessionState = {
  authenticated: boolean;
  user: SessionUser | null;
  csrfToken: string | null;
};

export function directionFromChangePct(changePct: number): Direction {
  if (changePct > 0) return "up";
  if (changePct < 0) return "down";
  return "flat";
}
