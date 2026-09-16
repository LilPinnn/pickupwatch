/**
 * Pure stock-checking logic — URL building and response parsing have no GAS
 * dependency, so they're tested directly. The actual HTTP call is injected
 * via a `httpClient.fetch(url, options)` so tests can fake Apple's response
 * without hitting the network.
 */

function buildAppleStockUrl(partNumber, location) {
  const rawPartNumber = String(partNumber || '').trim().toUpperCase();
  const loc = String(location || '10140').trim();
  return 'https://www.apple.com/th/shop/retail/pickup-message' +
    '?pl=true' +
    '&mts.0=regular' +
    '&parts.0=' + encodeURIComponent(rawPartNumber) +
    '&location=' + encodeURIComponent(loc);
}

function parseAppleStockResponse(partNumber, code, text) {
  const rawPartNumber = String(partNumber || '').trim().toUpperCase();

  if (code !== 200) {
    return { status: 'error', message: 'Apple API returned status code ' + code, rawStatus: code, data: [] };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { status: 'error', message: 'Invalid JSON from Apple API', rawStatus: code, data: [] };
  }

  const stores = (json.body && Array.isArray(json.body.stores)) ? json.body.stores : [];
  const storesInfo = [];

  stores.forEach(store => {
    const partsAvailability = store.partsAvailability || {};
    const partInfo = partsAvailability[rawPartNumber];
    if (!partInfo) return;

    const pickupDisplay = String(partInfo.pickupDisplay || '').toLowerCase();
    storesInfo.push({
      storeName: store.storeName || 'Unknown Store',
      storeNumber: store.storeNumber || '',
      isAvailable: pickupDisplay === 'available',
      pickupDisplay: partInfo.pickupDisplay || '',
      quote: partInfo.pickupSearchQuote || partInfo.pickupDisplay || 'ไม่มีข้อความระบุ'
    });
  });

  return {
    status: 'success',
    message: storesInfo.length ? 'พบข้อมูลสาขา ' + storesInfo.length + ' แห่ง' : 'API สำเร็จ แต่ไม่พบข้อมูลสาขาสำหรับ SKU นี้',
    rawStatus: code,
    data: storesInfo
  };
}

/**
 * Given a stock check result, decides how lastFoundAt/lastUnfoundAt should
 * change. Kept separate from the sheet-writing code so the "when do we stamp
 * found vs. unfound" rule is independently testable.
 */
function computeHistoryUpdate(result, previous, nowIso) {
  const next = { lastFoundAt: previous.lastFoundAt || '', lastUnfoundAt: previous.lastUnfoundAt || '' };
  if (result.status !== 'success') return next;

  const available = (result.data || []).some(s => s.isAvailable);
  if (available) {
    next.lastFoundAt = nowIso;
  } else {
    next.lastUnfoundAt = nowIso;
  }
  return next;
}

if (typeof module !== 'undefined') {
  module.exports = { buildAppleStockUrl, parseAppleStockResponse, computeHistoryUpdate };
}
