import { TokenInfo } from "../types/price-types";

const tokenDefinitions: TokenInfo[] = [
  {
    symbol: "SOL",
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
    coingeckoId: "solana",
  },
  {
    symbol: "USDC",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  {
    symbol: "USDT",
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    coingeckoId: "tether",
  }, // Corrected USDT address
  {
    symbol: "ORCA",
    address: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    decimals: 6,
    coingeckoId: "orca",
  },
  {
    symbol: "RAY",
    address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    decimals: 6,
    coingeckoId: "raydium",
  }, // Corrected RAY address
  {
    symbol: "SRM",
    address: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    decimals: 6,
    coingeckoId: "serum",
  },
  // Note: BTC on Solana varies; using a Wrapped BTC address as an example
  {
    symbol: "BTC",
    address: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    decimals: 6,
    coingeckoId: "bitcoin",
  },
] as const;

// Create a readonly record for lookups by symbol or address
export const TOKENS: Readonly<Record<string, TokenInfo>> = Object.freeze(
  tokenDefinitions.reduce((acc, token) => {
    acc[token.symbol] = token;
    acc[token.address] = token;
    return acc;
  }, {} as Record<string, TokenInfo>)
);
