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
    process.env[key] = val;
  }
}

module.exports = ({ config }) => {
  loadEnvFile('.env');
  loadEnvFile('env');
  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      kisProxyUrl: process.env.EXPO_PUBLIC_KIS_PROXY_URL ?? '',
    },
  };
};
