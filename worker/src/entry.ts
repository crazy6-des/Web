import base from './final';
import { handleOffers } from './offers';
import { handleRewards } from './rewards';

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

async function handleTestAccount(env: any, req: Request) {
  const url = new URL(req.url);
  if (url.pathname !== '/__test/sphere-account') return null;

  const cors = testCors(env, req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return testJson({ error: 'Not found' }, 404, cors);

  // The route is inert unless an operator-only Cloudflare secret is configured.
  const configuredToken = String(env.TEST_ID_RETRIEVAL_TOKEN || '');
  const suppliedToken = req.headers.get('x-sphere-test-token') || '';
  if (!configuredToken || suppliedToken.length < 16 || suppliedToken !== configuredToken) {
    return testJson({ error: 'Not found' }, 404, cors);
  }

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const username = `sphere_test_${suffix}`;
  const email = `sphere-test-${suffix}@example.invalid`;
  const password = crypto.randomUUID().replace(/-/g, '') + 'Aa1!';

  // Reuse the real production signup path so the test account has the same schema,
  // password hashing, session handling and wallet initialization behavior as a user signup.
  const signup = await base.fetch(new Request(new URL('/auth/signup', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: env.FRONTEND_ORIGIN || '' },
    body: JSON.stringify({ username, email, password })
  }), env);

  let payload: any = null;
  try { payload = await signup.json(); } catch {}
  if (!signup.ok) {
    return testJson({ error: 'Test account creation failed', upstream_status: signup.status }, 502, cors);
  }

  const user = payload?.user || {};
  const id = String(user.id || user.user_id || '');
  if (!id) return testJson({ error: 'Test account was created but no user ID was returned' }, 502, cors);

  // Deliberately do not return or forward the generated password/session cookies.
  return testJson({ ok: true, test_account: { id, username, email } }, 201, cors);
}

export default {
  async fetch(req: Request, env: any) {
    const testAccount = await handleTestAccount(env, req);
    if (testAccount) return testAccount;
    const offers = await handleOffers(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (offers) return offers;
    const reward = await handleRewards(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (reward) return reward;
    return base.fetch(req, env);
  }
};
