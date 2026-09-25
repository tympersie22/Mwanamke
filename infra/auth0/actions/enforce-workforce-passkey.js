/**
 * Enrolls or challenges workforce users with phishing-resistant factors only.
 * This must execute before emit-workforce-amr.js in the post-login flow.
 */
exports.onExecutePostLogin = async (event, api) => {
  if (event.client?.metadata?.realm !== "workforce") return;

  if (event.user.email_verified !== true) {
    api.access.deny("Verify the invited workforce email before continuing.");
    return;
  }

  const accepted = new Set(["webauthn-platform", "webauthn-roaming"]);
  const enrolled = (event.user.enrolledFactors ?? [])
    .map((factor) => factor?.type)
    .filter((type) => accepted.has(type))
    .map((type) => ({ type }));

  if (enrolled.length > 0) {
    api.authentication.challengeWithAny(enrolled);
    return;
  }

  api.authentication.enrollWithAny([
    { type: "webauthn-platform" },
    { type: "webauthn-roaming" }
  ]);
};
