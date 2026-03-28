/** 관심종목 심볼 — 가격·이름은 Finnhub에서 조회 */
export const WATCHLIST_SYMBOLS: string[] = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN'];

export type WatchlistItem = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
};
