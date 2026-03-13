import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toAbsoluteFileUrl } from '../../api/api';
import ReportViewer from '../../components/ReportViewer';
import { generateReports, getReportDraft, updateReportDraft, uploadPhotos } from '../../api/reportApi';
import { completeServiceJob, getServiceJob } from '../../api/serviceApi';
import { colors, font, space, radius, shadow, badge, alert, input, btn } from '../../theme';

const defaultPhotoCaptions = [
  'รูปการกวดขันเทอร์มินอล',
  'รูปการทำความสะอาดมิเตอร์',
  'รูปหน้าจอมิเตอร์',
  'รูปตู้โดยรวม',
  'รูปสายสื่อสาร',
  'รูปเพิ่มเติม',
];

const pageStyle = {
  maxWidth: 560,
  margin: '0 auto',
  padding: `${space.lg}px ${space.lg}px 80px`,
  fontFamily: `'Sarabun', 'Segoe UI', system-ui, sans-serif`,
  background: colors.bg,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: space.xl,
};

function emptyDraft() {
  return {
    report_name: '',
    inspection_product: '',
    approve_by: '',
    overview_note: '',
  };
}

function triggerLatestXlsxDownload(reports) {
  const latestXlsx = [...(reports || [])]
    .filter((report) => report.file_path?.toLowerCase().endsWith('.xlsx'))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];

  if (!latestXlsx) {
    return false;
  }

  const link = document.createElement('a');
  link.href = toAbsoluteFileUrl(latestXlsx.file_path);
  link.download = latestXlsx.file_path.split('/').pop() || 'report.xlsx';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function UploadPhoto() {
  const { serviceId } = useParams();
  const [service, setService] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [uploadItems, setUploadItems] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  async function loadService() {
    try {
      const [serviceData, draftData] = await Promise.all([
        getServiceJob(serviceId),
        getReportDraft(serviceId),
      ]);
      setService(serviceData);
      setDraft({
        report_name: draftData.report_name || '',
        inspection_product: draftData.inspection_product || '',
        approve_by: draftData.approve_by || '',
        overview_note: draftData.overview_note || serviceData.note || '',
      });
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    }
  }

  useEffect(() => {
    loadService();
  }, [serviceId]);

  function setDraftField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleFilesSelected(fileList) {
    const startIndex = uploadItems.length;
    const nextItems = Array.from(fileList || []).map((file, index) => ({
      id: `${file.name}-${Date.now()}-${index}`,
      file,
      caption: defaultPhotoCaptions[(startIndex + index) % defaultPhotoCaptions.length],
    }));
    setUploadItems((current) => [...current, ...nextItems]);
  }

  function updateCaption(id, caption) {
    setUploadItems((current) => current.map((item) => item.id === id ? { ...item, caption } : item));
  }

  function removeItem(id) {
    setUploadItems((current) => current.filter((item) => item.id !== id));
  }

  async function persistDraft({ silent } = { silent: false }) {
    setDraftSaving(true);
    try {
      await updateReportDraft(serviceId, {
        report_name: draft.report_name,
        inspection_product: draft.inspection_product,
        inspection_by: service?.engineer_name || '',
        approve_by: draft.approve_by,
        overview_note: draft.overview_note,
      });
      if (!silent) {
        setMessage('บันทึก draft รายงานแล้ว');
        setError('');
      }
      return true;
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.detail ?? 'บันทึก draft ไม่สำเร็จ');
        return false;
      }
      throw err;
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (uploadItems.length === 0) {
      setError('เลือกรูปอย่างน้อย 1 รูปก่อนอัปโหลด');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await uploadPhotos(serviceId, uploadItems);
      const count = uploadItems.length;
      setUploadItems([]);
      setMessage(`อัปโหลดสำเร็จ ${count} รูป`);
      await loadService();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setError('');
    setMessage('');
    try {
      await persistDraft({ silent: true });
      const generatedReports = await generateReports(serviceId);
      const downloaded = triggerLatestXlsxDownload(generatedReports);
      setMessage(downloaded ? 'สร้างไฟล์ save-as และเริ่มดาวน์โหลดแล้ว' : 'สร้างไฟล์ save-as สำเร็จ');
      await loadService();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'สร้างรายงานไม่สำเร็จ');
    }
  }

  async function handleComplete() {
    setCompleting(true);
    setError('');
    setMessage('');
    try {
      await persistDraft({ silent: true });
      const completedJob = await completeServiceJob(serviceId);
      const downloaded = triggerLatestXlsxDownload(completedJob.reports || []);
      setMessage(downloaded ? 'ปิดงาน สร้างไฟล์ save-as และเริ่มดาวน์โหลดแล้ว' : 'ปิดงานและสร้างไฟล์ save-as สำเร็จ');
      await loadService();
    } catch (err) {
      setError(err.response?.data?.detail ?? 'ปิดงานไม่สำเร็จ');
    } finally {
      setCompleting(false);
    }
  }

  const isCompleted = service?.status === 'Completed';
  const reportFilePreview = draft.report_name.trim()
    ? `${draft.report_name.trim()}.xlsx`
    : 'ระบบจะตั้งชื่อไฟล์ตามวันเวลาให้อัตโนมัติ';

  return (
    <div style={pageStyle}>
      <div>
        <p style={{ margin: `0 0 ${space.xs}px`, fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.textSub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Upload + Save As
        </p>
        <h1 style={{ fontSize: font.size.h2, fontWeight: font.weight.bold, color: colors.text, margin: `0 0 ${space.sm}px` }}>
          งาน #{serviceId}
        </h1>
        {service && (
          <span style={isCompleted ? badge.green : badge.orange}>
            {isCompleted ? 'ปิดงานแล้ว' : 'กำลังดำเนินการ'}
          </span>
        )}
      </div>

      {service && (
        <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
          {[
            { label: 'ช่าง', value: service.engineer_name || '-' },
            { label: 'ประเภท', value: service.service_type },
            { label: 'รูป', value: service.photos?.length || 0 },
            { label: 'ไฟล์', value: service.reports?.length || 0 },
          ].map(({ label, value }) => (
            <div key={label} style={s.infoChip}>
              <span style={{ fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.semi, textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: font.size.base, color: colors.text, fontWeight: font.weight.medium }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {(error || message) && (
        <div style={{ ...alert.base, ...(error ? alert.error : alert.success) }}>
          {error || message}
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
          <p style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, margin: 0 }}>ข้อมูล save-as รายงาน</p>
          <Link to={`/engineer/service/new?serviceId=${serviceId}`} style={s.editLink}>
            กลับไปแก้ฟอร์ม
          </Link>
        </div>

        <Field label="ชื่อไฟล์รายงาน">
          <input value={draft.report_name} onChange={(event) => setDraftField('report_name', event.target.value)} style={input.base} placeholder="เว้นว่าง = ใช้ชื่ออัตโนมัติ" />
        </Field>

        <Field label="Inspection Product">
          <input value={draft.inspection_product} onChange={(event) => setDraftField('inspection_product', event.target.value)} style={input.base} placeholder="ชื่อรายงานในไฟล์" />
        </Field>

        <Field label="Approve By">
          <input value={draft.approve_by} onChange={(event) => setDraftField('approve_by', event.target.value)} style={input.base} placeholder="ผู้อนุมัติ / ผู้รับรอง" />
        </Field>

        <Field label="Overview">
          <textarea rows={3} value={draft.overview_note} onChange={(event) => setDraftField('overview_note', event.target.value)} style={{ ...input.base, resize: 'vertical' }} placeholder="ข้อความสรุปที่จะใช้กับ template" />
        </Field>

        <div style={s.previewBox}>
          <span style={s.previewLabel}>ไฟล์ save-as ถัดไป</span>
          <strong style={s.previewValue}>{reportFilePreview}</strong>
        </div>

        <button type="button" style={btn.secondary} onClick={() => persistDraft()} disabled={draftSaving}>
          {draftSaving ? 'กำลังบันทึก...' : 'บันทึก draft รายงาน'}
        </button>
      </div>

      {!isCompleted && (
        <form style={s.card} onSubmit={handleUpload}>
          <p style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, margin: 0 }}>เลือกรูปภาพ</p>

          <div style={s.dropZone} onClick={() => document.getElementById('photo-input').click()}>
            <span style={{ fontSize: 28 }}>ภาพ</span>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semi, color: colors.textMid }}>แตะเพื่อเลือกรูปหรือเปิดกล้อง</span>
            <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>อัปโหลดได้หลายรูปและแก้ caption ก่อนส่ง</span>
          </div>
          <input
            id="photo-input"
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(event) => handleFilesSelected(event.target.files)}
          />

          {uploadItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
              {uploadItems.map((item) => (
                <div key={item.id} style={s.uploadItem}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.text, margin: `0 0 ${space.xs}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</p>
                    <input
                      value={item.caption}
                      onChange={(event) => updateCaption(item.id, event.target.value)}
                      style={{ ...input.base, fontSize: font.size.sm }}
                      placeholder="caption ของรูป"
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} style={s.removeIcon}>
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadItems.length > 0 && (
            <button type="submit" style={{ ...btn.primary, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? 'กำลังอัปโหลด...' : `อัปโหลด ${uploadItems.length} รูป`}
            </button>
          )}
        </form>
      )}

      {service?.photos?.length > 0 && (
        <div style={s.card}>
          <p style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, margin: `0 0 ${space.md}px` }}>
            รูปที่อัปโหลดแล้ว ({service.photos.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {service.photos.map((photo) => (
              <div key={photo.id} style={s.photoChip}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.text, margin: 0 }}>{photo.caption || 'ไม่มี caption'}</p>
                  <p style={{ fontSize: font.size.xs, color: colors.textMuted, margin: 0 }}>{photo.file_path.split('/').pop()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.card}>
        <p style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, margin: `0 0 ${space.md}px` }}>บันทึกรายงาน</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
          <button type="button" style={btn.secondary} onClick={handleGenerate}>
            {isCompleted ? 'สร้าง Save As อีกไฟล์' : 'บันทึกแบบ Save As'}
          </button>
          {!isCompleted && (
            <button type="button" style={{ ...btn.success, opacity: completing ? 0.7 : 1 }} onClick={handleComplete} disabled={completing}>
              {completing ? 'กำลังปิดงาน...' : 'ปิดงาน + Save As'}
            </button>
          )}
        </div>
      </div>

      <ReportViewer
        reports={service?.reports || []}
        title="ไฟล์รายงาน"
        description="ทุกครั้งที่กด Save As จะได้ไฟล์ใหม่ ไม่ทับของเดิม"
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space.xs, fontSize: font.size.sm, fontWeight: font.weight.semi, color: colors.textMid }}>
      {label}
      {children}
    </label>
  );
}

const s = {
  card: {
    background: colors.bgCard,
    borderRadius: radius.xl - 2,
    padding: space.xl,
    boxShadow: shadow.sm,
    border: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  dropZone: {
    border: `2px dashed ${colors.borderMid}`,
    borderRadius: radius.lg,
    padding: `${space.xxl + 4}px ${space.xl}px`,
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.xs,
    background: colors.bg,
  },
  uploadItem: {
    background: colors.bg,
    borderRadius: radius.md,
    padding: `${space.md - 2}px ${space.md}px`,
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.md,
    justifyContent: 'space-between',
  },
  infoChip: {
    background: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: `${space.sm}px ${space.md}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 80,
  },
  photoChip: {
    display: 'flex',
    gap: space.md,
    alignItems: 'center',
    background: colors.bg,
    borderRadius: radius.md,
    padding: `${space.md - 2}px ${space.md}px`,
  },
  editLink: {
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.semi,
    textDecoration: 'none',
  },
  removeIcon: {
    border: 'none',
    background: 'none',
    color: colors.danger || '#dc2626',
    cursor: 'pointer',
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
  },
  previewBox: {
    background: colors.bg,
    borderRadius: radius.md,
    padding: `${space.sm}px ${space.md}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  previewLabel: { fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.semi, textTransform: 'uppercase' },
  previewValue: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.bold, wordBreak: 'break-word' },
};

export default UploadPhoto;
