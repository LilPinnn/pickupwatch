const crypto = require('crypto');
const { verifyPassword } = require('../src/lib/auth');

const sha256 = str => crypto.createHash('sha256').update(str, 'utf8').digest('hex');

describe('verifyPassword', () => {
  test('accepts correct username and password', () => {
    const storedHash = sha256('correct-horse');
    expect(verifyPassword('admin', 'correct-horse', 'admin', storedHash, sha256)).toBe(true);
  });

  test('rejects wrong password', () => {
    const storedHash = sha256('correct-horse');
    expect(verifyPassword('admin', 'wrong', 'admin', storedHash, sha256)).toBe(false);
  });

  test('rejects wrong username', () => {
    const storedHash = sha256('correct-horse');
    expect(verifyPassword('bob', 'correct-horse', 'admin', storedHash, sha256)).toBe(false);
  });

  test('rejects when credentials are not configured', () => {
    expect(verifyPassword('admin', 'x', null, null, sha256)).toBe(false);
  });

  test('rejects empty username or password', () => {
    const storedHash = sha256('correct-horse');
    expect(verifyPassword('', 'correct-horse', 'admin', storedHash, sha256)).toBe(false);
    expect(verifyPassword('admin', '', 'admin', storedHash, sha256)).toBe(false);
  });
});
