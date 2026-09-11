const base = (process.env.SPHERE_API_BASE || 'https://sphere-api.binancecompany274.workers.dev').replace(/\/$/, '');
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `smoke-${stamp}@example.invalid`;
const username = `smoke_${stamp}`.replace(/[^a-z0-9_]/g, '').slice(0, 28);
const password = `Smoke-${stamp}-A9!`;

function cookieHeader(response) {
  return (response.headers.getSetCookie?.() || [])
    .map(v => v.split(';', 1)[0])
    .join('; ');
}

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { response, body };
}

const health = await request('/health', { headers: {} });
if (!health.response.ok) throw new Error(`health failed: HTTP ${health.response.status} ${JSON.stringify(health.body)}`);

const signup = await request('/auth/signup', {
  method: 'POST',
  body: JSON.stringify({ email, username, password }),
});
if (signup.response.status !== 201) {
  throw new Error(`signup failed: HTTP ${signup.response.status} ${JSON.stringify(signup.body)}`);
}
const userId = signup.body?.user?.id;
if (!userId) throw new Error(`signup returned no user id: ${JSON.stringify(signup.body)}`);

const cookies = cookieHeader(signup.response);
if (!cookies) throw new Error('signup returned no auth cookies');

const session = await request('/auth/session', {
  headers: { cookie: cookies },
});
if (!session.response.ok || session.body?.user?.id !== userId) {
  throw new Error(`session persistence failed: HTTP ${session.response.status} ${JSON.stringify(session.body)}`);
}

console.log(JSON.stringify({
  ok: true,
  worker: base,
  userId,
  username,
  checks: ['health', 'signup-201', 'auth-cookies', 'session-roundtrip'],
  cleanup: { userId },
}, null, 2));
