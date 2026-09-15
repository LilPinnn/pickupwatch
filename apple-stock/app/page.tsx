'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type StoreRef = { code: string; name: string };
type ProductRow = {
  partNumber: string;
  name: string;
  stores: { code: string; available: boolean }[];
};
type StockResponse = {
  checkedAt: string;
  stores: StoreRef[];
  products: ProductRow[];
  errors: { store: string; product: string; error: string }[];
};

const POLL_MS = 30_000;

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour12: false });
}

export default function Page() {
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/stock', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StockResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setFetchError(e?.message || 'ดึงข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(load, POLL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, load]);

  const storeCount = data?.stores.length || 2;

  return (
    <div className="page">
      <header className="header">
        <div className="wordmark">
          <h1>Pickup Watch</h1>
          <span className="sub">Apple Store · TH</span>
        </div>
        <div className="status-cluster">
          <span className="live-pill">
            <span className={`pulse-dot ${autoRefresh ? 'on' : ''}`} />
            {autoRefresh ? 'LIVE · ทุก 30 วิ' : 'หยุดอัปเดตอัตโนมัติ'}
          </span>
          <span className="last-checked">
            {data ? `เช็คล่าสุด ${formatTime(data.checkedAt)}` : loading ? 'กำลังเช็ค…' : '—'}
          </span>
          <label className="toggle">
            <span
              className={`toggle-track ${autoRefresh ? 'on' : ''}`}
              onClick={() => setAutoRefresh((v) => !v)}
              role="switch"
              aria-checked={autoRefresh}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setAutoRefresh((v) => !v);
              }}
            >
              <span className="toggle-thumb" />
            </span>
            Auto
          </label>
          <button className="refresh-btn" onClick={load} disabled={loading}>
            <span className={`refresh-icon ${loading ? 'spinning' : ''}`}>⟳</span>
            {loading ? 'กำลังโหลด' : 'รีเฟรชตอนนี้'}
          </button>
        </div>
      </header>

      <div className="board-wrap">
        <div className="board-meta">
          <h2>สถานะสต็อกพร้อมรับที่สาขา</h2>
          {fetchError && <span className="error-note">เชื่อมต่อไม่สำเร็จ: {fetchError}</span>}
          {data && data.errors.length > 0 && (
            <span className="error-note">
              ดึงข้อมูลไม่สำเร็จ {data.errors.length} รายการ (ระบบลองใหม่ให้อัตโนมัติแล้ว)
            </span>
          )}
        </div>

        {!data && !fetchError && <div className="empty-state">กำลังโหลดข้อมูลครั้งแรก…</div>}

        {data && (
          <div className="board" style={{ ['--store-count' as any]: storeCount }}>
            <div className="board-row head">
              <div className="cell">รุ่น</div>
              {data.stores.map((s) => (
                <div className="cell" key={s.code}>
                  {s.name}
                  {s.name !== s.code ? ` (${s.code})` : ''}
                </div>
              ))}
            </div>
            {data.products.map((p) => (
              <div className="board-row" key={p.partNumber}>
                <div className="cell product-name">
                  <span className="name">{p.name}</span>
                  <span className="part">{p.partNumber}</span>
                </div>
                {p.stores.map((s) => (
                  <div className="cell status-cell" data-store={s.code} key={s.code}>
                    <span className={`status-dot ${s.available ? 'available' : ''}`} />
                    <span className={`status-text ${s.available ? 'available' : ''}`}>
                      {s.available ? 'มีของ พร้อมรับ' : 'ไม่มีของ'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <p className="footer-note">
          แสดงเฉพาะรุ่นที่ตั้งค่าไว้ล่วงหน้า · ข้อมูลจาก Apple Store Thailand ·
          หน้านี้ดึงข้อมูลใหม่ทุก 30 วินาทีเมื่อเปิด Auto
        </p>
      </div>
    </div>
  );
}
