/**
 * Auth0 Workforce tenant, post-login Action.
 * Keep this separate from the passkey Action so either can be independently reviewed.
 */
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email_verified !== true) {
    api.access.deny("Verify the invited workforce email before continuing.");
  }
};
