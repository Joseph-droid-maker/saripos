import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal.jsx';

const NAV = [
  { to: '/pos',      icon: '🖥️',  label: 'Menu', roles: ['admin','staff'] },
  { to: '/products', icon: '📦',  label: 'Products',      roles: ['admin'] },
  { to: '/sales',    icon: '🧾',  label: 'History', roles: ['admin'] },
  { to: '/reports',  icon: '📊',  label: 'Reports',       roles: ['admin'] },
  { to: '/users',    icon: '👥',  label: 'Users',         roles: ['admin'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    setConfirmLogout(false);
    await logout();
    toast.success('Logged out.');
    navigate('/login');
  };

  const visible = NAV.filter(n => n.roles.includes(user?.role));

  return (
    <>
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar__brand">
          <span className="sidebar__logo">🏪</span>
          <span className="sidebar__name">SariPOS</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav">
          {visible.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
            >
              <span className="sidebar__icon">{item.icon}</span>
              <span className="sidebar__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          className="sidebar__logout"
          onClick={() => setConfirmLogout(true)}
        >
          <span>🚪</span>
          <span id="logout__label">Logout</span>
        </button>
      </aside>

      {/* Logout confirmation modal */}
      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Confirm Logout"
        danger
        size="sm"
        footer={
          <div className="modal-footer-btns">
            <button className="btn btn-ghost" onClick={() => setConfirmLogout(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleLogout}>Yes, Logout</button>
          </div>
        }
      >
        <p>Are you sure you want to log out?</p>
      </Modal>
    </>
  );
}
