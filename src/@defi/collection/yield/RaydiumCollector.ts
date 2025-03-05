import {
  BaseYieldCollectorConfig,
  RaydiumCollectorConfig,
  YieldOpportunity,
} from "./types";

interface RaydiumApiResponse {
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

export class RaydiumCollector {
  private readonly _config: RaydiumCollectorConfig[];

  constructor(config: BaseYieldCollectorConfig[]) {
    if (!config || config.length === 0) {
      throw new Error("Config array cannot be empty");
    }

    this._config = config.filter(
      (c) => c.collector === "raydium" && c.enabled === true
    ) as RaydiumCollectorConfig[];
  }

  public async collect(): Promise<YieldOpportunity[]> {
    console.log("RaydiumCollector.collect");

    const ids = this._config.map((c) => (c as RaydiumCollectorConfig).poolId);
    if (ids.length === 0) {
      return [];
    }

    try {
      const response = await fetch(
        `https://api-v3.raydium.io/pools/info/ids?ids=${ids}`
      );
      const data: RaydiumApiResponse = await response.json();
      return this.processPoolData(data);
    } catch (error) {
      console.error("Failed to fetch Raydium pool data:", error);
      return [];
    }
  }

  private processPoolData(rawData: RaydiumApiResponse): YieldOpportunity[] {
    if (!rawData?.success || !Array.isArray(rawData.data)) {
      console.error("Invalid Raydium API response format");
      return [];
    }
    return rawData.data
      .map((pool) => this.parsePool(pool))
      .filter((op) => op !== null);
  }

  private parsePool(pool: RaydiumPool): YieldOpportunity | null {
    try {
      if (!pool.id || !pool.mintA || !pool.mintB || !pool.tvl) return null;
      const assetName = `${pool.mintA.symbol}/${pool.mintB.symbol}`;
      const opportunityId = `raydium-${pool.mintA.symbol.toLowerCase()}-${pool.mintB.symbol.toLowerCase()}`;
      const apyData = this.extractApy(pool);
      const riskData = this.calculateRisk(pool);
      return {
        id: opportunityId,
        protocol: "Raydium",
        asset: assetName,
        poolId: pool.id,
        apy: apyData.totalApy,
        feeApy: apyData.feeApy,
        rewardApy: apyData.totalApy - apyData.feeApy,
        tvl: pool.tvl,
        riskScore: riskData.riskScore,
        impermanentLossRisk: riskData.impermanentLossRisk,
        rewards: this.extractRewardTokens(pool),
      };
    } catch (error) {
      console.error(`Error parsing pool ${pool.id}:`, error);
      return null;
    }
  }

  private extractApy(pool: RaydiumPool): { totalApy: number; feeApy: number } {
    const periods = [pool.month, pool.week, pool.day];
    const totalApy =
      (periods.find((p) => p && typeof p.apr === "number")?.apr ?? 0) / 100;
    const feeApy =
      (periods.find((p) => p && typeof p.feeApr === "number")?.feeApr ?? 0) /
      100;
    return { totalApy, feeApy };
  }

  private calculateRisk(pool: RaydiumPool): {
    riskScore: number;
    impermanentLossRisk: number;
  } {
    const priceVolatility =
      pool.month && pool.month.priceMin && pool.month.priceMax
        ? (pool.month.priceMax - pool.month.priceMin) /
          ((pool.month.priceMax + pool.month.priceMin) / 2)
        : 0;
    const impermanentLossRisk = Math.min(
      Math.max(priceVolatility * 2, 0.1),
      0.9
    );
    let riskScore = 3;
    if (pool.tvl < 1000000) riskScore += 2;
    else if (pool.tvl < 5000000) riskScore += 1;
    else if (pool.tvl > 50000000) riskScore -= 1;
    if (priceVolatility > 0.5) riskScore += 2;
    else if (priceVolatility > 0.3) riskScore += 1;
    return {
      riskScore: Math.max(1, Math.min(10, riskScore)),
      impermanentLossRisk,
    };
  }

  private extractRewardTokens(pool: RaydiumPool): string[] {
    return (
      pool.rewardDefaultInfos
        ?.filter((r) => r.mint?.symbol)
        .map((r) => r.mint.symbol) || []
    );
  }
}
