/**
 * Auth0 Workforce tenant, post-login Action.
 * Deploy only in the workforce tenant and bind it to the workforce applications.
 * The API independently verifies the signed token and repeats the phishing-resistant check.
 */
exports.onExecutePostLogin = async (event, api) => {
  const methods = (event.authentication?.methods ?? []).flatMap((method) => [method.name, method.type]).filter(Boolean).map(String);
  const accepted = new Set(["passkey", "webauthn", "webauthn-platform", "webauthn-roaming", "fido2", "hwk"]);
  if (!methods.some((method) => accepted.has(method.toLowerCase()))) {
    api.access.deny("A MWANAMKE workforce account must use a phishing-resistant passkey or security key.");
    return;
  }

  const claim = "https://mwanamke.africa/amr";
  api.idToken.setCustomClaim(claim, methods);
  api.accessToken.setCustomClaim(claim, methods);
};
