import React, { useEffect, useState } from 'react';
import api from './api';
import TimesheetGrid from './TimesheetGrid';
import confetti from 'canvas-confetti';
import { showAlert, showConfirm } from './AppModals';

const validateUsername = (username) => {
  if (!username || username.trim().length === 0) {
    return 'Username is required';
  }
  if (username.includes(' ')) {
    return 'Username cannot contain spaces';
  }
  if (!/^[a-zA-Z0-9.]+$/.test(username)) {
    return 'Only alphanumeric characters and dots are allowed';
  }
  if (username.startsWith('.')) {
    return 'Username must not start with a dot (.)';
  }
  if (username.endsWith('.')) {
    return 'Username must not end with a dot (.)';
  }
  if (username.includes('..')) {
    return 'Consecutive dots (..) are not allowed';
  }
  const dotCount = (username.match(/\./g) || []).length;
  if (dotCount > 2) {
    return 'A maximum of 2 dots (.) are allowed';
  }
  if (!/[a-zA-Z0-9]/.test(username)) {
    return 'At least one alphanumeric character is required';
  }
  return '';
};

const validateDomain = (domain) => {
  if (!domain || domain.trim().length === 0) {
    return 'Domain is required';
  }
  if (domain.includes(' ')) {
    return 'Domain must not contain spaces';
  }
  if (!domain.startsWith('@')) {
    return "Domain must start with '@'";
  }
  if (domain.includes('..')) {
    return 'Consecutive dots (..) are not allowed';
  }
  const withoutAt = domain.substring(1);
  if (withoutAt.length === 0) {
    return 'Domain name is required';
  }
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(withoutAt)) {
    return 'Domain must contain a valid domain name and extension (e.g. .com, .org)';
  }
  return '';
};

const parseModifications = (reasonStr) => {
  if (!reasonStr) return null;
  if (!reasonStr.startsWith("Modified:") || !reasonStr.includes("| Previous:") || !reasonStr.includes("| Now:")) {
    return null;
  }
  try {
    const parts = reasonStr.split("|");
    if (parts.length < 3) return null;

    const modifiedPart = parts[0].replace("Modified:", "").trim();
    const previousPart = parts[1].replace("Previous:", "").trim();
    const nowPart = parts[2].replace("Now:", "").trim();

    const prevMap = {};
    previousPart.split(";").forEach(item => {
      if (!item.trim()) return;
      const idx = item.indexOf(":");
      if (idx !== -1) {
        const key = item.substring(0, idx).trim().toLowerCase();
        const val = item.substring(idx + 1).trim();
        prevMap[key] = val;
      }
    });

    const newMap = {};
    nowPart.split(";").forEach(item => {
      if (!item.trim()) return;
      const idx = item.indexOf(":");
      if (idx !== -1) {
        const key = item.substring(0, idx).trim().toLowerCase();
        const val = item.substring(idx + 1).trim();
        newMap[key] = val;
      }
    });

    const fields = modifiedPart.split(",").map(f => f.trim());
    return fields.map(field => {
      let searchKey = field.toLowerCase();
      if (searchKey === "department") searchKey = "dept";
      if (searchKey === "joining date") searchKey = "dateofjoining";
      if (searchKey === "contact number") searchKey = "contactnumber";
      if (searchKey === "project") searchKey = "project name";
      if (searchKey === "company") searchKey = "company name";

      let prevVal = prevMap[searchKey] || prevMap[field.toLowerCase()] || "N/A";
      let newVal = newMap[searchKey] || newMap[field.toLowerCase()] || "N/A";

      if (prevVal === "N/A") {
        const foundKey = Object.keys(prevMap).find(k => k.includes(searchKey) || searchKey.includes(k));
        if (foundKey) prevVal = prevMap[foundKey];
      }
      if (newVal === "N/A") {
        const foundKey = Object.keys(newMap).find(k => k.includes(searchKey) || searchKey.includes(k));
        if (foundKey) newVal = newMap[foundKey];
      }

      return {
        fieldName: field,
        previousValue: prevVal,
        modifiedValue: newVal
      };
    });
  } catch (err) {
    console.error("Error parsing modifications", err);
    return null;
  }
};

const getDisplayCountry = (country) => {
  if (!country) return 'N/A';
  if (country.includes('IN') || country.includes('India') || country.includes('+91')) return 'India';
  if (country.includes('JP') || country.includes('Japan') || country.includes('+81')) return 'Japan';
  return country;
};

const getDisplayContactNumber = (contactNumber, country) => {
  if (!contactNumber) return 'N/A';
  if (contactNumber.includes(' | ')) {
    const parts = contactNumber.split(' | ');
    const codePart = parts[0];
    const numPart = parts[1];
    const code = codePart.includes('+91') ? '+91' : (codePart.includes('+81') ? '+81' : codePart);
    return `${code} ${numPart}`;
  }
  if (country) {
    const code = country.includes('+91') ? '+91' : (country.includes('+81') ? '+81' : '');
    if (code) {
      return `${code} ${contactNumber}`;
    }
  }
  return contactNumber;
};

