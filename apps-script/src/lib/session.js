/**
 * Pure session logic — no GAS globals (PropertiesService/LockService) in here,
 * so it can run under plain Node/Jest. GAS-specific storage lives in
 * services/SessionStore.js, which calls into these functions.
 */

/**
 * Builds a new session record. `token` and `now` are injected so tests don't
 * depend on crypto.randomUUID()/Date being available or mockable globally.
 */
function buildSession(username, token, now) {
  return { username: String(username), token: String(token), createdAt: now };
}

/**
 * A request's token is valid only if a session exists and the token matches
 * exactly — a new login always replaces the old token, so this is enough to
 * reject a session that's been kicked out by a newer login elsewhere.
 */
function isSessionValid(activeSession, token) {
  if (!activeSession || !token) return false;
  return activeSession.token === String(token);
}

/**
 * A logout should only clear the session it belongs to — if it's already
 * been replaced by a newer login, logging out the old token must not affect
 * the new one.
 */
function shouldClearOnLogout(activeSession, token) {
  return isSessionValid(activeSession, token);
}

if (typeof module !== 'undefined') {
  module.exports = { buildSession, isSessionValid, shouldClearOnLogout };
}
