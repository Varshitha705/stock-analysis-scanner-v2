require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";

app.use(cors());
app.use(express.static("public"));

const WATCHLIST = ["AAOI", "CELH", "LITE", "DIOD", "GNRC", "VSH", "POWI", "GEVG", "FRMI", "AXTI"];

const THEMES = {
  AAOI: { theme: "AI / Optical Infrastructure", benchmark: "SMH" },
  CELH: { theme: "Consumer Growth / Beverages", benchmark: "XLP" },
  LITE: { theme: "Optical / Data Center Infrastructure", benchmark: "SMH" },
  DIOD: { theme: "Semiconductors", benchmark: "SMH" },
  GNRC: { theme: "Power / Grid Infrastructure", benchmark: "XLI" },
  VSH:  { theme: "Electronic Components", benchmark: "SMH" },
  POWI: { theme: "Power Semiconductors", benchmark: "SMH" },
  GEVG: { theme: "User Watchlist Theme", benchmark: "SPY" },
  FRMI: { theme: "User Watchlist Theme", benchmark: "SPY" },
  AXTI: { theme: "Semiconductor Materials", benchmark: "SMH" }
};

let cache = { key: "", time: 0, data: null };
const CACHE_MS = 60 * 1000;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

async function polygon(path) {
  if (!POLYGON_API_KEY) {
    throw new Error("Missing POLYGON_API_KEY. Add it in Railway Variables.");
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://api.polygon.io${path}${separator}apiKey=${POLYGON_API_KEY}`;
  const response = await fetch(url);
  const json = await response.json();

  if (!response.ok || json.status === "ERROR") {
    throw new Error(json.error || json.message || "Polygon request failed");
  }

  return json;
}

async function aggregates(ticker, multiplier, timespan, from, to) {
  const path = `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
  const json = await polygon(path);
  return (json.results || []).map(c => ({
    date: new Date(c.t).toISOString(),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v
  }));
}

function ema(values, period) {
  if (!values || values.length < period) return null;

  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    current = values[i] * multiplier + current * (1 - multiplier);
  }

  return current;
}

function sma(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function bullishTrend(daily) {
  if (!daily || daily.length < 60) return false;

  const closes = daily.map(c => c.close);
  const last = closes.at(-1);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  const recent = daily.slice(-30);
  const firstHalf = recent.slice(0, 15);
  const secondHalf = recent.slice(15);

  const firstHigh = Math.max(...firstHalf.map(c => c.high));
  const secondHigh = Math.max(...secondHalf.map(c => c.high));
  const firstLow = Math.min(...firstHalf.map(c => c.low));
  const secondLow = Math.min(...secondHalf.map(c => c.low));

  return last > sma20 && sma20 > sma50 && secondHigh >= firstHigh && secondLow >= firstLow;
}

function calculatePOC(intraday, bins = 48) {
  const candles = intraday.filter(c => c.high && c.low && c.close && c.volume);
  if (candles.length < 30) return null;

  const min = Math.min(...candles.map(c => c.low));
  const max = Math.max(...candles.map(c => c.high));
  if (max <= min) return null;

  const step = (max - min) / bins;
  const volumeBins = new Array(bins).fill(0);

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    let index = Math.floor((typicalPrice - min) / step);
    index = Math.max(0, Math.min(bins - 1, index));
    volumeBins[index] += candle.volume || 0;
  }

  const maxVolume = Math.max(...volumeBins);
  const pocIndex = volumeBins.indexOf(maxVolume);
  return min + step * (pocIndex + 0.5);
}

function percentReturn(candles, barsBack) {
  if (!candles || candles.length <= barsBack) return null;
  const latest = candles.at(-1).close;
  const old = candles.at(-1 - barsBack).close;
  if (!old) return null;
  return ((latest - old) / old) * 100;
}

function setupScore(checks) {
  let score = 0;
  if (checks.trend) score += 25;
  if (checks.above9) score += 20;
  if (checks.above21) score += 20;
  if (checks.pocAbove) score += 20;
  if (checks.themeBullish) score += 15;

  let grade = "Pass";
  if (score >= 90) grade = "A+";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B";

  return { score, grade };
}

async function analyzeTicker(ticker) {
  const today = isoDate(new Date());
  const dailyFrom = daysAgo(330);
  const intradayFrom = daysAgo(30);

  const [daily, intraday] = await Promise.all([
    aggregates(ticker, 1, "day", dailyFrom, today),
    aggregates(ticker, 15, "minute", intradayFrom, today)
  ]);

  if (!daily.length) {
    throw new Error("No daily data returned. Check ticker or data subscription.");
  }

  const closes = daily.map(c => c.close);
  const price = closes.at(-1);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const poc = calculatePOC(intraday);

  const theme = THEMES[ticker] || { theme: "General Market", benchmark: "SPY" };

  let themeReturn1m = null;
  let themeBullish = false;

  try {
    const benchmarkDaily = await aggregates(theme.benchmark, 1, "day", daysAgo(90), today);
    themeReturn1m = percentReturn(benchmarkDaily, 21);
    themeBullish = themeReturn1m !== null && themeReturn1m > 0;
  } catch (error) {
    themeReturn1m = null;
    themeBullish = false;
  }

  const checks = {
    trend: bullishTrend(daily),
    above9: price > ema9,
    above21: price > ema21,
    pocAbove: poc ? poc > price : false,
    themeBullish
  };

  const result = setupScore(checks);

  return {
    ticker,
    price,
    changePercent: percentReturn(daily, 1),
    volume: daily.at(-1).volume,
    ema9,
    ema21,
    poc,
    theme: theme.theme,
    benchmark: theme.benchmark,
    themeReturn1m,
    checks,
    ...result,
    candles: daily.slice(-90).map(c => ({
      date: c.date.slice(0, 10),
      close: c.close,
      volume: c.volume
    })),
    updatedAt: new Date().toISOString()
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    hasPolygonKey: Boolean(POLYGON_API_KEY),
    watchlist: WATCHLIST
  });
});

app.get("/api/analyze", async (req, res) => {
  const tickers = req.query.tickers
    ? req.query.tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 25)
    : WATCHLIST;

  if (!POLYGON_API_KEY) {
    return res.status(400).json({
      error: "Missing POLYGON_API_KEY. Add it in Railway Variables.",
      watchlist: tickers
    });
  }

  const cacheKey = tickers.join(",");
  if (cache.data && cache.key === cacheKey && Date.now() - cache.time < CACHE_MS) {
    return res.json({ data: cache.data, cached: true, updatedAt: new Date(cache.time).toISOString() });
  }

  const results = await Promise.allSettled(tickers.map(analyzeTicker));
  const data = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      ticker: tickers[index],
      error: result.reason?.message || "Could not analyze ticker."
    };
  });

  cache = { key: cacheKey, time: Date.now(), data };
  res.json({ data, cached: false, updatedAt: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.listen(PORT, () => {
  console.log(`A+ Stock Scanner running on port ${PORT}`);
});
