import { getFinnhubApiKey } from '@/lib/env';

const BASE = 'https://finnhub.io/api/v1';

/** 무료 티어 분당 60회 — 여유 두고 초과 방지 */
const FINNHUB_MAX_PER_MINUTE = 55;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let creditTokens = FINNHUB_MAX_PER_MINUTE;
let creditLastRefill = Date.now();
let creditChain: Promise<void> = Promise.resolve();

/**
 * 요청마다 토큰 1개 소모, 1분에 FINNHUB_MAX_PER_MINUTE까지 보충.
 * fetch 본문은 직렬이 아니라 동시에 여러 개 진행될 수 있어 체감 속도가 나아집니다.
 */
async function takeFinnhubCredit(): Promise<void> {
  const run = creditChain.then(async () => {
    for (;;) {
      const now = Date.now();
      const elapsed = now - creditLastRefill;
      creditTokens = Math.min(
        FINNHUB_MAX_PER_MINUTE,
        creditTokens + (elapsed * FINNHUB_MAX_PER_MINUTE) / 60_000
      );
      creditLastRefill = now;
      if (creditTokens >= 1) {
        creditTokens -= 1;
        return;
      }
      const need = 1 - creditTokens;
      const waitMs = Math.min(15_000, Math.ceil((need * 60_000) / FINNHUB_MAX_PER_MINUTE));
      await sleep(Math.max(waitMs, 50));
    }
  });
  creditChain = run.catch(() => {});
  await run;
}

export type FinnhubCandleResponse = {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
};

export type FinnhubQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  /** 당일 누적 거래량(있을 때만). 무료 플랜·응답에 따라 생략될 수 있음 */
  v?: number;
};

export type FinnhubProfile = {
  name?: string;
  ticker?: string;
};

export class FinnhubApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'FinnhubApiError';
  }
}

function buildUrl(path: string, params: Record<string, string>): string {
  const key = getFinnhubApiKey();
  const u = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  u.searchParams.set('token', key);
  return u.toString();
}

async function finnhubFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = getFinnhubApiKey();
  if (!key) {
    throw new FinnhubApiError('Finnhub API 키가 없습니다. env에 EXPO_PUBLIC_FINNHUB_API_KEY를 설정하세요.');
  }
  const url = buildUrl(path, params);

  await takeFinnhubCredit();

  let res = await fetch(url);
  let attempts = 0;
  while (res.status === 429 && attempts < 2) {
    attempts += 1;
    const ra = res.headers.get('Retry-After');
    const sec = ra ? parseInt(ra, 10) : NaN;
    const backoffMs = Number.isFinite(sec)
      ? Math.min(Math.max(sec * 1000, 5000), 60_000)
      : 15_000;
    await sleep(backoffMs);
    await takeFinnhubCredit();
    res = await fetch(url);
  }

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new FinnhubApiError(`Finnhub 응답을 해석할 수 없습니다 (HTTP ${res.status})`, res.status);
    }
  }
  const obj = data as { error?: string };

  if (res.status === 429) {
    throw new FinnhubApiError(
      '요청 한도에 도달했습니다(429). 잠시 후 다시 시도하세요.',
      429
    );
  }
  if (!res.ok) {
    const detail = obj?.error ? String(obj.error) : `HTTP ${res.status}`;
    throw new FinnhubApiError(
      res.status === 403
        ? `접근 거부(403): ${detail} — 무료 플랜에서는 일부 엔드포인트(예: 일봉 캔들)가 막혀 있을 수 있습니다.`
        : detail,
      res.status
    );
  }
  if (obj?.error) {
    throw new FinnhubApiError(String(obj.error));
  }
  return data as T;
}

