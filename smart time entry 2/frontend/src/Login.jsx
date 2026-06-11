import { useContext, useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import api from './api';
import { showAlert } from './AppModals';

export default function Login() {
  const { login } = useContext(AuthContext);
  const [role, setRole] = useState('employee');
  const [empId, setEmpId] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Banner message set by api.js when an existing session is invalidated after a password change
  const [authMessage, setAuthMessage] = useState(() => {
    const msg = sessionStorage.getItem('auth_message');
    if (msg) sessionStorage.removeItem('auth_message');
    return msg || '';
  });

  // Auto-dismiss warning messages after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-dismiss auth banner after 8 seconds
  useEffect(() => {
    if (authMessage) {
      const timer = setTimeout(() => setAuthMessage(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [authMessage]);

  const [showForgot, setShowForgot] = useState(false);
  const [resetStep, setResetStep] = useState(1); 
  const [recoveryInput, setRecoveryInput] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [logoSrc, setLogoSrc] = useState('/logo.jpg');
  const [resendTimer, setResendTimer] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

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
            const alpha = Math.max(0, Math.min(255, (255 - brightness) * (255 / 35)));
            data[i+3] = alpha;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setLogoSrc(canvas.toDataURL());
      } catch (err) {
        console.error("Logo processing failed on login screen", err);
      }
    };
  }, []);

  const handleRole = (r) => {
    setRole(r);
    setEmpId('');
  };

  const validate = () => {
    if (!empId) return 'Employee ID or Email is required';
    if (pass.length < 6) return 'Password must be at least 6 characters';
    if (pass.length > 20) return 'Password cannot exceed 20 characters';
    if (pass.trim().length === 0) return 'Password cannot be only spaces';
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setError('');
    setLoading(true);
    const result = await login(empId, pass);
    setLoading(false);
    if (!result.success) {
      setError(result.message);
    }
  };

  const validateRecoveryInput = (input) => {
    if (!input || !input.trim()) {
      return { isValid: false, message: 'Please enter your registered email address.' };
    }
    const val = input.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      return { isValid: false, message: 'Please enter a valid email address.' };
    }
    return { isValid: true, type: 'email', value: val };
  };

  const handleForgot = async () => {
    const check = validateRecoveryInput(recoveryInput);
    if (!check.isValid) {
      setError(check.message);
      return;
    }
    setError('');
    setResetLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { input: recoveryInput.trim() });
      await showAlert(res.data.message, { title: 'Reset Code Sent' });
      setResetStep(2);
      setResendTimer(60); // Start 60s countdown
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Error sending reset code';
      setError(errorMsg);
    } finally {
      setResetLoading(false);
    }
  };

  const handleReset = async () => {
    if (!resetCode || !newPass || !confirmPass) {
      setError('Please enter the verification code and both passwords.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    if (newPass.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setResetLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { 
        input: recoveryInput.trim(), 
        code: resetCode.trim(), 
        newPassword: newPass 
      });
      await showAlert(res.data.message, { title: 'Password Updated' });
      setShowForgot(false);
      setResetStep(1);
      setRecoveryInput('');
      setResetCode('');
      setNewPass('');
      setConfirmPass('');
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Reset failed';
      setError(errorMsg);
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px', gap: '12px' }}>
            <img src={logoSrc} alt="Folks Ideal Logo" style={{ height: '22px', objectFit: 'contain' }} />
            <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#1f3360' }}>Smart Time Entry</span>
          </div>
          
          <div className="login-title" style={{ textAlign: 'center' }}>
            {resetStep === 1 ? 'Password Recovery' : 'Reset Password'}
          </div>
          <div className="login-sub" style={{ textAlign: 'center', marginBottom: '20px' }}>
            {resetStep === 1 
              ? 'Enter your registered email address to receive a verification code' 
              : 'Enter the 6-digit code sent to your email and create your new password'
            }
          </div>

          {error && <div className="login-error-alert" style={{ color: '#d32f2f', backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px', fontSize: '13px', marginBottom: '15px', textAlign: 'center', border: '1px solid #ffcdd2' }}>{error}</div>}

          {resetStep === 1 ? (
            <div>
              <div className="form-group">
                <label className="form-label">Registered Email Address <span style={{color:'#e11d48'}}>*</span></label>
                <input 
                  className="form-input" 
                  value={recoveryInput} 
                  onChange={e => { setRecoveryInput(e.target.value); setError(''); }} 
                  type="email" 
                  placeholder="e.g. name@company.com" 
                  disabled={resetLoading} 
                />
              </div>
              <button 
                className="btn-login" 
                style={{ marginTop: '10px', opacity: (resetLoading || !recoveryInput.trim()) ? 0.7 : 1, cursor: (resetLoading || !recoveryInput.trim()) ? 'not-allowed' : 'pointer' }} 
                onClick={handleForgot}
                disabled={resetLoading || !recoveryInput.trim()}
              >
                {resetLoading ? 'Sending OTP...' : 'Send Verification OTP →'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button 
                  onClick={() => { setShowForgot(false); setResetStep(1); setError(''); }} 
                  style={{ background: 'none', border: 'none', color: '#455fa0', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label className="form-label">Verification Code (OTP) <span style={{color:'#e11d48'}}>*</span></label>
                <input 
                  className="form-input" 
                  value={resetCode} 
                  onChange={e => { setResetCode(e.target.value); setError(''); }} 
                  type="text" 
                  placeholder="6-digit code" 
                  disabled={resetLoading} 
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    className="form-input" 
                    value={newPass} 
                    onChange={e => { setNewPass(e.target.value); setError(''); }} 
                    type={showNewPass ? "text" : "password"} 
                    placeholder="Min 6 characters" 
                    style={{ paddingRight: '45px', width: '100%', boxSizing: 'border-box' }}
                    disabled={resetLoading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{
                      position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none'
                    }}
                  >
                    {showNewPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Confirm Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    className="form-input" 
                    value={confirmPass} 
                    onChange={e => { setConfirmPass(e.target.value); setError(''); }} 
                    type={showConfirmPass ? "text" : "password"} 
                    placeholder="Confirm new password" 
                    style={{ paddingRight: '45px', width: '100%', boxSizing: 'border-box' }}
                    disabled={resetLoading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    style={{
                      position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none'
                    }}
                  >
                    {showConfirmPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button 
                className="btn-login" 
                style={{ opacity: (resetLoading || !resetCode || !newPass || !confirmPass) ? 0.7 : 1, cursor: (resetLoading || !resetCode || !newPass || !confirmPass) ? 'not-allowed' : 'pointer' }} 
                onClick={handleReset}
                disabled={resetLoading || !resetCode || !newPass || !confirmPass}
              >
                {resetLoading ? 'Updating Password...' : 'Reset Password'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <button 
                  onClick={handleForgot} 
                  disabled={resetLoading || resendTimer > 0} 
                  style={{
                    background: 'none', border: 'none', color: resendTimer > 0 ? '#94a3b8' : '#455fa0', fontSize: '13px', cursor: (resetLoading || resendTimer > 0) ? 'not-allowed' : 'pointer', fontWeight: '500'
                  }}
                >
                  {resendTimer > 0 ? `Resend OTP (${resendTimer}s)` : 'Resend OTP'}
                </button>

                <button 
                  onClick={() => { setResetStep(1); setError(''); }} 
                  disabled={resetLoading} 
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: resetLoading ? 'not-allowed' : 'pointer' }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px', gap: '12px' }}>
          <img src={logoSrc} alt="Folks Ideal Logo" style={{ height: '22px', objectFit: 'contain' }} />
          <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#1f3360' }}>Smart Time Entry</span>
        </div>
        <div className="login-title" style={{ textAlign: 'center' }}>Welcome back</div>
        <div className="login-sub" style={{ textAlign: 'center' }}>Sign in to your dashboard</div>

        {authMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#92400e',
            lineHeight: '1.5'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{authMessage}</span>
          </div>
        )}

        {error && <div className="login-error-alert" style={{ color: '#d32f2f', backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px', fontSize: '13px', marginBottom: '15px', textAlign: 'center', border: '1px solid #ffcdd2' }}>{error}</div>}
        
        <div className="form-group">
          <label className="form-label">Employee ID or Email <span style={{color:'#e11d48'}}>*</span></label>
          <input 
            className={`form-input ${error && !empId ? 'invalid' : ''}`} 
            value={empId} 
            onChange={e => { setEmpId(e.target.value); setError(''); }} 
            type="text" 
            placeholder="Enter ID or Email"
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password <span style={{color:'#e11d48'}}>*</span></label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              className={`form-input ${error && pass.length < 6 ? 'invalid' : ''}`} 
              value={pass} 
              onChange={e => { setPass(e.target.value); setError(''); }} 
              type={showPassword ? "text" : "password"} 
              placeholder="Enter Password"
              style={{ paddingRight: '45px', width: '100%', boxSizing: 'border-box' }}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none'
              }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
        </div>
        <div style={{ textAlign: 'right', marginBottom: '15px' }}>
          <button onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', color: '#455fa0', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Forgot Password?</button>
        </div>
        <button className="btn-login" onClick={submit} disabled={loading || !empId || !pass}>
          {loading ? 'Signing In...' : 'Sign In →'}
        </button>
      </div>
    </div>
  );
}
