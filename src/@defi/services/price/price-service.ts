import { CoinGeckoProvider } from "./coingecko-provider";
import { PriceProvider } from "./price-provider.interface";

export class PriceService {
  private provider: PriceProvider;
  private cache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly cacheLifespan = 5 * 60 * 1000; // 5 minutes

  constructor(provider?: PriceProvider) {
    this.provider = provider || new CoinGeckoProvider();
  }

  async getTokenPrice(tokenId: string, vsCurrency = "usd"): Promise<number> {
    const cacheKey = `${tokenId}:${vsCurrency}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheLifespan) {
      return cached.price;
    }

    const price = await this.provider.getPrice(tokenId, vsCurrency);
    this.cache.set(cacheKey, { price, timestamp: now });
    return price;
  }

  async getHistoricalPrices(tokenId: string, days: number): Promise<number[]> {
    return this.provider.getHistoricalPrices(tokenId, days);
  }
}

// Create a singleton instance
export const priceService = new PriceService();

// Export convenience functions that use the singleton
export async function getTokenPrice(
  tokenId: string,
  vsCurrency = "usd"
): Promise<number> {
  return priceService.getTokenPrice(tokenId, vsCurrency);
}

export async function getHistoricalPrices(
  tokenId: string,
  days: number
): Promise<number[]> {
  return priceService.getHistoricalPrices(tokenId, days);
}
