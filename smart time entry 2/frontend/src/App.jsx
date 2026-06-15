import { useContext, useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import Login from './Login';
import Dashboard from './Dashboard';
import ResetOneTimePassword from './ResetOneTimePassword';
import AppModal from './AppModals';

function App() {
  const { user, logout, loading, isSessionExpired, setIsSessionExpired } = useContext(AuthContext);
  const [forceLoginView, setForceLoginView] = useState(false);

  // Check URL query string for resetToken setup links
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('resetToken');

  useEffect(() => {
    if (resetToken && user) {
      // Clear any existing session to isolate the password reset flow
      logout();
    }
  }, [resetToken, user, logout]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            border: '4px solid rgba(255, 255, 255, 0.1)',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            borderLeftColor: '#38bdf8',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <div>Loading Session...</div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <>
      {resetToken && !forceLoginView ? (
        <ResetOneTimePassword 
          token={resetToken} 
          onBackToLogin={() => setForceLoginView(true)} 
        />
      ) : !user ? (
        <Login />
      ) : (
        <Dashboard />
      )}
      {isSessionExpired && (
        <AppModal
          type="alert"
          title="Session Timed Out"
          message="Your session has expired due to inactivity. Please log in again to continue."
          confirmLabel="Login Again"
          onConfirm={() => {
            setIsSessionExpired(false);
            logout();
          }}
        />
      )}
    </>
  );
}

export default App;
