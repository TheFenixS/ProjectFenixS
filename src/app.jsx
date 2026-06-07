import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ─── API ──────────────────────────────────────────────────────────────────────
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
  scrape:          (url, force=false)    => apiFetch('scrape',           { body: { steam_url: url, force } }),
  analyzePump:     (url)                 => apiFetch('pump/analyze',      { body: { url } }),
  importPortfolio: (userId, items)       => apiFetch('portfolio/import',  { body: { user_id: userId, items } }),
  getPortfolio:    (userId)              => apiFetch(`portfolio/portfolio/${encodeURIComponent(userId)}`, { method:'GET' }),
  trackedUrls:     ()                    => apiFetch('tracked_urls',      { method:'GET' }),
  recentChanges:   ()                    => apiFetch('recent_changes',    { method:'GET' }),
  overview:        ()                    => apiFetch('overview',          { method:'GET' }),
  dailyChart:      ()                    => apiFetch('daily_chart',       { method:'GET' }),
  acctChanges:     (url, days)           => apiFetch(`account_changes?url=${encodeURIComponent(url)}&days=${days}`, { method:'GET' }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;
const fmtVal = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });

const RARITY_COLORS = {
  'Consumer Grade':'#8BA0B8','Base Grade':'#8BA0B8',
  'Industrial Grade':'#5591D4',
  'Mil-Spec Grade':'#4B69FF','High Grade':'#4B69FF',
  'Restricted':'#8847FF','Remarkable':'#8847FF',
  'Classified':'#D32CE6','Exotic':'#D32CE6',
  'Covert':'#EB4B4B','Extraordinary':'#EB4B4B',
  'Gold':'#FFD700','Contraband':'#E4AE33','Normal':'#4A5568',
};
const RARITY_WEIGHT = {
  'Normal':0,'Base Grade':1,'Consumer Grade':1,'Industrial Grade':2,
  'High Grade':3,'Mil-Spec Grade':3,'Remarkable':4,'Restricted':4,
  'Exotic':5,'Classified':5,'Extraordinary':6,'Covert':6,'Contraband':7,'Gold':8,
};
const rc = r => RARITY_COLORS[r] || RARITY_COLORS['Normal'];

function getDisplayRarity(item) {
  if (item.isKnife || item.isGlove) return 'Gold';
  const r  = (item.rarity     || '').toLowerCase();
  const wt = (item.weaponType || '').toLowerCase();
  const isW = wt.includes('pistol')||wt.includes('rifle')||wt.includes('smg')||wt.includes('shotgun')||wt.includes('machine')||wt.includes('weapon');
  if (r.includes('common') && !r.includes('uncommon')) return isW ? 'Consumer Grade' : 'Base Grade';
  if (r.includes('uncommon'))   return 'Industrial Grade';
  if (r.includes('rare'))       return isW ? 'Mil-Spec Grade' : 'High Grade';
  if (r.includes('mythical'))   return isW ? 'Restricted'     : 'Remarkable';
  if (r.includes('legendary'))  return isW ? 'Classified'     : 'Exotic';
  if (r.includes('ancient'))    return isW ? 'Covert'         : 'Extraordinary';
  if (r.includes('contraband')) return 'Contraband';
  return (item.rarity || '').replace(/ Weapon/gi, '').replace(/_/g, ' ');
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 16 }) {
  return <div className="spinner" style={{ width:size, height:size }} />;
}

// ─── YT Icon ──────────────────────────────────────────────────────────────────
function YTIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.13-2.14C19.5 3.67 12 3.67 12 3.67s-7.5 0-9.37.38A3.02 3.02 0 0 0 .5 6.19C.12 8.07 0 10 0 12s.12 3.93.5 5.81A3.02 3.02 0 0 0 2.63 19.95C4.5 20.33 12 20.33 12 20.33s7.5 0 9.37-.38a3.02 3.02 0 0 0 2.13-2.14C23.88 15.93 24 14 24 12s-.12-3.93-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
    </svg>
  );
}

