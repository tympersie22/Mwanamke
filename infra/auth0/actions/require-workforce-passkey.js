/**
 * Emits a namespaced authentication-method claim after the preceding Action's
 * phishing-resistant challenge. The API verifies this signed claim again.
 */
exports.onExecutePostLogin = async (event, api) => {
  if (event.client?.metadata?.realm !== "workforce") return;
  if (event.user.email_verified !== true || typeof event.user.email !== "string") {
    api.access.deny("A verified workforce email is required.");
    return;
  }

  const factors = (event.authentication?.methods ?? [])
    .filter((method) => method?.name === "mfa")
    .map((method) => String(method.type ?? "").toLowerCase());
  const accepted = new Set(["webauthn-platform", "webauthn-roaming"]);
  if (!factors.some((factor) => accepted.has(factor))) {
    api.access.deny("A MWANAMKE workforce account must use a phishing-resistant passkey or security key.");
    return;
  }

  const claim = "https://mwanamke.africa/amr";
  api.idToken.setCustomClaim(claim, factors);
  api.accessToken.setCustomClaim(claim, factors);
  api.accessToken.setCustomClaim("https://mwanamke.africa/email", event.user.email);
  api.accessToken.setCustomClaim("https://mwanamke.africa/email_verified", true);
};
