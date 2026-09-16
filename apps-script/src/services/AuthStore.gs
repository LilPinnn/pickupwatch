/**
 * Credential check. Username/password hash live only in Script Properties
 * (never in the sheet, never sent back to the browser). Set them once via
 * the `setCredentials` helper below (run manually from the Apps Script
 * editor), or through the Script Properties UI.
 */

var AUTH_USERNAME_KEY = 'APP_USERNAME';
var AUTH_PASSWORD_HASH_KEY = 'APP_PASSWORD_HASH';

function AuthStore_hash(password) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function AuthStore_verify(username, password) {
  var props = PropertiesService.getScriptProperties();
  var storedUsername = props.getProperty(AUTH_USERNAME_KEY);
  var storedHash = props.getProperty(AUTH_PASSWORD_HASH_KEY);
  return verifyPassword(username, password, storedUsername, storedHash, AuthStore_hash);
}

/**
 * One-time setup: run this from the Apps Script editor (select the function,
 * click Run) to set/change the login credentials. Edit the values below
 * first, then run it once — don't leave the plaintext password in the file.
 */
function setCredentials() {
  var username = 'admin';
  var password = 'CHANGE_ME';

  var props = PropertiesService.getScriptProperties();
  props.setProperty(AUTH_USERNAME_KEY, username);
  props.setProperty(AUTH_PASSWORD_HASH_KEY, AuthStore_hash(password));
  Logger.log('Credentials set for username: ' + username);
}
