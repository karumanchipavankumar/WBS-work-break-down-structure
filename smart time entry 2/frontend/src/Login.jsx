import { useContext, useState, useEffect, useRef } from 'react';
import { AuthContext } from './AuthContext';
import api from './api';
import { showAlert } from './AppModals';

const validatePasswordComplexity = (password, personalInfo = {}) => {
  const rules = {
    length: password.length >= 8 && password.length <= 32,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[@#\$%&\*!\?]/.test(password) || /[^A-Za-z0-9]/.test(password),
    noSpaces: !/\s/.test(password),
    noPersonalInfo: true
  };

  if (password) {
    const pwdLower = password.toLowerCase();
    const checks = [];
    if (personalInfo.empId) checks.push(personalInfo.empId.toLowerCase());
    if (personalInfo.email) {
      checks.push(personalInfo.email.toLowerCase());
      const parts = personalInfo.email.split('@');
      if (parts[0]) checks.push(parts[0].toLowerCase());
    }
    if (personalInfo.name) {
      checks.push(personalInfo.name.toLowerCase());
      const nameParts = personalInfo.name.split(/\s+/);
      nameParts.forEach(p => {
        if (p.length > 2) checks.push(p.toLowerCase());
      });
    }

    for (const info of checks) {
      if (info && pwdLower.includes(info)) {
        rules.noPersonalInfo = false;
        break;
      }
    }
  } else {
    rules.noPersonalInfo = false;
  }

  let score = 0;
  if (rules.length) score++;
  if (rules.uppercase) score++;
  if (rules.lowercase) score++;
  if (rules.number) score++;
  if (rules.specialChar) score++;
  if (rules.noSpaces) score++;
  if (rules.noPersonalInfo) score++;

  let strength = 'Weak';
  if (score >= 6) {
    strength = 'Strong';
  } else if (score >= 4) {
    strength = 'Medium';
  }

  const messages = [];
  if (!rules.length) messages.push("Password must be between 8 and 32 characters.");
  if (!rules.uppercase) messages.push("Password must contain at least one uppercase letter.");
  if (!rules.lowercase) messages.push("Password must contain at least one lowercase letter.");
  if (!rules.number) messages.push("Password must contain at least one number.");
  if (!rules.specialChar) messages.push("Password must contain at least one special character.");
  if (!rules.noSpaces) messages.push("Password cannot contain spaces.");
  if (!rules.noPersonalInfo) messages.push("Password cannot contain personal information.");

  const allValid = Object.values(rules).every(v => v === true);

  return {
    rules,
    strength,
    messages,
    allValid
  };
};

export default function Login() {
  const { login } = useContext(AuthContext);
  const [role, setRole] = useState('employee');
  const [empId, setEmpId] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userIdError, setUserIdError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  
  const [recoveryInputError, setRecoveryInputError] = useState(false);
  const [resetCodeError, setResetCodeError] = useState(false);
  const [newPassError, setNewPassError] = useState(false);
  const [confirmPassError, setConfirmPassError] = useState(false);

  const empIdRef = useRef(null);
  const passRef = useRef(null);
  const recoveryInputRef = useRef(null);
  const resetCodeRef = useRef(null);
  const newPassRef = useRef(null);
  const confirmPassRef = useRef(null);

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

  const personalInfo = { email: recoveryInput };
  const complexity = validatePasswordComplexity(newPass, personalInfo);
  const isSubmitDisabled = !complexity.allValid || newPass !== confirmPass || !resetCode.trim();

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
    setUserIdError(false);
    setPasswordError(false);

    const isEmpIdEmpty = !empId || !empId.trim();
    const isPassEmpty = !pass || !pass.trim();

    if (isEmpIdEmpty && isPassEmpty) {
      setError('Please fill in all required fields.');
      setUserIdError(true);
      setPasswordError(true);
      if (empIdRef.current) empIdRef.current.focus();
      return;
    }

    if (isEmpIdEmpty) {
      setError('Please enter your User ID.');
      setUserIdError(true);
      if (empIdRef.current) empIdRef.current.focus();
      return;
    }

    if (isPassEmpty) {
      setError('Please enter your Password.');
      setPasswordError(true);
      if (passRef.current) passRef.current.focus();
      return;
    }

    const err = validate();
    if (err) {
      setError(err);
      if (pass.length < 6 || pass.length > 20 || pass.trim().length === 0) {
        setPasswordError(true);
        if (passRef.current) passRef.current.focus();
      } else {
        setUserIdError(true);
        if (empIdRef.current) empIdRef.current.focus();
      }
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
    setRecoveryInputError(false);
    const check = validateRecoveryInput(recoveryInput);
    if (!check.isValid) {
      setError(check.message);
      setRecoveryInputError(true);
      if (recoveryInputRef.current) recoveryInputRef.current.focus();
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
      setRecoveryInputError(true);
      if (recoveryInputRef.current) recoveryInputRef.current.focus();
    } finally {
      setResetLoading(false);
    }
  };

  const handleReset = async () => {
    setResetCodeError(false);
    setNewPassError(false);
    setConfirmPassError(false);

    if (!resetCode || !resetCode.trim()) {
      setError('Please enter the verification code.');
      setResetCodeError(true);
      if (resetCodeRef.current) resetCodeRef.current.focus();
      return;
    }
    if (!newPass || !newPass.trim()) {
      setError('Please enter your new password.');
      setNewPassError(true);
      if (newPassRef.current) newPassRef.current.focus();
      return;
    }
    if (!confirmPass || !confirmPass.trim()) {
      setError('Please confirm your new password.');
      setConfirmPassError(true);
      if (confirmPassRef.current) confirmPassRef.current.focus();
      return;
    }
    const personalInfo = { email: recoveryInput };
    const complexity = validatePasswordComplexity(newPass, personalInfo);
    if (!complexity.allValid) {
      setError(complexity.messages[0]);
      setNewPassError(true);
      if (newPassRef.current) newPassRef.current.focus();
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passwords do not match.');
      setConfirmPassError(true);
      if (confirmPassRef.current) confirmPassRef.current.focus();
      return;
    }
    setError('');
    setResetLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { 
        input: recoveryInput.trim(), 
        code: resetCode.trim(), 
        newPassword: 'base64:' + btoa(unescape(encodeURIComponent(newPass)))
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
      if (errorMsg.includes('history') || errorMsg.includes('previous') || errorMsg.includes('reuse') || errorMsg.includes('last 3')) {
        setNewPassError(true);
        setConfirmPassError(true);
        if (newPassRef.current) newPassRef.current.focus();
      } else if (errorMsg.includes('code') || errorMsg.includes('Verification')) {
        setResetCodeError(true);
        if (resetCodeRef.current) resetCodeRef.current.focus();
      } else {
        setNewPassError(true);
        if (newPassRef.current) newPassRef.current.focus();
      }
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
            <form onSubmit={e => { e.preventDefault(); handleForgot(); }}>
              <div className="form-group">
                <label className="form-label">Registered Email Address <span style={{color:'#e11d48'}}>*</span></label>
                <input 
                  ref={recoveryInputRef}
                  className={`form-input ${recoveryInputError ? 'invalid' : ''}`} 
                  value={recoveryInput} 
                  onChange={e => { setRecoveryInput(e.target.value); setError(''); setRecoveryInputError(false); }} 
                  type="email" 
                  placeholder="e.g. name@company.com" 
                  disabled={resetLoading} 
                />
              </div>
              <button 
                type="submit"
                className="btn-login" 
                style={{ marginTop: '10px', disabled: resetLoading }} 
                disabled={resetLoading}
              >
                {resetLoading ? 'Sending OTP...' : 'Send Verification OTP →'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button 
                  type="button"
                  onClick={() => { setShowForgot(false); setResetStep(1); setError(''); setRecoveryInputError(false); }} 
                  style={{ background: 'none', border: 'none', color: '#455fa0', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Back to Login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); handleReset(); }}>
              <div className="form-group">
                <label className="form-label">Verification Code (OTP) <span style={{color:'#e11d48'}}>*</span></label>
                <input 
                  ref={resetCodeRef}
                  className={`form-input ${resetCodeError ? 'invalid' : ''}`} 
                  value={resetCode} 
                  onChange={e => { setResetCode(e.target.value); setError(''); setResetCodeError(false); }} 
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
                    ref={newPassRef}
                    className={`form-input ${newPassError ? 'invalid' : ''}`} 
                    value={newPass} 
                    onChange={e => { setNewPass(e.target.value); setError(''); setNewPassError(false); }} 
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

                {/* Password Strength Indicator */}
                {newPass && (
                  <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                      <span style={{ color: '#64748b' }}>Password Strength:</span>
                      <span style={{ color: complexity.strength === 'Strong' ? '#16a34a' : (complexity.strength === 'Medium' ? '#ea580c' : '#dc2626') }}>
                        {complexity.strength}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: complexity.strength === 'Strong' ? '100%' : (complexity.strength === 'Medium' ? '66%' : '33%'),
                        background: complexity.strength === 'Strong' ? '#16a34a' : (complexity.strength === 'Medium' ? '#ea580c' : '#dc2626'),
                        borderRadius: '2px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}

                {/* Password Validation Requirements checklist */}
                <div style={{
                  marginTop: '8px',
                  padding: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  color: '#475569',
                  textAlign: 'left'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#334155', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Password Requirements:
                  </div>
                  <ul style={{ listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.length ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.length ? '✓' : '•'}</span> 8 to 32 characters long
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.uppercase ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.uppercase ? '✓' : '•'}</span> At least one uppercase letter (A–Z)
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.lowercase ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.lowercase ? '✓' : '•'}</span> At least one lowercase letter (a–z)
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.number ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.number ? '✓' : '•'}</span> At least one numeric digit (0–9)
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.specialChar ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.specialChar ? '✓' : '•'}</span> At least one special character (@, #, $, %, etc.)
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.noSpaces ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.noSpaces ? '✓' : '•'}</span> No spaces allowed
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: complexity.rules.noPersonalInfo ? '#16a34a' : '#64748b' }}>
                      <span style={{ fontWeight: 'bold' }}>{complexity.rules.noPersonalInfo ? '✓' : '•'}</span> Cannot contain personal information
                    </li>
                  </ul>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Confirm Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    ref={confirmPassRef}
                    className={`form-input ${confirmPassError ? 'invalid' : ''}`} 
                    value={confirmPass} 
                    onChange={e => { setConfirmPass(e.target.value); setError(''); setConfirmPassError(false); }} 
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
                type="submit"
                className="btn-login" 
                style={{
                  opacity: (resetLoading || isSubmitDisabled) ? 0.5 : 1,
                  cursor: (resetLoading || isSubmitDisabled) ? 'not-allowed' : 'pointer'
                }} 
                disabled={resetLoading || isSubmitDisabled}
              >
                {resetLoading ? 'Updating Password...' : 'Reset Password'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <button 
                  type="button"
                  onClick={handleForgot} 
                  disabled={resetLoading || resendTimer > 0} 
                  style={{
                    background: 'none', border: 'none', color: resendTimer > 0 ? '#94a3b8' : '#455fa0', fontSize: '13px', cursor: (resetLoading || resendTimer > 0) ? 'not-allowed' : 'pointer', fontWeight: '500'
                  }}
                >
                  {resendTimer > 0 ? `Resend OTP (${resendTimer}s)` : 'Resend OTP'}
                </button>

                <button 
                  type="button"
                  onClick={() => { setResetStep(1); setError(''); setResetCodeError(false); setNewPassError(false); setConfirmPassError(false); }} 
                  disabled={resetLoading} 
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: resetLoading ? 'not-allowed' : 'pointer' }}
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="login-card">
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
            ref={empIdRef}
            className={`form-input ${userIdError ? 'invalid' : ''}`} 
            value={empId} 
            onChange={e => { setEmpId(e.target.value); setError(''); setUserIdError(false); }} 
            type="text" 
            placeholder="Enter ID or Email"
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password <span style={{color:'#e11d48'}}>*</span></label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              ref={passRef}
              className={`form-input ${passwordError ? 'invalid' : ''}`} 
              value={pass} 
              onChange={e => { setPass(e.target.value); setError(''); setPasswordError(false); }} 
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
          <button type="button" onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', color: '#455fa0', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Forgot Password?</button>
        </div>
        <button type="submit" className="btn-login" disabled={loading}>
          {loading ? 'Signing In...' : 'Sign In →'}
        </button>
      </form>
    </div>
  );
}
