import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout';
import ReportViewer from '../../components/ReportViewer';
import { getPublicPanel } from '../../api/assetApi';
import { colors, font, space, radius, shadow, card, text, badge, hero, tabBtn, tabBtnActive, alert } from '../../theme';

function PanelView() {
  const { panelId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('structure');

  useEffect(() => {
    async function load() {
      try { setData(await getPublicPanel(panelId)); }
      catch { setError('โหลดข้อมูลตู้ควบคุมไม่สำเร็จ'); }
    }
    load();
  }, [panelId]);

  const actions = [];

  return (
    <CustomerLayout
      title={data?.panel?.panel_name || `Panel ${panelId}`}
      subtitle={data ? `${data.project.name} · ${data.project.location}` : undefined}
      backTo="/customer"
      actions={actions}
    >
      {/* Hero */}
      <div style={{ ...hero, background: colors.heroGreen }}>
        <p style={{ ...text.eyebrow, color: 'rgba(255,255,255,0.65)' }}>ตู้ควบคุม</p>
        <h1 style={{ margin: '4px 0 6px', fontSize: font.size.h1, fontWeight: font.weight.bold }}>
          {data?.panel?.panel_name || `Panel ${panelId}`}
        </h1>
        {data && (
          <p style={{ margin: 0, fontSize: font.size.sm, opacity: 0.8 }}>
            {data.project.name} · {data.project.location}
          </p>
        )}
      </div>

      {error && <div style={{ ...alert.base, ...alert.error }}>{error}</div>}

      {data && (
        <>
          {/* Stats */}
          <div className="ems-stats-row">
            <StatCard label="Panel Code"  value={data.panel.panel_code}       sub={data.panel.serial_number || '—'} />
            <StatCard label="Loops"       value={data.loops.length}           sub="วงจร" />
            <StatCard label="ประวัติงาน" value={data.service_history.length} sub="รายการ" />
            <StatCard label="รายงาน"     value={data.reports.length}         sub="ไฟล์" />
          </div>

          {/* Tabs */}
          <div className="ems-tab-bar">
            <TabBtn id="structure" active={activeTab} label="โครงสร้าง"                                  onClick={setActiveTab} />
            <TabBtn id="history"   active={activeTab} label={`ประวัติ (${data.service_history.length})`} onClick={setActiveTab} />
            <TabBtn id="reports"   active={activeTab} label={`รายงาน (${data.reports.length})`}           onClick={setActiveTab} />
          </div>

          {/* Structure */}
          {activeTab === 'structure' && (
            <div style={card}>
              {data.loops.length === 0 && (
                <p style={{ color: colors.textMuted, textAlign: 'center', padding: '16px 0', margin: 0 }}>
                  ยังไม่มี Loop ในตู้นี้
                </p>
              )}
              {data.loops.map((loop, idx) => (
                <div
                  key={loop.id}
                  style={{
                    ...s.loopBlock,
                    borderBottom: idx < data.loops.length - 1 ? `1px solid ${colors.bgMuted}` : 'none',
                  }}
                >
                  <div style={s.loopHeader}>
                    <div style={s.loopIcon}>🔁</div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: font.size.base, fontWeight: font.weight.bold, color: colors.text }}>
                        {loop.loop_name}
                      </strong>
                      <span style={{ display: 'block', fontSize: font.size.sm, color: colors.textSub, marginTop: 1 }}>
                        {loop.loop_code}{loop.converter_ip ? ` · ${loop.converter_ip}` : ''}
                      </span>
                    </div>
                    <span style={{ ...badge.blue, flexShrink: 0 }}>{loop.meters.length} meters</span>
                  </div>

                  {loop.meters.length > 0 && (
                    <div className="ems-table-scroll">
                      <table style={s.innerTable}>
                        <thead>
                          <tr>
                            {['Meter', 'Code', 'Serial', 'Model', 'สถานะ'].map((h) => (
                              <th key={h} style={s.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {loop.meters.map((m) => (
                            <tr
                              key={m.id}
                              style={{ borderBottom: `1px solid ${colors.bgMuted}`, cursor: 'pointer' }}
                              onClick={() => navigate(`/customer/online-report/meter/${m.id}`)}
                              className="ems-table-row-hover"
                            >
                              <td style={s.td}>{m.meter_name}</td>
                              <td style={s.td}>{m.meter_code}</td>
                              <td style={s.td}>{m.serial_number || '—'}</td>
                              <td style={s.td}>{m.model || '—'}</td>
                              <td style={s.td}>
                                <span style={m.status === 'Active' ? badge.green : badge.gray}>{m.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <div style={card}>
              {data.service_history.length === 0 && (
                <p style={{ color: colors.textMuted, textAlign: 'center', padding: '16px 0', margin: 0 }}>
                  ยังไม่มีประวัติการบำรุงรักษา
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                {data.service_history.map((job) => (
                  <div key={job.id} style={s.jobItem}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.md }}>
                      <span style={{ ...badge.gray, flexShrink: 0, marginTop: 2 }}>{job.service_type}</span>
                      <div>
                        <strong style={{ fontSize: font.size.base, color: colors.text, display: 'block' }}>
                          {job.meter_name || 'ทั้งตู้'}
                        </strong>
                        <p style={{ margin: '2px 0 0', fontSize: font.size.sm, color: colors.textSub }}>
                          {job.note || 'ไม่มีหมายเหตุ'}
                        </p>
                      </div>
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
              </div>
            </div>
          )}

          {/* Reports */}
          {activeTab === 'reports' && (
            <div style={card}>
              <ReportViewer
                reports={data.reports}
                title=""
                description="ดาวน์โหลดไฟล์ PDF และ Excel"
                emptyMessage="ยังไม่มีรายงานสำหรับตู้นี้"
              />
            </div>
          )}
        </>
      )}

      {!data && !error && (
        <p style={{ textAlign: 'center', color: colors.textMuted, padding: 40 }}>กำลังโหลด...</p>
      )}
    </CustomerLayout>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={s.statCard}>
      <strong style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text }}>{value}</strong>
      <span style={{ fontSize: font.size.xs, color: colors.textSub, fontWeight: font.weight.semi }}>{label}</span>
      {sub && <span style={{ fontSize: font.size.xs, color: colors.textMuted }}>{sub}</span>}
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

const s = {
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.xs,
    color: colors.textSub,
    fontSize: font.size.sm,
    textDecoration: 'none',
    fontWeight: font.weight.medium,
  },
  statCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: `${space.lg}px ${space.md}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  loopBlock: {
    paddingBottom: space.xl,
    marginBottom: space.xl,
  },
  loopHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  loopIcon: {
    width: 34,
    height: 34,
    background: colors.successLight,
    borderRadius: radius.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0,
    border: `1px solid ${colors.successBorder}`,
  },
  innerTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: font.size.sm,
  },
  th: {
    textAlign: 'left',
    padding: `${space.sm}px ${space.md}px`,
    fontSize: font.size.xs,
    color: colors.textSub,
    borderBottom: `1.5px solid ${colors.bgMuted}`,
    fontWeight: font.weight.semi,
    background: colors.bgMuted,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${space.sm + 1}px ${space.md}px`,
    color: colors.textMid,
    borderBottom: `1px solid ${colors.bgMuted}`,
  },
  jobItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingBottom: space.md,
    borderBottom: `1px solid ${colors.bgMuted}`,
  },
};

export default PanelView;