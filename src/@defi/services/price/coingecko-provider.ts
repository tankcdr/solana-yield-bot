import { TOKENS } from "../../models/tokens";
import type { PriceProvider } from "./price-provider.interface";

export class CoinGeckoProvider implements PriceProvider {
  private readonly baseUrl = "https://api.coingecko.com/api/v3";
  private readonly rateLimitDelay = 1100; // CoinGecko free tier has rate limits
  private lastRequestTime = 0;

  constructor() {}

  private async makeRequest(endpoint: string): Promise<any> {
    // Simple rate limiting
    const now = Date.now();
    const timeElapsed = now - this.lastRequestTime;
    if (timeElapsed < this.rateLimitDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.rateLimitDelay - timeElapsed)
      );
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`);
    this.lastRequestTime = Date.now();

    if (!response.ok) {
      throw new Error(
        `CoinGecko API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  private getCoingeckoId(tokenId: string): string {
    const token = TOKENS[tokenId];
    if (!token?.coingeckoId) {
      throw new Error(`No CoinGecko ID found for token ${tokenId}`);
    }
    return token.coingeckoId;
  }

  async getPrice(tokenId: string, vsCurrency = "usd"): Promise<number> {
    try {
      const coingeckoId = this.getCoingeckoId(tokenId);
      const data = await this.makeRequest(
        `/simple/price?ids=${coingeckoId}&vs_currencies=${vsCurrency}`
      );

      if (
        !data[coingeckoId] ||
        typeof data[coingeckoId][vsCurrency] !== "number"
      ) {
        throw new Error(
          `Price data not found for ${tokenId} (${coingeckoId}) in ${vsCurrency}`
        );
      }

      return data[coingeckoId][vsCurrency];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error fetching price for ${tokenId}:`, errorMessage);
      throw new Error(`Failed to fetch price for ${tokenId}: ${errorMessage}`);
    }
  }

  async getHistoricalPrices(tokenId: string, days: number): Promise<number[]> {
    try {
      const coingeckoId = this.getCoingeckoId(tokenId);
      const data = await this.makeRequest(
        `/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`
      );

      return data.prices.map((p: [number, number]) => p[1]); // [timestamp, price]
    } catch (error) {
      console.warn(
        `Error fetching historical prices for ${tokenId}, using fallback`
      );
      return Array(days).fill(1); // Fallback
    }
  }
}
