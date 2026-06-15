/**
 * AppModals.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacements for window.alert() and window.confirm() that render
 * fully-styled modals matching the application design system.
 *
 * Usage (async/await, works just like native):
 *   import { showAlert, showConfirm } from './AppModals';
 *
 *   await showAlert('Something went wrong.');
 *   const ok = await showConfirm('Are you sure you want to delete this?');
 *   if (ok) { ... }
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ─── Shared style tokens (mirrors index.css variables) ────────────────────────
const STYLES = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    animation: 'appModalFadeIn 0.15s ease',
  },
  box: {
    background: '#ffffff',
    borderRadius: '14px',
    boxShadow: '0 20px 60px -10px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.06)',
    padding: '28px 28px 22px',
    width: '100%',
    maxWidth: '420px',
    fontFamily: "'Inter', 'Outfit', sans-serif",
    animation: 'appModalSlideIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
  },
  iconWrap: (color) => ({
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: color + '18',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '14px',
    flexShrink: 0,
  }),
  title: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: '8px',
    lineHeight: '1.3',
  },
  message: {
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.6',
    marginBottom: '22px',
  },
  btnRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  btnCancel: {
    padding: '9px 20px',
    borderRadius: '8px',
    border: '1.5px solid #e2e8f0',
    background: '#f8fafc',
    color: '#475569',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    lineHeight: '1',
  },
  btnConfirm: (color) => ({
    padding: '9px 22px',
    borderRadius: '8px',
    border: 'none',
    background: color,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    lineHeight: '1',
  }),
};

// Inject keyframe animations once
if (typeof document !== 'undefined' && !document.getElementById('app-modal-keyframes')) {
  const style = document.createElement('style');
  style.id = 'app-modal-keyframes';
  style.textContent = `
    @keyframes appModalFadeIn  { from { opacity:0 } to { opacity:1 } }
    @keyframes appModalSlideIn { from { opacity:0; transform:scale(0.92) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
  `;
  document.head.appendChild(style);
}

// ─── Icon components ──────────────────────────────────────────────────────────
const InfoIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const WarnIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const QuestionIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const TrashIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

// ─── Modal inner component ─────────────────────────────────────────────────────
function AppModal({ type, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, onClose }) {
  // Determine colour and icon from type
  const config = {
    alert:   { color: '#1a274f', Icon: InfoIcon,     confirm: 'OK' },
    warn:    { color: '#d97706', Icon: WarnIcon,     confirm: 'OK' },
    confirm: { color: '#1a274f', Icon: QuestionIcon, confirm: 'Confirm' },
    danger:  { color: '#dc2626', Icon: WarnIcon,     confirm: 'Delete' },
    leave:   { color: '#d97706', Icon: WarnIcon,     confirm: 'Leave' },
    remove:  { color: '#dc2626', Icon: TrashIcon,    confirm: 'Remove' },
  }[type] || { color: '#1a274f', Icon: InfoIcon, confirm: 'OK' };

  const color = config.color;
  const Icon  = config.Icon;
  const resolvedConfirmLabel = confirmLabel || config.confirm;
  const resolvedCancelLabel  = cancelLabel  || 'Cancel';

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (onCancel) onCancel();
        else if (onClose) onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel, onClose]);

  const isAlertOnly = !onCancel; // alert — only OK button

  return (
    <div style={STYLES.overlay} onClick={(e) => { if (e.target === e.currentTarget) { if (onCancel) onCancel(); else if (onClose) onClose(); } }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onConfirm) onConfirm();
          else if (onClose) onClose();
        }}
        style={STYLES.box} 
        role="dialog" 
        aria-modal="true" 
        aria-label={title || 'Application dialog'}
      >
        <div style={STYLES.iconWrap(color)}>
          <Icon color={color} />
        </div>

        {title && <div style={STYLES.title}>{title}</div>}
        <div style={{ ...STYLES.message, marginBottom: isAlertOnly ? '22px' : '22px' }}>{message}</div>

        <div style={STYLES.btnRow}>
          {!isAlertOnly && (
            <button
              type="button"
              style={STYLES.btnCancel}
              onClick={onCancel}
              onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            >
              {resolvedCancelLabel}
            </button>
          )}
          <button
            type="submit"
            style={STYLES.btnConfirm(color)}
            autoFocus
            onMouseOver={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Mount helper ─────────────────────────────────────────────────────────────
function mountModal(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = () => {
    root.unmount();
    document.body.removeChild(container);
  };

  root.render(<AppModal {...props} onClose={cleanup} />);
  return cleanup;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * showAlert(message, { title?, type? })
 * Resolves when the user clicks OK.
 */
export function showAlert(message, { title, type = 'alert' } = {}) {
  return new Promise((resolve) => {
    let cleanup;
    cleanup = mountModal({
      type,
      title,
      message,
      onConfirm: () => { cleanup(); resolve(); },
      onClose:   () => { cleanup(); resolve(); },
    });
  });
}

/**
 * showConfirm(message, { title?, type?, confirmLabel?, cancelLabel? })
 * Resolves true if confirmed, false if cancelled.
 */
export function showConfirm(message, { title, type = 'confirm', confirmLabel, cancelLabel } = {}) {
  return new Promise((resolve) => {
    let cleanup;
    cleanup = mountModal({
      type,
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm: () => { cleanup(); resolve(true); },
      onCancel:  () => { cleanup(); resolve(false); },
    });
  });
}

// ─── Inline React hook variant (for use inside React component trees) ─────────
// When you need the modal to be part of the React component rendering.
export function useAppModal() {
  const [modal, setModal] = useState(null);

  const closeModal = useCallback(() => setModal(null), []);

  const alert = useCallback((message, opts = {}) =>
    new Promise(resolve => {
      setModal({ ...opts, type: opts.type || 'alert', message, isAlert: true, resolve });
    }), []);

  const confirm = useCallback((message, opts = {}) =>
    new Promise(resolve => {
      setModal({ ...opts, type: opts.type || 'confirm', message, isAlert: false, resolve });
    }), []);

  const ModalRenderer = modal ? (
    <AppModal
      type={modal.type}
      title={modal.title}
      message={modal.message}
      confirmLabel={modal.confirmLabel}
      cancelLabel={modal.cancelLabel}
      onConfirm={() => { closeModal(); modal.resolve(true); }}
      onCancel={modal.isAlert ? undefined : () => { closeModal(); modal.resolve(false); }}
      onClose={() => { closeModal(); modal.resolve(modal.isAlert ? undefined : false); }}
    />
  ) : null;

  return { alert, confirm, ModalRenderer };
}

export default AppModal;
