export interface PriceProvider {
  getPrice(tokenId: string, vsCurrency?: string): Promise<number>;
  getHistoricalPrices(tokenId: string, days: number): Promise<number[]>;
}
