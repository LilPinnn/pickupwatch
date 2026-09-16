function LogStore_write(result, location) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LOGS);

  var availableStores = (result.data || [])
    .filter(function (s) { return s.isAvailable; })
    .map(function (s) { return s.storeName; })
    .join(', ');

  sheet.appendRow([
    new Date(),
    result.productName,
    result.partNumber,
    location,
    result.status,
    availableStores,
    (result.data || []).length,
    result.message || '',
    result.status === 'success' ? 200 : (result.rawStatus || '')
  ]);
}
