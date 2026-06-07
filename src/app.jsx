import { useState, useEffect, useCallback, useRef } from 'react';

// ─── API ──────────────────────────────────────────────────────────────────────
// Vercel [...path].js nappaa nämä:
//   /api/inventory/scrape   → HF_INVENTORY_URL/api/scrape
//   /api/pump/analyze       → HF_PUMP_URL/api/analyze
//   /api/portfolio/import   → HF_PORTFOLIO_URL/api/import

async function apiFetch(path, { method = 'POST', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.detail || e.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const api = {
  scrapeInventory: (steamUrl, force = false) =>
    apiFetch('inventory/scrape', { body: { steam_url: steamUrl, force } }),

  analyzePump: (url) =>
    apiFetch('pump/analyze', { body: { url } }),

  importPortfolio: (userId, items) =>
    apiFetch('portfolio/import', { body: { user_id: userId, items } }),

  getPortfolio: (userId) =>
    apiFetch(`portfolio/portfolio/${encodeURIComponent(userId)}`, { method: 'GET' }),
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="spinner" />;
}

// ─── InventoryView ────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

function InventoryView({ triggerScan }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [page, setPage]       = useState(1);
  const lastTs                = useRef(null);

  const scan = useCallback(async (url) => {
    if (!url?.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await api.scrapeInventory(url.trim());
      setItems(data.items || []); setPage(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (triggerScan && triggerScan.ts !== lastTs.current) {
      lastTs.current = triggerScan.ts;
      scan(triggerScan.url);
    }
  }, [triggerScan, scan]);

  const totalValue = items.reduce((s, i) => s + (i.price || 0), 0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {error && <div className="error-bar">⚠ {error}</div>}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value">{items.length}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--accent-d)', borderColor: 'rgba(255,107,43,0.28)' }}>
          <div className="stat-label" style={{ color: 'var(--accent)' }}>Total Value</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {loading && <div className="center-state"><Spinner /><span>Scanning inventory…</span></div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">Paste a Steam profile URL above and click SCAN.</div>
      )}

      {pageItems.length > 0 && (
        <>
          <div className="tbl-head inv-grid">
            <span>#</span><span>Name</span><span>Rarity</span>
            <span>Type</span><span className="tar">Price</span>
          </div>
          {pageItems.map((item, i) => (
            <div key={`${item.assetId}-${i}`} className="tbl-row inv-grid">
              <span className="muted small">{(page - 1) * PAGE_SIZE + i + 1}</span>
              <span className="bold">{item.name}</span>
              <span className="rarity-pill">{item.rarity}</span>
              <span className="muted small">{item.weaponType}</span>
              <span className="tar bold" style={{ color: item.price >= 100 ? 'var(--accent)' : 'var(--text)' }}>
                ${item.price?.toFixed(2)}
              </span>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="pager">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span className="muted">Page <b style={{ color: 'var(--text)' }}>{page}</b> of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PumpView ─────────────────────────────────────────────────────────────────
function PumpView({ triggerScan }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const lastTs                = useRef(null);

  const analyze = useCallback(async (url) => {
    if (!url?.trim()) return;
    setLoading(true); setError(''); setData(null);
    try {
      const result = await api.analyzePump(url.trim());
      setData(result);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (triggerScan && triggerScan.ts !== lastTs.current) {
      lastTs.current = triggerScan.ts;
      analyze(triggerScan.url);
    }
  }, [triggerScan, analyze]);

  const r = data?.result;

  return (
    <div>
      {error && <div className="error-bar">⚠ {error}</div>}
      {loading && <div className="center-state"><Spinner /><span>Analyzing pump signals…</span></div>}
      {!loading && !data && !error && (
        <div className="empty-state">Paste a SteamDT item URL above and click ANALYZE.</div>
      )}
      {r && (
        <div className="fade-in">
          <h3 className="pump-name">{data.name}</h3>
          <div className="pump-grid">
            <div className="pump-card" style={{ background: 'var(--accent-d)', borderColor: 'rgba(255,107,43,0.28)' }}>
              <div className="stat-label">Pump Score</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{r.pump_score}</div>
              <div className="muted small" style={{ marginTop: 6 }}>{r.pump_label}</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">Price</div>
              <div className="stat-value">${r.price?.toFixed(2)}</div>
              <div className="muted small" style={{ marginTop: 6 }}>USD</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">DNA</div>
              <div className="pump-val-md">{r.dna_label}</div>
              <div className="muted small" style={{ marginTop: 6 }}>{r.dna_score}</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">Status</div>
              <div className="pump-val-md" style={{ color: r.is_exploding ? '#FF6B6B' : 'var(--accent)' }}>
                {r.mode}
              </div>
            </div>
          </div>
          {data.chart_base64 && (
            <img src={`data:image/png;base64,${data.chart_base64}`} alt="chart" className="pump-chart" />
          )}
          {r.signals?.length > 0 && (
            <div className="signals-box">
              <div className="stat-label" style={{ marginBottom: 10 }}>Signals</div>
              {r.signals.map((sig, i) => (
                <div key={i} className="signal-row">
                  <span className={`signal-dot ${sig.positive ? 'pos' : 'neg'}`} />
                  <span>{sig.label}</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>{sig.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PortfolioView ────────────────────────────────────────────────────────────
function PortfolioView() {
  const [userId, setUserId]       = useState('me');
  const [profileUrl, setProfile]  = useState('https://steamcommunity.com/id/NotnFaZe');
  const [loading, setLoading]     = useState(false);
  const [portfolio, setPortfolio] = useState([]);
  const [msg, setMsg]             = useState('');

  const importFromProfile = async () => {
    if (!profileUrl.trim() || !userId.trim()) return;
    setLoading(true); setMsg('');
    try {
      const inv    = await api.scrapeInventory(profileUrl.trim());
      const result = await api.importPortfolio(userId.trim(), inv.items);
      setPortfolio(result.items || []);
      setMsg(`✓ Imported ${result.items?.length || 0} items`);
    } catch (e) { setMsg(`⚠ ${e.message}`); }
    finally { setLoading(false); }
  };

  const loadPortfolio = async () => {
    if (!userId.trim()) return;
    setLoading(true); setMsg('');
    try {
      const data = await api.getPortfolio(userId.trim());
      setPortfolio(data.items || []);
      setMsg(`✓ Loaded ${data.items?.length || 0} items`);
    } catch (e) { setMsg(`⚠ ${e.message}`); }
    finally { setLoading(false); }
  };

  const totalValue = portfolio.reduce((s, p) => s + p.quantity * p.avg_price, 0);

  return (
    <div>
      <div className="port-controls">
        <input value={userId} onChange={e => setUserId(e.target.value)}
          placeholder="User ID" className="input-base" style={{ width: 110 }} />
        <input value={profileUrl} onChange={e => setProfile(e.target.value)}
          placeholder="Steam profile URL" className="input-base input-flex" />
        <button onClick={importFromProfile} disabled={loading} className="btn-primary">
          {loading ? 'Importing…' : 'Import'}
        </button>
        <button onClick={loadPortfolio} disabled={loading} className="btn-ghost">
          {loading ? 'Loading…' : 'Load saved'}
        </button>
      </div>
      {msg && <div className="port-msg">{msg}</div>}
      {portfolio.length > 0 && (
        <>
          <div className="port-total">
            Portfolio value: <strong style={{ color: 'var(--accent)' }}>
              ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="tbl-head port-grid">
            <span>Item</span><span className="tar">Qty</span>
            <span className="tar">Avg buy</span><span className="tar">Total</span>
          </div>
          {portfolio.map(p => (
            <div key={p.item_name} className="tbl-row port-grid">
              <span className="bold">{p.item_name}</span>
              <span className="tar muted">{p.quantity}</span>
              <span className="tar muted">${p.avg_price?.toFixed(2)}</span>
              <span className="tar bold">${(p.quantity * p.avg_price).toFixed(2)}</span>
            </div>
          ))}
        </>
      )}
      {!portfolio.length && !loading && (
        <div className="empty-state">Import an inventory or load a saved portfolio.</div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'inventory', emoji: '📦', label: 'Inventory', placeholder: 'Steam profile URL…' },
  { id: 'pump',      emoji: '🐠', label: 'Pump',      placeholder: 'SteamDT.com item URL…' },
  { id: 'portfolio', emoji: '💼', label: 'Portfolio',  placeholder: null },
];

export default function App() {
  const [view, setView]                   = useState('inventory');
  const [invUrl, setInvUrl]               = useState('https://steamcommunity.com/id/NotnFaZe');
  const [pumpUrl, setPumpUrl]             = useState('');
  const [invTrigger, setInvTrigger]       = useState(null);
  const [pumpTrigger, setPumpTrigger]     = useState(null);

  const activeTab  = TABS.find(t => t.id === view);
  const showInput  = activeTab?.placeholder !== null;
  const currentUrl = view === 'pump' ? pumpUrl : invUrl;
  const setUrl     = view === 'pump' ? setPumpUrl : setInvUrl;

  const handleAction = () => {
    const ts = Date.now();
    if (view === 'inventory') setInvTrigger({ url: invUrl, ts });
    else if (view === 'pump') setPumpTrigger({ url: pumpUrl, ts });
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">🔥</div>
            <div>
              <div className="logo-title">FENIX TOOLS</div>
              <div className="logo-sub">CS2 TRACKING SUITE</div>
            </div>
          </div>
          <nav className="nav-tabs">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setView(t.id)}
                className={`nav-tab${view === t.id ? ' active' : ''}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </nav>
          {showInput && (
            <div className="search-bar">
              <input
                value={currentUrl}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAction()}
                placeholder={activeTab.placeholder}
                className="search-input"
              />
              <button onClick={handleAction} className="btn-scan">
                {view === 'pump' ? 'ANALYZE' : 'SCAN'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main">
        <div className="card">
          {view === 'inventory' && <InventoryView triggerScan={invTrigger} />}
          {view === 'pump'      && <PumpView      triggerScan={pumpTrigger} />}
          {view === 'portfolio' && <PortfolioView />}
        </div>
      </main>
    </>
  );
}
