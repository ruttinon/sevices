import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMeterDetail, getMeters } from '../../api/assetApi';
import { getProjects } from '../../api/projectApi';
import { getReportDraft, updateReportDraft } from '../../api/reportApi';
import { createServiceJob, getServiceJob, getServiceJobs, updateServiceJob } from '../../api/serviceApi';

const DEFAULT_CHECKLIST = [
  'ตรวจสภาพตู้และกล่องมิเตอร์',
  'ยืนยัน nameplate และ serial number',
  'ตรวจสอบสายสื่อสารและ converter',
  'ยืนยัน device address และ baud rate',
  'ตรวจสอบ meter display และสถานะ',
  'ตรวจสอบ model และ CT ratio',
  'ถ่ายภาพหลักฐาน',
  'บันทึกสรุปผลการบำรุงรักษา',
];

const MAX_CHECKLIST_ITEMS = 20;
const STEPS = ['ข้อมูลงาน', 'Checklist', 'สรุป'];

function buildChecklistItems(source = []) {
  if (source.length > 0) {
    return source.slice(0, MAX_CHECKLIST_ITEMS).map((item, index) => ({
      label: String(item?.label || `รายการ ${index + 1}`).trim() || `รายการ ${index + 1}`,
      status: item?.status === 'fail' ? 'fail' : 'pass',
      note: item?.note || '',
    }));
  }
  return DEFAULT_CHECKLIST.map((label) => ({ label, status: 'pass', note: '' }));
}

function buildServicePayload(form) {
  return {
    project_id: Number(form.project_id),
    meter_id: form.meter_id ? Number(form.meter_id) : null,
    engineer_id: form.engineer_id ? Number(form.engineer_id) : null,
    engineer_name: form.engineer_name.trim(),
    service_type: form.service_type,
    service_date: new Date(form.service_date).toISOString(),
    status: form.status || 'Pending',
    note: form.note.trim(),
    checklist_items: form.checklist_items.map((item) => ({
      label: item.label.trim(),
      status: item.status === 'fail' ? 'fail' : 'pass',
      note: item.note.trim() || null,
    })),
  };
}

function buildDraftPayload(draft, engineerName, note) {
  return {
    report_name: draft.report_name.trim(),
    inspection_product: draft.inspection_product.trim(),
    inspection_by: engineerName.trim(),
    approve_by: draft.approve_by.trim(),
    overview_note: (draft.overview_note || note || '').trim(),
  };
}

function emptyForm(projectId = '', meterId = '') {
  return {
    project_id: projectId,
    meter_id: meterId,
    engineer_id: '',
    engineer_name: '',
    service_type: 'PM',
    service_date: new Date().toISOString().slice(0, 16),
    status: 'Pending',
    note: '',
    checklist_items: buildChecklistItems(),
  };
}

function emptyDraft() {
  return {
    report_name: '',
    inspection_product: '',
    approve_by: '',
    overview_note: '',
  };
}

function PMReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const initialMeterId = searchParams.get('meterId') || '';
  const existingServiceId = searchParams.get('serviceId') || '';

  const [projects, setProjects] = useState([]);
  const [meters, setMeters] = useState([]);
  const [selectedMeter, setSelectedMeter] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [serviceId, setServiceId] = useState(existingServiceId);
  const [form, setForm] = useState(() => emptyForm(initialProjectId, initialMeterId));
  const [draft, setDraft] = useState(() => emptyDraft());
  const [latestJob, setLatestJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadBaseData() {
      try {
        const [projectData, meterData] = await Promise.all([getProjects(), getMeters()]);
        setProjects(projectData);
        setMeters(meterData);
      } catch {
        setError('โหลดข้อมูลไม่สำเร็จ');
      }
    }
    loadBaseData();
  }, []);

  useEffect(() => {
    async function loadExistingService() {
      if (!existingServiceId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [service, reportDraft] = await Promise.all([
          getServiceJob(existingServiceId),
          getReportDraft(existingServiceId),
        ]);
        setServiceId(String(service.id));
        setForm({
          project_id: service.project_id ? String(service.project_id) : '',
          meter_id: service.meter_id ? String(service.meter_id) : '',
          engineer_id: service.engineer_id ? String(service.engineer_id) : '',
          engineer_name: service.engineer_name || '',
          service_type: service.service_type || 'PM',
          service_date: service.service_date ? new Date(service.service_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
          status: service.status || 'Pending',
          note: service.note || '',
          checklist_items: buildChecklistItems(service.checklist_items || []),
        });
        setDraft({
          report_name: reportDraft.report_name || '',
          inspection_product: reportDraft.inspection_product || '',
          approve_by: reportDraft.approve_by || '',
          overview_note: reportDraft.overview_note || service.note || '',
        });
        setMessage(`กำลังแก้ไขงาน #${service.id}`);
      } catch (err) {
        setError(err.response?.data?.detail ?? 'โหลดงานเดิมไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    }
    loadExistingService();
  }, [existingServiceId]);

  useEffect(() => {
    async function loadMeter() {
      if (!form.meter_id) {
        setSelectedMeter(null);
        return;
      }
      try {
        setSelectedMeter(await getMeterDetail(form.meter_id));
      } catch {
        setSelectedMeter(null);
      }
    }
    loadMeter();
  }, [form.meter_id]);

  useEffect(() => {
    async function loadLatestJob() {
      if (existingServiceId || !form.project_id) {
        setLatestJob(null);
        return;
      }
      try {
        const filters = form.meter_id
          ? { project_id: Number(form.project_id), meter_id: Number(form.meter_id) }
          : { project_id: Number(form.project_id) };
        const jobs = await getServiceJobs(filters);
        setLatestJob(jobs[0] || null);
      } catch {
        setLatestJob(null);
      }
    }
    loadLatestJob();
  }, [existingServiceId, form.project_id, form.meter_id]);

  useEffect(() => {
    if (draft.inspection_product) return;
    if (!form.service_type) return;
    const projectName = projects.find((item) => String(item.id) === form.project_id)?.name || 'project';
    const meterName = selectedMeter?.meter?.meter_name || selectedMeter?.meter?.meter_code || projectName;
    setDraft((current) => ({
      ...current,
      inspection_product: `${String(form.service_type).toUpperCase()} service report for ${meterName}`,
    }));
  }, [draft.inspection_product, form.project_id, form.service_type, projects, selectedMeter]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setDraftField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateChecklist(index, field, value) {
    setForm((current) => ({
      ...current,
      checklist_items: current.checklist_items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function addChecklistItem() {
    setForm((current) => {
      if (current.checklist_items.length >= MAX_CHECKLIST_ITEMS) {
        return current;
      }
      return {
        ...current,
        checklist_items: [
          ...current.checklist_items,
          { label: `รายการ ${current.checklist_items.length + 1}`, status: 'pass', note: '' },
        ],
      };
    });
  }

  function removeChecklistItem(index) {
    setForm((current) => {
      if (current.checklist_items.length <= 1) {
        return current;
      }
      return {
        ...current,
        checklist_items: current.checklist_items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  async function applyLatestJob(job) {
    try {
      const reportDraft = await getReportDraft(job.id);
      setForm({
        project_id: job.project_id ? String(job.project_id) : '',
        meter_id: job.meter_id ? String(job.meter_id) : '',
        engineer_id: '',
        engineer_name: job.engineer_name || '',
        service_type: job.service_type || 'PM',
        service_date: new Date().toISOString().slice(0, 16),
        status: 'Pending',
        note: job.note || '',
        checklist_items: buildChecklistItems(job.checklist_items || []),
      });
      setDraft({
        report_name: '',
        inspection_product: reportDraft.inspection_product || '',
        approve_by: reportDraft.approve_by || '',
        overview_note: reportDraft.overview_note || job.note || '',
      });
      setServiceId('');
      setMessage(`โหลดข้อมูลล่าสุดจากงาน #${job.id} แล้ว`);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail ?? 'โหลดข้อมูลล่าสุดไม่สำเร็จ');
    }
  }

  function resetForm() {
    setForm(emptyForm(initialProjectId, initialMeterId));
    setDraft(emptyDraft());
    setServiceId('');
    setMessage('ล้างฟอร์มแล้ว');
    setError('');
  }

  async function saveDraft({ openPhotos } = { openPhotos: false }) {
    if (!form.project_id || !form.engineer_name.trim() || !form.service_date) {
      setError('กรอกข้อมูลหลักให้ครบก่อนบันทึก');
      setActiveStep(0);
      return;
    }

    const hasBlankChecklist = form.checklist_items.some((item) => !item.label.trim());
    if (hasBlankChecklist) {
      setError('Checklist ต้องมีหัวข้อทุกบรรทัด');
      setActiveStep(1);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = buildServicePayload(form);
      const savedService = serviceId
        ? await updateServiceJob(serviceId, payload)
        : await createServiceJob(payload);
      const nextServiceId = String(savedService.id);
      await updateReportDraft(
        nextServiceId,
        buildDraftPayload(draft, form.engineer_name, form.note),
      );
      setServiceId(nextServiceId);
      setMessage(serviceId ? 'อัปเดตแบบร่างแล้ว' : 'สร้างแบบร่างแล้ว');
      if (openPhotos) {
        navigate(`/engineer/service/${nextServiceId}/photos`);
      }
    } catch (err) {
      setError(err.response?.data?.detail ?? 'บันทึกแบบร่างไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const passCount = form.checklist_items.filter((item) => item.status === 'pass').length;
  const failCount = form.checklist_items.length - passCount;
  const reportFilePreview = draft.report_name.trim()
    ? `${draft.report_name.trim()}.xlsx`
    : 'ระบบจะตั้งชื่อไฟล์ให้อัตโนมัติ';

  return (
    <div style={s.page}>
      <div style={s.header}>
        <p style={s.eyebrow}>Template Report</p>
        <h1 style={s.title}>กรอกฟอร์มรายงานหน้างาน</h1>
        <p style={s.subtitle}>บันทึกแบบร่างก่อน แล้วค่อยอัปโหลดรูปและกด save-as รายงานภายหลังได้</p>
        {selectedMeter && (
          <div style={s.meterBadge}>
            <span style={s.meterBadgeText}>มิเตอร์ {selectedMeter.meter.meter_code} - {selectedMeter.meter.meter_name}</span>
          </div>
        )}
      </div>

      {(error || message) && (
        <div style={{ ...s.alert, ...(error ? s.alertError : s.alertSuccess) }}>
          {error || message}
        </div>
      )}

      {loading ? (
        <div style={s.card}>
          <p style={s.loadingText}>กำลังโหลดข้อมูล...</p>
        </div>
      ) : (
        <>
          {serviceId && (
            <div style={s.infoBanner}>
              <strong>กำลังแก้ไขงาน #{serviceId}</strong>
              <button type="button" style={s.smallGhostBtn} onClick={() => navigate('/engineer/service/new')}>
                เริ่มงานใหม่
              </button>
            </div>
          )}

          {!serviceId && latestJob && (
            <div style={s.infoBanner}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong>พบข้อมูลล่าสุดของงาน #{latestJob.id}</strong>
                <span style={s.infoBannerText}>กดโหลดเพื่อนำค่าเดิมมาแก้ต่อแล้วสร้างไฟล์ save-as ใหม่</span>
              </div>
              <button type="button" style={s.smallGhostBtn} onClick={() => applyLatestJob(latestJob)}>
                โหลดข้อมูลล่าสุด
              </button>
            </div>
          )}

          <div style={s.stepBar}>
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => index <= activeStep && setActiveStep(index)}
                style={s.stepItem}
              >
                <div style={{ ...s.stepDot, ...(index === activeStep ? s.stepDotActive : index < activeStep ? s.stepDotDone : {}) }}>
                  {index < activeStep ? '✓' : index + 1}
                </div>
                <span style={s.stepLabel}>{label}</span>
              </button>
            ))}
            <div style={s.stepLine} />
          </div>

          {activeStep === 0 && (
            <div style={s.card}>
              <Field label="โปรเจกต์ *">
                <select value={form.project_id} onChange={(event) => setField('project_id', event.target.value)} style={s.select}>
                  <option value="">เลือกโปรเจกต์...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="มิเตอร์">
                <select value={form.meter_id} onChange={(event) => setField('meter_id', event.target.value)} style={s.select}>
                  <option value="">เลือกมิเตอร์...</option>
                  {meters.map((meter) => (
                    <option key={meter.id} value={meter.id}>{meter.meter_code} - {meter.meter_name}</option>
                  ))}
                </select>
              </Field>

              <div style={s.row2}>
                <Field label="ชื่อช่าง *">
                  <input value={form.engineer_name} onChange={(event) => setField('engineer_name', event.target.value)} style={s.input} placeholder="ชื่อ-นามสกุล" />
                </Field>
                <Field label="ประเภทงาน">
                  <select value={form.service_type} onChange={(event) => setField('service_type', event.target.value)} style={s.select}>
                    {['PM', 'MA', 'IM', 'EM'].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="วันเวลาตรวจ *">
                <input type="datetime-local" value={form.service_date} onChange={(event) => setField('service_date', event.target.value)} style={s.input} />
              </Field>

              <Field label="Inspection Product">
                <input value={draft.inspection_product} onChange={(event) => setDraftField('inspection_product', event.target.value)} style={s.input} placeholder="เช่น PM service report for Meter 901" />
              </Field>

              <div style={s.row2}>
                <Field label="Approve By">
                  <input value={draft.approve_by} onChange={(event) => setDraftField('approve_by', event.target.value)} style={s.input} placeholder="ผู้อนุมัติ / ผู้รับรอง" />
                </Field>
                <Field label="ชื่อไฟล์รายงาน">
                  <input value={draft.report_name} onChange={(event) => setDraftField('report_name', event.target.value)} style={s.input} placeholder="เว้นว่าง = ใช้ชื่ออัตโนมัติ" />
                </Field>
              </div>

              <div style={s.previewBox}>
                <span style={s.previewLabel}>ไฟล์ save-as</span>
                <strong style={s.previewValue}>{reportFilePreview}</strong>
              </div>

              <button
                type="button"
                style={{ ...s.primaryBtn, ...((!form.project_id || !form.engineer_name.trim() || !form.service_date) ? s.btnDisabled : {}) }}
                onClick={() => setActiveStep(1)}
                disabled={!form.project_id || !form.engineer_name.trim() || !form.service_date}
              >
                ถัดไป → Checklist
              </button>
            </div>
          )}

          {activeStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={s.checklistStats}>
                <span style={s.passCount}>ผ่าน {passCount}</span>
                <span style={s.failCount}>ไม่ผ่าน {failCount}</span>
                <span style={s.countChip}>{form.checklist_items.length}/{MAX_CHECKLIST_ITEMS} รายการ</span>
              </div>

              {form.checklist_items.map((item, index) => (
                <div key={`${index}-${item.label}`} style={{ ...s.checkCard, ...(item.status === 'fail' ? s.checkCardFail : {}) }}>
                  <div style={s.checkHeader}>
                    <span style={s.checkNum}>{index + 1}</span>
                    <button type="button" style={s.removeBtn} onClick={() => removeChecklistItem(index)} disabled={form.checklist_items.length <= 1}>
                      ลบ
                    </button>
                  </div>
                  <input
                    value={item.label}
                    onChange={(event) => updateChecklist(index, 'label', event.target.value)}
                    placeholder="หัวข้อการตรวจเช็ค"
                    style={s.input}
                  />
                  <div style={s.toggleGroup}>
                    <button type="button" onClick={() => updateChecklist(index, 'status', 'pass')} style={{ ...s.toggleBtn, ...(item.status === 'pass' ? s.togglePass : {}) }}>
                      Pass
                    </button>
                    <button type="button" onClick={() => updateChecklist(index, 'status', 'fail')} style={{ ...s.toggleBtn, ...(item.status === 'fail' ? s.toggleFail : {}) }}>
                      Fail
                    </button>
                  </div>
                  <input
                    value={item.note}
                    onChange={(event) => updateChecklist(index, 'note', event.target.value)}
                    placeholder="หมายเหตุ"
                    style={s.input}
                  />
                </div>
              ))}

              <div style={s.btnPair}>
                <button type="button" style={s.ghostBtn} onClick={() => setActiveStep(0)}>← กลับ</button>
                <button type="button" style={s.ghostBtn} onClick={addChecklistItem} disabled={form.checklist_items.length >= MAX_CHECKLIST_ITEMS}>
                  + เพิ่มหัวข้อ
                </button>
                <button type="button" style={s.primaryBtn} onClick={() => setActiveStep(2)}>ถัดไป → สรุป</button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div style={s.card}>
              <div style={s.summaryHeader}>
                <div style={s.summaryScore}>
                  <span style={s.scoreBig}>{passCount}/{form.checklist_items.length}</span>
                  <span style={s.scoreLabel}>รายการผ่าน</span>
                </div>
                <div style={s.infoList}>
                  <p style={s.infoLine}><strong>ช่าง:</strong> {form.engineer_name || '-'}</p>
                  <p style={s.infoLine}><strong>วันเวลา:</strong> {form.service_date ? new Date(form.service_date).toLocaleString('th-TH') : '-'}</p>
                  <p style={s.infoLine}><strong>Inspection Product:</strong> {draft.inspection_product || '-'}</p>
                  <p style={s.infoLine}><strong>Approve By:</strong> {draft.approve_by || '-'}</p>
                </div>
              </div>

              <Field label="สรุปผลหน้างาน">
                <textarea
                  rows={4}
                  value={form.note}
                  onChange={(event) => setField('note', event.target.value)}
                  placeholder="สรุปสิ่งที่ทำ ปัญหาที่พบ และผลการตรวจ"
                  style={s.textarea}
                />
              </Field>

              <Field label="ข้อความหน้าบทนำ / Overview">
                <textarea
                  rows={4}
                  value={draft.overview_note}
                  onChange={(event) => setDraftField('overview_note', event.target.value)}
                  placeholder="ข้อความที่จะนำไปใช้ในบทนำของรายงาน"
                  style={s.textarea}
                />
              </Field>

              <div style={s.previewBox}>
                <span style={s.previewLabel}>ไฟล์ save-as รอบถัดไป</span>
                <strong style={s.previewValue}>{reportFilePreview}</strong>
              </div>

              <div style={s.btnPairWrap}>
                <button type="button" style={s.ghostBtn} onClick={() => setActiveStep(1)}>← กลับ</button>
                <button type="button" style={s.ghostBtn} onClick={resetForm}>ล้างฟอร์ม</button>
                <button type="button" style={s.secondaryBtn} onClick={() => saveDraft({ openPhotos: false })} disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}
                </button>
                <button type="button" style={s.primaryBtn} onClick={() => saveDraft({ openPhotos: true })} disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกและไปต่อรูป'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
      {children}
    </div>
  );
}

const s = {
  page: { maxWidth: 540, margin: '0 auto', padding: '16px 16px 80px', fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", background: '#f8fafc', minHeight: '100vh' },
  header: { paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 },
  title: { fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 },
  subtitle: { fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.5 },
  meterBadge: { background: '#eff6ff', borderRadius: 10, padding: '8px 12px', display: 'inline-flex', width: 'fit-content' },
  meterBadgeText: { fontSize: 13, color: '#2563eb', fontWeight: 700 },
  alert: { borderRadius: 10, padding: '12px 16px', fontSize: 14, marginBottom: 12 },
  alertError: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
  alertSuccess: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  loadingText: { margin: 0, fontSize: 14, color: '#475569' },
  infoBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 16,
  },
  infoBannerText: { fontSize: 13, color: '#7c2d12' },
  smallGhostBtn: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  stepBar: { display: 'flex', alignItems: 'center', position: 'relative', marginBottom: 20, padding: '0 4px' },
  stepLine: { position: 'absolute', top: 18, left: '16%', right: '16%', height: 2, background: '#e2e8f0', zIndex: 0 },
  stepItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', position: 'relative', zIndex: 1 },
  stepDot: { width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#94a3b8' },
  stepDotActive: { background: '#2563eb', color: '#fff' },
  stepDotDone: { background: '#16a34a', color: '#fff' },
  stepLabel: { fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' },
  card: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 16 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  input: { border: '2px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'inherit', color: '#0f172a', outline: 'none', background: '#f8fafc', width: '100%', boxSizing: 'border-box' },
  select: { border: '2px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'inherit', color: '#0f172a', outline: 'none', background: '#f8fafc', width: '100%', boxSizing: 'border-box' },
  textarea: { border: '2px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#0f172a', width: '100%', boxSizing: 'border-box' },
  primaryBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '15px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' },
  secondaryBtn: { background: '#0f766e', color: '#fff', border: 'none', borderRadius: 12, padding: '15px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' },
  ghostBtn: { background: 'transparent', color: '#374151', border: '2px solid #e2e8f0', borderRadius: 12, padding: '15px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnDisabled: { background: '#cbd5e1', cursor: 'not-allowed' },
  btnPair: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  btnPairWrap: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  previewBox: { background: '#eff6ff', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  previewLabel: { fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' },
  previewValue: { fontSize: 14, color: '#1d4ed8', wordBreak: 'break-word' },
  checklistStats: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  passCount: { background: '#f0fdf4', color: '#16a34a', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 },
  failCount: { background: '#fef2f2', color: '#dc2626', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 },
  countChip: { background: '#eef2ff', color: '#4338ca', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 },
  checkCard: { background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '2px solid transparent', display: 'flex', flexDirection: 'column', gap: 10 },
  checkCardFail: { borderColor: '#fecaca', background: '#fff8f8' },
  checkHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  checkNum: { width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#64748b' },
  removeBtn: { border: 'none', background: 'none', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  toggleGroup: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '9px 12px', borderRadius: 8, border: '2px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#94a3b8' },
  togglePass: { background: '#f0fdf4', borderColor: '#86efac', color: '#16a34a' },
  toggleFail: { background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' },
  summaryHeader: { background: '#f8fafc', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  summaryScore: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  scoreBig: { fontSize: 40, fontWeight: 800, color: '#0f172a' },
  scoreLabel: { fontSize: 13, color: '#64748b' },
  infoList: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLine: { fontSize: 13, color: '#374151', margin: 0 },
};

export default PMReport;
