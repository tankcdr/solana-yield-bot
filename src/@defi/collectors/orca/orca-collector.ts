import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  ORCA_WHIRLPOOLS_CONFIG,
  PDAUtil,
  WhirlpoolContext,
  WhirlpoolData,
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil } from "@orca-so/common-sdk";
import { BN, Wallet } from "@coral-xyz/anchor";
import { OrcaCollectorConfig } from "./orca-types";
import { BaseYieldCollectorConfig, YieldOpportunity } from "../../types";
import { PriceService, priceService } from "../../services/price";
import { TOKENS } from "../../models";

export class OrcaCollector {
  private readonly _config: OrcaCollectorConfig[];
  private readonly priceService: PriceService;

  constructor(
    config: BaseYieldCollectorConfig[],
    _priceService?: PriceService
  ) {
    if (!config || config.length === 0) {
      throw new Error("Config array cannot be empty");
    }

    this._config = config.filter(
      (c) => c.collector === "orca" && c.enabled === true
    ) as OrcaCollectorConfig[];

    this.priceService = _priceService || priceService;
  }

  public async collect(): Promise<YieldOpportunity[]> {
    console.log("OrcaCollector.collect");

    try {
      const connection = new Connection(
        "https://api.mainnet-beta.solana.com",
        "confirmed"
      );
      //get Whirlpool context
      const context = WhirlpoolContext.from(
        connection,
        new Wallet(Keypair.generate()),
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      const client = buildWhirlpoolClient(context);
      const tickSpacing = 64;

      const tasks = this._config.map(async (config) => {
        const whirlpoolPda = PDAUtil.getWhirlpool(
          ORCA_WHIRLPOOL_PROGRAM_ID,
          ORCA_WHIRLPOOLS_CONFIG,
          new PublicKey(config.mintOne),
          new PublicKey(config.mintTwo),
          tickSpacing
        );
        const whirlpoolPubkey = whirlpoolPda.publicKey;

        const whirlpool = await client.getPool(whirlpoolPubkey);
        if (!whirlpool) {
          throw new Error("Whirlpool pool not found!");
        }
        const poolData = whirlpool.getData();

        // Transform the data into YieldOpportunity
        return this.parseWhirlpool(poolData, config.collectorId, connection);
      });

      // Execute all tasks in parallel and filter out failed ones
      const results = await Promise.allSettled(tasks);

      return results
        .filter(
          (result) => result.status === "fulfilled" && result.value !== null
        )
        .map(
          (result) => (result as PromiseFulfilledResult<YieldOpportunity>).value
        );
    } catch (error) {
      console.error("Failed to fetch SOL/USDC Whirlpool data:", error);
      return [];
    }
  }

  private async parseWhirlpool(
    poolData: WhirlpoolData,
    collectorId: string,
    connection: Connection
  ): Promise<YieldOpportunity | Error> {
    try {
      console.log("Parsing whirlpool", collectorId);

      const mintA = poolData.tokenMintA.toBase58();
      const mintB = poolData.tokenMintB.toBase58();
      const symbolA = TOKENS[mintA].symbol || "Unknown";
      const symbolB = TOKENS[mintB].symbol || "Unknown";

      // Fetch token account balances
      const [vaultAInfo, vaultBInfo] = await Promise.all([
        connection.getTokenAccountBalance(poolData.tokenVaultA),
        connection.getTokenAccountBalance(poolData.tokenVaultB),
      ]);

      // Convert balances to decimal amounts
      const tokenAmountA = DecimalUtil.fromBN(
        new BN(vaultAInfo.value.amount), // Raw amount as string
        TOKENS[mintA]?.decimals || 0
      );
      const tokenAmountB = DecimalUtil.fromBN(
        new BN(vaultBInfo.value.amount), // Raw amount as string
        TOKENS[mintB]?.decimals || 0
      );

      // Calculate price (SOL per USDC) from sqrtPrice
      const sqrtPrice = DecimalUtil.fromBN(poolData.sqrtPrice, 0);
      const price = sqrtPrice
        .pow(2)
        .div(
          DecimalUtil.fromNumber(
            10 ** (TOKENS[mintA].decimals - TOKENS[mintB].decimals)
          )
        );

      // TVL calculation (requires external prices)
      const priceA = await this.priceService.getTokenPrice(mintA); // Async in real use
      const priceB = await this.priceService.getTokenPrice(mintB); // Async in real use
      const tvl =
        tokenAmountA.toNumber() * priceA + tokenAmountB.toNumber() * priceB;

      // Fee APY (rough estimate: feeRate * assumed volume / TVL)
      const feeRate = poolData.feeRate / 10000; // e.g., 3000 -> 0.003 (0.3%)
      const assumedDailyVolume = tvl * 0.1; // Assumption: 10% of TVL traded daily
      const feeApy = (feeRate * assumedDailyVolume * 365) / tvl;

      // Reward APY (simplified, assumes ORCA reward)
      const rewardInfos = poolData.rewardInfos.filter(
        (r) => !r.mint.equals(new PublicKey("11111111111111111111111111111111"))
      );

      /*  Updated reward APY calculation:
          Extract Reward Emissions: For each active reward in rewardInfos, convert emissionsPerSecondX64 to a decimal value by dividing by 2^64.
          Annualize Emissions: Multiply the per-second emissions by the number of seconds in a year (31,536,000) to get the annual emissions.
          Get Reward Token Price: Fetch the current market price of the reward token (e.g., ORCA) using your existing getTokenPrice function.
          Compute Annual Reward Value: Multiply the annual emissions by the token price to get the total annual reward value in USD.
          Calculate APY: Divide the total annual reward value by the pool’s TVL to get the reward APY.
      */
      let totalAnnualRewardValue = 0;
      for (const r of rewardInfos) {
        const emissionsPerSecond =
          Number(r.emissionsPerSecondX64.toString()) / Math.pow(2, 64);
        const annualEmissions = emissionsPerSecond * 31536000; // Seconds in a year
        const rewardMint = r.mint.toBase58();
        const rewardPrice = await this.priceService.getTokenPrice(rewardMint);
        totalAnnualRewardValue += annualEmissions * rewardPrice;
      }
      const rewardApy = totalAnnualRewardValue / tvl;

      // Total APY
      const totalApy = feeApy + rewardApy;

      // Risk calculation (simplified)
      const riskScore = tvl < 1000000 ? 5 : tvl > 50000000 ? 2 : 3;

      /*  
        Updated impermanent loss risk calculation:
          Impermanent loss occurs when the prices of the two tokens diverge, and its risk can be approximated by the historical volatility of their price ratio. Here’s the process:
          Fetch Historical Prices: Get daily prices for both tokens over a period (e.g., 30 days).
          Calculate Price Ratios: Compute the daily price ratio (priceA / priceB).
          Compute Log Returns: Calculate the daily logarithmic returns of the price ratios.
          Calculate Volatility: Compute the standard deviation of these returns and annualize it by multiplying by sqrt(365).
          Set IL Risk: Use the annualized volatility as the impermanentLossRisk, optionally capping it at 1.
      */
      const days = 30;
      const pricesA = await this.priceService.getHistoricalPrices(mintA, days);
      const pricesB = await this.priceService.getHistoricalPrices(mintB, days);

      if (pricesA.length !== pricesB.length) {
        throw new Error("Mismatch in historical price data lengths");
      }

      const priceRatios = pricesA.map((pA, i) => pA / pricesB[i]);
      const logReturns = [];
      for (let i = 1; i < priceRatios.length; i++) {
        logReturns.push(Math.log(priceRatios[i] / priceRatios[i - 1]));
      }

      const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
      const variance =
        logReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        (logReturns.length - 1);
      const stdDev = Math.sqrt(variance);
      const annualizedVolatility = stdDev * Math.sqrt(365);
      const impermanentLossRisk = Math.min(annualizedVolatility, 1); // Cap at 1

      // Rewards
      const rewards = rewardInfos.map(
        (r) => TOKENS[r.mint.toBase58()].symbol || "Unknown"
      );

      return {
        id: `orca-${symbolA.toLowerCase()}-${symbolB.toLowerCase()}`,
        protocol: "Orca",
        asset: `${symbolA}/${symbolB}`,
        poolId: poolData.whirlpoolsConfig.toBase58(),
        apy: totalApy,
        feeApy: feeApy,
        rewardApy,
        tvl,
        riskScore,
        impermanentLossRisk,
        rewards,
      };
    } catch (error: unknown) {
      console.error(`Error parsing Orca whirlpool ${collectorId} `, error);
      return error as Error;
    }
  }
}
