# Orca Yield Collector

This module collects yield farming opportunities from the [Orca](https://www.orca.so/) decentralized exchange on Solana.

## Overview

The OrcaCollector connects to Orca's Whirlpool protocol to fetch real-time data about liquidity pools, calculates key metrics, and returns standardized yield opportunity information.

## Features

- Fetches active Whirlpool data from the Orca protocol
- Calculates important DeFi metrics:
  - Total Value Locked (TVL)
  - Base APY from trading fees
  - Reward APY from token emissions
  - Impermanent loss risk based on historical token volatility
- Standardized output format compatible with other collectors

## Configuration

The collector requires configuration objects that specify which pools to monitor:

```typescript
{
  collectorId: "orca-sol-usdc",    // Unique ID for this opportunity
  mintOne: "So11111111111111111111111111111111111111112", // SOL mint address
  mintTwo: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint address
  pair: "SOL/USDC",               // Human-readable pair name
  collector: "orca",              // Must be "orca" for this collector
  enabled: true                   // Whether this pool is active
}
```

## Usage

```
import { OrcaCollector, PriceService } from "@defi";

// Optional: Create customized price service
const priceService = new PriceService();

// Initialize collector with configurations
const orcaCollector = new OrcaCollector([
  {
    collectorId: "orca-sol-usdc",
    mintOne: "So11111111111111111111111111111111111111112", // SOL
    mintTwo: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    pair: "SOL/USDC",
    collector: "orca",
    enabled: true
  }
], priceService);

// Collect yield opportunities
const opportunities = await orcaCollector.collect();

// Each opportunity contains
// - id: Unique identifier
// - protocol: "Orca"
// - asset: e.g. "SOL/USDC"
// - poolId: On-chain address
// - tvl: Total value locked in USD
// - apy: Base trading fee APY
// - rewardApy: Additional APY from token rewards
// - impermanentLossRisk: Score from 0-1 indicating risk
// - rewards: Array of reward token information
```

## Implementation Details

The collector uses the official Orca Whirlpools SDK to:

1. Connect to each configured pool using Solana's RPC network
2. Fetch current liquidity, fees, and reward emission rates
3. Calculate trading volume based on fee accumulation
4. Convert on-chain values to human-readable metrics

APY calculations include:

1. Trading fee APY based on 24h volume extrapolated to annual returns
2. Reward APY from token emissions using current token prices
3. Combined APY for total expected returns

##Requirements

- Solana RPC endpoint with good reliability
- CoinGecko API access for token pricing data
- Proper Solana wallet connection for reading on-chain data
