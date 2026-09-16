/**
 * GAS-specific session storage: one active session at a time, kept in Script
 * Properties (survives across executions/users, unlike CacheService which is
 * cheaper but not guaranteed to persist). LockService serializes login/logout
 * so two near-simultaneous logins can't both think they "won".
 *
 * All the actual replace/validate decisions live in lib/session.js so they
 * can be unit tested without GAS.
 */

var SESSION_PROP_KEY = 'ACTIVE_SESSION';
var SESSION_LOCK_WAIT_MS = 5000;

function SessionStore_read() {
  var raw = PropertiesService.getScriptProperties().getProperty(SESSION_PROP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function SessionStore_write(session) {
  PropertiesService.getScriptProperties().setProperty(SESSION_PROP_KEY, JSON.stringify(session));
}

function SessionStore_clear() {
  PropertiesService.getScriptProperties().deleteProperty(SESSION_PROP_KEY);
}

/**
 * Creates a new session for `username`, replacing whatever was active
 * before (that's the whole point — a new login always kicks the old one).
 * Returns the new session token.
 */
function SessionStore_create(username) {
  var lock = LockService.getScriptLock();
  lock.waitLock(SESSION_LOCK_WAIT_MS);
  try {
    var token = Utilities.getUuid();
    var session = buildSession(username, token, new Date().toISOString());
    SessionStore_write(session);
    return token;
  } finally {
    lock.releaseLock();
  }
}

/** Throws if `token` is not the currently active session. */
function SessionStore_requireValid(token) {
  var active = SessionStore_read();
  if (!isSessionValid(active, token)) {
    var err = new Error('SESSION_REPLACED');
    err.code = 'SESSION_REPLACED';
    throw err;
  }
  return active;
}

function SessionStore_logout(token) {
  var lock = LockService.getScriptLock();
  lock.waitLock(SESSION_LOCK_WAIT_MS);
  try {
    var active = SessionStore_read();
    if (shouldClearOnLogout(active, token)) {
      SessionStore_clear();
    }
  } finally {
    lock.releaseLock();
  }
}
