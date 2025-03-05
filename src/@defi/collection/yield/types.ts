// Base collector config interface
export interface BaseYieldCollectorConfig {
  collectorId: string; // Unique ID for this config entry
  collector: "raydium" | "orca" | "marinade"; // Limit to supported collectors
  pair: string; // Human-readable pair name (e.g., "SOL/USDC")
  enabled: boolean; // Whether this collector is active
}

// Raydium-specific config
export interface RaydiumCollectorConfig extends BaseYieldCollectorConfig {
  collector: "raydium";
  poolId: string; // Raydium pool ID
}

// Orca-specific config
export interface OrcaCollectorConfig extends BaseYieldCollectorConfig {
  collector: "orca";
  mintOne: string; // Token mint address for first token
  mintTwo: string; // Token mint address for second token
  tickSpacing?: number; // Optional tick spacing for concentrated liquidity pools
}

// Marinade-specific config
export interface MarinadeCollectorConfig extends BaseYieldCollectorConfig {
  collector: "marinade";
  // No additional fields needed for Marinade (it's just SOL staking)
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
