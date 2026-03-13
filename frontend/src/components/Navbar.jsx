import { NavLink, useNavigate } from 'react-router-dom';
import { clearAuthSession, isAdminAuthenticated, readAuthSession } from '../utils/authSession';

function Navbar() {
  const navigate = useNavigate();
  const adminSignedIn = isAdminAuthenticated();
  const session = readAuthSession();

  function handleLogout() {
    clearAuthSession();
    navigate('/', { replace: true });
  }

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">EMS Platform</p>
        <h1 className="brand-title">EMS Scan</h1>
      </div>
      <div className="topbar-actions">
        {adminSignedIn ? (
          <div className="auth-cluster">
            <NavLink to="/admin/dashboard" className="tiny-auth-btn">
              {session?.username || 'Admin'}
            </NavLink>
            <button type="button" className="tiny-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <NavLink to="/admin/login" className="tiny-auth-btn">
            Admin Login
          </NavLink>
        )}
      </div>
    </header>
  );
}

export default Navbar;
