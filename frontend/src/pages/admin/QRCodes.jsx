import { useEffect, useMemo, useState } from 'react';
import { Download, FolderKanban, LayoutGrid, RadioTower, ScanLine, Zap } from 'lucide-react';
import { API_BASE_URL } from '../../api/api';
import { getPanels } from '../../api/assetApi';
import { getProjects } from '../../api/projectApi';
import { useProject } from '../../context/ProjectContext';

const entityTabs = [
  { id: 'project', label: 'Project QR', icon: FolderKanban },
  { id: 'panel', label: 'Panel QR', icon: LayoutGrid },
  { id: 'loop', label: 'Loop QR', icon: RadioTower },
  { id: 'meter', label: 'Meter QR', icon: Zap },
];

function qrUrlFor(type, id) {
  if (!id) {
    return '';
  }

  if (type === 'project') {
    return `${API_BASE_URL}/projects/${id}/qr`;
  }
  if (type === 'panel') {
    return `${API_BASE_URL}/panels/${id}/qr`;
  }
  if (type === 'loop') {
    return `${API_BASE_URL}/loops/${id}/qr`;
  }
  return `${API_BASE_URL}/meters/${id}/qr`;
}

function downloadNameFor(type, item) {
  const fallbackId = item?.id ?? 'qr';
  if (type === 'project') {
    return `project-${fallbackId}.png`;
  }
  if (type === 'panel') {
    return `panel-${item?.panel_code || fallbackId}.png`;
  }
  if (type === 'loop') {
    return `loop-${item?.loop_code || fallbackId}.png`;
  }
  return `meter-${item?.meter_code || fallbackId}.png`;
}

function CardMeta({ label, value }) {
  return (
    <div style={s.metaRow}>
      <span style={s.metaLabel}>{label}</span>
      <strong style={s.metaValue}>{value || '-'}</strong>
    </div>
  );
}

