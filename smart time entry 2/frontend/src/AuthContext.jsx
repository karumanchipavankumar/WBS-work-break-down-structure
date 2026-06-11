import React, { useState, useEffect } from 'react';
import api from './api';

export const AuthContext = React.createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const token = sessionStorage.getItem('token');
    const u = sessionStorage.getItem('user');
    return token && u ? JSON.parse(u) : null;
  });

  const [loading, setLoading] = useState(() => {
    const token = sessionStorage.getItem('token');
    const u = sessionStorage.getItem('user');
    return !(token && u);
  });

  // 1. Session sharing and global storage events listener
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === 'share_session' && event.newValue) {
        try {
          const session = JSON.parse(event.newValue);
          if (session && session.token && session.user) {
            sessionStorage.setItem('token', session.token);
            sessionStorage.setItem('user', JSON.stringify(session.user));
            setUser(session.user);
          }
        } catch (err) {
          console.error("Failed to parse shared session:", err);
        }
        setLoading(false);
      } else if (event.key === 'logout_event' && event.newValue) {
        // Clear all storage on sync logout
        sessionStorage.clear();
        if (event.newValue.startsWith('inactivity_')) {
          sessionStorage.setItem('auth_message', 'Your session has expired due to inactivity. Please log in again.');
        }
        setUser(null);
      } else if (event.key === 'request_session' && event.newValue) {
        // Send our session to the requesting tab
        const token = sessionStorage.getItem('token');
        const userStr = sessionStorage.getItem('user');
        if (token && userStr) {
          localStorage.setItem('share_session', JSON.stringify({
            token,
            user: JSON.parse(userStr)
          }));
          setTimeout(() => {
            localStorage.removeItem('share_session');
          }, 50);
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    // If we do not have a session, ask other tabs for it
    const token = sessionStorage.getItem('token');
    const u = sessionStorage.getItem('user');
    if (!token || !u) {
      localStorage.setItem('request_session', Date.now().toString());
      const timer = setTimeout(() => {
        localStorage.removeItem('request_session');
        setLoading(false);
      }, 150);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('storage', handleStorage);
      };
    } else {
      setLoading(false);
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // 2. Inactivity timer check (5 minutes)
  useEffect(() => {
    if (!user) return;

    // Initialize/Reset timer on startup or activity
    localStorage.setItem('lastActivity', Date.now().toString());

    const resetTimer = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    const checkInterval = setInterval(() => {
      const lastActivity = localStorage.getItem('lastActivity');
      if (lastActivity) {
        const diff = Date.now() - Number(lastActivity);
        if (diff > 5 * 60 * 1000) { // 5 minutes inactivity
          // Log out this tab
          sessionStorage.setItem('auth_message', 'Your session has expired due to inactivity. Please log in again.');
          
          try {
            sessionStorage.clear();
            localStorage.clear();
            localStorage.setItem('logout_event', 'inactivity_' + Date.now().toString());
          } catch (err) {
            console.error("Cleanup error during inactivity logout:", err);
          }

          window.history.replaceState({ appState: 'logged-out' }, '', window.location.href);
          setUser(null);
        }
      }
    }, 2000);

    return () => {
      clearInterval(checkInterval);
      activityEvents.forEach(evt => {
        window.removeEventListener(evt, resetTimer);
      });
    };
  }, [user]);

  const login = async (empId, pass) => {
    try {
      const res = await api.post('/auth/login', { empId, password: pass });
      sessionStorage.setItem('token', res.data.token);
      sessionStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.setItem('lastActivity', Date.now().toString());
      localStorage.removeItem('admin_selected_employee');

      // Push a sentinel history entry so that pressing Back while
      // authenticated is detectable via the popstate event.
      window.history.pushState({ appState: 'authenticated', view: 'home' }, '', window.location.href);

      setUser(res.data.user);
      return { success: true };
    } catch (e) {
      const msg = e.response?.data?.message || 'Invalid credentials. Please try again.';
      return { success: false, message: msg };
    }
  };

  const logout = () => {
    try {
      localStorage.setItem('logout_event', 'manual_' + Date.now().toString());
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (err) {
      console.error("Cleanup error during logout:", err);
    }

    // Replace current history entry with a logged-out marker
    window.history.replaceState({ appState: 'logged-out' }, '', window.location.href);

    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
