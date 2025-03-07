export interface BaseYieldCollectorConfig {
  collectorId: string;
  collector: string;
  enabled: boolean;
  // Add other common properties
}

export interface YieldOpportunity {
  id: string;
  protocol: string;
  asset: string;
  poolId: string;
  apy: number;
  feeApy: number;
  rewardApy: number;
  tvl: number;
  riskScore: number;
  impermanentLossRisk?: number;
  rewards: string[];
}
