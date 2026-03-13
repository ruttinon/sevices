import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import {
  createLoop, createMeter, createPanel,
  deleteLoop, deleteMeter, deletePanel,
  exportAssetsToExcel, getPanels, importAssets, syncAssetsFromTemplate,
  updateLoop, updateMeter, updatePanel,
} from '../../api/assetApi';
import { getProjects } from '../../api/projectApi';
import { scanOcrExtract } from '../../api/scanApi';
import { detectBarcodeValuesFromFile } from '../../utils/barcodeImageScan';
import { API_BASE_URL, toAbsoluteFileUrl } from '../../api/api';
import { colors, font, space, radius, shadow, input, btn } from '../../theme';

/* ─── tiny helpers ─── */
const panelDefaults = { project_id: '', panel_code: '', panel_name: '', serial_number: '', location_note: '' };
const loopDefaults  = { panel_id: '', loop_code: '', loop_name: '', converter_name: '', converter_ip: '', mac_address: '' };
const meterDefaults = { loop_id: '', meter_code: '', meter_name: '', serial_number: '', device_address: '', model: '', ct_ratio: '', baud_rate: '', status: 'Active' };

function isUsefulCode(v) {
  const n = String(v ?? '').trim();
  return n.length >= 4 && n.length <= 32 && /[0-9]/.test(n) && !/^https?:\/\//i.test(n);
}
function pushSug(arr, seen, label, val) {
  const n = String(val ?? '').trim();
  if (n && !seen.has(n)) { seen.add(n); arr.push({ label, value: n }); }
}

/* ─── sub-components ─── */
function Fld({ label, children }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, fontWeight:600, color:'#64748b' }}>
      {label}{children}
    </label>
  );
}

