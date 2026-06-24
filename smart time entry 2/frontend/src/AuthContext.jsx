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

  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdownTime, setCountdownTime] = useState(30);

  const triggerSessionExpired = () => {
    setIsSessionExpired(true);
    try {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem('session_expired_event', 'inactivity_' + Date.now().toString());
    } catch (err) {
      console.error("Cleanup error during inactivity logout:", err);
    }
    window.history.replaceState({ appState: 'logged-out' }, '', window.location.href);
    setUser(null);
  };

  // Listen to custom DOM event from api.js response interceptor
  useEffect(() => {
    const handleSessionExpiredEvent = () => {
      triggerSessionExpired();
    };
    window.addEventListener('session-expired', handleSessionExpiredEvent);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpiredEvent);
    };
  }, []);

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
      } else if (event.key === 'session_expired_event' && event.newValue) {
        sessionStorage.clear();
        setIsSessionExpired(true);
      } else if (event.key === 'logout_event' && event.newValue) {
        // Clear all storage on sync logout
        sessionStorage.clear();
        if (event.newValue.startsWith('manual_')) {
          setUser(null);
        }
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
      setShowWarning(false);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    const checkInterval = setInterval(() => {
      const lastActivity = localStorage.getItem('lastActivity');
      if (lastActivity) {
        const diff = Date.now() - Number(lastActivity);
        const warningThreshold = 4.5 * 60 * 1000; // 4.5 minutes inactivity
        const maxThreshold = 5 * 60 * 1000;       // 5 minutes inactivity

        if (diff >= maxThreshold) {
          setShowWarning(false);
          triggerSessionExpired();
        } else if (diff >= warningThreshold) {
          const remainingSeconds = Math.max(0, Math.ceil((maxThreshold - diff) / 1000));
          setCountdownTime(remainingSeconds);
          setShowWarning(true);
        } else {
          setShowWarning(false);
        }
      }
    }, 1000);

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
    <AuthContext.Provider value={{ user, login, logout, loading, isSessionExpired, setIsSessionExpired }}>
      {children}
      {showWarning && (
        <div className="modal-overlay open" style={{ zIndex: 1000000 }}>
          <div className="modal" style={{
            maxWidth: '400px',
            borderRadius: '16px',
            padding: '30px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--amber-pale)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: 'var(--amber)'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 style={{ color: 'var(--navy)', fontSize: '18px', fontWeight: '700', marginBottom: '10px' }}>
              Session Expiring
            </h3>
            <p style={{ color: 'var(--text-mid)', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
              Your session will expire in <strong style={{ color: 'var(--rose)', fontSize: '15px' }}>{countdownTime} seconds</strong> due to inactivity.
            </p>
            <button 
              className="btn btn-teal btn-md" 
              onClick={() => {
                localStorage.setItem('lastActivity', Date.now().toString());
                setShowWarning(false);
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '13.5px' }}
            >
              Keep Session Active
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
