import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api.js';

// Shape: { user, loading, login, logout }
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // null = not logged in
  const [loading, setLoading] = useState(true);   // true while checking session
  const [csrfToken,  setCsrfToken]  = useState('');

  const applyAuthResponse = (data) => {
    const { csrf_token, ...userData } = data;
    setUser(userData);
    setCsrfToken(csrf_token || '');
  };

  // On first mount, verify whether a PHP session cookie already exists.
  const checkSession = useCallback(async () => {
    try {
      const res = await api.get('/auth/check.php');
      applyAuthResponse(res.data);
    } catch {
      setUser(null); // 401 means no valid session
      setCsrfToken('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  // Call this from the login form.
  const login = async (username, password) => {
    const res = await api.post('/auth/login.php', { username, password });
    applyAuthResponse(res.data);
    return res.data;
  };

  // Call this from the logout button.
  const logout = async () => {
    try { await api.post('/auth/logout.php', {}); } catch { /* ignore */ }
    setUser(null);
    setCsrfToken('');
    sessionStorage.removeItem('pos_cart');  
    sessionStorage.removeItem('pos_cash')
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, csrfToken}}>
      {children}
    </AuthContext.Provider>
  );
}

// Convenience hook
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
