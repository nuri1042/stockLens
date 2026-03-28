// Expo 개발 모드의 `expo/virtual/env`는 `.env*` 파일만 합치고, 점 없는 `env`는 읽지 않습니다.
// 그래서 Metro 기동 시 `env` → `.env` 로 복사해 EXPO_PUBLIC_* 가 클라이언트에 전달되게 합니다.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = __dirname;
const envPlainPath = path.join(root, 'env');
const dotEnvPath = path.join(root, '.env');

try {
  if (fs.existsSync(envPlainPath)) {
    fs.copyFileSync(envPlainPath, dotEnvPath);
  }
} catch (e) {
  console.warn('[metro.config] env → .env 복사 실패:', e?.message ?? e);
}

function loadEnvIntoProcess(fileName) {
  const p = path.join(root, fileName);
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvIntoProcess('.env');
loadEnvIntoProcess('env');

module.exports = getDefaultConfig(__dirname);
