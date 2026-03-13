import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout';
import { getReportFile, getAssetReportPreview, getReportMetadata } from '../../api/reportApi';

// ─── Parse xlsx blob → structured report data ────────────────────────────────
async function parseReportBlob(blob) {
  const XLSX = await import('xlsx');
  const ab = await blob.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const raw = {};
  wb.SheetNames.forEach(name => {
    raw[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
  });

  const findVal = (rows, keyword) => {
    for (const row of rows) {
      for (let i = 0; i < row.length - 1; i++) {
        if (typeof row[i] === 'string' && row[i].toLowerCase().includes(keyword.toLowerCase())) {
          for (let j = i + 1; j < row.length; j++) {
            if (row[j] !== null && row[j] !== undefined && String(row[j]).trim() !== '') return String(row[j]).trim();
          }
        }
      }
    }
    return '-';
  };

  // Cover
  const cover = raw['Cover'] || [];
  const meta = {
    project:        findVal(cover, 'Project'),
    inspectionDate: findVal(cover, 'Inspection Date'),
    product:        findVal(cover, 'Inspection Product'),
    consumer:       findVal(cover, 'Consumer'),
    inspectedBy:    findVal(cover, 'Inspection By'),
    approvedBy:     findVal(cover, 'Approve By'),
    company:        'AVERA Co., LTD',
    reportNo:       'EMS-MA-0001',
  };

  // Page 1 — Introduction
  const p1 = raw['Page (1)'] || [];
  let intro = { engineer: '-', status: '-', serviceDate: '-', note: '-' };
  for (const row of p1) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const m1 = cell.match(/Engineer:\s*([^|]+)/); if (m1) intro.engineer = m1[1].trim();
      const m2 = cell.match(/Status:\s*([^|]+)/);   if (m2) intro.status   = m2[1].trim();
      const m3 = cell.match(/Service date:\s*([^|]+)/); if (m3) intro.serviceDate = m3[1].trim();
      const m4 = cell.match(/service note:\s*(.+)/i);   if (m4) intro.note = m4[1].trim();
    }
  }

  // Page 2 — Equipment list
  const p2 = raw['Page (2)'] || [];
  const equipment = [];
  let inTable = false;
  for (const row of p2) {
    const flat = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!inTable) {
      if (flat.some(v => String(v) === 'No.') || flat.some(v => String(v) === 'Meter Name')) { inTable = true; }
      continue;
    }
    const no = flat.find(v => typeof v === 'number' && v >= 1 && v <= 200);
    if (!no) continue;
    const idx = flat.indexOf(no);
    equipment.push({
      no,
      name:   String(flat[idx + 1] ?? '-'),
      serial: String(flat[idx + 2] ?? '-'),
      panel:  String(flat[idx + 3] ?? '-'),
      loop:   String(flat[idx + 4] ?? '-'),
      status: String(flat[idx + 5] ?? '-'),
      model:  String(flat[idx + 6] ?? '-'),
    });
  }

  // Pages 4 & 5 — Checklists
  const parseChecklist = (rows) => {
    const items = [];
    let inList = false;
    for (const row of rows) {
      const flat = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (flat.some(v => String(v).includes('หัวข้อการตรวจเช็ค'))) { inList = true; continue; }
      if (!inList) continue;
      const no = flat.find(v => typeof v === 'number' && v >= 1 && v <= 20);
      if (!no) { if (flat.length === 0) inList = false; continue; }
      const idx    = flat.indexOf(no);
      const desc   = flat[idx + 1] && typeof flat[idx + 1] === 'string' ? flat[idx + 1] : null;
      const pass   = flat.some(v => v === true  || v === 'True'  || v === 'true');
      const fail   = flat.some(v => v === false || v === 'False' || v === 'false');
      const remark = flat.find(v =>
        typeof v === 'string' && v !== 'True' && v !== 'False' &&
        String(v).trim().length > 1 && v !== String(no) && v !== desc
      ) ?? '';
      if (desc) items.push({ no, desc, pass: pass && !fail, fail: fail && !pass, remark });
    }
    return items;
  };

  return {
    meta,
    intro,
    equipment,
    checklist1: parseChecklist(raw['Page (4)'] || []),
    checklist2: parseChecklist(raw['Page (5)'] || []),
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    Completed: { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Active:    { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
    Inactive:  { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
  };
  const s = map[status] || map.Inactive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: .3 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {status}
    </span>
  );
}

function CheckRow({ no, desc, pass, fail, remark }) {
  const neither = !pass && !fail;
  const icon    = pass ? '✓' : fail ? '✗' : '—';
  const iconBg  = pass ? '#ecfdf5' : fail ? '#fef2f2' : '#f1f5f9';
  const iconClr = pass ? '#16a34a' : fail ? '#dc2626' : '#94a3b8';
  const label   = pass ? 'ผ่าน' : fail ? 'ไม่ผ่าน' : '—';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0',
      borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ minWidth: 26, height: 26, borderRadius: 7, background: iconBg,
        color: iconClr, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, flexShrink: 0 }}>
            {String(no).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 13, color: neither ? '#94a3b8' : '#1e293b', fontWeight: 500, lineHeight: 1.5 }}>
            {desc || '—'}
          </span>
        </div>
        {remark && remark !== '-' && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', background: '#f8fafc',
            borderRadius: 6, padding: '3px 10px', display: 'inline-block', border: '1px solid #e2e8f0' }}>
            📝 {remark}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: iconClr, flexShrink: 0, paddingTop: 4 }}>
        {label}
      </span>
    </div>
  );
}

