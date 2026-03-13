import { useEffect, useState } from 'react';
import {
  createCustomer, createProject, getCustomers,
  getProjectWorkbookAnalysis, getProjects,
  syncProjectWorkbookAssets, uploadProjectWorkbook,
} from '../../api/projectApi';
import { colors, font, space, radius, shadow } from '../../theme';

const newCustomerDefaults = { customer_name:'', contact_name:'', phone:'', email:'', address:'' };
const projectDefaults     = { existing_customer_id:'', project_name:'', project_location:'', project_description:'', template_file: null };

/* ─── small helpers ─── */
function Fld({ label, required, children }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}{required && <span style={{ color: colors.danger }}> *</span>}</label>
      {children}
    </div>
  );
}
function Input(props) { return <input style={s.input} {...props} />; }
function Select({ children, ...props }) { return <select style={s.input} {...props}>{children}</select>; }
function Textarea(props) { return <textarea style={{ ...s.input, resize:'vertical', minHeight:72 }} {...props} />; }

/* ─── Steps ─── */
function Steps({ current }) {
  const steps = ['ข้อมูลลูกค้า', 'ข้อมูลโปรเจกต์', 'อัปโหลด Template', 'เสร็จสิ้น'];
  return (
    <div style={s.steps}>
      {steps.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={label} style={s.stepItem}>
            <div style={{ ...s.stepDot, ...(done ? s.stepDotDone : active ? s.stepDotActive : {}) }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{ ...s.stepLabel, color: active ? colors.primary : done ? colors.success : colors.textMuted }}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div style={{ ...s.stepLine, background: done ? colors.success : colors.border }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
function Projects() {
  const [customers, setCustomers] = useState([]);
  const [projects,  setProjects]  = useState([]);

  const [step, setStep]                 = useState(0);
  const [customerMode, setCustomerMode] = useState('existing');
  const [newCust, setNewCust]           = useState(newCustomerDefaults);
  const [proj, setProj]                 = useState(projectDefaults);
  const [createdProject, setCreatedProject] = useState(null);

  const [inspectId, setInspectId]       = useState('');
  const [analysis, setAnalysis]         = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [workbookFile, setWorkbookFile] = useState(null);
  const [uploadingWorkbook, setUploadingWorkbook] = useState(false);

  const [submitting, setSubmitting]     = useState(false);
  const [msg, setMsg]                   = useState('');
  const [err, setErr]                   = useState('');
  const inspectedProject = projects.find((project) => String(project.id) === String(inspectId)) || null;

  async function load() {
    try {
      const [cd, pd] = await Promise.all([getCustomers(), getProjects()]);
      setCustomers(cd); setProjects(pd);
      if (!inspectId && pd.length > 0) setInspectId(String(pd[0].id));
    } catch { setErr('โหลดข้อมูลไม่สำเร็จ'); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!inspectId) { setAnalysis(null); return; }
    const project = projects.find((p) => String(p.id) === String(inspectId));
    if (!project?.project_workbook_file_path) { setAnalysis(null); return; }
    async function run() {
      setLoadingAnalysis(true);
      try { setAnalysis(await getProjectWorkbookAnalysis(inspectId)); }
      catch { setAnalysis(null); }
      finally { setLoadingAnalysis(false); }
    }
    run();
  }, [inspectId, projects]);

  async function handleExistingWorkbookUpload(event) {
    event.preventDefault();
    if (!inspectId || !workbookFile) return;

    setUploadingWorkbook(true);
    setErr('');
    try {
      await uploadProjectWorkbook(inspectId, workbookFile);
      const syncResult = await syncProjectWorkbookAssets(inspectId);
      setAnalysis(await getProjectWorkbookAnalysis(inspectId));
      await load();
      setWorkbookFile(null);
      setMsg(`อัปโหลด workbook ให้โปรเจกต์แล้ว Sync สำเร็จ: ${syncResult.loops_created + syncResult.loops_updated} loops, ${syncResult.meters_created + syncResult.meters_updated} meters`);
    } catch (ex) {
      setErr(ex.response?.data?.detail ?? 'อัปโหลด workbook ไม่สำเร็จ');
    } finally {
      setUploadingWorkbook(false);
    }
  }

  function setC(key, val) { setNewCust(c => ({ ...c, [key]: val })); }
  function setP(key, val) { setProj(c => ({ ...c, [key]: val })); }

  async function handleStep0(e) {
    e.preventDefault();
    if (customerMode === 'existing' && !proj.existing_customer_id) { setErr('กรุณาเลือกลูกค้า'); return; }
    setErr(''); setStep(1);
  }

  function handleStep1(e) { e.preventDefault(); setErr(''); setStep(2); }

  async function handleStep2(e) {
    e.preventDefault();
    setSubmitting(true); setErr('');
    try {
      let customerId = Number(proj.existing_customer_id || 0);
      if (customerMode === 'new') {
        const c = await createCustomer({ name: newCust.customer_name, contact_name: newCust.contact_name, phone: newCust.phone, email: newCust.email, address: newCust.address });
        customerId = c.id;
      }
      const created = await createProject({ customer_id: customerId, name: proj.project_name, location: proj.project_location, description: proj.project_description });
      let syncInfo = '';
      if (proj.template_file) {
        await uploadProjectWorkbook(created.id, proj.template_file);
        const r = await syncProjectWorkbookAssets(created.id);
        syncInfo = ` Sync สำเร็จ: ${r.loops_created + r.loops_updated} loops, ${r.meters_created + r.meters_updated} meters`;
      }
      setCreatedProject({ ...created, syncInfo });
      setMsg(`สร้างโปรเจกต์ "${created.name}" แล้ว!${syncInfo}`);
      await load();
      setInspectId(String(created.id));
      setStep(3);
    } catch (ex) {
      setErr(ex.response?.data?.detail ?? 'เกิดข้อผิดพลาด');
    } finally { setSubmitting(false); }
  }

  function resetWizard() {
    setStep(0); setNewCust(newCustomerDefaults); setProj(projectDefaults);
    setCreatedProject(null); setMsg(''); setErr(''); setCustomerMode('existing');
  }

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <span style={s.eyebrow}>System Admin</span>
        <h1 style={s.pageTitle}>จัดการโปรเจกต์</h1>
      </div>

      <div style={s.layout}>
        {/* ══ WIZARD ══ */}
        <div>
          <div style={s.card}>
            <Steps current={step} />

            {err && <div style={s.alertErr}>{err}</div>}

            {/* Step 0 */}
            {step === 0 && (
              <form onSubmit={handleStep0}>
                <div style={s.sectionTitle}>เลือกลูกค้า</div>
                <div style={s.modeToggle}>
                  <button type="button" style={customerMode === 'existing' ? s.modeActive : s.modeInactive} onClick={() => setCustomerMode('existing')}>
                    ลูกค้าเดิม
                  </button>
                  <button type="button" style={customerMode === 'new' ? s.modeActive : s.modeInactive} onClick={() => setCustomerMode('new')}>
                    + ลูกค้าใหม่
                  </button>
                </div>

                {customerMode === 'existing' ? (
                  <Fld label="เลือกลูกค้า" required>
                    <Select value={proj.existing_customer_id} onChange={e => setP('existing_customer_id', e.target.value)} required>
                      <option value="">— เลือกลูกค้า —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Fld>
                ) : (
                  <div style={s.twoCol}>
                    <Fld label="ชื่อบริษัท" required><Input placeholder="บริษัท ABC" value={newCust.customer_name} onChange={e => setC('customer_name', e.target.value)} required /></Fld>
                    <Fld label="ชื่อผู้ติดต่อ"><Input placeholder="คุณสมชาย" value={newCust.contact_name} onChange={e => setC('contact_name', e.target.value)} /></Fld>
                    <Fld label="โทรศัพท์"><Input placeholder="02-xxx-xxxx" value={newCust.phone} onChange={e => setC('phone', e.target.value)} /></Fld>
                    <Fld label="อีเมล"><Input placeholder="contact@company.com" type="email" value={newCust.email} onChange={e => setC('email', e.target.value)} /></Fld>
                  </div>
                )}
                <div style={s.btnRow}>
                  <button type="submit" style={s.btnNext}>ถัดไป →</button>
                </div>
              </form>
            )}

            {/* Step 1 */}
            {step === 1 && (
              <form onSubmit={handleStep1}>
                <div style={s.sectionTitle}>ข้อมูลโปรเจกต์</div>
                <div style={s.twoCol}>
                  <Fld label="ชื่อโปรเจกต์" required><Input placeholder="EMS โรงงาน A" value={proj.project_name} onChange={e => setP('project_name', e.target.value)} required /></Fld>
                  <Fld label="สถานที่"><Input placeholder="นิคมอุตสาหกรรม..." value={proj.project_location} onChange={e => setP('project_location', e.target.value)} /></Fld>
                </div>
                <Fld label="รายละเอียด">
                  <Textarea placeholder="รายละเอียดโปรเจกต์..." value={proj.project_description} onChange={e => setP('project_description', e.target.value)} />
                </Fld>
                <div style={s.btnRow}>
                  <button type="button" style={s.btnBack} onClick={() => setStep(0)}>← กลับ</button>
                  <button type="submit" style={s.btnNext}>ถัดไป →</button>
                </div>
              </form>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <form onSubmit={handleStep2}>
                <div style={s.sectionTitle}>อัปโหลด Project Workbook (ไม่บังคับ)</div>
                <p style={s.hint}>อัปโหลดไฟล์ Excel ของโปรเจกต์ที่มีข้อมูล Loop และ Meter แล้วระบบจะ sync asset ให้อัตโนมัติ</p>
                <Fld label="ไฟล์ Excel workbook">
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.xltx,.xltm,.xls"
                    style={{ ...s.input, padding: '6px 10px', cursor: 'pointer' }}
                    onChange={e => setP('template_file', e.target.files?.[0] || null)}
                  />
                </Fld>
                {proj.template_file && (
                  <div style={s.fileChip}>
                    📄 {proj.template_file.name}
                    <span style={{ color: colors.textMuted, fontSize: font.size.xs }}> · {(proj.template_file.size / 1024).toFixed(0)} KB</span>
                  </div>
                )}
                <div style={s.btnRow}>
                  <button type="button" style={s.btnBack} onClick={() => setStep(1)}>← กลับ</button>
                  <button type="submit" style={s.btnNext} disabled={submitting}>
                    {submitting ? '⏳ กำลังบันทึก...' : proj.template_file ? 'บันทึก + Sync' : 'บันทึกโปรเจกต์'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3 */}
            {step === 3 && createdProject && (
              <div style={s.successPanel}>
                <div style={s.successIcon}>🎉</div>
                <h3 style={s.successTitle}>โปรเจกต์พร้อมใช้งาน!</h3>
                <div style={s.successCard}>
                  <div style={s.successRow}><span>โปรเจกต์</span><strong>{createdProject.name}</strong></div>
                  {createdProject.syncInfo && (
                    <div style={s.successRow}>
                      <span>Sync</span>
                      <strong style={{ color: colors.success }}>{createdProject.syncInfo}</strong>
                    </div>
                  )}
                </div>
                <div style={s.btnRow}>
                  <button style={s.btnNext} onClick={resetWizard}>+ สร้างโปรเจกต์ใหม่</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          {/* Project list */}
          <div style={s.card}>
            <div style={{ marginBottom: space.md }}>
              <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text }}>
                โปรเจกต์ทั้งหมด ({projects.length})
              </h3>
            </div>
            <div style={s.projectList}>
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  style={{ ...s.projectItem, ...(inspectId === String(p.id) ? s.projectItemActive : {}) }}
                  onClick={() => setInspectId(String(p.id))}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.projectName}>{p.name}</div>
                    <div style={s.projectSub}>{p.customer?.name || '—'} · {p.location}</div>
                  </div>
                  <span style={p.template_file_path ? s.badgeGreen : s.badgeGray}>
                    {p.project_workbook_file_path ? 'Workbook ✓' : 'ไม่มี'}
                  </span>
                </button>
              ))}
              {projects.length === 0 && (
                <p style={{ color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', padding: '16px 0', margin: 0 }}>
                  ยังไม่มีโปรเจกต์
                </p>
              )}
            </div>
          </div>

          {/* Analysis */}
          <div style={s.card}>
            <h3 style={{ margin: `0 0 ${space.md}px`, fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text }}>
              🔍 วิเคราะห์ Workbook
            </h3>
            {inspectedProject && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm, marginBottom: space.lg }}>
                <AnalysisRow label="โปรเจกต์" value={inspectedProject.name || '-'} />
                <AnalysisRow label="Workbook ปัจจุบัน" value={inspectedProject.project_workbook_file_path || 'ยังไม่มี workbook'} />
                <form onSubmit={handleExistingWorkbookUpload} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.xltx,.xltm,.xls"
                    style={{ ...s.input, padding: '6px 10px', cursor: 'pointer' }}
                    onChange={(event) => setWorkbookFile(event.target.files?.[0] || null)}
                  />
                  <button
                    type="submit"
                    style={{ ...s.btnNext, width: '100%', opacity: (!inspectId || !workbookFile || uploadingWorkbook) ? 0.65 : 1 }}
                    disabled={!inspectId || !workbookFile || uploadingWorkbook}
                  >
                    {uploadingWorkbook ? 'กำลังอัปโหลด + Sync...' : 'อัปโหลด workbook ให้โปรเจกต์นี้'}
                  </button>
                </form>
              </div>
            )}
            {loadingAnalysis && <p style={s.hint}>กำลังอ่าน Workbook...</p>}
            {!loadingAnalysis && !analysis && (
              <p style={{ color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', padding: '8px 0', margin: 0 }}>
                เลือกโปรเจกต์ที่มี workbook เพื่อดูรายละเอียด
              </p>
            )}
            {!loadingAnalysis && analysis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
                <AnalysisRow label="ชื่อไฟล์" value={analysis.analysis?.template_name || '—'} />
                <AnalysisRow label="Layout"   value={analysis.analysis?.detected_layout || '—'} />
                <AnalysisRow label="Sheets"   value={analysis.analysis?.sheet_count} />
                <AnalysisRow label="Images"   value={analysis.analysis?.summary?.total_images} />
                {(analysis.analysis?.layout_notes || []).slice(0, 5).map(n => (
                  <div key={n} style={{ fontSize: font.size.xs, color: colors.textSub, paddingLeft: space.sm }}>· {n}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div style={s.toast} onClick={() => setMsg('')}>{msg} ✕</div>
      )}
    </div>
  );
}

function AnalysisRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, padding: `${space.xs}px 0`, borderBottom: `1px solid ${colors.bgMuted}`, color: colors.textMid }}>
      <span style={{ color: colors.textSub }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s = {
  page: {
    padding: 'clamp(16px, 3vw, 28px)',
    maxWidth: 1100,
    margin: '0 auto',
    fontFamily: font.family,
    minHeight: '100vh',
    background: colors.bg,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xl,
  },
  pageHeader: { display: 'flex', flexDirection: 'column', gap: 2 },
  eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.semi, color: colors.textSub, textTransform: 'uppercase', letterSpacing: '0.08em' },
  pageTitle: { margin: 0, fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: font.weight.bold, color: colors.text },

  layout: { display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: space.xl, alignItems: 'start' },

  card: {
    background: colors.bgCard,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    boxShadow: shadow.sm,
    padding: space.xxl,
  },

  /* steps */
  steps: { display: 'flex', alignItems: 'center', marginBottom: space.xxl + 4, overflowX: 'auto', paddingBottom: 4 },
  stepItem: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
  stepDot: {
    width: 26, height: 26,
    borderRadius: radius.full,
    background: colors.bgMuted,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: colors.border,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted, flexShrink: 0,
  },
  stepDotActive: { background: colors.primary, borderColor: colors.primary, color: '#fff' },
  stepDotDone:   { background: colors.success, borderColor: colors.success, color: '#fff' },
  stepLabel:     { fontSize: font.size.xs, fontWeight: font.weight.semi, marginLeft: 6, marginRight: 4, whiteSpace: 'nowrap' },
  stepLine:      { flex: 1, height: 2, margin: '0 4px', borderRadius: 1 },

  sectionTitle: { fontSize: font.size.base, fontWeight: font.weight.bold, color: colors.text, marginBottom: space.md },
  hint: { fontSize: font.size.sm, color: colors.textSub, margin: `0 0 ${space.md}px`, lineHeight: 1.5 },

  field: { marginBottom: space.md },
  label: { display: 'block', fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.textMid, marginBottom: space.xs },
  input: {
    width: '100%',
    padding: `${space.sm + 1}px ${space.md}px`,
    border: `1.5px solid ${colors.borderMid}`,
    borderRadius: radius.md,
    fontSize: font.size.base,
    outline: 'none',
    background: colors.bgCard,
    color: colors.text,
    boxSizing: 'border-box',
    fontFamily: font.family,
  },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md },
  modeToggle: { display: 'flex', gap: space.sm, marginBottom: space.lg },
  modeActive:   { flex: 1, padding: `${space.sm}px`, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: font.weight.bold, fontSize: font.size.sm, cursor: 'pointer', fontFamily: font.family },
  modeInactive: { flex: 1, padding: `${space.sm}px`, background: colors.bgMuted, color: colors.textMid, border: `1px solid ${colors.border}`, borderRadius: radius.md, fontWeight: font.weight.medium, fontSize: font.size.sm, cursor: 'pointer', fontFamily: font.family },

  btnRow: { display: 'flex', gap: space.sm, justifyContent: 'flex-end', marginTop: space.xl },
  btnNext: { padding: `${space.md - 1}px ${space.xxl}px`, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, fontSize: font.size.base, fontWeight: font.weight.semi, cursor: 'pointer', fontFamily: font.family },
  btnBack: { padding: `${space.md - 1}px ${space.xl}px`, background: colors.bgMuted, color: colors.textMid, border: `1px solid ${colors.border}`, borderRadius: radius.md, fontSize: font.size.base, fontWeight: font.weight.medium, cursor: 'pointer', fontFamily: font.family },

  fileChip: { background: colors.successLight, border: `1px solid ${colors.successBorder}`, borderRadius: radius.md, padding: `${space.sm}px ${space.md}px`, fontSize: font.size.sm, color: colors.success, marginBottom: space.md },

  alertErr: { background: colors.dangerLight, border: `1px solid ${colors.dangerBorder}`, color: colors.danger, borderRadius: radius.md, padding: `${space.md - 1}px ${space.lg}px`, fontSize: font.size.sm, marginBottom: space.lg },

  successPanel: { textAlign: 'center', padding: `${space.sm}px 0` },
  successIcon:  { fontSize: 44, marginBottom: space.sm },
  successTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, margin: `0 0 ${space.lg}px` },
  successCard:  { background: colors.successLight, border: `1px solid ${colors.successBorder}`, borderRadius: radius.md, padding: `${space.md}px ${space.lg}px`, marginBottom: space.xl, textAlign: 'left' },
  successRow:   { display: 'flex', justifyContent: 'space-between', gap: space.sm, fontSize: font.size.sm, padding: `${space.xs}px 0`, color: colors.textMid },

  projectList: { display: 'flex', flexDirection: 'column', gap: space.xs, maxHeight: 340, overflowY: 'auto' },
  projectItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm,
    padding: `${space.md}px ${space.md}px`,
    borderWidth: '1px', borderStyle: 'solid', borderColor: colors.border, borderRadius: radius.md,
    background: colors.bgCard, cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.1s, border-color 0.1s',
    fontFamily: font.family,
  },
  projectItemActive: { background: colors.primaryLight, borderColor: colors.primaryBorder },
  projectName: { fontWeight: font.weight.semi, fontSize: font.size.sm, color: colors.text },
  projectSub:  { fontSize: font.size.xs, color: colors.textSub, marginTop: 2 },
  badgeGreen:  { fontSize: font.size.xs, fontWeight: font.weight.semi, background: colors.successLight, color: colors.success, padding: `2px ${space.sm}px`, borderRadius: radius.full, whiteSpace: 'nowrap' },
  badgeGray:   { fontSize: font.size.xs, fontWeight: font.weight.semi, background: colors.bgMuted, color: colors.textMuted, padding: `2px ${space.sm}px`, borderRadius: radius.full, whiteSpace: 'nowrap' },

  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: colors.text, color: '#fff',
    padding: `${space.md}px ${space.xl}px`,
    borderRadius: radius.lg, fontSize: font.size.sm, fontWeight: font.weight.semi,
    zIndex: 200, cursor: 'pointer', boxShadow: shadow.xl,
    whiteSpace: 'nowrap',
  },
};

export default Projects;