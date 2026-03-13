import { HashRouter as Router, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ProjectProvider } from './context/ProjectContext';
import Navbar from './components/Navbar';
import PageWrapper from './components/PageWrapper';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import AdminLogin from './pages/admin/AdminLogin';
import Dashboard from './pages/admin/Dashboard';
import Projects from './pages/admin/Projects';
import Assets from './pages/admin/Assets';
import QRCodes from './pages/admin/QRCodes';
import Reports from './pages/admin/Reports';
import AssetDetail from './pages/engineer/AssetDetail';
import PMReport from './pages/engineer/PMReport';
import Scan from './pages/engineer/Scan';
import UploadPhoto from './pages/engineer/UploadPhoto';
import CustomerScan from './pages/customer/CustomerScan';
import PanelView from './pages/customer/PanelView';
import SearchResults from './pages/customer/SearchResults';
import OnlineReport from './pages/customer/OnlineReport';
import CustomerPortal from './pages/customer/CustomerPortal';
import { isAdminAuthenticated } from './utils/authSession';

function RequireAdminAuth() {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}

function AdminLayout() {
  return (
    <div className="workspace">
      <Sidebar />
      <main className="main-panel">
        <PageWrapper>
          <Outlet />
        </PageWrapper>
      </main>
    </div>
  );
}

function EngineerLayout() {
  return (
    <div className="workspace single-column">
      <main className="main-panel">
        <div className="role-tabs">
          <NavLink to="/engineer/scan" className={({ isActive }) => `role-tab${isActive ? ' active' : ''}`}>
            Scan
          </NavLink>
          <NavLink to="/engineer/service/new" className={({ isActive }) => `role-tab${isActive ? ' active' : ''}`}>
            PM Report
          </NavLink>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function CustomerLayout() {
  return (
    <div className="workspace single-column">
      <main className="main-panel">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <ProjectProvider>
      <Router>
        <div className="app-shell">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route element={<RequireAdminAuth />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="assets" element={<Assets />} />
                <Route path="qr" element={<QRCodes />} />
                <Route path="reports" element={<Reports />} />
              </Route>
            </Route>

            <Route path="/engineer" element={<EngineerLayout />}>
              <Route index element={<Navigate to="/engineer/scan" replace />} />
              <Route path="scan" element={<Scan />} />
              <Route path="assets/:assetType/:assetId" element={<AssetDetail />} />
              <Route path="service/new" element={<PMReport />} />
              <Route path="service/:serviceId/photos" element={<UploadPhoto />} />
            </Route>

            <Route path="/customer" element={<CustomerLayout />}>
              <Route index element={<CustomerPortal />} />
              <Route path="portal" element={<CustomerPortal />} />
              <Route path="portal/:projectId" element={<CustomerPortal />} />
              <Route path="scan" element={<CustomerScan />} />
              <Route path="panel/:panelId" element={<PanelView />} />
              <Route path="online-report/:reportId" element={<OnlineReport />} />
              <Route path="online-report/:entityType/:entityId" element={<OnlineReport />} />
              <Route path="search-results" element={<SearchResults />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </ProjectProvider>
  );
}

export default App;
