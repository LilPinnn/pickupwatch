var SHEET_CONFIG = 'Config';
var SHEET_LOGS = 'Logs';
var CONFIG_LOCATION_PROP_KEY = 'LOCATION';

/** Run once after install/restructure to (re)create sheet headers. */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Please create this Apps Script project from a Google Sheet.');

  var config = ss.getSheetByName(SHEET_CONFIG);
  if (!config) config = ss.insertSheet(SHEET_CONFIG);

  config.getRange(1, 1, 1, 9).setValues([[
    'id', 'productName', 'partNumber', 'imageUrl', 'linkUrl', 'overlayText', 'enabled', 'lastFoundAt', 'lastUnfoundAt'
  ]]);

  var logs = ss.getSheetByName(SHEET_LOGS);
  if (!logs) logs = ss.insertSheet(SHEET_LOGS);

  if (logs.getLastRow() === 0) {
    logs.getRange(1, 1, 1, 9).setValues([[
      'timestamp', 'productName', 'partNumber', 'location',
      'status', 'availableStores', 'storeCount', 'message', 'rawStatus'
    ]]);
  }

  return 'Sheets ready';
}

function ConfigStore_get() {
  setupSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  var values = sheet.getDataRange().getValues();

  var products = [];
  if (values.length > 1) {
    products = values.slice(1)
      .filter(function (r) { return r[0] && String(r[2]).trim(); })
      .map(function (r) {
        return {
          id: String(r[0]),
          productName: String(r[1] || ''),
          partNumber: String(r[2] || '').trim().toUpperCase(),
          imageUrl: String(r[3] || ''),
          linkUrl: String(r[4] || ''),
          overlayText: String(r[5] || ''),
          enabled: String(r[6]).toLowerCase() !== 'false',
          lastFoundAt: String(r[7] || ''),
          lastUnfoundAt: String(r[8] || '')
        };
      });
  }

  var props = PropertiesService.getScriptProperties();
  return {
    location: props.getProperty(CONFIG_LOCATION_PROP_KEY) || '10140',
    products: products
  };
}

function ConfigStore_save(config) {
  setupSheets();

  if (!config || !Array.isArray(config.products)) {
    throw new Error('Invalid configuration.');
  }

  var location = String(config.location || '10140').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIG);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 9).setValues([[
    'id', 'productName', 'partNumber', 'imageUrl', 'linkUrl', 'overlayText', 'enabled', 'lastFoundAt', 'lastUnfoundAt'
  ]]);

  var rows = config.products
    .filter(function (p) { return String(p.partNumber || '').trim(); })
    .map(function (p) {
      return [
        String(p.id || Utilities.getUuid()),
        String(p.productName || ''),
        String(p.partNumber || '').trim().toUpperCase(),
        String(p.imageUrl || ''),
        String(p.linkUrl || ''),
        String(p.overlayText || ''),
        p.enabled !== false,
        String(p.lastFoundAt || ''),
        String(p.lastUnfoundAt || '')
      ];
    });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }

  PropertiesService.getScriptProperties().setProperty(CONFIG_LOCATION_PROP_KEY, location);

  return ConfigStore_get();
}
