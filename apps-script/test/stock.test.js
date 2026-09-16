const { buildAppleStockUrl, parseAppleStockResponse, computeHistoryUpdate } = require('../src/lib/stock');

describe('buildAppleStockUrl', () => {
  test('uppercases part number and defaults location', () => {
    const url = buildAppleStockUrl('mjy34zp/a', '10140');
    expect(url).toContain('parts.0=MJY34ZP%2FA');
    expect(url).toContain('location=10140');
  });

  test('defaults location to 10140 when missing', () => {
    const url = buildAppleStockUrl('MJY34ZP/A', '');
    expect(url).toContain('location=10140');
  });
});

describe('parseAppleStockResponse', () => {
  test('returns error for non-200 status', () => {
    const result = parseAppleStockResponse('MJY34ZP/A', 500, '');
    expect(result.status).toBe('error');
    expect(result.data).toEqual([]);
  });

  test('returns error for invalid JSON', () => {
    const result = parseAppleStockResponse('MJY34ZP/A', 200, 'not json');
    expect(result.status).toBe('error');
  });

  test('marks store available only when pickupDisplay is "available"', () => {
    const body = {
      body: {
        stores: [
          { storeName: 'iStudio Siam', storeNumber: 'R001', partsAvailability: { 'MJY34ZP/A': { pickupDisplay: 'available', pickupSearchQuote: 'Ready' } } },
          { storeName: 'iStudio Central', storeNumber: 'R002', partsAvailability: { 'MJY34ZP/A': { pickupDisplay: 'unavailable' } } }
        ]
      }
    };
    const result = parseAppleStockResponse('MJY34ZP/A', 200, JSON.stringify(body));
    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].isAvailable).toBe(true);
    expect(result.data[1].isAvailable).toBe(false);
  });

  test('skips stores without data for the requested part number', () => {
    const body = { body: { stores: [{ storeName: 'iStudio Siam', partsAvailability: {} }] } };
    const result = parseAppleStockResponse('MJY34ZP/A', 200, JSON.stringify(body));
    expect(result.data).toEqual([]);
  });
});

describe('computeHistoryUpdate', () => {
  test('stamps lastFoundAt when a store becomes available', () => {
    const result = { status: 'success', data: [{ isAvailable: true }] };
    const next = computeHistoryUpdate(result, { lastFoundAt: '', lastUnfoundAt: 'old' }, '2026-01-01T00:00:00.000Z');
    expect(next.lastFoundAt).toBe('2026-01-01T00:00:00.000Z');
    expect(next.lastUnfoundAt).toBe('old');
  });

  test('stamps lastUnfoundAt when nothing is available', () => {
    const result = { status: 'success', data: [{ isAvailable: false }] };
    const next = computeHistoryUpdate(result, { lastFoundAt: 'old', lastUnfoundAt: '' }, '2026-01-01T00:00:00.000Z');
    expect(next.lastUnfoundAt).toBe('2026-01-01T00:00:00.000Z');
    expect(next.lastFoundAt).toBe('old');
  });

  test('leaves history untouched on API error', () => {
    const result = { status: 'error', data: [] };
    const previous = { lastFoundAt: 'a', lastUnfoundAt: 'b' };
    expect(computeHistoryUpdate(result, previous, 'now')).toEqual(previous);
  });
});
