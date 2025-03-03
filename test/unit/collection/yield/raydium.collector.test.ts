import { RaydiumCollector } from "@defi";

// We’ll mock the global.fetch in our tests.
declare global {
  // Augment the global object for TypeScript
  // so it recognizes fetch as a jest.Mock in tests.
  // This is optional, but helps with IntelliSense.
  // If you prefer, you can just cast to jest.Mock.
  namespace NodeJS {
    interface Global {
      fetch: jest.Mock;
    }
  }
}

/**
 * Helper to make the "fetch" call return a custom JSON response.
 */
function mockFetch(data: any, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: async () => data,
  });
}

describe("Testing RaydiumCollector", () => {
  beforeEach(() => {
    // Reset our global.fetch to a Jest mock before each test
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should throw an error with an empty config", async () => {
    expect(() => new RaydiumCollector([])).toThrow(
      "Config array cannot be empty"
    );
  });

  it("filters out configs that are not 'raydium' or not enabled", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "not-raydium",
        id: "whatever",
        pair: "SOL/USDC",
        collector: "jupiter", // Not "raydium"
        enabled: true,
      },
      {
        collectorId: "raydium-disabled",
        id: "something",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: false,
      },
      {
        collectorId: "raydium-enabled",
        id: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    // Only one config is valid => we expect one pool ID in the final fetch
    mockFetch(
      {
        success: true,
        data: [
          {
            id: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
            mintA: { symbol: "SOL", decimals: 9 },
            mintB: { symbol: "USDC", decimals: 6 },
            tvl: 5000000,
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(fetch).toHaveBeenCalledTimes(1);

    // We expect exactly one yield opportunity from the single enabled raydium config
    expect(result.length).toBe(1);
    expect(result[0].asset).toBe("SOL/USDC");
  });

  it("handles multiple valid pools from the API", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-SOL-USDC",
        id: "solUsdcPoolId",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
      {
        collectorId: "raydium-BTC-USDC",
        id: "btcUsdcPoolId",
        pair: "BTC/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    // Suppose the API returns a list containing both pools
    mockFetch(
      {
        success: true,
        data: [
          {
            id: "solUsdcPoolId",
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 2_500_000,
          },
          {
            id: "btcUsdcPoolId",
            mintA: { symbol: "BTC" },
            mintB: { symbol: "USDC" },
            tvl: 3_500_000,
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);

    // Check that each pool is parsed correctly
    const solUsdc = result.find((r) => r.asset === "SOL/USDC");
    const btcUsdc = result.find((r) => r.asset === "BTC/USDC");
    expect(solUsdc).toBeDefined();
    expect(btcUsdc).toBeDefined();
    expect(solUsdc?.tvl).toBe(2_500_000);
    expect(btcUsdc?.tvl).toBe(3_500_000);
  });

  it("skips pools missing required data (id, mintA, mintB, tvl)", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-edge",
        id: "somePoolId",
        pair: "FAKE/FAKE",
        collector: "raydium",
        enabled: true,
      },
    ]);

    mockFetch(
      {
        success: true,
        data: [
          // Missing 'id'
          {
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 1_000_000,
          },
          // Missing 'mintB'
          {
            id: "poolWithNoMintB",
            mintA: { symbol: "SOL" },
            tvl: 2_000_000,
          },
          // Has everything
          {
            id: "validPool",
            mintA: { symbol: "FAKEA" },
            mintB: { symbol: "FAKEB" },
            tvl: 3_000_000,
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    // Only the third one is valid
    expect(result).toHaveLength(1);
    expect(result[0].poolId).toBe("validPool");
    expect(result[0].asset).toBe("FAKEA/FAKEB");
  });

  it("extracts APR from the first non-empty period among month, week, day", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-apr-test",
        id: "periodCheckPool",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    mockFetch(
      {
        success: true,
        data: [
          {
            id: "periodCheckPool",
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 1_000_000,
            // month is missing
            week: {
              apr: 12,
              feeApr: 2,
            },
            day: {
              apr: 18, // doesn't matter, because we'll take 'week' first
              feeApr: 1,
            },
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(result).toHaveLength(1);
    expect(result[0].apy).toBeCloseTo(0.12); // 12 -> 0.12
    expect(result[0].feeApy).toBeCloseTo(0.02); // 2 -> 0.02
  });

  it("calculates risk and impermanent loss correctly", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-risk",
        id: "riskPool",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    mockFetch(
      {
        success: true,
        data: [
          {
            id: "riskPool",
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 500_000, // <1M => riskScore +2
            month: {
              priceMin: 20,
              priceMax: 40,
            },
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(result).toHaveLength(1);

    // priceVolatility = (40 - 20) / ((40 + 20)/2) = 20/30 = ~0.666...
    // impermanentLossRisk = clamp(0.666 * 2, 0.1, 0.9) = 1.333..., but max is 0.9
    // => IL = 0.9

    // base riskScore = 3
    // tvl < 1M => +2 => 5
    // priceVolatility > 0.5 => +2 => 7
    // clamp min=1, max=10 => final = 7
    const { riskScore, impermanentLossRisk } = result[0];
    expect(riskScore).toBe(7);
    expect(impermanentLossRisk).toBeCloseTo(0.9);
  });

  it("extracts multiple reward tokens", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-rewards",
        id: "rewardsPool",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    mockFetch(
      {
        success: true,
        data: [
          {
            id: "rewardsPool",
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 2_000_000,
            rewardDefaultInfos: [
              { mint: { symbol: "RAY" } },
              { mint: { symbol: "BONK" } },
            ],
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(result).toHaveLength(1);
    expect(result[0].rewards).toEqual(["RAY", "BONK"]);
  });

  it("handles extremely large TVL and high volatility", async () => {
    const collector = new RaydiumCollector([
      {
        collectorId: "raydium-highValues",
        id: "extremePool",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      },
    ]);

    mockFetch(
      {
        success: true,
        data: [
          {
            id: "extremePool",
            mintA: { symbol: "SOL" },
            mintB: { symbol: "USDC" },
            tvl: 1_000_000_000, // 1 billion => likely reduces risk score
            month: {
              priceMin: 1,
              priceMax: 100,
            },
          },
        ],
      },
      true
    );

    const result = await collector.collect();
    expect(result).toHaveLength(1);

    const { riskScore, impermanentLossRisk } = result[0];
    // Price volatility = (100 - 1) / ((100 + 1)/2) => 99 / 50.5 => ~1.96
    // IL risk => clamp(1.96 * 2, 0.1, 0.9) => clamp(3.92, 0.1, 0.9) => 0.9
    expect(impermanentLossRisk).toBeCloseTo(0.9);

    // base = 3
    // tvl > 50,000,000 => riskScore -= 1 => new = 2
    // priceVol > 0.5 => +2 => total 4
    expect(riskScore).toBe(4);
  });
});
