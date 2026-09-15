import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/** ====== แก้ตรงนี้ให้ตรงกับรุ่น/สาขาที่ต้องการติดตาม ====== */
const STORES = ['R733', 'R728']; // รหัสสาขา Apple Store
const PRODUCTS = [
  'MJXQ4ZP/A',
  'MJXV4ZP/A',
  'MJXP4ZP/A',
  'MJXU4ZP/A',
  'MJY34ZP/A',
];
/** ========================================================= */

const APPLE_BASE = 'https://www.apple.com/th/shop/pickup-message-recommendations';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 500;

type PartAvailability = {
  pickupDisplay?: string;
  storeSelectionEnabled?: boolean;
  pickupEligible?: boolean;
  storePickEligible?: boolean;
  buyability?: { isBuyable?: boolean; inventory?: number };
  messageTypes?: {
    regular?: { storePickupProductTitle?: string };
    compact?: { storePickupProductTitle?: string };
  };
};

type StoreEntry = {
  storeNumber?: string;
  storeName?: string;
  partsAvailability?: Record<string, PartAvailability>;
};

function buildUrl(store: string, product: string) {
  const qs = new URLSearchParams({
    fae: 'true',
    'mts.0': 'regular',
    'mts.1': 'compact',
    searchNearby: 'true',
    store,
    product,
  });
  return `${APPLE_BASE}?${qs.toString()}`;
}

function decideAvailable(pa?: PartAvailability): boolean {
  if (!pa) return false;
  const displayOk = String(pa.pickupDisplay || '').toLowerCase() === 'available';
  const flagOk = Boolean(pa.storeSelectionEnabled || pa.pickupEligible || pa.storePickEligible);
  const buyOk = Boolean(
    pa.buyability && (pa.buyability.isBuyable || Number(pa.buyability.inventory) > 0)
  );
  return displayOk || (flagOk && buyOk);
}

async function fetchOne(store: string, product: string) {
  const url = buildUrl(store, product);
  let attempt = 0;
  let lastError = '';

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
          Origin: 'https://www.apple.com',
          Referer: 'https://www.apple.com/th/shop',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
        },
        cache: 'no-store',
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        attempt++;
        continue;
      }
      if (!res.ok) {
        return { store, product, ok: false, error: `HTTP ${res.status}`, data: null };
      }
      const json = await res.json();
      return { store, product, ok: true, error: null, data: json };
    } catch (e: any) {
      clearTimeout(timeout);
      lastError = e?.name === 'AbortError' ? 'timeout' : String(e?.message || e);
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
      attempt++;
    }
  }
  return { store, product, ok: false, error: lastError || 'unknown error', data: null };
}

export async function GET() {
  const requests: Promise<Awaited<ReturnType<typeof fetchOne>>>[] = [];
  for (const store of STORES) {
    for (const product of PRODUCTS) {
      requests.push(fetchOne(store, product));
    }
  }

  const results = await Promise.all(requests);

  // ชื่อสาขา (เติมทีหลังจากผล ถ้าดึงได้)
  const storeNames: Record<string, string> = {};

  // productName + availability per store
  const byProduct: Record<
    string,
    { name: string; stores: Record<string, { available: boolean }> }
  > = {};
  for (const pn of PRODUCTS) {
    byProduct[pn] = { name: pn, stores: {} };
    for (const st of STORES) {
      byProduct[pn].stores[st] = { available: false };
    }
  }

  const errors: { store: string; product: string; error: string }[] = [];

  for (const r of results) {
    if (!r.ok || !r.data) {
      errors.push({ store: r.store, product: r.product, error: r.error || 'unknown' });
      continue;
    }
    const stores: StoreEntry[] =
      r.data?.body?.content?.pickupMessage?.stores ||
      r.data?.pickupMessage?.stores ||
      r.data?.body?.PickupMessage?.stores ||
      r.data?.PickupMessage?.stores ||
      [];

    stores.forEach((s) => {
      const code = String(s.storeNumber || '').trim();
      if (!code) return;
      if (s.storeName) storeNames[code] = s.storeName;

      const pa = (s.partsAvailability || {})[r.product];
      if (!pa) return;

      const name =
        pa.messageTypes?.regular?.storePickupProductTitle ||
        pa.messageTypes?.compact?.storePickupProductTitle ||
        r.product;

      if (!byProduct[r.product]) byProduct[r.product] = { name, stores: {} };
      byProduct[r.product].name = name;
      if (!byProduct[r.product].stores[code]) byProduct[r.product].stores[code] = { available: false };
      byProduct[r.product].stores[code].available =
        byProduct[r.product].stores[code].available || decideAvailable(pa);
    });
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    stores: STORES.map((code) => ({ code, name: storeNames[code] || code })),
    products: PRODUCTS.map((pn) => ({
      partNumber: pn,
      name: byProduct[pn]?.name || pn,
      stores: STORES.map((code) => ({
        code,
        available: byProduct[pn]?.stores[code]?.available || false,
      })),
    })),
    errors,
  });
}
