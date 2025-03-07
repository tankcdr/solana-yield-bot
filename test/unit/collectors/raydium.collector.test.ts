import {
  BaseYieldCollectorConfig,
  PriceService,
  RaydiumCollector,
  RaydiumCollectorConfig,
} from "@defi";

// Mock the PriceService - this is the key change
jest.mock("@defi/services/price/price-service", () => {
  return {
    PriceService: jest.fn().mockImplementation(() => {
      return {
        getTokenPrice: jest.fn().mockResolvedValue(1),
        getHistoricalPrices: jest.fn().mockResolvedValue([1, 1, 1, 1]),
      };
    }),
  };
});

// We'll mock the global.fetch in our tests.
declare global {
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
  let mockPriceService: PriceService;

  beforeEach(() => {
    // Reset our global.fetch to a Jest mock before each test
    global.fetch = jest.fn();

    // Create a mock PriceService for each test
    mockPriceService = new PriceService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should throw an error with an empty config", async () => {
    expect(() => new RaydiumCollector([], mockPriceService)).toThrow(
      "Config array cannot be empty"
    );
  });

  it("filters out configs that are not 'raydium' or not enabled", async () => {
    const collector = new RaydiumCollector(
      [
        {
          collectorId: "not-raydium",
          mintOne: "whatever 1",
          mintTwo: "whatever 2",
          pair: "SOL/USDC",
          collector: "orca",
          enabled: true,
        } as BaseYieldCollectorConfig,
        {
          collectorId: "raydium-disabled",
          poolId: "something",
          pair: "SOL/USDC",
          collector: "raydium",
          enabled: false,
        } as RaydiumCollectorConfig,
        {
          collectorId: "raydium-enabled",
          poolId: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
          pair: "SOL/USDC",
          collector: "raydium",
          enabled: true,
        } as RaydiumCollectorConfig,
      ],
      mockPriceService
    );

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

  // Continue with remaining tests, adding the mockPriceService parameter to each RaydiumCollector constructor
  it("handles multiple valid pools from the API", async () => {
    const collector = new RaydiumCollector(
      [
        {
          collectorId: "raydium-SOL-USDC",
          poolId: "solUsdcPoolId",
          pair: "SOL/USDC",
          collector: "raydium",
          enabled: true,
        } as RaydiumCollectorConfig,
        {
          collectorId: "raydium-BTC-USDC",
          poolId: "btcUsdcPoolId",
          pair: "BTC/USDC",
          collector: "raydium",
          enabled: true,
        } as RaydiumCollectorConfig,
      ],
      mockPriceService
    );

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

  // Update all remaining test cases following the same pattern
  // ... rest of your tests with mockPriceService added

  it("tests getProtocolName() method", async () => {
    const collector = new RaydiumCollector(
      [
        {
          collectorId: "raydium-test",
          poolId: "testPoolId",
          pair: "SOL/USDC",
          collector: "raydium",
          enabled: true,
        } as RaydiumCollectorConfig,
      ],
      mockPriceService
    );

    // Test that the getProtocolName method returns the expected value
    expect(collector.getProtocolName()).toBe("Raydium");
  });

  it("tests getConfigurations() method", async () => {
    const configs = [
      {
        collectorId: "raydium-test",
        poolId: "testPoolId",
        pair: "SOL/USDC",
        collector: "raydium",
        enabled: true,
      } as RaydiumCollectorConfig,
    ];

    const collector = new RaydiumCollector(configs, mockPriceService);

    // Test that getConfigurations returns the filtered configs
    expect(collector.getConfigurations()).toEqual(configs);
  });
});