/** 유료 플랜 `stock/candle` 비활성 — 재사용 시 아래 주석 해제 후 `fetchDailySnapshot`·`fetchFinnhubMarketUniverse`에 캔들 연동 */
/*
function mapDailyLastBar(json: FinnhubCandleResponse): {
  volume: number;
  close: number;
  changePercent: number;
} | null {
  if (json.s !== 'ok' || !json.t?.length) {
    return null;
  }
  const n = json.t.length;
  const vol = json.v[n - 1];
  const close = json.c[n - 1];
  const prev = n >= 2 ? json.c[n - 2] : undefined;
  if (vol == null || close == null) {
    return null;
  }
  let changePercent = 0;
  if (prev != null && prev !== 0) {
    changePercent = ((close - prev) / prev) * 100;
  }
  return { volume: vol, close, changePercent };
}

function mapIntradayVolume24h(json: FinnhubCandleResponse): {
  volume: number;
  close: number;
  changePercent: number;
} | null {
  if (json.s !== 'ok' || !json.t?.length) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - 86400;
  let vol = 0;
  let anyInWindow = false;
  for (let i = 0; i < json.t.length; i++) {
    if (json.t[i] >= cutoff) {
      vol += json.v[i] ?? 0;
      anyInWindow = true;
    }
  }
  if (!anyInWindow) {
    for (let i = 0; i < json.v.length; i++) {
      vol += json.v[i] ?? 0;
    }
  }
  const n = json.t.length;
  const close = json.c[n - 1];
  const prev = n >= 2 ? json.c[n - 2] : undefined;
  if (close == null) {
    return null;
  }
  let changePercent = 0;
  if (prev != null && prev !== 0) {
    changePercent = ((close - prev) / prev) * 100;
  }
  return { volume: vol, close, changePercent };
}

async function fetchCandleSnapshotOnly(symbol: string): Promise<{
  volume: number;
  close: number;
  changePercent: number;
} | null> {
  const now = Math.floor(Date.now() / 1000);
  const attempts: [string, number][] = [
    ['D', 365 * 24 * 3600],
    ['1', 2 * 24 * 3600],
    ['5', 5 * 24 * 3600],
  ];
  let saw403 = false;

  for (const [resolution, spanSec] of attempts) {
    try {
      const json = await finnhubFetch<FinnhubCandleResponse>('/stock/candle', {
        symbol,
        resolution,
        from: String(now - spanSec),
        to: String(now),
      });
      if (json.s !== 'ok' || !json.t?.length) {
        continue;
      }
      if (resolution === 'D') {
        const row = mapDailyLastBar(json);
        if (row) {
          return row;
        }
      } else {
        const row = mapIntradayVolume24h(json);
        if (row && row.volume > 0) {
          return row;
        }
      }
    } catch (e) {
      if (e instanceof FinnhubApiError && e.status === 403) {
        saw403 = true;
        continue;
      }
      throw e;
    }
  }

  if (saw403) {
    throw new FinnhubApiError(
      'stock/candle: 일봉(D)·1분·5분 모두 403 — 무료 플랜에서 캔들이 막혔을 수 있습니다. /quote 200 여부를 확인하세요.',
      403
    );
  }
  return null;
}
*/

/** 캔들 비활성 시 `/quote`만 사용 — 거래량은 응답에 v·volume 있을 때만 */
export async function fetchDailySnapshot(symbol: string): Promise<{
  symbol: string;
  volume: number;
  close: number;
  changePercent: number;
} | null> {
  const quote = await fetchQuote(symbol);
  if (!quote) {
    return null;
  }
  const close = quote.c > 0 ? quote.c : quote.pc;
  if (close <= 0) {
    return null;
  }
  const volume =
    typeof quote.v === 'number' && Number.isFinite(quote.v) && quote.v > 0 ? quote.v : 0;
  return { symbol, volume, close, changePercent: quote.dp };
}

export async function fetchQuote(symbol: string): Promise<FinnhubQuote | null> {
  const json = await finnhubFetch<FinnhubQuote & { volume?: number }>('/quote', { symbol });
  if (json == null || typeof json.c !== 'number') {
    return null;
  }
  const v =
    typeof json.v === 'number' && Number.isFinite(json.v)
      ? json.v
      : typeof json.volume === 'number' && Number.isFinite(json.volume)
        ? json.volume
        : undefined;
  return { ...json, v };
}

