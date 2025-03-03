export interface RaydiumCollectorConfig {
  id: string;
  collector: string;
  enabled: boolean;
}

export class RaydiumCollector {
  private readonly _config: RaydiumCollectorConfig[];

  constructor(config: RaydiumCollectorConfig[]) {
    this._config = config;
  }

  public async collect(): Promise<any[]> {
    console.log("RaydiumCollector.collect");

    const temp = [];
    for (const collectorConfig of this._config) {
      if (collectorConfig.enabled) {
        console.log(`RaydiumCollector enabled: ${collectorConfig.id}`);
        temp.push(collectorConfig.id.split("-")[1]);
      }
    }
    const ids = temp.join(",");

    let opportunities: any[] = [];
    await fetch(`https://api-v3.raydium.io/pools/info/ids?ids=${ids}`)
      .then((response) => response.json())
      .then((data) => {
        opportunities = this.processPoolData(data);
      })
      .catch((error) => {
        console.error("Failed to fetch Raydium pool data:", error);
      });

    return opportunities;
  }

  public processPoolData(rawData: any): any[] {
    console.log("RaydiumCollector.processPoolData");

    // Check if the API response is valid
    if (
      !rawData ||
      !rawData.success ||
      !rawData.data ||
      !Array.isArray(rawData.data)
    ) {
      console.error("Invalid Raydium API response format");
      return [];
    }

    const parsedOpportunities = [];

    // Process each pool in the response
    for (const pool of rawData.data) {
      try {
        // Skip if missing critical information
        if (!pool.id || !pool.mintA || !pool.mintB || !pool.tvl) {
          console.warn(
            `Skipping incomplete pool data: ${pool.id || "unknown"}`
          );
          continue;
        }

        // Create asset name (e.g., "SOL/USDC")
        const assetName = `${pool.mintA.symbol}/${pool.mintB.symbol}`;

        // Format opportunity ID
        const opportunityId = `raydium-${pool.mintA.symbol.toLowerCase()}-${pool.mintB.symbol.toLowerCase()}`;

        // Calculate APY (convert from percentage to decimal)
        // We're using the month.apr value which includes both fee and reward APRs
        const totalApy =
          pool.month && typeof pool.month.apr === "number"
            ? pool.month.apr / 100
            : pool.week && typeof pool.week.apr === "number"
            ? pool.week.apr / 100
            : pool.day && typeof pool.day.apr === "number"
            ? pool.day.apr / 100
            : 0;

        // Get fee APY component
        const feeApy =
          pool.month && typeof pool.month.feeApr === "number"
            ? pool.month.feeApr / 100
            : pool.week && typeof pool.week.feeApr === "number"
            ? pool.week.feeApr / 100
            : pool.day && typeof pool.day.feeApr === "number"
            ? pool.day.feeApr / 100
            : 0;

        // Extract reward token information
        const rewardTokens = [];
        if (pool.rewardDefaultInfos && Array.isArray(pool.rewardDefaultInfos)) {
          for (const reward of pool.rewardDefaultInfos) {
            if (reward.mint && reward.mint.symbol) {
              rewardTokens.push(reward.mint.symbol);
            }
          }
        }

        // Calculate price volatility for risk assessment
        let priceVolatility = 0;
        if (pool.month && pool.month.priceMin && pool.month.priceMax) {
          const priceRange = pool.month.priceMax - pool.month.priceMin;
          const avgPrice = (pool.month.priceMax + pool.month.priceMin) / 2;
          priceVolatility = priceRange / avgPrice;
        }

        // Calculate impermanent loss risk based on price volatility
        // Higher volatility = higher IL risk
        const impermanentLossRisk = Math.min(
          Math.max(priceVolatility * 2, 0.1),
          0.9
        );

        // Calculate overall risk score (1-10 scale)
        // Consider factors: price volatility, pool TVL size, etc.
        let riskScore = 3; // Default medium-low risk

        // Adjust risk based on TVL (lower TVL = higher risk)
        if (pool.tvl < 1000000) {
          // Less than $1M
          riskScore += 2;
        } else if (pool.tvl < 5000000) {
          // Less than $5M
          riskScore += 1;
        } else if (pool.tvl > 50000000) {
          // More than $50M
          riskScore -= 1;
        }

        // Adjust risk based on price volatility
        if (priceVolatility > 0.5) {
          riskScore += 2;
        } else if (priceVolatility > 0.3) {
          riskScore += 1;
        }

        // Ensure risk score stays within 1-10 range
        riskScore = Math.max(1, Math.min(10, riskScore));

        // Create the opportunity object
        const opportunity = {
          id: opportunityId,
          protocol: "Raydium",
          asset: assetName,
          poolId: pool.id,
          poolType: Array.isArray(pool.pooltype)
            ? pool.pooltype.join(",")
            : "Standard",
          apy: totalApy,
          feeApy: feeApy,
          rewardApy: totalApy - feeApy,
          tvl: pool.tvl,
          fee: typeof pool.feeRate === "number" ? pool.feeRate : 0.0025,
          price: pool.price || 0,
          volume: {
            day: pool.day ? pool.day.volume || 0 : 0,
            week: pool.week ? pool.week.volume || 0 : 0,
            month: pool.month ? pool.month.volume || 0 : 0,
          },
          priceRange: {
            min: pool.month ? pool.month.priceMin || 0 : 0,
            max: pool.month ? pool.month.priceMax || 0 : 0,
          },
          riskScore: riskScore,
          impermanentLossRisk: impermanentLossRisk,
          rewards: rewardTokens,
          minAmount: 0.1, // Default minimum amount
          lpMint: pool.lpMint ? pool.lpMint.address : null,
        };

        parsedOpportunities.push(opportunity);
      } catch (error) {
        console.error(
          `Error parsing Raydium pool ${pool.id || "unknown"}:`,
          error
        );
        // Continue to next pool
      }
    }

    return parsedOpportunities;
  }
}
