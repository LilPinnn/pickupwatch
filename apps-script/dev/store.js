/**
 * Node-native stand-in for services/*.gs, backed by a JSON file instead of
 * PropertiesService/SpreadsheetApp/LockService. Uses the exact same
 * src/lib/*.js logic as production, so the session/auth/history rules under
 * test are the same ones running here.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { buildSession, isSessionValid, shouldClearOnLogout } = require('../src/lib/session');
const { verifyPassword } = require('../src/lib/auth');
const { buildAppleStockUrl, parseAppleStockResponse, computeHistoryUpdate } = require('../src/lib/stock');

const DATA_FILE = path.join(__dirname, '.devdata.json');
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin';

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      username: DEFAULT_USERNAME,
      passwordHash: sha256(DEFAULT_PASSWORD),
      activeSession: null,
      config: { location: '10140', products: [] },
      logs: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    console.log(`[dev] created ${DATA_FILE} — login with ${DEFAULT_USERNAME}/${DEFAULT_PASSWORD}`);
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// A lock isn't needed here — the dev server handles one request at a time
// (no concurrent request handlers touch this file), unlike the real
// LockService.getScriptLock() which guards against Apps Script's
// concurrent executions.
function login(username, password) {
  const data = loadData();
  if (!verifyPassword(username, password, data.username, data.passwordHash, sha256)) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  const token = crypto.randomUUID();
  data.activeSession = buildSession(username, token, new Date().toISOString());
  saveData(data);
  return { token, username };
}

function logout(token) {
  const data = loadData();
  if (shouldClearOnLogout(data.activeSession, token)) {
    data.activeSession = null;
    saveData(data);
  }
  return { ok: true };
}

function requireValidSession(token) {
  const data = loadData();
  if (!isSessionValid(data.activeSession, token)) {
    const err = new Error('SESSION_REPLACED');
    err.status = 401;
    throw err;
  }
  return data;
}

function getConfig(token) {
  return requireValidSession(token).config;
}

function saveConfig(token, config) {
  requireValidSession(token);
  if (!config || !Array.isArray(config.products)) {
    throw new Error('Invalid configuration.');
  }
  const data = loadData();
  data.config = {
    location: String(config.location || '10140').trim(),
    products: config.products
      .filter(p => String(p.partNumber || '').trim())
      .map(p => ({
        id: String(p.id || crypto.randomUUID()),
        productName: String(p.productName || ''),
        partNumber: String(p.partNumber || '').trim().toUpperCase(),
        imageUrl: String(p.imageUrl || ''),
        linkUrl: String(p.linkUrl || ''),
        overlayText: String(p.overlayText || ''),
        enabled: p.enabled !== false,
        lastFoundAt: String(p.lastFoundAt || ''),
        lastUnfoundAt: String(p.lastUnfoundAt || '')
      }))
  };
  saveData(data);
  return data.config;
}

// Set MOCK_APPLE=1 to skip real network calls to apple.com while iterating
// on the UI (also avoids tripping Apple's rate limiting during dev).
async function checkAppleStock(partNumber, location) {
  if (process.env.MOCK_APPLE === '1') {
    const available = Math.random() > 0.5;
    return {
      status: 'success',
      message: available ? 'พบข้อมูลสาขา 1 แห่ง' : 'API สำเร็จ แต่ไม่พบข้อมูลสาขาสำหรับ SKU นี้',
      rawStatus: 200,
      data: [{
        storeName: 'iStudio Siam Discovery (mock)',
        storeNumber: 'R999',
        isAvailable: available,
        pickupDisplay: available ? 'available' : 'unavailable',
        quote: available ? 'Ready for pickup' : 'ไม่มีข้อความระบุ'
      }]
    };
  }

  const url = buildAppleStockUrl(partNumber, location);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.apple.com/th/'
      }
    });
    const text = await response.text();
    return parseAppleStockResponse(partNumber, response.status, text);
  } catch (error) {
    return { status: 'error', message: error.message || String(error), rawStatus: '', data: [] };
  }
}

async function fetchAllStock(token, location, products) {
  requireValidSession(token);

  location = String(location || '10140').trim();
  const data = loadData();
  const sourceProducts = Array.isArray(products) ? products : data.config.products;
  const active = sourceProducts.filter(p => p && p.enabled !== false && p.partNumber);
  const nowStr = new Date().toISOString();

  const results = [];
  for (const p of active) {
    const result = await checkAppleStock(p.partNumber, location);
    const history = computeHistoryUpdate(result, p, nowStr);
    p.lastFoundAt = history.lastFoundAt;
    p.lastUnfoundAt = history.lastUnfoundAt;

    const normalized = {
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

    data.logs.push({ timestamp: nowStr, location, ...normalized });
    results.push(normalized);
  }

  const savedConfig = saveConfig(token, { location, products: sourceProducts });

  return { success: true, checkedAt: nowStr, location, results, config: savedConfig };
}

module.exports = { login, logout, getConfig, saveConfig, fetchAllStock };
