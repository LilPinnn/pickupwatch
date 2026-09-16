function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Apple Fulfillment Monitor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
