import { createHmac } from 'node:crypto';

const base = process.env.CPAGRIP_TEST_URL || 'http://127.0.0.1:8787';
const secret = 'cpagrip-isolated-test-secret';
const jwtSecret = 'cpagrip-isolated-test-jwt';
const tracking = 'cpagrip-isolated-user';
const offer = 'isolated-offer-420';

const b64url = (value) => Buffer.from(value).toString('base64url');
const accessToken = (() => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: tracking, sid: 'cpagrip-isolated-session', typ: 'access', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const input = `${header}.${payload}`;
  const signature = createHmac('sha256', jwtSecret).update(input).digest('base64url');
  return `${input}.${signature}`;
})();

async function request(path, options = {}) {
  const r = await fetch(`${base}${path}`, options);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

let r = await request('/api/earn/cpagrip/offerwall', {
  headers: { cookie: `sphere_access=${accessToken}` },
});
assert(r.status === 200 && r.body?.success === true, 'authenticated CPAGrip offerwall endpoint is available');
assert(r.body?.data?.trackingId === tracking, 'offerwall receives the logged-in Sphere user ID');
const expectedPrefix = 'https://quartzfiles.com/1912924';
assert(String(r.body?.data?.url || '').startsWith(expectedPrefix), 'offerwall URL uses the configured CPAGrip Smart Link');
assert(new URL(r.body.data.url).searchParams.get('tracking_id') === tracking, 'offerwall URL injects tracking_id for CPAGrip');

const validBody = new URLSearchParams({
  password: secret,
  payout: '4.20',
  offer_id: offer,
  tracking_id: tracking,
}).toString();

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: validBody,
});
assert(r.status === 200 && r.body?.ok === true && r.body?.duplicate === false, 'valid CPAGrip callback is accepted');
assert(Number(r.body.amount) === 3.15 && Number(r.body.balance_after) === 3.15, '75% user share is credited');

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: validBody,
});
assert(r.status === 200 && r.body?.duplicate === true, 'same callback is idempotently rejected as duplicate');

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(validBody)), password: 'wrong' }).toString(),
});
assert(r.status === 401, 'wrong password returns 401');

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: secret, payout: '1.00', offer_id: offer }).toString(),
});
assert(r.status === 400, 'missing tracking_id returns 400');

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: secret, payout: '1.00', tracking_id: tracking }).toString(),
});
assert(r.status === 400, 'missing offer_id returns 400');

r = await request('/api/earn/postback/cpagrip', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: secret, payout: 'not-a-number', offer_id: offer, tracking_id: tracking }).toString(),
});
assert(r.status === 400, 'invalid payout returns 400');

r = await request('/api/earn/postback/cpagrip', { method: 'GET' });
assert(r.status === 405, 'GET callback is rejected with 405');

console.log('CPAGrip isolated flow suite passed.');
