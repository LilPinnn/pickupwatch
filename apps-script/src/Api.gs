/**
 * Public entry points called from the client via google.script.run. Every
 * function here (other than login) is a session boundary: it must validate
 * the token server-side before doing anything, since hiding a button in the
 * browser is not access control.
 *
 * fetchAllStock in particular must validate *before* calling the Apple API,
 * writing logs, or updating ProductStatus — a session that's been replaced
 * by a newer login must not do any of those things.
 */

function login(username, password) {
  if (!AuthStore_verify(username, password)) {
    var err = new Error('Invalid username or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  var token = SessionStore_create(username);
  return { token: token, username: username };
}

function logout(token) {
  SessionStore_logout(token);
  return { ok: true };
}

function getConfig(token) {
  SessionStore_requireValid(token);
  return ConfigStore_get();
}

function saveConfig(token, config) {
  SessionStore_requireValid(token);
  return ConfigStore_save(config);
}

/**
 * Checks stock for every enabled product. Session is validated once up
 * front — if it fails, we never touch Apple's API, never write logs, and
 * never update lastFoundAt/lastUnfoundAt.
 */
function fetchAllStock(token, location, products) {
  SessionStore_requireValid(token);

  location = String(location || '10140').trim();
  if (!Array.isArray(products)) {
    products = ConfigStore_get().products;
  }

  var active = products.filter(function (p) { return p && p.enabled !== false && p.partNumber; });
  var nowStr = new Date().toISOString();

  var results = active.map(function (p) {
    var result = AppleClient_checkStock(p.partNumber, location);
    var history = computeHistoryUpdate(result, p, nowStr);
    p.lastFoundAt = history.lastFoundAt;
    p.lastUnfoundAt = history.lastUnfoundAt;

    var normalized = {
      id: p.id,
      productName: p.productName || p.partNumber,
      partNumber: p.partNumber,
      imageUrl: p.imageUrl || '',
      linkUrl: p.linkUrl || '',
      overlayText: p.overlayText || '',
      status: result.status,
      message: result.message || '',
      data: result.data || [],
      lastFoundAt: p.lastFoundAt || '',
      lastUnfoundAt: p.lastUnfoundAt || '',
      checkedAt: nowStr
    };

    LogStore_write(normalized, location);
    return normalized;
  });

  var savedConfig = ConfigStore_save({ location: location, products: products });

  return {
    success: true,
    checkedAt: nowStr,
    location: location,
    results: results,
    config: savedConfig
  };
}
