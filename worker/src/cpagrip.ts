import type { RewardEnv } from './rewards';

export interface CpagripEnv extends RewardEnv {
  CPAGRIP_OFFERWALL_URL?: string;
  CPAGRIP_PUBLISHER_ID?: string;
  FRONTEND_ORIGIN?: string;
}

type BaseFetch = (req: Request, env: CpagripEnv) => Promise<Response>;

const text = (v: unknown) => String(v ?? '').trim();

function cors(env: CpagripEnv, req: Request) {
  const h = new Headers();
  const origin = req.headers.get('Origin');
  const allowed = (env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-credentials', 'true');
    h.set('vary', 'Origin');
  }
  h.set('access-control-allow-methods', 'GET,OPTIONS');
  h.set('access-control-allow-headers', 'content-type');
  return h;
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) => {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
};

async function currentUserId(env: CpagripEnv, req: Request, base: BaseFetch) {
  const r = await base(new Request(new URL('/auth/session', req.url), { method: 'GET', headers: req.headers }), env);
  if (!r.ok) return null;
  const body = await r.json().catch(() => null) as any;
  return body?.user?.id ? text(body.user.id) : null;
}

export function buildCpagripOfferwallUrl(baseUrl: string, trackingId: string) {
  const url = new URL(baseUrl);
  url.searchParams.set('tracking_id', trackingId);
  return url.toString();
}

function isScriptInclude(url: string) {
  try {
    return new URL(url).pathname.endsWith('/script_include.php');
  } catch {
    return false;
  }
}

function buildScriptWrapperUrl(env: CpagripEnv, req: Request, trackingId: string) {
  const origin = text(env.FRONTEND_ORIGIN).split(',')[0].trim();
  if (!origin) return null;
  try {
    const wrapper = new URL('/cpagrip.html', origin);
    wrapper.searchParams.set('tracking_id', trackingId);
    return wrapper.toString();
  } catch {
    return null;
  }
}

export async function handleCpagripOfferwall(env: CpagripEnv, req: Request, base: BaseFetch) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  if (path !== '/api/earn/cpagrip/offerwall') return null;
  const headers = cors(env, req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405, headers);

  const configuredUrl = text(env.CPAGRIP_OFFERWALL_URL);
  if (!configuredUrl) return json({ success: false, error: 'CPAGrip offerwall is not configured' }, 503, headers);

  let baseUrl: string;
  try {
    baseUrl = new URL(configuredUrl).toString();
  } catch {
    return json({ success: false, error: 'CPAGrip offerwall configuration is invalid' }, 503, headers);
  }

  const userId = await currentUserId(env, req, base);
  if (!userId) return json({ success: false, error: 'Authentication required' }, 401, headers);

  const wrapperUrl = isScriptInclude(baseUrl) ? buildScriptWrapperUrl(env, req, userId) : null;
  const destinationUrl = wrapperUrl || buildCpagripOfferwallUrl(baseUrl, userId);

  return json({
    success: true,
    data: {
      provider: 'cpagrip',
      publisherId: text(env.CPAGRIP_PUBLISHER_ID) || null,
      trackingId: userId,
      url: destinationUrl,
      mode: wrapperUrl ? 'script-wrapper' : 'redirect',
    },
  }, 200, headers);
}