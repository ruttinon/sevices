import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLoops, getMeterDetail, getPanels } from '../../api/assetApi';
import { colors, font, space, radius, shadow, badge, alert, btn } from '../../theme';

const pageStyle = {
  maxWidth: 520,
  margin: '0 auto',
  padding: `${space.xl}px ${space.lg}px 80px`,
  fontFamily: font.family,
  background: colors.bg,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: space.xl,
};

function AssetDetail() {
  const { assetType, assetId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setError('');
        if (assetType === 'meter') { setData(await getMeterDetail(assetId)); return; }
        if (assetType === 'panel') {
          const panels = await getPanels();
          const panel = panels.find((p) => String(p.id) === assetId);
          if (!panel) throw new Error();
          setData({ panel }); return;
        }
        if (assetType === 'loop') {
          const loops = await getLoops();
          const loop = loops.find((l) => String(l.id) === assetId);
          if (!loop) throw new Error();
          setData({ loop }); return;
        }
        throw new Error();
      } catch { setError('โหลดข้อมูลอุปกรณ์ไม่สำเร็จ'); }
    }
    load();
  }, [assetId, assetType]);

  const meter = data?.meter;
  const panel = data?.panel;
  const loop  = data?.loop;

  if (error) return (
    <div style={pageStyle}>
      <div style={{ ...alert.base, ...alert.error, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: space.sm }}>⚠️</div>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={pageStyle}>
      <div style={{ ...s.card, textAlign: 'center', padding: `${space.xxxl + 8}px ${space.xl}px` }}>
        <p style={{ color: colors.textMuted, fontSize: font.size.base, margin: 0 }}>กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div>
        <p style={{ margin: `0 0 ${space.xs}px`, fontSize: font.size.xs, fontWeight: font.weight.semi, color: colors.textSub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {assetType === 'meter' ? 'มิเตอร์' : assetType === 'panel' ? 'ตู้ Panel' : 'Loop'}
        </p>
        <h1 style={{ fontSize: font.size.h2, fontWeight: font.weight.bold, color: colors.text, margin: `0 0 2px` }}>
          {meter?.meter_name || panel?.panel_name || loop?.loop_name || 'รายละเอียดอุปกรณ์'}
        </h1>
        <p style={{ margin: 0, fontSize: font.size.base, color: colors.textSub }}>
          {meter?.meter_code || panel?.panel_code || loop?.loop_code}
        </p>
      </div>

      {/* CTA */}
      {meter && (
        <Link
          to={`/engineer/service/new?projectId=${data.project.id}&meterId=${meter.id}`}
          style={{ ...btn.primary, textDecoration: 'none', textAlign: 'center', justifyContent: 'center' }}
        >
          + สร้างงาน PM / MA
        </Link>
      )}

      {/* Meter detail */}
      {meter && (
        <>
          {/* Breadcrumb */}
          <div style={s.breadcrumb}>
            <span style={s.crumbItem}>{data.project.name}</span>
            <span style={s.crumbSep}>›</span>
            <span style={s.crumbItem}>{data.panel.panel_code}</span>
            <span style={s.crumbSep}>›</span>
            <span style={s.crumbItem}>{data.loop.loop_code}</span>
          </div>

          {/* Specs */}
          <div style={s.specGrid}>
            <SpecCard icon="🔢" label="Serial"    value={meter.serial_number || '—'} />
            <SpecCard icon="📟" label="Model"     value={meter.model || '—'} />
            <SpecCard icon="📍" label="Address"   value={meter.device_address || '—'} />
            <SpecCard icon="⚡" label="CT Ratio"  value={meter.ct_ratio || '—'} />
            <SpecCard icon="📶" label="Baud Rate" value={meter.baud_rate || '—'} />
            <SpecCard icon="🌐" label="IP"        value={data.loop.converter_ip || '—'} />
          </div>

          {/* Status */}
          <div style={meter.status === 'active' ? s.statusActive : s.statusInactive}>
            สถานะ: <strong>{meter.status}</strong>
          </div>

          {/* Service History */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
              <p style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, margin: 0 }}>
                ประวัติการบำรุงรักษา
              </p>
              <span style={badge.gray}>{data.service_history.length} ครั้ง</span>
            </div>

            {data.service_history.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', color: colors.textMuted, fontSize: font.size.base }}>
                ยังไม่มีประวัติการซ่อมบำรุง
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                {data.service_history.map((h) => (
                  <div key={h.id} style={s.historyCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                      <span style={h.status === 'Completed' ? badge.green : badge.orange}>
                        {h.service_type}
                      </span>
                      <span style={{ fontSize: font.size.sm, color: colors.textSub, flex: 1 }}>{h.status}</span>
                      <time style={{ fontSize: font.size.sm, color: colors.textMuted }}>
                        {new Date(h.service_date).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' })}
                      </time>
                    </div>
                    {h.engineer_name && (
                      <p style={{ fontSize: font.size.sm, color: colors.textMid, margin: 0 }}>👷 {h.engineer_name}</p>
                    )}
                    {h.note && (
                      <p style={{ fontSize: font.size.sm, color: colors.textSub, margin: 0, lineHeight: 1.5 }}>{h.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Panel detail */}
      {!meter && panel && (
        <div style={s.card}>
          <DetailRow label="Panel code"  value={panel.panel_code} />
          <DetailRow label="Serial"      value={panel.serial_number || '—'} />
          <DetailRow label="ตำแหน่ง"    value={panel.location_note || '—'} />
          <DetailRow label="จำนวน Loop" value={`${panel.loops?.length || 0} loop`} />
        </div>
      )}

      {/* Loop detail */}
      {!meter && !panel && loop && (
        <div style={s.card}>
          <DetailRow label="Loop code"      value={loop.loop_code} />
          <DetailRow label="Converter"      value={loop.converter_name || '—'} />
          <DetailRow label="IP address"     value={loop.converter_ip || '—'} />
          <DetailRow label="จำนวนมิเตอร์" value={`${loop.meters?.length || 0} ตัว`} />
        </div>
      )}
    </div>
  );
}

function SpecCard({ icon, label, value }) {
  return (
    <div style={s.specCard}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <p style={{ fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.semi, textTransform: 'uppercase', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: font.size.sm, color: colors.text, fontWeight: font.weight.bold, margin: 0, wordBreak: 'break-all' }}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${space.md - 2}px 0`, borderBottom: `1px solid ${colors.bgMuted}` }}>
      <span style={{ fontSize: font.size.sm, color: colors.textSub, fontWeight: font.weight.medium }}>{label}</span>
      <span style={{ fontSize: font.size.base, color: colors.text, fontWeight: font.weight.semi }}>{value}</span>
    </div>
  );
}

const s = {
  card: {
    background: colors.bgCard,
    borderRadius: radius.lg,
    padding: space.xl,
    boxShadow: shadow.sm,
    border: `1px solid ${colors.border}`,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: space.xs,
    background: colors.bgMuted,
    borderRadius: radius.md,
    padding: `${space.sm + 2}px ${space.md}px`,
    border: `1px solid ${colors.border}`,
    flexWrap: 'wrap',
  },
  crumbItem: { fontSize: font.size.sm, color: colors.textMid, fontWeight: font.weight.medium },
  crumbSep:  { color: colors.textMuted, fontSize: font.size.md },
  specGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space.sm },
  specCard: {
    background: colors.bgCard,
    borderRadius: radius.md,
    padding: `${space.md}px ${space.sm}px`,
    textAlign: 'center',
    boxShadow: shadow.sm,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.xs / 2,
    border: `1px solid ${colors.border}`,
  },
  statusActive: {
    borderRadius: radius.md,
    padding: `${space.md - 2}px ${space.md}px`,
    background: colors.successLight,
    color: colors.success,
    border: `1px solid ${colors.successBorder}`,
    fontSize: font.size.base,
  },
  statusInactive: {
    borderRadius: radius.md,
    padding: `${space.md - 2}px ${space.md}px`,
    background: colors.bgMuted,
    color: colors.textSub,
    border: `1px solid ${colors.border}`,
    fontSize: font.size.base,
  },
  historyCard: {
    background: colors.bgCard,
    borderRadius: radius.md,
    padding: `${space.md}px ${space.lg}px`,
    boxShadow: shadow.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    border: `1px solid ${colors.border}`,
  },
};

export default AssetDetail;