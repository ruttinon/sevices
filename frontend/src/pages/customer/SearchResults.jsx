import { Link, Navigate, useLocation } from 'react-router-dom';
import CustomerLayout from '../../components/customer/CustomerLayout';
import { colors, font, space, radius, shadow, text, badge, btn } from '../../theme';

function resolveCustomerPath(result) {
  if (result?.entity_type === 'meter') return `/customer/online-report/meter/${result.entity_id}`;
  if (result?.entity_type === 'loop') return `/customer/online-report/loop/${result.entity_id}`;
  if (result?.panel_id) return `/customer/panel/${result.panel_id}`;
  if (result?.project_id) return `/customer/project/${result.project_id}`;
  return '/customer/scan';
}

function entityLabel(entityType) {
  const map = { panel: 'Panel', loop: 'Loop', meter: 'Meter', project: 'Project' };
  return map[entityType] || entityType || 'Result';
}

export default function SearchResults() {
  const location = useLocation();
  const results = Array.isArray(location.state?.results) ? location.state.results : [];

  if (results.length === 0) return <Navigate to="/customer/scan" replace />;

  return (
    <CustomerLayout
      title={`พบ ${results.length} รายการ`}
      subtitle="เลือกผลลัพธ์เพื่อดูรายละเอียด"
      backTo="/customer"
    >
      <div>
        <p style={text.eyebrow}>Search Results</p>
        <h1 style={{ ...text.pageTitle, marginBottom: space.xs }}>พบ {results.length} รายการ</h1>
        <p style={{ margin: 0, color: colors.textSub, fontSize: font.size.base }}>
          เลือกรายการที่ต้องการเปิดดูข้อมูล
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {results.map((result) => (
          <Link
            key={`${result.entity_type}-${result.entity_id}`}
            to={resolveCustomerPath(result)}
            style={s.card}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
              <span style={badge.blue}>{entityLabel(result.entity_type)}</span>
            </div>
            <strong style={{ color: colors.text, fontSize: font.size.md, display: 'block' }}>
              {result.title || '—'}
            </strong>
            <p style={{ margin: '4px 0 0', color: colors.textSub, fontSize: font.size.sm, lineHeight: 1.5 }}>
              {result.subtitle || 'ไม่มีรายละเอียดเพิ่มเติม'}
            </p>
            {result.project_name && (
              <p style={{ margin: '6px 0 0', color: colors.textMuted, fontSize: font.size.xs, lineHeight: 1.5 }}>
                โปรเจกต์: {result.project_name}
              </p>
            )}
            <span style={{ display: 'block', marginTop: space.sm, color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.semi }}>
              {result.entity_type === 'meter' || result.entity_type === 'loop'
                ? 'เปิดดูที่ตู้ Panel →'
                : 'เปิดดูรายละเอียด →'}
            </span>
          </Link>
        ))}
      </div>
    </CustomerLayout>
  );
}

const s = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: `${space.lg}px ${space.xl}px`,
    textDecoration: 'none',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'border-color 0.15s',
  },
};
