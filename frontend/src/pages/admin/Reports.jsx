import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReportViewer from '../../components/ReportViewer';
import { useProject } from '../../context/ProjectContext';
import { getMeters, getLoops, uploadProjectPhoto, updateMeter } from '../../api/assetApi';
import { getProjectTemplateAnalysis, getProjects, getWorkbookAssets, getProjectPhotoCaptions, getProjectChecklistTemplate, updateProjectChecklistTemplate, prepareReportTemplate, saveMeterDrafts, loadMeterDrafts } from '../../api/projectApi';
import { getReports, generateReportByLoop, getChecklistTemplates, getReportByDate } from '../../api/reportApi';
import { completeServiceJob, createServiceJob, getServiceJobs } from '../../api/serviceApi';
import { detectBarcodeValuesFromFile } from '../../utils/barcodeImageScan';
import { toAbsoluteFileUrl } from '../../api/api';
import { colors, font, space, radius, shadow, card, text, badge, alert, input, btn, table, tabBtn, tabBtnActive, pageStyle } from '../../theme';

/* ────────────────────────────────────
   EXCEL TEMPLATE FIELD MAPPING
   Based on analysis of Templat-Report.xlsx:
   Cover: Project, Inspection Date, Inspection Product, Consumer, Inspection By, Approve By
   Page(B): PM report — Project, Consumer, Inspection Date, content checklist
   Page(1): MA report — Project, Consumer, Inspection Date, checklist sections

   Per-loop meter table columns (from Maintenance Agreement):
   No | Name Meter | Serial Number | Panel | Floor | Address | Baud Rate | CT Ratio
   | Single Phase | 3 Phase 4 Wire | CVM-B100 | CVM-C10 | CEM-C5 | CEM-C6
   | Online | Offline | Pass | Not Accurate | Energy (kWh) | Comment
──────────────────────────────────── */

const SERVICE_TYPES = ['PM','MA','IM','EM'];

const PM_CHECKLIST = [
  { id:'pm1',  section:'1. ตรวจสอบทั่วไป', items:[
    'ตรวจสอบสายไฟและการต่อสาย',
    'ตรวจสอบ LED indicator',
    'ตรวจสอบ display',
    'ตรวจสอบ housing / กล่อง',
  ]},
  { id:'pm2', section:'2. Communication', items:[
    'ทดสอบ Modbus communication',
    'ตรวจสอบ Baud Rate',
    'ตรวจสอบ Device Address',
    'ทดสอบ data logging',
  ]},
  { id:'pm3', section:'3. ค่ามิเตอร์', items:[
    'ตรวจสอบค่า Voltage',
    'ตรวจสอบค่า Current',
    'ตรวจสอบค่า Power Factor',
    'ตรวจสอบค่า Energy (kWh)',
    'เปรียบเทียบค่ากับ reference',
  ]},
  { id:'pm4', section:'4. CT / PT', items:[
    'ตรวจสอบ CT Ratio',
    'ตรวจสอบการติดตั้ง CT',
    'ตรวจสอบ polarity',
  ]},
];

const MA_CHECKLIST = [
  { id:'ma1', section:'1. ซ่อมบำรุง', items:[
    'ทำความสะอาดอุปกรณ์',
    'ขันน็อตให้แน่น',
    'เปลี่ยนชิ้นส่วนที่สึกหรอ',
    'ปรับค่า parameter',
  ]},
  { id:'ma2', section:'2. ทดสอบหลังซ่อม', items:[
    'ทดสอบการทำงานหลังซ่อม',
    'ตรวจสอบค่าการวัดหลังซ่อม',
    'ตรวจสอบ communication',
  ]},
  { id:'ma3', section:'3. บันทึกผล', items:[
    'บันทึกค่าก่อนซ่อม',
    'บันทึกค่าหลังซ่อม',
    'บันทึกรายการที่เปลี่ยน',
    'สรุปสาเหตุและการแก้ไข',
  ]},
];

const STATUS_OPTIONS = ['Pass','Fail','N/A'];
const METER_MODELS   = ['CVM-B100','CVM-C10','CEM-C5','CEM-C6'];

