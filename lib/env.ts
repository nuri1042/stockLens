import Constants from 'expo-constants';

/** manifest / expoClient 안 어디에든 붙었을 수 있는 문자열 키 탐색 */
function findStringInTree(
  root: unknown,
  keys: string[],
  maxDepth = 12
): string {
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): string {
    if (depth > maxDepth || !node || typeof node !== 'object') return '';
    if (seen.has(node)) return '';
    seen.add(node);
    const o = node as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string' && v.trim().length > 0) {
        return v.trim();
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') {
        const found = walk(v, depth + 1);
        if (found) return found;
      }
    }
    return '';
  }

  return walk(root, 0);
}

/** expoConfig / manifest / manifest2 어디에든 붙을 수 있는 extra */
function readConfigExtra(): Record<string, unknown> {
  const expoConfig = Constants.expoConfig as { extra?: Record<string, unknown> } | null | undefined;
  if (expoConfig?.extra && typeof expoConfig.extra === 'object') {
    return expoConfig.extra;
  }
  const manifest = Constants.manifest as { extra?: Record<string, unknown> } | null;
  if (manifest?.extra && typeof manifest.extra === 'object') {
    return manifest.extra;
  }
  const m2 = Constants.manifest2 as {
    extra?: { expoClient?: { extra?: Record<string, unknown> } };
  } | null;
  const nested = m2?.extra?.expoClient?.extra;
  if (nested && typeof nested === 'object') {
    return nested;
  }
  return {};
}

function stringFromExtra(extra: Record<string, unknown>, key: string): string {
  const v = extra[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * 개발: babel이 process.env.EXPO_PUBLIC_* → expo/virtual/env 로 바꿉니다.
 * 그 모듈은 `.env` 등만 합치므로 metro.config에서 `env`→`.env` 동기화가 필요합니다.
 */
export function getFinnhubApiKey(): string {
  const extra = readConfigExtra();
  const fromExtra = stringFromExtra(extra, 'finnhubApiKey');
  if (fromExtra.length > 0) {
    return fromExtra;
  }
  const fromTree = findStringInTree(Constants.expoConfig, [
    'finnhubApiKey',
    'EXPO_PUBLIC_FINNHUB_API_KEY',
  ]);
  if (fromTree) return fromTree;
  const fromEnv = process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  return typeof fromEnv === 'string' ? fromEnv.trim() : '';
}

export function getPolygonApiKey(): string {
  const extra = readConfigExtra();
  const fromExtra = stringFromExtra(extra, 'polygonApiKey');
  if (fromExtra.length > 0) {
    return fromExtra;
  }
  const fromTree = findStringInTree(Constants.expoConfig, [
    'polygonApiKey',
    'EXPO_PUBLIC_POLYGON_API_KEY',
  ]);
  if (fromTree) return fromTree;
  const fromEnv = process.env.EXPO_PUBLIC_POLYGON_API_KEY;
  return typeof fromEnv === 'string' ? fromEnv.trim() : '';
}