// ─── ItemLink ─────────────────────────────────────────────────────────────────
function ItemLink({ name, style = {}, color = 'var(--text)' }) {
  const href = `https://cs2invest-by-fenixs.vercel.app/?search=${encodeURIComponent('https://www.steamdt.com/en/cs2/' + name)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="item-link" style={{ color, ...style }} title={`Analyze ${name}`}>
      {name}
    </a>
  );
}

// ─── MiniLineChart ────────────────────────────────────────────────────────────
function MiniLineChart({ data }) {
  const [hov, setHov] = useState(null);
  const W=260, H=95, PT=12, PB=17, PH=H-PT-PB;
  const tg = data ? data.reduce((s,d)=>s+d.gained,0) : 0;
  const tl = data ? data.reduce((s,d)=>s+d.lost,  0) : 0;
  const hasData = data && data.length>=2 && (tg>0||tl>0);

  if (!hasData) return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:7}}>
        {[{k:'Gained',c:'rgba(61,204,126,0.35)',v:'+0'},{k:'Lost',c:'rgba(240,80,80,0.35)',v:'-0'}].map(({k,c,v})=>(
          <div key={k} style={{textAlign:k==='Lost'?'right':'left'}}>
            <div style={{fontSize:9,color:c,letterSpacing:'.10em',textTransform:'uppercase',fontFamily:"'JetBrains Mono',monospace"}}>{k}</div>
            <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{height:H,display:'flex',alignItems:'center',justifyContent:'center',
        color:'var(--muted)',fontSize:10,border:'1px dashed rgba(255,92,26,0.08)',
        borderRadius:5,background:'rgba(255,255,255,0.01)',fontFamily:"'JetBrains Mono',monospace"}}>
        no activity yet
      </div>
    </div>
  );

  const maxV = Math.max(...data.map(d=>Math.max(d.gained,d.lost)),1);
  const STEP = W / Math.max(1, data.length-1);
  const toCX = i => i * STEP;
  const toCY = v => PT + PH - (v/maxV)*PH;

  const buildPath = key => {
    const pts = data.map((d,i)=>[toCX(i), toCY(d[key])]);
    let p = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i=1;i<pts.length;i++) {
      const cpx = ((pts[i-1][0]+pts[i][0])/2).toFixed(1);
      p += ` C ${cpx},${pts[i-1][1].toFixed(1)} ${cpx},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    return p;
  };
  const buildFill = key => {
    const pts = data.map((d,i)=>[toCX(i), toCY(d[key])]);
    const base = (PT+PH).toFixed(1);
    let p = `M ${pts[0][0].toFixed(1)},${base} L ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i=1;i<pts.length;i++) {
      const cpx = ((pts[i-1][0]+pts[i][0])/2).toFixed(1);
      p += ` C ${cpx},${pts[i-1][1].toFixed(1)} ${cpx},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    p += ` L ${pts[pts.length-1][0].toFixed(1)},${base} Z`;
    return p;
  };

  const hovD = hov !== null ? data[hov] : null;
  return (
    <div onMouseLeave={()=>setHov(null)}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:6}}>
        <div>
          <div style={{fontSize:9,color:'rgba(61,204,126,0.65)',letterSpacing:'.10em',textTransform:'uppercase',fontFamily:"'JetBrains Mono',monospace"}}>Gained</div>
          <div style={{fontSize:20,fontWeight:800,lineHeight:1,fontFamily:"'Barlow Condensed',sans-serif",
            color:hovD?(hovD.gained>0?'var(--green)':'rgba(61,204,126,0.3)'):(tg>0?'var(--green)':'rgba(61,204,126,0.3)')}}>
            +{hovD?hovD.gained:tg}
          </div>
        </div>
        {hovD && <div style={{fontSize:9,color:'var(--accent)',background:'var(--accent-d)',padding:'2px 7px',borderRadius:10,border:'1px solid var(--border)',fontFamily:"'JetBrains Mono',monospace"}}>
          {23-hov===0?'now':`${23-hov}h ago`}
        </div>}
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:9,color:'rgba(240,80,80,0.65)',letterSpacing:'.10em',textTransform:'uppercase',fontFamily:"'JetBrains Mono',monospace"}}>Lost</div>
          <div style={{fontSize:20,fontWeight:800,lineHeight:1,fontFamily:"'Barlow Condensed',sans-serif",
            color:hovD?(hovD.lost>0?'var(--red)':'rgba(240,80,80,0.3)'):(tl>0?'var(--red)':'rgba(240,80,80,0.3)')}}>
            -{hovD?hovD.lost:tl}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:H,display:'block',overflow:'visible'}}>
        <defs>
          <linearGradient id="fgG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3DCC7E" stopOpacity="0.32"/>
            <stop offset="100%" stopColor="#3DCC7E" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="fgR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F05050" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#F05050" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[.25,.5,.75].map((f,i)=>(
          <line key={i} x1={0} y1={(PT+PH*f).toFixed(1)} x2={W} y2={(PT+PH*f).toFixed(1)}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,5"/>
        ))}
        <path d={buildFill('gained')} fill="url(#fgG)"/>
        <path d={buildFill('lost')}   fill="url(#fgR)"/>
        <path d={buildPath('gained')} fill="none" stroke="#3DCC7E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={buildPath('lost')}   fill="none" stroke="#F05050" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        {hov !== null && <>
          <line x1={toCX(hov).toFixed(1)} y1={PT-4} x2={toCX(hov).toFixed(1)} y2={PT+PH}
            stroke="rgba(255,92,26,0.3)" strokeWidth="1" strokeDasharray="2,3"/>
          {data[hov].gained>0 && <circle cx={toCX(hov)} cy={toCY(data[hov].gained)} r="3.5" fill="#3DCC7E" stroke="var(--bg3)" strokeWidth="1.5"/>}
          {data[hov].lost>0   && <circle cx={toCX(hov)} cy={toCY(data[hov].lost)}   r="3.5" fill="#F05050" stroke="var(--bg3)" strokeWidth="1.5"/>}
        </>}
        <line x1={0} y1={(PT+PH+0.5).toFixed(1)} x2={W} y2={(PT+PH+0.5).toFixed(1)} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
        {[{i:0,l:'24h'},{i:5,l:'18h'},{i:11,l:'12h'},{i:17,l:'6h'},{i:23,l:'now'}].map(t=>(
          <text key={t.l} x={toCX(t.i).toFixed(1)} y={H-2}
            textAnchor={t.i===0?'start':t.i===23?'end':'middle'}
            fontSize="8" fill={hov===t.i?'var(--accent)':'var(--muted)'}
            fontFamily="'JetBrains Mono',monospace">{t.l}</text>
        ))}
        {data.map((d,i)=>{
          const w = (i===0||i===data.length-1)?STEP/2:STEP;
          const sx = i===0?0:toCX(i)-STEP/2;
          return <rect key={`hz${i}`} x={sx} y={0} width={w} height={H} fill="transparent" style={{cursor:'crosshair'}} onMouseEnter={()=>setHov(i)}/>;
        })}
      </svg>
    </div>
  );
}

