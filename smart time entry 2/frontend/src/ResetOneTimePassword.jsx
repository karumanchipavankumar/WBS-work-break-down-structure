import React, { useState, useEffect, useRef } from 'react';
import api from './api';

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

export default function ResetOneTimePassword({ token, onBackToLogin }) {
  const [verifying, setVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [logoSrc, setLogoSrc] = useState('/logo.jpg');
  
  // Input states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Eye toggle states
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Refs and error highlights
  const oldPasswordRef = useRef(null);
  const newPasswordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const [oldPasswordError, setOldPasswordError] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);

  // Dynamic canvas-based transparency processing for the company logo
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
        console.error("Logo processing error in reset page", err);
      }
    };
  }, []);

  // Verify token validity on load
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setIsValid(false);
      return;
    }

    api.get(`/auth/verify-reset-token?token=${token}`)
      .then(res => {
        setVerifying(false);
        if (res.data.valid) {
          setIsValid(true);
          setEmployeeName(res.data.name);
          setEmployeeEmail(res.data.email || '');
          setEmployeeId(res.data.empId || '');
        } else {
          setIsValid(false);
        }
      })
      .catch(err => {
        console.error("Token verification request failed", err);
        setVerifying(false);
        setIsValid(false);
      });
  }, [token]);

  const personalInfo = { name: employeeName, email: employeeEmail, empId: employeeId };
  const complexity = validatePasswordComplexity(newPassword, personalInfo);
  const isSubmitDisabled = !complexity.allValid || newPassword !== confirmPassword || !oldPassword.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setOldPasswordError(false);
    setNewPasswordError(false);
    setConfirmPasswordError(false);

    if (!oldPassword.trim()) {
      setErrorMsg('Please enter your temporary/old password.');
      setOldPasswordError(true);
      if (oldPasswordRef.current) oldPasswordRef.current.focus();
      return;
    }
    if (!newPassword.trim()) {
      setErrorMsg('Please enter your new password.');
      setNewPasswordError(true);
      if (newPasswordRef.current) newPasswordRef.current.focus();
      return;
    }
    if (!confirmPassword.trim()) {
      setErrorMsg('Please confirm your new password.');
      setConfirmPasswordError(true);
      if (confirmPasswordRef.current) confirmPasswordRef.current.focus();
      return;
    }
    const personalInfo = { name: employeeName, email: employeeEmail, empId: employeeId };
    const complexity = validatePasswordComplexity(newPassword, personalInfo);
    if (!complexity.allValid) {
      setErrorMsg(complexity.messages[0]);
      setNewPasswordError(true);
      if (newPasswordRef.current) newPasswordRef.current.focus();
      return;
    }
    if (newPassword === oldPassword) {
      setErrorMsg('New password cannot be the same as your current/temporary password.');
      setNewPasswordError(true);
      if (newPasswordRef.current) newPasswordRef.current.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      setConfirmPasswordError(true);
      if (confirmPasswordRef.current) confirmPasswordRef.current.focus();
      return;
    }

    setLoading(true);

    api.post('/auth/reset-one-time-password', { 
      token, 
      oldPassword: 'base64:' + btoa(unescape(encodeURIComponent(oldPassword))), 
      newPassword: 'base64:' + btoa(unescape(encodeURIComponent(newPassword))) 
    })
      .then(res => {
        setSuccessMsg(res.data.message || 'Password successfully setup! Redirecting to login...');
        // Delay to show success animation
        setTimeout(() => {
          handleCleanRedirect();
        }, 3000);
      })
      .catch(err => {
        console.error("Reset password request failed", err);
        const data = err.response?.data;
        const msg = data?.message || 'Failed to setup password. Please try again.';
        setErrorMsg(msg);
        
        if (msg.includes('history') || msg.includes('previous') || msg.includes('reuse') || msg.includes('last 3')) {
          setNewPasswordError(true);
          setConfirmPasswordError(true);
          if (newPasswordRef.current) newPasswordRef.current.focus();
        } else if (msg.includes('temporary') || msg.includes('current') || msg.includes('old')) {
          setOldPasswordError(true);
          if (oldPasswordRef.current) oldPasswordRef.current.focus();
        } else {
          setNewPasswordError(true);
          if (newPasswordRef.current) newPasswordRef.current.focus();
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleCleanRedirect = () => {
    // Clear token query parameters from browser URL
    window.history.replaceState(null, '', '/');
    onBackToLogin();
  };

  return (
    <div className="login-screen" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a2744 0%, #2e4070 50%, #2d8f7b 100%)', padding: '20px' }}>
      <div className="login-card" style={{ background: '#fff', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '440px', boxShadow: '0 8px 32px rgba(26,39,68,0.16)', boxSizing: 'border-box' }}>
        
        {/* Brand Logo Header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <img src={logoSrc} alt="Folks Ideal Logo" style={{ height: '48px', objectFit: 'contain' }} />
        </div>

        {verifying ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{
              width: '35px',
              height: '35px',
              border: '3px solid #cbd5e1',
              borderTopColor: '#2d8f7b',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 15px auto'
            }}></div>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
            <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Verifying secure link...</div>
          </div>
        ) : !isValid ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ fontSize: '20px', color: '#1e293b', fontWeight: '700', marginBottom: '10px' }}>Secure Link Invalid</h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.6', marginBottom: '24px' }}>
              This secure password setup link is invalid, expired, or has already been used. Please request a new setup link from your administrator.
            </p>
            <button 
              onClick={handleCleanRedirect}
              style={{
                width: '100%',
                padding: '12px',
                background: '#2d8f7b',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.opacity = 0.9}
              onMouseOut={e => e.currentTarget.style.opacity = 1}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '20px', color: '#1e293b', fontWeight: '700', marginBottom: '4px', textAlign: 'center' }}>Set Your Password</h3>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '24px', textAlign: 'center', lineHeight: '1.5' }}>
              Welcome <strong style={{ color: '#1e293b' }}>{employeeName}</strong>! Please verify your temporary credentials and set up your secure password.
            </p>

            {errorMsg && (
              <div style={{ background: '#fdeaea', color: '#d94f4f', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '500', marginBottom: '18px', textAlign: 'left', border: '1px solid #fca5a5' }}>
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div style={{ background: '#eaf3ea', color: '#5a8f5a', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '600', marginBottom: '18px', textAlign: 'center', border: '1px solid #86efac' }}>
                <span style={{ fontSize: '16px', marginRight: '6px' }}>✓</span> {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px', textAlign: 'left' }}>Temporary / Old Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    ref={oldPasswordRef}
                    type={showOldPassword ? "text" : "password"} 
                    value={oldPassword}
                    onChange={e => { setOldPassword(e.target.value); setOldPasswordError(false); setErrorMsg(''); }}
                    placeholder="Enter temporary password from email"
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 14px',
                      border: '1.5px solid #dde3ef',
                      borderColor: oldPasswordError ? '#d94f4f' : '#dde3ef',
                      boxShadow: oldPasswordError ? '0 0 0 2.5px rgba(217, 79, 79, 0.2)' : 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#1a2744',
                      background: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#64748b',
                      outline: 'none'
                    }}
                  >
                    {showOldPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px', textAlign: 'left' }}>New Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    ref={newPasswordRef}
                    type={showNewPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setNewPasswordError(false); setErrorMsg(''); }}
                    placeholder="At least 6 characters"
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 14px',
                      border: '1.5px solid #dde3ef',
                      borderColor: newPasswordError ? '#d94f4f' : '#dde3ef',
                      boxShadow: newPasswordError ? '0 0 0 2.5px rgba(217, 79, 79, 0.2)' : 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#1a2744',
                      background: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#64748b',
                      outline: 'none'
                    }}
                  >
                    {showNewPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword && (
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

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px', textAlign: 'left' }}>Confirm New Password <span style={{color:'#e11d48'}}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    ref={confirmPasswordRef}
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setConfirmPasswordError(false); setErrorMsg(''); }}
                    placeholder="Repeat new password"
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 14px',
                      border: '1.5px solid #dde3ef',
                      borderColor: confirmPasswordError ? '#d94f4f' : '#dde3ef',
                      boxShadow: confirmPasswordError ? '0 0 0 2.5px rgba(217, 79, 79, 0.2)' : 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      color: '#1a2744',
                      background: '#fff',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#64748b',
                      outline: 'none'
                    }}
                  >
                    {showConfirmPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading || !!successMsg || isSubmitDisabled}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'linear-gradient(135deg, #2d8f7b, #2e4070)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14.5px',
                  fontWeight: '600',
                  cursor: (loading || successMsg || isSubmitDisabled) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                  marginTop: '6px',
                  opacity: (loading || successMsg || isSubmitDisabled) ? 0.5 : 1
                }}
              >
                {loading ? 'Setting up account...' : 'Save and Continue'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
