// Define the TokenInfo type
type TokenInfo = {
  symbol: string;
  address: string;
  decimals: number;
  coingeckoId?: string;
};

// Define tokens as a const array, then transform into a lookup object
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

// Fetch token price using CoinGecko API
export async function getTokenPrice(
  tokenId: string,
  vsCurrency = "usd"
): Promise<number> {
  const token = TOKENS[tokenId];
  const coingeckoId = token?.coingeckoId;

  console.log("Fetching price for", tokenId, "with ID", coingeckoId);

  if (!coingeckoId) {
    throw new Error(`No CoinGecko ID found for token ${tokenId}`);
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=${vsCurrency}`;

    console.log("Fetching price for", tokenId, "from", url);
    const response = await fetch(url);
    console.log("response", response);
    const data = await response.json();

    console.log("data", data);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching price for ${tokenId}:`, errorMessage);
    throw new Error(`Failed to fetch price for ${tokenId}: ${errorMessage}`);
  }
}
