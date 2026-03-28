const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName) {
  const p = path.join(__dirname, fileName);
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
    // 프로젝트 env 파일 값이 우선 (동일 키는 나중 파일이 덮어씀)
    process.env[key] = val;
  }
}

module.exports = ({ config }) => {
  loadEnvFile('.env');
  loadEnvFile('env'); // env 가 있으면 같은 키는 여기 값으로 덮어씀
  return {
    ...config,
    expo: {
      ...config.expo,
      extra: {
        ...(config.expo?.extra ?? {}),
        finnhubApiKey: process.env.EXPO_PUBLIC_FINNHUB_API_KEY ?? '',
        polygonApiKey: process.env.EXPO_PUBLIC_POLYGON_API_KEY ?? '',
      },
    },
  };
};
