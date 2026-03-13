import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginAdmin } from '../../api/authApi';
import { getApiErrorMessage } from '../../api/api';
import { saveAuthSession } from '../../utils/authSession';
import { colors, font, space, radius, shadow, alert, input, btn } from '../../theme';

function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = await loginAdmin(username.trim());
      saveAuthSession(session);
      navigate('/admin/dashboard', { replace: true });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'เข้าสู่ระบบไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.shell}>
      <div style={s.card}>
        {/* Logo mark */}
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>⚡</div>
        </div>

        <h1 style={s.title}>EMS Admin</h1>
        <p style={s.subtitle}>กรอก username เพื่อเข้าจัดการระบบ</p>

        {error && (
          <div style={{ ...alert.base, ...alert.error, textAlign: 'left', marginBottom: space.xl }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          <label style={s.label}>
            Username
            <input
              style={{ ...input.base, marginTop: space.xs }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="office-admin"
              required
              autoFocus
            />
          </label>

          <button
            style={{
              ...btn.primary,
              width: '100%',
              padding: `${space.md}px`,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <Link to="/" style={s.backLink}>← กลับหน้าสแกน</Link>
      </div>
    </div>
  );
}

const s = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.bg,
    fontFamily: font.family,
    padding: `${space.lg}px`,
  },
  card: {
    background: colors.bgCard,
    borderRadius: radius.xl,
    padding: `${space.xxxl + 8}px`,
    width: '100%',
    maxWidth: 380,
    boxShadow: shadow.xl,
    border: `1px solid ${colors.border}`,
    textAlign: 'center',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  logoIcon: {
    width: 52,
    height: 52,
    background: colors.primaryLight,
    borderRadius: radius.lg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    border: `1px solid ${colors.primaryBorder}`,
  },
  title: {
    margin: `0 0 ${space.xs}px`,
    fontSize: font.size.h2,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  subtitle: {
    margin: `0 0 ${space.xxl}px`,
    color: colors.textSub,
    fontSize: font.size.base,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    fontSize: font.size.sm,
    fontWeight: font.weight.semi,
    color: colors.textMid,
  },
  backLink: {
    display: 'inline-block',
    marginTop: space.xxl,
    color: colors.textSub,
    fontSize: font.size.sm,
    textDecoration: 'none',
  },
};

export default AdminLogin;
