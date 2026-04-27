import { getKisProxyUrl } from '@/lib/env';

/** [국내주식] 순위분석 > 거래량순위 — 한 건당 출력 스키마 */
export type StockRankingRow = {
  symbol: string;
  name: string;
  volume: number;
  price: number;
  changePercent: number;
};

export class KisApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'KisApiError';
  }
}

export const KIS_VOLUME_RANK_MAX = 30;

function parseKisNumber(s: unknown): number {
  if (s == null) return 0;
  const t = String(s).trim().replace(/,/g, '');
  if (!t) return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

async function fetchProxyJson<T>(path: string): Promise<T> {
  const base = getKisProxyUrl();
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new KisApiError(`프록시 응답 파싱 실패 (HTTP ${res.status})`, res.status);
    }
  }
  if (!res.ok) {
    throw new KisApiError(String(body.message ?? `HTTP ${res.status}`), res.status);
  }
  return body as T;
}

/**
 * [국내주식] 순위분석 > 거래량순위
 * @see https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/quotations/volume-rank
 */
export async function fetchDomesticVolumeRank(): Promise<StockRankingRow[]> {
  const data = await fetchProxyJson<{ rows?: Array<Record<string, unknown>> }>('/api/kis/volume-rank');
  return (data.rows ?? [])
    .map((r) => {
      const symbol = String(r.symbol ?? '').trim();
      if (!symbol) return null;
      return {
        symbol,
        name: String(r.name ?? symbol).trim() || symbol,
        volume: parseKisNumber(r.volume),
        price: parseKisNumber(r.price),
        changePercent: parseKisNumber(r.changePercent),
      } satisfies StockRankingRow;
    })
    .filter((r): r is StockRankingRow => r != null);
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

/** [국내주식] 기본시세 > 주식현재가 시세 */
export async function fetchDomesticInquirePrice(symbol: string): Promise<{
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
} | null> {
  const code = symbol.replace(/\s/g, '').trim();
  if (!code) return null;
  const data = await fetchProxyJson<{ row?: Record<string, unknown> }>(
    `/api/kis/inquire-price?symbol=${encodeURIComponent(code)}`
  );
  const row = data.row;
  if (!row) return null;

  return {
    symbol: String(row.mksc_shrn_iscd ?? code).trim() || code,
    name: String(row.hts_kor_isnm ?? code).trim() || code,
    price: parseKisNumber(row.stck_prpr),
    changePercent: parseKisNumber(row.prdy_ctrt),
  };
}

export async function fetchWatchlistRows(symbols: string[]): Promise<
  {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  }[]
> {
  return mapWithConcurrency(symbols, 4, async (symbol) => {
    try {
      const row = await fetchDomesticInquirePrice(symbol);
      if (!row) {
        return { symbol: symbol.trim(), name: symbol.trim(), price: 0, changePercent: 0 };
      }
      return row;
    } catch {
      return { symbol: symbol.trim(), name: symbol.trim(), price: 0, changePercent: 0 };
    }
  });
}

export function hasKisCredentials(): boolean {
  return Boolean(getKisProxyUrl());
}
