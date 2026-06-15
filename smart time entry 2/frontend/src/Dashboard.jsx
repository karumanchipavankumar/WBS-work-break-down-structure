import React, { useContext, useState, useEffect, useRef } from 'react';
import { AuthContext } from './AuthContext';
import EmployeeDashboard from './EmployeeDashboard';
import AdminDashboard from './AdminDashboard';
import api from './api';
import { showConfirm } from './AppModals';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  try {
    let isoString = dateString;
    if (typeof dateString === 'string' && !dateString.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(dateString)) {
      isoString = dateString + 'Z';
    }
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

function formatNotificationMessage(msg) {
  if (!msg) return '';
  const match = msg.match(/\| Time:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
  if (match) {
    const utcTimeStr = match[1].replace(' ', 'T') + 'Z';
    try {
      const localDate = new Date(utcTimeStr);
      if (!isNaN(localDate.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        const year = localDate.getFullYear();
        const month = pad(localDate.getMonth() + 1);
        const day = pad(localDate.getDate());
        const hours = pad(localDate.getHours());
        const minutes = pad(localDate.getMinutes());
        const seconds = pad(localDate.getSeconds());
        const localTimeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        return msg.replace(match[1], localTimeStr);
      }
    } catch (e) {
      console.error('Failed to convert notification timezone', e);
    }
  }
  return msg;
}

function hasUnsavedChanges() {
  if (typeof window === 'undefined') return false;
  if (typeof window.isTimesheetGridDirty === 'function' && window.isTimesheetGridDirty()) {
    return true;
  }
  if (typeof window.isAdminDashboardDirty === 'function' && window.isAdminDashboardDirty()) {
    return true;
  }
  return false;
}
export default function Dashboard() {
  const { user, logout, isSessionExpired } = useContext(AuthContext);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/logo.jpg');

  const [selectedEmployee, setSelectedEmployee] = useState(() => {
    if (user?.role === 'admin') {
      const saved = localStorage.getItem('admin_selected_employee');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const selectedEmployeeRef = useRef(selectedEmployee);
  useEffect(() => {
    selectedEmployeeRef.current = selectedEmployee;
  }, [selectedEmployee]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedEmployee]);

  const handleSelectEmployee = (emp, pushHistory = true) => {
    setSelectedEmployee(emp);
    if (emp) {
      localStorage.setItem('admin_selected_employee', JSON.stringify(emp));
      if (pushHistory) {
        window.history.pushState({ appState: 'authenticated', view: 'timesheet', employee: emp }, '', window.location.href);
      }
    } else {
      localStorage.removeItem('admin_selected_employee');
      if (pushHistory) {
        window.history.pushState({ appState: 'authenticated', view: 'home' }, '', window.location.href);
      }
    }
  };


  // Notification States
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifPage, setNotifPage] = useState(0);
  const [hasMoreNotifs, setHasMoreNotifs] = useState(false);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = '/logo.jpg';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const brightness = (r + g + b) / 3;
          if (brightness > 220) {
            // Anti-aliased transparency filter for near-white pixels
            const alpha = Math.max(0, Math.min(255, (255 - brightness) * (255 / 35)));
            data[i+3] = alpha;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setLogoSrc(canvas.toDataURL());
      } catch (err) {
        console.error("Logo transparency processing failed", err);
      }
    };
  }, []);

  const fetchNotifications = async (pageNumber, append = false) => {
    setIsLoadingNotifs(true);
    try {
      const res = await api.get(`/notifications?page=${pageNumber}&size=10`);
      const data = res.data;
      const newNotifs = data.notifications?.content || [];
      const isLast = data.notifications?.last ?? true;
      const count = data.unreadCount || 0;

      setUnreadCount(count);
      setHasMoreNotifs(!isLast);
      setNotifPage(pageNumber);

      if (append) {
        setNotifications(prev => {
          const map = new Map();
          prev.forEach(item => map.set(item.id, item));
          newNotifs.forEach(item => map.set(item.id, item));
          return Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        });
      } else {
        setNotifications(newNotifs);
      }
    } catch (e) {
      console.error("Failed to fetch notifications", e);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  // ── Back/Forward Button Session Guard ───────────────────────────────────
  // When the user is authenticated, push a sentinel history state on mount.
  // If they press Back (or Forward) the popstate event fires; we detect
  // navigation away from the 'authenticated' state and prompt to logout.
  useEffect(() => {
    // Inject no-store meta so the browser never serves a cached page snapshot
    let cacheMeta = document.querySelector('meta[http-equiv="Cache-Control"]');
    if (!cacheMeta) {
      cacheMeta = document.createElement('meta');
      cacheMeta.setAttribute('http-equiv', 'Cache-Control');
      document.head.appendChild(cacheMeta);
    }
    cacheMeta.setAttribute('content', 'no-store, no-cache, must-revalidate');

    // Ensure we have an authenticated sentinel in history
    if (!window.history.state || window.history.state.appState !== 'authenticated' || !window.history.state.view) {
      const currentEmp = selectedEmployeeRef.current;
      if (user?.role === 'admin' && currentEmp) {
        window.history.replaceState({ appState: 'authenticated', view: 'timesheet', employee: currentEmp }, '', window.location.href);
      } else {
        window.history.replaceState({ appState: 'authenticated', view: 'home' }, '', window.location.href);
      }
    }

    const handlePopState = async (e) => {
      if (isSessionExpired) {
        logout();
        return;
      }
      const state = e.state;
      if (state && state.appState === 'authenticated') {
        // Internal navigation
        if (state.view === 'timesheet') {
          setSelectedEmployee(state.employee);
          localStorage.setItem('admin_selected_employee', JSON.stringify(state.employee));
        } else {
          setSelectedEmployee(null);
          localStorage.removeItem('admin_selected_employee');
        }
      } else {
        // Home page back navigation
        const leave = await showConfirm(
          'Are you sure you want to leave the application? You will be logged out.',
          { title: 'Leave Application?', type: 'leave', confirmLabel: 'Logout / Leave', cancelLabel: 'Stay' }
        );
        if (leave) {
          logout();
        } else {
          // Push sentinel state back to history to retain the authenticated view
          const currentEmp = selectedEmployeeRef.current;
          const currentView = currentEmp ? 'timesheet' : 'home';
          const currentState = {
            appState: 'authenticated',
            view: currentView,
            employee: currentEmp
          };
          window.history.pushState(currentState, '', window.location.href);
        }
      }
    };

    const handlePageShow = (e) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [logout, user?.role, isSessionExpired]);

  // ── Unsaved-changes guard on page unload ─────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "Your changes have not been saved. Do you still want to leave this page?";
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Load initial notifications and poll for unread count in background
  useEffect(() => {
    fetchNotifications(0, false);

    const interval = setInterval(() => {
      // Lightly poll for updated unreadCount in the background
      api.get('/notifications?page=0&size=1')
        .then(res => {
          setUnreadCount(res.data.unreadCount || 0);
        })
        .catch(err => console.error("Error polling unread count", err));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // When dropdown opens, fetch page 0 to show fresh list
  useEffect(() => {
    if (isNotifOpen) {
      fetchNotifications(0, false);
    }
  }, [isNotifOpen]);

  const markAsRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Failed to mark notification as read", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error("Failed to mark all as read", e);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      // Refresh unread count
      const res = await api.get('/notifications?page=0&size=1');
      setUnreadCount(res.data?.unreadCount ?? 0);
    } catch (e) {
      console.error("Failed to delete notification", e);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await api.delete('/notifications/all');
      setNotifications([]);
      setUnreadCount(0);
      setHasMoreNotifs(false);
    } catch (e) {
      console.error("Failed to clear notifications", e);
    }
  };

  const loadMoreNotifs = () => {
    if (isLoadingNotifs || !hasMoreNotifs) return;
    const nextPage = notifPage + 1;
    fetchNotifications(nextPage, true);
  };

  return (
    <div className="app-shell visible">
      <nav className="topnav">
        <div className="nav-brand" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <img src={logoSrc} alt="Folks Ideal Logo" style={{ height: '42px', objectFit: 'contain', display: 'block' }} />
        </div>
        <div className="nav-right" style={{position: 'relative'}}>
          
          {/* Notification Bell */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => {
                setIsNotifOpen(!isNotifOpen);
                setIsDropdownOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isNotifOpen ? 'var(--teal)' : '#64748b',
                transition: 'all 0.2s ease',
                outline: 'none',
                position: 'relative'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: '9px',
                    fontWeight: '700',
                    borderRadius: '9999px',
                    minWidth: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    boxShadow: '0 0 0 2px #ffffff',
                    boxSizing: 'border-box'
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 998,
                    background: 'transparent'
                  }}
                  onClick={() => setIsNotifOpen(false)}
                />
                
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '12px',
                    width: '360px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0',
                    zIndex: 999,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '480px',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: '#fafafb'
                    }}
                  >
                    <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--navy)' }}>
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--teal)',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--teal-light)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#e53e3e',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fff5f5'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {notifications.length === 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '40px 20px',
                          textAlign: 'center',
                          color: '#94a3b8'
                        }}
                      >
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', color: '#cbd5e1' }}>
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>All caught up!</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>You have no new notifications.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {notifications.map((notif) => {
                          const isRead = notif.read || notif.isRead;
                          return (
                            <div
                              key={notif.id}
                              style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                backgroundColor: isRead ? 'transparent' : 'rgba(45, 143, 123, 0.03)',
                                transition: 'background-color 0.2s',
                                position: 'relative'
                              }}
                            >
                              <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4', textAlign: 'left', paddingRight: '20px' }}>
                                {formatNotificationMessage(notif.message)}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  {formatRelativeTime(notif.createdAt)}
                                </span>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {!isRead && (
                                    <button
                                      onClick={() => markAsRead(notif.id)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#64748b',
                                        fontSize: '11px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        padding: '2px 4px',
                                        borderRadius: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onMouseOver={(e) => e.currentTarget.style.color = 'var(--teal)'}
                                      onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                                    >
                                      Mark read
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteNotification(notif.id)}
                                    title="Dismiss notification"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#cbd5e1',
                                      fontSize: '14px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      lineHeight: '1',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.color = '#e53e3e'}
                                    onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>

                              {!isRead && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '12px',
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--teal)'
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {hasMoreNotifs && (
                    <div
                      style={{
                        padding: '10px',
                        borderTop: '1px solid #f1f5f9',
                        textAlign: 'center',
                        backgroundColor: '#fafafb'
                      }}
                    >
                      <button
                        onClick={loadMoreNotifs}
                        disabled={isLoadingNotifs}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--teal)',
                          fontSize: '12.5px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          width: '100%',
                          padding: '6px 0',
                          borderRadius: '6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {isLoadingNotifs ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div 
            className="nav-user" 
            onClick={() => {
              setIsDropdownOpen(!isDropdownOpen);
              setIsNotifOpen(false);
            }} 
            style={{
              cursor: 'pointer', 
              padding: '6px 10px', 
              borderRadius: '6px', 
              transition: 'background-color 0.2s',
              backgroundColor: isDropdownOpen ? 'rgba(0,0,0,0.04)' : 'transparent'
            }}
          >
            <div className="nav-avatar" style={{background: user?.color || 'linear-gradient(135deg, #2d8f7b, #e8a020)'}}>
              {user?.initials || user?.name?.charAt(0) || 'U'}
            </div>
          </div>

          {isDropdownOpen && (
            <>
              <div 
                style={{
                  position: 'fixed', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  zIndex: 998, 
                  background: 'transparent'
                }} 
                onClick={() => setIsDropdownOpen(false)} 
              />
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '260px',
                  background: '#fff',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  zIndex: 999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxSizing: 'border-box'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{display:'flex', alignItems:'center', gap:'12px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9'}}>
                  <div style={{
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    background: user?.color || '#2d8f7b', 
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '16px', 
                    fontWeight: 'bold'
                  }}>
                    {user?.initials || user?.name?.charAt(0) || 'U'}
                  </div>
                  <div style={{textAlign: 'left'}}>
                    <div style={{fontWeight: 'bold', fontSize: '14px', color: '#1e293b'}}>{user?.name || 'N/A'}</div>
                    <div style={{fontSize: '11px', color: '#64748b'}}>{user?.role === 'admin' ? 'Administrator' : (user?.dept || 'Employee')}</div>
                  </div>
                </div>

                {user?.role !== 'admin' && (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', textAlign: 'left'}}>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Employee ID</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>{user?.empId || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Department</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>{user?.dept || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Email</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px', wordBreak: 'break-all'}}>{user?.email || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Project Name</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>{user?.projectName || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Company Name</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>{user?.companyName || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Date of Joining</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>{user?.dateOfJoining || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{color: '#94a3b8', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase'}}>Date Created</span>
                      <div style={{color: '#334155', fontWeight: '500', marginTop: '1px'}}>
                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '4px'}}>
                  <button 
                    onClick={async () => {
                      if (hasUnsavedChanges()) {
                        const confirmLeave = await showConfirm(
                          'Your changes have not been saved. Do you still want to sign out?',
                          { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Sign Out', cancelLabel: 'Stay' }
                        );
                        if (!confirmLeave) return;
                      }
                      setIsDropdownOpen(false);
                      logout();
                    }}
                    style={{
                      width: '100%',
                      background: '#fee2e2',
                      color: '#ef4444',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#fecaca'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#fee2e2'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>
      
      {user?.role === 'admin' ? (
        <AdminDashboard 
          selectedEmployee={selectedEmployee} 
          onSelectEmployee={handleSelectEmployee} 
        />
      ) : (
        <EmployeeDashboard />
      )}
    </div>
  );
}