const DomainSelect = ({ value, onChange, options, isError, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef(null);

  useEffect(() => {
    const clickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        disabled={disabled}
        className={`form-input ${isError ? 'invalid' : ''}`}
        style={{ paddingRight: '30px', marginBottom: '0px' }}
        placeholder="e.g. @oryfolks.com"
        value={value}
        onChange={(e) => {
          let val = e.target.value;
          onChange(val);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />
      <div
        onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '6px',
            marginTop: '4px',
            maxHeight: '150px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
          }}
        >
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#334155',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function AdminDashboard({ selectedEmployee, onSelectEmployee }) {
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'N/A';

    let dateStr = timestamp;
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
      dateStr = dateStr + 'Z';
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'N/A';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0 && Math.abs(diffMs) < 30000) {
      return 'Just Now';
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just Now';
    } else if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return date.toLocaleString();
    }
  };

  const [employees, setEmployees] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', empId: '', dept: '', manager: '', emailUsername: '', emailDomain: '@oryfolks.com', projectName: '', companyName: '', dateOfJoining: getTodayDateString(), country: '', contactNumber: '' });
  const [domains, setDomains] = useState(['@oryfolks.com', '@idealfolks.com', '@gmail.com']);
  const [formErrors, setFormErrors] = useState({});
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [formMessage, setFormMessage] = useState({ type: '', text: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [emailDuplicateError, setEmailDuplicateError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [contactDuplicateError, setContactDuplicateError] = useState('');
  const [isCheckingContact, setIsCheckingContact] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [viewProfileEmp, setViewProfileEmp] = useState(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedEmpForStatus, setSelectedEmpForStatus] = useState(null);
  const [statusAction, setStatusAction] = useState(''); // 'disable' or 'enable'
  const [statusReason, setStatusReason] = useState('');
  const [statusComments, setStatusComments] = useState('');
  const [isStatusProcessing, setIsStatusProcessing] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusReasonError, setStatusReasonError] = useState(false);
  const [statusCommentsError, setStatusCommentsError] = useState(false);
  const [statusSuccessMessage, setStatusSuccessMessage] = useState('');
  const [selectedLogForView, setSelectedLogForView] = useState(null);
  const [auditLogMonthFilter, setAuditLogMonthFilter] = useState(() => getTodayDateString().substring(0, 7));


  // Deletion Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedEmpForDelete, setSelectedEmpForDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEmployees = async () => {
    try {
      const res = await api.get('/admin/employees');
      setEmployees(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDomains = async () => {
    try {
      const res = await api.get('/admin/domains');
      if (res.data && res.data.length > 0) {
        setDomains(res.data);
      }
    } catch (e) {
      console.error("Failed to load email domains", e);
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.get('/admin/audit-logs');
      setAuditLogs(res.data);
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  useEffect(() => {
    if (!selectedEmployee) {
      loadEmployees();
    }
  }, [selectedEmployee]);

  const handleToggleStatus = (emp, e) => {
    e.stopPropagation();
    const action = emp.enabled !== false ? 'disable' : 'enable';
    setSelectedEmpForStatus(emp);
    setStatusAction(action);
    setStatusReason('');
    setStatusComments('');
    setStatusError('');
    setStatusReasonError(false);
    setStatusCommentsError(false);
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async () => {
    if (!selectedEmpForStatus || !statusAction) return;
    
    let hasError = false;
    let reasonErr = false;
    let commentsErr = false;
    let errorMsg = '';

    if (!statusReason) {
      reasonErr = true;
      hasError = true;
      errorMsg = `Please select a reason for ${statusAction === 'disable' ? 'disabling' : 'enabling'} the account.`;
    } else if (statusReason === 'Other' && !statusComments.trim()) {
      commentsErr = true;
      hasError = true;
      errorMsg = "Comments are required when 'Other' reason is selected.";
    }

    setStatusReasonError(reasonErr);
    setStatusCommentsError(commentsErr);

    if (hasError) {
      setStatusError(errorMsg);
      if (reasonErr) {
        setTimeout(() => {
          const el = document.getElementById("status-reason");
          if (el) el.focus();
        }, 50);
      } else if (commentsErr) {
        setTimeout(() => {
          const el = document.getElementById("status-comments");
          if (el) el.focus();
        }, 50);
      }
      return;
    }

    if (isStatusProcessing) return;
    setIsStatusProcessing(true);
    setStatusError('');
    try {
      await api.post(`/admin/employees/${selectedEmpForStatus.id}/${statusAction}`, {
        reason: statusReason,
        comments: statusComments
      });

      const successText = statusAction === 'disable'
        ? "Account disabled successfully."
        : "Account enabled successfully.";

      setIsStatusModalOpen(false);
      setSelectedEmpForStatus(null);
      setStatusAction('');
      setStatusReason('');
      setStatusComments('');
      setStatusSuccessMessage(successText);
      setTimeout(() => setStatusSuccessMessage(''), 3000);

      loadEmployees();
      if (isAuditModalOpen) {
        loadAuditLogs();
      }
    } catch (err) {
      setStatusError(extractErrorText(err, `Failed to ${statusAction} employee account`));
    } finally {
      setIsStatusProcessing(false);
    }
  };

  const getBadgeStyleForAction = (action) => {
    switch (action) {
      case 'Employee Created':
        return { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' };
      case 'Account_Disabled':
      case 'Employee Disabled':
        return { background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' };
      case 'Account_Enabled':
      case 'Employee Enabled/Reactivated':
      case 'Employee Enabled':
      case 'ENABLE_ACCOUNT':
        return { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' };
      case 'Employee Deleted':
        return { background: '#fbe9e7', color: '#d84315', border: '1px solid #ffab91' };
      case 'Employee Role Changed':
      case 'Employee Department Changed':
      case 'Employee Manager Changed':
        return { background: '#e8f2fa', color: '#1565c0', border: '1px solid #90caf9' };
      case 'Employee Updated/Modified':
      default:
        return { background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082' };
    }
  };

  const checkEmailUniqueness = async (emailVal) => {
    if (!emailVal || !emailVal.match(/^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$/)) {
      setEmailDuplicateError('');
      return true;
    }

    setIsCheckingEmail(true);
    try {
      const res = await api.get(`/admin/employees/check-email`, {
        params: {
          email: emailVal.trim()
        }
      });
      if (res.data && res.data.exists) {
        setEmailDuplicateError('Email already exists');
        setFormErrors(prev => ({ ...prev, emailUsername: 'Email already exists' }));
        return false;
      } else {
        setEmailDuplicateError('');
        setFormErrors(prev => {
          const copy = { ...prev };
          if (copy.emailUsername === 'Email already exists') {
            delete copy.emailUsername;
          }
          return copy;
        });
        return true;
      }
    } catch (e) {
      console.error("Failed to check email uniqueness", e);
      return true;
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const checkContactUniqueness = async (contactVal, excludeId) => {
    if (!contactVal || contactVal.trim().length === 0) {
      setContactDuplicateError('');
      return true;
    }
    setIsCheckingContact(true);
    try {
      const params = { 
        contactNumber: contactVal.trim(),
        country: newEmp.country
      };
      if (excludeId) params.excludeId = excludeId;
      const res = await api.get('/admin/employees/check-contact', { params });
      if (res.data && res.data.exists) {
        setContactDuplicateError('This contact number is already registered.');
        setFormErrors(prev => ({ ...prev, contactNumber: 'This contact number is already registered.' }));
        return false;
      } else {
        setContactDuplicateError('');
        setFormErrors(prev => {
          const copy = { ...prev };
          if (copy.contactNumber === 'This contact number is already registered.') {
            delete copy.contactNumber;
          }
          return copy;
        });
        return true;
      }
    } catch (e) {
      console.error('Failed to check contact uniqueness', e);
      return true;
    } finally {
      setIsCheckingContact(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    // Full Name: Only alphabets and spaces between characters. Min 3 chars, Max 32 chars.
    if (!newEmp.name || !newEmp.name.trim().match(/^[A-Za-z]+(?: [A-Za-z]+)*$/) || newEmp.name.trim().length < 3 || newEmp.name.trim().length > 32) {
      errors.name = 'Please enter a valid full name.';
    }

    // Employee ID: Allow spaces and all types. Length 3-20 chars.
    if (!newEmp.empId || newEmp.empId.trim().length < 3 || newEmp.empId.trim().length > 20) {
      errors.empId = 'Please enter a valid Employee ID.';
    }

    // Department: Must select a department.
    if (!newEmp.dept || newEmp.dept === 'Select Department') {
      errors.dept = 'Please select a department.';
    }

    // Manager: Only alphabets and spaces between characters. Min 3 chars, Max 32 chars.
    if (!newEmp.manager || !newEmp.manager.trim().match(/^[A-Za-z]+(?: [A-Za-z]+)*$/) || newEmp.manager.trim().length < 3 || newEmp.manager.trim().length > 32) {
      errors.manager = 'Please enter a valid manager name.';
    }

    // Email Validation (Username and Domain separate)
    const usernameErr = validateUsername(newEmp.emailUsername);
    const domainErr = validateDomain(newEmp.emailDomain);

    if (usernameErr) {
      errors.emailUsername = usernameErr;
    }
    if (domainErr) {
      errors.emailDomain = domainErr;
    }

    if (!usernameErr && !domainErr) {
      const combinedEmail = newEmp.emailUsername.trim() + newEmp.emailDomain.trim();
      if (combinedEmail.length > 254) {
        errors.emailUsername = 'Email cannot exceed 254 characters';
      } else if (emailDuplicateError) {
        errors.emailUsername = emailDuplicateError;
      }
    }

    // Project Name: Alphabets, numbers, spaces, and ()&@_- allowed. Min 2 chars, Max 32 chars.
    if (!newEmp.projectName || !newEmp.projectName.trim().match(/^[A-Za-z0-9 ()&@_-]+$/) || newEmp.projectName.trim().length < 2 || newEmp.projectName.trim().length > 32) {
      errors.projectName = 'Please enter a valid project name (only letters, numbers, spaces, and ()&@-_ allowed).';
    }

    // Company Name: Alphabets, numbers, spaces, and ()&@_- allowed. Min 2 chars, Max 32 chars.
    if (!newEmp.companyName || !newEmp.companyName.trim().match(/^[A-Za-z0-9 ()&@_-]+$/) || newEmp.companyName.trim().length < 2 || newEmp.companyName.trim().length > 32) {
      errors.companyName = 'Please enter a valid company name (only letters, numbers, spaces, and ()&@-_ allowed).';
    }

    // Date of Joining: Cannot be empty. Must be between 01-01-1999 and 30-12-2099.
    if (!newEmp.dateOfJoining || newEmp.dateOfJoining < '1999-01-01' || newEmp.dateOfJoining > '2099-12-30') {
      errors.dateOfJoining = 'Please select a valid joining date between 01-01-1999 and 30-12-2099.';
    }

    // Country selection
    if (!newEmp.country) {
      errors.country = 'Please select a country.';
    }

    // Contact number validation
    if (!newEmp.contactNumber || newEmp.contactNumber.trim().length === 0) {
      errors.contactNumber = 'Please enter a contact number.';
    } else {
      if (newEmp.country === 'India (+91)' || newEmp.country === 'IN (+91)') {
        if (!/^\d{10}$/.test(newEmp.contactNumber)) {
          errors.contactNumber = 'Please enter a valid 10-digit mobile number.';
        }
      } else if (newEmp.country === 'Japan (+81)' || newEmp.country === 'JP (+81)') {
        if (!/^\d{11}$/.test(newEmp.contactNumber)) {
          errors.contactNumber = 'Please enter a valid 11-digit mobile number.';
        }
      }
    }
    // Duplicate contact check (sync state)
    if (!errors.contactNumber && contactDuplicateError) {
      errors.contactNumber = contactDuplicateError;
    }

    const focusFirstError = (errs) => {
      const fieldsOrder = ['name', 'empId', 'dept', 'manager', 'emailUsername', 'emailDomain', 'projectName', 'companyName', 'dateOfJoining', 'country', 'contactNumber'];
      for (const field of fieldsOrder) {
        if (errs[field]) {
          setTimeout(() => {
            const el = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
            if (el) el.focus();
          }, 50);
          break;
        }
      }
    };

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return false;
    }
    return true;
  };

  const checkPrecedingFields = (currentField) => {
    const fieldsOrder = ['name', 'empId', 'dept', 'manager', 'emailUsername', 'emailDomain', 'projectName', 'companyName', 'dateOfJoining', 'country', 'contactNumber'];
    const currentIndex = fieldsOrder.indexOf(currentField);
    for (let i = 0; i < currentIndex; i++) {
      const field = fieldsOrder[i];
      const val = newEmp[field];
      if (!val || val.trim().length === 0 || (field === 'dept' && val === 'Select Department')) {
        setFormErrors(prev => ({ ...prev, [field]: 'Please fill in this field before proceeding.' }));
        setTimeout(() => {
          const el = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
          if (el) el.focus();
        }, 50);
        return false;
      }
    }
    return true;
  };

  const extractErrorText = (err, fallback) => {
    const data = err?.response?.data;
    if (data == null) return err?.message || fallback;
    if (typeof data === 'string') return data;
    if (typeof data === 'object') {
      const msg = data.message ?? data.error;
      return typeof msg === 'string' ? msg : fallback;
    }
    return String(data);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddEmployee = async () => {
    if (!validateForm()) return;

    // Final duplicate email validation check on submission
    const combinedEmail = newEmp.emailUsername.trim() + newEmp.emailDomain.trim();
    const isEmailUnique = await checkEmailUniqueness(combinedEmail);
    if (!isEmailUnique) {
      setFormErrors(prev => ({ ...prev, emailUsername: 'This email address is already registered' }));
      setTimeout(() => {
        const el = document.getElementById('emailUsername');
        if (el) el.focus();
      }, 50);
      return;
    }

    // Final duplicate contact number check on submission
    const isContactUnique = await checkContactUniqueness(newEmp.contactNumber);
    if (!isContactUnique) {
      setTimeout(() => {
        const el = document.getElementById('contactNumber');
        if (el) el.focus();
      }, 50);
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...newEmp,
        email: combinedEmail
      };
      delete payload.emailUsername;
      delete payload.emailDomain;

      await api.post('/admin/employees', payload);

      setNewEmp({ name: '', empId: '', dept: '', manager: '', emailUsername: '', emailDomain: '@oryfolks.com', projectName: '', companyName: '', dateOfJoining: getTodayDateString(), country: '', contactNumber: '' });
      setFormErrors({});
      setEmailDuplicateError('');
      setContactDuplicateError('');
      // Refresh employee list and clear search so the new employee is visible at the top
      loadEmployees();
      setSearchQuery('');
      loadDomains();

      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setShowSuccessModal(true);

      setTimeout(() => {
        setShowSuccessModal(false);
        setIsModalOpen(false);
        setFormMessage({ type: '', text: '' });
      }, 3000);
    } catch (e) {
      setFormMessage({ type: 'error', text: extractErrorText(e, 'Failed to add employee. Check if ID/Email exists.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isNewEmpDirty = () => {
    if (!isModalOpen) return false;
    return (newEmp.name || '').trim() !== '' ||
      (newEmp.empId || '').trim() !== '' ||
      (newEmp.dept || '').trim() !== '' ||
      (newEmp.manager || '').trim() !== '' ||
      (newEmp.emailUsername || '').trim() !== '' ||
      (newEmp.projectName || '').trim() !== '' ||
      (newEmp.companyName || '').trim() !== '' ||
      (newEmp.country || '') !== '' ||
      (newEmp.contactNumber || '').trim() !== '';
  };

  useEffect(() => {
    window.isAdminDashboardDirty = () => {
      return isNewEmpDirty();
    };
    return () => {
      delete window.isAdminDashboardDirty;
    };
  }, [isModalOpen, newEmp]);

  const handleCloseModal = async () => {
    if (isNewEmpDirty()) {
      const confirmLeave = await showConfirm(
        'Your changes have not been saved. Do you still want to close?',
        { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Discard', cancelLabel: 'Keep Editing' }
      );
      if (!confirmLeave) return;
    }
    setIsModalOpen(false);
    setNewEmp({ name: '', empId: '', dept: '', manager: '', emailUsername: '', emailDomain: '@oryfolks.com', projectName: '', companyName: '', dateOfJoining: getTodayDateString(), country: '', contactNumber: '' });
    setIsCustomDomain(false);
    setFormErrors({});
    setEmailDuplicateError('');
    setContactDuplicateError('');
    setFormMessage({ type: '', text: '' });
  };

  const handleSelectEmployee = (emp) => {
    onSelectEmployee(emp);
  };

  const [deleteMessage, setDeleteMessage] = useState('');

  const handleDeleteEmployee = (emp, e) => {
    e.stopPropagation();
    setSelectedEmpForDelete(emp);
    setDeleteReason('');
    setDeleteError('');
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteSubmit = async () => {
    if (!selectedEmpForDelete) return;
    if (!deleteReason.trim()) {
      setDeleteError("Reason for deletion is mandatory.");
      return;
    }

    setIsDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/admin/employees/${selectedEmpForDelete.id}?reason=${encodeURIComponent(deleteReason.trim())}`);
      setIsDeleteModalOpen(false);
      setSelectedEmpForDelete(null);
      setDeleteReason('');
      setDeleteMessage("Employee deleted successfully.");
      setTimeout(() => setDeleteMessage(''), 3000);
      loadEmployees();
      if (isAuditModalOpen) {
        loadAuditLogs();
      }
    } catch (err) {
      setDeleteError(extractErrorText(err, 'Failed to delete employee'));
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Export Employee List to Excel ────────────────────────────────
  const exportEmployeesToExcel = async () => {
    try {
      const filteredList = employees.filter(emp => emp.dept !== 'Administration');
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const filename = `EmployeeList_${monthNames[now.getMonth()]}${now.getFullYear()}.xlsx`;

      const payload = {
        employees: filteredList.map(emp => ({
          empId: emp.empId,
          name: emp.name,
          email: emp.email,
          dept: emp.dept,
          manager: emp.manager,
          projectName: emp.projectName,
          companyName: emp.companyName,
          enabled: emp.enabled
        })),
        filename
      };

      const response = await api.post('/admin/export/employees', payload, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      await showAlert('Failed to export: ' + (err.response?.data ? 'Server error' : err.message), { title: 'Export Failed', type: 'warn' });
    }
  };

  const filteredAuditLogs = auditLogs
    .filter(log => {
      if (!auditLogMonthFilter) return true;
      if (!log.timestamp) return false;

      let dateStr = log.timestamp;
      if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
        dateStr = dateStr + 'Z';
      }
      const localDate = new Date(dateStr);
      if (isNaN(localDate.getTime())) return false;
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}` === auditLogMonthFilter;
    })
    .sort((a, b) => b.id - a.id);

  // Employee search state & filter
  const [searchQuery, setSearchQuery] = useState('');
  const filteredEmployees = employees
    .filter(emp => emp.dept !== 'Administration')
    // Sort newest first so the most recently created employee appears at top
    .sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const db = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return db - da;
    })
    .filter(emp => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.empId || '').toLowerCase().includes(q)
      );
    });

  if (selectedEmployee) {
    return <TimesheetGrid employee={selectedEmployee} isAdmin={true} onBack={() => handleSelectEmployee(null)} />;
  }

  return (
    <div className="main-content" id="adminDash">
      <div id="adminListView">
        <div className="page-header">
          <div>
            <div className="page-title">Admin Dashboard</div>
            <div className="page-subtitle">Manage employees and view timesheets</div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-ghost btn-md" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: 0.5, cursor: 'not-allowed' }}
              disabled={true}
              title="Exporting employee list is disabled on the home page."
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export Excel
            </button>
            <button className="btn btn-ghost btn-md" onClick={() => { loadAuditLogs(); setIsAuditModalOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Audit Logs
            </button>
            <button className="btn btn-teal btn-md" onClick={() => setIsModalOpen(true)}>+ Add Employee</button>
          </div>
        </div>

        <div className="stat-grid" id="adminStatGrid">
          <div className="stat-card teal"><div className="stat-label">Total Employees</div><div className="stat-value">{employees.filter(emp => emp.dept !== 'Administration').length}</div></div>
        </div>

        {/* ── Search Bar ── */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 20px 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '50px',
            padding: '10px 20px',
            width: '480px',
            boxShadow: '0 2px 8px rgba(45,143,123,0.08)',
            transition: 'border-color 0.2s, box-shadow 0.2s'
          }}
            onFocusCapture={e => {
              e.currentTarget.style.borderColor = 'var(--teal)';
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(45,143,123,0.18)';
            }}
            onBlurCapture={e => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,143,123,0.08)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              id="empSearchInput"
              type="text"
              placeholder="Search name or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                color: '#1e293b',
                background: 'transparent',
                fontFamily: 'inherit',
                minWidth: 0
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                title="Clear"
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  flexShrink: 0,
                  lineHeight: 1,
                  padding: 0
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>


        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          All Employees
          {searchQuery.trim() && (
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
              {filteredEmployees.length} result{filteredEmployees.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="emp-list" id="empList">
          {filteredEmployees.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: '#94a3b8'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', color: '#cbd5e1' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>No employees found</div>
              <div style={{ fontSize: '12px' }}>Try searching by a different name or employee ID.</div>
            </div>
          ) : null}
          {filteredEmployees.map(emp => {
            const isInactive = emp.enabled === false;
            return (
              <div
                className="emp-card"
                key={emp.id}
                onClick={() => handleSelectEmployee(emp)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: isInactive ? 0.65 : 1,
                  filter: isInactive ? 'grayscale(40%)' : 'none',
                  backgroundColor: isInactive ? '#f8fafc' : '#ffffff',
                  transition: 'all 0.2s ease'
                }}
              >
                <div className="emp-info">
                  <div className="emp-avatar" style={{ background: isInactive ? '#94a3b8' : (emp.color || '#2d8f7b') }}>
                    {emp.initials || 'U'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="emp-name" style={{ color: isInactive ? '#64748b' : 'var(--navy)' }}>{emp.name}</span>
                      {isInactive ? (
                        <span style={{ fontSize: '10px', background: '#ffebee', color: '#c62828', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ef9a9a' }}>
                          Inactive
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', background: '#e8f5e9', color: '#2e7d32', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #a5d6a7' }}>
                          Active
                        </span>
                      )}
                    </div>
                    <div className="emp-id">{emp.empId}</div>
                    <div className="emp-dept">{emp.dept}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    title="View Profile"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewProfileEmp(emp);
                    }}
                    style={{ background: 'transparent', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </button>

                  {isInactive ? (
                    <button
                      type="button"
                      title="Enable employee account"
                      onClick={(e) => handleToggleStatus(emp, e)}
                      style={{ background: 'transparent', border: '1px solid #2d8f7b', color: '#2d8f7b', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="Disable employee account"
                      onClick={(e) => handleToggleStatus(emp, e)}
                      style={{ background: 'transparent', border: '1px solid #e28743', color: '#e28743', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </button>
                  )}

                  <button
                    type="button"
                    title="Delete employee"
                    onClick={(e) => handleDeleteEmployee(emp, e)}
                    style={{ background: 'transparent', border: '1px solid #e85d5d', color: '#e85d5d', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
                      <path d="M10 11v6"></path>
                      <path d="M14 11v6"></path>
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay open" id="addEmpModal">
          <div className="modal add-emp-modal">
            <div className="modal-header">
              <h3>Add New Employee</h3>
              <button className="modal-close" onClick={handleCloseModal} disabled={isSubmitting}>×</button>
            </div>
            {formMessage.text && (
              <div style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px', backgroundColor: formMessage.type === 'success' ? '#e8f5e9' : '#ffebee', color: formMessage.type === 'success' ? '#2e7d32' : '#c62828', fontSize: '13px', border: `1px solid ${formMessage.type === 'success' ? '#a5d6a7' : '#ef9a9a'}` }}>
                {typeof formMessage.text === 'string' ? formMessage.text : JSON.stringify(formMessage.text)}
              </div>
            )}
            <div className="modal-sub">Fill in the employee details below.</div>
            <form onSubmit={e => { e.preventDefault(); handleAddEmployee(); }} className="add-emp-form">
              <div className="modal-row">
                <div className="form-group">
                  <label className="form-label">FULL NAME <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="name"
                    name="name"
                    maxLength={32}
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.name ? 'invalid' : ''}`}
                    placeholder="e.g. Arjun Sharma"
                    value={newEmp.name}
                    onChange={e => {
                      const val = e.target.value;
                      setNewEmp({ ...newEmp, name: val });
                      if (val && !val.match(/^[A-Za-z ]*$/)) {
                        setFormErrors(prev => ({ ...prev, name: 'Only alphabets and spaces are allowed.' }));
                      } else {
                        setFormErrors(prev => ({ ...prev, name: '' }));
                      }
                    }}
                  />
                  {formErrors.name && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.name}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">EMPLOYEE ID <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="empId"
                    name="empId"
                    maxLength={32}
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.empId ? 'invalid' : ''}`}
                    placeholder="Enter Employee ID"
                    value={newEmp.empId}
                    onChange={e => {
                      if (!checkPrecedingFields('empId')) return;
                      setNewEmp({ ...newEmp, empId: e.target.value });
                      setFormErrors({ ...formErrors, empId: '' });
                      setFormMessage({ type: '', text: '' });
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('empId')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.empId && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.empId}</span>}
                </div>
              </div>

              <div className="modal-row">
                <div className="form-group">
                  <label className="form-label">DEPARTMENT <span style={{ color: '#e11d48' }}>*</span></label>
                  <select
                    id="dept"
                    name="dept"
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.dept ? 'invalid' : ''}`}
                    value={newEmp.dept}
                    onChange={e => {
                      if (!checkPrecedingFields('dept')) return;
                      setNewEmp({ ...newEmp, dept: e.target.value });
                      setFormErrors({ ...formErrors, dept: '' });
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('dept')) {
                        e.target.blur();
                      }
                    }}
                  >
                    <option value="">Select Department</option>
                    <option value="HR">HR</option>
                    <option value="IT">IT</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Operations">Operations</option>
                    <option value="Sales">Sales</option>
                    <option value="other">other</option>
                  </select>
                  {formErrors.dept && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.dept}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">MANAGER <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="manager"
                    name="manager"
                    maxLength={32}
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.manager ? 'invalid' : ''}`}
                    placeholder="e.g. Ravi Kumar"
                    value={newEmp.manager}
                    onChange={e => {
                      if (!checkPrecedingFields('manager')) return;
                      const val = e.target.value;
                      setNewEmp({ ...newEmp, manager: val });
                      if (val && !val.match(/^[A-Za-z ]*$/)) {
                        setFormErrors(prev => ({ ...prev, manager: 'Only alphabets and spaces are allowed.' }));
                      } else {
                        setFormErrors(prev => ({ ...prev, manager: '' }));
                      }
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('manager')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.manager && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.manager}</span>}
                </div>
              </div>

              <div className="modal-row">
                <div className="form-group" style={{ flex: 1, marginBottom: '15px' }}>
                  <label className="form-label">
                    EMAIL USERNAME <span style={{ color: '#e11d48' }}>*</span> {isCheckingEmail && <span style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginLeft: '6px' }}>Checking...</span>}
                  </label>
                  <input
                    id="emailUsername"
                    name="emailUsername"
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.emailUsername ? 'invalid' : ''}`}
                    placeholder="e.g. vinay.kumar"
                    value={newEmp.emailUsername || ''}
                    onChange={e => {
                      if (!checkPrecedingFields('emailUsername')) return;
                      const val = e.target.value.replace(/\s/g, '');
                      setNewEmp(prev => ({ ...prev, emailUsername: val }));
                      const err = validateUsername(val);
                      setFormErrors(prev => ({ ...prev, emailUsername: err }));
                      setEmailDuplicateError('');
                    }}
                    onBlur={async () => {
                      const combined = (newEmp.emailUsername || '').trim() + (newEmp.emailDomain || '').trim();
                      await checkEmailUniqueness(combined);
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('emailUsername')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.emailUsername && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.emailUsername}</span>}
                </div>

                <div className="form-group" style={{ flex: 1, marginBottom: '15px' }}>
                  <label className="form-label">
                    DOMAIN <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  {!isCustomDomain ? (
                    <select
                      disabled={isSubmitting}
                      className={`form-input ${formErrors.emailDomain ? 'invalid' : ''}`}
                      value={newEmp.emailDomain || ''}
                      onChange={async (e) => {
                        if (!checkPrecedingFields('emailDomain')) return;
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomDomain(true);
                          setNewEmp(prev => ({ ...prev, emailDomain: '@' }));
                          setFormErrors(prev => ({ ...prev, emailDomain: 'Domain is required' }));
                        } else {
                          setNewEmp(prev => ({ ...prev, emailDomain: val }));
                          const err = validateDomain(val);
                          setFormErrors(prev => ({ ...prev, emailDomain: err }));
                          setEmailDuplicateError('');
                          const combined = (newEmp.emailUsername || '').trim() + val;
                          await checkEmailUniqueness(combined);
                        }
                      }}
                      onFocus={e => {
                        if (!checkPrecedingFields('emailDomain')) {
                          e.target.blur();
                        }
                      }}
                    >
                      <option value="">Select Domain</option>
                      {domains.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      <option value="custom" style={{ fontWeight: 'bold', color: 'var(--teal)' }}>Other / Enter Manually...</option>
                    </select>
                  ) : (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        className={`form-input ${formErrors.emailDomain ? 'invalid' : ''}`}
                        style={{ paddingRight: '45px', marginBottom: '0px' }}
                        placeholder="e.g. @company.io"
                        value={newEmp.emailDomain || ''}
                        onChange={async (e) => {
                          if (!checkPrecedingFields('emailDomain')) return;
                          let val = e.target.value;
                          let cleanVal = val.trim();
                          if (cleanVal && !cleanVal.startsWith('@')) {
                            cleanVal = '@' + cleanVal;
                          }
                          setNewEmp(prev => ({ ...prev, emailDomain: cleanVal }));
                          const err = validateDomain(cleanVal);
                          setFormErrors(prev => ({ ...prev, emailDomain: err }));
                          setEmailDuplicateError('');
                          const combined = (newEmp.emailUsername || '').trim() + cleanVal;
                          await checkEmailUniqueness(combined);
                        }}
                        onFocus={e => {
                          if (!checkPrecedingFields('emailDomain')) {
                            e.target.blur();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomDomain(false);
                          setNewEmp(prev => ({ ...prev, emailDomain: domains[0] || '' }));
                          setFormErrors(prev => ({ ...prev, emailDomain: '' }));
                        }}
                        title="Back to list"
                        style={{
                          position: 'absolute',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: 'var(--teal)',
                          fontWeight: 'bold',
                          padding: '4px'
                        }}
                      >
                        List
                      </button>
                    </div>
                  )}
                  {formErrors.emailDomain && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.emailDomain}</span>}
                </div>
              </div>

              <div className="modal-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PROJECT NAME <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="projectName"
                    name="projectName"
                    maxLength={32}
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.projectName ? 'invalid' : ''}`}
                    placeholder="Enter Project Name"
                    value={newEmp.projectName}
                    onChange={e => {
                      if (!checkPrecedingFields('projectName')) return;
                      const val = e.target.value;
                      setNewEmp({ ...newEmp, projectName: val });
                      if (!val || val.trim().length === 0) {
                        setFormErrors(prev => ({ ...prev, projectName: 'Project name is required.' }));
                      } else if (!val.match(/^[A-Za-z0-9 ()&@_-]*$/)) {
                        setFormErrors(prev => ({ ...prev, projectName: 'Only alphabets, numbers, spaces, and ()&@-_ are allowed.' }));
                      } else if (val.trim().length < 2) {
                        setFormErrors(prev => ({ ...prev, projectName: 'Project name must be at least 2 characters.' }));
                      } else {
                        setFormErrors(prev => ({ ...prev, projectName: '' }));
                      }
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('projectName')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.projectName && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.projectName}</span>}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">COMPANY NAME <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="companyName"
                    name="companyName"
                    maxLength={32}
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.companyName ? 'invalid' : ''}`}
                    placeholder="Enter Company Name"
                    value={newEmp.companyName}
                    onChange={e => {
                      if (!checkPrecedingFields('companyName')) return;
                      const val = e.target.value;
                      setNewEmp({ ...newEmp, companyName: val });
                      if (!val || val.trim().length === 0) {
                        setFormErrors(prev => ({ ...prev, companyName: 'Company name is required.' }));
                      } else if (!val.match(/^[A-Za-z0-9 ()&@_-]*$/)) {
                        setFormErrors(prev => ({ ...prev, companyName: 'Only alphabets, numbers, spaces, and ()&@-_ are allowed.' }));
                      } else if (val.trim().length < 2) {
                        setFormErrors(prev => ({ ...prev, companyName: 'Company name must be at least 2 characters.' }));
                      } else {
                        setFormErrors(prev => ({ ...prev, companyName: '' }));
                      }
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('companyName')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.companyName && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.companyName}</span>}
                </div>
              </div>

              <div className="modal-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">DATE OF JOINING <span style={{ color: '#e11d48' }}>*</span></label>
                  <input
                    id="dateOfJoining"
                    name="dateOfJoining"
                    type="date"
                    disabled={isSubmitting}
                    className={`form-input ${formErrors.dateOfJoining ? 'invalid' : ''}`}
                    value={newEmp.dateOfJoining}
                    onChange={e => {
                      if (!checkPrecedingFields('dateOfJoining')) return;
                      setNewEmp({ ...newEmp, dateOfJoining: e.target.value });
                      setFormErrors({ ...formErrors, dateOfJoining: '' });
                    }}
                    onFocus={e => {
                      if (!checkPrecedingFields('dateOfJoining')) {
                        e.target.blur();
                      }
                    }}
                  />
                  {formErrors.dateOfJoining && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{formErrors.dateOfJoining}</span>}
                </div>

                <div className="form-group" style={{ flex: 1.2 }}>
                  <label className="form-label">CONTACT NUMBER <span style={{ color: '#e11d48' }}>*</span></label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select
                      id="country"
                      name="country"
                      disabled={isSubmitting}
                      className={`form-input ${formErrors.country ? 'invalid' : ''}`}
                      style={{ width: '80px', flexShrink: 0, paddingLeft: '8px', paddingRight: '4px' }}
                      value={newEmp.country}
                      onChange={e => {
                        if (!checkPrecedingFields('country')) return;
                        setNewEmp({ ...newEmp, country: e.target.value, contactNumber: '' });
                        setFormErrors({ ...formErrors, country: '', contactNumber: '' });
                      }}
                      onFocus={e => {
                        if (!checkPrecedingFields('country')) {
                          e.target.blur();
                        }
                      }}
                    >
                      <option value="">Code</option>
                      <option value="IN (+91)">IN (+91)</option>
                      <option value="JP (+81)">JP (+81)</option>
                    </select>
                    <input
                      id="contactNumber"
                      name="contactNumber"
                      maxLength={newEmp.country === 'Japan (+81)' || newEmp.country === 'JP (+81)' ? 11 : 10}
                      disabled={isSubmitting}
                      className={`form-input ${formErrors.contactNumber ? 'invalid' : ''}`}
                      style={{ flex: 1 }}
                      placeholder="Enter Number"
                      value={newEmp.contactNumber}
                      onChange={e => {
                        if (!checkPrecedingFields('contactNumber')) return;
                        const val = e.target.value.replace(/[^0-9]/g, ''); // numeric only
                        setNewEmp({ ...newEmp, contactNumber: val });
                        setContactDuplicateError('');
                        if (!val) {
                          setFormErrors(prev => ({ ...prev, contactNumber: 'Please enter a contact number.' }));
                        } else if ((newEmp.country === 'India (+91)' || newEmp.country === 'IN (+91)') && val.length !== 10) {
                          setFormErrors(prev => ({ ...prev, contactNumber: 'Please enter a valid 10-digit mobile number.' }));
                        } else if ((newEmp.country === 'Japan (+81)' || newEmp.country === 'JP (+81)') && val.length !== 11) {
                          setFormErrors(prev => ({ ...prev, contactNumber: 'Please enter a valid 11-digit mobile number.' }));
                        } else {
                          setFormErrors(prev => ({ ...prev, contactNumber: '' }));
                        }
                      }}
                      onFocus={e => {
                        if (!checkPrecedingFields('contactNumber')) {
                          e.target.blur();
                        }
                      }}
                      onBlur={async e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        // Only check uniqueness if the format is valid
                        const validLen = (newEmp.country === 'India (+91)' || newEmp.country === 'IN (+91)') ? 10
                          : (newEmp.country === 'Japan (+81)' || newEmp.country === 'JP (+81)') ? 11 : null;
                        if (val && (validLen === null || val.length === validLen)) {
                          await checkContactUniqueness(val);
                        }
                      }}
                    />
                  </div>
                  {formErrors.country && <span style={{ color: '#d32f2f', fontSize: '11px', display: 'block' }}>{formErrors.country}</span>}
                  {formErrors.contactNumber && <span style={{ color: '#d32f2f', fontSize: '11px', display: 'block' }}>{formErrors.contactNumber}</span>}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" style={{ flex: 1 }} onClick={handleCloseModal} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn-submit-modal" style={{ flex: 1, opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-overlay open" style={{ zIndex: 1002, background: 'rgba(0,0,0,0.6)' }}>
          <div className="modal" style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '350px', transform: 'scale(1)', animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <div style={{ fontSize: '70px', marginBottom: '15px', animation: 'bounce 1s infinite' }}>🎉</div>
            <h3 style={{ color: '#2d8f7b', fontSize: '22px', marginBottom: '10px' }}>Success!</h3>
            <div style={{ color: '#555', fontSize: '16px', fontWeight: '500' }}>Employee successfully added.</div>
          </div>
        </div>
      )}

      {isStatusModalOpen && selectedEmpForStatus && (
        <div className="modal-overlay open" style={{ zIndex: 1001, background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal" style={{ width: '400px', maxWidth: '90vw', padding: '24px' }}>
            <div className="modal-header">
              <h3>{statusAction === 'disable' ? 'Disable Account' : 'Enable Account'}</h3>
              <button className="modal-close" type="button" onClick={() => { if (!isStatusProcessing) { setIsStatusModalOpen(false); setSelectedEmpForStatus(null); } }} disabled={isStatusProcessing}>×</button>
            </div>
            <div className="modal-sub" style={{ marginBottom: '16px' }}>
              Select a reason for {statusAction === 'disable' ? 'deactivating' : 'reactivating'} <strong>{selectedEmpForStatus.name}</strong>'s account. This will {statusAction === 'disable' ? 'block' : 'restore'} their login access.
            </div>

            <form onSubmit={e => { e.preventDefault(); handleStatusSubmit(); }}>
              {statusError && (
                <div style={{
                  padding: '10px',
                  marginBottom: '15px',
                  borderRadius: '6px',
                  backgroundColor: '#ffebee',
                  color: '#c62828',
                  fontSize: '12px',
                  border: '1px solid #ef9a9a',
                  fontWeight: '500'
                }}>
                  {statusError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold' }}>{statusAction === 'disable' ? 'Deactivation Reason' : 'Reactivation Reason'} <span style={{ color: '#e11d48' }}>*</span></label>
                <select
                  id="status-reason"
                  className={`form-input ${statusReasonError ? 'invalid' : ''}`}
                  style={{ marginBottom: '0px', cursor: isStatusProcessing ? 'not-allowed' : 'default' }}
                  value={statusReason}
                  disabled={isStatusProcessing}
                  onChange={(e) => {
                    setStatusReason(e.target.value);
                    if (e.target.value) setStatusReasonError(false);
                  }}
                >
                  <option value="">Select Predefined Reason...</option>
                  {statusAction === 'disable' ? (
                    <>
                      <option value="Employee Resigned">Employee Resigned</option>
                      <option value="Employee Terminated">Employee Terminated</option>
                      <option value="Long-Term Leave">Long-Term Leave</option>
                      <option value="Duplicate Account">Duplicate Account</option>
                      <option value="Security Concern">Security Concern</option>
                      <option value="Temporary Deactivation">Temporary Deactivation</option>
                      <option value="Other">Other (custom comment required)</option>
                    </>
                  ) : (
                    <>
                      <option value="Employee Re-joined">Employee Re-joined</option>
                      <option value="Return from Leave">Return from Leave</option>
                      <option value="Security Issue Resolved">Security Issue Resolved</option>
                      <option value="Corrected Mistake">Corrected Mistake</option>
                      <option value="Temporary Reactivation">Temporary Reactivation</option>
                      <option value="Other">Other (custom comment required)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                  Comments/Remarks {statusReason === 'Other' && <span style={{ color: '#e11d48' }}>*</span>}
                </label>
                <textarea
                  id="status-comments"
                  className={`form-input ${statusCommentsError ? 'invalid' : ''}`}
                  style={{ resize: 'vertical', minHeight: '80px', marginBottom: '0px', width: '100%', cursor: isStatusProcessing ? 'not-allowed' : 'text' }}
                  placeholder={statusReason === 'Other' ? "Provide mandatory comment detail..." : "Add optional comments..."}
                  value={statusComments}
                  disabled={isStatusProcessing}
                  onChange={(e) => {
                    setStatusComments(e.target.value);
                    if (e.target.value.trim()) setStatusCommentsError(false);
                  }}
                />
                {statusReason === 'Other' && !statusComments.trim() && (
                  <span style={{ color: '#d32f2f', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    Comments are required when 'Other' reason is selected.
                  </span>
                )}
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  style={{ flex: 1, cursor: isStatusProcessing ? 'not-allowed' : 'pointer' }}
                  onClick={() => { setIsStatusModalOpen(false); setSelectedEmpForStatus(null); }}
                  disabled={isStatusProcessing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-modal"
                  style={{
                    flex: 1,
                    backgroundColor: statusAction === 'disable' ? '#e28743' : 'var(--teal)',
                    opacity: isStatusProcessing ? 0.6 : 1,
                    cursor: isStatusProcessing ? 'not-allowed' : 'pointer'
                  }}
                  disabled={isStatusProcessing}
                >
                  {isStatusProcessing ? (statusAction === 'disable' ? 'Disabling...' : 'Enabling...') : (statusAction === 'disable' ? 'Disable Account' : 'Enable Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && selectedEmpForDelete && (
        <div className="modal-overlay open" style={{ zIndex: 1001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
          <div className="modal" style={{ width: '420px', maxWidth: '90vw', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #fee2e2', paddingBottom: '12px' }}>
              <h3 style={{ color: '#e11d48', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ Delete Employee
              </h3>
              <button className="modal-close" type="button" onClick={() => { if (!isDeleting) { setIsDeleteModalOpen(false); setSelectedEmpForDelete(null); } }} disabled={isDeleting}>×</button>
            </div>
            <div className="modal-sub" style={{ margin: '14px 0 16px 0', color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete <strong>{selectedEmpForDelete.name}</strong> ({selectedEmpForDelete.empId})?
              This action is irreversible and will delete all associated timesheet entries.
            </div>

            <form onSubmit={e => { e.preventDefault(); confirmDeleteSubmit(); }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                  REASON FOR DELETION <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <textarea
                  id="delete-reason"
                  className={`form-input ${deleteError ? 'invalid' : ''}`}
                  style={{
                    resize: 'vertical',
                    minHeight: '90px',
                    width: '100%',
                    marginBottom: '0px',
                    cursor: isDeleting ? 'not-allowed' : 'text'
                  }}
                  placeholder="Please specify a valid reason for deletion..."
                  value={deleteReason}
                  disabled={isDeleting}
                  onChange={(e) => {
                    setDeleteReason(e.target.value);
                    if (e.target.value.trim()) setDeleteError('');
                  }}
                />
                {deleteError && (
                  <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                    {deleteError}
                  </span>
                )}
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  style={{ flex: 1, height: '40px', cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                  onClick={() => { setIsDeleteModalOpen(false); setSelectedEmpForDelete(null); }}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-modal"
                  style={{
                    flex: 1,
                    height: '40px',
                    backgroundColor: '#e11d48',
                    color: '#fff',
                    fontWeight: 'bold',
                    borderRadius: '8px',
                    border: 'none',
                    transition: 'all 0.2s',
                    opacity: isDeleting ? 0.6 : 1,
                    cursor: isDeleting ? 'not-allowed' : 'pointer'
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAuditModalOpen && (
        <div className="modal-overlay open" style={{ zIndex: 1001, background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal" style={{ width: '800px', maxWidth: '90vw', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Administrative Audit Logs
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-mid)', textTransform: 'uppercase', margin: 0, whiteSpace: 'nowrap' }}>Filter:</label>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      const picker = document.getElementById('auditMonthPickerInput');
                      if (picker) {
                        try {
                          picker.showPicker();
                        } catch (e) {
                          console.error("showPicker failed, fallback to click", e);
                          picker.click();
                        }
                      }
                    }}
                    style={{
                      background: 'var(--white)',
                      border: '1.5px solid var(--border)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      color: 'var(--navy)',
                      fontSize: '13px',
                      fontWeight: '600',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>
                      {auditLogMonthFilter ? (() => {
                        const [year, month] = auditLogMonthFilter.split('-');
                        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                        return d.toLocaleDateString('default', { month: 'long', year: 'numeric' });
                      })() : 'All Logs'}
                    </span>
                  </button>
                  <input
                    type="month"
                    id="auditMonthPickerInput"
                    value={auditLogMonthFilter}
                    onChange={(e) => setAuditLogMonthFilter(e.target.value)}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      pointerEvents: 'none',
                      border: 'none',
                      margin: 0,
                      padding: 0
                    }}
                  />
                </div>

                {auditLogMonthFilter && (
                  <button
                    onClick={() => setAuditLogMonthFilter('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--teal)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontWeight: '600',
                      marginLeft: '6px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <button className="modal-close" onClick={() => setIsAuditModalOpen(false)} style={{ margin: 0 }}>×</button>
            </div>

            <div className="no-scrollbar" style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
              {isLoadingLogs ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '13px' }}>
                  Loading logs...
                </div>
              ) : filteredAuditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                  No administrative logs found for the selected filter criteria.
                </div>
              ) : (
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20%' }}>Timestamp</th>
                      <th style={{ width: '20%' }}>Performed By</th>
                      <th style={{ width: '20%' }}>Target Employee</th>
                      <th style={{ width: '20%' }}>Action</th>
                      <th style={{ width: '20%' }}>Reason/Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log) => {
                      let dateStr = 'N/A';
                      if (log.timestamp) {
                        let parsedStr = log.timestamp;
                        if (typeof parsedStr === 'string' && !parsedStr.endsWith('Z') && !parsedStr.includes('+') && !parsedStr.includes('-')) {
                          parsedStr = parsedStr + 'Z';
                        }
                        dateStr = new Date(parsedStr).toLocaleString();
                      }
                      return (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap' }} title={dateStr}>
                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '12.5px' }}>{formatRelativeTime(log.timestamp)}</div>
                            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2.5px' }}>{dateStr}</div>
                          </td>
                          <td>
                            <div className="audit-actor-name">{log.performedByName}</div>
                            <div className="audit-actor-id">{log.performedByEmpId}</div>
                          </td>
                          <td>
                            <div className="audit-target-name">{log.affectedName}</div>
                            <div className="audit-target-id">{log.affectedEmpId}</div>
                          </td>
                          <td>
                            <span className="audit-badge" style={getBadgeStyleForAction(log.action)}>
                              {log.action}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {log.reason ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600' }}
                                onClick={() => setSelectedLogForView(log)}
                              >
                                View
                              </button>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <button className="btn btn-ghost btn-md" onClick={() => setIsAuditModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLogForView && (() => {
        const parsedMods = parseModifications(selectedLogForView.reason);
        return (
          <div className="modal-overlay open" style={{ zIndex: 1002, background: 'rgba(0,0,0,0.6)' }}>
            <div className="modal" style={{ width: parsedMods ? '620px' : '420px', maxWidth: '90vw', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  Audit Log Details
                </h3>
                <button className="modal-close" onClick={() => setSelectedLogForView(null)}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Timestamp</div>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744' }}>
                      {(() => {
                        let parsedStr = selectedLogForView.timestamp;
                        if (typeof parsedStr === 'string' && !parsedStr.endsWith('Z') && !parsedStr.includes('+') && !parsedStr.includes('-')) {
                          parsedStr = parsedStr + 'Z';
                        }
                        return parsedStr ? new Date(parsedStr).toLocaleString() : 'N/A';
                      })()}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2.5px' }}>{formatRelativeTime(selectedLogForView.timestamp)}</div>
                  </div>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Action</div>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744', marginTop: 'auto', marginBottom: 'auto' }}>
                      <span className="audit-badge" style={{ ...getBadgeStyleForAction(selectedLogForView.action), display: 'inline-block', width: 'fit-content' }}>
                        {selectedLogForView.action}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Target Employee</div>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744' }}>{selectedLogForView.affectedName}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>ID: {selectedLogForView.affectedEmpId}</div>
                  </div>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Performed By</div>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744' }}>{selectedLogForView.performedByName}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>ID: {selectedLogForView.performedByEmpId}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Updated Modifications</div>
                  {parsedMods ? (
                    <div className="no-scrollbar" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '10px 12px', fontWeight: '600', color: '#475569' }}>Field Name</th>
                            <th style={{ padding: '10px 12px', fontWeight: '600', color: '#475569' }}>Previous Value</th>
                            <th style={{ padding: '10px 12px', fontWeight: '600', color: '#475569' }}>Modified Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedMods.map((mod, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === parsedMods.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                              <td style={{ padding: '10px 12px', fontWeight: '600', color: '#1e293b' }}>{mod.fieldName}</td>
                              <td style={{ padding: '10px 12px', color: '#ef4444', backgroundColor: '#fff5f5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{mod.previousValue}</td>
                              <td style={{ padding: '10px 12px', color: '#10b981', backgroundColor: '#f0fdf4', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{mod.modifiedValue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ background: '#fffcf6', padding: '14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#713f12' }}>{selectedLogForView.reason}</div>
                    </div>
                  )}
                </div>

                {selectedLogForView.comments && (
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Comments / Remarks</div>
                    <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>{selectedLogForView.comments}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                <button className="btn btn-ghost btn-md" onClick={() => setSelectedLogForView(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {deleteMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#4CAF50',
          color: '#fff',
          padding: '15px 25px',
          borderRadius: '6px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          zIndex: 9999,
          fontWeight: 'bold',
          animation: 'slideInRight 0.3s ease-out'
        }}>
          {deleteMessage}
        </div>
      )}

      {statusSuccessMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#4CAF50',
          color: '#fff',
          padding: '15px 25px',
          borderRadius: '6px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          zIndex: 9999,
          fontWeight: 'bold',
          animation: 'slideInRight 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {statusSuccessMessage}
        </div>
      )}

      {viewProfileEmp && (
        <div 
          className="modal-overlay open" 
          style={{ zIndex: 1002 }}
          onClick={() => setViewProfileEmp(null)}
        >
          <div 
            className="modal add-emp-modal" 
            style={{ 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.04)',
              borderRadius: '16px',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '28px 28px 24px',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '20px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '18px', fontWeight: '700' }}>
                Employee Profile
              </h3>
              <button 
                className="modal-close" 
                onClick={() => setViewProfileEmp(null)}
                style={{ fontSize: '20px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* Profile Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: viewProfileEmp.color || '#2d8f7b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                marginBottom: '10px'
              }}>
                {viewProfileEmp.initials || viewProfileEmp.name?.charAt(0) || 'U'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--navy)' }}>{viewProfileEmp.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{viewProfileEmp.role === 'admin' ? 'Administrator' : (viewProfileEmp.dept || 'Employee')}</div>
            </div>

            {/* Details Fields */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px 20px',
              textAlign: 'left',
              fontSize: '13px',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '20px',
              marginBottom: '12px',
              overflowY: 'auto'
            }}>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee ID</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.empId || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.dept || 'N/A'}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px', wordBreak: 'break-all' }}>{viewProfileEmp.email || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Manager</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.manager || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date of Joining</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.dateOfJoining || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Project Name</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.projectName || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Company Name</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{viewProfileEmp.companyName || 'N/A'}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Country</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{getDisplayCountry(viewProfileEmp.country)}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Number</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{getDisplayContactNumber(viewProfileEmp.contactNumber, viewProfileEmp.country)}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Created</span>
                <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>
                  {viewProfileEmp.createdAt ? new Date(viewProfileEmp.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, marginTop: '20px' }}>
              <button
                className="btn btn-ghost btn-md"
                onClick={() => setViewProfileEmp(null)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13.5px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes slideInRight {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        
        .audit-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
          text-align: left;
        }
        .audit-table th {
          padding: 12px 16px;
          background: #f8fafc;
          color: #475569;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #cbd5e1;
          border-top: none;
          border-left: none;
          border-right: none;
        }
        .audit-table td {
          padding: 12px 16px;
          vertical-align: middle;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
          border-top: none;
          border-left: none;
          border-right: none;
        }
        .audit-table tr {
          transition: background 0.15s ease;
        }
        .audit-table tr:hover td {
          background: #f8fafc;
        }
        .audit-actor-name, .audit-target-name {
          font-weight: 600;
          color: #1a2744;
        }
        .audit-actor-id, .audit-target-id {
          font-size: 10.5px;
          color: #64748b;
          font-family: monospace;
          margin-top: 2px;
        }
        .audit-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 10.5px;
          font-weight: bold;
        }
        .audit-badge.disable {
          background: #ffebee;
          color: #c62828;
          border: 1px solid #ef9a9a;
        }
        .audit-badge.enable {
          background: #e8f5e9;
          color: #2e7d32;
          border: 1px solid #a5d6a7;
      `}</style>
    </div>
  );
}
