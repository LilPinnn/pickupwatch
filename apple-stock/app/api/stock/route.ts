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

type CellState = {
  fetched: boolean; // true = ดึงข้อมูลจาก Apple สำเร็จสำหรับคู่นี้
  available: boolean; // มีความหมายเมื่อ fetched === true เท่านั้น
  error: string | null; // มีค่าเมื่อ fetched === false
};

export async function GET() {
  const requests: Promise<Awaited<ReturnType<typeof fetchOne>>>[] = [];
  for (const store of STORES) {
    for (const product of PRODUCTS) {
      requests.push(fetchOne(store, product));
    }
  }

  const results = await Promise.all(requests);

  const storeNames: Record<string, string> = {};
  const productNames: Record<string, string> = {};

  // สถานะต่อ "รุ่น × สาขา" แยกกันตรงๆ ไม่ปนกัน — เริ่มต้นทุกคู่เป็น "ยังไม่ทราบผล"
  const cells: Record<string, Record<string, CellState>> = {};
  for (const pn of PRODUCTS) {
    cells[pn] = {};
    for (const st of STORES) {
      cells[pn][st] = { fetched: false, available: false, error: 'ยังไม่ได้ดึงข้อมูล' };
    }
  }

  for (const r of results) {
    // กรณีดึงข้อมูล "คู่นี้" ไม่สำเร็จ — ระบุชัดว่าไม่ใช่ "ไม่มีของ" แต่คือ "เช็คไม่ได้"
    if (!r.ok || !r.data) {
      cells[r.product][r.store] = {
        fetched: false,
        available: false,
        error: r.error || 'ดึงข้อมูลไม่สำเร็จ',
      };
      continue;
    }

    const stores: StoreEntry[] =
      r.data?.body?.content?.pickupMessage?.stores ||
      r.data?.pickupMessage?.stores ||
      r.data?.body?.PickupMessage?.stores ||
      r.data?.PickupMessage?.stores ||
      [];

    // เจอ response แต่ไม่พบข้อมูลสาขานี้ในนั้น — ยังถือว่าดึงสำเร็จ (Apple ตอบ 200) แต่ไม่มีข้อมูลสาขานั้นเจาะจง
    let matchedThisStore = false;

    stores.forEach((s) => {
      const code = String(s.storeNumber || '').trim();
      if (!code) return;
      if (s.storeName) storeNames[code] = s.storeName;

      const pa = (s.partsAvailability || {})[r.product];
      if (code === r.store) matchedThisStore = true;
      if (!pa) return;

      const name =
        pa.messageTypes?.regular?.storePickupProductTitle ||
        pa.messageTypes?.compact?.storePickupProductTitle ||
        r.product;
      productNames[r.product] = name;

      if (!cells[r.product]) cells[r.product] = {};
      const prev = cells[r.product][code];
      cells[r.product][code] = {
        fetched: true,
        available: Boolean(prev?.available) || decideAvailable(pa),
        error: null,
      };
    });

    // ดึง HTTP สำเร็จ แต่ Apple ไม่ส่งข้อมูลสาขานี้กลับมาเลย (เช่น store code ผิด) — ถือเป็น fetched:true, available:false
    if (!matchedThisStore && cells[r.product][r.store]?.error) {
      cells[r.product][r.store] = { fetched: true, available: false, error: null };
    }
  }

  const products = PRODUCTS.map((pn) => ({
    partNumber: pn,
    name: productNames[pn] || pn,
    stores: STORES.map((code) => {
      const c = cells[pn][code];
      return {
        code,
        fetched: c.fetched,
        available: c.fetched ? c.available : false,
        error: c.fetched ? null : c.error,
      };
    }),
  }));

  const failedCount = products.reduce(
    (sum, p) => sum + p.stores.filter((s) => !s.fetched).length,
    0
  );

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    stores: STORES.map((code) => ({ code, name: storeNames[code] || code })),
    products,
    failedCount,
  });
}
