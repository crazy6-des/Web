const base = (process.env.SPHERE_API_BASE || 'https://sphere-api.binancecompany274.workers.dev').replace(/\/$/, '');
const frontendOrigins = (process.env.SPHERE_FRONTEND_ORIGINS || 'https://spheres.com.ng,https://sphereis.netlify.app').split(',').map(v => v.trim()).filter(Boolean);
const canonicalFrontend = process.env.SPHERE_CANONICAL_FRONTEND || 'https://spheres.com.ng';
const redirectFrontend = process.env.SPHERE_REDIRECT_FRONTEND || 'https://www.spheres.com.ng/';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `smoke-${stamp}@example.invalid`;
const username = `smoke_${stamp}`.replace(/[^a-z0-9_]/g, '').slice(0, 28);
const password = `Smoke-${stamp}-A9!`;
function cookieHeader(response) { return (response.headers.getSetCookie?.() || []).map(v => v.split(';', 1)[0]).join('; '); }
async function request(path, init = {}, cookies = '', origin = canonicalFrontend) {
  const headers = { 'content-type': 'application/json', ...(init.headers || {}) }; if (cookies) headers.cookie = cookies; if (origin) headers.origin = origin;
  const response = await fetch(`${base}${path}`, { ...init, headers }); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; } return { response, body };
}
const health = await request('/health', { headers: {} }, '', null);
if (!health.response.ok) throw new Error(`health failed: HTTP ${health.response.status} ${JSON.stringify(health.body)}`);
const redirect = await fetch(redirectFrontend, { redirect: 'manual' });
const location = redirect.headers.get('location') || '';
if (![301, 308].includes(redirect.status) || !location.startsWith(`${canonicalFrontend}/`)) throw new Error(`www redirect failed: HTTP ${redirect.status} location=${JSON.stringify(location)}`);
console.log(`redirect_ok=${redirectFrontend}->${location}`);
for (const frontendOrigin of frontendOrigins) {
  const cors = await fetch(`${base}/auth/session`, { method: 'OPTIONS', headers: { Origin: frontendOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  const allowOrigin = cors.headers.get('access-control-allow-origin'); const allowCredentials = cors.headers.get('access-control-allow-credentials');
  if (!cors.ok || allowOrigin !== frontendOrigin || allowCredentials !== 'true') throw new Error(`CORS preflight failed for ${frontendOrigin}: HTTP ${cors.status} allow-origin=${JSON.stringify(allowOrigin)} allow-credentials=${JSON.stringify(allowCredentials)}`);
  console.log(`cors_preflight_ok=${frontendOrigin}`);
}
const signup = await request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, username, password }) });
if (signup.response.status !== 201) throw new Error(`signup failed: HTTP ${signup.response.status} ${JSON.stringify(signup.body)}`);
const userId = signup.body?.user?.id; if (!userId) throw new Error(`signup returned no user id: ${JSON.stringify(signup.body)}`);
const signupAllowOrigin = signup.response.headers.get('access-control-allow-origin'); if (signupAllowOrigin !== canonicalFrontend) throw new Error(`signup CORS failed: ${JSON.stringify(signupAllowOrigin)}`);
const cookies = cookieHeader(signup.response); if (!cookies) throw new Error('signup returned no auth cookies');
const session = await request('/auth/session', {}, cookies); if (!session.response.ok || session.body?.user?.id !== userId) throw new Error(`session persistence failed: HTTP ${session.response.status} ${JSON.stringify(session.body)}`);
const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); if (login.response.status !== 200 || login.body?.user?.id !== userId) throw new Error(`login failed: HTTP ${login.response.status} ${JSON.stringify(login.body)}`);
const getChecks = [
  ['/me', body => body?.user?.id === userId], ['/feed?limit=50&offset=0&feed=forYou', body => Array.isArray(body?.posts)], ['/feed?limit=50&offset=0&feed=following', body => Array.isArray(body?.posts)], ['/feed?limit=50&offset=0&feed=trending', body => Array.isArray(body?.posts)], ['/posts?limit=50&offset=0', body => Array.isArray(body?.posts)], ['/messages/inbox', body => Array.isArray(body?.conversations)], ['/notifications', body => Array.isArray(body?.notifications)], ['/wallet', body => Array.isArray(body?.transactions)], ['/earn/offers', body => Array.isArray(body?.offers)], ['/settings', body => body?.settings !== undefined], ['/search?q=smoke&limit=5', body => Array.isArray(body?.users) && Array.isArray(body?.posts)],
];
for (const [path, valid] of getChecks) { const result = await request(path, {}, cookies); if (!result.response.ok || !valid(result.body)) throw new Error(`GET route failed: ${path} HTTP ${result.response.status} ${JSON.stringify(result.body)}`); if (result.response.headers.get('access-control-allow-origin') !== canonicalFrontend) throw new Error(`GET CORS failed: ${path}`); }
console.log(JSON.stringify({ ok: true, worker: base, canonicalFrontend, frontendOrigins, userId, username, checks: ['health', 'www-redirect-to-apex', 'cors-preflight-all-allowed-frontend-origins', 'signup-cors', 'signup-201', 'auth-cookies', 'session-roundtrip', 'login-200', 'authenticated-read-routes-with-cors'], authenticatedReadRoutes: getChecks.map(([path]) => path), cleanup: { userId } }, null, 2));
