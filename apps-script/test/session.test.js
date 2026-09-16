const { buildSession, isSessionValid, shouldClearOnLogout } = require('../src/lib/session');

describe('buildSession', () => {
  test('captures username, token, and creation time', () => {
    const session = buildSession('admin', 'tok-1', '2026-01-01T00:00:00.000Z');
    expect(session).toEqual({ username: 'admin', token: 'tok-1', createdAt: '2026-01-01T00:00:00.000Z' });
  });
});

describe('isSessionValid', () => {
  test('valid when token matches the active session', () => {
    const active = buildSession('admin', 'tok-1', 'now');
    expect(isSessionValid(active, 'tok-1')).toBe(true);
  });

  test('invalid when token was replaced by a newer login', () => {
    const active = buildSession('admin', 'tok-2', 'now');
    expect(isSessionValid(active, 'tok-1')).toBe(false);
  });

  test('invalid when there is no active session', () => {
    expect(isSessionValid(null, 'tok-1')).toBe(false);
  });

  test('invalid when no token is supplied', () => {
    const active = buildSession('admin', 'tok-1', 'now');
    expect(isSessionValid(active, null)).toBe(false);
  });
});

describe('shouldClearOnLogout', () => {
  test('clears when logging out the currently active session', () => {
    const active = buildSession('admin', 'tok-1', 'now');
    expect(shouldClearOnLogout(active, 'tok-1')).toBe(true);
  });

  test('does not clear a newer session when an old token logs out', () => {
    // PC A logs out after PC B already logged in and replaced the session.
    const active = buildSession('admin', 'tok-2', 'now');
    expect(shouldClearOnLogout(active, 'tok-1')).toBe(false);
  });
});
