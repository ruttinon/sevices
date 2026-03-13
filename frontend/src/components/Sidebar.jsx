import { NavLink } from 'react-router-dom';
import { ClipboardList, FolderKanban, LayoutDashboard, QrCode, ScrollText } from 'lucide-react';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/projects', label: 'Setup', icon: FolderKanban },
  { to: '/admin/assets', label: 'Assets', icon: ClipboardList },
  { to: '/admin/qr', label: 'QR Center', icon: QrCode },
  { to: '/admin/reports', label: 'Report Center', icon: ScrollText },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <p className="sidebar-title">Admin Console</p>
        <p className="section-copy">Set up each project workbook, print project-aware QR codes, and generate dated save-as reports without overwriting old files.</p>
        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
