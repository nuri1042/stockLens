import { getPolygonApiKey } from '@/lib/env';

import type { StockRankingRow } from '@/lib/finnhub';

const BASE = 'https://api.polygon.io';

/** 인기 급상승은 무료 플랜에서 스냅샷 403 — `fetchFinnhubMarketUniverse` 등 Finnhub 사용 */
export type { StockRankingRow };

export class PolygonApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'PolygonApiError';
  }
}

type DayBar = {
  c?: number;
  v?: number;
};

type PolygonTickerSnapshot = {
  ticker?: string;
  day?: DayBar;
  min?: { c?: number; v?: number };
  prevDay?: DayBar;
  lastTrade?: { p?: number };
  todaysChangePerc?: number;
};

type SnapshotPage = {
  status?: string;
  tickers?: PolygonTickerSnapshot[];
  next_url?: string;
};

function ensureApiKeyOnUrl(url: string, apiKey: string): string {
  const u = new URL(url);
  if (!u.searchParams.has('apiKey')) {
    u.searchParams.set('apiKey', apiKey);
  }
  return u.toString();
}

function mapSnapshotToRow(t: PolygonTickerSnapshot): StockRankingRow | null {
  const raw = t.ticker?.trim();
  if (!raw) return null;
  // 옵션/복합 심볼 제외 (일반 주식 티커 위주)
  if (raw.includes(':')) return null;

  const symbol = raw.toUpperCase();
  const vol = t.day?.v ?? t.min?.v ?? t.prevDay?.v ?? 0;
  const price =
    t.day?.c ?? t.lastTrade?.p ?? t.prevDay?.c ?? 0;
  if (price <= 0 && vol <= 0) return null;

  return {
    symbol,
    name: symbol,
    volume: typeof vol === 'number' && Number.isFinite(vol) ? vol : 0,
    price: typeof price === 'number' && Number.isFinite(price) ? price : 0,
    changePercent:
      typeof t.todaysChangePerc === 'number' && Number.isFinite(t.todaysChangePerc)
        ? t.todaysChangePerc
        : 0,
  };
}

const MAX_SNAPSHOT_PAGES = 40;

/**
 * 미국 주식 전체 스냅샷(필요 시 next_url 페이지 순회) → 행 배열.
 * 정렬은 화면에서 거래량 / 등락(절대값) 모드로 나눕니다.
 */
export async function fetchUsStockSnapshotRows(): Promise<StockRankingRow[]> {
  const key = getPolygonApiKey();
  if (!key) {
    throw new PolygonApiError(
      'Polygon API 키가 없습니다. env에 EXPO_PUBLIC_POLYGON_API_KEY를 설정하세요.'
    );
  }

  const all: PolygonTickerSnapshot[] = [];
  let url: string | null = `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${encodeURIComponent(key)}`;
  let pages = 0;

  while (url && pages < MAX_SNAPSHOT_PAGES) {
    pages += 1;
    const res = await fetch(url);
    const text = await res.text();
    let data: SnapshotPage = {};
    if (text) {
      try {
        data = JSON.parse(text) as SnapshotPage;
      } catch {
        throw new PolygonApiError(`Polygon 응답 파싱 실패 (HTTP ${res.status})`, res.status);
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new PolygonApiError(
        'Polygon 인증/권한 오류입니다. API 키와 플랜(스냅샷 접근)을 확인하세요.',
        res.status
      );
    }
    if (res.status === 429) {
      throw new PolygonApiError(
        'Polygon 요청 한도(429)에 걸렸습니다. 잠시 후 다시 시도하세요.',
        429
      );
    }
    if (!res.ok) {
      const msg =
        (data as { message?: string; error?: string }).message ??
        (data as { error?: string }).error ??
        `HTTP ${res.status}`;
      throw new PolygonApiError(String(msg), res.status);
    }

    const st = data.status ?? '';
    if (st !== 'OK' && st !== 'DELAYED') {
      throw new PolygonApiError(`Polygon status: ${st || 'UNKNOWN'}`);
    }

    if (data.tickers?.length) {
      all.push(...data.tickers);
    }

    if (data.next_url) {
      url = ensureApiKeyOnUrl(data.next_url, key);
    } else {
      url = null;
    }
  }

  const rows: StockRankingRow[] = [];
  for (const t of all) {
    const row = mapSnapshotToRow(t);
    if (row && (row.volume > 0 || row.price > 0)) {
      rows.push(row);
    }
  }

  const bySymbol = new Map<string, StockRankingRow>();
  for (const row of rows) {
    const cur = bySymbol.get(row.symbol);
    if (!cur || row.volume > cur.volume) {
      bySymbol.set(row.symbol, row);
    }
  }
  return Array.from(bySymbol.values());
}
