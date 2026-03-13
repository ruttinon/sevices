import { Link } from 'react-router-dom';
import { colors, font, space, pageNarrow, btn } from '../../theme';

export default function CustomerLayout({
  title,
  subtitle,
  children,
  backTo,
  actions,
  showScanButton = true,
  scanTo = '/customer/scan',
}) {
  return (
    <div style={pageNarrow}>
      <header style={s.header}>
        <div style={s.headLeft}>
          {backTo && (
            <Link to={backTo} style={s.backLink}>
              ← กลับ
            </Link>
          )}
          <div>
            {title && <h1 style={s.title}>{title}</h1>}
            {subtitle && <p style={s.subtitle}>{subtitle}</p>}
          </div>
        </div>

        <div style={s.actions}>
          {actions?.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={action.onClick}
              style={{ ...btn.primary, ...(action.danger ? s.dangerBtn : {}) }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          {showScanButton && (
            <Link to={scanTo} style={btn.secondary}>
              สแกน QR
            </Link>
          )}
        </div>
      </header>

      <main style={s.main}>{children}</main>
    </div>
  );
}

const s = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    marginBottom: space.xl,
    flexWrap: 'wrap',
  },
  headLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.md,
    minWidth: 0,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    color: colors.textMid,
    textDecoration: 'none',
    fontSize: font.size.sm,
    fontWeight: font.weight.semi,
  },
  title: {
    margin: 0,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  subtitle: {
    margin: `${space.xs}px 0 0`,
    fontSize: font.size.sm,
    color: colors.textSub,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  main: {
    width: '100%',
  },
  dangerBtn: {
    background: colors.danger,
  },
};
