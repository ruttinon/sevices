/**
 * EMS Design System — theme.js
 * Clean White + Blue · Minimal & Consistent
 */

// ─── Colors ────────────────────────────────────────────────────────────────────
export const colors = {
  // Brand blue
  primary:       '#2563eb',
  primaryDark:   '#1d4ed8',
  primaryLight:  '#eff6ff',
  primaryBorder: '#bfdbfe',

  // Accent (scan / CTA)
  accent:        '#f97316',
  accentDark:    '#ea580c',
  accentLight:   '#fff7ed',

  // Semantic
  success:       '#16a34a',
  successLight:  '#dcfce7',
  successBorder: '#86efac',

  warning:       '#d97706',
  warningLight:  '#fffbeb',
  warningBorder: '#fcd34d',

  danger:        '#dc2626',
  dangerLight:   '#fef2f2',
  dangerBorder:  '#fecaca',

  // Neutrals
  text:          '#111827',
  textMid:       '#374151',
  textSub:       '#6b7280',
  textMuted:     '#9ca3af',

  border:        '#e5e7eb',
  borderMid:     '#d1d5db',

  bg:            '#f9fafb',
  bgCard:        '#ffffff',
  bgMuted:       '#f3f4f6',
  bgHover:       '#f8fafc',

  // Hero gradients
  heroBlue:      'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
  heroGreen:     'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
  heroOrange:    'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
};

// ─── Typography ────────────────────────────────────────────────────────────────
export const font = {
  family: "'Sarabun', 'Segoe UI', system-ui, sans-serif",
  size: {
    xs:   11,
    sm:   12,
    base: 14,
    md:   16,
    lg:   18,
    xl:   22,
    h2:   24,
    h1:   28,
  },
  weight: {
    regular: 400,
    medium:  500,
    semi:    600,
    bold:    700,
  },
};

// ─── Spacing ───────────────────────────────────────────────────────────────────
export const space = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
};

export const radius = {
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  20,
  full: 9999,
};

// ─── Shadows ───────────────────────────────────────────────────────────────────
export const shadow = {
  sm:  '0 1px 3px rgba(0,0,0,0.06)',
  md:  '0 2px 8px rgba(0,0,0,0.08)',
  lg:  '0 4px 16px rgba(0,0,0,0.10)',
  xl:  '0 8px 32px rgba(0,0,0,0.12)',
};

// ─── Page wrappers ─────────────────────────────────────────────────────────────
export const pageStyle = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '28px 20px 56px',
  fontFamily: font.family,
  display: 'flex',
  flexDirection: 'column',
  gap: space.xl,
  background: colors.bg,
  minHeight: '100vh',
};

export const pageNarrow = {
  ...pageStyle,
  maxWidth: 820,
};

// ─── Card ──────────────────────────────────────────────────────────────────────
export const card = {
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: space.xl,
  boxShadow: shadow.sm,
};

// ─── Hero banner ───────────────────────────────────────────────────────────────
export const hero = {
  background: colors.heroBlue,
  borderRadius: radius.xl,
  padding: `${space.xxxl}px 28px`,
  color: '#fff',
};

// ─── Text helpers ──────────────────────────────────────────────────────────────
export const text = {
  eyebrow: {
    margin: `0 0 ${space.xs}px`,
    fontSize: font.size.xs,
    fontWeight: font.weight.semi,
    color: colors.textSub,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  pageTitle: {
    margin: 0,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  cardTitle: {
    margin: `0 0 ${space.lg}px`,
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semi,
    color: colors.textMid,
  },
  muted: {
    fontSize: font.size.sm,
    color: colors.textMuted,
  },
};

// ─── Tab bar ───────────────────────────────────────────────────────────────────
export const tabBar = {
  display: 'flex',
  gap: 2,
  background: colors.bgMuted,
  padding: 4,
  borderRadius: radius.lg,
  width: 'fit-content',
  flexWrap: 'wrap',
};

export const tabBtn = {
  padding: `${space.sm + 1}px ${space.lg + 2}px`,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.md,
  fontWeight: font.weight.medium,
  fontSize: font.size.base,
  color: colors.textSub,
  cursor: 'pointer',
  fontFamily: font.family,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s',
};

export const tabBtnActive = {
  ...tabBtn,
  background: colors.bgCard,
  color: colors.text,
  fontWeight: font.weight.bold,
  boxShadow: shadow.sm,
};

// ─── Buttons ───────────────────────────────────────────────────────────────────
export const btn = {
  primary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: `${space.md - 1}px ${space.xxl}px`,
    background: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontWeight: font.weight.semi,
    cursor: 'pointer',
    fontFamily: font.family,
    transition: 'background 0.15s',
  },
  secondary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: `${space.md - 1}px ${space.xl}px`,
    background: colors.bgCard,
    color: colors.textMid,
    border: `1.5px solid ${colors.borderMid}`,
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    cursor: 'pointer',
    fontFamily: font.family,
    textDecoration: 'none',
    transition: 'border-color 0.15s',
  },
  success: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: `${space.md - 1}px ${space.xxl}px`,
    background: colors.success,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontWeight: font.weight.semi,
    cursor: 'pointer',
    fontFamily: font.family,
  },
  accent: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: `${space.md - 1}px ${space.xxl}px`,
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontWeight: font.weight.semi,
    cursor: 'pointer',
    fontFamily: font.family,
  },
  tiny: {
    padding: `${space.xs + 1}px ${space.md}px`,
    background: colors.bgCard,
    color: colors.textMid,
    border: `1px solid ${colors.borderMid}`,
    borderRadius: radius.sm,
    fontSize: font.size.xs,
    cursor: 'pointer',
    fontFamily: font.family,
    whiteSpace: 'nowrap',
  },
  ghost: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: `${space.md - 1}px ${space.xl}px`,
    background: colors.bgMuted,
    color: colors.textMid,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    cursor: 'pointer',
    fontFamily: font.family,
  },
};

