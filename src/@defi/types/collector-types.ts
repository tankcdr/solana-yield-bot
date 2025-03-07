import { BaseYieldCollectorConfig, YieldOpportunity } from "./yield-types";

/**
 * Common interface for all yield collectors
 */
export interface YieldCollector<
  T extends BaseYieldCollectorConfig = BaseYieldCollectorConfig
> {
  /**
   * Collect yield opportunities from the specified protocol
   * @returns Promise resolving to an array of yield opportunities
   */
  collect(): Promise<YieldOpportunity[]>;

  /**
   * Get the protocol name this collector is for
   */
  getProtocolName(): string;

  /**
   * Get the configurations this collector is using
   */
  getConfigurations(): T[];
}
