import { useRef, useState } from 'react';
import { Camera, Search, X, ChevronRight, Zap, FileText, CheckCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { manualSearch, scanOcr, scanOcrImage, scanQr } from '../../api/scanApi';
import '../../styles/ScanPage.css';

// ---------- Claude Vision OCR (same logic as CustomerScan) ----------
async function readImageWithClaude(imageFile) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(imageFile);
  });

  const mediaType = imageFile.type || 'image/jpeg';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `You are an expert OCR system for industrial electrical equipment labels in Thai factories.
The image may be blurry, dark, tilted, low-res, or handwritten — attempt to read it regardless.

Step 1 — Read ALL visible text verbatim, character by character. Be careful with:
- Digits that look like letters: 0↔O, 1↔I/L, 5↔S, 8↔B, 6↔G
- Short codes on sticky notes: MDB, SDB, DB, ATS, MCC, L1, PP, DP
- Long numeric serials (6-12 digits) — read every digit carefully

Step 2 — Classify into:
- serial: serial/SN number
- panel_code: cabinet/panel tag (e.g. "MDB", "9DP", "DB-A")
- meter_name: meter or device name
- ip: IP address
- mac: MAC address
- model: device model
- other_codes: ALL other alphanumeric codes/numbers found
- raw_text: complete verbatim transcript
- search_terms: array of 3-6 BEST search tokens to find this device — include OCR variants for ambiguous chars
- confidence: "high" | "medium" | "low"

Return ONLY valid JSON, no markdown:
{"serial":null,"panel_code":null,"meter_name":null,"ip":null,"mac":null,"model":null,"other_codes":[],"raw_text":"","search_terms":[],"confidence":"medium"}`,
          },
        ],
      }],
    }),
  });

  const data = await response.json();
  const text = data.content?.map((c) => c.text || '').join('') || '';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { raw_text: text };
  }
}

function buildSearchTermsFromOcr(ocrData) {
  const terms = [];
  const seen = new Set();
  function add(v) {
    if (!v) return;
    const s = String(v).trim();
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); terms.push(s); }
  }
  (ocrData.search_terms || []).forEach(add);
  add(ocrData.serial); add(ocrData.panel_code); add(ocrData.meter_name);
  add(ocrData.ip); add(ocrData.model); add(ocrData.mac);
  (ocrData.other_codes || []).forEach(add);
  if (terms.length === 0 && ocrData.raw_text) add(ocrData.raw_text.slice(0, 100));
  return terms.slice(0, 8);
}

function entityIcon(type) {
  if (type === 'meter') return '📟';
  if (type === 'panel') return '⚡';
  if (type === 'loop') return '🔁';
  if (type === 'project') return '🏢';
  return '📦';
}

