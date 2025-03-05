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
import {
  BaseYieldCollectorConfig,
  OrcaCollectorConfig,
  YieldOpportunity,
} from "./types";
import { BN, Wallet } from "@coral-xyz/anchor";
import { getTokenPrice, TOKENS } from "./tokens";

interface OrcaApiResponse {
  success: boolean;
  whirlpools: OrcaWhirlpool[];
}

interface OrcaWhirlpool {
  address: string;
  tokenA: OrcaToken;
  tokenB: OrcaToken;
  tickSpacing: number;
  price: number;
  tvl: number;
  volume: {
    day: number;
    week: number;
    month: number;
  };
  fee: number;
  apy: {
    total: number;
    fee: number;
    rewards: number;
  };
  rewards?: {
    mint: string;
    symbol: string;
    apr: number;
  }[];
}

interface OrcaToken {
  mint: string;
  symbol: string;
  decimals: number;
}

export class OrcaCollector {
  private readonly _config: OrcaCollectorConfig[];

  constructor(config: BaseYieldCollectorConfig[]) {
    if (!config || config.length === 0) {
      throw new Error("Config array cannot be empty");
    }

    this._config = config.filter(
      (c) => c.collector === "orca" && c.enabled === true
    ) as OrcaCollectorConfig[];
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
        console.log("config", config);

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
        console.log("poolInfo", poolData);

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
      const priceA = await getTokenPrice(mintA); // Async in real use
      const priceB = await getTokenPrice(mintB); // Async in real use
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
      const rewardApy = rewardInfos.length > 0 ? 0.0423 : 0; // Placeholder (4.23% from Raydium example)

      // Total APY
      const totalApy = feeApy + rewardApy;

      // Risk calculation (simplified)
      const riskScore = tvl < 1000000 ? 5 : tvl > 50000000 ? 2 : 3;
      const impermanentLossRisk = 0.3; // Placeholder, needs volatility data

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
        rewardApy: rewardApy,
        tvl: tvl,
        riskScore: riskScore,
        impermanentLossRisk: impermanentLossRisk,
        rewards: rewards,
      };
    } catch (error: unknown) {
      console.error(`Error parsing Orca whirlpool ${collectorId} `, error);
      return error as Error;
    }
  }
}
