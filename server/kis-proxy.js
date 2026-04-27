const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.KIS_PROXY_PORT || 8787);
const KIS_REAL_BASE = 'https://openapi.koreainvestment.com:9443';
const KIS_PAPER_BASE = 'https://openapivts.koreainvestment.com:29443';

const KIS_APP_KEY = process.env.KIS_APP_KEY || process.env.EXPO_PUBLIC_KIS_APP_KEY || '';
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || process.env.EXPO_PUBLIC_KIS_APP_SECRET || '';
const KIS_BASE_URL = (
  process.env.KIS_BASE_URL ||
  process.env.EXPO_PUBLIC_KIS_BASE_URL ||
  (process.env.KIS_USE_PAPER === '1' || process.env.KIS_USE_PAPER === 'true'
    ? KIS_PAPER_BASE
    : KIS_REAL_BASE)
).replace(/\/$/, '');

let cachedToken = null;

function parseNum(value) {
  const t = String(value ?? '').trim().replace(/,/g, '');
  if (!t) return 0;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function ensureCredentials() {
  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    const e = new Error('KIS_APP_KEY / KIS_APP_SECRET이 설정되지 않았습니다.');
    e.status = 500;
    throw e;
  }
}

async function getAccessToken() {
  ensureCredentials();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });

  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      const e = new Error(`토큰 응답 파싱 실패 (HTTP ${res.status})`);
      e.status = res.status;
      throw e;
    }
  }
  if (!res.ok) {
    const e = new Error(body.msg1 || body.error_description || body.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  if (!body.access_token) {
    const e = new Error('access_token이 없습니다.');
    e.status = 500;
    throw e;
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 86400;
  cachedToken = {
    token: body.access_token,
    expiresAtMs: now + Math.max(60, expiresIn - 120) * 1000,
  };
  return cachedToken.token;
}

async function kisGet(path, trId, query) {
  const token = await getAccessToken();
  const url = new URL(`${KIS_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: trId,
      custtype: 'P',
    },
  });

  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      const e = new Error(`KIS 응답 파싱 실패 (HTTP ${res.status})`);
      e.status = res.status;
      throw e;
    }
  }
  if (String(body.rt_cd ?? '0') !== '0') {
    const e = new Error(body.msg1 || body.msg_cd || 'KIS API 오류');
    e.status = res.status || 400;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(body.msg1 || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return body;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, baseUrl: KIS_BASE_URL });
});

app.get('/api/kis/volume-rank', async (req, res) => {
  try {
    const body = await kisGet('/uapi/domestic-stock/v1/quotations/volume-rank', 'FHPST01710000', {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_COND_SCR_DIV_CODE: '20171',
      FID_INPUT_ISCD: '0000',
      FID_DIV_CLS_CODE: '0',
      FID_BLNG_CLS_CODE: '0',
      FID_TRGT_CLS_CODE: '111111111',
      FID_TRGT_EXLS_CLS_CODE: '0000000000',
      FID_INPUT_PRICE_1: '',
      FID_INPUT_PRICE_2: '',
      FID_VOL_CNT: '',
      FID_INPUT_DATE_1: '',
    });

    const output = Array.isArray(body.output)
      ? body.output
      : body.output && typeof body.output === 'object'
        ? [body.output]
        : [];
    const rows = output
      .map((r) => {
        const symbol = String(r.mksc_shrn_iscd ?? '').trim();
        if (!symbol) return null;
        return {
          symbol,
          name: String(r.hts_kor_isnm ?? symbol).trim() || symbol,
          volume: parseNum(r.acml_vol),
          price: parseNum(r.stck_prpr),
          changePercent: parseNum(r.prdy_ctrt),
        };
      })
      .filter(Boolean);

    res.json({ rows });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'volume-rank 호출 실패' });
  }
});

app.get('/api/kis/inquire-price', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim();
    if (!symbol) {
      return res.status(400).json({ message: 'symbol 쿼리가 필요합니다.' });
    }
    const body = await kisGet('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: symbol,
    });
    const out = body.output && typeof body.output === 'object' ? body.output : {};
    return res.json({
      row: {
        symbol: String(out.mksc_shrn_iscd ?? symbol).trim() || symbol,
        name: String(out.hts_kor_isnm ?? symbol).trim() || symbol,
        price: parseNum(out.stck_prpr),
        changePercent: parseNum(out.prdy_ctrt),
      },
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'inquire-price 호출 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`[kis-proxy] listening on http://localhost:${PORT}`);
});
