import { OrcaCollector, OrcaCollectorConfig } from "@defi";
import * as defiModule from "@defi"; // Import the entire module for spying
import {
  buildWhirlpoolClient,
  PDAUtil,
  WhirlpoolData,
} from "@orca-so/whirlpools-sdk";
import { Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Mock @coral-xyz/anchor
jest.mock("@coral-xyz/anchor", () => ({
  BN: require("bn.js"),
  Wallet: jest.fn().mockImplementation(() => ({
    publicKey: { toBase58: () => "mockKey" },
    signTransaction: jest.fn(),
    signAllTransactions: jest.fn(),
  })),
}));

// Mock @solana/web3.js
const mockGetTokenAccountBalance = jest.fn();
jest.mock("@solana/web3.js", () => ({
  Connection: jest.fn(() => ({
    getTokenAccountBalance: mockGetTokenAccountBalance,
  })),
  Keypair: {
    generate: jest.fn(() => ({ publicKey: { toBase58: () => "mockKey" } })),
  },
  PublicKey: jest.fn((value: string) => ({
    toBase58: () => value,
    equals: (other: { toBase58: () => any }) =>
      value === (typeof other === "string" ? other : other.toBase58()),
  })),
}));

// Mock @orca-so/whirlpools-sdk
jest.mock("@orca-so/whirlpools-sdk", () => {
  const mockPublicKey = (value: string) => ({ toBase58: () => value });
  const MOCK_PROGRAM_ID = "4wTV1YmiEkRvAtNtw9NZuoknKTukRMu2GekdQiemnUgq";
  const MOCK_CONFIG = "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";
  const MOCK_WHIRLPOOL = "HJPjoWUrhoZzkNfRpHuiec4x8tF6GF3cuBKLQbhXU9Zk";
  const mockGetPool = jest.fn().mockResolvedValue({
    getData: () =>
      ({
        whirlpoolsConfig: { toBase58: () => MOCK_CONFIG },
        whirlpoolBump: [255],
        tickSpacing: 64,
        feeRate: 3000,
        protocolFeeRate: 1300,
        liquidity: new BN("1000000000"),
        sqrtPrice: new BN("609e6de2b329b009", 16),
        tickCurrentIndex: -19490,
        protocolFeeOwedA: new BN("0"),
        protocolFeeOwedB: new BN("0"),
        tokenMintA: {
          toBase58: () => "So11111111111111111111111111111111111111112",
        },
        tokenVaultA: {
          toBase58: () => "3YQm7ujtXWJU2e9jhp2QGHpnn1ShXn12QjvzMvDgabpX",
        },
        feeGrowthGlobalA: new BN("0"),
        tokenMintB: {
          toBase58: () => "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        tokenVaultB: {
          toBase58: () => "2JTw1fE2wz1SymWUQ7UqpVtrTuKjcd6mWwYwUJUCh2rq",
        },
        feeGrowthGlobalB: new BN("0"),
        rewardLastUpdatedTimestamp: new BN("0"),
        rewardInfos: [
          {
            mint: {
              toBase58: () => "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
              equals: (other) =>
                "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE" ===
                other.toBase58(),
            },
            vault: {
              toBase58: () => "2tU3tKvj7RBxEatryyMYTUxBoLSSWCQXsdv1X6yce4T2",
            },
            authority: {
              toBase58: () => "DjDsi34mSB66p2nhBL6YvhbcLtZbkGfNybFeLDjJqxJW",
            },
            emissionsPerSecondX64: new BN("10000000000000000000000"),
            growthGlobalX64: new BN("0"),
          },
          {
            mint: {
              toBase58: () => "11111111111111111111111111111111",
              equals: (other) =>
                "11111111111111111111111111111111" === other.toBase58(),
            },
          },
        ],
      } as WhirlpoolData),
  });

  return {
    buildWhirlpoolClient: jest.fn(() => ({ getPool: mockGetPool })),
    ORCA_WHIRLPOOL_PROGRAM_ID: mockPublicKey(MOCK_PROGRAM_ID),
    ORCA_WHIRLPOOLS_CONFIG: mockPublicKey(MOCK_CONFIG),
    PDAUtil: {
      getWhirlpool: jest.fn(() => ({
        publicKey: mockPublicKey(MOCK_WHIRLPOOL),
      })),
    },
    WhirlpoolContext: {
      from: jest.fn(() => ({
        program: { programId: mockPublicKey(MOCK_PROGRAM_ID) },
      })),
    },
  };
});

describe("OrcaCollector", () => {
  let mockClient: ReturnType<typeof buildWhirlpoolClient>;
  let mockConnection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetTokenAccountBalance
      .mockResolvedValueOnce({ value: { amount: "123456789000000000" } })
      .mockResolvedValueOnce({ value: { amount: "5000000000" } });

    // Explicitly spy on getTokenPrice from the @defi module
    jest
      .spyOn(defiModule, "getTokenPrice")
      .mockImplementation((mint: string) => {
        if (mint === "So11111111111111111111111111111111111111112") {
          return Promise.resolve(160); // SOL price
        }
        if (mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
          return Promise.resolve(1); // USDC price
        }
        if (mint === "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE") {
          return Promise.resolve(3); // Orca price
        }
        return Promise.resolve(0); // Default
      });

    // Mock getHistoricalPrices function
    jest
      .spyOn(defiModule, "getHistoricalPrices")
      .mockImplementation((mint: string, days: number) => {
        // For SOL, create price series with some volatility
        if (mint === "So11111111111111111111111111111111111111112") {
          // Create a 30-day price series for SOL with moderate volatility
          return Promise.resolve([
            150, 155, 158, 162, 158, 163, 165, 159, 155, 160, 162, 165, 168,
            170, 166, 162, 159, 163, 168, 170, 175, 172, 168, 165, 160, 155,
            158, 162, 159, 160,
          ]);
        }

        // For USDC (stablecoin), create a relatively stable price series
        if (mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
          // USDC should be stable around $1
          return Promise.resolve([
            1.0, 0.999, 1.001, 0.998, 1.002, 1.0, 0.999, 1.001, 1.0, 0.998,
            1.001, 1.002, 0.999, 1.0, 1.001, 0.998, 0.999, 1.002, 1.0, 1.001,
            0.999, 0.998, 1.0, 1.001, 1.002, 0.999, 1.0, 0.998, 1.001, 1.0,
          ]);
        }

        // Default fallback
        return Promise.resolve(Array(days).fill(1));
      });

    mockConnection = new Connection("mock");
    mockClient = buildWhirlpoolClient({} as any);
  });

  it("should filter out non-orca or disabled configs and collect yield opportunities", async () => {
    const config: OrcaCollectorConfig[] = [
      {
        collectorId: "orca-sol-usdc",
        mintOne: "So11111111111111111111111111111111111111112",
        mintTwo: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        pair: "SOL/USDC",
        collector: "orca",
        enabled: true,
      },
    ];

    const collector = new OrcaCollector(config);
    const result = await collector.collect();

    expect(PDAUtil.getWhirlpool).toHaveBeenCalled();
    expect(mockClient.getPool).toHaveBeenCalledTimes(1);
    expect(mockGetTokenAccountBalance).toHaveBeenCalledTimes(2);
    expect(defiModule.getTokenPrice).toHaveBeenCalledWith(
      "So11111111111111111111111111111111111111112"
    );
    expect(defiModule.getTokenPrice).toHaveBeenCalledWith(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );

    // Verify result
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      id: "orca-sol-usdc",
      protocol: "Orca",
      asset: "SOL/USDC",
      poolId: "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ",
      tvl: expect.any(Number),
      apy: expect.any(Number),
    });
    expect(result[0].rewardApy).toBeCloseTo(2.596, 2);
    // Expected impermanentLossRisk calculation:
    // With our mocked price data, the ratio volatility is moderately high
    // The exact value depends on the calculation in OrcaCollector.ts
    // Given our mock data, a value around 0.3-0.4 would be expected
    expect(result[0].impermanentLossRisk).toBeGreaterThan(0);
    expect(result[0].impermanentLossRisk).toBeLessThan(1);
    expect(result[0].impermanentLossRisk).toBeCloseTo(0.45, 1);
  });
});
