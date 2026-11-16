// Reader for Gemini's public prediction-markets API. No key needed.
// Data provided by Gemini.
// Plain fetch: no retries, no caching. Calls are spaced at least 1 second apart.

const API = "https://api.gemini.com";
const BASE = `${API}/v1/prediction-markets`;

// Only the fields we use. Gemini sends prices as strings, and any of them can be missing.
export type GeminiContract = {
  instrumentSymbol: string;
  label: string;
  marketState: string;
  expiryDate: string;
  prices?: { bestBid?: string; bestAsk?: string; lastTradePrice?: string };
};

export type GeminiEvent = {
  ticker: string;
  title: string;
  category: string;
  type: string;
  expiryDate: string;
  volume: string; // for the whole event; contracts carry no volume of their own
  volume24h: string;
  contracts: GeminiContract[];
};

// [time in ms, open, high, low, close, volume], newest first
export type GeminiCandle = [number, number, number, number, number, number];

let nextCallAt = 0;

async function get(url: string) {
  const at = Math.max(Date.now(), nextCallAt);
  nextCallAt = at + 1000;
  await new Promise((resolve) => setTimeout(resolve, at - Date.now()));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gemini returned ${res.status} for ${url}`);
  return res.json();
}

export async function getCategories() {
  const apiUrl = `${BASE}/categories`;
  const json = (await get(apiUrl)) as { categories: string[] };
  return { apiUrl, categories: json.categories };
}

export async function getEvents(opts: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.category) params.set("category", opts.category);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));

  const apiUrl = `${BASE}/events?${params}`;
  const json = (await get(apiUrl)) as {
    data: GeminiEvent[];
    pagination: { limit: number; offset: number; total: number };
  };
  return { apiUrl, events: json.data, pagination: json.pagination };
}

export async function getEvent(ticker: string) {
  const apiUrl = `${BASE}/events/${encodeURIComponent(ticker)}`;
  const event = (await get(apiUrl)) as GeminiEvent;
  return { apiUrl, event };
}

// Price history for one contract. Found in unit 2.1: the events API has no history,
// but Gemini's ordinary candles endpoint accepts a prediction-market instrumentSymbol.
export async function getCandles(symbol: string, timeFrame: "1hr" | "1day") {
  const apiUrl = `${API}/v2/candles/${encodeURIComponent(symbol)}/${timeFrame}`;
  const candles = (await get(apiUrl)) as GeminiCandle[];
  return { apiUrl, candles };
}
