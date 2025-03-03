/* example of the yield collector config
{
    collectorId: "raydium-58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    id: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    pair: "SOL/USDC",
    collector: "raydium",
    enabled: true,
}
*/
export interface YieldCollectorConfig {
  collectorId: string;
  id: string;
  pair: string;
  collector: string;
  enabled: boolean;
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
  impermanentLossRisk: number;
  rewards: string[];
}
