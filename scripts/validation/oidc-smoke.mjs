// Requires the loopback test issuer, PostgreSQL API, and portal described in the evidence runbook.
import assert from 'node:assert/strict';
const origin = process.env.TEST_PORTAL_ORIGIN ?? 'http://127.0.0.1:3400';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('This harness is loopback-only');
let jar = new Map();
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'manual', headers: { ...options.headers,
    ...(new URL(url).origin === origin ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) } });
  if (new URL(url).origin === origin) for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const split = pair.indexOf('='); const name = pair.slice(0, split); const value = pair.slice(split + 1);
    if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
  return response;
}
async function begin(fault) {
  const response = await request(`${origin}/auth/login`); assert.equal(response.status, 303, 'Login must redirect');
  const authorization = new URL(response.headers.get('location'));
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('state')); assert.ok(authorization.searchParams.get('nonce'));
  if (fault) authorization.searchParams.set('fixture_fault', fault);
  const authorized = await request(authorization); assert.equal(authorized.status, 302);
  return new URL(authorized.headers.get('location'));
}
assert.equal((await request(`${origin}/api/care/me`)).status, 401);
const tampered = await begin(); tampered.searchParams.set('state', 'incorrect-state');
assert.match((await request(tampered)).headers.get('location'), /auth=failed/);
assert.equal((await request(`${origin}/api/care/me`)).status, 401);
console.log('PASS: anonymous access and state mismatch denied');
for (const fault of ['nonce', 'issuer', 'audience', 'expiry', 'signature']) {
  const badCallback = await begin(fault);
  assert.match((await request(badCallback)).headers.get('location'), /auth=failed/, `${fault} must fail`);
  assert.equal((await request(`${origin}/api/care/me`)).status, 401);
}
console.log('PASS: invalid nonce, issuer, audience, expiry and signature denied');
const callback = await begin();
const loggedIn = await request(callback); assert.equal(loggedIn.headers.get('location'), `${origin}/`);
const sessionCookie = loggedIn.headers.getSetCookie().find(value => value.startsWith('mwanamke-session='));
assert.ok(sessionCookie); assert.match(sessionCookie, /HttpOnly/i); assert.match(sessionCookie, /SameSite=lax/i);
const me = await request(`${origin}/api/care/me`); assert.equal(me.status, 200);
const dto = await me.json(); assert.ok(dto); assert.ok(!JSON.stringify(dto).includes('access_token'));
assert.equal((await request(`${origin}/api/care/providers`)).status, 200);
console.log('PASS: PKCE code exchange, signed token verification, durable API identity and directory');
const authenticatedJar = new Map(jar);
await request(callback); assert.equal((await request(`${origin}/api/care/me`)).status, 401);
console.log('PASS: callback replay does not create a new session');
jar = authenticatedJar;
assert.equal((await request(`${origin}/auth/logout`, { method: 'POST', headers: { Origin: 'https://invalid.example' } })).status, 403);
const logout = await request(`${origin}/auth/logout`, { method: 'POST', headers: { Origin: origin } });
assert.ok([200, 303].includes(logout.status));
assert.equal((await request(`${origin}/api/care/me`)).status, 401);
console.log('PASS: cross-origin logout denied; same-origin logout clears browser session');
console.log('Scope: local synthetic identity provider; no production vendor, revocation, device, or clinical acceptance claimed.');
