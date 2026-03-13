import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReportViewer from '../../components/ReportViewer';
import { getDashboardStats, getProjects } from '../../api/projectApi';
import { getReports } from '../../api/reportApi';
import { getServiceJobs } from '../../api/serviceApi';
import { colors, font, space, radius, shadow, card, text, badge, alert, table, pageStyle } from '../../theme';

function Dashboard() {
  const [stats, setStats] = useState({ customers: 0, projects: 0, panels: 0, meters: 0, service_jobs: 0, completed_services: 0, reports: 0 });
  const [projects, setProjects] = useState([]);
  const [serviceJobs, setServiceJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const workbookReadyCount = projects.filter((p) => p.project_workbook_file_path).length;

  useEffect(() => {
    async function load() {
      try {
        const [s, p, j, r] = await Promise.all([getDashboardStats(), getProjects(), getServiceJobs(), getReports()]);
        setStats(s); setProjects(p); setServiceJobs(j); setReports(r);
      } catch { setError('โหลดข้อมูลไม่สำเร็จ'); }
    }
    load();
  }, []);

  const statItems = [
    { label: 'ลูกค้า', value: stats.customers, sub: `${stats.projects} โปรเจกต์`, icon: '🏢' },
    { label: 'แผง', value: stats.panels, sub: `${stats.meters} มิเตอร์`, icon: '⚡' },
    { label: 'Workbook', value: workbookReadyCount, sub: `จาก ${stats.projects} โปรเจกต์`, icon: '📄' },
    { label: 'งานเสร็จ', value: stats.completed_services, sub: `${stats.reports} รายงาน`, icon: '✅' },
  ];

  return (
    <div style={{ ...pageStyle, maxWidth: 1200 }}>
      {error && <div style={{ ...alert.base, ...alert.error }}>{error}</div>}

      {/* Stats */}
      <div className="ems-stats-row">
        {statItems.map((item) => (
          <div key={item.label} style={s.statCard}>
            <span style={s.statIcon}>{item.icon}</span>
            <strong style={s.statValue}>{item.value}</strong>
            <span style={s.statLabel}>{item.label}</span>
            <span style={{ fontSize: font.size.xs, color: colors.textMuted }}>{item.sub}</span>
          </div>
        ))}
      </div>

      {/* Shortcuts */}
      <div className="ems-two-col">
        <Link to="/admin/projects" style={s.shortcut}>
          <div style={{ ...s.shortcutIconWrap, background: colors.primaryLight, border: `1px solid ${colors.primaryBorder}` }}>
            🗂️
          </div>
          <div>
            <strong style={{ color: colors.primaryDark, fontSize: font.size.base, display: 'block', fontWeight: font.weight.semi }}>
              จัดการโปรเจกต์
            </strong>
            <p style={{ margin: '3px 0 0', fontSize: font.size.sm, color: colors.textSub }}>
              สร้างลูกค้า, อัปโหลด workbook
            </p>
          </div>
        </Link>
        <Link to="/admin/reports" style={s.shortcut}>
          <div style={{ ...s.shortcutIconWrap, background: colors.successLight, border: `1px solid ${colors.successBorder}` }}>
            📝
          </div>
          <div>
            <strong style={{ color: colors.success, fontSize: font.size.base, display: 'block', fontWeight: font.weight.semi }}>
              ออกรายงาน
            </strong>
            <p style={{ margin: '3px 0 0', fontSize: font.size.sm, color: colors.textSub }}>
              สร้างงาน PM/MA และส่งออกไฟล์
            </p>
          </div>
        </Link>
      </div>

      {/* Projects + Jobs */}
      <div className="ems-two-col">
        <div style={card}>
          <h3 style={text.cardTitle}>โปรเจกต์ล่าสุด</h3>
          <div className="ems-table-scroll">
            <table style={table.table}>
              <thead>
                <tr>
                  {['โปรเจกต์', 'ลูกค้า', 'สถานที่', 'Workbook'].map((h) => (
                    <th key={h} style={table.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 6).map((p) => (
                  <tr key={p.id} style={table.tr} className="ems-tr">
                    <td style={table.td}>{p.name}</td>
                    <td style={table.td}>{p.customer?.name || '—'}</td>
                    <td style={table.td}>{p.location}</td>
                    <td style={table.td}>
                      <span style={p.project_workbook_file_path ? badge.green : badge.gray}>
                        {p.project_workbook_file_path ? 'พร้อม' : 'ยังไม่มี'}
                      </span>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr><td colSpan={4} style={table.empty}>ยังไม่มีโปรเจกต์</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h3 style={text.cardTitle}>งานบริการล่าสุด</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {serviceJobs.slice(0, 6).map((job) => (
              <div key={job.id} style={s.jobItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: font.size.base, color: colors.text, display: 'block' }}>
                    {job.service_type}
                  </strong>
                  <p style={{ margin: '2px 0 0', fontSize: font.size.sm, color: colors.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {job.note || 'ไม่มีหมายเหตุ'}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={job.status === 'Completed' ? badge.green : badge.orange}>
                    {job.status === 'Completed' ? 'เสร็จ' : 'รอ'}
                  </span>
                  <p style={{ margin: '4px 0 0', fontSize: font.size.xs, color: colors.textMuted }}>
                    {new Date(job.service_date).toLocaleDateString('th-TH')}
                  </p>
                </div>
              </div>
            ))}
            {serviceJobs.length === 0 && (
              <p style={{ color: colors.textMuted, fontSize: font.size.base, textAlign: 'center', padding: '20px 0', margin: 0 }}>
                ยังไม่มีงานบริการ
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reports */}
      <div style={card}>
        <h3 style={text.cardTitle}>ไฟล์รายงานล่าสุด</h3>
        <ReportViewer
          reports={reports.slice(0, 8)}
          title=""
          description="ไฟล์ PDF และ Excel ที่ generate แล้ว"
          emptyMessage="ยังไม่มีไฟล์รายงาน — เสร็จงานบริการครั้งแรกแล้วจะมีไฟล์ที่นี่"
        />
      </div>
    </div>
  );
}

const s = {
  statCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: `${space.xl}px ${space.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    textAlign: 'center',
    boxShadow: shadow.sm,
  },
  statIcon:  { fontSize: 24, marginBottom: space.xs },
  statValue: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text },
  statLabel: { fontSize: font.size.sm, color: colors.textSub, fontWeight: font.weight.semi },

  shortcut: {
    display: 'flex',
    alignItems: 'center',
    gap: space.lg,
    padding: `${space.xl}px`,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    textDecoration: 'none',
    boxShadow: shadow.sm,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  shortcutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
  },

  jobItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
    paddingBottom: space.sm,
    borderBottom: `1px solid ${colors.bgMuted}`,
  },
};

export default Dashboard;
