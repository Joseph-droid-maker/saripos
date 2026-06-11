import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal.jsx';

const NAV = [
  { to: '/pos',      icon: '🖥️',  label: 'Menu',     roles: ['admin', 'staff'] },
  { to: '/products', icon: '📦',  label: 'Products', roles: ['admin'] },
  { to: '/sales',    icon: '🧾',  label: 'History',  roles: ['admin'] },
  { to: '/reports',  icon: '📊',  label: 'Reports',  roles: ['admin'] },
  { to: '/users',    icon: '👥',  label: 'Users',    roles: ['admin'] },
];

// open: boolean — controlled by Layout, drives the --open CSS class on mobile
// onClose: function — called when user navigates or taps the close button
export default function Sidebar({ open, onClose }) {
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
      {/* sidebar--open adds `left: 0` on mobile to slide the panel into view */}
      <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>

        {/* Brand + mobile close button */}
        <div className="sidebar__brand">
          <span className="sidebar__logo">🏪</span>
          <span className="sidebar__name">SariPOS</span>
          {/* Close button: only visible on mobile via CSS */}
          <button
            className="sidebar__close"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation links */}
        <nav className="sidebar__nav">
          {visible.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
              onClick={onClose}
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
            <button className="btn btn-ghost" onClick={() => setConfirmLogout(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleLogout}>
              Yes, Logout
            </button>
          </div>
        }
      >
        <p>Are you sure you want to log out?</p>
      </Modal>
    </>
  );
}