import type { RewardEnv } from './rewards';

type BaseFetch = (req: Request, env: RewardEnv) => Promise<Response>;

const text = (v: unknown) => String(v ?? '').trim();
const clean = (v: unknown, max = 2000) => text(v).slice(0, max);
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
};
const cors = (env: RewardEnv, req: Request) => {
  const h = new Headers();
  const origin = req.headers.get('Origin');
  const allowed = (env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-credentials', 'true');
    h.set('vary', 'Origin');
  }
  h.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type,x-sphere-signature,x-sphere-timestamp,idempotency-key');
  return h;
};

async function currentUserId(env: RewardEnv, req: Request, base: BaseFetch) {
  const r = await base(new Request(new URL('/auth/session', req.url), { headers: req.headers }), env);
  if (!r.ok) return null;
  const body = await r.json().catch(() => null) as any;
  return body?.user?.id ? text(body.user.id) : null;
}

async function cpalead(env: RewardEnv, req: Request, userId: string) {
  const publisher = text(env.CPALEAD_PUBLISHER_ID);
  if (!publisher) return json({ success: true, offers: [], providers: [], reason: 'CPAlead is not configured' }, 200, cors(env, req));

  const url = new URL('https://www.cpalead.com/api/offers');
  url.searchParams.set('id', publisher);
  url.searchParams.set('country', 'user');
  url.searchParams.set('device', 'user');
  url.searchParams.set('subid', userId);
  url.searchParams.set('limit', '100');
  url.searchParams.set('fields', 'id,title,description,conversion,device,link,amount,payout_currency,payout_type,countries,creatives,offer_rank,events');

  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await r.json().catch(() => null) as any;
    if (!r.ok || !body || !Array.isArray(body.offers)) {
      return json({ success: false, offers: [], error: 'CPAlead Offers API returned an invalid response' }, 502, cors(env, req));
    }
    const offers = body.offers.map((o: any) => ({
      id: clean(o.id, 100),
      title: clean(o.title, 200),
      description: clean(o.description, 1000),
      conversion: clean(o.conversion, 500),
      device: clean(o.device, 50),
      link: clean(o.link, 2000),
      amount: Number(o.amount || 0),
      payout_currency: clean(o.payout_currency || 'USD', 16).toUpperCase(),
      payout_type: clean(o.payout_type, 32),
      countries: Array.isArray(o.countries) ? o.countries.slice(0, 100) : [],
      image: clean(o.creatives?.url, 2000),
      offer_rank: Number(o.offer_rank || 0),
      events: Array.isArray(o.events) ? o.events : []
    })).filter((o: any) => o.id && o.link && Number.isFinite(o.amount) && o.amount >= 0);

    return json({ success: true, offers, providers: [{ id: 'cpalead', name: 'CPAlead', count: offers.length }], country: body.country ?? null }, 200, cors(env, req));
  } catch {
    return json({ success: false, offers: [], error: 'CPAlead Offers API is unreachable' }, 502, cors(env, req));
  }
}

export async function handleOffers(env: RewardEnv, req: Request, base: BaseFetch) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  if (path !== '/earn/offers' || req.method !== 'GET') return null;
  const userId = await currentUserId(env, req, base);
  if (!userId) return json({ success: false, offers: [], error: 'Authentication required' }, 401, cors(env, req));
  return cpalead(env, req, userId);
}
