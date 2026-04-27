import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'stocklens:favorites';

function normalizeSymbols(symbols: string[]): string[] {
  const unique = new Set<string>();
  for (const symbol of symbols) {
    const normalized = symbol.trim().toUpperCase();
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

export async function getFavoriteSymbols(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeSymbols(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return [];
  }
}

export async function setFavoriteSymbols(symbols: string[]): Promise<string[]> {
  const normalized = normalizeSymbols(symbols);
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function toggleFavoriteSymbol(symbol: string): Promise<string[]> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return getFavoriteSymbols();
  const current = await getFavoriteSymbols();
  if (current.includes(normalized)) {
    return setFavoriteSymbols(current.filter((s) => s !== normalized));
  }
  return setFavoriteSymbols([...current, normalized]);
}
