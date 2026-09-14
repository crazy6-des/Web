import base from './final';
import { handleOffers } from './offers';
import { handleRewards, type RewardEnv } from './rewards';

const testCors = (env: any, req: Request) => {
  const h = new Headers();
  const origin = req.headers.get('Origin');
  const allowed = (env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-credentials', 'false');
    h.set('vary', 'Origin');
  }
  h.set('access-control-allow-methods', 'POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type,x-sphere-test-token');
  return h;
};

const testJson = (data: unknown, status = 200, headers: HeadersInit = {}) => {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
};

async function normalizeCpaLeadRecipient(env: RewardEnv, req: Request) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const callback = path === '/api/earn/postback/cpalead' || path === '/api/cpal_postback' || path === '/rewards/cpalead/postback';
  if (!callback) return req;
  let uid = '';
  let password = '';
  let bodyText = '';
  if (req.method === 'GET') {
    const url = new URL(req.url);
    uid = String(url.searchParams.get('subid') || url.searchParams.get('sub_id') || url.searchParams.get('user_id') || '').trim();
    password = String(url.searchParams.get('password') || '').trim();
  } else if (req.method === 'POST') {
    bodyText = await req.clone().text();
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { const b = JSON.parse(bodyText) as Record<string, unknown>; uid = String(b.subid || b.sub_id || b.user_id || '').trim(); password = String(b.password || '').trim(); } catch {}
    } else {
      const b = new URLSearchParams(bodyText);
      uid = String(b.get('subid') || b.get('sub_id') || b.get('user_id') || '').trim();
      password = String(b.get('password') || '').trim();
    }
  }
  if (!uid || !env.CPALEAD_POSTBACK_PASSWORD || password !== String(env.CPALEAD_POSTBACK_PASSWORD)) return req;
  try {
    const columns = await env.DB.prepare('PRAGMA table_info("users")').all<Record<string, unknown>>();
    const names = new Set((columns.results || []).map((x: Record<string, unknown>) => String(x.name || '')));
    const idCol = ['id', 'user_id'].find((x) => names.has(x));
    const emailCol = ['email', 'email_address'].find((x) => names.has(x));
    const usernameCol = ['username', 'handle', 'name'].find((x) => names.has(x));
    if (!idCol) return req;
    const recipient = uid.startsWith('@') ? uid.slice(1) : uid;
    const clauses = [`"${idCol}"=?`];
    const args: unknown[] = [uid];
    if (emailCol) { clauses.push(`lower("${emailCol}")=lower(?)`); args.push(recipient); }
    if (usernameCol) { clauses.push(`lower("${usernameCol}")=lower(?)`); args.push(recipient); }
    const row = await env.DB.prepare(`SELECT "${idCol}" AS id FROM users WHERE ${clauses.join(' OR ')} LIMIT 1`).bind(...args).first<{ id?: unknown }>();
    const canonical = String(row?.id || '').trim();
    if (!canonical || canonical === uid) return req;
    if (req.method === 'GET') { const url = new URL(req.url); url.searchParams.set('subid', canonical); return new Request(url.toString(), req); }
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) { const b = JSON.parse(bodyText) as Record<string, unknown>; b.subid = canonical; return new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(b) }); }
    const b = new URLSearchParams(bodyText); b.set('subid', canonical); return new Request(req.url, { method: req.method, headers: req.headers, body: b.toString() });
  } catch { return req; }
}

