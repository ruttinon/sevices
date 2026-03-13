/**
 * CustomerPortal.jsx
 *
 * รวม ProjectView.jsx และ Equipment.jsx เข้ามาที่นี่แล้ว
 * เหตุผล:
 *  - ProjectView แสดง panel list + stats + reports ซึ่งซ้ำกับ view='project' ใน Portal
 *  - Equipment แสดง panel grid + meter table เหมือน ProjectView แทบทุกอย่าง
 *  - แทนที่จะ navigate ไปอีก route เพิ่ม tab "อุปกรณ์" และ "รายงาน" ใน project view เดิม
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Camera, FileText, Building2, Zap, QrCode, Search, ChevronRight } from 'lucide-react';
import CustomerLayout from '../../components/customer/CustomerLayout';
import CustomerScan from './CustomerScan';
import AssetTable from '../../components/AssetTable';
import ReportViewer from '../../components/ReportViewer';
import { getApiErrorMessage } from '../../api/api';
import { getProjectPublic } from '../../api/projectApi';
import { scanQr, scanOcrImage, manualSearch } from '../../api/scanApi';
import { detectBarcodeValuesFromFile } from '../../utils/barcodeImageScan';
import { getCustomerProjectId, setCustomerProjectId, clearCustomerSession } from '../../utils/customerSession';
import { colors, font, space, radius, card, text, badge, tabBtn, tabBtnActive, alert } from '../../theme';

function CustomerPortal() {
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams();
  const [searchParams] = useSearchParams();
  const qrType = searchParams.get('type');
  const qrEntityId = searchParams.get('id');

  const [view, setView] = useState('home');
  const [projectId, setProjectId] = useState(() => urlProjectId || getCustomerProjectId());
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [highlightMeterId, setHighlightMeterId] = useState(null);

  // Project tabs: cabinets | equipment | reports
  const [activeTab, setActiveTab] = useState('cabinets');
  const [showFullTable, setShowFullTable] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [showScanOverlay, setShowScanOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (urlProjectId) {
      setCustomerProjectId(urlProjectId);
      setProjectId(urlProjectId);
    }
  }, [urlProjectId]);

  useEffect(() => {
    if (projectId) loadProject(projectId);
    else setView('home');
  }, [projectId]);

  useEffect(() => {
    if (qrEntityId && qrType === 'meter') setHighlightMeterId(Number(qrEntityId));
  }, [qrType, qrEntityId]);

  async function loadProject(pid) {
    setLoading(true);
    setError('');
    try {
      const data = await getProjectPublic(pid);
      setProjectData(data);
      setView('project');
    } catch (err) {
      setError(getApiErrorMessage(err, 'ไม่สามารถโหลดข้อมูลโปรเจกต์ได้'));
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      const candidates = await detectBarcodeValuesFromFile(file);
      const results = [];
      for (const code of candidates) {
        try {
          const match = await scanQr(code, { project_id: projectId });
          if (match) results.push(match);
        } catch {}
      }
      if (results.length === 0) {
        const ocrResults = await scanOcrImage(file, '', { project_id: projectId });
        if (Array.isArray(ocrResults)) results.push(...ocrResults);
      }
      if (!results.length) throw new Error('ไม่พบข้อมูลจาก QR หรือ OCR');
      const match = results[0];
      if (match.entity_type === 'project') {
        setCustomerProjectId(match.entity_id);
        setProjectId(match.entity_id);
        return;
      }
      if (!projectId && match.project_id) {
        setCustomerProjectId(match.project_id);
        setProjectId(match.project_id);
      }
      if (match.meter_id) navigate(`/customer/online-report/meter/${match.meter_id}`);
      else if (match.panel_id) navigate(`/customer/panel/${match.panel_id}`);
      else if (match.loop_id) navigate(`/customer/portal/${match.project_id}?type=loop&id=${match.loop_id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'สแกนไม่สำเร็จ กรุณาลองใหม่'));
    } finally {
      setScanning(false);
    }
  }

  function handleLogout() {
    clearCustomerSession();
    setProjectId(null);
    setProjectData(null);
    setView('home');
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError('');
    try {
      const results = await manualSearch(searchQuery, { project_id: projectId });
      setSearchResults(results);
      setView('search');
    } catch (err) {
      setError(getApiErrorMessage(err, 'ค้นหาไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }

  const commonActions = [{ label: 'เปลี่ยนโครงการ', onClick: handleLogout }];

  // ── Home ────────────────────────────────────────────────────────────────────
  if (view === 'home' && !projectId) {
    return (
      <CustomerLayout
        title="ยินดีต้อนรับสู่ระบบรายงาน"
        subtitle="สแกน QR โครงการเพื่อเริ่มใช้งาน"
        actions={commonActions}
        showScanButton={false}
      >
        <div style={styles.hero}>
          <div style={styles.iconCircle}><Building2 size={48} color="#3b82f6" /></div>
          <p style={styles.heroSubtitle}>กดปุ่มด้านล่างเพื่อสแกน QR ของโครงการ (Project QR)</p>
        </div>
        <button style={styles.mainScanBtn} onClick={() => fileInputRef.current.click()} disabled={scanning}>
          <Camera size={28} />
          <span style={styles.mainScanLabel}>{scanning ? 'กำลังสแกน...' : 'สแกน QR โครงการ'}</span>
        </button>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" capture="environment" onChange={handleFileSelect} />
        {error && <div style={styles.error}>{error}</div>}
      </CustomerLayout>
    );
  }

  // ── Project (รวม cabinets + equipment table + reports) ──────────────────────
  if (view === 'project' && projectData) {
    const { stats, panels, reports } = projectData;
    const totalMeters = stats.total_meters;
    const pdfCount = (reports || []).filter(r => r.file_path?.toLowerCase().endsWith('.pdf')).length;
    const xlsxCount = (reports || []).filter(r => r.file_path?.toLowerCase().endsWith('.xlsx')).length;

    const actions = [
      ...commonActions,
      ...(stats?.latest_report_id ? [{ label: 'รายงานล่าสุด', icon: <FileText size={16} />, onClick: () => navigate(`/customer/online-report/${stats.latest_report_id}`) }] : []),
      { label: 'สแกน QR', icon: <QrCode size={16} />, onClick: () => fileInputRef.current.click() },
      { label: 'ค้นหาอุปกรณ์', icon: <Search size={16} />, onClick: () => setView('search') },
    ];

    return (
      <CustomerLayout title={projectData.project.name} subtitle={projectData.project.location} actions={actions} showScanButton={false}>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" capture="environment" onChange={handleFileSelect} />
        {error && <div style={styles.error}>{error}</div>}

        {/* Stats */}
        <div style={styles.statsGrid}>
          <StatCard icon={<Building2 size={22} color="#3b82f6" />} value={panels.length} label="Panels" />
          <StatCard icon={<Zap size={22} color="#f59e0b" />} value={totalMeters} label="Meters" />
          <StatCard icon={<FileText size={22} color="#10b981" />} value={stats.completed_meters} label="Completed" />
        </div>

        {/* Tabs — cabinets / equipment / reports */}
        <div className="ems-tab-bar">
          <TabBtn id="cabinets"  active={activeTab} label={`ตู้ควบคุม (${panels.length})`} onClick={setActiveTab} />
          <TabBtn id="equipment" active={activeTab} label={`อุปกรณ์ (${totalMeters})`}                 onClick={setActiveTab} />
          <TabBtn id="reports"   active={activeTab} label={`รายงาน (${reports.length})`}   onClick={setActiveTab} />
        </div>

        {/* Tab: ตู้ควบคุม — คลิกเข้า PanelView */}
        {activeTab === 'cabinets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {projectData.panels.map((panel) => (
              <Link key={panel.id} to={`/customer/panel/${panel.id}`} style={styles.panelCard}>
                <div style={styles.panelIcon}>⚡</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.primary }}>
                    {panel.panel_code}
                  </strong>
                  <p style={{ margin: '2px 0', fontSize: font.size.base, color: colors.text, fontWeight: font.weight.medium }}>
                    {panel.panel_name}
                  </p>
                  <p style={{ margin: 0, fontSize: font.size.sm, color: colors.textSub }}>
                    {panel.location_note || 'ไม่ระบุตำแหน่ง'}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={badge.blue}>{panel.loops.length} loops</span>
                  <p style={{ margin: '4px 0 0', fontSize: font.size.xs, color: colors.textMuted }}>
                    {panel.loops.reduce((s, l) => s + l.meters.length, 0)} meters
                  </p>
                </div>
              </Link>
            ))}
            {projectData.panels.length === 0 && (
              <div style={{ ...card, textAlign: 'center', color: colors.textMuted }}>ยังไม่มีตู้ควบคุมในโปรเจกต์นี้</div>
            )}
          </div>
        )}

        {/* Tab: อุปกรณ์ — meter grid + toggle full table */}
        {activeTab === 'equipment' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, color: colors.textSub, fontSize: font.size.sm, fontWeight: font.weight.semi, marginBottom: space.sm }}>
              <span>📦 <strong>{projectData.panels.length}</strong> Panels</span>
              <span style={{ color: colors.border }}>·</span>
              <span>📟 <strong>{totalMeters}</strong> Meters</span>
            </div>

            <div className="ems-panel-grid">
              {projectData.panels.map((panel) => {
                const meterCount = panel.loops.reduce((s, l) => s + l.meters.length, 0);
                return (
                  <Link key={panel.id} to={`/customer/panel/${panel.id}`} style={styles.equipPanelCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                      <div style={styles.equipPanelIcon}>⚡</div>
                      <span style={badge.blue}>{panel.panel_code}</span>
                    </div>
                    <strong style={{ fontSize: font.size.base, color: colors.text, fontWeight: font.weight.semi }}>
                      {panel.panel_name}
                    </strong>
                    <p style={{ margin: 0, fontSize: font.size.sm, color: colors.textSub, lineHeight: 1.4 }}>
                      {panel.location_note || 'ไม่ระบุตำแหน่ง'}
                    </p>
                    <div style={{ display: 'flex', gap: space.xs }}>
                      <span style={badge.gray}>{panel.loops.length} loops</span>
                      <span style={badge.gray}>{meterCount} meters</span>
                    </div>
                  </Link>
                );
              })}
              {projectData.panels.length === 0 && (
                <p style={{ color: colors.textMuted, textAlign: 'center', padding: '24px 0', margin: 0 }}>
                  ยังไม่มีตู้ควบคุมในโปรเจกต์นี้
                </p>
              )}
            </div>

            <button type="button" style={styles.toggleBtn} onClick={() => setShowFullTable(!showFullTable)}>
              {showFullTable ? '▲ ซ่อนตารางทั้งหมด' : '▼ ดูตารางอุปกรณ์ทั้งหมด'}
            </button>

            {showFullTable && (
              <div style={card}>
                <AssetTable panels={projectData.panels} title="" emptyMessage="ยังไม่มีอุปกรณ์" />
              </div>
            )}
          </>
        )}

        {/* Tab: รายงาน — DownloadReport ถูกรวมมาที่นี่แล้ว */}
        {activeTab === 'reports' && (
          <>
            {projectData.reports.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: space.md, color: colors.textSub, fontSize: font.size.sm, fontWeight: font.weight.semi }}>
                <span>📄 PDF <strong>{pdfCount}</strong> ไฟล์</span>
                <span style={{ color: colors.border }}>·</span>
                <span>📊 Excel <strong>{xlsxCount}</strong> ไฟล์</span>
              </div>
            )}
            <div style={card}>
              <ReportViewer
                reports={projectData.reports}
                title=""
                description="ดาวน์โหลดไฟล์ PDF และ Excel รายงานการบำรุงรักษา"
                emptyMessage="ยังไม่มีรายงานสำหรับโปรเจกต์นี้"
              />
            </div>
          </>
        )}

        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" capture="environment" onChange={handleFileSelect} />
        {showScanOverlay && (
          <CustomerScan embedded landingMode scanMode="project" onClose={() => setShowScanOverlay(false)} />
        )}
      </CustomerLayout>
    );
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  if (view === 'search') {
    return (
      <CustomerLayout
        title="ค้นหาอุปกรณ์"
        subtitle="ค้นหาด้วยรหัสหรือชื่ออุปกรณ์"
        backTo="/customer"
        actions={commonActions}
        showScanButton={false}
      >
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="พิมพ์ Serial / Meter Code / ชื่ออุปกรณ์..."
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchBtn} disabled={loading}>
            {loading ? '...' : <Search size={20} />}
          </button>
        </form>
        {error && <div style={styles.error}>{error}</div>}
        {searchResults.length === 0 && !loading && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🔍</div>
            <div style={styles.emptyTitle}>ไม่พบผลลัพธ์</div>
            <div style={styles.emptySubtitle}>ลองเปลี่ยนคำค้น หรือใช้การสแกน QR/ภาพ</div>
          </div>
        )}
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {searchResults.map((result) => (
              <Link
                key={`${result.entity_type}-${result.entity_id}`}
                to={resolveCustomerPath(result)}
                style={styles.resultCard}
              >
                <span style={badge.blue}>{entityLabel(result.entity_type)}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: font.size.base, color: colors.text }}>{result.title || '—'}</strong>
                  <p style={{ margin: '2px 0 0', fontSize: font.size.sm, color: colors.textSub }}>{result.subtitle || ''}</p>
                </div>
                <ChevronRight size={18} color={colors.textMuted} />
              </Link>
            ))}
          </div>
        )}
      </CustomerLayout>
    );
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveCustomerPath(result) {
  if (result?.entity_type === 'meter') return `/customer/online-report/meter/${result.entity_id}`;
  if (result?.entity_type === 'loop') return `/customer/online-report/loop/${result.entity_id}`;
  if (result?.panel_id) return `/customer/panel/${result.panel_id}`;
  if (result?.project_id) return `/customer/project/${result.project_id}`;
  return '/customer/scan';
}
function entityLabel(t) {
  return { panel: 'Panel', loop: 'Loop', meter: 'Meter', project: 'Project' }[t] || t || 'Result';
}

