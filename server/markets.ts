import { ProviderError } from './providers.ts';
export const forexPairs = ['EUR-USD', 'GBP-USD', 'USD-JPY', 'USD-CHF', 'AUD-USD', 'USD-CAD', 'EUR-GBP'];
type Point = { date: string; value: number };
export function forecast(points: Point[], horizon = 5) {
  if (points.length < 40 || points.some(point => !Number.isFinite(point.value) || point.value <= 0)) throw new ProviderError('insufficient_market_data', 422);
  const returns = points.slice(1).map((point, index) => Math.log(point.value / points[index].value));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const price = points.at(-1)!.value;
  // Fixed zero-drift baseline; avoids fitting a spurious trend to a short series.
  const width = 1.96 * Math.sqrt(variance * horizon);
  let error = 0; let covered = 0; let evaluated = 0;
  for (let i = 30; i + horizon < points.length; i++) {
    const sample = returns.slice(Math.max(0, i - 30), i);
    const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
    const sd = Math.sqrt(sample.reduce((a, b) => a + (b - avg) ** 2, 0) / (sample.length - 1));
    const actual = points[i + horizon].value, prior = points[i].value;
    error += Math.abs(actual - prior) / actual;
    if (actual >= prior * Math.exp(-1.96 * sd * Math.sqrt(horizon)) && actual <= prior * Math.exp(1.96 * sd * Math.sqrt(horizon))) covered++;
    evaluated++;
  }
  return { method: 'Zero-drift log-return baseline', horizonObservations: horizon, central: price, lower: price * Math.exp(-width), upper: price * Math.exp(width), annualizedVolatility: Math.sqrt(variance * 252), approximateInterval: '95% under independent normal log-return assumptions; actual coverage may differ', backtest: { observations: evaluated, meanAbsolutePercentageError: evaluated ? error / evaluated : null, empiricalIntervalCoverage: evaluated ? covered / evaluated : null }, warning: 'Daily reference rates, not executable quotes. This experimental baseline is not a validated trading strategy. It excludes spreads, fees, leverage, news shocks and interest-rate effects.' };
}
const cache = new Map<string, { time: number; result: unknown }>();
export async function market(pair: string, signal: AbortSignal, transport = fetch) {
  if (!forexPairs.includes(pair)) throw new ProviderError('unsupported_forex_pair', 400);
  const cached = cache.get(pair); if (cached && Date.now() - cached.time < 300000) return cached.result;
  const [base, quote] = pair.split('-');
  const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v2/providers/ecb/rates?base=${base}&quotes=${quote}&from=${from}`;
  const response = await transport(url, { signal, redirect: 'error' });
  if (!response.ok) throw new ProviderError('market_data_unavailable');
  const data = await response.json();
  if (!Array.isArray(data)) throw new ProviderError('invalid_market_data');
  const points: Point[] = data.filter(row => row.base === base && row.quote === quote && typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && typeof row.rate === 'number').map(row => ({ date: row.date, value: row.rate })).sort((a, b) => a.date.localeCompare(b.date));
  const result = { pair, source: 'ECB via Frankfurter', sourceUrl: url, retrievedAt: new Date().toISOString(), latest: points.at(-1), points, forecast: forecast(points) };
  cache.set(pair, { time: Date.now(), result }); return result;
}