async function cpagripFingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function handleCpagripIsolated(env: RewardEnv, req: Request) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const callback = path === '/api/earn/postback/cpagrip' || path === '/rewards/cpagrip/postback';
  if (!callback) return null;
  const cors = testCors(env, req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return testJson({ success: false, error: 'CPAGrip postback requires POST' }, 405, cors);
  const contentType = req.headers.get('content-type') || '';
  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    payload = contentType.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch { return testJson({ success: false, error: 'Invalid CPAGrip postback payload' }, 400, cors); }
  const secret = String(env.CPAGRIP_POSTBACK_SECRET || '').trim();
  const mode = String(env.CPAGRIP_POSTBACK_MODE || '').trim().toLowerCase();
  const password = String(payload.password || '').trim();
  const trackingId = String(payload.tracking_id || '').trim();
  const offerId = String(payload.offer_id || '').trim();
  const payout = Number(payload.payout);
  if (!secret || mode !== 'secret' || !password || password !== secret) return testJson({ success: false, error: 'Invalid CPAGrip postback' }, 401, cors);
  if (!trackingId || !offerId || !Number.isFinite(payout) || payout <= 0) return testJson({ success: false, error: 'Invalid CPAGrip postback payload' }, 400, cors);
  // CPAGrip's documented Global Postback variables do not include a unique conversion ID.
  // Isolated validation therefore uses a short-lived deterministic fingerprint: retries in
  // the same 10-minute window are duplicates, while later completions remain creditable.
  const bucket = Math.floor(Date.now() / 600000);
  const fingerprint = await cpagripFingerprint(`${trackingId}\n${offerId}\n${payout}\n${bucket}`);
  const eventId = `cpagrip:${fingerprint}`;
  const share = Math.min(100, Math.max(1, Number(env.REWARD_USER_SHARE_PERCENT || 75)));
  const amount = Math.round(payout * share) / 100;
  const internal = JSON.stringify({ event_id: eventId, user_id: trackingId, amount, offer_id: offerId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${internal}`));
  const signature = btoa(String.fromCharCode(...new Uint8Array(mac))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const bridge = await base.fetch(new Request(new URL('/rewards/cpagrip/postback', req.url), { method: 'POST', headers: { 'content-type': 'application/json', 'x-sphere-timestamp': timestamp, 'x-sphere-signature': signature }, body: internal }), env);
  const result = await bridge.json().catch(() => null);
  return testJson({ provider: 'cpagrip', ...((result && typeof result === 'object') ? result : { ok: bridge.ok }) }, bridge.status, cors);
}

async function handleTestAccount(env: any, req: Request) {
  const url = new URL(req.url);
  if (url.pathname !== '/__test/sphere-account') return null;
  const cors = testCors(env, req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return testJson({ error: 'Not found' }, 404, cors);
  const configuredToken = String(env.TEST_ID_RETRIEVAL_TOKEN || '');
  const suppliedToken = req.headers.get('x-sphere-test-token') || '';
  if (!configuredToken || suppliedToken.length < 16 || suppliedToken !== configuredToken) return testJson({ error: 'Not found' }, 404, cors);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const username = `sphere_test_${suffix}`;
  const email = `sphere-test-${suffix}@example.invalid`;
  const password = crypto.randomUUID().replace(/-/g, '') + 'Aa1!';
  const signup = await base.fetch(new Request(new URL('/auth/signup', url), { method: 'POST', headers: { 'content-type': 'application/json', origin: env.FRONTEND_ORIGIN || '' }, body: JSON.stringify({ username, email, password }) }), env);
  let payload: any = null;
  try { payload = await signup.json(); } catch {}
  if (!signup.ok) return testJson({ error: 'Test account creation failed', upstream_status: signup.status }, 502, cors);
  const user = payload?.user || {};
  const id = String(user.id || user.user_id || '');
  if (!id) return testJson({ error: 'Test account was created but no user ID was returned' }, 502, cors);
  return testJson({ ok: true, test_account: { id, username, email } }, 201, cors);
}

export default {
  async fetch(req: Request, env: any) {
    const testAccount = await handleTestAccount(env, req);
    if (testAccount) return testAccount;
    const offers = await handleOffers(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (offers) return offers;
    const cpagrip = await handleCpagripIsolated(env, req);
    if (cpagrip) return cpagrip;
    const reward = await handleRewards(env, await normalizeCpaLeadRecipient(env, req), (request, innerEnv) => base.fetch(request, innerEnv));
    if (reward) return reward;
    return base.fetch(req, env);
  }
};
