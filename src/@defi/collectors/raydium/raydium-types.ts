import { BaseYieldCollectorConfig } from "../../types/yield-types";

// Raydium-specific config
export interface RaydiumCollectorConfig extends BaseYieldCollectorConfig {
  collector: "raydium";
  poolId: string; // Raydium pool ID
}

export interface RaydiumApiResponse {
  success: boolean;
  data: RaydiumPool[];
}

export interface RaydiumPool {
  type: string; // Pool type (e.g., "Standard")
  programId: string; // Program ID associated with the pool
  id: string; // Unique pool identifier
  mintA: TokenMint; // Token A details
  mintB: TokenMint; // Token B details
  price: number; // Current price
  mintAmountA: number; // Amount of token A in the pool
  mintAmountB: number; // Amount of token B in the pool
  feeRate: number; // Fee rate as a decimal (e.g., 0.0025 for 0.25%)
  openTime: string; // Open time (stored as string in response)
  tvl: number; // Total value locked in USD
  day?: PoolPeriodData; // Daily metrics (optional)
  week?: PoolPeriodData; // Weekly metrics (optional)
  month?: PoolPeriodData; // Monthly metrics (optional)
  pooltype: string[]; // Array of pool types (e.g., ["OpenBookMarket"])
  rewardDefaultPoolInfos: string; // e.g., "Ecosystem" (could be refined if structured data)
  rewardDefaultInfos: RewardInfo[]; // Reward token details
  lpMint?: TokenMint; // LP token details (optional)
  // Add other fields as needed (e.g., marketId, farm counts, etc.)
}

// Token mint details (used for mintA, mintB, and lpMint)
export interface TokenMint {
  chainId: number; // Chain identifier (e.g., 101 for Solana)
  address: string; // Token address
  programId: string; // Program ID for the token
  logoURI: string; // URL to token logo
  symbol: string; // Token symbol (e.g., "WSOL", "USDC")
  name: string; // Token name (e.g., "Wrapped SOL")
  decimals: number; // Number of decimal places
  tags: string[]; // Tags (e.g., ["hasFreeze"])
  extensions: Record<string, any>; // Flexible extensions object
}

// Metrics for a specific time period (day, week, month)
export interface PoolPeriodData {
  volume: number; // Trading volume in base token
  volumeQuote: number; // Volume in quote token
  volumeFee: number; // Fee volume
  apr: number; // Annualized percentage rate (total)
  feeApr: number; // Fee component of APR
  priceMin: number; // Minimum price in period
  priceMax: number; // Maximum price in period
  rewardApr: number[]; // Array of reward APRs
}

// Reward token information
export interface RewardInfo {
  mint: TokenMint; // Reward token details
  perSecond: string; // Reward rate per second (stored as string in response)
  startTime: string; // Start time as Unix timestamp string
  endTime: string; // End time as Unix timestamp string
}