// ─── AccountChangesPanel ──────────────────────────────────────────────────────
function AccountChangesPanel({ changes, loading, hasScanned }) {
  if (!hasScanned) return <div style={{padding:'12px 0',textAlign:'center',color:'var(--muted)',fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>scan an account first</div>;
  if (loading) return <div style={{padding:'14px 0',textAlign:'center'}}><Spinner size={14}/></div>;
  if (changes.gained.length===0 && changes.lost.length===0)
    return <div style={{padding:'12px 0',textAlign:'center',color:'var(--muted)',fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>no changes this period</div>;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
        {changes.total_gained>0 && <span className="badge-g">+{changes.total_gained} gained</span>}
        {changes.total_lost>0   && <span className="badge-r">-{changes.total_lost} lost</span>}
      </div>
      {changes.gained.length>0 && (
        <div>
          <div style={{fontSize:9,color:'rgba(61,204,126,0.6)',textTransform:'uppercase',letterSpacing:'.10em',marginBottom:5,fontFamily:"'JetBrains Mono',monospace",display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:4,height:4,borderRadius:'50%',background:'var(--green)',display:'inline-block'}}/>gained
          </div>
          {changes.gained.slice(0,6).map((item,i)=>(
            <div key={i} className="chg-row-g">
              <ItemLink name={item.name} style={{fontSize:11}} color="var(--text)"/>
              <span style={{fontSize:11,fontWeight:700,color:'var(--green)',flexShrink:0}}>+{item.amount}</span>
            </div>
          ))}
          {changes.gained.length>6 && <div style={{fontSize:10,color:'var(--muted)',textAlign:'center',paddingTop:2,fontFamily:"'JetBrains Mono',monospace"}}>+{changes.gained.length-6} more</div>}
        </div>
      )}
      {changes.lost.length>0 && (
        <div style={{marginTop:changes.gained.length>0?2:0}}>
          <div style={{fontSize:9,color:'rgba(240,80,80,0.6)',textTransform:'uppercase',letterSpacing:'.10em',marginBottom:5,fontFamily:"'JetBrains Mono',monospace",display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:4,height:4,borderRadius:'50%',background:'var(--red)',display:'inline-block'}}/>lost / sold
          </div>
          {changes.lost.slice(0,6).map((item,i)=>(
            <div key={i} className="chg-row-l">
              <ItemLink name={item.name} style={{fontSize:11}} color="var(--text)"/>
              <span style={{fontSize:11,fontWeight:700,color:'var(--red)',flexShrink:0}}>-{item.amount}</span>
            </div>
          ))}
          {changes.lost.length>6 && <div style={{fontSize:10,color:'var(--muted)',textAlign:'center',paddingTop:2,fontFamily:"'JetBrains Mono',monospace"}}>+{changes.lost.length-6} more</div>}
        </div>
      )}
    </div>
  );
}

// ─── BatchScanner ─────────────────────────────────────────────────────────────
function BatchScanner({ onDone }) {
  const [input,   setInput]   = useState('');
  const [running, setRunning] = useState(false);
  const [status,  setStatus]  = useState({found:0,skipped:0,current:0,total:0,ok:0,fail:0});
  const [logs,    setLogs]    = useState([]);

  const run = async () => {
    if (!input.trim()) return;
    const regex = /https?:\/\/(www\.)?steamcommunity\.com\/(id|profiles)\/[a-zA-Z0-9_-]+/gi;
    const unique = [...new Set((input.match(regex)||[]).map(u=>u.replace(/\/$/,'').toLowerCase()))];
    if (!unique.length) { alert('No valid Steam links found.'); return; }

    setRunning(true); setLogs([]);
    setStatus({found:unique.length,skipped:0,current:0,total:0,ok:0,fail:0});

    let existing = [];
    try { const d = await api.trackedUrls(); existing = (d.urls||[]).map(u=>u.toLowerCase().replace(/\/$/,'')); } catch {}

    const toScan = []; let skipped = 0;
    unique.forEach(u => {
      if (existing.some(e=>e===u||e.includes(u)||u.includes(e))) {
        skipped++;
        setLogs(p=>[...p,{url:u,s:'skip',msg:'Already tracked'}]);
      } else toScan.push(u);
    });
    setStatus(p=>({...p,skipped:skipped,total:toScan.length}));

    for (let i=0; i<toScan.length; i++) {
      setStatus(p=>({...p,current:i+1}));
      try {
        await api.scrape(toScan[i], false);
        setStatus(p=>({...p,ok:p.ok+1}));
        setLogs(p=>[...p,{url:toScan[i],s:'ok',msg:'Added'}]);
      } catch {
        setStatus(p=>({...p,fail:p.fail+1}));
        setLogs(p=>[...p,{url:toScan[i],s:'err',msg:'Failed'}]);
      }
      if (i<toScan.length-1) await new Promise(r=>setTimeout(r,3000));
    }
    setRunning(false); onDone();
  };

  return (
    <div>
      <p style={{fontSize:11,color:'var(--muted)',marginBottom:9,lineHeight:1.5,fontFamily:"'JetBrains Mono',monospace"}}>
        Paste Discord logs or link lists — extracts valid Steam URLs automatically.
      </p>
      <textarea value={input} onChange={e=>setInput(e.target.value)} disabled={running}
        className="batch-textarea"
        placeholder={'jacobinhio — 09/04/2026 11:18\nhttps://steamcommunity.com/profiles/76561...\nsome random text...'}/>
      <button onClick={run} disabled={running||!input.trim()} className="btn-pri" style={{width:'100%',marginTop:8,justifyContent:'center'}}>
        {running ? <><Spinner size={12}/> Scanning {status.current}/{status.total}</> : 'Extract & Scan Links'}
      </button>
      {(status.found>0||logs.length>0) && (
        <div style={{marginTop:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:7}}>
            {[{l:'Found',v:status.found,c:'var(--blue)'},{l:'Skipped',v:status.skipped,c:'var(--accent)'},{l:'Added',v:status.ok,c:'var(--green)'},{l:'Failed',v:status.fail,c:'var(--red)'}].map(({l,v,c})=>(
              <div key={l} style={{padding:'5px 8px',background:'rgba(255,255,255,0.03)',borderRadius:4,border:'1px solid var(--border3)'}}>
                <div style={{fontSize:9,color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.10em',textTransform:'uppercase'}}>{l}</div>
                <div style={{fontSize:15,fontWeight:800,color:c,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(0,0,0,0.2)',border:'1px solid var(--border3)',borderRadius:5,padding:6,maxHeight:150,overflowY:'auto'}}>
            {logs.map((log,i)=>{
              const short = log.url.split('/').filter(Boolean).pop();
              const c = log.s==='ok'?'var(--green)':log.s==='skip'?'var(--accent)':'var(--red)';
              return (
                <div key={i} className="log-item" style={{borderLeft:`2px solid ${c}`}}>
                  <span style={{fontSize:10,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{short}</span>
                  <span style={{fontSize:9,color:c,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{log.msg}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InventoryView ────────────────────────────────────────────────────────────
function InventoryView({ items, loading, fType, setFType, search, setSearch, chartData, acctChanges, acctDays, setAcctDays, acctLoading, hasScanned, bulkItems, onBatchDone }) {
  const [sortCfg, setSortCfg] = useState({ key:'price', dir:'desc' });
  const [page,    setPage]    = useState(1);

  const handleSort = key => {
    setSortCfg(prev=>({key, dir:prev.key===key?(prev.dir==='asc'?'desc':'asc'):'desc'}));
    setPage(1);
  };
  const si = key => sortCfg.key===key
    ? <span className="sort-ico on">{sortCfg.dir==='asc'?'↑':'↓'}</span>
    : <span className="sort-ico">↕</span>;

  const filtered = useMemo(()=>{
    let list = [...items];
    if (search)               list = list.filter(i=>i.name.toLowerCase().includes(search.toLowerCase()));
    if (fType==='Knives')     list = list.filter(i=>i.isKnife);
    if (fType==='Gloves')     list = list.filter(i=>i.isGlove);
    if (fType==='StatTrak')   list = list.filter(i=>i.type==='StatTrak');
    if (fType==='Souvenir')   list = list.filter(i=>i.type==='Souvenir'&&!i.name.includes('Souvenir Package'));
    if (fType==='Cases')      list = list.filter(i=>i.weaponType==='Container'||(i.name.includes('Case')&&!i.name.includes('Hardened')&&!i.name.includes('Capsule')));
    if (fType==='Souvenir Packages') list = list.filter(i=>i.name.includes('Souvenir Package'));
    if (fType==='Capsules')   list = list.filter(i=>i.name.includes('Capsule'));
    if (fType==='Stickers')   list = list.filter(i=>i.name.includes('Sticker |'));
    if (fType==='Graffitis')  list = list.filter(i=>i.name.includes('Graffiti |')||i.name.includes('Sealed Graffiti'));
    if (fType==='Keychains')  list = list.filter(i=>i.name.includes('Charm |'));
    list.sort((a,b)=>{
      let r = 0;
      if (sortCfg.key==='price')  r = b.price - a.price;
      if (sortCfg.key==='name')   r = a.name.localeCompare(b.name);
      if (sortCfg.key==='type')   r = a.weaponType.localeCompare(b.weaponType);
      if (sortCfg.key==='rarity') r = (RARITY_WEIGHT[getDisplayRarity(b)]||0)-(RARITY_WEIGHT[getDisplayRarity(a)]||0);
      return sortCfg.dir==='asc' ? -r : r;
    });
    return list;
  }, [items, search, fType, sortCfg]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalVal   = items.reduce((s,i)=>s+i.price, 0);

  return (
    <div className="tracker-layout">
      {/* ── MAIN TABLE ── */}
      <div className="tracker-main">
        {/* Filter bar */}
        <div className="card" style={{padding:'10px 14px',marginBottom:12}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              placeholder="🔍  Search items…" className="inp" style={{width:190}}/>
            <div className="filter-row">
              {['All','Knives','Gloves','StatTrak','Souvenir'].map(f=>(
                <button key={f} className={`pill${fType===f?' active':''}`}
                  onClick={()=>{setFType(f);setPage(1);}}>{f}</button>
              ))}
            </div>
            <span style={{marginLeft:'auto',fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--muted)'}}>
              {filtered.length.toLocaleString()} items
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="tbl-head inv-grid">
            <div style={{textAlign:'right'}}>#</div>
            <div style={{cursor:'pointer',userSelect:'none'}} onClick={()=>handleSort('name')}>NAME {si('name')}</div>
            <div style={{cursor:'pointer',userSelect:'none'}} onClick={()=>handleSort('rarity')}>RARITY {si('rarity')}</div>
            <div style={{cursor:'pointer',userSelect:'none'}} onClick={()=>handleSort('type')}>TYPE {si('type')}</div>
            <div style={{textAlign:'right',cursor:'pointer',userSelect:'none'}} onClick={()=>handleSort('price')}>PRICE {si('price')}</div>
          </div>

          {loading && <div className="center-state"><Spinner/>Scanning inventory…</div>}
          {!loading && filtered.length===0 && (
            <div className="empty-state">
              {items.length===0
                ? <>Paste a Steam profile URL above and press <strong style={{color:'var(--accent)'}}>SCAN</strong>.</>
                : 'No items match the current filters.'}
            </div>
          )}

          {pageItems.map((item,i)=>{
            const rn = getDisplayRarity(item);
            const color = rc(rn);
            return (
              <div key={`${item.assetId}-${i}`} className="tbl-row inv-grid">
                <div style={{fontSize:11,color:'var(--muted)',textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{(page-1)*PAGE_SIZE+i+1}</div>
                <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0,boxShadow:`0 0 5px ${color}88`}}/>
                  <ItemLink name={item.name} style={{fontSize:13,fontWeight:600}}/>
                </div>
                <div>
                  <span className="rarity-pill" style={{background:`${color}18`,color,border:`1px solid ${color}44`}}>{rn}</span>
                </div>
                <div style={{fontSize:11,color:'var(--muted)'}}>{item.weaponType}</div>
                <div style={{fontSize:13,fontWeight:700,textAlign:'right',fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'.04em',
                  color:item.price>=100?'var(--accent)':'var(--text)'}}>${item.price.toFixed(2)}</div>
              </div>
            );
          })}

          {totalPages>1 && (
            <div className="pager">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prev</button>
              <span className="muted">Page <b style={{color:'var(--text)',fontFamily:"'Barlow Condensed',sans-serif",fontSize:13}}>{page}</b> / {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── SIDEBAR ── */}
      <div className="sidebar">
        {/* Stats */}
        <div className="sbar-sect">
          <div className="sbar-title">Inventory Stats</div>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Items</div>
              <div className="stat-value">{items.length}</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-label" style={{color:'var(--accent)'}}>Value</div>
              <div className="stat-value" style={{color:'var(--accent)',fontSize:22}}>{fmtVal(totalVal)}</div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="sbar-sect">
          <div className="sbar-title">Global 24H Flow</div>
          <MiniLineChart data={chartData}/>
        </div>

        {/* Account Activity */}
        <div className="sbar-sect">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:11,paddingBottom:8,borderBottom:'1px solid var(--border3)'}}>
            <span className="sbar-title" style={{margin:0,padding:0,border:'none'}}>Account Activity</span>
            <div style={{display:'flex',gap:3}}>
              {[1,3,7].map(d=>(
                <button key={d} className={`day-tab${acctDays===d?' active':''}`} onClick={()=>setAcctDays(d)}>{d}D</button>
              ))}
            </div>
          </div>
          <AccountChangesPanel changes={acctChanges} loading={acctLoading} hasScanned={hasScanned}/>
        </div>

        {/* Categories */}
        <div className="sbar-sect">
          <div className="sbar-title">Categories</div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {['Cases','Souvenir Packages','Capsules','Stickers','Graffitis','Keychains'].map(f=>(
              <button key={f} className={`cat-btn${fType===f?' active':''}`} onClick={()=>{setFType(f);setPage(1);}}>
                <span>{f}</span>
                <span style={{fontSize:10,opacity:.4}}>→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bulk items */}
        {bulkItems.length>0 && (
          <div className="sbar-sect">
            <div className="sbar-title">Bulk Items (&gt;3)</div>
            <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:175,overflowY:'auto'}}>
              {bulkItems.map(b=>(
                <div key={b.name} className="bulk-item">
                  <ItemLink name={b.name} style={{fontSize:11}}/>
                  <span className="cnt-badge">{b.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Batch scanner */}
        <div className="sbar-sect">
          <div className="sbar-title">Add Multiple Accounts</div>
          <BatchScanner onDone={onBatchDone}/>
        </div>
      </div>
    </div>
  );
}

// ─── PumpView ─────────────────────────────────────────────────────────────────
function PumpView({ triggerScan }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const lastTs                = useRef(null);

  const analyze = useCallback(async (url) => {
    if (!url?.trim()) return;
    setLoading(true); setError(''); setData(null);
    try   { setData(await api.analyzePump(url.trim())); }
    catch (e) { setError(e.message); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => {
    if (triggerScan && triggerScan.ts !== lastTs.current) {
      lastTs.current = triggerScan.ts;
      analyze(triggerScan.url);
    }
  }, [triggerScan, analyze]);

  const r = data?.result;
  return (
    <div className="card" style={{padding:'20px'}}>
      {error   && <div className="error-bar">⚠ {error}</div>}
      {loading && <div className="center-state"><Spinner/>Analyzing pump signals…</div>}
      {!loading && !data && !error && (
        <div className="empty-state">Paste a SteamDT item URL above and click ANALYZE.</div>
      )}
      {r && (
        <div className="fade-in">
          <h3 className="pump-name">{data.name}</h3>
          <div className="pump-grid">
            <div className="pump-card accent-border">
              <div className="stat-label">Pump Score</div>
              <div className="stat-value" style={{color:'var(--accent)'}}>{r.pump_score}</div>
              <div className="muted small" style={{marginTop:5}}>{r.pump_label}</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">Price</div>
              <div className="stat-value">${r.price?.toFixed(2)}</div>
              <div className="muted small" style={{marginTop:5}}>USD</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">DNA</div>
              <div className="pump-val-md">{r.dna_label}</div>
              <div className="muted small" style={{marginTop:5}}>{r.dna_score}</div>
            </div>
            <div className="pump-card">
              <div className="stat-label">Status</div>
              <div className="pump-val-md" style={{color:r.is_exploding?'#FF6B6B':'var(--accent)'}}>{r.mode}</div>
            </div>
          </div>
          {data.chart_base64 && (
            <img src={`data:image/png;base64,${data.chart_base64}`} alt="chart" className="pump-chart"/>
          )}
          {r.signals?.length>0 && (
            <div className="signals-box">
              <div className="stat-label" style={{marginBottom:9}}>Signals</div>
              {r.signals.map((sig,i)=>(
                <div key={i} className="signal-row">
                  <span className={`signal-dot ${sig.positive?'pos':'neg'}`}/>
                  <span>{sig.label}</span>
                  <span className="muted small" style={{marginLeft:'auto'}}>{sig.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RecentChangesView ────────────────────────────────────────────────────────
function RecentChangesView() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('Latest');

  useEffect(()=>{
    api.recentChanges().then(d=>setChanges(d.changes||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const sorted = useMemo(()=>{
    let list = changes.filter(c=>c.total_gained>0||c.total_lost>0);
    if (filter==='Most Gained') list.sort((a,b)=>b.total_gained-a.total_gained);
    if (filter==='Most Lost')   list.sort((a,b)=>b.total_lost-a.total_lost);
    return list;
  }, [changes, filter]);

  return (
    <div className="fade-in">
      <div className="sec-hdr">
        <span className="sec-title">24H Inventory Changes</span>
        <div className="filter-row">
          {['Latest','Most Gained','Most Lost'].map(f=>(
            <button key={f} className={`pill${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="tbl-head chg-grid">
          <div>Profile</div><div>Time</div><div>Summary</div><div>Top Changes</div>
        </div>
        {loading && <div className="center-state"><Spinner/>Loading changes…</div>}
        {!loading && sorted.length===0 && <div className="empty-state">No inventory changes recorded yet.</div>}
        {sorted.map((c,i)=>(
          <div key={i} className="tbl-row chg-grid">
            <div style={{minWidth:0}}>
              <a href={c.url} target="_blank" rel="noopener noreferrer"
                style={{color:'var(--text)',textDecoration:'none',fontSize:13,fontWeight:600,display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                onMouseEnter={e=>e.target.style.color='var(--accent)'}
                onMouseLeave={e=>e.target.style.color='var(--text)'}>
                {c.url.split('/').filter(Boolean).pop()}
              </a>
              <div style={{fontSize:10,color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>{c.url}</div>
            </div>
            <div style={{fontSize:10,color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace"}}>
              {new Date(c.time*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
              <div style={{marginTop:1}}>{new Date(c.time*1000).toLocaleDateString([],{month:'short',day:'numeric'})}</div>
            </div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'flex-start'}}>
              {c.total_gained>0 && <span className="badge-g">+{c.total_gained}</span>}
              {c.total_lost>0   && <span className="badge-r">-{c.total_lost}</span>}
            </div>
            <div style={{fontSize:11,display:'flex',flexDirection:'column',gap:3}}>
              {c.gained.slice(0,2).map((item,j)=>(
                <div key={`g${j}`} style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{color:'var(--green)',fontSize:10,fontWeight:700,flexShrink:0}}>+{item.amount}</span>
                  <ItemLink name={item.name} color="var(--green)" style={{fontSize:11}}/>
                </div>
              ))}
              {c.lost.slice(0,2).map((item,j)=>(
                <div key={`l${j}`} style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{color:'var(--red)',fontSize:10,fontWeight:700,flexShrink:0}}>-{item.amount}</span>
                  <ItemLink name={item.name} color="var(--red)" style={{fontSize:11}}/>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── OverviewView ─────────────────────────────────────────────────────────────
function OverviewView() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    api.overview().then(d=>setData(d.overview||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const hot = data.filter(i=>i.accounts>=2);

  return (
    <div className="fade-in">
      <div className="sec-hdr">
        <span className="sec-title">24H Overview — All Accounts</span>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--muted)'}}>{data.length} unique items</span>
      </div>

      {!loading && hot.length>0 && (
        <div className="hot-alert">
          <div style={{fontSize:12,fontWeight:700,color:'var(--red)',marginBottom:11,display:'flex',alignItems:'center',gap:8,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'.07em',textTransform:'uppercase'}}>
            🚨 Bought by 2+ accounts in last 24h
          </div>
          {hot.map(item=>(
            <div key={item.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderTop:'1px solid rgba(240,80,80,0.08)'}}>
              <ItemLink name={item.name} style={{fontSize:13,fontWeight:600}}/>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <span style={{fontSize:11,color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace"}}>{item.accounts} accounts</span>
                <span style={{fontSize:14,fontWeight:800,color:'var(--red)',fontFamily:"'Barlow Condensed',sans-serif"}}>{item.amount}×</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="tbl-head ovw-grid">
          <div style={{textAlign:'right'}}>#</div>
          <div>Item Name</div>
          <div style={{textAlign:'center'}}>Amount</div>
          <div style={{textAlign:'right'}}>Accounts</div>
        </div>
        {loading && <div className="center-state"><Spinner/>Loading overview…</div>}
        {!loading && data.length===0 && <div className="empty-state">No items acquired in the last 24 hours.</div>}
        {data.map((item,i)=>{
          const isHot = item.accounts>=2;
          return (
            <div key={item.name} className="tbl-row ovw-grid"
              style={{borderLeft:isHot?'2px solid rgba(240,80,80,0.4)':'2px solid transparent',
                background:isHot?'rgba(240,80,80,0.025)':'transparent'}}>
              <div style={{fontSize:11,color:'var(--muted)',textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{i+1}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                {isHot && <span style={{fontSize:12,flexShrink:0}}>🚨</span>}
                <ItemLink name={item.name} style={{fontSize:13,fontWeight:600}}/>
              </div>
              <div style={{textAlign:'center',fontSize:14,fontWeight:800,fontFamily:"'Barlow Condensed',sans-serif",
                color:isHot?'var(--red)':'var(--green)'}}>{item.amount}×</div>
              <div style={{textAlign:'right'}}>
                <span style={{fontSize:11,fontWeight:600,padding:'2px 6px',borderRadius:3,fontFamily:"'JetBrains Mono',monospace",
                  background:isHot?'var(--redd)':'var(--greend)',
                  color:isHot?'var(--red)':'var(--green)',
                  border:`1px solid ${isHot?'var(--redb)':'var(--greenb)'}`}}>
                  {item.accounts}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PortfolioView ────────────────────────────────────────────────────────────
function PortfolioView() {
  const [userId,    setUserId]    = useState('me');
  const [profileUrl,setProfile]  = useState('https://steamcommunity.com/id/NotnFaZe');
  const [loading,   setLoading]  = useState(false);
  const [portfolio, setPortfolio]= useState([]);
  const [msg,       setMsg]      = useState('');

  const importFn = async () => {
    if (!profileUrl.trim()||!userId.trim()) return;
    setLoading(true); setMsg('');
    try {
      const inv    = await api.scrape(profileUrl.trim());
      const result = await api.importPortfolio(userId.trim(), inv.items);
      setPortfolio(result.items||[]);
      setMsg(`✓ Imported ${result.items?.length||0} items`);
    } catch(e) { setMsg(`⚠ ${e.message}`); }
    finally { setLoading(false); }
  };

  const loadFn = async () => {
    if (!userId.trim()) return;
    setLoading(true); setMsg('');
    try {
      const d = await api.getPortfolio(userId.trim());
      setPortfolio(d.items||[]);
      setMsg(`✓ Loaded ${d.items?.length||0} items`);
    } catch(e) { setMsg(`⚠ ${e.message}`); }
    finally { setLoading(false); }
  };

  const total = portfolio.reduce((s,p)=>s+p.quantity*p.avg_price, 0);

  return (
    <div className="fade-in">
      <div className="sec-hdr"><span className="sec-title">Portfolio Tracker</span></div>
      <div className="card" style={{padding:'18px'}}>
        <div className="port-controls">
          <input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="User ID" className="inp" style={{width:110}}/>
          <input value={profileUrl} onChange={e=>setProfile(e.target.value)} placeholder="Steam profile URL" className="inp" style={{flex:1}}/>
          <button onClick={importFn} disabled={loading} className="btn-pri">{loading?<><Spinner size={12}/>Importing…</>:'Import'}</button>
          <button onClick={loadFn} disabled={loading} className="btn-ghost-sm">{loading?'Loading…':'Load saved'}</button>
        </div>
        {msg && <div className="port-msg">{msg}</div>}
        {portfolio.length>0 && (
          <>
            <div className="port-total">
              Portfolio value: <strong style={{color:'var(--accent)',fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:800}}>{fmtVal(total)}</strong>
            </div>
            <div className="tbl-head port-grid">
              <span>Item</span><span className="tar">Qty</span><span className="tar">Avg buy</span><span className="tar">Total</span>
            </div>
            {portfolio.map(p=>(
              <div key={p.item_name} className="tbl-row port-grid">
                <div><ItemLink name={p.item_name} style={{fontSize:13,fontWeight:600}}/></div>
                <div className="tar muted">{p.quantity}</div>
                <div className="tar muted">${p.avg_price?.toFixed(2)}</div>
                <div className="tar bold">${(p.quantity*p.avg_price).toFixed(2)}</div>
              </div>
            ))}
          </>
        )}
        {!portfolio.length && !loading && (
          <div className="empty-state">Import an inventory or load a saved portfolio.</div>
        )}
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const TABS = [
  { id:'inventory', emoji:'📦', label:'Inventory',       placeholder:'Steam profile URL…' },
  { id:'pump',      emoji:'🐠', label:'Pump',            placeholder:'SteamDT.com item URL…' },
  { id:'changes',   emoji:'📊', label:'Recent Changes',  placeholder: null },
  { id:'overview',  emoji:'🔥', label:'Overview',        placeholder: null },
  { id:'portfolio', emoji:'💼', label:'Portfolio',       placeholder: null },
];

export default function App() {
  const [view,         setView]        = useState('inventory');
  const [invUrl,       setInvUrl]      = useState('https://steamcommunity.com/id/NotnFaZe');
  const [pumpUrl,      setPumpUrl]     = useState('');
  const [pumpTrigger,  setPumpTrigger] = useState(null);
  const [loading,      setLoading]     = useState(false);
  const [items,        setItems]       = useState([]);
  const [error,        setError]       = useState('');
  const [cacheMsg,     setCacheMsg]    = useState('');
  const [search,       setSearch]      = useState('');
  const [fType,        setFType]       = useState('All');
  const [chartData,    setChartData]   = useState([]);
  const [acctChanges,  setAcctChanges] = useState({gained:[],lost:[],total_gained:0,total_lost:0});
  const [acctDays,     setAcctDays]    = useState(1);
  const [acctLoading,  setAcctLoading] = useState(false);
  const [resolvedUrl,  setResolvedUrl] = useState('');

  const loadChart = useCallback(async () => {
    try { const d = await api.dailyChart(); setChartData(d.chart||[]); } catch {}
  }, []);

  const loadAcctChanges = useCallback(async (url, days) => {
    if (!url) return;
    setAcctLoading(true);
    try { const d = await api.acctChanges(url, days); setAcctChanges(d); } catch {}
    finally { setAcctLoading(false); }
  }, []);

  useEffect(()=>{ loadChart(); }, [loadChart]);
  useEffect(()=>{ if (resolvedUrl) loadAcctChanges(resolvedUrl, acctDays); }, [acctDays, resolvedUrl, loadAcctChanges]);

  const handleScan = useCallback(async (force=false) => {
    if (!invUrl.trim()||loading) return;
    setLoading(true); setError(''); setCacheMsg(''); setView('inventory');
    try {
      const d = await api.scrape(invUrl.trim(), force);
      setItems(d.items); setInvUrl(d.resolved_url); setResolvedUrl(d.resolved_url);
      setCacheMsg(d.cached ? 'Loaded from 24h cache.' : 'Fresh data synced.');
      if (!d.cached) loadChart();
      loadAcctChanges(d.resolved_url, acctDays);
    } catch(e) { setError(e.message||'Failed to fetch inventory.'); }
    finally { setLoading(false); }
  }, [invUrl, loading, loadChart, loadAcctChanges, acctDays]);

  const bulkItems = useMemo(()=>{
    const c = {};
    items.forEach(i=>{ c[i.name] = c[i.name] ? c[i.name]+1 : 1; });
    return Object.entries(c).filter(([,n])=>n>3).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  }, [items]);

  const activeTab  = TABS.find(t=>t.id===view);
  const showInput  = activeTab?.placeholder !== null;
  const currentUrl = view==='pump' ? pumpUrl : invUrl;
  const setUrl     = view==='pump' ? setPumpUrl : setInvUrl;

  const handleAction = () => {
    if (view==='inventory') handleScan(false);
    else if (view==='pump') setPumpTrigger({ url:pumpUrl, ts:Date.now() });
  };

  return (
    <>
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">🔥</div>
            <div>
              <div className="logo-title">
                FENIX TOOLS
                <a href="https://www.youtube.com/@fenixs2555" target="_blank" rel="noopener noreferrer" className="yt-badge">
                  <YTIcon/> YT
                </a>
              </div>
              <div className="logo-sub">CS2 TRACKING SUITE</div>
            </div>
          </div>

          <nav className="nav-tabs">
            {TABS.map(t=>(
              <button key={t.id} className={`nav-tab${view===t.id?' active':''}`}
                onClick={()=>setView(t.id)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </nav>

          {showInput && (
            <div className="search-bar">
              <input
                value={currentUrl}
                onChange={e=>setUrl(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleAction()}
                placeholder={activeTab.placeholder}
                className="search-input"
              />
              <button onClick={handleAction} disabled={loading} className="btn-scan">
                {loading ? <><Spinner size={13}/>Scanning…</> : view==='pump' ? 'ANALYZE' : 'SCAN'}
              </button>
              {view==='inventory' && (
                <button onClick={()=>handleScan(true)} disabled={loading} className="btn-refresh" title="Force fresh data">↻</button>
              )}
            </div>
          )}

          {cacheMsg && <span className="cache-msg">✓ {cacheMsg}</span>}
        </div>

        {error && (
          <div style={{maxWidth:1600,margin:'0 auto',padding:'0 24px 10px'}}>
            <div className="error-bar">⚠ {error}</div>
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main className="main">
        {view==='inventory' && (
          <InventoryView
            items={items} loading={loading}
            fType={fType} setFType={setFType}
            search={search} setSearch={setSearch}
            chartData={chartData}
            acctChanges={acctChanges} acctDays={acctDays} setAcctDays={setAcctDays}
            acctLoading={acctLoading} hasScanned={!!resolvedUrl}
            bulkItems={bulkItems}
            onBatchDone={loadChart}
          />
        )}
        {view==='pump'      && <PumpView triggerScan={pumpTrigger}/>}
        {view==='changes'   && <RecentChangesView/>}
        {view==='overview'  && <OverviewView/>}
        {view==='portfolio' && <PortfolioView/>}

        <div className="footer">
          <span className="footer-text">FENIX TOOLS · PRICES VIA STEAMDT.COM · CNY → USD @ 0.14</span>
          <a href="https://www.youtube.com/@fenixs2555" target="_blank" rel="noopener noreferrer" className="footer-yt">
            youtube.com/@fenixs2555
          </a>
        </div>
      </main>
    </>
  );
}
