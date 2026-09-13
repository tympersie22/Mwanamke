// Local test fixture only. Ephemeral keys/users/codes; never deploy as an identity service.
import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

if (process.env.NODE_ENV === 'production') throw new Error('Test issuer is forbidden in production');
const port = Number(process.env.TEST_OIDC_PORT ?? 4401);
const issuer = `http://127.0.0.1:${port}`;
const redirectUri = process.env.TEST_OIDC_REDIRECT_URI ?? 'http://127.0.0.1:3400/auth/callback';
const redirect = new URL(redirectUri);
if (redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(redirect.hostname)) throw new Error('Only loopback redirect URIs allowed');
const clientId = 'mwanamke-local-validation';
const clients = new Map([[clientId, redirectUri], [`${clientId}-native`, `${redirect.origin}/native-callback`]]);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const { privateKey: untrustedKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'ephemeral-validation', use: 'sig', alg: 'RS256' };
const codes = new Map();
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function sign(claims, audience, fault, subject = 'synthetic-patient-validation') {
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(fault === 'issuer' ? `${issuer}/wrong` : issuer).setAudience(fault === 'audience' ? 'wrong-client' : audience).setSubject(subject)
    .setIssuedAt().setExpirationTime(fault === 'expiry' ? Math.floor(Date.now() / 1000) - 60 : '5m').sign(fault === 'signature' ? untrustedKey : privateKey);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, issuer);
    if (url.pathname === '/.well-known/openid-configuration') return json(res, 200, {
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: ['openid', 'profile'],
    });
    if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
    if (url.pathname === '/authorize') {
      const p = url.searchParams;
      if (!clients.has(p.get('client_id')) || p.get('redirect_uri') !== clients.get(p.get('client_id')) || p.get('response_type') !== 'code' ||
          p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge') || !p.get('state') || !p.get('nonce')) return json(res, 400, { error: 'invalid_request' });
      const code = randomBytes(32).toString('base64url');
      for (const [key, value] of codes) if (value.expires < Date.now()) codes.delete(key);
      const role = ['patient', 'provider', 'navigator', 'platform-admin'].includes(p.get('login_hint')) ? p.get('login_hint') : 'patient';
      codes.set(code, { clientId: p.get('client_id'), redirectUri: p.get('redirect_uri'), challenge: p.get('code_challenge'), nonce: p.get('nonce'), fault: p.get('fixture_fault'), role, expires: Date.now() + 60_000 });
      const target = new URL(p.get('redirect_uri')); target.searchParams.set('code', code); target.searchParams.set('state', p.get('state')); target.searchParams.set('iss', issuer);
      res.writeHead(302, { location: target.href, 'cache-control': 'no-store' }); return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16_384) return json(res, 413, { error: 'invalid_request' }); }
      const p = new URLSearchParams(body); const code = p.get('code'); const grant = codes.get(code); codes.delete(code);
      const actual = createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url');
      if (!grant || grant.expires < Date.now() || p.get('grant_type') !== 'authorization_code' || p.get('client_id') !== grant.clientId ||
          p.get('redirect_uri') !== grant.redirectUri || actual.length !== grant.challenge.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(grant.challenge))) return json(res, 400, { error: 'invalid_grant' });
      return json(res, 200, { token_type: 'Bearer', expires_in: 300,
        access_token: await sign({ roles: [grant.role], amr: ['pwd', 'mfa'] }, 'mwanamke-api', undefined, `synthetic-${grant.role}-validation`),
        id_token: await sign({ nonce: grant.fault === 'nonce' ? 'incorrect-nonce' : grant.nonce, amr: ['pwd', 'mfa'] }, grant.clientId, grant.fault, `synthetic-${grant.role}-validation`) });
    }
    return json(res, 404, { error: 'not_found' });
  } catch { return json(res, 500, { error: 'fixture_error' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`LOCAL TEST ISSUER ${issuer}; client ${clientId}; synthetic users only`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
