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

/** 프런트가 호출할 로컬 프록시 서버 URL */
export function getKisProxyUrl(): string {
  const extra = readConfigExtra();
  const fromExtra = stringFromExtra(extra, 'kisProxyUrl');
  if (fromExtra) return fromExtra.replace(/\/$/, '');
  const fromTree = findStringInTree(Constants.expoConfig, [
    'kisProxyUrl',
    'EXPO_PUBLIC_KIS_PROXY_URL',
  ]);
  if (fromTree) return fromTree.replace(/\/$/, '');
  const fromEnv = process.env.EXPO_PUBLIC_KIS_PROXY_URL;
  return typeof fromEnv === 'string' && fromEnv.trim()
    ? fromEnv.trim().replace(/\/$/, '')
    : 'http://localhost:8787';
}
