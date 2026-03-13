/**
 * CustomerScan.jsx — ล้าง dead code ออก
 *
 * ฟังก์ชันที่ซ้ำและถูกลบออก:
 *  - handleReadImage     → ใช้ handleReadImageSafe แทน (logic เดียวกัน แต่ Safe ใช้ getErrorMessage helper)
 *  - handleOcrSearch     → ใช้ handleOcrSearchSafe แทน (Safe มี fallback scanOcrImage เพิ่ม)
 *  - handleOcrTextSearch → ใช้ handleOcrTextSearchSafe แทน (logic เดียวกัน)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowRight, Camera, Search, X, Loader, Lightbulb, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout';
import { getApiErrorMessage } from '../../api/api';
import { manualSearch, scanOcrExtract, scanOcrImage, scanQr } from '../../api/scanApi';
import { detectBarcodeValuesFromFile } from '../../utils/barcodeImageScan';
import '../../styles/ScanPage.css';

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Sans+Thai:wght@400;600;700&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse-ring { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:.7;transform:scale(1.1)} }
  .scan-card { animation: fadeUp .22s ease both; }
  .pulse { animation: pulse-ring 1.6s ease-in-out infinite; }
`;

async function compressImage(file) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function getErrorMessage(error, fallbackMessage) {
  return getApiErrorMessage(error, fallbackMessage);
}

async function readImageWithBackend(imageFile) {
  const compressedFile = await compressImage(imageFile);
  const data = await scanOcrExtract(compressedFile);
  const fieldHints = data.field_hints ?? {};
  const ocrTexts = data.ocr_texts ?? [];
  const candidates = data.candidates ?? [];
  const barcodeValues = data.barcode_values ?? [];
  return {
    serial: fieldHints.serial_number || null,
    panel_code: fieldHints.reference_number || null,
    reference_number: fieldHints.reference_number || null,
    meter_code: fieldHints.meter_code || null,
    meter_name: fieldHints.meter_name || null,
    ip: fieldHints.device_address || null,
    mac: null,
    model: fieldHints.model || null,
    manufacturer: fieldHints.manufacturer || null,
    other_codes: uniqueStrings([...barcodeValues, ...candidates]),
    raw_text: data.extracted_text || '',
    ocr_texts: ocrTexts,
    search_terms: uniqueStrings([
      fieldHints.serial_number, fieldHints.reference_number, fieldHints.meter_code,
      fieldHints.device_address, fieldHints.model, ...barcodeValues, ...candidates, ...ocrTexts,
    ]),
    confidence: ocrTexts.length > 1 ? 'high' : (ocrTexts.length === 1 ? 'medium' : 'low'),
    notes: ocrTexts.length > 0 ? `Read with ${ocrTexts.length} modes` : 'No text found',
  };
}

function buildSearchTerms(ocrData) {
  const terms = [];
  const seen = new Set();
  function add(v) {
    if (!v) return;
    const s = String(v).trim();
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); terms.push(s); }
  }
  (ocrData.search_terms || []).forEach(add);
  add(ocrData.serial);
  add(ocrData.reference_number);
  add(ocrData.panel_code);
  add(ocrData.meter_code);
  add(ocrData.meter_name);
  add(ocrData.ip);
  add(ocrData.model);
  add(ocrData.mac);
  add(ocrData.manufacturer);
  (ocrData.ocr_texts || []).forEach(add);
  (ocrData.other_codes || []).forEach(add);
  if (terms.length === 0 && ocrData.raw_text) add(ocrData.raw_text.slice(0, 80));
  return terms.slice(0, 10);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CONF_COLOR = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
const CONF_LABEL = { high: 'อ่านชัด', medium: 'พอใช้', low: 'ไม่แน่ใจ' };

function resolveCustomerPath(r) {
  if (r.entity_type === 'meter') return `/customer/online-report/meter/${r.entity_id}`;
  if (r.entity_type === 'loop') return `/customer/online-report/loop/${r.entity_id}`;
  if (r.panel_id) return `/customer/panel/${r.panel_id}`;
  if (r.project_id) return `/customer/project/${r.project_id}`;
  return null;
}

// ─── Photo Tips ────────────────────────────────────────────────────────────────
const TIPS = [
  { icon: '☀️', text: 'ถ่ายในที่มีแสงพอ หรือเปิดไฟฉาย' },
  { icon: '📏', text: 'ห่าง 15–25 ซม. จากป้าย เต็มเฟรม' },
  { icon: '✋', text: 'จับมือนิ่ง กดถ่ายช้าๆ' },
  { icon: '🔲', text: 'ให้ป้ายอยู่ตรงกลางและชัดที่สุด' },
  { icon: '🔄', text: 'ถ้าเบลอ ลองถ่ายซ้ำ หรือกรอกเอง' },
];
function PhotoTips({ onDismiss }) {
  return (
    <div style={tp.box} className="scan-card">
      <div style={tp.header}>
        <Lightbulb size={14} color="#fbbf24" />
        <h3 style={tp.title}>วิธีถ่ายรูปป้ายให้ AI อ่านง่าย</h3>
        <button type="button" style={tp.close} onClick={onDismiss}><X size={16} /></button>
      </div>
      <ul style={tp.list}>
        {TIPS.map((tip, i) => (
          <li key={i} style={tp.item}>
            <span style={tp.icon}>{tip.icon}</span>
            <span>{tip.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CustomerScan({ landingMode = false, embedded = false, scanMode: scanModeProp = null, onClose } = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const galleryInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [activeTab, setActiveTab] = useState('photo');
  const isLandingMode = landingMode || searchParams.get('landing') === '1' || searchParams.get('landing') === 'true';
  const scanMode = scanModeProp || (searchParams.get('mode') === 'project' ? 'project' : 'device');
  const [currentScanMode, setCurrentScanMode] = useState(scanMode);

  useEffect(() => { setCurrentScanMode(scanMode); }, [scanMode]);

  const [ocrImage, setOcrImage] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [error, setError] = useState('');
  const [busyMode, setBusyMode] = useState('');
  const [showTips, setShowTips] = useState(true);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraMessage, setCameraMessage] = useState('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
    setCameraMessage('');
  }, []);

  const clearImageInputs = () => { if (galleryInputRef.current) galleryInputRef.current.value = ''; };

  function describeCameraError(err) {
    const n = err?.name;
    if (n === 'SecurityError') return 'ต้องเปิดผ่าน https หรือ http://localhost เท่านั้น เพื่อใช้งานกล้อง';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์ก่อน';
    if (n === 'NotFoundError') return 'ไม่พบกล้องในอุปกรณ์นี้';
    if (n === 'NotReadableError') return 'กล้องกำลังถูกใช้งานโดยแอปอื่นอยู่';
    return 'ไม่สามารถเปิดกล้องได้';
  }

  const startCamera = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraMessage('เบราว์เซอร์นี้ไม่รองรับกล้องสด ให้เลือกจากคลังภาพแทน');
      return;
    }
    if (!window.isSecureContext) {
      setCameraState('error');
      setCameraMessage('ต้องเปิดผ่าน https หรือ http://localhost เท่านั้น (ห้ามเปิดแบบ file:// หรือ http ผ่าน IP) เพื่อใช้งานกล้อง');
      return;
    }
    stopCamera();
    setCameraState('starting');
    setCameraMessage('กำลังเปิดกล้อง...');
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraState('ready');
      setCameraMessage('จัดป้ายให้อยู่กลางภาพแล้วกดถ่าย');
    } catch (err) {
      setCameraState('error');
      setCameraMessage(describeCameraError(err));
    }
  }, [stopCamera]);

  useEffect(() => {
    if (cameraState !== 'ready' || !videoRef.current || !streamRef.current) return;
    let cancelled = false;
    async function attach() {
      const v = videoRef.current; const s = streamRef.current;
      if (!v || !s) return;
      v.srcObject = s;
      try { await v.play(); }
      catch (err) { if (!cancelled) { setCameraState('error'); setCameraMessage(describeCameraError(err)); } }
    }
    attach();
    return () => { cancelled = true; };
  }, [cameraState]);

  useEffect(() => {
    if (isLandingMode && activeTab === 'photo' && cameraState === 'idle') startCamera();
  }, [isLandingMode, activeTab, cameraState, startCamera]);

  useEffect(() => {
    if (!embedded) return;
    if (currentScanMode === 'project' && cameraState === 'idle') startCamera();
  }, [embedded, currentScanMode, cameraState, startCamera]);

  const resetOcr = () => { stopCamera(); setOcrImage(null); setOcrData(null); setError(''); clearImageInputs(); };
  const pickOcrImage = (file) => { if (!file) return; resetOcr(); setOcrImage(file); };

  const processProjectScan = useCallback(async (file) => {
    if (!file) return;
    setBusyMode('qr'); setError('');
    try {
      const candidates = await detectBarcodeValuesFromFile(file);
      const results = [];
      for (const code of candidates) {
        try { const match = await scanQr(code); if (match) results.push(match); } catch {}
      }
      if (results.length === 0) {
        const ocrResults = await scanOcrImage(file, '', {});
        if (Array.isArray(ocrResults)) results.push(...ocrResults);
      }
      if (!results.length) throw new Error('ไม่พบข้อมูลจาก QR หรือ OCR');
      const match = results[0];
      if (match.entity_type === 'project') { navigate(`/customer/portal/${match.entity_id}`); return; }
      if (match.meter_id) { navigate(`/customer/online-report/meter/${match.meter_id}`); return; }
      if (match.panel_id) { navigate(`/customer/panel/${match.panel_id}`); return; }
      if (match.loop_id && match.project_id) { navigate(`/customer/portal/${match.project_id}?type=loop&id=${match.loop_id}`); return; }
      throw new Error('ไม่พบข้อมูลที่สามารถใช้งานได้');
    } catch (err) {
      setError(err?.message || 'สแกนไม่สำเร็จ');
    } finally { setBusyMode(''); }
  }, [navigate]);

  const handleImageInputChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (currentScanMode === 'project') processProjectScan(file);
      else pickOcrImage(file);
    }
    event.target.value = '';
  };

  const captureCameraImage = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) { setError('ยังจับภาพจากกล้องไม่ได้'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError('ไม่สามารถเตรียมภาพจากกล้องได้'); return; }
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) { setError('ถ่ายภาพไม่สำเร็จ'); return; }
    const capturedFile = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (currentScanMode === 'project') await processProjectScan(capturedFile);
    else pickOcrImage(capturedFile);
  }, [processProjectScan, currentScanMode]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);
  useEffect(() => { if (activeTab !== 'photo') stopCamera(); }, [activeTab, stopCamera]);

  // ── Handlers (ลบ duplicates ออกแล้ว เหลือเพียง *Safe versions) ──────────────

  const handleReadImageSafe = async () => {
    if (!ocrImage) return;
    setError(''); setOcrData(null); setBusyMode('ocr-read');
    try { setOcrData(await readImageWithBackend(ocrImage)); }
    catch (err) { setError(getErrorMessage(err, 'AI อ่านรูปไม่สำเร็จ ลองกรอกเอง')); }
    finally { setBusyMode(''); }
  };

  const handleOcrSearchSafe = useCallback(async () => {
    if (!ocrData) return;
    setBusyMode('photo'); setError('');
    try {
      const terms = buildSearchTerms(ocrData);
      if (terms.length === 0) throw new Error('ไม่พบข้อมูลที่อ่านได้');
      const allResults = await Promise.all(terms.map((term) => manualSearch(term).catch(() => [])));
      const seen = new Set();
      const merged = [];
      for (const batch of allResults) {
        for (const result of batch) {
          const key = `${result.entity_type}-${result.entity_id}`;
          if (seen.has(key)) continue;
          seen.add(key); merged.push(result);
        }
      }
      if (merged.length === 0 && ocrImage) {
        const fallbackResults = await scanOcrImage(ocrImage, terms[0]).catch(() => []);
        for (const result of fallbackResults) {
          const key = `${result.entity_type}-${result.entity_id}`;
          if (seen.has(key)) continue;
          seen.add(key); merged.push(result);
        }
      }
      if (merged.length === 0) throw new Error('ไม่พบอุปกรณ์ที่ตรงกัน');
      if (merged.length === 1) {
        const path = resolveCustomerPath(merged[0]);
        if (!path) throw new Error('ไม่สามารถเปิดดูอุปกรณ์นี้ได้');
        navigate(path); return;
      }
      navigate('/customer/search-results', { state: { results: merged } });
    } catch (err) {
      setError(getErrorMessage(err, 'ค้นหาไม่สำเร็จ'));
    } finally { setBusyMode(''); }
  }, [navigate, ocrData, ocrImage]);

  const handleOcrTextSearchSafe = async (event) => {
    event.preventDefault();
    if (!ocrText.trim()) return;
    setBusyMode('manual'); setError('');
    try {
      const results = await manualSearch(ocrText.trim());
      if (results.length === 0) throw new Error('ไม่พบอุปกรณ์ที่ตรงกัน');
      if (results.length === 1) {
        const path = resolveCustomerPath(results[0]);
        if (!path) throw new Error('ไม่สามารถเปิดดูอุปกรณ์นี้ได้');
        navigate(path); return;
      }
      navigate('/customer/search-results', { state: { results } });
    } catch (err) {
      setError(getErrorMessage(err, 'ค้นหาไม่สำเร็จ'));
    } finally { setBusyMode(''); }
  };

  const inner = (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="scan-main-content">
        <div style={s.header}>
          <h1 style={s.title}>สแกน</h1>
          {embedded
            ? <button type="button" style={s.closeBtn} onClick={onClose}><X size={24} /></button>
            : <Link to="/customer" style={s.closeBtn}><X size={24} /></Link>}
        </div>

        <div style={s.modeTabs}>
          <button type="button" style={{ ...s.modeTab, ...(currentScanMode === 'project' ? s.modeTabActive : {}) }} onClick={() => setCurrentScanMode('project')}>สแกนโครงการ</button>
          <button type="button" style={{ ...s.modeTab, ...(currentScanMode === 'device'  ? s.modeTabActive : {}) }} onClick={() => setCurrentScanMode('device')}>สแกนอุปกรณ์</button>
        </div>

        {error && (
          <div className="customer-scan-error-box scan-card">
            <AlertCircle size={18} color="#ef4444" />
            <span>{error}</span>
            <button type="button" className="customer-scan-err-close" onClick={() => setError('')}><X size={16} /></button>
          </div>
        )}

        <div style={s.tabs}>
          <button type="button" onClick={() => setActiveTab('photo')}  style={{ ...s.tab, ...(activeTab === 'photo'  && s.tabActive) }}><Camera size={16} /><span>ถ่ายรูป (AI)</span></button>
          <button type="button" onClick={() => setActiveTab('manual')} style={{ ...s.tab, ...(activeTab === 'manual' && s.tabActive) }}><Search size={16} /><span>กรอกรหัส</span></button>
        </div>

        {activeTab === 'photo' && (
          <div style={s.card} className="scan-card">
            {ocrImage ? (
              <div style={s.previewWrap}>
                <img src={URL.createObjectURL(ocrImage)} alt="Preview" style={s.previewImg} />
                <button type="button" style={s.changeBtn} onClick={resetOcr}><RotateCcw size={14} /> ถ่ายใหม่</button>
              </div>
            ) : (
              <div style={s.uploadBox}>
                {(cameraState === 'starting' || cameraState === 'ready') && (
                  <div style={s.cameraStage}>
                    <video ref={videoRef} autoPlay muted playsInline style={s.cameraVideo} />
                    <div style={s.cameraCaption}>{cameraMessage}</div>
                  </div>
                )}
                {cameraState === 'starting' && <div style={s.cameraNotice}>กำลังเปิดกล้อง...</div>}
                {cameraState === 'error'    && <div style={s.cameraError}>{cameraMessage}</div>}
                <Camera size={26} color="#44403c" />
                <div style={s.uploadActions}>
                  <button type="button" style={s.captureBtn} onClick={cameraState === 'ready' ? captureCameraImage : startCamera}>
                    <Camera size={16} /> ถ่ายรูป
                  </button>
                  <button type="button" style={s.pickBtn} onClick={() => galleryInputRef.current?.click()}>เลือกจากคลัง</button>
                </div>
                <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInputChange} />
                <span style={s.uploadTxt}>ถ่ายรูป / เลือกจากคลัง</span>
                <span style={s.uploadHint}>JPG, PNG — AI อ่านทุก font รวมถึงลายมือ</span>
              </div>
            )}

            {ocrImage && !ocrData && (
              <button type="button" className="customer-scan-ai-btn" onClick={handleReadImageSafe} disabled={busyMode === 'ocr-read'}>
                {busyMode === 'ocr-read'
                  ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> AI กำลังอ่านป้าย...</>
                  : '🤖  ให้ AI อ่านป้าย'}
              </button>
            )}

            {ocrData && (
              <OcrResultCard ocrData={ocrData} onSearch={handleOcrSearchSafe} onRetry={resetOcr} loading={busyMode === 'photo'} />
            )}
          </div>
        )}

        {activeTab === 'manual' && (
          <div style={s.card} className="scan-card">
            <p style={s.orHint}>กรอกรหัสเองถ้าอ่านได้</p>
            <form onSubmit={handleOcrTextSearchSafe} style={s.inlineForm}>
              <input style={s.monoInput} value={ocrText} onChange={(e) => setOcrText(e.target.value)} placeholder="Serial / Panel code / IP..." />
              <button type="submit" style={s.submitBtn} disabled={!ocrText.trim() || busyMode === 'manual'}>
                <ArrowRight size={20} />
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="scan-sidebar">
        {showTips && <PhotoTips onDismiss={() => setShowTips(false)} />}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="scan-overlay">
        <div className="scan-overlay-inner">
          <button type="button" className="scan-overlay-close" onClick={onClose}><X size={20} /></button>
          {inner}
        </div>
      </div>
    );
  }

  return (
    <CustomerLayout title="สแกนหาอุปกรณ์" subtitle="ถ่ายรูปหรือสแกน QR เพื่อค้นหาอุปกรณ์" backTo="/customer" showScanButton={false}>
      {inner}
    </CustomerLayout>
  );
}

// ─── OCR Result Card ──────────────────────────────────────────────────────────
function OcrResultCard({ ocrData, onSearch, onRetry, loading }) {
  const fields = [
    ocrData.serial       && { label: 'Serial',      value: ocrData.serial },
    ocrData.panel_code   && { label: 'Ref / Panel', value: ocrData.panel_code },
    ocrData.meter_code   && { label: 'Meter Code',  value: ocrData.meter_code },
    ocrData.meter_name   && { label: 'Meter',       value: ocrData.meter_name },
    ocrData.ip           && { label: 'IP',           value: ocrData.ip },
    ocrData.model        && { label: 'Model',        value: ocrData.model },
    ocrData.manufacturer && { label: 'Brand',        value: ocrData.manufacturer },
  ].filter(Boolean);

  const hasResults = fields.length > 0
    || (ocrData.other_codes && ocrData.other_codes.length > 0)
    || (ocrData.search_terms && ocrData.search_terms.length > 0)
    || Boolean(ocrData.raw_text?.trim());

  return (
    <div className="ocr-result-box">
      <div className="ocr-result-header">
        {hasResults
          ? <><CheckCircle2 size={16} color={CONF_COLOR[ocrData.confidence]} /> <span style={{ color: CONF_COLOR[ocrData.confidence] }}>AI อ่านได้ (ความแม่นยำ: {CONF_LABEL[ocrData.confidence]})</span></>
          : <><AlertCircle size={16} color="#f59e0b" /> <span style={{ color: '#f59e0b' }}>ไม่พบข้อมูลที่ชัดเจน</span></>}
      </div>

      {hasResults ? (
        <div className="ocr-result-grid">
          {fields.map(f => (
            <div key={f.label} className="ocr-result-field">
              <span className="ocr-result-label">{f.label}</span>
              <code className="ocr-result-value">{f.value}</code>
            </div>
          ))}
          {ocrData.other_codes?.map((c, i) => (
            <div key={`o${i}`} className="ocr-result-field">
              <span className="ocr-result-label">อื่นๆ</span>
              <code className="ocr-result-value">{c}</code>
            </div>
          ))}
        </div>
      ) : (
        <p className="ocr-result-fallback">ลองถ่ายรูปใหม่ในที่สว่างและชัดขึ้น หรือกรอกรหัสด้วยตนเอง</p>
      )}

      <div className="ocr-result-actions">
        <button type="button" className="ocr-result-retry-btn" onClick={onRetry}><RotateCcw size={14} /> ถ่ายใหม่</button>
        {hasResults && (
          <button type="button" className="ocr-result-search-btn" onClick={onSearch} disabled={loading}>
            {loading ? 'กำลังค้นหา...' : <><Search size={14} /> ค้นหาจากข้อมูลนี้</>}
          </button>
        )}
      </div>

      {ocrData.raw_text && (
        <details className="ocr-result-details">
          <summary className="ocr-result-summary">ดูข้อความที่ AI อ่านได้ทั้งหมด</summary>
          <p className="ocr-result-raw-text">{ocrData.raw_text}</p>
        </details>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  title: { margin: 0, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em' },
  modeTabs: { display: 'flex', gap: 12, marginBottom: 20 },
  modeTab: { flex: 1, borderRadius: 14, padding: '10px 14px', border: '1px solid rgba(148,163,184,0.4)', background: '#f8fafc', color: '#0f172a', fontWeight: 600, cursor: 'pointer' },
  modeTabActive: { background: '#2563eb', color: '#fff', border: '1px solid rgba(37,99,235,0.9)' },
  closeBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 14, color: '#44403c', background: '#ffffff', border: '1px solid rgba(120,113,108,0.18)', textDecoration: 'none', boxShadow: '0 10px 30px rgba(28,25,23,0.08)' },
  tabs: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 },
  tab: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(120,113,108,0.16)', background: 'rgba(255,255,255,0.72)', color: '#57534e', fontWeight: 600, cursor: 'pointer' },
  tabActive: { background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#ffffff', border: '1px solid #ea580c', boxShadow: '0 16px 40px rgba(234,88,12,0.22)' },
  card: { padding: 20, borderRadius: 24, background: 'rgba(255,255,255,0.84)', border: '1px solid rgba(120,113,108,0.14)', boxShadow: '0 24px 60px rgba(28,25,23,0.08)', backdropFilter: 'blur(14px)' },
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  previewImg: { width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 20, border: '1px solid rgba(120,113,108,0.14)', background: '#f5f5f4' },
  changeBtn: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(120,113,108,0.16)', background: '#fafaf9', color: '#44403c', fontWeight: 600, cursor: 'pointer' },
  uploadBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 260, padding: '28px 20px', borderRadius: 22, border: '1.5px dashed rgba(120,113,108,0.28)', background: 'linear-gradient(180deg,rgba(255,255,255,0.92) 0%,rgba(250,250,249,0.92) 100%)', textAlign: 'center', cursor: 'pointer' },
  uploadTxt: { fontSize: 18, fontWeight: 700, color: '#292524' },
  uploadHint: { maxWidth: 320, fontSize: 13, lineHeight: 1.6, color: '#78716c' },
  cameraStage: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10 },
  cameraVideo: { width: '100%', minHeight: 240, maxHeight: 360, objectFit: 'cover', borderRadius: 20, background: '#1c1917', border: '1px solid rgba(120,113,108,0.16)' },
  cameraCaption: { padding: '10px 12px', borderRadius: 12, background: 'rgba(28,25,23,0.88)', color: '#fafaf9', fontSize: 13, lineHeight: 1.5 },
  cameraNotice: { padding: '10px 12px', borderRadius: 12, background: '#fff7ed', color: '#c2410c', fontSize: 13, fontWeight: 600 },
  cameraError: { padding: '10px 12px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 600 },
  uploadActions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  captureBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#ffffff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 16px 30px rgba(234,88,12,0.18)' },
  pickBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(120,113,108,0.18)', background: '#ffffff', color: '#44403c', fontWeight: 600, cursor: 'pointer' },
  orHint: { margin: '0 0 12px', color: '#57534e', fontSize: 14 },
  inlineForm: { display: 'flex', gap: 10, alignItems: 'stretch' },
  monoInput: { flex: 1, minWidth: 0, padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(120,113,108,0.18)', background: '#ffffff', color: '#1c1917', fontSize: 15, fontFamily: '"DM Mono", monospace', outline: 'none' },
  submitBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, border: 'none', borderRadius: 14, background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', color: '#ffffff', cursor: 'pointer', boxShadow: '0 16px 40px rgba(17,24,39,0.18)' },
};

const tp = {
  box: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: '12px 16px' },
  header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { margin: 0, fontSize: 14, fontWeight: 600, color: '#ca8a04', flex: 1 },
  close: { background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 0 },
  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#a16207' },
  icon: { fontSize: 16 },
};
