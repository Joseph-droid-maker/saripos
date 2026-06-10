import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Layout() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar__left">
            <span className="topbar__store">🏪 SariPOS</span>
          </div>
          <div className="topbar__right">
            <span className="topbar__user">
              <span className="topbar__avatar">{(user?.full_name || 'U')[0].toUpperCase()}</span>
              <span>{user?.full_name}</span>
              <span className={`badge badge--role badge--${user?.role}`}>{user?.role}</span>
            </span>
          </div>
        </div>

        {/* Page content */}
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