// ─── Form inputs ───────────────────────────────────────────────────────────────
export const input = {
  base: {
    padding: `${space.sm + 1}px ${space.md}px`,
    border: `1.5px solid ${colors.borderMid}`,
    borderRadius: radius.md,
    fontSize: font.size.base,
    fontFamily: font.family,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    color: colors.text,
    background: colors.bgCard,
    transition: 'border-color 0.15s',
  },
};

// ─── Badges ────────────────────────────────────────────────────────────────────
export const badge = {
  green:  { background: colors.successLight, color: colors.success,    padding: `2px ${space.sm}px`, borderRadius: radius.full, fontSize: font.size.xs, fontWeight: font.weight.semi, display: 'inline-block' },
  gray:   { background: colors.bgMuted,      color: colors.textMid,    padding: `2px ${space.sm}px`, borderRadius: radius.full, fontSize: font.size.xs, fontWeight: font.weight.semi, display: 'inline-block' },
  orange: { background: colors.warningLight, color: colors.warning,    padding: `2px ${space.sm}px`, borderRadius: radius.full, fontSize: font.size.xs, fontWeight: font.weight.semi, display: 'inline-block' },
  blue:   { background: colors.primaryLight, color: colors.primaryDark, padding: `2px ${space.sm}px`, borderRadius: radius.full, fontSize: font.size.xs, fontWeight: font.weight.semi, display: 'inline-block' },
  red:    { background: colors.dangerLight,  color: colors.danger,     padding: `2px ${space.sm}px`, borderRadius: radius.full, fontSize: font.size.xs, fontWeight: font.weight.semi, display: 'inline-block' },
};

// ─── Alert banners ─────────────────────────────────────────────────────────────
export const alert = {
  base:    { borderRadius: radius.md, padding: `${space.md}px ${space.lg}px`, fontSize: font.size.base },
  error:   { background: colors.dangerLight,  border: `1px solid ${colors.dangerBorder}`,  color: colors.danger    },
  success: { background: '#f0fdf4',            border: `1px solid ${colors.successBorder}`, color: colors.success   },
  info:    { background: colors.primaryLight,  border: `1px solid ${colors.primaryBorder}`, color: colors.primaryDark },
  warning: { background: colors.warningLight,  border: `1px solid ${colors.warningBorder}`, color: colors.warning   },
};

// ─── Table ─────────────────────────────────────────────────────────────────────
export const table = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: font.size.base },
  th:    { textAlign: 'left', padding: `${space.sm + 1}px ${space.md}px`, fontSize: font.size.xs, color: colors.textSub, borderBottom: `1.5px solid ${colors.bgMuted}`, fontWeight: font.weight.semi, whiteSpace: 'nowrap', background: colors.bgMuted },
  tr:    { borderBottom: `1px solid ${colors.bgMuted}`, transition: 'background 0.1s' },
  td:    { padding: `${space.md - 1}px ${space.md}px`, color: colors.textMid, verticalAlign: 'middle' },
  empty: { padding: 32, textAlign: 'center', color: colors.textMuted, fontSize: font.size.base },
};

// ─── Stat card ─────────────────────────────────────────────────────────────────
export const statCard = {
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: `${space.lg}px ${space.md + 2}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  boxShadow: shadow.sm,
};

// ─── Global CSS ────────────────────────────────────────────────────────────────
export const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'Sarabun', 'Segoe UI', system-ui, sans-serif;
    background: #f9fafb;
    color: #111827;
    margin: 0;
  }
  a { color: inherit; }
  button { font-family: inherit; }

  /* Responsive two-column grid */
  .ems-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .ems-two-col { grid-template-columns: 1fr; } }

  /* Four-column stats */
  .ems-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 900px) { .ems-stats-row { grid-template-columns: repeat(2, 1fr); } }

  /* Panel grid */
  .ems-panel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  @media (max-width: 480px) { .ems-panel-grid { grid-template-columns: 1fr; } }

  /* Table scroll */
  .ems-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  /* Tab bar */
  .ems-tab-bar { display: flex; flex-wrap: wrap; gap: 2px; background: #f3f4f6; padding: 4px; border-radius: 12px; width: fit-content; max-width: 100%; }
  @media (max-width: 480px) { .ems-tab-bar { width: 100%; } .ems-tab-bar button { flex: 1; } }

  /* Hover effects on table rows */
  .ems-tr:hover { background: #f8fafc; }

  /* Fade-up animation */
  @keyframes ems-fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .ems-fade-up { animation: ems-fade-up 0.2s ease both; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .ems-spin { animation: spin 1s linear infinite; }

  /* Focus ring for inputs */
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #2563eb !important;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
`;