export default function QRCodes() {
  const { selectedProject: contextProjectId, setSelectedProject: setContextProjectId } = useProject();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(contextProjectId || '');
  const [panels, setPanels] = useState([]);
  const [activeTab, setActiveTab] = useState('project');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProjects() {
      try {
        const projectList = await getProjects();
        setProjects(projectList);
      } catch {
        setError('โหลดรายการโปรเจกต์ไม่สำเร็จ');
      }
    }

    loadProjects();
  }, []);

  // Sync local state with context
  useEffect(() => {
    if (selectedProjectId) setContextProjectId(selectedProjectId);
  }, [selectedProjectId]);
  useEffect(() => {
    if (contextProjectId && contextProjectId !== selectedProjectId) setSelectedProjectId(contextProjectId);
  }, [contextProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setPanels([]);
      return;
    }

    async function loadProjectAssets() {
      setLoading(true);
      setError('');
      try {
        const panelList = await getPanels(selectedProjectId);
        setPanels(panelList);
      } catch {
        setError('โหลดรายการอุปกรณ์ของโปรเจกต์ไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    }

    loadProjectAssets();
  }, [selectedProjectId]);

  // The variable from context will be `selectedProject` (the ID).
  // This derived object should be renamed to avoid collision, e.g., `selectedProjectData`
  const selectedProject = projects.find((project) => String(project.id) === String(selectedProjectId)) || null;
  const loops = useMemo(
    () =>
      panels.flatMap((panel) =>
        (panel.loops || []).map((loop) => ({
          ...loop,
          panel_code: panel.panel_code,
          panel_name: panel.panel_name,
        })),
      ),
    [panels],
  );
  const meters = useMemo(
    () =>
      loops.flatMap((loop) =>
        (loop.meters || []).map((meter) => ({
          ...meter,
          loop_code: loop.loop_code,
          loop_name: loop.loop_name,
          panel_code: loop.panel_code,
          panel_name: loop.panel_name,
        })),
      ),
    [loops],
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <p style={s.eyebrow}>Admin Console</p>
          <h1 style={s.title}>QR Center</h1>
          <p style={s.copy}>
            สร้าง QR ตามโปรเจกต์เพื่อกันข้อมูลชนกันข้ามไซต์ และให้ลูกค้าหรือวิศวกรสแกนได้ตรงโปรเจกต์ตั้งแต่ครั้งแรก
          </p>
        </div>

        <div style={s.headerSide}>
          <label style={s.fieldLabel}>
            <span>เลือกโปรเจกต์</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              style={s.select}
            >
              <option value="">เลือกโปรเจกต์</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <button onClick={() => setSelectedProjectId('')} style={s.changeProjectButton}>เปลี่ยนโปรเจ็กต์</button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.statsRow}>
        <div style={s.statCard}>
          <span style={s.statLabel}>Project</span>
          <strong style={s.statValue}>{selectedProject ? 1 : 0}</strong>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>Panels</span>
          <strong style={s.statValue}>{panels.length}</strong>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>Loops</span>
          <strong style={s.statValue}>{loops.length}</strong>
        </div>
        <div style={s.statCard}>
          <span style={s.statLabel}>Meters</span>
          <strong style={s.statValue}>{meters.length}</strong>
        </div>
      </div>

      <div style={s.tipBox}>
        <ScanLine size={18} />
        <div>
          <strong style={s.tipTitle}>วิธีใช้ที่แนะนำ</strong>
          <p style={s.tipCopy}>
            พิมพ์ `Project QR` สำหรับตั้งค่าหน้างานครั้งแรก และพิมพ์ `Panel / Loop / Meter QR` สำหรับติดที่อุปกรณ์จริง
          </p>
        </div>
      </div>

      <div style={s.tabRow}>
        {entityTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            style={activeTab === id ? s.tabActive : s.tab}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {!selectedProject && (
        <div style={s.emptyState}>
          เลือกโปรเจกต์ก่อนเพื่อแสดง QR ที่ผูกกับโปรเจกต์นั้น
        </div>
      )}

      {selectedProject && activeTab === 'project' && (
        <div style={s.grid}>
          <div style={s.card}>
            <img src={qrUrlFor('project', selectedProject.id)} alt={selectedProject.name} style={s.qrImage} />
            <div style={s.cardBody}>
              <h3 style={s.cardTitle}>{selectedProject.name}</h3>
              <CardMeta label="Location" value={selectedProject.location} />
              <CardMeta label="Customer" value={selectedProject.customer?.name} />
              <p style={s.cardHint}>
                ใช้ QR นี้สำหรับผูกเครื่องลูกค้ากับโปรเจกต์นี้ครั้งแรก เพื่อให้การค้นหา OCR และ serial จำกัดอยู่ในโปรเจกต์เดียว
              </p>
            </div>
            <a href={qrUrlFor('project', selectedProject.id)} download={downloadNameFor('project', selectedProject)} style={s.downloadBtn}>
              <Download size={16} />
              <span>ดาวน์โหลด</span>
            </a>
          </div>
        </div>
      )}

      {selectedProject && activeTab === 'panel' && (
        <EntityGrid
          items={panels}
          type="panel"
          loading={loading}
          renderMeta={(panel) => (
            <>
              <CardMeta label="Panel Code" value={panel.panel_code} />
              <CardMeta label="Serial" value={panel.serial_number} />
              <CardMeta label="Location" value={panel.location_note} />
            </>
          )}
        />
      )}

      {selectedProject && activeTab === 'loop' && (
        <EntityGrid
          items={loops}
          type="loop"
          loading={loading}
          renderMeta={(loop) => (
            <>
              <CardMeta label="Panel" value={loop.panel_code} />
              <CardMeta label="Loop Code" value={loop.loop_code} />
              <CardMeta label="Converter IP" value={loop.converter_ip} />
            </>
          )}
        />
      )}

      {selectedProject && activeTab === 'meter' && (
        <EntityGrid
          items={meters}
          type="meter"
          loading={loading}
          renderMeta={(meter) => (
            <>
              <CardMeta label="Panel / Loop" value={`${meter.panel_code || '-'} / ${meter.loop_code || '-'}`} />
              <CardMeta label="Meter Code" value={meter.meter_code} />
              <CardMeta label="Serial" value={meter.serial_number} />
            </>
          )}
        />
      )}
    </div>
  );
}

function EntityGrid({ items, type, loading, renderMeta }) {
  if (loading) {
    return <div style={s.emptyState}>กำลังโหลดข้อมูล...</div>;
  }

  if (!items.length) {
    return <div style={s.emptyState}>ยังไม่มีข้อมูลสำหรับสร้าง QR ในหมวดนี้</div>;
  }

  return (
    <div style={s.grid}>
      {items.map((item) => (
        <div key={item.id} style={s.card}>
          <img src={qrUrlFor(type, item.id)} alt={`${type}-${item.id}`} style={s.qrImage} />
          <div style={s.cardBody}>
            <h3 style={s.cardTitle}>{item.meter_name || item.loop_name || item.panel_name || item.name}</h3>
            {renderMeta(item)}
          </div>
          <a href={qrUrlFor(type, item.id)} download={downloadNameFor(type, item)} style={s.downloadBtn}>
            <Download size={16} />
            <span>ดาวน์โหลด</span>
          </a>
        </div>
      ))}
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: 1280,
    margin: '0 auto',
    padding: 'clamp(16px, 3vw, 28px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#64748b',
  },
  title: {
    margin: '6px 0 8px',
    fontSize: 'clamp(24px, 4vw, 34px)',
    fontWeight: 800,
    color: '#0f172a',
  },
  copy: {
    margin: 0,
    maxWidth: 720,
    color: '#475569',
    lineHeight: 1.7,
  },
  headerSide: {
    minWidth: 280,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: '#334155',
  },
  select: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid #cbd5e1',
    background: '#fff',
    fontSize: 14,
    color: '#0f172a',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 12,
  },
  statCard: {
    padding: '16px 18px',
    borderRadius: 18,
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#0f172a',
  },
  tipBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '16px 18px',
    borderRadius: 18,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
  },
  tipTitle: {
    display: 'block',
    marginBottom: 4,
  },
  tipCopy: {
    margin: 0,
    color: '#1e40af',
    lineHeight: 1.6,
  },
  error: {
    padding: '12px 14px',
    borderRadius: 14,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontWeight: 600,
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#475569',
    cursor: 'pointer',
    fontWeight: 700,
  },
  tabActive: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid #1d4ed8',
    background: '#1d4ed8',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 18,
    borderRadius: 20,
    background: '#fff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
  },
  qrImage: {
    width: '100%',
    maxWidth: 220,
    alignSelf: 'center',
    aspectRatio: '1 / 1',
    objectFit: 'contain',
    borderRadius: 16,
    background: '#fff',
    border: '1px solid #e2e8f0',
    padding: 12,
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: '#0f172a',
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'baseline',
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
  },
  metaValue: {
    fontSize: 13,
    color: '#1e293b',
    textAlign: 'right',
  },
  cardHint: {
    margin: '8px 0 0',
    fontSize: 13,
    lineHeight: 1.6,
    color: '#475569',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 14px',
    borderRadius: 14,
    background: '#0f172a',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  emptyState: {
    padding: '36px 20px',
    borderRadius: 18,
    background: '#fff',
    border: '1px dashed #cbd5e1',
    color: '#64748b',
    textAlign: 'center',
    fontWeight: 600,
  },
};