/* ─── helper components ─── */
function Fld({ label, children, col2 }) {
  return (
    <div style={{ ...(col2 && { gridColumn:'1/-1' }) }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}
function TabBtn({ id, active, label, onClick }) {
  return (
    <button type="button"
      style={{ ...s.tab, ...(active===id ? s.tabActive : {}) }}
      onClick={() => onClick(id)}>
      {label}
    </button>
  );
}

/* ────────────────────────────────────
   DYNAMIC CHECKLIST EDITOR
   Shows flat list of 10 items (matching Excel template)
──────────────────────────────────── */
function ChecklistEditor({ template, value, onChange }) {
  // template = { job_type, name, topics: [{id, section, label, order}] }
  // value = { [topicId]: { status: 'Pass'|'Fail'|'N/A', note: '', isFail: false } }

  // Get flat list of topics (max 10 items)
  const topics = useMemo(() => {
    if (!template || !template.topics) return [];
    return template.topics.slice(0, 10); // Limit to 10 items max
  }, [template]);

  function setItem(topicId, field, val) {
    const current = value[topicId] || {};
    const updated = { ...value, [topicId]: { ...current, [field]: val } };

    // Auto-set isFail flag when status changes to Fail
    if (field === 'status') {
      updated[topicId].isFail = val === 'Fail';
      // Clear note if changing from Fail to something else
      if (val !== 'Fail' && current.status === 'Fail') {
        updated[topicId].note = '';
      }
    }

    onChange(updated);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={s.checkSectionTitle}>หัวข้อการตรวจสอบ (10 ข้อ)</div>
      <div style={s.checkGrid}>
        {topics.map((topic, idx) => {
          const val = value[topic.id] || {};
          const isFail = val.status === 'Fail';
          const showRemarkRequired = isFail && !val.note;
          const labelText = typeof topic.label === 'string' ? topic.label : String(topic.label || '');

          return (
            <div key={topic.id} style={{...s.checkRow, ...(showRemarkRequired && s.checkRowRequired)}}>
              <div style={{ ...s.checkItem, display: 'flex', gap: 8 }}>
                <span style={{ color: '#94a3b8', fontWeight: 600, minWidth: 20 }}>{idx + 1}.</span>
                <span>{labelText}</span>
              </div>
              <div style={s.checkControls}>
                {/* Pass/Fail/N/A buttons */}
                {['Pass', 'Fail', 'N/A'].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    style={{ ...s.statusBtn, ...(val.status===opt ? s.statusBtnActive[opt] : {}) }}
                    onClick={() => setItem(topic.id, 'status', opt)}
                  >
                    {opt === 'Pass' ? 'ผ่าน' : opt === 'Fail' ? 'ไม่ผ่าน' : 'N/A'}
                  </button>
                ))}

                {/* Remark input - mandatory when Fail */}
                <input
                  style={{
                    ...s.checkNote,
                    ...(isFail && !val.note ? s.checkNoteRequired : {}),
                    ...(isFail ? s.checkNoteMandatory : {})
                  }}
                  placeholder={isFail ? "*บังคับกรอก*" : "หมายเหตุ..."}
                  value={val.note || ''}
                  onChange={e => setItem(topic.id, 'note', e.target.value)}
                  disabled={val.status === 'N/A'}
                />
              </div>

              {/* Warning message for missing remark */}
              {showRemarkRequired && (
                <div style={s.remarkWarning}>⚠️ กรุณาระบุหมายเหตุ</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────
   PHOTO UPLOAD SLOT WITH EDITABLE TITLE & TEMPLATE CAPTION
──────────────────────────────────── */
function PhotoUploadSlot({ photo, onChange, onTitleChange, projectId, index, caption }) {
  const [uploading, setUploading] = useState(false);
  const fileInputId = `photo-${projectId}-${index}`;
  const cameraInputId = `camera-${projectId}-${index}`;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadProjectPhoto(projectId, file);
      onChange(res.file_path);
    } catch (err) {
      alert('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  // Flexible photo input - works on mobile (camera) and desktop (file picker)
  function handlePickPhoto() {
    // Create a fresh input each time to avoid stale file issues
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    // On mobile this gives camera option; on desktop it opens file picker
    inp.onchange = handleFile;
    inp.click();
  }

  function handleCameraOnly() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.capture = 'environment'; // Force rear camera on mobile
    inp.onchange = handleFile;
    inp.click();
  }

  return (
    <div style={s.photoSlot}>
      {/* Caption label above photo box */}
      <div style={{ fontSize: 12, color: '#374151', fontWeight: 500, marginBottom: 4, textAlign: 'center' }}>
        {caption || `รูปที่ ${index + 1}`}
      </div>
      
      <div
        style={s.photoUploadBox}
        onClick={() => !photo?.file_path && handlePickPhoto()}
      >
        {uploading ? (
          <span style={{ fontSize: 12 }}>⏳ กำลังอัปโหลด...</span>
        ) : photo?.file_path ? (
          <img 
            src={toAbsoluteFileUrl(photo.file_path)} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} 
            alt="Uploaded"
            onError={(e) => { e.target.src = '#'; e.target.style.display = 'none'; }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 32 }}>📷</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>คลิกเพื่อถ่ายรูปหรือเลือกไฟล์</span>
          </div>
        )}
        {photo?.file_path && (
          <button
            type="button"
            style={s.photoDeleteBtn}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Action buttons */}
      {!photo?.file_path && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={{...s.cameraBtn, background: '#10b981', flex: 1}}
            onClick={(e) => { e.stopPropagation(); handleCameraOnly(); }}
          >
            📷 ถ่ายรูป
          </button>
          <button
            type="button"
            style={{...s.cameraBtn, background: '#3b82f6', flex: 1}}
            onClick={(e) => { e.stopPropagation(); handlePickPhoto(); }}
          >
            📁 เลือกไฟล์
          </button>
        </div>
      )}

      {/* Editable photo title - pre-filled with template caption */}
      {photo?.file_path && (
        <input
          style={s.photoTitleInput}
          placeholder={caption || `ระบุหัวข้อรูป...`}
          value={photo.title || caption || ''}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={50}
        />
      )}
    </div>
  );
}

function MeterEditor({ meters, value, onChange, template, projectId, onSaveMeter, photoCaptions }) {
  // value = { [meterId]: { online_status: bool, accuracy_status: 'Pass'|'Not Accurate', photos: [{file_path, title}], ... } }

  function setMeter(id, field, val) {
    onChange({ ...value, [id]: { ...(value[id] || {}), [field]: val } });
  }

  async function handleScan(meterId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const results = await detectBarcodeValuesFromFile(file);
      if (results.length > 0) {
        setMeter(meterId, 'serial_number', results[0]);
      } else {
        alert('No barcode detected');
      }
    };
    input.click();
  }

  if (!meters || meters.length === 0) {
    return <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:20 }}>เลือก Loop เพื่อแสดงมิเตอร์</p>;
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {meters.map(meter => {
        const meterId = meter.meter_code; // Use meter_code as key for workbook-based assets
        const meterValue = value[meterId] || {};
        const meterPhotos = meterValue.photos || [{file_path: '', title: ''}, {file_path: '', title: ''}, {file_path: '', title: ''}];

        // Ensure photos array has proper structure
        const normalizedPhotos = meterPhotos.map(p =>
          typeof p === 'string' ? { file_path: p, title: '' } : (p || { file_path: '', title: '' })
        );

        return (
          <div key={meterId} style={s.meterCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h4 style={s.meterCardTitle}>
                  {meter.meter_name} 
                  <span style={s.meterCardSerial}>S/N: {meterValue.serial_number || meter.serial_number || 'N/A'}</span>
                </h4>
                {/* Status Badge */}
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 600,
                  background: meter.status === 'เสร็จสิ้น' ? '#dcfce7' : 
                             meter.status === 'กำลังทำ' ? '#fef9c3' : '#f3f4f6',
                  color: meter.status === 'เสร็จสิ้น' ? '#16a34a' : 
                         meter.status === 'กำลังทำ' ? '#a16207' : '#6b7280'
                }}>
                  {meter.status || 'ยังไม่ทำ'}
                </span>
              </div>
              <button type="button" style={s.btnScan} onClick={() => handleScan(meterId)}>
                📷 Scan S/N
              </button>
            </div>
            
            {/* Meter Info Grid */}
            <div style={s.meterInfoGrid}>
              <Fld label="Meter Name (Edit)">
                <input 
                  style={s.input} 
                  value={meterValue.meter_name ?? meter.meter_name} 
                  onChange={e => setMeter(meterId, 'meter_name', e.target.value)} 
                />
              </Fld>
              <Fld label="Serial Number (Edit)">
                <input 
                  style={s.input} 
                  value={meterValue.serial_number ?? meter.serial_number} 
                  onChange={e => setMeter(meterId, 'serial_number', e.target.value)} 
                />
              </Fld>
              <Fld label="Online/Offline">
                <div style={s.radioGroup}>
                  <label><input type="radio" name={`online-${meterId}`} checked={meterValue.online_status !== false} onChange={() => setMeter(meterId, 'online_status', true)} /> Online</label>
                  <label><input type="radio" name={`online-${meterId}`} checked={meterValue.online_status === false} onChange={() => setMeter(meterId, 'online_status', false)} /> Offline</label>
                </div>
              </Fld>
              <Fld label="Pass/Not Accurate">
                <div style={s.radioGroup}>
                  <label><input type="radio" name={`accuracy-${meterId}`} checked={meterValue.accuracy_status !== 'Not Accurate'} onChange={() => setMeter(meterId, 'accuracy_status', 'Pass')} /> Pass</label>
                  <label><input type="radio" name={`accuracy-${meterId}`} checked={meterValue.accuracy_status === 'Not Accurate'} onChange={() => setMeter(meterId, 'accuracy_status', 'Not Accurate')} /> Not Accurate</label>
                </div>
              </Fld>
              <Fld label="Energy (kWh)">
                <input style={s.input} type="number" step="0.01" value={meterValue.energy_reading || ''} onChange={e => setMeter(meterId, 'energy_reading', e.target.value)} />
              </Fld>
              <Fld label="Comment" col2>
                <input style={s.input} value={meterValue.comment || ''} onChange={e => setMeter(meterId, 'comment', e.target.value)} />
              </Fld>
            </div>

            {/* Checklist with customizable template */}
            <div style={{marginTop: 16}}>
              <ChecklistEditor
                template={template}
                value={meterValue.checklist || {}}
                onChange={c => setMeter(meterId, 'checklist', c)}
              />
            </div>

            {/* Photos with editable titles */}
            <div style={{marginTop: 16}}>
              <h5 style={s.photoSectionTitle}>รูปภาพประกอบ (3 รูป) - สามารถแก้ไขหัวข้อรูปได้</h5>
              <div style={s.photoGrid}>
                {normalizedPhotos.map((photo, i) => (
                  <PhotoUploadSlot
                    key={i}
                    photo={photo}
                    index={i}
                    projectId={projectId}
                    caption={photoCaptions?.[i]}
                    onChange={(path) => {
                      const newPhotos = [...normalizedPhotos];
                      newPhotos[i] = { ...newPhotos[i], file_path: path };
                      setMeter(meterId, 'photos', newPhotos);
                    }}
                    onTitleChange={(title) => {
                      const newPhotos = [...normalizedPhotos];
                      newPhotos[i] = { ...newPhotos[i], title };
                      setMeter(meterId, 'photos', newPhotos);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Save Meter Progress */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                style={s.btnSaveMeter} 
                onClick={() => onSaveMeter(meter)}
              >
                💾 บันทึกผลมิเตอร์นี้
              </button>
            </div>

          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────
   METER STATUS TABLE (MA table from Excel)
──────────────────────────────────── */
function MeterStatusTable({ meters, value, onChange }) {
  // value = { [meterId]: { online: bool, pass: bool, energy: '', comment: '' } }

  function setMeter(id, field, val) {
    onChange({ ...value, [id]: { ...(value[id] || { online: true, pass: true, energy: '', comment: '' }), [field]: val } });
  }

  if (!meters || meters.length === 0) {
    return <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:20 }}>ไม่มีข้อมูล Meter ในโปรเจกต์นี้</p>;
  }

  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <table style={s.meterTable}>
        <thead>
          <tr>
            <th style={s.meterTh}>No.</th>
            <th style={s.meterTh}>Name Meter</th>
            <th style={s.meterTh}>Serial No.</th>
            <th style={s.meterTh}>Panel</th>
            <th style={s.meterTh}>Floor</th>
            <th style={s.meterTh}>Address</th>
            <th style={s.meterTh}>Baud</th>
            <th style={s.meterTh}>CT Ratio</th>
            <th style={s.meterTh}>Model</th>
            <th style={s.meterTh}>Online</th>
            <th style={s.meterTh}>Offline</th>
            <th style={s.meterTh}>Pass</th>
            <th style={s.meterTh}>Not Acc.</th>
            <th style={s.meterTh}>Energy (kWh)</th>
            <th style={s.meterTh}>Comment</th>
          </tr>
        </thead>
        <tbody>
          {meters.map((m, idx) => {
            const val = value[m.id] || {};
            const online   = val.online   ?? true;
            const pass     = val.pass     ?? true;
            return (
              <tr key={m.id} style={{ background: idx%2===0 ? '#fff' : '#f8fafc' }}>
                <td style={s.meterTd}>{idx+1}</td>
                <td style={{ ...s.meterTd, fontWeight:600, color:'#1e40af' }}>{m.meter_name || m.meter_code}</td>
                <td style={{ ...s.meterTd, fontFamily:'monospace', fontSize:11 }}>{m.serial_number || '—'}</td>
                <td style={s.meterTd}>{m.panel_code || '—'}</td>
                <td style={s.meterTd}>{m.location_floor || '—'}</td>
                <td style={s.meterTd}>{m.device_address || '—'}</td>
                <td style={s.meterTd}>{m.baud_rate || '—'}</td>
                <td style={s.meterTd}>{m.ct_ratio || '—'}</td>
                {/* System column removed as per requirements */}
                <td style={s.meterTd}>
                  <span style={{ fontSize:11, background:'#fef3c7', color:'#92400e', padding:'2px 6px', borderRadius:4 }}>
                    {m.model || '—'}
                  </span>
                </td>
                {/* Online */}
                <td style={{ ...s.meterTd, textAlign:'center' }}>
                  <input type="checkbox" checked={online} onChange={e => setMeter(m.id, 'online', e.target.checked)} />
                </td>
                {/* Offline */}
                <td style={{ ...s.meterTd, textAlign:'center' }}>
                  <input type="checkbox" checked={!online} onChange={e => setMeter(m.id, 'online', !e.target.checked)} />
                </td>
                {/* Pass */}
                <td style={{ ...s.meterTd, textAlign:'center' }}>
                  <input type="checkbox" checked={pass} onChange={e => setMeter(m.id, 'pass', e.target.checked)} />
                </td>
                {/* Not Accurate */}
                <td style={{ ...s.meterTd, textAlign:'center' }}>
                  <input type="checkbox" checked={!pass} onChange={e => setMeter(m.id, 'pass', !e.target.checked)} />
                </td>
                {/* Energy */}
                <td style={s.meterTd}>
                  <input
                    style={s.meterInput}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={val.energy || ''}
                    onChange={e => setMeter(m.id, 'energy', e.target.value)}
                  />
                </td>
                {/* Comment */}
                <td style={s.meterTd}>
                  <input
                    style={{ ...s.meterInput, minWidth:120 }}
                    placeholder="หมายเหตุ..."
                    value={val.comment || ''}
                    onChange={e => setMeter(m.id, 'comment', e.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────
   CHECKLIST TEMPLATE EDITOR MODAL
   Allows customizing checklist items per project
──────────────────────────────────── */
function ChecklistTemplateEditor({ projectId, currentTemplate, onSave, onClose }) {
  const [topics, setTopics] = useState(currentTemplate?.topics || []);
  const [saving, setSaving] = useState(false);

  function addTopic() {
    const newId = `custom_${Date.now()}`;
    setTopics([...topics, { id: newId, section: 'หัวข้อใหม่', label: 'รายการตรวจสอบใหม่', order: topics.length }]);
  }

  function removeTopic(id) {
    setTopics(topics.filter(t => t.id !== id));
  }

  function updateTopic(id, field, value) {
    setTopics(topics.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const templateData = {
        job_type: currentTemplate?.job_type || 'PM',
        name: currentTemplate?.name || 'Custom Checklist',
        topics: topics
      };
      
      await updateProjectChecklistTemplate(projectId, templateData);
      onSave(templateData);
    } catch (err) {
      alert('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modalBox}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>✏️ แก้ไข Checklist Template</h3>
          <button style={s.modalCloseBtn} onClick={onClose}>✕</button>
        </div>
        
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          ปรับแต่งรายการตรวจสอบสำหรับโปรเจกต์นี้ การเปลี่ยนแปลงจะบันทึกเฉพาะในโปรเจกต์นี้
        </p>

        <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
          {topics.map((topic, idx) => (
            <div key={topic.id} style={s.modalTopicRow}>
              <span style={{ fontSize: 12, color: '#94a3b8', width: 24 }}>{idx + 1}.</span>
              <input
                style={{ ...s.modalInput, flex: 1 }}
                value={topic.section}
                onChange={e => updateTopic(topic.id, 'section', e.target.value)}
                placeholder="หมวดหมู่"
              />
              <input
                style={{ ...s.modalInput, flex: 2 }}
                value={topic.label}
                onChange={e => updateTopic(topic.id, 'label', e.target.value)}
                placeholder="รายการตรวจสอบ"
              />
              <button style={s.modalRemoveBtn} onClick={() => removeTopic(topic.id)}>🗑️</button>
            </div>
          ))}
        </div>

        <button style={s.modalAddBtn} onClick={addTopic}>+ เพิ่มรายการ</button>

        <div style={s.modalFooter}>
          <button style={s.modalCancelBtn} onClick={onClose}>ยกเลิก</button>
          <button style={s.modalSaveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
function Reports() {
  const { selectedProject, setSelectedProject } = useProject();
  const location = useLocation();
  const [projects, setProjects]   = useState([]);
  const [meters, setMeters]       = useState([]);
  const [loops, setLoops]         = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [reports, setReports]     = useState([]);
  const [selLoops, setSelLoops]   = useState([]);
  const [workbookAssets, setWorkbookAssets] = useState(null);

  /* form state */
  const [form, setForm] = useState({
    service_type: 'PM',
    service_date: new Date().toISOString().slice(0,16),
    engineer_name: '',
    engineer_id: '',
    approve_by: '',
    note: '',
    project_name_override: '',
    consumer_name: '',
    inspection_product: '',
    service_no: '',
  });
  const [checklist, setChecklist]       = useState({});
  const [meterStatus, setMeterStatus]   = useState({});
  const [templateAnalysis, setTplAnal]  = useState(null);

  const [activeTab, setActiveTab] = useState('form');
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');
  const [saving, setSaving]       = useState(false);
  const [completing, setCompleting] = useState(null);

  // Template-related state
  const [checklistTemplates, setChecklistTemplates] = useState({});
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [loadingPreviousReport, setLoadingPreviousReport] = useState(false);
  const [photoCaptions, setPhotoCaptions] = useState(['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3']);
  const [showChecklistEditor, setShowChecklistEditor] = useState(false);

  function set(key, val) { setForm(c => ({...c,[key]:val})); }

  /* ── load ── */
  async function load(pid = '') {
    try {
      const [pd, ld, md, jd, rd] = await Promise.all([
        getProjects(),
        getLoops(pid ? { project_id: pid } : {}),
        getMeters(pid ? { project_id: pid } : {}),
        getServiceJobs(pid ? { project_id: pid } : {}),
        getReports(pid ? { project_id: pid } : {}),
      ]);
      setProjects(pd); setLoops(ld); setMeters(md); setJobs(jd); setReports(rd);

      // Auto-load previous report data as draft if no current draft
      if (pid && md.length > 0) {
        const lastJob = jd.find(j => j.status === 'Completed');
        if (lastJob && Object.keys(meterStatus).length === 0) {
          // Logic to pull previous data and set as current draft
          console.log('Found previous job, could auto-fill draft');
        }
      }
    } catch { setErr('โหลดข้อมูลไม่สำเร็จ'); }
  }
  useEffect(() => { load(selectedProject); }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) { setTplAnal(null); setWorkbookAssets(null); return; }
    async function run() {
      try { 
        setTplAnal(await getProjectTemplateAnalysis(selectedProject)); 
        const assets = await getWorkbookAssets(selectedProject);
        setWorkbookAssets(assets);
        
        // Auto-prepare template sheets for all meters if meters exist
        if (assets && assets.length > 0) {
          try {
            const result = await prepareReportTemplate(selectedProject);
            console.log('Auto-prepared template:', result.message);
          } catch (err) {
            console.log('Template preparation skipped:', err.message);
          }
        }
        
        // Load photo captions from template
        const captions = await getProjectPhotoCaptions(selectedProject);
        if (captions && captions.captions) {
          setPhotoCaptions(captions.captions);
        }
        
        // Load saved meter draft data
        try {
          const drafts = await loadMeterDrafts(selectedProject);
          if (drafts && drafts.meter_data && Object.keys(drafts.meter_data).length > 0) {
            setMeterStatus(drafts.meter_data);
            console.log('[LOAD] Restored', Object.keys(drafts.meter_data).length, 'meter drafts');
          }
        } catch (err) {
          console.log('[LOAD] No saved drafts:', err.message);
        }
      }
      catch { setTplAnal(null); setWorkbookAssets(null); }
    }
    run();
  }, [selectedProject]);

  /* auto-fill consumer from project */
  useEffect(() => {
    const p = projects.find(px => String(px.id) === selectedProject);
    if (p) set('project_name_override', p.name);
  }, [selectedProject, projects]);

  /* Load checklist templates when service type changes - use project-specific first */
  const prevServiceType = useRef(form.service_type);
  useEffect(() => {
    async function loadTemplates() {
      try {
        if (selectedProject) {
          const projectTemplate = await getProjectChecklistTemplate(selectedProject);
          if (projectTemplate && projectTemplate.template) {
            setCurrentTemplate(projectTemplate.template);
            setChecklistTemplates({ [form.service_type.toUpperCase()]: projectTemplate.template });
            console.log('[TEMPLATE] Loaded project checklist template');
            return;
          }
        }
        
        const templates = await getChecklistTemplates(form.service_type);
        setChecklistTemplates(templates);
        const template = templates[form.service_type.toUpperCase()];
        if (template) {
          setCurrentTemplate(template);
        }
      } catch (err) {
        console.error('[TEMPLATE] Failed to load checklist templates:', err);
      }
    }
    loadTemplates();
    // Only reset meter data when SERVICE TYPE changes, NOT when project changes
    if (prevServiceType.current !== form.service_type) {
      console.log('[TEMPLATE] Service type changed:', prevServiceType.current, '->', form.service_type, '- resetting meter data');
      setMeterStatus({});
      prevServiceType.current = form.service_type;
    }
  }, [form.service_type, selectedProject]);

  const filteredMeters = useMemo(() => {
    if (!workbookAssets || selLoops.length === 0) return [];
    
    let meters = workbookAssets
      .filter(loop => selLoops.includes(loop.loop_name))
      .flatMap(loop => loop.meters.map(meter => ({ ...meter, loop_name: loop.loop_name })));

    // If a specific meter is requested via URL, filter only that one
    const params = new URLSearchParams(location.search);
    const targetMeter = params.get('meter');
    if (targetMeter) {
      meters = meters.filter(m => m.meter_code === targetMeter);
    }

    return meters;
  }, [workbookAssets, selLoops, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const loopName = params.get('loop');
    const meterCode = params.get('meter');

    if (loopName && !selLoops.includes(loopName)) {
      setSelLoops([loopName]);
    }
    // meterCode can be used to scroll to or highlight the meter
  }, [location.search, workbookAssets]);

  async function handleSaveMeter(meter) {
    const meterCode = meter.meter_code;
    const data = meterStatus[meterCode] || {};
    
    console.log('[SAVE] meter:', meterCode, 'data:', JSON.stringify(data).slice(0, 200));
    
    // Determine status based on what's been filled
    let newStatus = 'ยังไม่ทำ';
    const hasChecklist = data.checklist && Object.keys(data.checklist).length > 0 && 
                         Object.values(data.checklist).some(v => v.status && v.status !== 'N/A');
    const hasPhotos = data.photos && data.photos.some(p => p && p.file_path);
    const hasEnergy = data.energy_reading && data.energy_reading !== '';
    
    const isTouched = hasEnergy || data.comment || hasChecklist || hasPhotos;
    const isComplete = hasEnergy && hasPhotos && hasChecklist;

    if (isComplete) newStatus = 'เสร็จสิ้น';
    else if (isTouched) newStatus = 'กำลังทำ';
    
    console.log('[SAVE] status:', newStatus, '| energy:', hasEnergy, '| photos:', hasPhotos, '| checklist:', hasChecklist);

    try {
      // 1. Update meter status in DB
      const meterObj = meters.find(m => 
        m.meter_code?.trim().toLowerCase() === meterCode?.trim().toLowerCase()
      );
      if (meterObj) {
        await updateMeter(meterObj.id, { ...meterObj, status: newStatus });
        console.log('[SAVE] DB meter updated:', meterObj.id, newStatus);
      } else {
        console.log('[SAVE] No DB meter match for:', meterCode);
      }
      
      // 2. Save draft data (energy, checklist, photos, comment) to backend JSON
      if (selectedProject) {
        const draftPayload = { [meterCode]: data };
        const saveResult = await saveMeterDrafts(selectedProject, draftPayload);
        console.log('[SAVE] Draft saved:', saveResult);
      }
      
      setMsg(`บันทึกมิเตอร์ ${meterCode} → "${newStatus}" ✓`);
    } catch (ex) {
      console.error('[SAVE] Error:', ex);
      setErr(`บันทึกมิเตอร์ ${meterCode} ไม่สำเร็จ: ${ex.message || 'ลองใหม่'}`);
    }
  }

  /* ── Save All Meters ── */
  async function handleSaveAll() {
    setSaving(true);
    console.log('[SAVE ALL] Starting save for', filteredMeters.length, 'meters');
    try {
      // Save all meter drafts in one batch call
      if (selectedProject && Object.keys(meterStatus).length > 0) {
        await saveMeterDrafts(selectedProject, meterStatus);
        console.log('[SAVE ALL] Batch draft saved:', Object.keys(meterStatus).length, 'meters');
      }
      
      // Update DB status for each meter
      for (const meter of filteredMeters) {
        const meterCode = meter.meter_code;
        const data = meterStatus[meterCode] || {};
        let newStatus = 'ยังไม่ทำ';
        const hasChecklist = data.checklist && Object.keys(data.checklist).length > 0 && 
                             Object.values(data.checklist).some(v => v.status && v.status !== 'N/A');
        const hasPhotos = data.photos && data.photos.some(p => p && p.file_path);
        const hasEnergy = data.energy_reading && data.energy_reading !== '';
        if (hasEnergy && hasPhotos && hasChecklist) newStatus = 'เสร็จสิ้น';
        else if (hasEnergy || data.comment || hasChecklist || hasPhotos) newStatus = 'กำลังทำ';
        
        const meterObj = meters.find(m => 
          m.meter_code?.trim().toLowerCase() === meterCode?.trim().toLowerCase()
        );
        if (meterObj) {
          try { await updateMeter(meterObj.id, { ...meterObj, status: newStatus }); }
          catch (e) { console.warn('[SAVE ALL] Failed to update DB for', meterCode, e); }
        }
      }
      
      setMsg(`บันทึกมิเตอร์ทั้งหมด ${filteredMeters.length} ตัวแล้ว ✓`);
    } catch (ex) {
      console.error('[SAVE ALL] Error:', ex);
      setErr('บันทึกไม่สำเร็จ: ' + (ex.message || 'ลองใหม่'));
    } finally {
      setSaving(false);
    }
  }

  /* ── submit job ── */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedProject || selLoops.length === 0) { setErr('กรุณาเลือกโปรเจกต์และอย่างน้อยหนึ่ง Loop'); return; }
    setSaving(true); setErr('');
    try {
      const meterDataForApi = Object.entries(meterStatus).map(([meterCode, data]) => ({
        meter_code: meterCode,
        meter_name: data.meter_name || '',
        online_status: data.online_status !== false,
        accuracy_status: data.accuracy_status || 'Pass',
        energy_reading: data.energy_reading ? Number(data.energy_reading) : null,
        comment: data.comment || '',
        checklist: Object.entries(data.checklist || {}).map(([key, value]) => ({
          label: typeof value.label === 'string' ? value.label : key,
          status: value.status || 'N/A',
          remark: value.note || value.remark || '',
          required_remark: value.status === 'Fail' && !value.note,
        })),
        photos: (data.photos || []).map(p =>
          typeof p === 'string' ? { file_path: p, title: '', caption: '' } : p
        ).filter(p => p.file_path), // Only include photos with file paths
      }));

      // Get inspection date for filename
      const inspectionDate = new Date(form.service_date);
      const dateStr = inspectionDate.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

      await generateReportByLoop({
        project_id: Number(selectedProject),
        loop_names: selLoops,
        report_type: form.service_type,
        inspection_date: inspectionDate.toISOString(),
        meter_data: meterDataForApi,
        append_mode: true, // Always append to existing report for the date
        custom_template: currentTemplate,
      });

      setMsg('สร้างรายงานสำเร็จ! ไฟล์: report_' + dateStr + '_' + form.service_type + '.xlsx ✓');
      await load(selectedProject);
      setActiveTab('files');
    } catch (ex) {
      setErr(ex.response?.data?.detail ?? 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  }

  async function handleComplete(jobId) {
    setCompleting(jobId);
    try {
      await completeServiceJob(jobId);
      setMsg('งานเสร็จแล้ว — ไฟล์ Excel และ PDF ถูกสร้างแล้ว');
      await load(selectedProject);
      setActiveTab('files');
    } catch (ex) {
      setErr(ex.response?.data?.detail ?? 'ไม่สามารถเสร็จงานได้');
    } finally { setCompleting(null); }
  }

  /* ════ RENDER ════ */
  return (
    <div style={s.page}>

      {/* ── top ── */}
      <div style={s.topBar}>
        <div>
          <span style={s.eyebrow}>Report Center</span>
          <h1 style={s.pageTitle}>ออกรายงาน PM / MA</h1>
        </div>
        <div style={s.pickerWrap}>
          <label style={s.label}>โปรเจกต์</label>
          <select style={s.projectSelect} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="">— ทุกโปรเจกต์ —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={() => setSelectedProject('')} style={s.btnGhostSm}>เปลี่ยนโปรเจ็กต์</button>
        </div>
      </div>

      {/* ── loop selector ── */}
      {selectedProject && workbookAssets && workbookAssets.length > 0 && (
        <div style={s.loopSelector}>
          <h4 style={s.loopSelectorTitle}>เลือก Loop</h4>
          <div style={s.loopGrid}>
            {workbookAssets.map(loop => (
              <label key={loop.loop_name} style={s.loopLabel}>
                <input
                  type="checkbox"
                  checked={selLoops.includes(loop.loop_name)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelLoops([...selLoops, loop.loop_name]);
                    } else {
                      setSelLoops(selLoops.filter(name => name !== loop.loop_name));
                    }
                  }}
                />
                {loop.loop_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {selectedProject && (!workbookAssets || workbookAssets.length === 0) && (
        <div style={s.loopSelector}>
          <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center' }}>ไม่พบไฟล์ข้อมูลมิเตอร์ (Workbook) สำหรับโปรเจกต์นี้</p>
        </div>
      )}

      {/* template bar with checklist editor */}
      {templateAnalysis && (
        <div style={s.tplBar}>
          <span>📄 <strong>{templateAnalysis.analysis?.template_name}</strong></span>
          <span style={s.tplBadge}>{templateAnalysis.analysis?.sheet_count} sheets · {templateAnalysis.analysis?.detected_layout}</span>
          <span style={s.tplReady}>Template พร้อม ✓</span>
          <button 
            type="button" 
            style={s.btnEditTemplate}
            onClick={() => setShowChecklistEditor(true)}
          >
            ✏️ แก้ไข Checklist
          </button>
        </div>
      )}

      {err && <div style={s.alertErr} onClick={() => setErr('')}>{err} ✕</div>}
      {msg && <div style={s.alertOk} onClick={() => setMsg('')}>{msg} ✕</div>}

      {/* ── tabs ── */}
      <div style={s.tabBar}>
        <TabBtn id="form"    active={activeTab} label="📝 กรอกรายงาน"                       onClick={setActiveTab} />
        <TabBtn id="history" active={activeTab} label={`📋 ประวัติงาน (${jobs.length})`}    onClick={setActiveTab} />
        <TabBtn id="files"   active={activeTab} label={`📁 ไฟล์ (${reports.length})`}       onClick={setActiveTab} />
      </div>

      {/* ══════════════════════════════════════
          TAB: FORM
      ══════════════════════════════════════ */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmit}>
          {/* ── section 1: header info ── */}
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <span style={s.sectionNum}>1</span>
              <h3 style={s.sectionTitle}>ข้อมูลหน้าปก (Cover)</h3>
            </div>
            <div style={s.formGrid}>
              <Fld label="ประเภทงาน">
                <select style={s.input} value={form.service_type} onChange={e => set('service_type', e.target.value)}>
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Fld>
              <Fld label="Service No.">
                <input style={s.input} value={form.service_no} onChange={e => set('service_no', e.target.value)} placeholder="เช่น EMS-2025-001" />
              </Fld>
              <Fld label="ชื่อโปรเจกต์ (บนใบรายงาน)">
                <input style={s.input} value={form.project_name_override} onChange={e => set('project_name_override', e.target.value)} />
              </Fld>
              <Fld label="Consumer / ลูกค้า">
                <input style={s.input} value={form.consumer_name} onChange={e => set('consumer_name', e.target.value)} placeholder="เช่น Oakwood Suites Bangkok" />
              </Fld>
              <Fld label="วันที่ตรวจ">
                <input type="datetime-local" style={s.input} value={form.service_date} onChange={e => set('service_date', e.target.value)} required />
              </Fld>
              <Fld label="Inspection Product">
                <input style={s.input} value={form.inspection_product} onChange={e => set('inspection_product', e.target.value)} placeholder="เช่น Digital Meter EMS" />
              </Fld>
              <Fld label="ชื่อช่าง (Inspection By)">
                <input style={s.input} value={form.engineer_name} onChange={e => set('engineer_name', e.target.value)} placeholder="ชื่อ-นามสกุล" />
              </Fld>
              <Fld label="Approve By">
                <input style={s.input} value={form.approve_by} onChange={e => set('approve_by', e.target.value)} placeholder="ผู้อนุมัติ" />
              </Fld>
              <Fld label="หมายเหตุ" col2>
                <textarea style={{ ...s.input, resize:'vertical', minHeight:72 }} value={form.note} onChange={e => set('note', e.target.value)} />
              </Fld>
            </div>
          </div>

          {/* ── section 2: meter details ── */}
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <span style={s.sectionNum}>2</span>
              <h3 style={s.sectionTitle}>ข้อมูลมิเตอร์ (Meter Details)</h3>
              <span style={s.sectionHint}>กรอกข้อมูล, Checklist, และรูปภาพสำหรับแต่ละมิเตอร์</span>
            </div>
            <MeterEditor
              meters={filteredMeters}
              value={meterStatus}
              onChange={setMeterStatus}
              template={currentTemplate}
              projectId={selectedProject}
              onSaveMeter={handleSaveMeter}
              photoCaptions={photoCaptions}
            />
          </div>

          {/* submit */}
          <div style={s.submitBar}>
            <div style={s.submitInfo}>
              <span style={{ fontSize:13, color:'#64748b' }}>
                {filteredMeters.length} มิเตอร์
              </span>
              <span style={{ fontSize:12, color:'#94a3b8', marginLeft:10 }}>
                {filteredMeters.filter(m => {
                  const data = meterStatus[m.meter_code] || {};
                  const hasChecklist = data.checklist && Object.keys(data.checklist).length > 0 && 
                                       Object.values(data.checklist).some(v => v.status && v.status !== 'N/A');
                  const hasPhotos = data.photos && data.photos.some(p => p && p.file_path);
                  const hasEnergy = data.energy_reading && data.energy_reading !== '';
                  return hasEnergy && hasPhotos && hasChecklist;
                }).length} / {filteredMeters.length} ครบถ้วน
              </span>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" style={s.btnGhost} onClick={() => { setMeterStatus({}); }}>
                ล้างฟอร์ม
              </button>
              <button 
                type="button" 
                style={{ ...s.btnSecondary, background: '#f59e0b', color: '#fff' }} 
                onClick={handleSaveAll}
                disabled={saving || filteredMeters.length === 0}
              >
                {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกทั้งหมด'}
              </button>
              <button type="submit" style={s.btnPrimary} disabled={!selectedProject || saving}>
                {saving ? '⏳ กำลังสร้างรายงาน...' : '� สร้างรายงาน Excel'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ══════════════════════════════════════
          TAB: HISTORY
      ══════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>ประวัติงานบริการ</h3>
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            <table style={s.histTable}>
              <thead>
                <tr>
                  {['#','ประเภท','ช่าง','วันที่','Checklist','Meter','สถานะ','ไฟล์','ดำเนินการ'].map(h => (
                    <th key={h} style={s.histTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} style={s.histRow}>
                    <td style={s.histTd}>#{job.id}</td>
                    <td style={s.histTd}>
                      <span style={{ ...s.typeBadge, background: job.service_type==='PM' ? '#dbeafe' : '#fef3c7', color: job.service_type==='PM' ? '#1d4ed8' : '#92400e' }}>
                        {job.service_type}
                      </span>
                    </td>
                    <td style={s.histTd}>{job.engineer_name || '—'}</td>
                    <td style={{ ...s.histTd, whiteSpace:'nowrap', fontSize:12 }}>
                      {new Date(job.service_date).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' })}
                    </td>
                    <td style={{ ...s.histTd, textAlign:'center' }}>
                      {(job.checklist_items || []).length > 0
                        ? <span style={{ color:'#16a34a', fontSize:12 }}>✓ {job.checklist_items.length}</span>
                        : <span style={{ color:'#94a3b8', fontSize:12 }}>—</span>
                      }
                    </td>
                    <td style={{ ...s.histTd, textAlign:'center' }}>
                      {(job.meter_status_items || []).length > 0
                        ? <span style={{ color:'#2563eb', fontSize:12 }}>✓ {job.meter_status_items.length}</span>
                        : <span style={{ color:'#94a3b8', fontSize:12 }}>—</span>
                      }
                    </td>
                    <td style={s.histTd}>
                      <span style={{ ...s.statusBadge, background: job.status==='Completed' ? '#dcfce7' : '#fef9c3', color: job.status==='Completed' ? '#15803d' : '#a16207' }}>
                        {job.status === 'Completed' ? 'เสร็จ ✓' : 'รอ'}
                      </span>
                    </td>
                    <td style={{ ...s.histTd, textAlign:'center' }}>
                      <span style={{ fontSize:12, color:'#64748b' }}>{job.reports?.length || 0} ไฟล์</span>
                    </td>
                    <td style={s.histTd}>
                      <div style={{ display:'flex', gap:6 }}>
                        {job.status !== 'Completed' && (
                          <button
                            type="button"
                            style={s.btnComplete}
                            disabled={completing === job.id}
                            onClick={() => handleComplete(job.id)}
                          >
                            {completing === job.id ? '⏳' : '✅ เสร็จ + สร้างไฟล์'}
                          </button>
                        )}
                        <button
                          type="button"
                          style={s.btnGhostSm}
                          onClick={() => {
                            setForm(f => ({
                              ...f,
                              service_type: job.service_type || 'PM',
                              engineer_name: job.engineer_name || '',
                              note: job.note || '',
                              service_date: new Date().toISOString().slice(0,16),
                            }));
                            setChecklist({});
                            setActiveTab('form');
                          }}
                        >
                          ใช้เป็นต้นแบบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr><td colSpan={9} style={s.histEmpty}>ยังไม่มีงานบริการ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB: FILES
      ══════════════════════════════════════ */}
      {activeTab === 'files' && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>ไฟล์รายงานทั้งหมด</h3>
          <ReportViewer
            reports={reports}
            title=""
            description="ไฟล์ PDF และ Excel ที่ generate แล้ว"
            emptyMessage="ยังไม่มีไฟล์ — เสร็จงานบริการแล้วจะมีไฟล์ที่นี่"
          />
        </div>
      )}

      {/* ══════════════════════════════════════
          CHECKLIST TEMPLATE EDITOR MODAL
      ══════════════════════════════════════ */}
      {showChecklistEditor && (
        <ChecklistTemplateEditor
          projectId={selectedProject}
          currentTemplate={currentTemplate}
          onSave={(template) => {
            setCurrentTemplate(template);
            setShowChecklistEditor(false);
            setMsg('บันทึก Checklist Template สำเร็จ ✓');
          }}
          onClose={() => setShowChecklistEditor(false)}
        />
      )}

    </div>
  );
}

/* ─── Styles ─── */
const s = {
  page: { padding:'clamp(12px,3vw,28px)', maxWidth:1200, margin:'0 auto', fontFamily:"'Sarabun','Segoe UI',system-ui,sans-serif", minHeight:'100vh', background:'#f8fafc' },
  topBar: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:16 },
  eyebrow: { fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:4 },
  pageTitle: { margin:0, fontSize:'clamp(18px,3vw,26px)', fontWeight:800, color:'#0f172a' },
  pickerWrap: { display:'flex', flexDirection:'column', gap:5, minWidth:220 },
  label: { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 },
  projectSelect: { padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', color:'#0f172a', minWidth:220 },

  tplBar: { display:'flex', alignItems:'center', gap:12, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', marginBottom:14, flexWrap:'wrap', fontSize:13 },
  tplBadge: { fontSize:11, background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:'2px 8px', color:'#64748b' },
  tplReady: { fontSize:11, background:'#dcfce7', color:'#16a34a', borderRadius:6, padding:'2px 8px', fontWeight:700 },
  btnEditTemplate: { fontSize:11, background:'#eff6ff', color:'#3b82f6', border:'1px solid #bfdbfe', borderRadius:6, padding:'4px 10px', fontWeight:600, cursor:'pointer' },

  alertErr: { background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:12, cursor:'pointer' },
  alertOk:  { background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#16a34a', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:12, cursor:'pointer' },

  tabBar: { display:'flex', gap:4, marginBottom:16, overflowX:'auto', paddingBottom:2 },
  tab: { padding:'8px 16px', background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:'#64748b', whiteSpace:'nowrap' },
  tabActive: { background:'#2563eb', border:'1px solid #2563eb', color:'#fff', fontWeight:700 },

  /* form sections */
  section: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,.04)' },
  sectionHeader: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:16 },
  sectionNum: { width:28, height:28, borderRadius:14, background:'#2563eb', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 },
  sectionTitle: { margin:0, fontSize:15, fontWeight:700, color:'#0f172a' },
  sectionHint: { fontSize:12, color:'#94a3b8' },

  formGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px 16px' },
  input: { width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff', color:'#0f172a', boxSizing:'border-box' },

  /* checklist */
  checkSection: { marginBottom:4 },
  checkSectionTitle: { fontSize:13, fontWeight:700, color:'#374151', padding:'8px 12px', background:'#f8fafc', borderRadius:6, marginBottom:8 },
  checkGrid: { display:'flex', flexDirection:'column', gap:6 },
  checkRow: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'8px 12px', background:'#fff', border:'1px solid #f1f5f9', borderRadius:6 },
  checkItem: { flex:'1 1 200px', fontSize:13, color:'#374151' },
  checkControls: { display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' },
  statusBtn: { padding:'4px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', background:'#f8fafc', color:'#64748b' },
  statusBtnActive: {
    Pass: { background:'#dcfce7', border:'1px solid #16a34a', color:'#16a34a' },
    Fail: { background:'#fee2e2', border:'1px solid #dc2626', color:'#dc2626' },
    'N/A': { background:'#f1f5f9', border:'1px solid #94a3b8', color:'#475569' },
  },
  checkNote: { padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, outline:'none', width:160, background:'#f8fafc' },
  checkRowRequired: { border: '1px solid #dc2626', background: '#fef2f2' },
  checkNoteMandatory: { border: '1px solid #dc2626', background: '#fff' },
  checkNoteRequired: { border: '1px solid #dc2626' },
  remarkWarning: { fontSize: 11, color: '#dc2626', marginTop: 4, marginLeft: 8 },

  /* Photo slot with title */
  photoSlot: { display: 'flex', flexDirection: 'column', gap: 8 },
  cameraBtn: {
    padding: '6px 12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  photoTitleInput: {
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 12,
    outline: 'none',
    width: '100%',
    background: '#fff',
    textAlign: 'center',
  },

  /* meter table */
  meterTable: { width:'100%', borderCollapse:'collapse', fontSize:12 },
  meterTh: { padding:'8px 10px', background:'#f8fafc', textAlign:'left', fontWeight:700, color:'#374151', fontSize:11, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  meterTd: { padding:'7px 10px', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' },
  meterInput: { padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, outline:'none', width:80, background:'#fff' },

  /* submit bar */
  submitBar: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'16px 20px', marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,.04)' },
  submitInfo: { display:'flex', flexDirection:'column', gap:4 },
  btnPrimary: { padding:'10px 22px', background:'#2563eb', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' },
  btnGhost: { padding:'10px 16px', background:'#f8fafc', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' },

  /* history table */
  card: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,.04)' },
  cardTitle: { margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#0f172a' },
  histTable: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  histTh: { padding:'9px 12px', background:'#f8fafc', textAlign:'left', fontWeight:700, color:'#374151', fontSize:12, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  histRow: { borderBottom:'1px solid #f1f5f9' },
  histTd: { padding:'10px 12px', color:'#374151', verticalAlign:'middle' },
  histEmpty: { padding:28, textAlign:'center', color:'#94a3b8' },
  typeBadge: { display:'inline-block', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:700 },
  statusBadge: { display:'inline-block', padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:600 },
  btnComplete: { padding:'5px 12px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' },
  btnGhostSm: { padding:'5px 10px', background:'#f8fafc', color:'#374151', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' },

  /* loop selector */
  loopSelector: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'16px 20px', marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,.04)' },
  loopSelectorTitle: { margin:'0 0 12px', fontSize:14, fontWeight:700, color:'#0f172a' },
  loopGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:10 },
  loopLabel: { display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'8px 12px', background:'#f8fafc', borderRadius:6, cursor:'pointer', border:'1px solid #f1f5f9' },

  /* Modal styles for checklist editor */
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modalBox: { background:'#fff', borderRadius:12, padding:24, width:'100%', maxWidth:600, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 50px rgba(0,0,0,0.2)' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, borderBottom:'1px solid #e2e8f0', paddingBottom:12 },
  modalTitle: { margin:0, fontSize:18, fontWeight:700, color:'#0f172a' },
  modalCloseBtn: { background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#64748b' },
  modalTopicRow: { display:'flex', gap:8, alignItems:'center', marginBottom:8, padding:8, background:'#f8fafc', borderRadius:6 },
  modalInput: { padding:'6px 10px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, outline:'none' },
  modalRemoveBtn: { background:'#fee2e2', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:12 },
  modalAddBtn: { width:'100%', padding:'10px', background:'#eff6ff', border:'1px dashed #3b82f6', borderRadius:6, color:'#3b82f6', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom:16 },
  modalFooter: { display:'flex', justifyContent:'flex-end', gap:10 },
  modalCancelBtn: { padding:'8px 16px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, cursor:'pointer' },
  modalSaveBtn: { padding:'8px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer' },

  /* meter editor */
  meterCard: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 },
  meterCardTitle: { margin:'0 0 16px', fontSize:14, fontWeight:700, color:'#1e40af' },
  meterCardSerial: { fontWeight:400, color:'#64748b', fontSize:12, marginLeft:8 },
  meterInfoGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px 16px' },
  radioGroup: { display:'flex', gap:16, alignItems:'center', height:38, fontSize:13 },
  photoSectionTitle: { margin:'0 0 8px', fontSize:13, fontWeight:600, color:'#374151' },
  photoGrid: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 },
  photoUploadBox: { position: 'relative', width:'100%', height:120, background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, color:'#cbd5e1', cursor:'pointer', overflow: 'hidden' },
  photoDeleteBtn: { position: 'absolute', top: 4, right: 4, background: 'rgba(239, 68, 68, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  btnScan: { padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  btnSaveMeter: { padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' },
};

export default Reports;