// ---------- Confirmation Sheet ----------
function ConfirmSheet({ results, onConfirm, onDismiss }) {
  const [selected, setSelected] = useState(results[0]);

  return (
    <div style={cs.overlay}>
      <div style={cs.sheet}>
        <div style={cs.handle} />

        <div style={cs.header}>
          <CheckCircle size={18} color="#16a34a" />
          <h3 style={cs.title}>พบ {results.length} รายการ — เลือกที่ต้องการ</h3>
          <button type="button" style={cs.closeBtn} onClick={onDismiss}><X size={18} /></button>
        </div>

        {results.map((r) => (
          <button
            key={`${r.entity_type}-${r.entity_id}`}
            type="button"
            style={{ ...cs.row, ...(selected === r ? cs.rowSelected : {}) }}
            onClick={() => setSelected(r)}
          >
            <span style={cs.icon}>{entityIcon(r.entity_type)}</span>
            <div style={cs.info}>
              <span style={cs.badge}>{r.entity_type}</span>
              <strong style={cs.name}>{r.title}</strong>
              {r.subtitle && <span style={cs.sub}>{r.subtitle}</span>}
            </div>
            <div style={{ ...cs.radio, ...(selected === r ? cs.radioOn : {}) }} />
          </button>
        ))}

        <button type="button" style={cs.confirmBtn} onClick={() => onConfirm(selected)} disabled={!selected}>
          เปิด {selected?.title} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

const cs = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', maxWidth: 520, margin: '0 auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: '10px 20px 36px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh', overflowY: 'auto' },
  handle: { width: 40, height: 4, background: '#e5e7eb', borderRadius: 99, margin: '0 auto 8px' },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { margin: 0, fontSize: 14, fontWeight: 700, color: '#111', flex: 1 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', background: '#fff', width: '100%', fontFamily: 'inherit', textAlign: 'left' },
  rowSelected: { border: '2px solid #2563eb', background: '#eff6ff' },
  icon: { fontSize: 22, flexShrink: 0 },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  badge: { fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: 4, width: 'fit-content' },
  name: { fontSize: 14, color: '#111' },
  sub: { fontSize: 12, color: '#6b7280' },
  radio: { width: 18, height: 18, borderRadius: 99, border: '2px solid #d1d5db', flexShrink: 0 },
  radioOn: { border: '5px solid #2563eb', background: '#fff' },
  confirmBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
};

// ---------- OCR Preview ----------
function OcrPreview({ ocrData, onSearch, loading }) {
  const fields = [
    { label: 'Serial', value: ocrData.serial },
    { label: 'Panel Code', value: ocrData.panel_code },
    { label: 'Meter', value: ocrData.meter_name },
    { label: 'IP', value: ocrData.ip },
    { label: 'Model', value: ocrData.model },
    { label: 'MAC', value: ocrData.mac },
  ].filter((f) => f.value);
  const others = ocrData.other_codes?.filter(Boolean) || [];

  return (
    <div style={op.box}>
      <p style={op.heading}>✅ AI อ่านป้ายได้</p>
      {fields.map((f) => (
        <div key={f.label} style={op.row}>
          <span style={op.label}>{f.label}</span>
          <code style={op.value}>{f.value}</code>
        </div>
      ))}
      {others.map((c, i) => <div key={i} style={op.row}><span style={op.label}>รหัสอื่น</span><code style={op.value}>{c}</code></div>)}
      {!fields.length && !others.length && <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>ไม่พบข้อมูล ลองถ่ายรูปใหม่</p>}
      {ocrData.raw_text && (
        <details><summary style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>ข้อความดิบ</summary>
          <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{ocrData.raw_text}</p>
        </details>
      )}
      <button type="button" style={op.btn} onClick={onSearch} disabled={loading || (!fields.length && !others.length)}>
        {loading ? 'กำลังค้นหา...' : 'ค้นหาอุปกรณ์จากข้อมูลนี้'}
      </button>
    </div>
  );
}

const op = {
  box: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  heading: { margin: 0, fontSize: 14, fontWeight: 700, color: '#16a34a' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  label: { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  value: { fontSize: 13, color: '#111827', fontWeight: 600 },
  btn: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};

const styles = {
  page: { maxWidth: 520, margin: '0 auto', padding: '20px 16px 80px', fontFamily: "'Sarabun', 'Segoe UI', system-ui, sans-serif", background: '#f9fafb', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 14 },
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
  eyebrow: { margin: 0, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  tabBar: { display: 'flex', gap: 4, background: '#f3f4f6', padding: 4, borderRadius: 12 },
  tab: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { background: '#fff', color: '#111827', fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  errorBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  errorClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  videoWrap: { position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#0f172a', minHeight: 220 },
  video: { width: '100%', minHeight: 220, objectFit: 'cover', display: 'block' },
  videoOverlay: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(15,23,42,0.6)' },
  videoOverlayText: { margin: 0, fontSize: 14, color: '#e2e8f0', fontWeight: 500 },
  videoHint: { position: 'absolute', bottom: 10, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: 6 },
  scanningBadge: { display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600 },
  errorText: { margin: 0, fontSize: 13, color: '#dc2626', textAlign: 'center' },
  btnRow: { display: 'flex', gap: 10 },
  primaryBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  ghostBtn:   { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', background: '#fff', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  inlineForm: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '10px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', color: '#111827', fontFamily: 'inherit' },
  iconBtn: { padding: '10px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center' },
  label: { display: 'flex', flexDirection: 'column', gap: 8 },
  labelText: { fontSize: 14, fontWeight: 600, color: '#374151' },
  hint: { margin: 0, fontSize: 13, color: '#6b7280' },
};

// ---------- Main ----------
function Scan() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const cameraFileInputRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);

  const [activeTab, setActiveTab] = useState('camera');
  const [qrCode, setQrCode] = useState('');
  const [ocrImage, setOcrImage] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrData, setOcrData] = useState(null);
  const [searchText, setSearchText] = useState('');

  const [results, setResults] = useState([]);
  const [confirmResults, setConfirmResults] = useState(null);
  const [error, setError] = useState('');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraMsg, setCameraMsg] = useState('');
  const [busyMode, setBusyMode] = useState('');

  function stopCamera() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setCameraStatus('idle');
  }

  function openResult(result) {
    if (result.detail_path) navigate(result.detail_path);
  }

  function handleMatchedResults(nextResults) {
    setResults(nextResults);
    setError('');
    if (!nextResults.length) { setError('ไม่พบอุปกรณ์ที่ตรงกัน'); return; }
    setConfirmResults(nextResults);
  }

  function handleConfirm(result) {
    setConfirmResults(null);
    openResult(result);
  }

  function describeCameraError(err) {
    const n = err?.name;
    if (n === 'SecurityError') return 'ต้องเปิดผ่าน https หรือ http://localhost เท่านั้น เพื่อใช้งานกล้อง';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์ก่อน';
    if (n === 'NotFoundError') return 'ไม่พบกล้องในอุปกรณ์นี้';
    if (n === 'NotReadableError') return 'กล้องถูกใช้งานโดยแอปอื่นอยู่';
    return 'ไม่สามารถเข้าถึงกล้องได้';
  }

  function handleCameraFileCapture(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setOcrImage(file);
    setOcrData(null);
    setActiveTab('ocr');
  }

  async function handleDetectedQr(value) {
    setQrCode(value);
    stopCamera();
    setBusyMode('camera');
    setError('');
    try {
      const result = await scanQr(value);
      handleMatchedResults([result]);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'ไม่พบอุปกรณ์จาก QR นี้');
    } finally { setBusyMode(''); }
  }

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraMsg('เบราว์เซอร์นี้ไม่รองรับกล้อง กรุณาใช้ OCR แทน');
      return;
    }
    if (!window.isSecureContext) {
      setCameraStatus('error');
      setCameraMsg('ต้องเปิดผ่าน https หรือ http://localhost เท่านั้น (ห้ามเปิดแบบ file:// หรือ http ผ่าน IP) เพื่อใช้งานกล้อง');
      return;
    }
    setCameraStatus('active');
    try {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if ('BarcodeDetector' in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length > 0 && codes[0].rawValue) await handleDetectedQr(codes[0].rawValue);
        }, 1000);
        setCameraMsg('จ่อกล้องไปที่ QR หรือบาร์โค้ด');
      } else {
        setCameraMsg('กล้องพร้อมแล้ว แต่เบราว์เซอร์นี้ไม่รองรับ QR อัตโนมัติ');
      }
    } catch (err) {
      setCameraStatus('error');
      setCameraMsg(describeCameraError(err));
    }
  }

  async function handleQrSubmit(e) {
    e.preventDefault();
    if (!qrCode.trim()) return;
    setBusyMode('camera'); setError('');
    try {
      handleMatchedResults([await scanQr(qrCode)]);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'ไม่พบอุปกรณ์');
    } finally { setBusyMode(''); }
  }

  // OCR step 1: read with Claude Vision
  async function handleReadImage() {
    if (!ocrImage) return;
    setError(''); setOcrData(null); setBusyMode('ocr-read');
    try {
      const result = await readImageWithClaude(ocrImage);
      setOcrData(result);
    } catch {
      setError('อ่านรูปไม่สำเร็จ — ลองกรอกข้อมูลเองด้านล่าง');
    } finally { setBusyMode(''); }
  }

  // OCR step 2: search with extracted data
  async function handleOcrSearch() {
    setBusyMode('ocr'); setError('');
    if (!ocrData && !ocrText.trim()) { setError('ไม่พบข้อมูล'); setBusyMode(''); return; }
    try {
      const terms = ocrData ? buildSearchTermsFromOcr(ocrData) : [ocrText.trim()];
      if (!terms.length) throw new Error('ไม่พบข้อมูล');

      // Parallel search all terms, merge + dedup
      const allResults = await Promise.all(
        terms.map((term) => manualSearch(term).catch(() => []))
      );
      const seen = new Set();
      const merged = [];
      for (const batch of allResults) {
        for (const r of batch) {
          const key = `${r.entity_type}-${r.entity_id}`;
          if (!seen.has(key)) { seen.add(key); merged.push(r); }
        }
      }

      // Last resort: scanOcrImage with first term
      if (!merged.length && ocrImage) {
        try {
          const fallback = await scanOcrImage(ocrImage, terms[0]);
          fallback.forEach((r) => {
            const key = `${r.entity_type}-${r.entity_id}`;
            if (!seen.has(key)) { seen.add(key); merged.push(r); }
          });
        } catch { /* ignore */ }
      }

      if (!merged.length) throw new Error('ไม่พบอุปกรณ์');
      handleMatchedResults(merged);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'ค้นหาไม่สำเร็จ');
    } finally { setBusyMode(''); }
  }

  async function handleOcrTextSearch(e) {
    e.preventDefault();
    if (!ocrText.trim()) return;
    setBusyMode('ocr'); setError('');
    try {
      const matches = await manualSearch(ocrText.trim());
      if (!matches.length) throw new Error('ไม่พบอุปกรณ์');
      handleMatchedResults(matches);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'ค้นหาไม่สำเร็จ');
    } finally { setBusyMode(''); }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setBusyMode('search'); setError('');
    try {
      handleMatchedResults(await manualSearch(searchText));
    } catch (err) {
      setError(err.response?.data?.detail ?? 'ค้นหาไม่สำเร็จ');
    } finally { setBusyMode(''); }
  }

  const tabs = [
    { id: 'camera', label: 'กล้อง', icon: Camera },
    { id: 'ocr', label: 'OCR (AI)', icon: FileText },
    { id: 'search', label: 'ค้นหา', icon: Search },
  ];

  return (
    <div className="scan-container" style={styles.page}>
      {/* Confirm sheet */}
      {confirmResults && (
        <ConfirmSheet results={confirmResults} onConfirm={handleConfirm} onDismiss={() => setConfirmResults(null)} />
      )}

      {/* Header */}
      <div style={styles.header}>
        <p style={styles.eyebrow}>Field Access</p>
        <h1 style={styles.title}>สแกนอุปกรณ์</h1>
      </div>

      {/* Tab Switcher */}
      <div style={styles.tabBar}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setActiveTab(id); setError(''); if (id !== 'camera') stopCamera(); }}
            style={{ ...styles.tab, ...(activeTab === id ? styles.tabActive : {}) }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" style={styles.errorClose} onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      {/* Camera tab */}
      {activeTab === 'camera' && (
        <div style={styles.card}>
          <div style={styles.videoWrap}>
            <video ref={videoRef} autoPlay muted playsInline style={styles.video} />
            {cameraStatus === 'idle' && (
              <div style={styles.videoOverlay}>
                <Camera size={40} color="#94a3b8" />
                <p style={styles.videoOverlayText}>กดปุ่มเพื่อเปิดกล้อง</p>
              </div>
            )}
            {cameraStatus === 'active' && cameraMsg && (
              <div style={styles.videoHint}><Zap size={14} />{cameraMsg}</div>
            )}
          </div>

          {busyMode === 'camera' && (
            <div style={styles.scanningBadge}>
              <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
              กำลังค้นหาในฐานข้อมูล...
            </div>
          )}

          {cameraStatus === 'error' && <p style={styles.errorText}>{cameraMsg}</p>}

          <div style={styles.btnRow}>
            {cameraStatus !== 'active' ? (
              <button type="button" style={styles.primaryBtn} onClick={startCamera}>
                <Camera size={18} /> เปิดกล้อง
              </button>
            ) : (
              <button type="button" style={styles.ghostBtn} onClick={stopCamera}>
                <X size={18} /> หยุดกล้อง
              </button>
            )}
            <button type="button" style={styles.ghostBtn} onClick={() => cameraFileInputRef.current?.click()}>
              เลือกรูปภาพ
            </button>
          </div>

          <form onSubmit={handleQrSubmit} style={styles.inlineForm}>
            <input
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="หรือวางโค้ด QR ที่นี่..."
              style={styles.input}
            />
            <button type="submit" style={styles.iconBtn} disabled={!qrCode.trim() || busyMode === 'camera'}>
              <ChevronRight size={20} />
            </button>
          </form>

          <input ref={cameraFileInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraFileCapture} style={{ display: 'none' }} />
        </div>
      )}

      {/* OCR tab (Claude Vision) */}
      {activeTab === 'ocr' && (
        <div className="engineer-scan-card">
          <h2 className="engineer-scan-tab-heading">อ่านป้ายด้วย AI</h2>
          <label className="engineer-scan-label">
            <span className="engineer-scan-label-text">เลือกรูปภาพป้าย</span>
            <div className="engineer-scan-file-drop-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
              <input type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} ref={fileInputRef} />
              {ocrImage ? (
                <img src={URL.createObjectURL(ocrImage)} alt="Preview" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8 }} />
              ) : (
                <span className="engineer-scan-file-placeholder">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</span>
              )}
            </div>
          </label>
          <div className="engineer-scan-btn-row">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="engineer-scan-ghost-btn">
              <Paperclip size={16} /> เลือกไฟล์
            </button>
            <button type="button" onClick={handleOcrRead} disabled={!ocrImage || busyMode === 'ocr-read'} className="engineer-scan-primary-btn">
              {busyMode === 'ocr-read' ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanLine size={16} />} อ่านป้าย
            </button>
          </div>
        </div>
      )}

      {/* Search tab */}
      {activeTab === 'search' && (
        <form style={styles.card} onSubmit={handleSearch}>
          <label style={styles.label}>
            <span style={styles.labelText}>🔍 ค้นหาอุปกรณ์</span>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Serial / ชื่อมิเตอร์ / IP / MAC / ชื่อ Panel..."
              style={{ ...styles.input, fontSize: 16, padding: '14px 16px' }}
              required
              autoFocus
            />
          </label>
          <p style={styles.hint}>ตัวอย่าง: 1177340118 / MDB-01 / 192.168.0.1</p>
          <button type="submit" style={styles.primaryBtn} disabled={busyMode === 'search' || !searchText.trim()}>
            {busyMode === 'search' ? 'กำลังค้นหา...' : <><Search size={18} /> ค้นหา</>}
          </button>
        </form>
      )}

      {/* Results (if confirm dismissed) */}
      {results.length > 0 && !confirmResults && (
        <div className="engineer-scan-results-section">
          <p className="engineer-scan-results-title">พบ {results.length} รายการ</p>
          {results.map((result) => (
            <button
              key={`${result.entity_type}-${result.entity_id}`}
              type="button"
              className="engineer-scan-result-card"
              onClick={() => setConfirmResults([result])}
            >
              <div className="engineer-scan-result-left">
                <span className="engineer-scan-result-badge">{entityIcon(result.entity_type)} {result.entity_type}</span>
                <strong className="engineer-scan-result-title">{result.title}</strong>
                {result.subtitle && <p className="engineer-scan-result-sub">{result.subtitle}</p>}
              </div>
              <ChevronRight size={20} color="#94a3b8" />
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}



export default Scan;
