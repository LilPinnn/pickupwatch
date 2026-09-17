'use client';

import { useEffect, useRef, useState } from 'react';

function escHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function callApi(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-session-token'] = token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    throw err;
  }
  return data;
}

export default function Home() {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [view, setView] = useState('dashboard');
  const [config, setConfig] = useState({ location: '10140', products: [] });
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [lastUpdate, setLastUpdate] = useState('-');
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const loadingRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('sessionToken');
    if (saved) setToken(saved);
    setReady(true);
  }, []);

  function handleSessionError(err, fallbackStatus) {
    if (String(err.message).indexOf('SESSION_REPLACED') !== -1) {
      clearInterval(timerRef.current);
      sessionStorage.removeItem('sessionToken');
      setToken(null);
      setLoginError('Session ถูกแทนที่ / มีการ Login จากที่อื่น กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    setStatus(fallbackStatus);
    console.error(err);
  }

  async function loadConfig(activeToken) {
    setStatus('กำลังโหลด config...');
    try {
      const data = await callApi('/api/config', { token: activeToken });
      setConfig(data || { location: '10140', products: [] });
      return data;
    } catch (err) {
      handleSessionError(err, 'Config error');
      return null;
    }
  }

  async function fetchNow(activeToken, activeConfig) {
    if (loadingRef.current || !activeToken) return;
    const active = (activeConfig.products || []).filter((p) => p.enabled !== false && p.partNumber);
    if (!active.length) {
      setResults([]);
      setStatus('ยังไม่มีรุ่นที่เปิดใช้งาน');
      return;
    }
    loadingRef.current = true;
    setStatus('กำลังเช็กสต็อก Apple...');
    try {
      const response = await callApi('/api/stock', {
        method: 'POST',
        token: activeToken,
        body: { location: activeConfig.location, products: activeConfig.products }
      });
      setConfig(response.config || activeConfig);
      setResults(response.results || []);
      setLastUpdate(new Date().toLocaleString('th-TH'));
      const errors = (response.results || []).filter((r) => r.status === 'error');
      setStatus(errors.length ? `อัปเดตแล้ว • ${errors.length} รุ่นมี Error` : `อัปเดตแล้ว • ${response.results.length} รุ่น`);
    } catch (err) {
      handleSessionError(err, 'Fetch error');
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    (async () => {
      const data = await loadConfig(token);
      if (!cancelled && data) await fetchNow(token, data);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  useEffect(() => {
    if (!token) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!loadingRef.current) fetchNow(token, config);
    }, refreshSeconds * 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshSeconds, config]);

  async function doLogin(e) {
    e.preventDefault();
    setLoginError('');
    if (!loginForm.username || !loginForm.password) {
      setLoginError('กรุณากรอก Username และ Password');
      return;
    }
    try {
      const res = await callApi('/api/login', { method: 'POST', body: loginForm });
      sessionStorage.setItem('sessionToken', res.token);
      setToken(res.token);
      setLoginForm({ username: loginForm.username, password: '' });
    } catch (err) {
      setLoginError('Login ไม่สำเร็จ: ' + err.message);
    }
  }

  async function doLogout() {
    clearInterval(timerRef.current);
    const activeToken = token;
    sessionStorage.removeItem('sessionToken');
    setToken(null);
    if (activeToken) {
      try { await callApi('/api/logout', { method: 'POST', token: activeToken, body: { token: activeToken } }); } catch {}
    }
  }

  function updateProduct(index, patch) {
    setConfig((c) => {
      const products = c.products.slice();
      products[index] = { ...products[index], ...patch };
      return { ...c, products };
    });
  }

  function addProduct() {
    setConfig((c) => ({
      ...c,
      products: [...c.products, {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        productName: '', partNumber: '', imageUrl: '', linkUrl: '', overlayText: '',
        enabled: true, lastFoundAt: '', lastUnfoundAt: ''
      }]
    }));
  }

  function removeProduct(index) {
    setConfig((c) => ({ ...c, products: c.products.filter((_, i) => i !== index) }));
  }

  async function saveConfig(silent) {
    setStatus('กำลังบันทึก...');
    try {
      const saved = await callApi('/api/config', { method: 'POST', token, body: config });
      setConfig(saved);
      setStatus('บันทึกเรียบร้อย');
      if (!silent) await fetchNow(token, saved);
    } catch (err) {
      handleSessionError(err, 'Save error');
    }
  }

  if (!ready) return null;

  if (!token) {
    return (
      <section id="view-login" className="view-section active">
        <div className="login-card">
          <h2>Apple Fulfillment Monitor</h2>
          <p>เข้าสู่ระบบเพื่อดูสถานะ Pickup</p>
          <form onSubmit={doLogin}>
            <label>Username</label>
            <input
              type="text"
              autoComplete="username"
              value={loginForm.username}
              onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
            />
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            />
            <button className="btn btn-primary" type="submit">Login</button>
          </form>
          {loginError && <div className="login-error" style={{ display: 'block' }}>{loginError}</div>}
        </div>
      </section>
    );
  }

  return (
    <div id="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Apple Fulfillment Monitor</div>
          <div className="nav-tabs">
            <button className={`nav-tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>หน้าหลัก</button>
            <button className={`nav-tab ${view === 'config' ? 'active' : ''}`} onClick={() => setView('config')}>ตั้งค่าระบบ</button>
          </div>
          <div className="control">
            <span>Refresh</span>
            <select value={refreshSeconds} onChange={(e) => setRefreshSeconds(Number(e.target.value))}>
              <option value={10}>10 sec</option>
              <option value={30}>30 sec</option>
              <option value={60}>60 sec</option>
            </select>
          </div>
          <div className="control">
            <span>ZIP</span>
            <input
              type="text"
              style={{ width: 75 }}
              value={config.location}
              onChange={(e) => setConfig((c) => ({ ...c, location: e.target.value }))}
              onBlur={() => saveConfig(true)}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => fetchNow(token, config)}>↻ Refresh</button>
          <button className="btn btn-secondary" onClick={doLogout}>ออกจากระบบ</button>
          <span className="status-pill">{status}</span>
        </div>
      </header>

      <main>
        <section className={`view-section ${view === 'dashboard' ? 'active' : ''}`}>
          <div className="hero">
            <h1>Check availability.</h1>
            <p>ติดตามสถานะ Pickup แยกตามรุ่นแบบเรียลไทม์</p>
          </div>
          <div className="dashboard">
            {results.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#6e6e73', padding: 40 }}>
                ยังไม่มีข้อมูลสินค้าสำหรับแสดงผล
              </div>
            )}
            {results.map((r) => {
              const available = (r.data || []).filter((s) => s.isAvailable);
              const hasData = (r.data || []).length > 0;
              let dotClass = 'orange';
              let statusText = 'API สำเร็จ แต่ไม่พบข้อมูลสาขา';
              if (r.status === 'error') {
                dotClass = 'red';
                statusText = r.message || 'Apple API Error';
              } else if (available.length) {
                dotClass = 'green';
                statusText = `มีสินค้า ${available.length} สาขา`;
              } else if (hasData) {
                dotClass = 'red';
                statusText = 'ยังไม่มีสาขาที่พร้อมรับสินค้า';
              }
              return (
                <article className="card" key={r.id}>
                  <div className="product-image">
                    {r.imageUrl ? (
                      r.linkUrl ? (
                        <a href={r.linkUrl} target="_blank" rel="noreferrer" title="คลิกเพื่อเปิดลิงก์">
                          <img src={r.imageUrl} alt={r.productName} />
                        </a>
                      ) : <img src={r.imageUrl} alt={r.productName} />
                    ) : <div className="image-placeholder">No image</div>}
                    {r.overlayText && <div className="overlay">{r.overlayText}</div>}
                  </div>
                  <div className="card-body">
                    <div className="product-name">{r.productName}</div>
                    <div className="sku">{r.partNumber}</div>
                    <div className="history-info">
                      <div>🟢 ล่าสุดที่พบของ: <strong>{r.lastFoundAt ? new Date(r.lastFoundAt).toLocaleString('th-TH') : 'ยังไม่เคยพบ'}</strong></div>
                      <div>🔴 ล่าสุดที่ไม่พบ: <strong>{r.lastUnfoundAt ? new Date(r.lastUnfoundAt).toLocaleString('th-TH') : 'ยังไม่เคยบันทึก'}</strong></div>
                    </div>
                    <div className="availability">
                      <span className={`dot ${dotClass}`}></span>
                      <span>{statusText}</span>
                    </div>
                    <div className="stores">
                      {(r.data || []).map((s, i) => (
                        <div className="store" key={i}>
                          <div className="store-name">{s.storeName}</div>
                          <div className="store-status">{s.isAvailable ? 'Available' : (s.quote || s.pickupDisplay || 'Unavailable')}</div>
                        </div>
                      ))}
                    </div>
                    {r.status === 'error' && <div style={{ color: '#ff3b30', fontSize: 12, marginTop: 12 }}>{r.message}</div>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`view-section ${view === 'config' ? 'active' : ''}`}>
          <div className="editor-container">
            <h2>Product Settings</h2>
            <p>จัดการรุ่นสินค้า รหัส Part Number รูปภาพ ลิงก์เมื่อคลิก และข้อความทับรูป</p>
            <div>
              {config.products.length === 0 && (
                <div style={{ color: '#6e6e73', padding: '10px 0' }}>ยังไม่มีสินค้า กดปุ่ม + เพิ่มสินค้า ด้านล่าง</div>
              )}
              {config.products.map((p, i) => (
                <div className="product-row" key={p.id || i}>
                  <input type="checkbox" checked={p.enabled !== false} onChange={(e) => updateProduct(i, { enabled: e.target.checked })} title="เปิดใช้งาน" />
                  <input type="text" placeholder="ชื่อสินค้า" value={p.productName || ''} onChange={(e) => updateProduct(i, { productName: e.target.value })} />
                  <input type="text" placeholder="Part Number (เช่น MJY34ZP/A)" value={p.partNumber || ''} onChange={(e) => updateProduct(i, { partNumber: e.target.value.toUpperCase() })} />
                  <input type="url" placeholder="Image URL" value={p.imageUrl || ''} onChange={(e) => updateProduct(i, { imageUrl: e.target.value })} />
                  <input type="url" placeholder="Link URL เมื่อคลิกรูป" value={p.linkUrl || ''} onChange={(e) => updateProduct(i, { linkUrl: e.target.value })} />
                  <input type="text" placeholder="ข้อความบนรูป (เช่น NEW)" value={p.overlayText || ''} onChange={(e) => updateProduct(i, { overlayText: e.target.value })} />
                  <button className="btn btn-danger" onClick={() => removeProduct(i)}>ลบ</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={addProduct}>+ เพิ่มสินค้า</button>
              <button className="btn btn-primary" onClick={() => saveConfig(false)}>บันทึกการตั้งค่าทั้งหมด</button>
            </div>
          </div>
        </section>

        <div className="footer-note">Last update: <span>{lastUpdate}</span></div>
      </main>
    </div>
  );
}
