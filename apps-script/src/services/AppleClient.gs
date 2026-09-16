/** GAS-specific: wraps UrlFetchApp, delegates URL/parsing to lib/stock.js. */
function AppleClient_checkStock(partNumber, location) {
  var url = buildAppleStockUrl(partNumber, location);
  var options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://www.apple.com/th/'
    }
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    return parseAppleStockResponse(partNumber, response.getResponseCode(), response.getContentText());
  } catch (error) {
    return {
      status: 'error',
      message: error && error.message ? error.message : String(error),
      rawStatus: '',
      data: []
    };
  }
}
