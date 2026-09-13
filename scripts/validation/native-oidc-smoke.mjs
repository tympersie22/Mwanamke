import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
// Broker protocol verification with synthetic credentials; not OS secure-storage testing.
const portal = 'http://127.0.0.1:3400';
async function exchange(fault) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const parameters = new URLSearchParams({ client_id: 'mwanamke-local-validation-native', redirect_uri: `${portal}/native-callback`,
    response_type: 'code', scope: 'openid profile', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state, nonce });
  if (fault && fault !== 'verifier') parameters.set('fixture_fault', fault);
  const authorized = await fetch(`http://127.0.0.1:4401/authorize?${parameters}`, { redirect: 'manual' });
  assert.equal(authorized.status, 302);
  const code = new URL(authorized.headers.get('location')).searchParams.get('code');
  const body = JSON.stringify({ code, state, nonce, verifier: fault === 'verifier' ? randomBytes(32).toString('base64url') : verifier });
  const response = await fetch(`${portal}/auth/native`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return { response, body };
}
for (const fault of ['verifier', 'nonce', 'issuer', 'audience', 'expiry', 'signature']) {
  assert.equal((await exchange(fault)).response.status, 401, `Native ${fault} must be denied`);
}
const { response, body } = await exchange(); assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.getSetCookie().length, 0);
const session = await response.json(); assert.ok(session.expiresAt > Date.now()); assert.ok(session.expiresAt <= Date.now() + 900_000);
assert.equal((await fetch('http://127.0.0.1:4200/v1/me', { headers: { Authorization: `Bearer ${session.accessToken}` } })).status, 200);
assert.equal((await fetch(`${portal}/auth/native`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
console.log('PASS: native broker signed PKCE exchange and API identity; wrong verifier/nonce/issuer/audience/expiry/signature and replay denied; no browser session cookie.');
console.log('Scope: local broker protocol only; SecureStore, system browser, app links and installed release remain device gates.');
