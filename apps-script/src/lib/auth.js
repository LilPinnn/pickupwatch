/**
 * Pure auth logic — password hashing/verification with the actual digest
 * function injected, so tests can pass Node's crypto instead of GAS's
 * Utilities.computeDigest.
 */

function verifyPassword(username, password, storedUsername, storedHash, hashFn) {
  if (!username || !password || !storedUsername || !storedHash) return false;
  if (String(username) !== String(storedUsername)) return false;
  const inputHash = hashFn(String(password));
  return inputHash === String(storedHash);
}

if (typeof module !== 'undefined') {
  module.exports = { verifyPassword };
}
