const { test } = require('node:test');
const assert = require('node:assert/strict');
const enforce = require('./enforce-workforce-passkey.js').onExecutePostLogin;
const emit = require('./require-workforce-passkey.js').onExecutePostLogin;

function context(overrides = {}) {
  const calls = [];
  const event = { client: { metadata: { realm: 'workforce' } }, user: { email: 'invited@example.test', email_verified: true, enrolledFactors: [] }, ...overrides };
  const api = {
    access: { deny: reason => calls.push(['deny', reason]) },
    authentication: { challengeWithAny: factors => calls.push(['challenge', factors]), enrollWithAny: factors => calls.push(['enroll', factors]) },
    accessToken: { setCustomClaim: (name, value) => calls.push(['access', name, value]) },
    idToken: { setCustomClaim: (name, value) => calls.push(['id', name, value]) }
  };
  return { calls, event, api };
}

test('unverified workforce identities cannot enroll', async () => {
  const c = context({ user: { email_verified: false } });
  await enforce(c.event, c.api);
  assert.deepEqual(c.calls.map(call => call[0]), ['deny']);
});
test('first login enrolls only phishing-resistant factors', async () => {
  const c = context();
  await enforce(c.event, c.api);
  assert.deepEqual(c.calls, [['enroll', [{ type: 'webauthn-platform' }, { type: 'webauthn-roaming' }]]]);
});
test('staff cannot choose a weaker enrolled factor', async () => {
  const c = context();
  c.event.user.enrolledFactors = [{ type: 'otp' }, { type: 'webauthn-roaming' }];
  await enforce(c.event, c.api);
  assert.deepEqual(c.calls, [['challenge', [{ type: 'webauthn-roaming' }]]]);
});
test('generic MFA, OTP and recovery codes cannot produce staff claims', async () => {
  for (const type of [undefined, 'otp', 'recovery-code']) {
    const c = context({ authentication: { methods: [{ name: 'mfa', type }] } });
    await emit(c.event, c.api);
    assert.deepEqual(c.calls.map(call => call[0]), ['deny']);
  }
});
test('verified WebAuthn emits invitation identity and authentication claims', async () => {
  const c = context({ authentication: { methods: [{ name: 'pwd' }, { name: 'mfa', type: 'webauthn-roaming' }] } });
  await emit(c.event, c.api);
  assert.ok(c.calls.some(call => call[0] === 'access' && call[1] === 'https://mwanamke.africa/amr' && call[2][0] === 'webauthn-roaming'));
  assert.ok(c.calls.some(call => call[1] === 'https://mwanamke.africa/email_verified' && call[2] === true));
});