function Tag({ children, color = '#e2e8f0', text = '#475569' }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 8px',
      borderRadius:20, fontSize:11, fontWeight:600,
      background:color, color:text, whiteSpace:'nowrap',
    }}>{children}</span>
  );
}

  function StatusBadge({ status }) {
    const map = {
      'ยังไม่ทำ': { bg: '#f3f4f6', c: '#6b7280' },
      'กำลังทำ': { bg: '#fef9c3', c: '#a16207' },
      'เสร็จสิ้น': { bg: '#dcfce7', c: '#16a34a' },
      Active: { bg: '#dcfce7', c: '#16a34a' },
      Maintenance: { bg: '#fef9c3', c: '#a16207' },
      Offline: { bg: '#fee2e2', c: '#dc2626' },
    };
    const s = map[status] || { bg: '#f1f5f9', c: '#64748b' };
    return <Tag color={s.bg} text={s.c}>{status}</Tag>;
  }

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
function Assets() {
  const scanRef = useRef(null);
  const navigate = useNavigate();

  /* data */
  const [projects, setProjects] = useState([]);
  const [panels, setPanels]     = useState([]);
  const { selectedProject, setSelectedProject } = useProject();

  /* ui state */
  const [view, setView]         = useState('meters');   // 'meters' | 'panels' | 'qr'
  const [modal, setModal]       = useState(null);       // null | 'panel' | 'loop' | 'meter'
  const [editRow, setEditRow]   = useState(null);       // meter being inline-edited
  const [editData, setEditData] = useState({});

  /* forms */
  const [panelForm, setPanelForm] = useState(panelDefaults);
  const [loopForm, setLoopForm]   = useState(loopDefaults);
  const [meterForm, setMeterForm] = useState(meterDefaults);
  const [editingPanelId, setEditingPanelId] = useState(null);
  const [editingLoopId, setEditingLoopId]   = useState(null);
  const [editingMeterId, setEditingMeterId] = useState(null);

  /* search & filter */
  const [search, setSearch]     = useState('');
  const [filterLoop, setFilterLoop] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterModel, setFilterModel]   = useState('');

  /* misc */
  const [importFile, setImportFile] = useState(null);
  const [msg, setMsg]           = useState('');
  const [err, setErr]           = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanState, setScanState]     = useState({ field: null, suggestions: [] });
  const [exportLoading, setExportLoading] = useState(false);
  const [savingRow, setSavingRow] = useState(null);

  // Helper to determine meter status based on report progress
  function getMeterStatus(meter) {
    // If meter has report_data, calculate status from that
    if (meter.report_progress) {
      const { has_data, has_photos, is_complete } = meter.report_progress;
      if (is_complete) return 'เสร็จสิ้น';
      if (has_data || has_photos) return 'กำลังทำ';
    }
    // Status is now automatic based on report progress
    const meterWithProgress = {
      ...meter,
      status: 'ยังไม่ทำ', // Default for new meters
    };
    return meterWithProgress.status;
  }

  /* ── load ── */
  async function load(pid = '') {
    try {
      const pd = await getProjects();
      setProjects(pd);
    } catch { setErr('โหลดรายการโปรเจกต์ไม่สำเร็จ'); }
    try {
      const panelData = await getPanels(pid || undefined);
      setPanels(panelData);
    } catch { /* panels may fail if no project selected yet */ }
  }
  useEffect(() => { load(selectedProject); }, [selectedProject]);

  function handleRowClick(meter) {
    // Navigate to Report Center with specific loop and meter
    // Using loop_name and meter_code as expected by Reports.jsx
    navigate(`/admin/reports?loop=${encodeURIComponent(meter.loop_name)}&meter=${encodeURIComponent(meter.meter_code)}`);
  }

  /* ── derived ── */
  const filteredPanels = useMemo(() =>
    selectedProject ? panels.filter(p => String(p.project_id) === selectedProject) : panels
  , [panels, selectedProject]);

  const allLoops = useMemo(() => {
    const loops = filteredPanels.flatMap(p => p.loops || []);
    // Remove duplicates by loop_code (same loop code should appear only once)
    const uniqueLoops = loops.filter((loop, index, self) =>
      index === self.findIndex((l) => l.loop_code === loop.loop_code)
    );
    // Sort by loop_code numerically (Loop1, Loop2, ..., Loop10, not Loop1, Loop10, Loop2)
    return uniqueLoops.sort((a, b) => {
      const numA = parseInt(a.loop_code?.replace(/\D/g, '') || '0');
      const numB = parseInt(b.loop_code?.replace(/\D/g, '') || '0');
      return numA - numB;
    });
  }, [filteredPanels]);

  const allMeters = useMemo(() => {
    let meters = allLoops.flatMap(l => (l.meters || []).map(m => ({
      ...m,
      loop_code: l.loop_code,
      loop_name: l.loop_name,
      loop_id_ref: l.id,
      panel_code: filteredPanels.find(p => p.id === l.panel_id)?.panel_code || '',
    })));

    if (filterLoop) meters = meters.filter(m => String(m.loop_id_ref) === filterLoop);
    if (filterStatus) meters = meters.filter(m => m.status === filterStatus);
    if (filterModel) meters = meters.filter(m => m.model === filterModel);
    if (search) {
      const q = search.toLowerCase();
      meters = meters.filter(m =>
        [m.meter_code, m.meter_name, m.serial_number, m.loop_code, m.panel_code, m.model, m.status]
          .some(v => String(v || '').toLowerCase().includes(q))
      );
    }
    return meters;
  }, [allLoops, filteredPanels, filterLoop, filterStatus, filterModel, search]);

  const loopOptions = useMemo(() => allLoops, [allLoops]);

  const modelOptions = useMemo(() => [...new Set(allMeters.map(m => m.model).filter(Boolean))], [allMeters]);

  /* ── inline edit ── */
  function startEdit(meter) {
    setEditRow(meter.id);
    setEditData({
      model: meter.model || '',
      ct_ratio: meter.ct_ratio || '',
      baud_rate: meter.baud_rate || '',
      device_address: meter.device_address || '',
      serial_number: meter.serial_number || '',
      // Status is now automatic - no longer editable
    });
  }
  async function saveEdit(meter) {
    setSavingRow(meter.id);
    try {
      // Only save technical fields - status is now automatic
      await updateMeter(meter.id, {
        ...meter,
        model: editData.model,
        ct_ratio: editData.ct_ratio,
        baud_rate: editData.baud_rate,
        device_address: editData.device_address,
        serial_number: editData.serial_number,
      });
      setMsg('บันทึกแล้ว ✓');
      setEditRow(null);
      await load(selectedProject);
    } catch { setErr('บันทึกไม่สำเร็จ'); }
    finally { setSavingRow(null); }
  }
  function cancelEdit() { setEditRow(null); setEditData({}); }

  async function handleStatusChange(meterId, newStatus) {
    try {
      const meter = allMeters.find(m => m.id === meterId);
      await updateMeter(meterId, { ...meter, status: newStatus });
      setMsg('อัปเดตสถานะแล้ว');
      load(selectedProject);
    } catch { setErr('อัปเดตสถานะไม่สำเร็จ'); }
  }

  async function handleResetAllStatuses() {
    if (!window.confirm('คุณต้องการรีเซ็ตสถานะมิเตอร์ทั้งหมดในโปรเจกต์นี้เป็น "ยังไม่ทำ" ใช่หรือไม่?')) return;
    try {
      setMsg('กำลังรีเซ็ตสถานะ...');
      // Ideally this would be a bulk update API, but we'll do it sequentially if needed
      // For now, let's assume we update only the meters currently shown
      await Promise.all(allMeters.map(m => updateMeter(m.id, { ...m, status: 'ยังไม่ทำ' })));
      setMsg('รีเซ็ตสถานะทั้งหมดสำเร็จ ✓');
      load(selectedProject);
    } catch { setErr('รีเซ็ตสถานะไม่สำเร็จ'); }
  }

  /* ── modal CRUD ── */
  function openModal(type, editing = null) {
    setModal(type);
    if (type === 'panel') {
      setEditingPanelId(editing?.id || null);
      setPanelForm(editing ? { project_id: editing.project_id, panel_code: editing.panel_code, panel_name: editing.panel_name, serial_number: editing.serial_number || '', location_note: editing.location_note || '' } : { ...panelDefaults, project_id: selectedProject });
    } else if (type === 'loop') {
      setEditingLoopId(editing?.id || null);
      setLoopForm(editing ? { panel_id: editing.panel_id, loop_code: editing.loop_code, loop_name: editing.loop_name, converter_name: editing.converter_name || '', converter_ip: editing.converter_ip || '', mac_address: editing.mac_address || '' } : loopDefaults);
    } else {
      setEditingMeterId(editing?.id || null);
      setMeterForm(editing ? { loop_id: editing.loop_id_ref, meter_code: editing.meter_code, meter_name: editing.meter_name, serial_number: editing.serial_number || '', device_address: editing.device_address || '', model: editing.model || '', ct_ratio: editing.ct_ratio || '', baud_rate: editing.baud_rate || '', status: editing.status || 'ยังไม่ทำ' } : meterDefaults);
    }
  }
  function closeModal() { setModal(null); setEditingPanelId(null); setEditingLoopId(null); setEditingMeterId(null); }

  async function submitPanel(e) {
    e.preventDefault();
    try {
      if (editingPanelId) await updatePanel(editingPanelId, panelForm);
      else await createPanel(panelForm);
      setMsg(editingPanelId ? 'อัปเดต Panel แล้ว' : 'เพิ่ม Panel แล้ว');
      closeModal(); load(selectedProject);
    } catch { setErr('บันทึกไม่สำเร็จ'); }
  }
  async function submitLoop(e) {
    e.preventDefault();
    try {
      if (editingLoopId) await updateLoop(editingLoopId, loopForm);
      else await createLoop(loopForm);
      setMsg(editingLoopId ? 'อัปเดต Loop แล้ว' : 'เพิ่ม Loop แล้ว');
      closeModal(); load(selectedProject);
    } catch { setErr('บันทึกไม่สำเร็จ'); }
  }
  async function submitMeter(e) {
    e.preventDefault();
    try {
      if (editingMeterId) await updateMeter(editingMeterId, meterForm);
      else await createMeter(meterForm);
      setMsg(editingMeterId ? 'อัปเดต Meter แล้ว' : 'เพิ่ม Meter แล้ว');
      closeModal(); load(selectedProject);
    } catch { setErr('บันทึกไม่สำเร็จ'); }
  }

  async function handleDelete(type, id) {
    if (!window.confirm('ยืนยันการลบ?')) return;
    try {
      if (type === 'panel') await deletePanel(id);
      else if (type === 'loop') await deleteLoop(id);
      else await deleteMeter(id);
      setMsg('ลบแล้ว');
      load(selectedProject);
    } catch { setErr('ลบไม่สำเร็จ'); }
  }

  async function handleImport(e) {
    e.preventDefault();
    if (!importFile) return;
    try {
      const result = await importAssets(selectedProject, importFile);
      setMsg(`นำเข้าสำเร็จ: Panels +${result.panels_created} | Loops +${result.loops_created} | Meters +${result.meters_created}`);
      load(selectedProject);
    } catch { setErr('นำเข้าไม่สำเร็จ'); }
  }

  async function handleSync() {
    if (!selectedProject) {
      setErr('กรุณาเลือกโปรเจกต์ก่อน');
      return;
    }
    try {
      const r = await syncAssetsFromTemplate(selectedProject);
      setMsg(`Sync สำเร็จ: ${r.loops_created + r.loops_updated} loops, ${r.meters_created + r.meters_updated} meters`);
      load(selectedProject);
    } catch { setErr('Sync ไม่สำเร็จ'); }
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const blob = await exportAssetsToExcel(selectedProject);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'assets.xlsx'; a.click();
    } catch { setErr('Export ไม่สำเร็จ'); }
    finally { setExportLoading(false); }
  }

  /* ── scan ── */
  function startScan(field) {
    setScanState({ field, suggestions: [] });
    scanRef.current?.click();
  }
  async function handleScanFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setScanLoading(true);
    try {
      const [ocrResult, barcodeVals] = await Promise.all([scanOcrExtract(file), detectBarcodeValuesFromFile(file)]);
      const suggestions = [];
      const seen = new Set();
      pushSug(suggestions, seen, 'SN', ocrResult?.field_hints?.serial_number);
      for (const v of barcodeVals || []) { if (isUsefulCode(v)) pushSug(suggestions, seen, 'Code', v); }
      for (const v of ocrResult?.candidates || []) { if (isUsefulCode(v)) pushSug(suggestions, seen, 'OCR', v); }
      setScanState(s => ({ ...s, suggestions }));
    } catch { setErr('สแกนไม่สำเร็จ'); }
    finally { setScanLoading(false); e.target.value = ''; }
  }

  /* ════ RENDER ════ */
  return (
    <div style={s.page}>

      {/* ── TOP BAR ── */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <div style={s.titleBlock}>
            <span style={s.eyebrow}>Asset Management</span>
            <h1 style={s.pageTitle}>มิเตอร์และอุปกรณ์</h1>
          </div>
          <select style={s.projectPicker} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">— เลือกโปรเจกต์ —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={s.topActions}>
          <button style={s.btnIcon} onClick={handleSync} title="Sync จาก Template">🔄</button>
          <button style={{ ...s.btnIcon, ...(exportLoading && s.btnDisabled) }} onClick={handleExport} disabled={exportLoading} title="Export Excel">📥</button>
          <button style={s.btnAdd} onClick={() => openModal('meter')}>+ มิเตอร์</button>
          <button style={s.btnGhost} onClick={() => openModal('loop')}>+ Loop</button>
          <button style={s.btnGhost} onClick={() => openModal('panel')}>+ Panel</button>
        </div>
      </div>

      {/* ── ALERTS ── */}
      {err && <div style={s.alertErr} onClick={() => setErr('')}>{err} ✕</div>}
      {msg && <div style={s.alertOk} onClick={() => setMsg('')}>{msg} ✕</div>}

      {/* ── STATS ROW ── */}
      <div style={s.statsRow}>
        {[
          { icon:'🏗️', label:'Panels', val: filteredPanels.length },
          { icon:'🔗', label:'Loops',  val: allLoops.length },
          { icon:'⚡', label:'Meters', val: allMeters.length },
          { icon:'🟢', label:'เสร็จสิ้น', val: allMeters.filter(m=>m.status==='เสร็จสิ้น').length },
          { icon:'🟡', label:'กำลังทำ', val: allMeters.filter(m=>m.status==='กำลังทำ').length },
          { icon:'⚪', label:'ยังไม่ทำ', val: allMeters.filter(m=>!m.status || m.status==='ยังไม่ทำ').length },
        ].map(s2 => (
          <div key={s2.label} style={s.statPill}>
            <span style={s.statIcon}>{s2.icon}</span>
            <span style={s.statNum}>{s2.val}</span>
            <span style={s.statLabel}>{s2.label}</span>
          </div>
        ))}
      </div>

      {/* ── PROJECT PROGRESS BAR ── */}
      {selectedProject && allMeters.length > 0 && (
        <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
              ความคืบหน้าโปรเจกต์ทั้งหมด
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>
              {Math.round((allMeters.filter(m=>m.status==='เสร็จสิ้น').length / allMeters.length) * 100)}%
            </span>
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div 
              style={{ 
                height: '100%', 
                background: '#3b82f6', 
                borderRadius: 4,
                width: `${(allMeters.filter(m=>m.status==='เสร็จสิ้น').length / allMeters.length) * 100}%`
              }} 
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button 
              style={{ 
                fontSize: 12, 
                padding: '6px 12px', 
                background: '#fee2e2', 
                color: '#dc2626', 
                border: 'none', 
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 500
              }}
              onClick={handleResetAllStatuses}
            >
              🔄 รีเซ็ตสถานะทั้งหมด
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>
              กดเพื่อเปลี่ยนสถานะมิเตอร์ทั้งหมดเป็น "ยังไม่ทำ"
            </span>
          </div>
        </div>
      )}

      {/* ── VIEW TABS ── */}
      <div style={s.tabBar}>
        {[['meters','⚡ มิเตอร์ทั้งหมด'],['panels','🏗️ Panel / Loop'],['qr','📱 QR Code'],['import','📤 นำเข้า']].map(([id,label]) => (
          <button key={id} style={view===id ? s.tabActive : s.tab} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          VIEW: METERS TABLE
      ══════════════════════════════════════ */}
      {view === 'meters' && (
        <div style={s.card}>
          {/* search + filter bar */}
          <div style={s.filterBar}>
            <div style={s.searchWrap}>
              <span style={s.searchIcon}>🔍</span>
              <input
                style={s.searchInput}
                placeholder="ค้นหา Meter Code, Serial, Model..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button style={s.clearBtn} onClick={() => setSearch('')}>✕</button>}
            </div>
            <select style={s.filterSelect} value={filterLoop} onChange={e => setFilterLoop(e.target.value)}>
              <option value="">ทุก Loop</option>
              {allLoops.map(l => <option key={l.id} value={l.id}>{l.loop_code}</option>)}
            </select>
            <select style={s.filterSelect} value={filterModel} onChange={e => setFilterModel(e.target.value)}>
              <option value="">ทุก Model</option>
              {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select style={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">ทุกสถานะ</option>
              {['ยังไม่ทำ', 'กำลังทำ', 'เสร็จสิ้น'].map(s3 => <option key={s3} value={s3}>{s3}</option>)}
            </select>
            <span style={s.resultCount}>{allMeters.length} รายการ</span>
          </div>

          {/* table — responsive scroll */}
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['#', 'Meter Code', 'ชื่อมิเตอร์', 'Serial No.', 'Loop', 'Panel', 'Address', 'Baud', 'CT Ratio', 'Model', 'สถานะรายงาน', ''].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allMeters.map((m, idx) => {
                  const isEditing = editRow === m.id;
                  return (
                    <tr
                      key={m.id}
                      style={{ ...s.tr, background: isEditing ? '#f0f9ff' : (idx % 2 === 0 ? '#fff' : '#f8fafc'), cursor: 'pointer' }}
                      onClick={() => !isEditing && handleRowClick(m)}
                    >
                      <td style={{ ...s.td, color: '#94a3b8', width: 36 }}>{idx + 1}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: '#1e40af' }}>{m.meter_code}</td>
                      <td style={s.td}>{m.meter_name}</td>

                      {/* serial — editable */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        {isEditing
                          ? <input style={s.inlineInput} value={editData.serial_number} onChange={e => setEditData(d => ({ ...d, serial_number: e.target.value }))} />
                          : <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.serial_number || '—'}</span>
                        }
                      </td>

                      <td style={s.td}><Tag color='#ede9fe' text='#6d28d9'>{m.loop_code}</Tag></td>
                      <td style={s.td}><Tag color='#e0f2fe' text='#0369a1'>{m.panel_code}</Tag></td>

                      {/* address — editable */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        {isEditing
                          ? <input style={{ ...s.inlineInput, width: 60 }} value={editData.device_address} onChange={e => setEditData(d => ({ ...d, device_address: e.target.value }))} />
                          : m.device_address || '—'
                        }
                      </td>

                      {/* baud — editable */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        {isEditing
                          ? <input style={{ ...s.inlineInput, width: 70 }} value={editData.baud_rate} onChange={e => setEditData(d => ({ ...d, baud_rate: e.target.value }))} />
                          : m.baud_rate || '—'
                        }
                      </td>

                      {/* ct_ratio — editable */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        {isEditing
                          ? <input style={{ ...s.inlineInput, width: 70 }} value={editData.ct_ratio} onChange={e => setEditData(d => ({ ...d, ct_ratio: e.target.value }))} />
                          : m.ct_ratio || '—'
                        }
                      </td>

                      {/* model — editable */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        {isEditing
                          ? (
                            <select style={s.inlineSelect} value={editData.model} onChange={e => setEditData(d => ({ ...d, model: e.target.value }))}>
                              {['', 'CVM-B100', 'CVM-C10', 'CEM-C5', 'CEM-C6'].map(v => <option key={v} value={v}>{v || '—'}</option>)}
                            </select>
                          )
                          : <Tag color='#fef3c7' text='#92400e'>{m.model || '—'}</Tag>
                        }
                      </td>

                      {/* status — automatic based on report progress */}
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <StatusBadge status={getMeterStatus(m)} />
                      </td>

                      {/* actions */}
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={s.btnSave} onClick={() => saveEdit(m)} disabled={savingRow === m.id}>
                              {savingRow === m.id ? '...' : '💾'}
                            </button>
                            <button style={s.btnCancel} onClick={cancelEdit}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={s.btnEdit} onClick={() => startEdit(m)} title="แก้ไขแบบ inline">✏️</button>
                            <button style={s.btnEdit} onClick={() => openModal('meter', m)} title="แก้ไขแบบ modal">🔧</button>
                            <button style={s.btnDel} onClick={() => handleDelete('meter', m.id)} title="ลบ">🗑️</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {allMeters.length === 0 && (
                  <tr><td colSpan={11} style={s.empty}>ไม่พบข้อมูล{search ? ` สำหรับ "${search}"` : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          VIEW: PANELS / LOOPS
      ══════════════════════════════════════ */}
      {view === 'panels' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {filteredPanels.map(panel => (
            <div key={panel.id} style={s.card}>
              {/* panel header */}
              <div style={s.panelHeader}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={s.panelIcon}>🏗️</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'#0f172a' }}>{panel.panel_code} — {panel.panel_name}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                      SN: {panel.serial_number || '—'} · {panel.location_note || 'ไม่มีตำแหน่ง'}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <Tag color='#dbeafe' text='#1d4ed8'>{(panel.loops||[]).length} Loops</Tag>
                  <Tag color='#dcfce7' text='#15803d'>{(panel.loops||[]).flatMap(l=>l.meters||[]).length} Meters</Tag>
                  <button style={s.btnGhostSm} onClick={() => openModal('panel', panel)}>แก้ไข</button>
                  <button style={s.btnDangerSm} onClick={() => handleDelete('panel', panel.id)}>ลบ</button>
                </div>
              </div>

              {/* loops */}
              {(panel.loops || []).map(loop => (
                <div key={loop.id} style={s.loopBlock}>
                  <div style={s.loopHeader}>
                    <span style={{ fontWeight:700, color:'#6d28d9', fontSize:13 }}>🔗 {loop.loop_code} — {loop.loop_name}</span>
                    <div style={{ fontSize:12, color:'#64748b' }}>
                      IP: {loop.converter_ip || '—'} · MAC: {loop.mac_address || '—'}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button style={s.btnGhostSm} onClick={() => openModal('loop', { ...loop, panel_id: panel.id })}>แก้ไข</button>
                      <button style={s.btnDangerSm} onClick={() => handleDelete('loop', loop.id)}>ลบ</button>
                    </div>
                  </div>

                  {/* meter chips */}
                  <div style={s.meterChipGrid}>
                    {(loop.meters || []).map(m => (
                      <div key={m.id} style={s.meterChip}>
                        <div style={{ fontWeight:700, fontSize:12, color:'#1e40af' }}>{m.meter_code}</div>
                        <div style={{ fontSize:11, color:'#475569' }}>{m.meter_name}</div>
                        <div style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{m.serial_number}</div>
                        <StatusBadge status={m.status} />
                      </div>
                    ))}
                    <button style={s.addMeterChip} onClick={() => { setMeterForm({...meterDefaults, loop_id: loop.id}); setModal('meter'); }}>
                      + Meter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filteredPanels.length === 0 && <div style={s.emptyCard}>ยังไม่มี Panel — กด "+ Panel" เพื่อเริ่มต้น</div>}
        </div>
      )}

      {/* ══════════════════════════════════════
          VIEW: QR
      ══════════════════════════════════════ */}
      {view === 'qr' && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>QR Code สำหรับ Panel</h3>
          <div style={s.qrGrid}>
            {filteredPanels.map(p => (
              <div key={p.id} style={s.qrCard}>
                <img 
                  src={`${API_BASE_URL}/assets/panels/${p.id}/qr`} 
                  alt={p.panel_code} 
                  style={s.qrImg}
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
                <div style={{...s.qrError, display: 'none'}}>
                  <span style={{fontSize: 32}}>📷</span>
                  <span style={{fontSize: 11, color: '#94a3b8'}}>QR Error</span>
                </div>
                <div style={{ fontWeight:700, fontSize:12 }}>{p.panel_code}</div>
                <div style={{ fontSize:11, color:'#64748b' }}>{p.panel_name}</div>
                <a href={`${API_BASE_URL}/assets/panels/${p.id}/qr`} download style={s.qrDl}>⬇ ดาวน์โหลด</a>
              </div>
            ))}
            {filteredPanels.length === 0 && <p style={{ color:'#94a3b8' }}>ยังไม่มี Panel</p>}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          VIEW: IMPORT
      ══════════════════════════════════════ */}
      {view === 'import' && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>นำเข้าข้อมูลจาก Excel</h3>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 16px' }}>
            อัปโหลดไฟล์ .xlsx ที่มีโครงสร้าง Panel / Loop / Meter แล้วระบบจะนำเข้าโดยอัตโนมัติ
          </p>
          <form onSubmit={handleImport} style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:400 }}>
            <Fld label="ไฟล์ Excel">
              <input type="file" accept=".xlsx,.xlsm,.xls" style={input.base} onChange={e => setImportFile(e.target.files?.[0] || null)} />
            </Fld>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" style={btn.primary} disabled={!importFile}>นำเข้า</button>
              <button type="button" style={btn.secondary} onClick={handleSync}>Sync จาก Template</button>
            </div>
          </form>
        </div>
      )}

      {/* hidden scan input */}
      <input ref={scanRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleScanFile} />

      {/* ══════════════════════════════════════
          MODALS
      ══════════════════════════════════════ */}
      {modal && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={s.modalBox}>
            {/* PANEL modal */}
            {modal === 'panel' && (
              <>
                <ModalHeader title={editingPanelId ? '✏️ แก้ไข Panel' : '🏗️ เพิ่ม Panel'} onClose={closeModal} />
                <form onSubmit={submitPanel} style={s.formGrid}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <Fld label="โปรเจกต์">
                      <select style={input.base} value={panelForm.project_id} onChange={e => setPanelForm(c=>({...c,project_id:e.target.value}))} required>
                        <option value="">— เลือก —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Fld>
                  </div>
                  <Fld label="Panel Code"><input style={input.base} value={panelForm.panel_code} onChange={e=>setPanelForm(c=>({...c,panel_code:e.target.value}))} required /></Fld>
                  <Fld label="Panel Name"><input style={input.base} value={panelForm.panel_name} onChange={e=>setPanelForm(c=>({...c,panel_name:e.target.value}))} required /></Fld>
                  <Fld label="Serial Number"><input style={input.base} value={panelForm.serial_number} onChange={e=>setPanelForm(c=>({...c,serial_number:e.target.value}))} /></Fld>
                  <Fld label="ตำแหน่ง"><input style={input.base} value={panelForm.location_note} onChange={e=>setPanelForm(c=>({...c,location_note:e.target.value}))} /></Fld>
                  <ModalFooter onClose={closeModal} />
                </form>
              </>
            )}

            {/* LOOP modal */}
            {modal === 'loop' && (
              <>
                <ModalHeader title={editingLoopId ? '✏️ แก้ไข Loop' : '🔗 เพิ่ม Loop'} onClose={closeModal} />
                <form onSubmit={submitLoop} style={s.formGrid}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <Fld label="Panel">
                      <select style={input.base} value={loopForm.panel_id} onChange={e=>setLoopForm(c=>({...c,panel_id:e.target.value}))} required>
                        <option value="">— เลือก Panel —</option>
                        {filteredPanels.map(p => <option key={p.id} value={p.id}>{p.panel_code} – {p.panel_name}</option>)}
                      </select>
                    </Fld>
                  </div>
                  <Fld label="Loop Code"><input style={input.base} value={loopForm.loop_code} onChange={e=>setLoopForm(c=>({...c,loop_code:e.target.value}))} required /></Fld>
                  <Fld label="Loop Name"><input style={input.base} value={loopForm.loop_name} onChange={e=>setLoopForm(c=>({...c,loop_name:e.target.value}))} required /></Fld>
                  <Fld label="Converter Name"><input style={input.base} value={loopForm.converter_name} onChange={e=>setLoopForm(c=>({...c,converter_name:e.target.value}))} /></Fld>
                  <Fld label="Converter IP"><input style={input.base} value={loopForm.converter_ip} onChange={e=>setLoopForm(c=>({...c,converter_ip:e.target.value}))} /></Fld>
                  <Fld label="MAC Address"><input style={input.base} value={loopForm.mac_address} onChange={e=>setLoopForm(c=>({...c,mac_address:e.target.value}))} /></Fld>
                  <ModalFooter onClose={closeModal} />
                </form>
              </>
            )}

            {/* METER modal */}
            {modal === 'meter' && (
              <>
                <ModalHeader title={editingMeterId ? '✏️ แก้ไข Meter' : '⚡ เพิ่ม Meter'} onClose={closeModal} />
                <form onSubmit={submitMeter} style={s.formGrid}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <Fld label="Loop">
                      <select style={input.base} value={meterForm.loop_id} onChange={e=>setMeterForm(c=>({...c,loop_id:e.target.value}))} required>
                        <option value="">— เลือก Loop —</option>
                        {loopOptions.map(l => <option key={l.id} value={l.id}>{l.loop_code} – {l.loop_name}</option>)}
                      </select>
                    </Fld>
                  </div>
                  <Fld label="Meter Code"><input style={input.base} value={meterForm.meter_code} onChange={e=>setMeterForm(c=>({...c,meter_code:e.target.value}))} required /></Fld>
                  <Fld label="Meter Name"><input style={input.base} value={meterForm.meter_name} onChange={e=>setMeterForm(c=>({...c,meter_name:e.target.value}))} required /></Fld>
                  <Fld label="Serial Number">
                    <div style={{ display:'flex', gap:6 }}>
                      <input style={{ ...input.base, flex:1 }} value={meterForm.serial_number} onChange={e=>setMeterForm(c=>({...c,serial_number:e.target.value}))} />
                      <button type="button" style={s.scanBtn} onClick={() => startScan('sn')} disabled={scanLoading}>
                        {scanLoading && scanState.field==='sn' ? '…' : '📷'}
                      </button>
                    </div>
                    {scanState.field==='sn' && scanState.suggestions.length > 0 && (
                      <div style={s.scanDrop}>
                        {scanState.suggestions.map((sg,i) => (
                          <button key={i} type="button" style={s.scanSug} onClick={() => setMeterForm(c=>({...c,serial_number:sg.value}))}>
                            <span style={{ fontSize:10, color:'#94a3b8' }}>{sg.label}</span> {sg.value}
                          </button>
                        ))}
                      </div>
                    )}
                  </Fld>
                  <Fld label="Device Address"><input style={input.base} value={meterForm.device_address} onChange={e=>setMeterForm(c=>({...c,device_address:e.target.value}))} /></Fld>
                  <Fld label="Model">
                    <select style={input.base} value={meterForm.model} onChange={e=>setMeterForm(c=>({...c,model:e.target.value}))}>
                      <option value="">— เลือก —</option>
                      {['CVM-B100','CVM-C10','CEM-C5','CEM-C6'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Fld>
                  <Fld label="CT Ratio"><input style={input.base} placeholder="50/5" value={meterForm.ct_ratio} onChange={e=>setMeterForm(c=>({...c,ct_ratio:e.target.value}))} /></Fld>
                  <Fld label="Baud Rate"><input style={input.base} placeholder="9600" value={meterForm.baud_rate} onChange={e=>setMeterForm(c=>({...c,baud_rate:e.target.value}))} /></Fld>
                  <Fld label="สถานะ">
                    <select style={input.base} value={meterForm.status} onChange={e=>setMeterForm(c=>({...c,status:e.target.value}))}>
                      {['Active','Maintenance','Offline'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Fld>
                  <ModalFooter onClose={closeModal} label={editingMeterId ? 'อัปเดต' : 'บันทึก'} />
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Modal helpers ─── */
function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
      <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#111827' }}>{title}</h3>
      <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9ca3af', lineHeight:1, padding:'0 2px' }}>×</button>
    </div>
  );
}
function ModalFooter({ onClose, label = 'บันทึก' }) {
  return (
    <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'flex-end', gap:10, marginTop:8 }}>
      <button type="button" style={btn.secondary} onClick={onClose}>ยกเลิก</button>
      <button type="submit" style={btn.primary}>{label}</button>
    </div>
  );
}

/* ─── Styles ─── */
const s = {
  page: {
    padding: 'clamp(16px, 3vw, 28px)',
    maxWidth: 1400,
    margin: '0 auto',
    fontFamily: "'Sarabun', 'Segoe UI', system-ui, sans-serif",
    minHeight: '100vh',
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  /* top bar */
  topBar: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' },
  topLeft: { display:'flex', flexDirection:'column', gap:6 },
  titleBlock: { display:'flex', flexDirection:'column', gap:2 },
  eyebrow: { fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em' },
  pageTitle: { margin:0, fontSize:'clamp(18px,3vw,24px)', fontWeight:700, color:'#111827' },
  projectPicker: { padding:'8px 12px', borderRadius:8, border:'1.5px solid #d1d5db', fontSize:13, color:'#111827', background:'#fff', minWidth:200, maxWidth:300, fontFamily:'inherit' },

  topActions: { display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' },
  btnAdd: { padding:'9px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' },
  btnGhost: { padding:'9px 14px', background:'#fff', color:'#374151', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' },
  btnIcon: { padding:'9px 11px', background:'#fff', color:'#374151', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:14, cursor:'pointer' },
  btnDisabled: { opacity:0.5, cursor:'not-allowed' },

  /* alerts */
  alertErr: { background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, cursor:'pointer' },
  alertOk:  { background:'#f0fdf4', border:'1px solid #86efac', color:'#16a34a', borderRadius:8, padding:'10px 14px', fontSize:13, cursor:'pointer' },

  /* stats */
  statsRow: { display:'flex', gap:10, flexWrap:'wrap' },
  statPill: { display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 14px', boxShadow:'0 1px 3px rgba(0,0,0,.04)' },
  statIcon: { fontSize:16 },
  statNum:  { fontSize:18, fontWeight:700, color:'#111827' },
  statLabel:{ fontSize:11, color:'#6b7280', fontWeight:600 },

  /* tabs */
  tabBar: { display:'flex', gap:4, overflowX:'auto', paddingBottom:2 },
  tab:       { padding:'8px 16px', background:'transparent', border:'1px solid #e5e7eb', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', color:'#6b7280', whiteSpace:'nowrap', fontFamily:'inherit' },
  tabActive: { padding:'8px 16px', background:'#2563eb', border:'1px solid #2563eb', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:'#fff', whiteSpace:'nowrap', fontFamily:'inherit' },

  /* card */
  card: { background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', boxShadow:'0 1px 3px rgba(0,0,0,.04)', padding:20 },
  cardTitle: { margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#111827' },

  /* filter bar */
  filterBar: { display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:14 },
  searchWrap: { position:'relative', display:'flex', alignItems:'center', flex:'1 1 220px', minWidth:180 },
  searchIcon: { position:'absolute', left:10, fontSize:14, pointerEvents:'none', color:'#9ca3af' },
  searchInput: { width:'100%', paddingLeft:32, paddingRight:28, padding:'9px 28px 9px 32px', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:13, outline:'none', background:'#fff', fontFamily:'inherit', color:'#111827' },
  clearBtn: { position:'absolute', right:8, background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:14 },
  filterSelect: { padding:'9px 12px', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:13, background:'#fff', color:'#374151', minWidth:130, fontFamily:'inherit' },
  resultCount: { fontSize:12, color:'#9ca3af', fontWeight:600, whiteSpace:'nowrap' },

  /* table */
  tableWrap: { overflowX:'auto', WebkitOverflowScrolling:'touch', borderRadius:8, border:'1px solid #e5e7eb' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { padding:'10px 12px', background:'#f3f4f6', textAlign:'left', fontWeight:600, color:'#6b7280', fontSize:11, borderBottom:'1.5px solid #e5e7eb', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f3f4f6', transition:'background .1s' },
  td: { padding:'10px 12px', color:'#374151', verticalAlign:'middle' },
  empty: { padding:32, textAlign:'center', color:'#9ca3af', fontSize:13 },

  /* inline edit */
  inlineInput:  { padding:'5px 8px', border:'1.5px solid #bfdbfe', borderRadius:6, fontSize:12, outline:'none', background:'#fff', width:90, fontFamily:'inherit' },
  inlineSelect: { padding:'5px 8px', border:'1.5px solid #bfdbfe', borderRadius:6, fontSize:12, outline:'none', background:'#fff', fontFamily:'inherit' },

  /* row action buttons */
  btnEdit:   { padding:'4px 8px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', fontSize:12 },
  btnDel:    { padding:'4px 8px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, cursor:'pointer', fontSize:12 },
  btnSave:   { padding:'5px 10px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' },
  btnCancel: { padding:'5px 8px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', fontSize:12, fontFamily:'inherit' },

  /* panel view */
  panelHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:12, padding:'0 0 12px', borderBottom:'1px solid #f3f4f6' },
  panelIcon: { fontSize:20 },
  loopBlock: { background:'#f9fafb', border:'1px solid #f3f4f6', borderRadius:8, padding:14, marginBottom:10 },
  loopHeader: { display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', marginBottom:10 },
  meterChipGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:8 },
  meterChip: { background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', display:'flex', flexDirection:'column', gap:3 },
  addMeterChip: { background:'#eff6ff', border:'1.5px dashed #bfdbfe', borderRadius:8, padding:'10px 12px', color:'#2563eb', fontWeight:600, fontSize:12, cursor:'pointer', fontFamily:'inherit' },

  btnGhostSm:  { padding:'4px 10px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, cursor:'pointer', color:'#374151', fontFamily:'inherit' },
  btnDangerSm: { padding:'4px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, fontSize:12, cursor:'pointer', color:'#dc2626', fontFamily:'inherit' },

  /* qr */
  qrGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:16 },
  qrCard: { display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:16, border:'1px solid #e5e7eb', borderRadius:12, textAlign:'center', background:'#fff' },
  qrImg:  { width:110, height:110 },
  qrError: { width:110, height:110, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#f9fafb', borderRadius:8 },
  qrDl:   { fontSize:12, color:'#2563eb', textDecoration:'none', fontWeight:600 },

  emptyCard: { background:'#fff', borderRadius:12, border:'1.5px dashed #e5e7eb', padding:40, textAlign:'center', color:'#9ca3af', fontSize:14 },

  /* modal */
  overlay:  { position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modalBox: { background:'#fff', borderRadius:14, padding:28, width:'100%', maxWidth:560, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 16px 48px rgba(0,0,0,.15)' },
  formGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px' },

  /* scan */
  scanBtn:  { padding:'9px 12px', background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:8, cursor:'pointer', fontSize:15 },
  scanDrop: { marginTop:6, background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'flex', flexDirection:'column', gap:4 },
  scanSug:  { background:'none', border:'none', textAlign:'left', padding:'5px 8px', cursor:'pointer', borderRadius:6, fontSize:13, color:'#1d4ed8', fontFamily:'inherit' },
};

export default Assets;