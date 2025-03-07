# Raydium Yield Collector

This module collects yield farming opportunities from the Raydium decentralized exchange on Solana.

## Overview

The RaydiumCollector connects to Raydium's liquidity pools to fetch real-time data, calculates key DeFi metrics, and returns standardized yield opportunity information compatible with the rest of the system.

## Features

- Fetches active liquidity pool data from the Raydium protocol API
- Calculates important DeFi metrics:
  - Total Value Locked (TVL)
  - Base APY from trading fees
  - Farm reward APYs from token emissions
  - Impermanent loss risk based on historical price volatility
- Supports multiple pool types including standard pools and fusion pools
- Provides standardized output format compatible with other collectors

## Configuration

The collector requires configuration objects that specify which pools to monitor:

```
{
  collectorId: "raydium-sol-usdc",  // Unique ID for this opportunity
  poolId: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", // Raydium pool address
  pair: "SOL/USDC",                 // Human-readable pair name
  collector: "raydium",             // Must be "raydium" for this collector
  enabled: true                     // Whether this pool is active
}
```

## Usage

```
import { RaydiumCollector, PriceService } from "@defi";

// Optional: Create customized price service
const priceService = new PriceService();

// Initialize collector with configurations
const raydiumCollector = new RaydiumCollector([
  {
    collectorId: "raydium-sol-usdc",
    poolId: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    pair: "SOL/USDC",
    collector: "raydium",
    enabled: true
  }
], priceService);

// Collect yield opportunities
const opportunities = await raydiumCollector.collect();

// Each opportunity contains
// - id: Unique identifier
// - protocol: "Raydium"
// - asset: e.g. "SOL/USDC"
// - poolId: On-chain pool address
// - tvl: Total value locked in USD
// - apy: Base trading fee APY
// - rewardApy: Additional APY from token rewards (if available)
// - impermanentLossRisk: Score from 0-1 indicating risk
// - rewards: Array of reward token information (if available)
```

## Implementation Details

The RaydiumCollector uses Raydium's public API to:

1. Fetch pool data for all configured pools in a single efficient request
2. Parse return data to extract TVL, APY, and other metrics
3. Calculate additional metrics like impermanent loss risk
4. Format response into standardized yield opportunity objects

## API Integration

Unlike some other collectors, Raydium data is primarily fetched from their public API endpoint rather than directly from on-chain data. This provides several advantages:

- Reduced RPC load and latency
- Access to pre-calculated metrics
- Compatibility with Raydium's various pool types

## Risk Analysis

Impermanent loss risk is calculated by:

1. Fetching historical price data for both assets in the pool
2. Analyzing price ratio volatility over time
3. Calculating annualized volatility as a risk metric
4. Normalizing to a 0-1 scale (higher number = higher risk)

## Requirements

- Network access to Raydium API endpoints
- CoinGecko API access for token pricing data and historical prices
- Proper error handling for API throttling or downtime scenarios

## Error Handling

The collector implements robust error handling to ensure that:

- Individual pool failures don't affect other pools
- Temporary API issues are properly logged
- Missing data defaults to conservative values when possible