function StatCard({ icon, value, label }) {
  return (
    <div style={styles.statCard}>
      {icon}
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function TabBtn({ id, active, label, onClick }) {
  return (
    <button type="button" style={active === id ? tabBtnActive : tabBtn} onClick={() => onClick(id)}>
      {label}
    </button>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  hero: { textAlign: 'center', padding: '28px 16px 32px' },
  iconCircle: { width: 92, height: 92, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  heroSubtitle: { color: colors.textSub, fontSize: font.size.sm, margin: 0 },
  mainScanBtn: { width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '18px 14px', borderRadius: radius.lg, border: `1px solid rgba(37,99,235,0.35)`, background: colors.bgCard, color: '#1e3a8a', fontWeight: font.weight.bold, cursor: 'pointer', boxShadow: '0 10px 25px rgba(37,99,235,0.12)' },
  mainScanLabel: { fontSize: font.size.base },
  error: { marginTop: 18, padding: 12, borderRadius: radius.md, background: '#fee2e2', color: '#b91c1c', fontSize: font.size.sm },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space.sm, marginBottom: space.lg },
  statCard: { background: colors.bgCard, borderRadius: radius.lg, padding: `${space.lg}px ${space.md}px`, border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  statValue: { fontSize: 22, fontWeight: font.weight.bold, color: colors.text },
  statLabel: { fontSize: font.size.xs, color: colors.textSub, fontWeight: font.weight.semi },
  panelCard: { display: 'flex', alignItems: 'center', gap: space.lg, padding: `${space.lg}px`, background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radius.lg, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s' },
  panelIcon: { width: 40, height: 40, background: colors.primaryLight, borderRadius: radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, border: `1px solid ${colors.primaryBorder}` },
  equipPanelCard: { display: 'flex', flexDirection: 'column', gap: space.sm, padding: `${space.lg}px`, background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radius.lg, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s' },
  equipPanelIcon: { width: 30, height: 30, background: colors.primaryLight, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, border: `1px solid ${colors.primaryBorder}` },
  toggleBtn: { padding: `${space.sm + 1}px ${space.lg}px`, background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radius.md, fontSize: font.size.sm, color: colors.textSub, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', marginTop: space.sm },
  searchForm: { display: 'flex', gap: space.sm, marginBottom: space.lg },
  searchInput: { flex: 1, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `12px 14px`, fontSize: font.size.sm },
  searchBtn: { width: 48, height: 48, borderRadius: radius.md, border: 'none', background: colors.primary, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  resultCard: { display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.md}px ${space.lg}px`, background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: radius.lg, textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  emptyState: { textAlign: 'center', padding: 32, borderRadius: radius.lg, border: `1px dashed ${colors.border}`, color: colors.textSub },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, marginBottom: 6 },
  emptySubtitle: { fontSize: font.size.sm },
};

export default CustomerPortal;