export async function fetchProfile(symbol: string): Promise<FinnhubProfile | null> {
  const json = await finnhubFetch<FinnhubProfile>('/stock/profile2', { symbol });
  if (!json?.name && !json?.ticker) {
    return null;
  }
  return json;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export type VolumeLeaderRow = {
  symbol: string;
  name: string;
  volume: number;
  price: number;
  changePercent: number;
};

export type VolumeRankingMode = 'volume' | 'volatility';

export type VolumeLeadersResult = {
  rows: VolumeLeaderRow[];
  ranking: VolumeRankingMode;
};

export const VOLUME_LEADERS_TOP = 10;

/** 유니버스 종목 — 캔들 비활성 시 quote 기준 거래량·등락 정렬, 상위 10개 */
export async function fetchVolumeLeaders(symbols: string[]): Promise<VolumeLeadersResult> {
  if (symbols.length === 0) {
    return { rows: [], ranking: 'volume' };
  }

  const snapshots = await mapWithConcurrency(symbols, 6, async (symbol) => {
    return fetchDailySnapshot(symbol);
  });

  const valid = snapshots.filter((s): s is NonNullable<(typeof snapshots)[number]> => s != null);
  valid.sort((a, b) => {
    if (b.volume !== a.volume) return b.volume - a.volume;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });

  const rows: VolumeLeaderRow[] = valid.slice(0, VOLUME_LEADERS_TOP).map((row) => ({
    symbol: row.symbol,
    name: row.symbol,
    volume: row.volume,
    price: row.close,
    changePercent: row.changePercent,
  }));

  return { rows, ranking: 'volume' };
}

/** 인기 급상승 탭용 — Polygon 스냅샷 무료 403 대체 */
export type StockRankingRow = {
  symbol: string;
  name: string;
  volume: number;
  price: number;
  changePercent: number;
};

export const FINNHUB_MARKET_RANKING_TOP = 10;

/** 유니버스 전체 quote 행 — 급상승/급하락 필터는 화면에서 적용 */
export async function fetchFinnhubMarketUniverse(symbols: string[]): Promise<StockRankingRow[]> {
  type PartialRow = Omit<StockRankingRow, 'name'>;

  const partial = (
    await mapWithConcurrency(symbols, 6, async (symbol) => {
      const quote = await fetchQuote(symbol);
      if (!quote) {
        return null;
      }
      const price = quote.c > 0 ? quote.c : quote.pc;
      if (price <= 0) {
        return null;
      }
      const volume =
        typeof quote.v === 'number' && Number.isFinite(quote.v) && quote.v > 0 ? quote.v : 0;

      return {
        symbol,
        volume,
        price,
        changePercent: quote.dp,
      } satisfies PartialRow;
    })
  ).filter((x): x is PartialRow => x != null);

  return partial.map((r) => ({
    symbol: r.symbol,
    name: r.symbol,
    volume: r.volume,
    price: r.price,
    changePercent: r.changePercent,
  }));
}

export async function enrichStockRankingRowNames(rows: StockRankingRow[]): Promise<void> {
  await mapWithConcurrency(rows, 4, async (row) => {
    try {
      const profile = await fetchProfile(row.symbol);
      if (profile?.name) {
        row.name = profile.name;
      }
    } catch {
      /* keep ticker */
    }
  });
}

export function pickTopSurge(rows: StockRankingRow[], limit: number): StockRankingRow[] {
  return rows
    .filter((r) => r.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}

export function pickTopPlunge(rows: StockRankingRow[], limit: number): StockRankingRow[] {
  return rows
    .filter((r) => r.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
}

export async function fetchWatchlistRows(symbols: string[]): Promise<
  {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  }[]
> {
  return mapWithConcurrency(symbols, 6, async (symbol) => {
    try {
      const quote = await fetchQuote(symbol);
      const profile = await fetchProfile(symbol);
      const price = quote?.c ?? 0;
      const changePercent = quote?.dp ?? 0;
      return {
        symbol,
        name: profile?.name ?? symbol,
        price,
        changePercent,
      };
    } catch {
      return { symbol, name: symbol, price: 0, changePercent: 0 };
    }
  });
}
