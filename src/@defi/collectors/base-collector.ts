import {
  BaseYieldCollectorConfig,
  YieldOpportunity,
} from "../types/yield-types";
import { YieldCollector } from "../types/collector-types";
import { PriceService } from "../services/price/price-service";

/**
 * Abstract base class for all yield collectors
 * Contains common functionality shared across collectors
 */
export abstract class BaseCollector<T extends BaseYieldCollectorConfig>
  implements YieldCollector<T>
{
  protected configs: T[];
  protected priceService: PriceService;
  protected protocolName: string;

  /**
   * @param allConfigs All configurations to filter for this collector type
   * @param collectorType String identifier for this collector
   * @param protocolName Human-readable protocol name
   * @param priceService Price service instance (or will use default)
   */
  constructor(
    allConfigs: BaseYieldCollectorConfig[],
    collectorType: string,
    protocolName: string,
    priceService: PriceService
  ) {
    // Filter configs for this collector type and that are enabled
    this.configs = allConfigs.filter(
      (c) => c.collector === collectorType && c.enabled === true
    ) as T[];

    this.protocolName = protocolName;
    this.priceService = priceService;

    if (!this.configs || this.configs.length === 0) {
      console.warn(
        `No enabled configurations found for collector type: ${collectorType}`
      );
    }
  }

  /**
   * Abstract method to be implemented by concrete collectors
   */
  abstract collect(): Promise<YieldOpportunity[]>;

  /**
   * Get the protocol name
   */
  getProtocolName(): string {
    return this.protocolName;
  }

  /**
   * Get the configurations being used
   */
  getConfigurations(): T[] {
    return [...this.configs];
  }

  /**
   * Calculate impermanent loss risk based on historical price data
   * Common functionality used by multiple collectors
   *
   * TODO: needs to be evaluated
   */
  protected async calculateImpermanentLossRisk(
    token1: string,
    token2: string
  ): Promise<number> {
    try {
      // Get historical prices for both tokens (last 30 days)
      const prices1 = await this.priceService.getHistoricalPrices(token1, 30);
      const prices2 = await this.priceService.getHistoricalPrices(token2, 30);

      // If we don't have enough price data, return minimal risk
      if (!prices1.length || !prices2.length) {
        return 0.1; // Minimum risk level
      }

      // Create price ratios
      const ratios = prices1.map((p, i) => p / (prices2[i] || 1));

      // Calculate log returns
      const logReturns = [];
      for (let i = 1; i < ratios.length; i++) {
        logReturns.push(Math.log(ratios[i] / ratios[i - 1]));
      }

      // Calculate standard deviation
      const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
      const variance =
        logReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        logReturns.length;
      const volatility = Math.sqrt(variance);

      // Annualize volatility and cap at 1.0
      const annualizedVolatility = Math.min(volatility * Math.sqrt(365), 1.0);

      return annualizedVolatility;
    } catch (error) {
      console.error("Error calculating impermanent loss risk:", error);
      return 0.3; // Default medium risk on error
    }
  }
}
