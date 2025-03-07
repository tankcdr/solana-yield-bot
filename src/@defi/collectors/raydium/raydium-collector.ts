import {
  BaseYieldCollectorConfig,
  YieldOpportunity,
} from "../../types/yield-types";
import {
  RaydiumApiResponse,
  RaydiumCollectorConfig,
  RaydiumPool,
} from "./raydium-types";

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