function Section({ title, icon, right, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 17 }}>{icon}</span>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        </div>
        {right}
      </div>
      <div style={{ padding: '14px 20px' }}>{children}</div>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      {items.map(({ label, value, accent }) => (
        <div key={label} style={{ padding: '10px 14px', borderRadius: 9,
          background: accent ? '#eff6ff' : '#f8fafc',
          border: `1px solid ${accent ? '#bfdbfe' : '#e2e8f0'}` }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: .8, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 13, color: accent ? '#1d4ed8' : '#1e293b', fontWeight: 600 }}>{value || '-'}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function OnlineReport() {
  const { reportId, entityType, entityId } = useParams();
  const navigate = useNavigate();

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState('overview');
  const [lastModified, setLastModified] = useState(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (!reportId) return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const meta = await getReportMetadata(reportId);
        if (lastModified && meta.last_modified !== lastModified) loadData();
        setLastModified(meta.last_modified);
      } catch {}
    }, 10000);
    return () => clearInterval(pollingRef.current);
  }, [reportId, lastModified]);

  useEffect(() => { loadData(); }, [reportId, entityType, entityId]);

  async function loadData() {
    setLoading(true); setError('');
    try {
      let blob;
      if (reportId) {
        blob = await getReportFile(reportId);
        const m = await getReportMetadata(reportId);
        setLastModified(m.last_modified);
      } else if (entityType && entityId) {
        blob = await getAssetReportPreview(entityType, entityId);
      } else throw new Error('Invalid parameters');
      setData(await parseReportBlob(blob));
    } catch {
      setError('ไม่สามารถโหลดไฟล์รายงานได้ หรือยังไม่มีข้อมูลประวัติสำหรับรายการนี้');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: '4px solid #e2e8f0',
        borderTopColor: '#2563eb', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>กำลังโหลดรายงาน...</p>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex',
      alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center',
        maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
        <p style={{ color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>โหลดรายงานไม่สำเร็จ</p>
        <p style={{ color: '#64748b', fontSize: 13 }}>{error}</p>
        <button onClick={loadData} style={{ marginTop: 18, padding: '10px 24px', background: '#2563eb',
          color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>ลองใหม่</button>
      </div>
    </div>
  );

  const { meta, intro, equipment, checklist1, checklist2 } = data;
  const passCount1 = checklist1.filter(i => i.pass).length;
  const passCount2 = checklist2.filter(i => i.pass).length;
  const totalItems = checklist1.length + checklist2.length;
  const totalPass  = passCount1 + passCount2;
  const passRate   = totalItems > 0 ? Math.round((totalPass / totalItems) * 100) : 0;

  const tabs = [
    { id: 'overview',  label: 'ภาพรวม',       icon: '📋' },
    { id: 'equipment', label: 'รายการอุปกรณ์', icon: '🔌' },
    { id: 'checklist', label: 'ผลการตรวจสอบ',  icon: '✅' },
  ];

  const layoutActions = [
    {
      label: 'พิมพ์',
      onClick: () => window.print(),
    },
  ];

  return (
    <CustomerLayout
      title={meta.project}
      subtitle={`${meta.reportNo} · ${meta.inspectionDate}`}
      backTo="/customer"
      actions={layoutActions}
      showScanButton={false}
    >
      <div style={{ minHeight: '100vh', background: '#f1f5f9',
        fontFamily: "'Sarabun', 'IBM Plex Sans Thai', system-ui, sans-serif" }}>

        <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          borderRadius: 18, padding: '28px 32px', marginBottom: 20, color: '#fff',
          position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160,
            borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, opacity: .65,
              marginBottom: 7, textTransform: 'uppercase' }}>
              {meta.company} · MA Service Report
            </div>
            <h1 style={{ margin: '0 0 3px', fontSize: 22, fontWeight: 800, letterSpacing: '-.4px' }}>
              {meta.project}
            </h1>
            <p style={{ margin: '0 0 20px', opacity: .75, fontSize: 13 }}>{meta.consumer}</p>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {[
                { label: 'วันที่ตรวจสอบ',  value: meta.inspectionDate },
                { label: 'วิศวกรผู้ตรวจ',  value: intro.engineer },
                { label: 'สถานะ',           value: intro.status },
                { label: 'อุปกรณ์ทั้งหมด', value: `${equipment.length} รายการ` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, opacity: .6, fontWeight: 700, letterSpacing: .5, marginBottom: 1 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14, marginBottom: 20 }}>
          {[
            { icon: '🔌', label: 'อุปกรณ์ทั้งหมด', value: equipment.length,  sub: 'เครื่อง',            color: '#3b82f6' },
            { icon: '✅', label: 'ผ่านการตรวจ',    value: totalPass,         sub: `จาก ${totalItems} หัวข้อ`, color: '#16a34a' },
            { icon: '📊', label: 'อัตราผ่าน',      value: `${passRate}%`,    sub: 'ของหัวข้อทั้งหมด',   color: passRate >= 80 ? '#16a34a' : '#ca8a04' },
            { icon: '🏷️', label: 'Model',          value: equipment[0]?.model || '-', sub: 'ทุกเครื่อง', color: '#7c3aed' },
          ].map(({ icon, label, value, sub, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.05)', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 1 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 5, borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,.05)', marginBottom: 16, width: 'fit-content' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 12, transition: 'all .12s',
                background: activeTab === tab.id ? '#2563eb' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#64748b',
                display: 'flex', alignItems: 'center', gap: 5 }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <>
            <Section title="ข้อมูลโครงการ" icon="🏢">
              <InfoGrid items={[
                { label: 'โครงการ',        value: meta.project,        accent: true },
                { label: 'ลูกค้า',         value: meta.consumer },
                { label: 'วันที่ตรวจสอบ',  value: meta.inspectionDate },
                { label: 'เลขรายงาน',     value: meta.reportNo },
                { label: 'วิศวกรผู้ตรวจ',  value: intro.engineer },
                { label: 'ผู้อนุมัติ',     value: meta.approvedBy },
                { label: 'สถานะ',         value: intro.status },
                { label: 'วันที่ให้บริการ', value: intro.serviceDate },
              ]} />
            </Section>

            <Section title="บันทึกการให้บริการ" icon="📝">
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 9,
                border: '1px solid #e2e8f0', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                {intro.note}
              </div>
            </Section>

            <Section title="สรุปผลการตรวจ" icon="📈">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'หัวข้อที่ 1 — Technical Inspection', pass: passCount1, total: checklist1.length },
                  { label: 'หัวข้อที่ 2 — Secondary Inspection',  pass: passCount2, total: checklist2.length },
                ].map(({ label, pass, total }) => {
                  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
                  const clr = pct >= 80 ? '#16a34a' : '#ca8a04';
                  return (
                    <div key={label} style={{ padding: 16, background: '#f8fafc', borderRadius: 11, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: clr }}>{pct}%</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{pass}/{total} หัวข้อ</span>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99 }}>
                        <div style={{ height: '100%', borderRadius: 99, background: clr, width: `${pct}%` }} />
                      </div>
                      <button onClick={() => setActiveTab('checklist')}
                        style={{ marginTop: 10, fontSize: 11, color: '#2563eb', fontWeight: 700,
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        ดูรายละเอียด →
                      </button>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {/* Tab: Equipment */}
        {activeTab === 'equipment' && (
          <Section title={`รายการอุปกรณ์ (${equipment.length} รายการ)`} icon="🔌"
            right={<span style={{ fontSize: 11, color: '#94a3b8' }}>กดที่แถวเพื่อดูรายงานรายตัว</span>}>
            {equipment.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div>ไม่พบรายการอุปกรณ์</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['#', 'Meter Name', 'Serial Number', 'Panel', 'Loop', 'Model', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '9px 13px', textAlign: 'left', color: '#64748b',
                          fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: .5,
                          borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((eq, i) => (
                      <tr key={i} onClick={() => navigate(`/customer/meter/${eq.no}`)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          background: i % 2 === 0 ? '#fff' : '#fafbfc', transition: 'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc'}>
                        <td style={{ padding: '10px 13px', color: '#94a3b8', fontWeight: 600 }}>{eq.no}</td>
                        <td style={{ padding: '10px 13px', color: '#1e293b', fontWeight: 700 }}>{eq.name}</td>
                        <td style={{ padding: '10px 13px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>{eq.serial}</td>
                        <td style={{ padding: '10px 13px', color: '#475569' }}>{eq.panel}</td>
                        <td style={{ padding: '10px 13px', color: '#475569' }}>{eq.loop}</td>
                        <td style={{ padding: '10px 13px', color: '#475569' }}>{eq.model}</td>
                        <td style={{ padding: '10px 13px' }}><StatusBadge status={eq.status} /></td>
                        <td style={{ padding: '10px 13px' }}>
                          <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ดูรายงาน →
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* Tab: Checklist */}
        {activeTab === 'checklist' && (
          <>
            {checklist1.length > 0 && (
              <Section icon="🔍" title="หัวข้อที่ 1 — Technical Inspection"
                right={
                  <span style={{ fontSize: 12, fontWeight: 700,
                    color: passCount1 === checklist1.length ? '#16a34a' : '#ca8a04' }}>
                    ✓ {passCount1}/{checklist1.length} ผ่าน
                  </span>
                }>
                {checklist1.map(item => <CheckRow key={item.no} {...item} />)}
              </Section>
            )}

            {checklist2.length > 0 && (
              <Section icon="🔎" title="หัวข้อที่ 2 — Secondary Inspection"
                right={
                  <span style={{ fontSize: 12, fontWeight: 700,
                    color: passCount2 === checklist2.length ? '#16a34a' : '#ca8a04' }}>
                    ✓ {passCount2}/{checklist2.length} ผ่าน
                  </span>
                }>
                {checklist2.map(item => <CheckRow key={item.no} {...item} />)}
              </Section>
            )}

            {checklist1.length === 0 && checklist2.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 14, padding: '48px 24px',
                textAlign: 'center', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#64748b' }}>ยังไม่มีข้อมูลผลการตรวจสอบ</div>
                <div style={{ fontSize: 12 }}>รายงาน MA นี้ยังไม่มีข้อมูล checklist</div>
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', padding: '20px 0', color: '#cbd5e1', fontSize: 11 }}>
          {meta.company} · {meta.reportNo} · Generated from EMS Platform
        </div>
      </div>
    </div>
    </CustomerLayout>
  );
}

export default OnlineReport;