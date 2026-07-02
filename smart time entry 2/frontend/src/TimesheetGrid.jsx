import React, { useState, useEffect } from 'react';
import { format, getDaysInMonth, startOfMonth, addDays, isSameDay, getDay, isAfter, parseISO, startOfDay } from 'date-fns';
import api from './api';
import { showAlert, showConfirm } from './AppModals';
import confetti from 'canvas-confetti';

const safeErrorText = (err, fallback) => {
  const data = err?.response?.data;
  if (data == null) return err?.message || fallback;
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    const msg = data.message ?? data.error;
    return typeof msg === 'string' ? msg : fallback;
  }
};

const validateAndCleanReason = (text, fieldName = 'Reason') => {
  if (!text) {
    return { isValid: false, cleaned: '', error: `${fieldName} is mandatory.` };
  }
  // Sanitize input to prevent HTML/JavaScript/XML injection by stripping tags
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Normalize spacing on each line while preserving line breaks
  const lines = sanitized.split('\n');
  const cleanedLines = lines.map(line => line.replace(/[ \t]+/g, ' ').trim());
  let cleaned = cleanedLines.join('\n').trim();
  
  if (!cleaned) {
    return { isValid: false, cleaned: '', error: `${fieldName} is mandatory.` };
  }
  
  // Count words: split by whitespace
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 320) {
    return { isValid: false, cleaned, error: 'Reason cannot exceed 320 words.' };
  }
  
  if (cleaned.length < 10) {
    return { isValid: false, cleaned, error: `${fieldName} must be at least 10 characters.` };
  }
  
  return { isValid: true, cleaned, error: '' };
};

const isPastDeadline = (dateStr) => {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed month
  
  const deadline = new Date(year, month + 1, 15, 23, 59, 59, 999);
  const today = new Date();
  return today > deadline;
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

const getExportFilename = (empName, empId, fromStr, toStr) => {
  if (!fromStr || !toStr) return `${empId}_timesheet.xlsx`;
  try {
    const start = parseISO(fromStr);
    const end = parseISO(toStr);
    const startMonth = format(start, 'MMMM');
    const startYear = format(start, 'yyyy');
    const endMonth = format(end, 'MMMM');
    const endYear = format(end, 'yyyy');
    
    const startLabel = `${startMonth}-${startYear}`;
    const endLabel = `${endMonth}-${endYear}`;
    
    if (startLabel === endLabel) {
      return `${empName}_${empId}_${startLabel}.xlsx`;
    } else {
      return `${empName}_${empId}_${startLabel} - ${endLabel}.xlsx`;
    }
  } catch (e) {
    return `${empId}_timesheet.xlsx`;
  }
};

const UnifiedTimeSelection = ({ value, onChange, disabled, isError }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  const blurTimeoutRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // Generate 30-minute intervals
  const timeSlots = React.useMemo(() => {
    const slots = [];
    for (let h = 0; h < 24; h++) {
      const hourStr = String(h).padStart(2, '0');
      slots.push(`${hourStr}:00`);
      slots.push(`${hourStr}:30`);
    }
    return slots;
  }, []);

  // Handle click outside to close dropdown
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sync highlightedIndex when dropdown is opened/closed or value changes
  React.useEffect(() => {
    if (isOpen && value) {
      const idx = timeSlots.indexOf(value);
      if (idx !== -1) {
        setHighlightedIndex(idx);
      } else {
        setHighlightedIndex(-1);
      }
    } else if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen, value, timeSlots]);

  // Scroll the highlighted option into view
  React.useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const container = dropdownRef.current;
      const item = container.children[highlightedIndex];
      if (item) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const itemTop = item.offsetTop;
        const itemBottom = itemTop + item.clientHeight;

        if (itemTop < containerTop) {
          container.scrollTop = itemTop;
        } else if (itemBottom > containerBottom) {
          container.scrollTop = itemBottom - container.clientHeight;
        }
      }
    }
  }, [highlightedIndex, isOpen]);

  // Clean up blur timeout on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleBlur = (e) => {
    let v = e.target.value.trim();
    if (v) {
      if (!v.includes(':') && v.length >= 1 && v.length <= 2) {
        if (/^\d+$/.test(v)) {
          v = v.padStart(2, '0') + ':00';
        }
      } else if (v.includes(':')) {
        let [h, m] = v.split(':');
        if (/^\d*$/.test(h) && /^\d*$/.test(m)) {
          h = h.padStart(2, '0');
          m = m.padEnd(2, '0');
          v = `${h}:${m}`;
        }
      }
    }
    onChange(v);
    setIsFocused(false);

    // Close dropdown after a short delay to allow clicks to register
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleInputChange = (e) => {
    let v = e.target.value.replace(/[^0-9:]/g, '');
    if (v.length === 2 && !v.includes(':') && e.nativeEvent.inputType !== 'deleteContentBackward') {
      v += ':';
    }
    if (v.length > 5) v = v.slice(0, 5);
    onChange(v);
  };

  const selectTime = (time) => {
    onChange(time);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => {
          const next = prev + 1;
          return next >= timeSlots.length ? 0 : next;
        });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? timeSlots.length - 1 : next;
        });
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < timeSlots.length) {
        e.preventDefault();
        e.stopPropagation();
        selectTime(timeSlots[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    }
  };

  const isValidFormat = !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

  return (
    <div 
      ref={containerRef} 
      className={`time-select-container ${disabled ? 'disabled' : ''}`}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.focus();
          setIsOpen(true);
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '0 4px',
        background: disabled ? 'transparent' : '#fff',
        borderColor: isFocused ? 'var(--teal, #2d8f7b)' : ((!isValidFormat || isError) ? '#e11d48' : '#ddd'),
        boxShadow: isFocused ? '0 0 0 2px rgba(45,143,123,0.2), 0 1px 2px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.05)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        height: '28px',
        cursor: disabled ? 'default' : 'pointer'
      }}
      title={!isValidFormat ? "Invalid 24h format (HH:mm). Click/type to fix." : ""}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="HH:MM"
        maxLength="5"
        disabled={disabled}
        value={value || ''}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onFocus={() => {
          if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
          }
          setIsFocused(true);
          if (!disabled) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '12px',
          flex: 1,
          padding: '4px 0',
          textAlign: 'center',
          color: disabled ? '#555' : '#000',
          width: '100%',
          fontFamily: "'Space Mono', monospace"
        }}
      />

      {isOpen && !disabled && (
        <div 
          ref={dropdownRef}
          tabIndex={-1}
          className="time-select-dropdown"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 15,
            maxHeight: '160px',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            padding: '4px 0'
          }}
        >
          {timeSlots.map((slot, idx) => {
            const isSelected = slot === value;
            const isHighlighted = idx === highlightedIndex;
            return (
              <div
                key={slot}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectTime(slot);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: isSelected 
                    ? 'var(--teal-pale, #e8f5f2)' 
                    : (isHighlighted ? '#f1f5f9' : 'transparent'),
                  color: isSelected ? 'var(--teal, #2d8f7b)' : 'var(--text-dark, #1a2744)',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  textAlign: 'center',
                  fontFamily: "'Space Mono', monospace"
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                {slot}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function TimesheetGrid({ employee: initialEmployee, isAdmin, onBack }) {
  const [employee, setEmployee] = useState(initialEmployee);
  
  useEffect(() => {
    setEmployee(initialEmployee);
  }, [initialEmployee]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = sessionStorage.getItem('timesheet_current_date');
      return saved ? new Date(saved) : new Date();
    } catch (e) {
      return new Date();
    }
  });

  useEffect(() => {
    if (currentDate) {
      try {
        sessionStorage.setItem('timesheet_current_date', currentDate.toISOString());
      } catch (e) {}
    }
  }, [currentDate]);

  const [entries, setEntries] = useState({});
  const [editedRows, setEditedRows] = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  
  const [otModal, setOtModal] = useState({ isOpen: false, dateStr: '', otHours: '', reason: '', remarks: '', entryId: null, status: '', rejectionReason: '', clientApproved: false, clientApprovalFile: '', isReapply: false, otReapplyCount: 0, oldReason: '', isNewReasonVisible: false, hasError: false });
  const [rejectModal, setRejectModal] = useState({ isOpen: false, entryId: null, dateStr: '', isOT: false, reason: '', hasError: false });
  const [grantModal, setGrantModal] = useState({ isOpen: false, entryId: null, dateStr: '', message: 'Granted access for Resubmit OT application', hasError: false });
  const [reasonViewModal, setReasonViewModal] = useState({ isOpen: false, reason: '', title: '' });
  const [leaveResubmitStage, setLeaveResubmitStage] = useState('initial');
  const [imgPreview, setImgPreview] = useState(null);
  const [initialOtData, setInitialOtData] = useState(null);
  const [exportModal, setExportModal] = useState({ isOpen: false, fromDate: '', toDate: '', isLoading: false, error: '' });
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [processingMessage, setProcessingMessage] = useState(null);
  const [toast, setToast] = useState({ type: '', text: '' });
  
  // Short Hours Approval Workflow Modal States
  const [isShortHoursModalOpen, setIsShortHoursModalOpen] = useState(false);
  const [shortHoursModalData, setShortHoursModalData] = useState(null); // { date, timings, hours, isReadOnly, oldReason }
  const [shortHoursReasonText, setShortHoursReasonText] = useState('');
  const [shortHoursError, setShortHoursError] = useState('');

  const [isAdminShortHoursModalOpen, setIsAdminShortHoursModalOpen] = useState(false);
  const [adminShortHoursModalData, setAdminShortHoursModalData] = useState(null); // { id, name, empId, date, hours, reason }
  const [adminRejectionText, setAdminRejectionText] = useState('');
  const [isAdminRejectMode, setIsAdminRejectMode] = useState(false);
  const [adminShortHoursError, setAdminShortHoursError] = useState('');
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    dept: '',
    manager: '',
    projectName: '',
    companyName: '',
    dateOfJoining: '',
    country: '',
    contactNumber: ''
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [emailDuplicateError, setEmailDuplicateError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [contactDuplicateErrorProfile, setContactDuplicateErrorProfile] = useState('');
  const [isCheckingContactProfile, setIsCheckingContactProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!reasonViewModal.isOpen) {
      setLeaveResubmitStage('initial');
    }
  }, [reasonViewModal.isOpen]);

  const isProfileDirty = () => {
    if (!isEditingProfile) return false;
    const rawCountry = employee?.country || '';
    const normCountry = rawCountry.includes('+91') ? 'IN (+91)' : (rawCountry.includes('+81') ? 'JP (+81)' : rawCountry);
    let rawNum = employee?.contactNumber || '';
    if (rawNum.includes(' | ')) {
      rawNum = rawNum.split(' | ')[1] || '';
    }
    return (
      (profileData.name || '').trim() !== (employee?.name || '') ||
      (profileData.email || '').trim() !== (employee?.email || '') ||
      (profileData.dept || '').trim() !== (employee?.dept || '') ||
      (profileData.manager || '').trim() !== (employee?.manager || '') ||
      (profileData.projectName || '').trim() !== (employee?.projectName || '') ||
      (profileData.companyName || '').trim() !== (employee?.companyName || '') ||
      (profileData.dateOfJoining || '').trim() !== (employee?.dateOfJoining || '') ||
      (profileData.country || '') !== normCountry ||
      (profileData.contactNumber || '').trim() !== rawNum
    );
  };

  const isOtFormDirty = () => {
    if (!otModal.isOpen || otModal.isReadOnly) return false;
    if (initialOtData) {
      return (otModal.reason || '').trim() !== (initialOtData.reason || '').trim() ||
             otModal.clientApproved !== initialOtData.clientApproved ||
             otModal.clientApprovalFile !== initialOtData.clientApprovalFile;
    } else {
      return (otModal.reason || '').trim() !== '' ||
             otModal.clientApproved === true ||
             otModal.clientApprovalFile !== '';
    }
  };

  const isTimesheetDirty = () => {
    return Object.keys(editedRows).length > 0;
  };

  useEffect(() => {
    window.isTimesheetGridDirty = () => {
      return isTimesheetDirty() || isProfileDirty() || isOtFormDirty();
    };
    return () => {
      delete window.isTimesheetGridDirty;
    };
  }, [editedRows, isEditingProfile, profileData, employee, otModal, initialOtData]);

  const handleOpenProfile = () => {
    const rawCountry = employee?.country || '';
    const normCountry = rawCountry.includes('+91') ? 'IN (+91)' : (rawCountry.includes('+81') ? 'JP (+81)' : rawCountry);
    let rawNum = employee?.contactNumber || '';
    if (rawNum.includes(' | ')) {
      rawNum = rawNum.split(' | ')[1] || '';
    }
    setProfileData({
      name: employee?.name || '',
      email: employee?.email || '',
      dept: employee?.dept || '',
      manager: employee?.manager || '',
      projectName: employee?.projectName || '',
      companyName: employee?.companyName || '',
      dateOfJoining: employee?.dateOfJoining || '',
      country: normCountry,
      contactNumber: rawNum
    });
    setProfileErrors({});
    setEmailDuplicateError('');
    setProfileMessage({ type: '', text: '' });
    setIsEditingProfile(false);
    setIsProfileOpen(true);
  };

  const handleCloseProfileModal = async () => {
    if (isProfileDirty()) {
      const confirmLeave = await showConfirm(
        'Your changes have not been saved. Do you still want to close?',
        { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Discard', cancelLabel: 'Keep Editing' }
      );
      if (!confirmLeave) return;
    }
    setIsProfileOpen(false);
  };

  const checkContactProfileUniqueness = async (contactVal, excludeId) => {
    if (!contactVal || contactVal.trim().length === 0) {
      setContactDuplicateErrorProfile('');
      return true;
    }
    setIsCheckingContactProfile(true);
    try {
      const params = { 
        contactNumber: contactVal.trim(),
        country: profileData.country
      };
      if (excludeId) params.excludeId = excludeId;
      const res = await api.get('/admin/employees/check-contact', { params });
      if (res.data && res.data.exists) {
        setContactDuplicateErrorProfile('This contact number is already registered.');
        setProfileErrors(prev => ({ ...prev, contactNumber: 'This contact number is already registered.' }));
        return false;
      } else {
        setContactDuplicateErrorProfile('');
        setProfileErrors(prev => {
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
      setIsCheckingContactProfile(false);
    }
  };

  const checkProfileEmailUniqueness = async (emailVal) => {
    if (!emailVal || !emailVal.match(/^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$/)) {
      setEmailDuplicateError('');
      return true;
    }
    setIsCheckingEmail(true);
    try {
      const res = await api.get(`/admin/employees/check-email`, {
        params: {
          email: emailVal.trim(),
          excludeId: employee?.id
        }
      });
      if (res.data && res.data.exists) {
        setEmailDuplicateError('Email already exists');
        setProfileErrors(prev => ({ ...prev, email: 'Email already exists' }));
        return false;
      } else {
        setEmailDuplicateError('');
        setProfileErrors(prev => {
          const copy = { ...prev };
          if (copy.email === 'Email already exists') {
            delete copy.email;
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

  const validateEmailRealtime = (val) => {
    if (!val || val.trim().length === 0) {
      return 'Email is required';
    }
    if (val.includes(' ')) {
      return 'Email address cannot contain spaces';
    }
    if (val.trim().length > 254) {
      return 'Email cannot exceed 254 characters';
    }
    const emailVal = val.trim();
    const atCount = (emailVal.match(/@/g) || []).length;
    const atIndex = emailVal.indexOf('@');
    const afterAt = atIndex !== -1 ? emailVal.substring(atIndex + 1) : '';
    if (atCount !== 1 || !afterAt.includes('.') || !emailVal.match(/^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$/)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  const validateProfileForm = () => {
    const errors = {};
    
    // Full Name: Only alphabets and spaces between characters. Min 3 chars, Max 32 chars.
    if (!profileData.name || !profileData.name.trim().match(/^[A-Za-z]+(?: [A-Za-z]+)*$/) || profileData.name.trim().length < 3 || profileData.name.trim().length > 32) {
      errors.name = 'Please enter a valid full name.';
    }
    
    // Department: Must select a department.
    if (!profileData.dept || profileData.dept === 'Select Department') {
      errors.dept = 'Please select a department.';
    }
    
    // Manager: Only alphabets and spaces between characters. Min 3 chars, Max 32 chars.
    if (!profileData.manager || !profileData.manager.trim().match(/^[A-Za-z]+(?: [A-Za-z]+)*$/) || profileData.manager.trim().length < 3 || profileData.manager.trim().length > 32) {
      errors.manager = 'Please enter a valid manager name.';
    }
    
    // Email Validation
    const emailErr = validateEmailRealtime(profileData.email);
    if (emailErr) {
      errors.email = emailErr;
    } else if (emailDuplicateError) {
      errors.email = emailDuplicateError;
    }
    
    // Project Name: Alphabets, numbers, spaces, and ()&@_- allowed. Min 2 chars, Max 32 chars.
    if (!profileData.projectName || !profileData.projectName.trim().match(/^[A-Za-z0-9 ()&@_-]+$/) || profileData.projectName.trim().length < 2 || profileData.projectName.trim().length > 32) {
      errors.projectName = 'Please enter a valid project name (only letters, numbers, spaces, and ()&@-_ allowed).';
    }

    // Company Name: Alphabets, numbers, spaces, and ()&@_- allowed. Min 2 chars, Max 32 chars.
    if (!profileData.companyName || !profileData.companyName.trim().match(/^[A-Za-z0-9 ()&@_-]+$/) || profileData.companyName.trim().length < 2 || profileData.companyName.trim().length > 32) {
      errors.companyName = 'Please enter a valid company name (only letters, numbers, spaces, and ()&@-_ allowed).';
    }

    // Date of Joining: Cannot be empty. Must be between 01-01-1999 and 30-12-2099.
    if (!profileData.dateOfJoining || profileData.dateOfJoining < '1999-01-01' || profileData.dateOfJoining > '2099-12-30') {
      errors.dateOfJoining = 'Please select a valid joining date between 01-01-1999 and 30-12-2099.';
    }

    // Country selection
    if (!profileData.country) {
      errors.country = 'Please select a country.';
    }

    // Contact number validation
    if (!profileData.contactNumber || profileData.contactNumber.trim().length === 0) {
      errors.contactNumber = 'Please enter a contact number.';
    } else {
      if (profileData.country === 'India (+91)' || profileData.country === 'IN (+91)') {
        if (!/^\d{10}$/.test(profileData.contactNumber)) {
          errors.contactNumber = 'Please enter a valid 10-digit mobile number.';
        }
      } else if (profileData.country === 'Japan (+81)' || profileData.country === 'JP (+81)') {
        if (!/^\d{11}$/.test(profileData.contactNumber)) {
          errors.contactNumber = 'Please enter a valid 11-digit mobile number.';
        }
      }
    }
    // Duplicate contact check (sync state)
    if (!errors.contactNumber && contactDuplicateErrorProfile) {
      errors.contactNumber = contactDuplicateErrorProfile;
    }

    const focusFirstError = (errs) => {
      const fieldsOrder = ['name', 'dept', 'manager', 'email', 'projectName', 'companyName', 'dateOfJoining', 'country', 'contactNumber'];
      for (const field of fieldsOrder) {
        if (errs[field]) {
          setTimeout(() => {
            const el = document.getElementById(`profile-${field}`) || document.querySelector(`[name="profile-${field}"]`);
            if (el) el.focus();
          }, 50);
          break;
        }
      }
    };

    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return false;
    }
    return true;
  };

  const checkPrecedingProfileFields = (currentField) => {
    const fieldsOrder = ['name', 'dept', 'manager', 'email', 'projectName', 'companyName', 'dateOfJoining', 'country', 'contactNumber'];
    const currentIndex = fieldsOrder.indexOf(currentField);
    for (let i = 0; i < currentIndex; i++) {
      const field = fieldsOrder[i];
      const val = profileData[field];
      if (!val || val.trim().length === 0 || (field === 'dept' && val === 'Select Department')) {
        setProfileErrors(prev => ({ ...prev, [field]: 'Please fill in this field before proceeding.' }));
        setTimeout(() => {
          const el = document.getElementById(`profile-${field}`) || document.querySelector(`[name="profile-${field}"]`);
          if (el) el.focus();
        }, 50);
        return false;
      }
    }
    return true;
  };

  const handleSaveProfile = async () => {
    if (!validateProfileForm()) return;
    
    const isEmailUnique = await checkProfileEmailUniqueness(profileData.email);
    if (!isEmailUnique) {
      setProfileErrors(prev => ({ ...prev, email: 'This email address is already registered' }));
      return;
    }

    // Final duplicate contact number check on update
    const isContactUnique = await checkContactProfileUniqueness(profileData.contactNumber, employee?.id);
    if (!isContactUnique) {
      return;
    }

    if (isSavingProfile) return;
    setIsSavingProfile(true);
    setProfileMessage({ type: '', text: '' });
    try {
      const res = await api.put(`/admin/employees/${employee.id}`, profileData);
      const updated = res.data;
      setEmployee(updated);
      localStorage.setItem('admin_selected_employee', JSON.stringify(updated));
      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setIsEditingProfile(false);
      setTimeout(() => {
        setProfileMessage({ type: '', text: '' });
      }, 3000);
    } catch (e) {
      setProfileMessage({ type: 'error', text: safeErrorText(e, 'Failed to update profile') });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openOtModal = (data) => {
    setOtModal({ ...data, hasError: false });
    setInitialOtData(data);
  };

  const ViewIcon = ({ onClick, color = "#455fa0" }) => (
    <svg 
      onClick={onClick}
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} 
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" 
      style={{ cursor: 'pointer', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );

  const handleLeaveResubmit = async (entry) => {
    const confirmResubmit = await showConfirm(
      "Are you sure you want to resubmit this leave request? You can only resubmit this leave request once. If it is rejected again, the rejection will be considered final.",
      {
        title: "Resubmit Leave Request?",
        type: "leave",
        confirmLabel: "Resubmit",
        cancelLabel: "Cancel"
      }
    );
    if (!confirmResubmit) return;

    setProcessingMessage('Resubmitting leave request...');
    try {
      const dateStr = entry.date;
      if (editedRows[dateStr]) {
        let row = editedRows[dateStr];
        if (!row.id && entry.id) {
          row.id = entry.id;
        }
        if (!row.user || !row.user.id) {
          row.user = { id: employee.id };
        }
        await api.post('/timesheets/save', cleanPayload(row));
        setEditedRows(prev => {
          const next = { ...prev };
          delete next[dateStr];
          return next;
        });
      }

      const res = await api.post(`/timesheets/${entry.id}/leave/resubmit`);
      
      setEntries(prev => ({
        ...prev,
        [dateStr]: res.data
      }));

      setReasonViewModal({ isOpen: false, reason: '', title: '', dateStr: '' });
      setToast({ type: 'success', text: 'Leave request resubmitted successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'Leave request resubmitted successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      const errMsg = safeErrorText(e, 'Failed to resubmit leave request');
      await showAlert(errMsg, { title: 'Resubmit Error', type: 'warn' });
    } finally {
      setProcessingMessage(null);
    }
  };

  const reapplyOT = (row) => {
    setReasonViewModal({ isOpen: false, reason: '', title: '' });
    openOtModal({
      isOpen: true,
      dateStr: row.date,
      otHours: calculateHours(row).ot,
      reason: row.otReason || '',
      remarks: row.otRemarks || '',
      entryId: row.id,
      status: row.otStatus,
      rejectionReason: row.otRejectionReason,
      clientApproved: row.clientApproved,
      clientApprovalFile: row.clientApprovalFile,
      isReapply: true,
      otReapplyCount: row.otReapplyCount || 0,
      oldReason: row.otReason || '',
      isNewReasonVisible: false
    });
  };
  
  const storageKey = employee ? `timesheet_edits_${employee.empId}_${format(currentDate, 'yyyy-MM')}` : null;

  // Load unsaved edits from localStorage
  useEffect(() => {
    if (storageKey && !isAdmin) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setEditedRows(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse saved edits", e);
        }
      } else {
        setEditedRows({});
      }
    }
  }, [storageKey, isAdmin]);

  // Save unsaved edits to localStorage
  useEffect(() => {
    if (storageKey && !isAdmin) {
      if (Object.keys(editedRows).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(editedRows));
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  }, [editedRows, storageKey, isAdmin]);

  const loadData = async (dateToClear = null) => {
    try {
      const year = format(currentDate, 'yyyy');
      const month = format(currentDate, 'M');
      const res = await api.get(`/timesheets/${employee.empId}/${year}/${month}`);
      const entryMap = {};
      res.data.forEach(e => {
        entryMap[e.date] = e;
      });
      setEntries(entryMap);
      if (dateToClear) {
        setEditedRows(prev => {
          const next = { ...prev };
          delete next[dateToClear];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (employee && employee.empId) {
      loadData();
    }
  }, [currentDate, employee]);

  if (!employee) return null;

  const daysInMonth = getDaysInMonth(currentDate);
  const startDay = startOfMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(startDay, i));

  const handleMonthChange = async (delta) => {
    if (isTimesheetDirty()) {
      const confirmLeave = await showConfirm(
        'Your changes have not been saved. Do you still want to change the month?',
        { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Change Month', cancelLabel: 'Stay' }
      );
      if (!confirmLeave) return;
      setEditedRows({});
    }
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const isWeekendDay = (d) => getDay(d) === 0 || getDay(d) === 6;

  const handleRowChange = (dateStr, field, value) => {
    setEditedRows(prev => {
      const existing = prev[dateStr] || entries[dateStr] || { date: dateStr, user: { id: employee.id } };
      let newRow = { ...existing, [field]: value };
      
      if (field === 'type' && ['Week Off', 'Holiday', 'Paid Leave', 'Unpaid Leave'].includes(value)) {
        newRow.amIn = ''; newRow.amOut = '';
        newRow.lunchOut = ''; newRow.lunchIn = '';
        newRow.pmIn = ''; newRow.pmOut = '';
        if (value === 'Week Off') {
          newRow.status = '';
          newRow.submitted = false;
        } else if (value === 'Holiday') {
          newRow.status = 'Pending';
          newRow.submitted = true;
        }
      }
      
      return { ...prev, [dateStr]: newRow };
    });
  };

  const handleTypeChange = (dateStr, value) => {
    setEditedRows(prev => {
      const existing = prev[dateStr] || entries[dateStr] || { date: dateStr, type: 'Working Day', status: '' };
      const newRow = { ...existing, date: dateStr, type: value };
      
      if (['Holiday', 'Week Off', 'Paid Leave', 'Unpaid Leave'].includes(value)) {
        newRow.amIn = ''; newRow.amOut = '';
        newRow.lunchOut = ''; newRow.lunchIn = '';
        newRow.pmIn = ''; newRow.pmOut = '';
      }
      return { ...prev, [dateStr]: newRow };
    });
  };

  const parseTime = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const getValidationErrors = (row) => {
    const errors = [];
    const isWknd = row.date && (getDay(parseISO(row.date)) === 0 || getDay(parseISO(row.date)) === 6);
    const type = row.type || (isWknd ? 'Week Off' : 'Working Day');
    const isWeekendOrHoliday = isWknd || type === 'Holiday';

    if (!['Working Day', 'WFH', 'Holiday'].includes(type)) {
      return errors;
    }

    // Explicit format validation for each time field
    const TIME_FIELDS = {
      amIn: 'AM In',
      amOut: 'AM Out',
      lunchOut: 'Lunch In',
      lunchIn: 'Lunch Out',
      pmIn: 'PM In',
      pmOut: 'PM Out'
    };

    let hasFormatErrors = false;
    for (const [key, label] of Object.entries(TIME_FIELDS)) {
      const val = row[key];
      if (val) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) {
          errors.push(`${label} must be a valid 24-hour time (HH:mm)`);
          hasFormatErrors = true;
        }
      }
    }

    if (hasFormatErrors) {
      return errors;
    }

    const amIn = row.amIn ? parseTime(row.amIn) : null;
    const amOut = row.amOut ? parseTime(row.amOut) : null;
    const lunchOut = row.lunchOut ? parseTime(row.lunchOut) : null;
    const lunchIn = row.lunchIn ? parseTime(row.lunchIn) : null;
    const pmIn = row.pmIn ? parseTime(row.pmIn) : null;
    const pmOut = row.pmOut ? parseTime(row.pmOut) : null;

    if (isWeekendOrHoliday) {
      if ((amIn !== null && amOut === null) || (amIn === null && amOut !== null)) {
        errors.push("Both AM In and AM Out must be entered, or both left blank");
      }
      if ((pmIn !== null && pmOut === null) || (pmIn === null && pmOut !== null)) {
        errors.push("Both PM In and PM Out must be entered, or both left blank");
      }
      if ((lunchOut !== null && lunchIn === null) || (lunchOut === null && lunchIn !== null)) {
        errors.push("Both Lunch In and Lunch Out must be entered, or both left blank");
      }
      if (amIn !== null && amOut !== null && amOut <= amIn) {
        errors.push("AM Out must be later than AM In");
      }
      if (pmIn !== null && pmOut !== null && pmOut <= pmIn) {
        errors.push("PM Out must be later than PM In");
      }
      if (lunchOut !== null && lunchIn !== null && lunchIn <= lunchOut) {
        errors.push("Lunch Out must be later than Lunch In");
      }
      if (amIn !== null && pmOut !== null && pmOut <= amIn) {
        errors.push("PM Out must be later than AM In");
      }
      if (amOut !== null && pmIn !== null && pmIn < amOut) {
        errors.push("PM In must be at or after AM Out");
      }
      if (lunchOut !== null && amIn !== null && lunchOut < amIn) {
        errors.push("Lunch In must be at or after AM In");
      }
      if (lunchIn !== null && pmOut !== null && pmOut < lunchIn) {
        errors.push("PM Out must be at or after Lunch Out");
      }
      if (lunchOut !== null && amOut !== null && lunchOut < amOut) {
        errors.push("Lunch In must be at or after AM Out");
      }
      if (lunchIn !== null && pmIn !== null && pmIn < lunchIn) {
        errors.push("PM In must be at or after Lunch Out");
      }
    } else {
      if (amIn !== null && amOut !== null && amOut <= amIn) {
        errors.push("AM Out must be later than AM In");
      }
      if (amOut !== null && lunchOut !== null && amOut !== lunchOut) {
        errors.push("There should be no time gap between AM Out and Lunch In");
      }
      if (lunchOut !== null && lunchIn !== null && (lunchIn - lunchOut !== 60)) {
        errors.push("Lunch break must be exactly one hour");
      }
      if (lunchIn !== null && pmIn !== null && lunchIn !== pmIn) {
        errors.push("Lunch Out and PM In should not have any time gap");
      }
      if (pmIn !== null && pmOut !== null && pmOut <= pmIn) {
        errors.push("PM Out must be later than PM In");
      }
    }

    return errors;
  };

  const calculateHours = (row) => {
    const errors = getValidationErrors(row);
    if (errors.length > 0) return { reg: '--', ot: '--', tot: '--', rawMins: 0, error: true, errors };

    const isWknd = row.date && (getDay(parseISO(row.date)) === 0 || getDay(parseISO(row.date)) === 6);
    const type = row.type || (isWknd ? 'Week Off' : 'Working Day');
    const isWeekendOrHoliday = isWknd || type === 'Holiday';

    if (type === 'Holiday' && !row.amIn && !row.amOut && !row.lunchOut && !row.lunchIn && !row.pmIn && !row.pmOut) {
      return { reg: '00:00', ot: '--', tot: '00:00', rawMins: 0, regMins: 0, error: false, errors: [] };
    }

    if (isWeekendOrHoliday) {
      const hasAm = row.amIn && row.amOut;
      const hasPm = row.pmIn && row.pmOut;
      if (!hasAm && !hasPm) {
        return { reg: '--', ot: '--', tot: '--', rawMins: 0, error: false, errors: [] };
      }
    } else {
      if (!row.amIn || !row.pmOut) {
        return { reg: '--', ot: '--', tot: '--', rawMins: 0, error: false, errors: [] };
      }
    }

    const amIn = parseTime(row.amIn);
    const amOut = parseTime(row.amOut);
    const pmIn = parseTime(row.pmIn);
    const pmOut = parseTime(row.pmOut);

    let totalMins = 0;

    if (isWeekendOrHoliday) {
      const hasAm = row.amIn && row.amOut;
      const hasPm = row.pmIn && row.pmOut;
      let amDiff = 0, pmDiff = 0;
      if (hasAm && amOut > amIn) amDiff = amOut - amIn;
      if (hasPm && pmOut > pmIn) pmDiff = pmOut - pmIn;
      totalMins = amDiff + pmDiff;
    } else {
      let amDiff = 0, pmDiff = 0;
      if (row.amOut && amOut > amIn) amDiff = amOut - amIn;
      if (row.pmIn && pmOut > pmIn) pmDiff = pmOut - pmIn;
      totalMins = amDiff + pmDiff;
    }

    if (totalMins > 1440) return { reg: '--', ot: '--', tot: '--', rawMins: 0, error: true, errors: ['Duration exceeds 24h'] };

    let regMins = 0;
    let otMins = 0;

    if (isWeekendOrHoliday) {
      regMins = 0;
      otMins = totalMins;
    } else {
      regMins = Math.min(totalMins, 480);
      otMins = Math.max(0, totalMins - 480);
    }

    const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    
    return {
      reg: isWeekendOrHoliday ? '00:00' : (totalMins > 0 ? fmt(regMins) : '--'),
      ot: otMins > 0 ? fmt(otMins) : '--',
      tot: totalMins > 0 ? fmt(totalMins) : '--',
      rawMins: totalMins,
      regMins: regMins,
      error: false,
      errors: []
    };
  };

  const handleRowKeyDown = (e, dateStr) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTimesheet(dateStr, true);
    }
  };

  const saveTimesheet = async (dateStr, isSubmit) => {
    if (!isAdmin && isPastDeadline(dateStr)) {
      await showAlert('This timesheet is locked. Modifications are no longer permitted after the 15th of the following month.', { title: 'Timesheet Locked', type: 'warn' });
      return;
    }

    let row = editedRows[dateStr] || entries[dateStr] || { date: dateStr, type: 'Working Day', user: { id: employee.id } };
    // Ensure the ID from entries is preserved to prevent duplicate insert errors
    if (entries[dateStr] && entries[dateStr].id && !row.id) {
      row.id = entries[dateStr].id;
    }
    
    if (isSubmit && isAfter(parseISO(dateStr), startOfDay(new Date()))) {
      await showAlert('Cannot submit timesheet for future dates.', { title: 'Future Date', type: 'warn' });
      return;
    }
    
    const isWknd = row.date && (getDay(parseISO(row.date)) === 0 || getDay(parseISO(row.date)) === 6);
    const type = row.type || (isWknd ? 'Week Off' : 'Working Day');
    const isWeekendOrHoliday = isWknd || type === 'Holiday';

    const focusFirstRowInvalidField = () => {
      setTimeout(() => {
        const rowEl = document.getElementById(`row-${dateStr}`);
        if (rowEl) {
          const inputs = rowEl.querySelectorAll('.time-select-container input');
          for (const input of inputs) {
            if (!input.value || input.value.trim() === '') {
              input.focus();
              return;
            }
          }
          if (inputs.length > 0) inputs[0].focus();
        }
      }, 100);
    };

    if (isSubmit && (['Working Day', 'WFH'].includes(type) || type === 'Holiday')) {
      if (isWeekendOrHoliday) {
        const hasAny = row.amIn || row.amOut || row.lunchOut || row.lunchIn || row.pmIn || row.pmOut;
        if (type !== 'Holiday' || hasAny) {
          const hasAm = row.amIn && row.amOut;
          const hasPm = row.pmIn && row.pmOut;
          if (!hasAm && !hasPm) {
            await showAlert('Either AM In/Out or PM In/Out must be completely filled to submit working hours.', { title: 'Validation Error', type: 'warn' });
            focusFirstRowInvalidField();
            return;
          }
        }
      } else {
        if (!row.amIn || !row.amOut || !row.lunchOut || !row.lunchIn || !row.pmIn || !row.pmOut) {
          await showAlert('All time fields must be filled before submitting.', { title: 'Validation Error', type: 'warn' });
          focusFirstRowInvalidField();
          return;
        }
      }
    }

    const errs = getValidationErrors(row);
    if (errs.length > 0) {
      await showAlert('Validation Errors: ' + errs.join(', '), { title: 'Validation Error', type: 'warn' });
      focusFirstRowInvalidField();
      return;
    }

    const h = calculateHours(row);
    if (h.error) {
      await showAlert('Validation Errors: ' + h.errors.join(', '), { title: 'Validation Error', type: 'warn' });
      focusFirstRowInvalidField();
      return;
    }

    const otAppliedAmIn = row.otAppliedAmIn !== undefined ? row.otAppliedAmIn : (entries[dateStr]?.amIn || '');
    const otAppliedAmOut = row.otAppliedAmOut !== undefined ? row.otAppliedAmOut : (entries[dateStr]?.amOut || '');
    const otAppliedLunchOut = row.otAppliedLunchOut !== undefined ? row.otAppliedLunchOut : (entries[dateStr]?.lunchOut || '');
    const otAppliedLunchIn = row.otAppliedLunchIn !== undefined ? row.otAppliedLunchIn : (entries[dateStr]?.lunchIn || '');
    const otAppliedPmIn = row.otAppliedPmIn !== undefined ? row.otAppliedPmIn : (entries[dateStr]?.pmIn || '');
    const otAppliedPmOut = row.otAppliedPmOut !== undefined ? row.otAppliedPmOut : (entries[dateStr]?.pmOut || '');

    const timingsChangedSinceOtApply = 
      !!row.otStatus && 
      (row.otStatus === 'Filed' || row.otStatus === 'Refilled') && (
        (row.amIn || '') !== otAppliedAmIn ||
        (row.amOut || '') !== otAppliedAmOut ||
        (row.lunchOut || '') !== otAppliedLunchOut ||
        (row.lunchIn || '') !== otAppliedLunchIn ||
        (row.pmIn || '') !== otAppliedPmIn ||
        (row.pmOut || '') !== otAppliedPmOut
      );

    const isOtMismatch = isSubmit && !!row.otStatus && row.otStatus === (entries[dateStr]?.otStatus || null) && h.ot !== '--' && entries[dateStr] && calculateHours(entries[dateStr]).ot !== h.ot;

    if (isSubmit && h.ot !== '--' && (!row.otStatus || row.otStatus === 'Rejected' || isOtMismatch || timingsChangedSinceOtApply)) {
      await showAlert((isOtMismatch || timingsChangedSinceOtApply) ? 'OT hours or timings have changed. Please re-apply for OT before submitting.' : 'Please Apply/Re-apply for OT before submitting for this date.', { title: 'OT Required', type: 'warn' });
      return;
    }

    if (!row.user || !row.user.id) row.user = { id: employee.id };

    if (h.ot === '--' && row.otStatus) {
      row.otStatus = null;
      row.otReason = null;
      row.otRemarks = null;
      row.otRejectionReason = null;
      row.otReapplyCount = 0;
      row.clientApproved = false;
      row.clientApprovalFile = null;
    }

    if (isAdmin) {
      row.status = entries[dateStr]?.status || 'Approved';
      row.submitted = true;
    } else if (isSubmit) {
      const prevStatus = entries[dateStr]?.status;
      const alreadySubmitted = prevStatus && !['', 'Draft', 'Pending'].includes(prevStatus);
      row.status = alreadySubmitted ? 'Reapproval Pending' : 'Pending';
      row.submitted = true;
      
      if (row.otResubmissionGranted && !row.otResubmissionUsed) {
        row.otResubmissionUsed = true;
        row.status = 'Reapproval Pending'; // Override back to Reapproval Pending workflow
      }
    } else {
      row.status = 'Draft';
    }

    const cleanPayload = (r) => {
      const p = { ...r };
      delete p.createdAt;
      delete p.updatedAt;
      delete p.otAppliedAmIn;
      delete p.otAppliedAmOut;
      delete p.otAppliedLunchOut;
      delete p.otAppliedLunchIn;
      delete p.otAppliedPmIn;
      delete p.otAppliedPmOut;
      return p;
    };

    const payload = cleanPayload(row);
    const userId = (payload.user && payload.user.id) || employee.id;
    payload.user = { id: userId };

    setProcessingMessage(isAdmin ? 'Saving changes...' : (isSubmit ? 'Submitting timesheet...' : 'Saving draft...'));
    try {
      await api.post('/timesheets/save', payload);
      setEditedRows(prev => {
        const next = {...prev};
        delete next[dateStr];
        return next;
      });
      await loadData(dateStr);
      setProcessingMessage(null);
      const msg = isAdmin ? 'Changes saved successfully!' : (isSubmit ? 'Timesheet submitted successfully!' : 'Timesheet saved successfully!');
      setToast({ type: 'success', text: msg });
      setTimeout(() => {
        setToast(prev => prev.text === msg ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      setProcessingMessage(null);
      const errMsg = safeErrorText(e, isAdmin ? 'Failed to save changes' : (isSubmit ? 'Failed to submit timesheet' : 'Failed to save timesheet'));
      setToast({ type: 'error', text: errMsg });
      await showAlert(errMsg, { title: 'Error', type: 'warn' });
    }
  };

  const handleShortHoursSubmit = async () => {
    const check = validateAndCleanReason(shortHoursReasonText);
    if (!check.isValid) {
      setShortHoursError(check.error);
      return;
    }
    setShortHoursError('');
    const cleanedReason = check.cleaned;

    const dateStr = shortHoursModalData.date;
    let row = editedRows[dateStr] || entries[dateStr] || { date: dateStr, type: 'Working Day', user: { id: employee.id } };
    if (entries[dateStr] && entries[dateStr].id && !row.id) {
      row.id = entries[dateStr].id;
    }

    const prevStatus = entries[dateStr]?.status || '';
    const alreadySubmitted = prevStatus && !['', 'Draft', 'Pending'].includes(prevStatus);
    const targetStatus = alreadySubmitted ? 'Reapproval Pending' : 'Pending';

    const updatedRow = {
      ...row,
      shortHoursReason: cleanedReason,
      status: targetStatus,
      submitted: true
    };

    const cleanPayloadLocal = (r) => {
      const p = { ...r };
      delete p.otAppliedAmIn;
      delete p.otAppliedAmOut;
      delete p.otAppliedLunchOut;
      delete p.otAppliedLunchIn;
      delete p.otAppliedPmIn;
      delete p.otAppliedPmOut;
      return p;
    };

    const payload = cleanPayloadLocal(updatedRow);
    const userId = (payload.user && payload.user.id) || employee.id;
    payload.user = { id: userId };

    setProcessingMessage('Submitting reason...');
    try {
      await api.post('/timesheets/save', payload);
      setEditedRows(prev => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      await loadData(dateStr);
      setIsShortHoursModalOpen(false);
      setShortHoursModalData(null);
      setShortHoursReasonText('');
      setToast({ type: 'success', text: 'Reason submitted successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'Reason submitted successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      const errMsg = safeErrorText(e, 'Failed to submit reason');
      setShortHoursError(errMsg);
      await showAlert(errMsg, { title: 'Submission Error', type: 'warn' });
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleAdminShortHoursRejectSubmit = async () => {
    const check = validateAndCleanReason(adminRejectionText, 'Rejection reason');
    if (!check.isValid) {
      setAdminShortHoursError(check.error);
      return;
    }
    setAdminShortHoursError('');
    setProcessingMessage('Rejecting timesheet...');
    try {
      const formattedReason = check.cleaned;
      await api.post(`/admin/timesheets/${adminShortHoursModalData.id}/reject`, { reason: formattedReason });
      setIsAdminShortHoursModalOpen(false);
      setAdminShortHoursModalData(null);
      setAdminRejectionText('');
      setIsAdminRejectMode(false);
      await loadData(adminShortHoursModalData.date);
      setToast({ type: 'success', text: 'Timesheet rejected successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'Timesheet rejected successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      const errMsg = safeErrorText(e, 'Failed to reject timesheet');
      setAdminShortHoursError(errMsg);
      await showAlert(errMsg, { title: 'Rejection Error', type: 'warn' });
    } finally {
      setProcessingMessage(null);
    }
  };

  const approveTimesheet = async (id, dateStr) => {
    if (!id) {
      await showAlert('Entry ID is missing. Please refresh the page.', { title: 'Error', type: 'warn' });
      return;
    }
    setProcessingMessage('Approving timesheet...');
    try {
      // Auto-save edits first if they exist
      if (editedRows[dateStr]) {
        let row = editedRows[dateStr];
        if (entries[dateStr] && entries[dateStr].id && !row.id) {
          row.id = entries[dateStr].id;
        }
        if (!row.user || !row.user.id) row.user = { id: employee.id };
        
        row.status = entries[dateStr]?.status || 'Approved';
        row.submitted = true;

        const payload = cleanPayload(row);
        const userId = (payload.user && payload.user.id) || employee.id;
        payload.user = { id: userId };

        await api.post('/timesheets/save', payload);
        // Clear edited row
        setEditedRows(prev => {
          const next = {...prev};
          delete next[dateStr];
          return next;
        });
      }

      await api.post(`/admin/timesheets/${id}/approve`);
      await loadData(dateStr);
      setProcessingMessage(null);
      setToast({ type: 'success', text: 'Timesheet approved successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'Timesheet approved successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      setProcessingMessage(null);
      console.error('Approve Error:', e.response?.data || e.message);
      const errMsg = safeErrorText(e, 'Failed to approve');
      setToast({ type: 'error', text: errMsg });
      await showAlert('Failed to approve: ' + errMsg, { title: 'Approval Error', type: 'warn' });
    }
  };

  const rejectTimesheet = async (id, dateStr) => {
    if (!id) {
      await showAlert('Entry ID is missing. Please refresh the page.', { title: 'Error', type: 'warn' });
      return;
    }
    setRejectModal({ isOpen: true, entryId: id, dateStr, isOT: false, reason: '', hasError: false });
  };

  const formatReasonText = (text) => {
    if (!text) return text;
    let normalized = text.trim().replace(/\s+/g, ' ');
    const words = normalized.split(' ');
    if (words.length > 240) {
      normalized = words.slice(0, 240).join(' ');
    }
    return normalized;
  };

  const handleRejectSubmit = async () => {
    const { entryId, isOT, reason, dateStr } = rejectModal;
    const check = validateAndCleanReason(reason, 'Rejection reason');
    if (!check.isValid) {
      setRejectModal(prev => ({ 
        ...prev, 
        hasError: true, 
        errorMsg: check.error
      }));
      setTimeout(() => {
        const el = document.getElementById("reject-reason");
        if (el) el.focus();
      }, 50);
      return;
    }
    
    const formattedReason = check.cleaned;
    
    setProcessingMessage(isOT ? 'Rejecting OT request...' : 'Rejecting timesheet...');
    setRejectModal({ ...rejectModal, isOpen: false });
    if (isOT) setOtModal({ ...otModal, isOpen: false });
    
    try {
      // Auto-save edits first if they exist
      if (editedRows[dateStr]) {
        let row = editedRows[dateStr];
        if (entries[dateStr] && entries[dateStr].id && !row.id) {
          row.id = entries[dateStr].id;
        }
        if (!row.user || !row.user.id) row.user = { id: employee.id };
        
        row.status = entries[dateStr]?.status || 'Pending';
        row.submitted = true;

        const payload = cleanPayload(row);
        const userId = (payload.user && payload.user.id) || employee.id;
        payload.user = { id: userId };

        await api.post('/timesheets/save', payload);
        // Clear edited row
        setEditedRows(prev => {
          const next = {...prev};
          delete next[dateStr];
          return next;
        });
      }

      const url = isOT ? `/admin/timesheets/${entryId}/ot/reject` : `/admin/timesheets/${entryId}/reject`;
      await api.post(url, { reason: formattedReason });
      await loadData(dateStr);
      setProcessingMessage(null);
      const msg = isOT ? 'OT request rejected successfully!' : 'Timesheet rejected successfully!';
      setToast({ type: 'success', text: msg });
      setTimeout(() => {
        setToast(prev => prev.text === msg ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      setProcessingMessage(null);
      const errMsg = safeErrorText(e, isOT ? 'Failed to reject OT request' : 'Failed to reject timesheet');
      setToast({ type: 'error', text: errMsg });
      await showAlert(errMsg, { title: 'Rejection Error', type: 'warn' });
    }
  };

  const approveOT = async (id, dateStr) => {
    if (!id) {
      await showAlert('Entry ID is missing for OT approval.', { title: 'Error', type: 'warn' });
      return;
    }
    setProcessingMessage('Approving OT request...');
    try {
      await api.post(`/admin/timesheets/${id}/ot/approve`);
      setOtModal({ ...otModal, isOpen: false });
      await loadData(dateStr);
      setProcessingMessage(null);
      setToast({ type: 'success', text: 'OT request approved successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'OT request approved successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      setProcessingMessage(null);
      const errMsg = safeErrorText(e, 'Failed to approve OT');
      setToast({ type: 'error', text: errMsg });
      await showAlert('Failed to approve OT: ' + errMsg, { title: 'OT Approval Error', type: 'warn' });
    }
  };

  const handleGrantResubmit = async () => {
    const { entryId, message, dateStr } = grantModal;
    const check = validateAndCleanReason(message, 'Message');
    if (!check.isValid) {
      setGrantModal(prev => ({ ...prev, hasError: true, errorMsg: check.error }));
      setTimeout(() => {
        const el = document.getElementById("grant-message");
        if (el) el.focus();
      }, 50);
      return;
    }
    setProcessingMessage('Granting resubmission access...');
    setGrantModal({ ...grantModal, isOpen: false });
    try {
      const finalMsg = check.cleaned;
      await api.post(`/admin/timesheets/${entryId}/ot/grant-resubmit`, { message: finalMsg });
      await loadData(dateStr);
      setProcessingMessage(null);
      setToast({ type: 'success', text: 'Resubmission access granted successfully!' });
      setTimeout(() => {
        setToast(prev => prev.text === 'Resubmission access granted successfully!' ? { type: '', text: '' } : prev);
      }, 5000);
    } catch (e) {
      setProcessingMessage(null);
      const errMsg = safeErrorText(e, 'Failed to grant resubmission access');
      setToast({ type: 'error', text: errMsg });
      await showAlert('Failed to grant resubmission access: ' + errMsg, { title: 'Error', type: 'warn' });
    }
  };

  const rejectOT = async (id, dateStr) => {
    if (!id) {
      await showAlert('Entry ID is missing for OT rejection.', { title: 'Error', type: 'warn' });
      return;
    }
    setRejectModal({ isOpen: true, entryId: id, dateStr, isOT: true, reason: '', hasError: false });
  };

  const handleFileChange = async (e) => {

    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        await showAlert('File size should be less than 2MB.', { title: 'File Too Large', type: 'warn' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setOtModal({ ...otModal, clientApprovalFile: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCloseOtModal = async () => {
    if (isOtFormDirty()) {
      const confirmLeave = await showConfirm(
        'Your changes have not been saved. Do you still want to close?',
        { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Discard', cancelLabel: 'Keep Editing' }
      );
      if (!confirmLeave) return;
    }
    setOtModal({ ...otModal, isOpen: false });
  };

  const handleOTSubmit = async (status) => {
    const checkReason = validateAndCleanReason(otModal.reason, 'OT Reason');
    if (!checkReason.isValid) {
      setOtModal(prev => ({ 
        ...prev, 
        hasError: true, 
        errorMsg: checkReason.error 
      }));
      setTimeout(() => {
        const el = document.getElementById("ot-reason");
        if (el) el.focus();
      }, 50);
      return;
    }
    const formattedReason = checkReason.cleaned;
    const formattedRemarks = otModal.remarks ? otModal.remarks.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim() : '';
    if (!otModal.clientApproved) {
      return;
    }

    let row = editedRows[otModal.dateStr] || entries[otModal.dateStr] || { date: otModal.dateStr, type: 'Working Day' };
    
    // Ensure the ID from entries is preserved to prevent duplicate insert errors
    if (entries[otModal.dateStr] && entries[otModal.dateStr].id && !row.id) {
      row.id = entries[otModal.dateStr].id;
    }
    
    const errs = getValidationErrors(row);
    if (errs.length > 0) { await showAlert('Validation Errors: ' + errs.join(', '), { title: 'Validation Error', type: 'warn' }); return; }

    const h = calculateHours(row);
    if (h.error) { await showAlert('Validation Errors: ' + h.errors.join(', '), { title: 'Validation Error', type: 'warn' }); return; }

    if (!row.user || !row.user.id) row.user = { id: employee.id };

    const isReapplyOnRejected = otModal.isReapply;

    if (isReapplyOnRejected && !otModal.timingsChanged) {
      const oldReason = formatReasonText(otModal.oldReason || row.otReason || '');
      const oldClientApprovalFile = row.clientApprovalFile || '';
      const isSameFile = otModal.clientApprovalFile === oldClientApprovalFile;
      if (formattedReason === oldReason && isSameFile) {
        setOtModal(prev => ({ ...prev, hasError: true }));
        setTimeout(() => {
          const el = document.getElementById("ot-reason");
          if (el) el.focus();
        }, 50);
        return;
      }
    }

    // Keep timesheet status as-is — OT filing must NOT auto-submit the timesheet.
    // Only default to 'Draft' when the row has no status yet so it persists with a valid value.
    if (!row.status) {
      row.status = 'Draft';
    }

    const otStatusToSave = isReapplyOnRejected ? 'Refilled' : 'Filed';
    const newOtReapplyCount = isReapplyOnRejected ? (otModal.otReapplyCount + 1) : (row.otReapplyCount || 0);

    setOtModal({...otModal, isOpen: false});

    setEditedRows(prev => {
      const base = prev[otModal.dateStr] || entries[otModal.dateStr] || row;
      return {
        ...prev,
        [otModal.dateStr]: {
          ...base,
          otStatus: otStatusToSave,
          otReason: formattedReason,
          otRemarks: formattedRemarks,
          clientApproved: otModal.clientApproved,
          clientApprovalFile: otModal.clientApprovalFile,
          otReapplyCount: newOtReapplyCount,
          otAppliedAmIn: base.amIn || '',
          otAppliedAmOut: base.amOut || '',
          otAppliedLunchOut: base.lunchOut || '',
          otAppliedLunchIn: base.lunchIn || '',
          otAppliedPmIn: base.pmIn || '',
          otAppliedPmOut: base.pmOut || '',
        }
      };
    });
    // We intentionally DO NOT call api.post('/timesheets/save') here to prevent premature saving.
    // The user MUST click the "Submit" or "Resubmit" button on the timesheet row to save everything atomically.
  };

  const getRowBgColor = (type, isWknd) => {
    if (isWknd || type === 'Week Off') return '#D3D3D3'; // Dark Grey (#D3D3D3)
    if (type === 'Holiday') return '#ffe4e1'; // Rose
    if (type === 'Paid Leave' || type === 'Unpaid Leave') return '#fff8e1'; // Amber
    if (type === 'WFH') return '#e0f7fa'; // Sky Blue
    return '#ffffff'; // White
  };

  const fmtMins = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  let daysLogged = 0, regSum = 0, otSum = 0, totSum = 0, leaveHrs = 0, holHrs = 0, wkndDays = 0, pendAppr = 0;
  days.forEach(d => {
    if(isWeekendDay(d)) wkndDays++;
  });
  
  Object.values(entries).forEach(r => {
    if (r.status === 'Pending') pendAppr++;
    const h = calculateHours(r);
    if (!h.error && h.rawMins > 0) {
      if (r.status && r.status !== 'Draft') {
        daysLogged++;
      }
      if (r.type === 'Holiday') {
        if (r.status === 'Approved') {
          holHrs += h.rawMins;
        }
      } else if (r.type === 'Paid Leave' || r.type === 'Unpaid Leave') {
        if (r.status === 'Approved') {
          leaveHrs += h.rawMins;
        }
      }

      const rMins = h.regMins || 0;
      const oMins = h.rawMins - rMins;

      if (r.status === 'Approved') {
        regSum += rMins;
        totSum += rMins;
      }
      if (r.otStatus === 'Approved') {
        otSum += oMins;
        totSum += oMins;
      }
    }
  });

  // ─── Date-Range Excel Export ─────────────────────────────────────
  const openExportModal = () => {
    // Pre-fill with first/last day of current displayed month
    const firstDay = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const lastDay = format(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), 'yyyy-MM-dd');
    setExportModal({ isOpen: true, fromDate: firstDay, toDate: lastDay, isLoading: false, error: '' });
  };

  const handleExportSubmit = async () => {
    const { fromDate, toDate } = exportModal;
    console.log('[Export] Start submit', { fromDate, toDate });
    
    const fromErr = !fromDate;
    const toErr = !toDate;
    const dateRangeErr = fromDate && toDate && (fromDate > toDate);
    
    if (fromErr || toErr) {
      setExportModal(m => ({ 
        ...m, 
        error: 'Please select both From and To dates.',
        fromDateError: fromErr,
        toDateError: toErr
      }));
      setTimeout(() => {
        const el = document.getElementById(fromErr ? "export-from-date" : "export-to-date");
        if (el) el.focus();
      }, 50);
      return;
    }
    if (dateRangeErr) {
      setExportModal(m => ({ 
        ...m, 
        error: '"From" date must be on or before "To" date.',
        fromDateError: true,
        toDateError: true
      }));
      setTimeout(() => {
        const el = document.getElementById("export-from-date");
        if (el) el.focus();
      }, 50);
      return;
    }
    setExportModal(m => ({ ...m, isLoading: true, error: '', fromDateError: false, toDateError: false }));
    try {
      const filename = getExportFilename(employee.name, employee.empId, fromDate, toDate);
      console.log('[Export] Generated filename:', filename);

      // Build date range using parseISO + addDays (timezone-safe, no UTC offset bugs)
      const startDate = parseISO(fromDate);
      const rangeDays = [];
      let current = startDate;
      while (format(current, 'yyyy-MM-dd') <= toDate) {
        rangeDays.push(current);
        current = addDays(current, 1);
      }
      console.log('[Export] Total range days:', rangeDays.length);

      // Collect all entries across every unique month in the range (parallel fetch)
      const monthKeys = [...new Set(rangeDays.map(d => `${format(d, 'yyyy')}-${parseInt(format(d, 'M'))}` ))];
      console.log('[Export] Unique month keys:', monthKeys);

      const allEntries = {};
      await Promise.all(monthKeys.map(async key => {
        const [yr, mo] = key.split('-');
        try {
          console.log(`[Export] Fetching timesheets for month: ${yr}-${mo}`);
          const res = await api.get(`/timesheets/${employee.empId}/${yr}/${mo}`);
          console.log(`[Export] Fetched ${res.data.length} entries for ${yr}-${mo}`);
          res.data.forEach(e => { allEntries[e.date] = e; });
        } catch (monthErr) {
          console.error(`[Export] Month fetch failed for ${yr}-${mo}:`, monthErr);
        }
      }));

      // ── Group days by calendar month → one entry per month ──────────────
      // e.g. { "January 2025": [day1, day2, ...], "February 2025": [...] }
      const monthGroups = {};
      const monthOrder  = [];
      rangeDays.forEach(d => {
        const label = format(d, 'MMMM yyyy'); // "January 2025"
        if (!monthGroups[label]) {
          monthGroups[label] = [];
          monthOrder.push(label);
        }
        monthGroups[label].push(d);
      });

      // ── Build months array for the backend ────────────────────────────────
      const months = monthOrder.map(label => {
        const days = monthGroups[label];
        const rows = days.map(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const row = allEntries[dateStr] || {};
          const isWknd = isWeekendDay(d);
          const type = row.type || (isWknd ? 'Week Off' : 'Working Day');
          const h = calculateHours(row);

          // Compute display status matching UI logic
          const hasResubmitAccess = row.otResubmissionGranted && !row.otResubmissionUsed;
          let displayStatus = row.status || '';
          if (hasResubmitAccess && displayStatus === 'Approved') {
            displayStatus = 'Permission Granted';
          }

          let displayOtStatus = row.otStatus || '';
          if (hasResubmitAccess && displayOtStatus !== 'Refilled' && displayOtStatus !== 'Filed') {
            displayOtStatus = 'Permission Granted';
          }

          return {
            date:     format(d, 'dd MMM yyyy'),
            day:      format(d, 'EEEE'),
            type,
            amIn:     row.amIn     || '',
            amOut:    row.amOut    || '',
            lunchOut: row.lunchOut || '',
            lunchIn:  row.lunchIn  || '',
            pmIn:     row.pmIn     || '',
            pmOut:    row.pmOut    || '',
            regHrs:   (h.error || h.reg === '--') ? '' : h.reg,
            otHrs:    (h.error || h.ot  === '--') ? '' : h.ot,
            totalHrs: (h.error || h.tot === '--') ? '' : h.tot,
            otStatus: displayOtStatus,
            status:   displayStatus,
            isWeekend: String(isWknd)
          };
        });
        return { monthLabel: label, rows };
      });

      console.log('[Export] Month groups:', months.map(m => `${m.monthLabel} (${m.rows.length} days)`));

      const payload = {
        empName:  employee.name,
        empId:    employee.empId,
        dept:     employee.dept    || '',
        manager:  employee.manager || '',
        projectName: employee.projectName || '',
        companyName: employee.companyName || '',
        filename,
        months   // array of { monthLabel, rows }
      };
      console.log('[Export] Submitting payload to backend');

      const response = await api.post('/admin/export/timesheet', payload, {
        responseType: 'blob'
      });
      console.log('[Export] Received response from backend, status:', response.status);

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      console.log('[Export] Created blob size:', blob.size);
      if (blob.size === 0) throw new Error('Received empty file from server.');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      console.log('[Export] Anchor link clicked');
      document.body.removeChild(link);
      setTimeout(() => { URL.revokeObjectURL(url); }, 1000);

      setExportModal({ isOpen: false, fromDate: '', toDate: '', isLoading: false, error: '' });
      console.log('[Export] Finished successfully!');

    } catch (err) {
      console.error('[Export] Error caught:', err);
      let errMsg = err?.message || 'Export failed. Please try again.';
      if (err?.response && err.response.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          try {
            const parsed = JSON.parse(text);
            errMsg = parsed.message || parsed.error || text;
          } catch (_) {
            errMsg = text || `HTTP ${err.response.status}`;
          }
        } catch (_) {}
      }
      setExportModal(m => ({ ...m, isLoading: false, error: errMsg }));
    }
  };


  return (
    <div className="main-content" id="empDash">
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '25px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {isAdmin && (
              <>
                <button 
                  onClick={async () => {
                    if (isTimesheetDirty() || isProfileDirty() || isOtFormDirty()) {
                      const confirmLeave = await showConfirm(
                        'Your changes have not been saved. Do you still want to go back?',
                        { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Go Back', cancelLabel: 'Stay' }
                      );
                      if (!confirmLeave) return;
                      setEditedRows({});
                    }
                    if (window.history.state && window.history.state.view === 'timesheet') {
                      window.history.back();
                    } else {
                      onBack();
                    }
                  }} 
                  title="Back to Employees"
                  style={{
                    background: '#fff', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '8px', 
                    width: '36px', 
                    height: '36px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: '#475569',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.color = '#0f172a';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                </button>
                <div style={{ width: '1px', height: '32px', background: '#cbd5e1', margin: '0 4px' }}></div>
              </>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ 
                width: '38px', 
                height: '38px', 
                borderRadius: '50%', 
                background: employee.color || '#2d8f7b', 
                color: '#fff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '15px', 
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {employee.initials || employee.name?.charAt(0) || 'U'}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', lineHeight: '1.2' }}>{employee.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {employee.projectName && <span style={{ fontSize: '10px', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>Project: {employee.projectName}</span>}
                </div>
              </div>
            </div>
          </div>
          
          {isAdmin && (
            <button
              onClick={handleOpenProfile}
              style={{
                background: '#fff',
                border: '1.5px solid var(--teal)',
                color: 'var(--teal)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(45,143,123,0.05)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--teal-light)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              View Profile
            </button>
          )}
        </div>

        <div className={`stat-grid ${isAdmin ? 'admin-grid' : 'emp-grid'}`} id="empStatGrid" style={{padding: '20px', margin: 0, gap: '12px'}}>
          <div className="stat-card teal" style={{boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Days Logged</div><div className="stat-value" style={{color:'#2d8f7b'}}>{daysLogged}</div><div className="stat-sub">working days</div></div>
          <div className="stat-card sky" style={{boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Regular Hours</div><div className="stat-value" style={{color:'#3a8dc5'}}>{fmtMins(regSum)}</div><div className="stat-sub">standard work hrs</div></div>
          <div className="stat-card rose" style={{boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">OT Hours</div><div className="stat-value" style={{color:'#d94f4f'}}>{fmtMins(otSum)}</div><div className="stat-sub">overtime logged</div></div>
          {isAdmin && (
            <>
              <div className="stat-card" style={{borderLeft: '4px solid #1f3360', boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Total Hours</div><div className="stat-value" style={{color:'#1f3360'}}>{fmtMins(totSum)}</div><div className="stat-sub">worked</div></div>
              <div className="stat-card" style={{borderLeft: '4px solid #f59e0b', boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Leave Hours</div><div className="stat-value" style={{color:'#f59e0b'}}>{fmtMins(leaveHrs)}</div><div className="stat-sub">paid/unpaid</div></div>
              <div className="stat-card" style={{borderLeft: '4px solid #e11d48', boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Holiday Hours</div><div className="stat-value" style={{color:'#e11d48'}}>{fmtMins(holHrs)}</div><div className="stat-sub">public holidays</div></div>
              <div className="stat-card" style={{borderLeft: '4px solid #8b5cf6', boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Working Days</div><div className="stat-value" style={{color:'#8b5cf6'}}>{days.length - wkndDays}</div><div className="stat-sub">in month</div></div>
              <div className="stat-card" style={{borderLeft: '4px solid #d97706', boxShadow: 'none', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#fff'}}><div className="stat-label">Pending Appr.</div><div className="stat-value" style={{color:'#d97706'}}>{pendAppr}</div><div className="stat-sub">requests</div></div>
            </>
          )}
        </div>
      </div>

      <div className="page-header" style={{marginTop: '0px', marginBottom: '15px'}}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <button
            onClick={() => {
              const picker = document.getElementById('timesheetMonthPickerInput');
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
            <span>{format(currentDate, 'MMMM yyyy')}</span>
          </button>
          <input
            type="month"
            id="timesheetMonthPickerInput"
            value={format(currentDate, 'yyyy-MM')}
            onChange={async (e) => {
              if (e.target.value) {
                if (isTimesheetDirty()) {
                  const confirmLeave = await showConfirm(
                    'Your changes have not been saved. Do you still want to change the month?',
                    { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Change Month', cancelLabel: 'Stay' }
                  );
                  if (!confirmLeave) return;
                  setEditedRows({});
                }
                const [year, month] = e.target.value.split('-').map(Number);
                const newDate = new Date(year, month - 1, 1);
                setCurrentDate(newDate);
              }
            }}
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
        {isAdmin && (
          <button
            onClick={openExportModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
              background: 'linear-gradient(135deg, #1a2744 0%, #2d8f7b 100%)',
              color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600',
              boxShadow: '0 2px 8px rgba(45,143,123,0.35)',
              transition: 'all 0.2s ease', letterSpacing: '0.3px'
            }}
            onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(45,143,123,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,143,123,0.35)'; e.currentTarget.style.transform = 'none'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export XLSX
          </button>
        )}
      </div>

      <div className="card no-scrollbar" style={{ padding: 0, overflow: 'hidden', overflowX: 'auto', marginBottom: '20px' }}>
        <div className="table-wrap no-scrollbar">
          <table className="timesheet-table" style={{width: '100%', borderCollapse: 'separate', borderSpacing: 0}}>
            <thead style={{ background: 'var(--navy)' }}>
              <tr>
                <th className="left-th" rowSpan={2} style={{ background: 'var(--navy)', borderRight: 'none', boxShadow: '0 0 0 0.5px var(--navy)' }}>Date</th>
                <th className="left-th" rowSpan={2} style={{ background: 'var(--navy)', borderRight: 'none', boxShadow: '0 0 0 0.5px var(--navy)' }}>Day</th>
                <th className="left-th" rowSpan={2} style={{ background: 'var(--navy)', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px var(--navy)' }}>Day Type</th>
                <th className="grp" colSpan={2} style={{ background: '#1d5c4a', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #1d5c4a' }}>Morning Session</th>
                <th className="grp" colSpan={2} style={{ background: '#3a4f8a', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #3a4f8a' }}>Lunch Break</th>
                <th className="grp" colSpan={2} style={{ background: '#1d5c4a', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #1d5c4a' }}>Afternoon Session</th>
                <th rowSpan={2} style={{ background: '#1f3360', borderRight: 'none', boxShadow: '0 0 0 0.5px #1f3360', textTransform: 'none' }}>REG Hrs</th>
                <th rowSpan={2} style={{ background: '#1f3360', borderRight: 'none', boxShadow: '0 0 0 0.5px #1f3360', textTransform: 'none' }}>OT Hrs</th>
                <th rowSpan={2} style={{ background: '#1f3360', borderRight: 'none', boxShadow: '0 0 0 0.5px #1f3360', textTransform: 'none' }}>TOTAL Hrs</th>
                <th rowSpan={2} style={{ background: '#455fa0', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #455fa0' }}>OT</th>
                <th rowSpan={2} style={{ background: 'var(--navy)', borderRight: 'none', boxShadow: '0 0 0 0.5px var(--navy)' }}>Status</th>
              </tr>
              <tr>
                <th className="grp" style={{ background: '#236b55', borderRight: 'none', boxShadow: '0 0 0 0.5px #236b55' }}>AM In</th>
                <th className="grp" style={{ background: '#236b55', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #236b55' }}>AM Out</th>
                <th className="grp" style={{ background: '#455fa0', borderRight: 'none', boxShadow: '0 0 0 0.5px #455fa0' }}>Lunch In</th>
                <th className="grp" style={{ background: '#455fa0', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #455fa0' }}>Lunch Out</th>
                <th className="grp" style={{ background: '#236b55', borderRight: 'none', boxShadow: '0 0 0 0.5px #236b55' }}>PM In</th>
                <th className="grp" style={{ background: '#236b55', borderRight: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 0 0 0.5px #236b55' }}>PM Out</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const dateStr = format(d, 'yyyy-MM-dd');
                const isToday = isSameDay(d, new Date());
                const isWknd = isWeekendDay(d);
                let row = editedRows[dateStr] || entries[dateStr] || { type: isWknd ? 'Week Off' : 'Working Day', status: '' };

                const isEdited = !!editedRows[dateStr];
                const hrs = calculateHours(row);
                const savedHrs = isEdited && entries[dateStr] ? calculateHours(entries[dateStr]) : hrs;
                const otTimingChanged = isEdited && !!row.otStatus && hrs.ot !== '--' && savedHrs.ot !== hrs.ot;
                const TIMING_FIELDS = ['amIn', 'amOut', 'lunchOut', 'lunchIn', 'pmIn', 'pmOut', 'type'];
                const timingsModifiedSinceSave = isEdited && !!entries[dateStr] && TIMING_FIELDS.some(f => (row[f] || '') !== (entries[dateStr][f] || ''));
                const isVisuallyEdited = isEdited && (!entries[dateStr] || timingsModifiedSinceSave);
                const bgColor = getRowBgColor(row.type, isWknd);
                
                const isLockedType = ['Week Off', 'Paid Leave', 'Unpaid Leave'].includes(row.type);
                const isTimeEntryOptional = ['Week Off', 'Holiday', 'Paid Leave', 'Unpaid Leave'].includes(row.type);
                const isApproved = row.status === 'Approved';
                const hasResubmitAccess = row.otResubmissionGranted && !row.otResubmissionUsed;
                const originalHasOT = !!entries[dateStr] && 
                                       !!(entries[dateStr]?.otStatus) && 
                                       entries[dateStr]?.otStatus !== '' && 
                                       !!(entries[dateStr]?.otReason) && 
                                       entries[dateStr]?.otReason.trim() !== '' && 
                                       calculateHours(entries[dateStr]).ot !== '--';
                const isFutureDay = isAfter(startOfDay(d), startOfDay(new Date()));
                const isLocked = !isAdmin && isPastDeadline(dateStr);
                const isPendingWorkflow = 
                  (row.status && row.status.toLowerCase().includes('pending')) ||
                  (row.otStatus && row.otStatus.toLowerCase().includes('pending')) ||
                  ['Filed', 'Refilled'].includes(row.otStatus);
                const isReadonly = isAdmin || isPendingWorkflow || (isApproved && !hasResubmitAccess && !isAdmin) || (!isAdmin && isFutureDay) || isLocked;
                const shouldShowData = !isAdmin || row.submitted;

                let rowClass = isWknd ? 'row-weekend' : (row.type === 'Holiday' ? 'row-holiday' : (row.type === 'Paid Leave' || row.type === 'Unpaid Leave' ? 'row-leave' : (row.type === 'WFH' ? 'row-wfh' : '')));
                if (hasResubmitAccess && !isAdmin) {
                  rowClass += ' row-resubmit-access';
                }

                const isShortHours = 
                  !isWknd &&
                  ['Working Day', 'WFH'].includes(row.type || 'Working Day') && 
                  row.amIn && row.pmOut && 
                  hrs.rawMins > 0 && 
                  hrs.rawMins < 480;
                const shouldHighlightShortHours = isShortHours && row.status !== 'Approved';

                const renderShortHoursIndicator = (r, dStr, h) => {
                  if (!isShortHours) return null;
                  return (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        const existingReason = r.shortHoursReason || entries[dStr]?.shortHoursReason || '';
                        if (isAdmin) {
                          setAdminShortHoursModalData({
                            id: r.id,
                            name: employee.name,
                            empId: employee.empId,
                            date: dStr,
                            hours: h.tot,
                            reason: existingReason,
                            isReadOnly: ['Approved', 'Rejected'].includes(r.status) || isPendingWorkflow
                          });
                          setAdminRejectionText('');
                          setIsAdminRejectMode(false);
                          setAdminShortHoursError('');
                          setIsAdminShortHoursModalOpen(true);
                        } else {
                          setShortHoursModalData({ 
                            date: dStr, 
                            timings: r, 
                            hours: h.tot, 
                            isReadOnly: ['Approved', 'Rejected'].includes(r.status) || isPendingWorkflow
                          });
                          setShortHoursReasonText(existingReason);
                          setShortHoursError('');
                          setIsShortHoursModalOpen(true);
                        }
                      }}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        marginLeft: '6px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        verticalAlign: 'middle'
                      }}
                      title="Click to view short hours reason"
                    >
                      !
                    </span>
                  );
                };

                let rowStyle = { backgroundColor: bgColor };
                if (!isAdmin && shouldHighlightShortHours) {
                  rowStyle.backgroundColor = '#fee2e2';
                }
                if (hasResubmitAccess && !isAdmin) {
                  rowStyle.boxShadow = 'inset 5px 0 0 0 #7f1d1d'; // Even darker red border
                } else if (isToday) {
                  rowStyle.boxShadow = 'inset 4px 0 0 0 #e8a020';
                  rowStyle.fontWeight = '500';
                }
                
                const otAppliedAmIn = row.otAppliedAmIn !== undefined ? row.otAppliedAmIn : (entries[dateStr]?.amIn || '');
                const otAppliedAmOut = row.otAppliedAmOut !== undefined ? row.otAppliedAmOut : (entries[dateStr]?.amOut || '');
                const otAppliedLunchOut = row.otAppliedLunchOut !== undefined ? row.otAppliedLunchOut : (entries[dateStr]?.lunchOut || '');
                const otAppliedLunchIn = row.otAppliedLunchIn !== undefined ? row.otAppliedLunchIn : (entries[dateStr]?.lunchIn || '');
                const otAppliedPmIn = row.otAppliedPmIn !== undefined ? row.otAppliedPmIn : (entries[dateStr]?.pmIn || '');
                const otAppliedPmOut = row.otAppliedPmOut !== undefined ? row.otAppliedPmOut : (entries[dateStr]?.pmOut || '');

                const timingsChangedSinceOtApply = 
                  !!row.otStatus && 
                  (row.otStatus === 'Filed' || row.otStatus === 'Refilled') && (
                    (row.amIn || '') !== otAppliedAmIn ||
                    (row.amOut || '') !== otAppliedAmOut ||
                    (row.lunchOut || '') !== otAppliedLunchOut ||
                    (row.lunchIn || '') !== otAppliedLunchIn ||
                    (row.pmIn || '') !== otAppliedPmIn ||
                    (row.pmOut || '') !== otAppliedPmOut
                  );

                const isNoSubmitNeeded = row.type === 'Week Off';
                const isWeekendOrHoliday = isWknd || row.type === 'Holiday';
                const isWkType = ['Working Day', 'WFH'].includes(row.type || (isWknd ? 'Week Off' : 'Working Day'));
                
                let hasAllFields = true;
                if (isWkType) {
                  if (isWeekendOrHoliday) {
                    const hasAm = row.amIn && row.amOut;
                    const hasPm = row.pmIn && row.pmOut;
                    const lunchValid = (!row.lunchOut && !row.lunchIn) || (row.lunchOut && row.lunchIn);
                    hasAllFields = !!((hasAm || hasPm) && lunchValid);
                  } else {
                    hasAllFields = !!(row.amIn && row.amOut && row.lunchOut && row.lunchIn && row.pmIn && row.pmOut);
                  }
                } else if (row.type === 'Holiday') {
                  const hasAny = row.amIn || row.amOut || row.lunchOut || row.lunchIn || row.pmIn || row.pmOut;
                  if (hasAny) {
                    const hasAm = row.amIn && row.amOut;
                    const hasPm = row.pmIn && row.pmOut;
                    const lunchValid = (!row.lunchOut && !row.lunchIn) || (row.lunchOut && row.lunchIn);
                    hasAllFields = !!((hasAm || hasPm) && lunchValid);
                  } else {
                    hasAllFields = true;
                  }
                }

                const hasValidTimes = hasAllFields && !hrs.error;
                const canSubmit = !isAdmin && (row.status !== 'Approved' || hasResubmitAccess) && (!isNoSubmitNeeded) && (hasValidTimes || (isTimeEntryOptional && !hrs.error)) && !isFutureDay && !isLocked;
                const justAppliedOT = row.otStatus && row.otStatus !== (entries[dateStr]?.otStatus || null) && !timingsChangedSinceOtApply;
                const showOTApply = !isReadonly && !isLockedType && hrs.ot !== '--' && (!row.otStatus || (isVisuallyEdited && !justAppliedOT));

                const renderInput = (field) => {
                  if (isAdmin && !row.submitted) {
                    return <span style={{fontSize:'12px', color:'#999'}}>--</span>;
                  }

                  const val = row[field] || '';

                  return (
                    <UnifiedTimeSelection
                      value={val}
                      onChange={(newVal) => handleRowChange(dateStr, field, newVal)}
                      disabled={isReadonly || isLockedType}
                      isError={hrs.error}
                    />
                  );
                };

                return (
                  <tr 
                    key={dateStr} 
                    id={`row-${dateStr}`} 
                    className={rowClass} 
                    style={rowStyle}
                    onKeyDown={e => handleRowKeyDown(e, dateStr)}
                  >
                    <td style={{whiteSpace:'nowrap'}}>{format(d, 'dd MMM')}</td>
                    <td>{format(d, 'EEE')}</td>
                    <td>
                        {!shouldShowData ? (
                           <span style={{fontSize:'13px', color:'#999'}}>--</span>
                        ) : (
                          <select 
                            value={row.type || ''} 
                            onChange={e => handleTypeChange(dateStr, e.target.value)}
                            disabled={isReadonly}
                            className="day-type-select"
                            style={{background: isReadonly ? 'transparent' : '#fff'}}
                          >
                            {isWknd ? (
                              <>
                                <option>Working Day</option>
                                <option>WFH</option>
                                {row.type && !['Working Day', 'WFH'].includes(row.type) && (
                                  <option disabled hidden value={row.type}>{row.type}</option>
                                )}
                              </>
                            ) : (
                              <>
                                <option>Working Day</option>
                                <option>WFH</option>
                                <option>Holiday</option>
                                <option>Paid Leave</option>
                                <option>Unpaid Leave</option>
                                {row.type === 'Week Off' && (
                                  <option value="Week Off" disabled hidden>Week Off</option>
                                )}
                              </>
                            )}
                          </select>
                        )}
                    </td>
                    <td align="center">{renderInput('amIn')}</td>
                    <td align="center">{renderInput('amOut')}</td>
                    <td align="center">{renderInput('lunchOut')}</td>
                    <td align="center">{renderInput('lunchIn')}</td>
                    <td align="center">{renderInput('pmIn')}</td>
                    <td align="center">{renderInput('pmOut')}</td>
                    
                    <td style={{fontWeight: 'bold', color: '#0d9488', textAlign: 'center'}}>{shouldShowData ? hrs.reg : '--'}</td>
                    <td style={{fontWeight: 'bold', color: '#e11d48', textAlign: 'center'}}>{shouldShowData ? hrs.ot : '--'}</td>
                    <td style={{fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center'}}>{shouldShowData ? hrs.tot : '--'}</td>
                    
                    <td align="center">
                      {showOTApply && (
                        <div style={{display:'flex', alignItems:'center', gap:'4px', justifyContent:'center'}}>
                          <span style={{background:'#e85d5d', color:'#fff', borderRadius:'50%', width:'14px', height:'14px', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'bold'}}>!</span>
                           <button onClick={() => openOtModal({ 
                             isOpen: true, 
                             dateStr, 
                             otHours: hrs.ot, 
                             reason: row.otReason || '', 
                             remarks: row.otRemarks || '', 
                             entryId: row.id,
                             status: row.otStatus || '',
                             rejectionReason: row.otRejectionReason || '',
                             clientApproved: row.clientApproved || false, 
                             clientApprovalFile: row.clientApprovalFile || '',
                             isReapply: originalHasOT && (row.status === 'Rejected' || row.otStatus === 'Rejected' || row.otStatus === 'Refilled' || row.otStatus === 'Filed' || hasResubmitAccess || timingsChangedSinceOtApply),
                             timingsChanged: timingsChangedSinceOtApply,
                             otReapplyCount: row.otReapplyCount || 0,
                             oldReason: row.otReason || '',
                             isNewReasonVisible: false
                           })} className="ot-apply-btn" style={{background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}} onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#ef4444'; }} onMouseOut={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}>
                            {(originalHasOT && (row.status === 'Rejected' || row.otStatus === 'Rejected' || row.otStatus === 'Refilled' || row.otStatus === 'Filed' || hasResubmitAccess || timingsChangedSinceOtApply)) ? 'Reapply OT' : 'Apply OT'}
                           </button>
                        </div>
                      )}
                                      {shouldShowData && !showOTApply && (row.otStatus || row.status === 'Rejected' || hasResubmitAccess) && hrs.ot !== '--' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {hasResubmitAccess && row.otStatus !== 'Refilled' && row.otStatus !== 'Filed' ? (
                            <>
                              <span style={{fontSize:'11px', color: isAdmin ? '#d97706' : '#ffffff', fontWeight:'bold'}}>{isAdmin ? 'Waiting for Resubmission' : 'Permission Granted'}</span>
                              <ViewIcon className="view-icon" onClick={() => setReasonViewModal({ isOpen: true, reason: row.otResubmissionMessage, title: 'OT Resubmission Access', dateStr: dateStr })} color={isAdmin ? "#d97706" : "#ffffff"} />
                            </>
                          ) : (
                            <>
                              {(row.otStatus === 'Filed' || row.otStatus === 'Refilled') && (!isAdmin || (row.status !== 'Draft' && row.status !== 'Rejected' && row.status !== '')) && (
                                <div style={{display:'flex', flexDirection:'row', alignItems:'center', gap:'4px'}}>
                                  {isAdmin && (row.otStatus === 'Filed' || row.otStatus === 'Refilled') && row.clientApproved && (
                                    <input
                                      type="checkbox"
                                      checked
                                      readOnly
                                      title="Client approval received"
                                      style={{accentColor: '#16a34a', width:'13px', height:'13px', cursor:'default', margin:0}}
                                    />
                                  )}
                                   <span style={{fontSize:'11px', color:'#d97706', fontWeight:'bold'}}>{(row.otStatus === 'Filed' || row.otStatus === 'Refilled') ? (row.otStatus === 'Filed' ? 'Filled' : 'Refilled') : row.otStatus}</span>
                                </div>
                              )}
                              {(row.otStatus === 'Approved' || (row.status === 'Approved' && row.otStatus && !['Rejected', 'Filed', 'Refilled'].includes(row.otStatus))) && (
                                <span style={{fontSize:'11px', color:'#0d9488', fontWeight:'bold'}}>Approved</span>
                              )}
                              {(row.otStatus === 'Rejected' || (row.status === 'Rejected' && (!row.otStatus || isAdmin || row.otStatus !== 'Refilled'))) && (
                                <span style={{fontSize:'11px', color:'#e85d5d', fontWeight:'bold'}}>Rejected</span>
                              )}
                            </>
                          )}

                           {!(hasResubmitAccess && row.otStatus !== 'Refilled' && row.otStatus !== 'Filed') && (isAdmin || row.otStatus === 'Filed' || row.otStatus === 'Approved' || row.otStatus === 'Refilled') && (
                            <ViewIcon 
                               onClick={() => openOtModal({ 
                                 isOpen: true, 
                                 dateStr, 
                                 otHours: hrs.ot, 
                                 reason: row.otReason || '', 
                                 remarks: row.otRemarks || '', 
                                 entryId: row.id,
                                 status: row.otStatus,
                                 rejectionReason: row.otRejectionReason,
                                 clientApproved: row.clientApproved,
                                 clientApprovalFile: row.clientApprovalFile,
                                 isReadOnly: row.status === 'Approved' || isAdmin || isPendingWorkflow,
                                 isReapply: originalHasOT && (row.status === 'Rejected' || row.otStatus === 'Rejected' || row.otStatus === 'Refilled' || row.otStatus === 'Filed' || hasResubmitAccess || timingsChangedSinceOtApply),
                                 timingsChanged: timingsChangedSinceOtApply,
                                 oldReason: row.otReason || '',
                                 isNewReasonVisible: false,
                                 otReapplyCount: row.otReapplyCount || 0
                               })} 
                              color={row.otStatus === 'Rejected' ? "#e85d5d" : "#455fa0"}
                            />
                          )}
                          {!isAdmin && row.otStatus === 'Rejected' && (
                            <ViewIcon 
                              onClick={() => setReasonViewModal({ 
                                isOpen: true, 
                                reason: row.otRejectionReason, 
                                title: 'OT Rejection Reason',
                                dateStr: dateStr
                              })} 
                              color="#e85d5d" 
                            />
                          )}
                        </div>
                      )}
                    </td>

                    <td className="status-cell" style={{textAlign: 'center', padding: '8px'}}>
                      {hrs.error && !isAdmin && (
                        <div style={{
                          color: '#e11d48',
                          background: '#fff1f2',
                          border: '1px solid #fecdd3',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          fontSize: '10px',
                          fontWeight: '600',
                          marginBottom: '6px',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          maxWidth: '150px',
                          marginLeft: 'auto',
                          marginRight: 'auto',
                          textAlign: 'center',
                          lineHeight: '1.3',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                          {hrs.errors[0]}
                        </div>
                      )}



                      {!isAdmin && (() => {
                         const isOTReapplied = (row.otStatus === 'Refilled' || (row.otStatus === 'Filed' && entries[dateStr]?.otStatus !== 'Filed')) && (row.status === 'Pending' || row.status === 'Rejected' || row.status === 'Approved');
                         return (
                         <>
                           {row.status === 'Approved' && !isVisuallyEdited && (
                             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {hasResubmitAccess ? (
                                 <>
                                   {renderShortHoursIndicator(row, dateStr, hrs)}
                                   <span style={{color: '#ffffff', fontWeight: 'bold'}}>Permission Granted</span>
                                    <ViewIcon className="view-icon" onClick={() => setReasonViewModal({ 
                                      isOpen: true, 
                                      reason: row.otResubmissionMessage, 
                                      title: (row.type === 'Paid Leave' || row.type === 'Unpaid Leave') ? 'Leave Resubmission Access' : 
                                             (row.type === 'Holiday') ? 'Holiday Resubmission Access' : 'OT Resubmission Access', 
                                      dateStr: dateStr 
                                    })} color="#ffffff" />
                                 </>
                               ) : (
                                 <>
                                   {renderShortHoursIndicator(row, dateStr, hrs)}
                                   <span style={{color: '#2d8f7b', fontWeight: 'bold'}}>Approved</span>
                                 </>
                               )}
                             </div>
                           )}
                           {row.status === 'Pending' && !isVisuallyEdited && !isOTReapplied && (
                             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {renderShortHoursIndicator(row, dateStr, hrs)}
                               <span style={{color: '#e8a020', fontWeight: 'bold'}}>Pending</span>
                             </div>
                           )}
                           {row.status === 'Rejected' && !isVisuallyEdited && !isOTReapplied && (
                             <div style={{color: '#e85d5d', fontWeight: 'bold', fontSize: '13px', display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                                {renderShortHoursIndicator(row, dateStr, hrs)}
                                Rejected
                               <ViewIcon className="view-icon" onClick={() => setReasonViewModal({ isOpen: true, reason: row.rejectionReason, title: 'Rejection Reason', dateStr: dateStr })} color="#e85d5d" />
                              </div>
                           )}
                           {row.status === 'Resubmit OT' && !isVisuallyEdited && (
                             <div style={{color: '#d97706', fontWeight: 'bold', fontSize: '13px', display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {renderShortHoursIndicator(row, dateStr, hrs)}
                               <span>Resubmit OT</span>
                             </div>
                           )}
                           {row.status === 'Reapproval Pending' && !isVisuallyEdited && (
                             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {renderShortHoursIndicator(row, dateStr, hrs)}
                               <span style={{color: '#d97706', fontWeight: 'bold'}}>Reapproval Pending</span>
                             </div>
                           )}
                           {isLocked && (!row.status || row.status === 'Draft' || row.status === '') && (
                             <span style={{color: '#64748b', fontWeight: 'bold', fontStyle: 'italic'}}>Locked</span>
                           )}

                           {canSubmit && (!row.status || row.status === 'Draft' || isVisuallyEdited || isOTReapplied) && (() => {
                               if (isShortHours) {
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         const existingReason = row.shortHoursReason || entries[dateStr]?.shortHoursReason || '';
                                         setShortHoursModalData({ date: dateStr, timings: row, hours: hrs.tot, isReadOnly: false });
                                         setShortHoursReasonText(existingReason);
                                         setShortHoursError('');
                                         setIsShortHoursModalOpen(true);
                                       }}
                                       className="emp-submit-btn"
                                       style={{
                                         background: 'var(--teal)',
                                         border: 'none',
                                         color: '#fff',
                                         padding: '5px 12px',
                                         borderRadius: '4px',
                                         cursor: 'pointer',
                                         fontWeight: 'bold',
                                         boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                         whiteSpace: 'nowrap'
                                       }}
                                     >
                                       Fill Reason
                                     </button>
                                      <div style={{
                                        color: hasResubmitAccess && !isAdmin ? '#ffffff' : '#ef4444',
                                        fontSize: '10.5px',
                                        fontWeight: 'bold',
                                        textAlign: 'center',
                                        marginTop: '2px',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        less then &lt; 8 hours
                                      </div>
                                  </div>
                                );
                              }

                             const needsOT = hrs.ot !== '--' && (!row.otStatus || row.otStatus === 'Rejected' || (hasResubmitAccess && row.otStatus !== 'Refilled' && row.otStatus !== 'Filed') || timingsChangedSinceOtApply);
                             const blocked = needsOT || (otTimingChanged && row.otStatus !== 'Refilled' && row.otStatus !== 'Filed');
                             const hint = blocked ? ((row.otStatus === 'Rejected' || (hasResubmitAccess && originalHasOT) || timingsChangedSinceOtApply || row.otStatus === 'Refilled') ? 'Reapply OT' : 'Apply OT') : '';
                             
                             let btnText = row.status === 'Pending' ? 'Submit' : (['Rejected', 'Reapproval Pending'].includes(row.status) || isOTReapplied || hasResubmitAccess) ? 'Resubmit' : (row.status === 'Approved' ? 'Re-submit' : 'Submit');
                             
                             return (
                               <>
                                 <button
                                   onClick={() => saveTimesheet(dateStr, true)}
                                   disabled={blocked}
                                   title={hint}
                                   className="emp-submit-btn"
                                   style={{background: '#fff', border: '1px solid #0d9488', color: '#0d9488', padding: '4px 12px', borderRadius: '4px', cursor: blocked ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: blocked ? 0.5 : 1}}
                                 >
                                   {btnText}
                                 </button>
                                 {blocked && <div style={{fontSize:'10px', color: hasResubmitAccess ? '#ffffff' : '#e11d48', fontWeight:'bold', textAlign:'center', marginTop:'4px'}}>{hint}</div>}

                               </>
                             );
                           })()}
                         </>
                         );
                      })()}
                                {isAdmin && (
                        <>
                           {isVisuallyEdited && (
                             <button
                               onClick={() => saveTimesheet(dateStr, false)}
                               style={{
                                 background: '#fff',
                                 border: '1.5px solid #2d8f7b',
                                 color: '#2d8f7b',
                                 padding: '4px 8px',
                                 borderRadius: '4px',
                                 cursor: 'pointer',
                                 fontWeight: 'bold',
                                 fontSize: '11px',
                                 marginBottom: '6px',
                                 display: 'inline-block'
                               }}
                             >
                               Save Changes
                             </button>
                           )}
                           {!isVisuallyEdited && (row.status === 'Pending' || row.status === 'Reapproval Pending') && (
                             <div style={{display:'flex', gap:'5px', flexDirection: 'column', alignItems: 'center'}}>
                                {row.status === 'Reapproval Pending' && <span style={{color:'#d97706', fontSize:'11px', fontWeight:'bold', marginBottom:'4px'}}>Reapproval Pending</span>}
                                {isShortHours ? (
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setAdminShortHoursModalData({
                                         id: row.id,
                                         name: employee.name,
                                         empId: employee.empId,
                                         date: dateStr,
                                         hours: hrs.tot,
                                         reason: row.shortHoursReason || 'No reason provided.'
                                       });
                                       setAdminRejectionText('');
                                       setIsAdminRejectMode(false);
                                       setAdminShortHoursError('');
                                       setIsAdminShortHoursModalOpen(true);
                                     }} 
                                     style={{background:'#455fa0', color:'#fff', padding:'5px 12px', borderRadius:'4px', cursor: 'pointer', border:'none', fontWeight:'bold', fontSize:'11px'}}
                                   >
                                     View Reason
                                   </button>
                                 ) : (
                                   <div className="admin-actions-container">
                                     <button 
                                       onClick={() => approveTimesheet(row.id, dateStr)} 
                                       style={{background:'#2d8f7b', color:'#fff', padding:'4px 8px', borderRadius:'4px', cursor: 'pointer', border:'none'}}
                                     >Approve</button>
                                     <button 
                                       onClick={() => rejectTimesheet(row.id, dateStr)} 
                                       style={{background:'#e85d5d', color:'#fff', padding:'4px 8px', borderRadius:'4px', cursor: 'pointer', border:'none'}}
                                     >Reject</button>
                                   </div>
                                 )}
                             </div>
                           )}
                           {!isVisuallyEdited && row.status === 'Resubmit OT' && <span style={{color:'#d97706', fontSize:'11px', fontWeight:'bold', textAlign: 'center'}}>Waiting for OT Re-submission</span>}
                           {!isVisuallyEdited && row.status === 'Approved' && (
                             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {row.otResubmissionGranted && !row.otResubmissionUsed ? (
                                 <span style={{color: '#d97706', fontWeight: 'bold'}}>Waiting for Resubmission</span>
                               ) : (
                                 <>
                                   {renderShortHoursIndicator(row, dateStr, hrs)}
                                   <span style={{color: '#2d8f7b', fontWeight: 'bold'}}>Approved</span>
                                   {!row.otResubmissionGranted && (
                                      <span style={{cursor:'pointer', marginLeft:'4px'}} title="Grant Resubmission" onClick={() => setGrantModal({isOpen: true, entryId: row.id, dateStr, message: ''})}>✏️</span>
                                   )}
                                 </>
                               )}
                             </div>
                           )}
                           {!isVisuallyEdited && row.status === 'Rejected' && (
                             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'4px'}}>
                               {renderShortHoursIndicator(row, dateStr, hrs)}
                               <span style={{color: '#e85d5d', fontWeight: 'bold'}}>Rejected</span>
                             </div>
                           )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{display:'flex', gap:'25px', padding:'15px 20px', background:'#fff', borderTop:'1px solid #eee', fontSize:'12px', color:'#4b5563', alignItems:'center', flexWrap: 'wrap'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', border:'2px solid #cbd5e1', background:'#ffffff'}}></div> Working Day</div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', border:'2px solid #8a8a8a', background:'#D3D3D3'}}></div> Weekend</div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', border:'2px solid #5a8f5a', background:'#eaf3ea'}}></div> Holiday</div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', border:'2px solid #f59e0b', background:'#fffbeb'}}></div> Leave</div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', border:'2px solid #0ea5e9', background:'#f0f9ff'}}></div> WFH</div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><span style={{background:'#e11d48', color:'#fff', borderRadius:'50%', width:'14px', height:'14px', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'900'}}>!</span> OT exceeded</div>
        </div>
      </div>

      {otModal.isOpen && (
        <div className="modal-overlay open">
          <div className="modal no-scrollbar" style={{maxWidth: '450px', padding: '15px', maxHeight: '90vh', overflowY: 'auto'}}>
            <div className="modal-header" style={{marginBottom: '12px'}}>
              <h3 style={{fontSize:'18px', color:'#1e293b'}}>OT Application Details</h3>
              <button className="modal-close" type="button" onClick={handleCloseOtModal}>&times;</button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleOTSubmit('Filed'); }} style={{ display: 'contents' }}>
              <div className="form-row" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px'}}>
                <div><label className="form-label" style={{fontSize:'11px', color:'#666'}}>DATE</label><input type="text" disabled value={otModal.dateStr} className="form-input" style={{background:'#f9f9f9', fontSize:'13px', padding:'6px'}} /></div>
                <div><label className="form-label" style={{fontSize:'11px', color:'#666'}}>OT HOURS</label><input type="text" disabled value={otModal.otHours} className="form-input" style={{background:'#f9f9f9', fontSize:'13px', padding:'6px'}} /></div>
              </div>

              <div className="form-group" style={{marginBottom: '12px'}}>
                {otModal.isReapply && (
                  <div style={{marginBottom: '12px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}}>
                      <label className="form-label" style={{marginBottom:0, fontSize:'11px'}}>PREVIOUS REASON</label>
                      {!otModal.isNewReasonVisible && !isAdmin && !otModal.isReadOnly && (
                        <button 
                          type="button"
                          onClick={() => setOtModal({...otModal, isNewReasonVisible: true, reason: ''})}
                          style={{background:'#f0f9ff', color:'#0369a1', border:'1px solid #bae6fd', borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px'}}
                        >
                          <span style={{fontSize:'14px', fontWeight:'bold'}}>+</span> Add New Reason
                        </button>
                      )}
                    </div>
                    <div style={{padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', color: '#4b5563'}}>
                      {otModal.oldReason || otModal.reason || <span style={{color: '#9ca3af', fontStyle: 'italic'}}>No reason provided</span>}
                    </div>
                  </div>
                )}

                {(!otModal.isReapply || otModal.isNewReasonVisible) && (
                  <div>
                    <label className="form-label" style={{fontSize:'11px', marginBottom:'6px', display:'block'}}>
                      {otModal.isReapply ? 'NEW OT REASON' : 'OT REASON'} <span style={{color:'#e11d48'}}>*</span>
                    </label>
                    {otModal.isReadOnly ? (
                      <div style={{padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', color: '#4b5563', minHeight: '40px'}}>
                        {otModal.reason || <span style={{color: '#9ca3af', fontStyle: 'italic'}}>No reason provided</span>}
                      </div>
                    ) : (
                      <>
                        <textarea 
                          id="ot-reason"
                          className={`form-input ${otModal.hasError ? 'invalid' : ''}`} 
                          style={{height: '80px', width: '100%', padding: '10px', borderRadius: '6px', border: otModal.hasError ? '1.5px solid #ef4444' : '1px solid #ddd', fontSize: '13px', resize: 'vertical'}}
                          value={otModal.reason}
                          onChange={e => setOtModal({...otModal, reason: e.target.value, hasError: false, errorMsg: ''})}
                          placeholder={otModal.isReapply ? "Enter the new reason for OT" : "Enter the reason for OT"}
                          disabled={otModal.isReadOnly}
                        />
                        {otModal.hasError && (
                          <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                            {otModal.errorMsg || 'OT Reason is required.'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: (!!otModal.clientApproved) ? '#f0fdf4' : '#fff', borderRadius: '6px', border: `1px solid ${(!!otModal.clientApproved) ? '#bbf7d0' : '#ddd'}`}}>
                <input 
                  type="checkbox" 
                  id="clientAppr"
                  disabled={otModal.isReadOnly}
                  checked={!!otModal.clientApproved}
                  onChange={e => setOtModal({...otModal, clientApproved: e.target.checked})}
                  style={{width:'16px', height:'16px', cursor: otModal.isReadOnly ? 'default' : 'pointer'}}
                />
                <label htmlFor="clientAppr" style={{fontSize:'12px', fontWeight:'500', cursor: otModal.isReadOnly ? 'default' : 'pointer', color: (!!otModal.clientApproved) ? '#166534' : '#333'}}>
                  Client Approval Received <span style={{color:'#e11d48'}}>*</span>
                </label>
              </div>

              {(!!otModal.clientApproved) && (
                <div style={{marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1'}}>
                  <label className="form-label" style={{fontSize:'11px'}}>APPROVAL ATTACHMENT {(!otModal.isReadOnly && otModal.clientApprovalFile) ? '(OPTIONAL)' : ''}</label>
                  {!otModal.isReadOnly ? (
                    <>
                      <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
                        <input 
                          key={otModal.clientApprovalFile ? 'attached' : 'empty'}
                          type="file" 
                          accept="image/*,.pdf" 
                          onChange={handleFileChange} 
                          style={{fontSize:'11px', flex:1}} 
                        />
                      </div>
                      {otModal.clientApprovalFile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                          {otModal.clientApprovalFile.startsWith('data:application/pdf') ? (
                            <div 
                              onClick={() => setImgPreview(otModal.clientApprovalFile)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', color: '#475569' }}
                            >
                              <span>📄 PDF Document (Click to view)</span>
                            </div>
                          ) : (
                            <div 
                              onClick={() => setImgPreview(otModal.clientApprovalFile)}
                              style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center' }}
                              title="Click to enlarge"
                            >
                              <img src={otModal.clientApprovalFile} alt="Preview" style={{ maxHeight: '60px', maxWidth: '120px', display: 'block' }} />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              const confirmDelete = await showConfirm(
                                'Do you want to remove this image?',
                                { title: 'Remove Image', type: 'remove', confirmLabel: 'Remove', cancelLabel: 'Keep' }
                              );
                              if (confirmDelete) {
                                setOtModal(prev => ({ ...prev, clientApprovalFile: '' }));
                              }
                            }}
                            style={{
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '16px',
                              fontWeight: 'bold',
                              lineHeight: 1,
                              padding: 0,
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#fecaca'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                            title="Remove attachment"
                          >
                            &times;
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    otModal.clientApprovalFile ? (
                      <div style={{cursor: 'pointer', textAlign: 'center'}} onClick={() => setImgPreview(otModal.clientApprovalFile)}>
                         <img src={otModal.clientApprovalFile} alt="Approval" style={{maxWidth:'100%', maxHeight:'80px', borderRadius:'4px', border:'1px solid #ddd'}} />
                         <div style={{fontSize:'11px', color:'#455fa0', marginTop:'4px'}}>Click to enlarge</div>
                      </div>
                    ) : (
                      <div style={{fontSize:'11px', color:'#94a3b8', fontStyle:'italic'}}>No attachment provided</div>
                    )
                  )}
                </div>
              )}

              {otModal.isReapply && otModal.rejectionReason && (
                <div style={{background:'#fff1f2', color:'#9f1239', padding:'8px', borderRadius:'6px', border:'1px solid #fecdd3', fontSize:'12px', marginBottom:'12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                  <strong>Rejection Reason:</strong> {otModal.rejectionReason}
                </div>
              )}

              <div className="modal-actions" style={{marginTop:'5px', display: 'flex', gap: '10px'}}>
                {(isAdmin || otModal.isReadOnly) && (
                  <button 
                    type="button"
                    className="btn-cancel" 
                    onClick={handleCloseOtModal}
                    style={{width: '100%', padding: '8px', fontSize: '14px'}}
                  >
                    Close
                  </button>
                )}
                {!isAdmin && !otModal.isReadOnly && (
                  <button
                    type="submit"
                    className="btn-submit-modal"
                    disabled={!otModal.reason || !otModal.reason.trim() || !otModal.clientApproved || (otModal.isReapply && !isOtFormDirty())}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '14px',
                      opacity: (!otModal.reason || !otModal.reason.trim() || !otModal.clientApproved || (otModal.isReapply && !isOtFormDirty())) ? 0.6 : 1,
                      cursor: (!otModal.reason || !otModal.reason.trim() || !otModal.clientApproved || (otModal.isReapply && !isOtFormDirty())) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {otModal.isReapply ? 'Resubmit OT Application' : 'Submit OT Application'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {imgPreview && (
        <div className="modal-overlay open" onClick={() => setImgPreview(null)} style={{zIndex: 9999}}>
          <div className="modal" style={{width: 'auto', maxWidth: '90vw', padding: '10px'}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Approval Attachment</h3>
              <button className="modal-close" onClick={() => setImgPreview(null)}>×</button>
            </div>
            <img src={imgPreview} alt="Enlarged Approval" style={{maxWidth:'100%', maxHeight:'80vh', display:'block', margin:'auto'}} />
          </div>
        </div>
      )}

      {rejectModal.isOpen && (
        <Modal 
          isOpen={rejectModal.isOpen} 
          title={rejectModal.isOT ? "Reject OT Request" : "Reject Timesheet Entry"} 
          onClose={() => setRejectModal({...rejectModal, isOpen: false})}
          onSubmit={e => { e.preventDefault(); handleRejectSubmit(); }}
          actions={
            <>
              <button className="btn-cancel" type="button" onClick={() => setRejectModal({...rejectModal, isOpen: false})}>Cancel</button>
              <button className="btn-submit-modal" type="submit" style={{background: '#e85d5d'}}>Submit Rejection</button>
            </>
          }
        >
          <div style={{padding: '0 10px'}}>
            <label style={{display:'block', marginBottom:'8px', fontWeight:'bold'}}>Reason for Rejection <span style={{color:'#e11d48'}}>*</span></label>
            <textarea 
              id="reject-reason"
              rows="4" 
              value={rejectModal.reason} 
              onChange={e => setRejectModal({...rejectModal, reason: e.target.value, hasError: false})}
              className={`form-input ${rejectModal.hasError ? 'invalid' : ''}`}
              style={{width:'100%', padding:'10px', borderRadius:'4px', border: rejectModal.hasError ? '1.5px solid #ef4444' : '1px solid #ccc'}}
              placeholder="Please provide a reason for rejection..."
            />
            {rejectModal.hasError && (
              <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                {rejectModal.errorMsg || 'Rejection reason is required.'}
              </span>
            )}
          </div>
        </Modal>
      )}

      {grantModal.isOpen && (
        <Modal 
          isOpen={grantModal.isOpen} 
          title="Resubmission Access" 
          onClose={() => setGrantModal({...grantModal, isOpen: false})}
          onSubmit={e => { e.preventDefault(); handleGrantResubmit(); }}
          actions={
            <>
              <button className="btn-cancel" type="button" onClick={() => setGrantModal({...grantModal, isOpen: false})}>Close</button>
              <button className="btn-submit-modal" type="submit" style={{background: '#0d9488'}}>Submit</button>
            </>
          }
        >
          <div style={{padding: '0 10px'}}>
            <label style={{display:'block', marginBottom:'8px', fontWeight:'bold'}}>Message <span style={{color:'#e11d48'}}>*</span></label>
            <textarea 
              id="grant-message"
              rows="3" 
              value={grantModal.message} 
              onChange={e => setGrantModal({...grantModal, message: e.target.value, hasError: false})}
              className={`form-input ${grantModal.hasError ? 'invalid' : ''}`}
              style={{width:'100%', padding:'10px', borderRadius:'4px', border: grantModal.hasError ? '1.5px solid #ef4444' : '1px solid #ccc', resize: 'vertical'}}
            />
            {grantModal.hasError && (
              <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                {grantModal.errorMsg || 'Message is required.'}
              </span>
            )}
          </div>
        </Modal>
      )}
      {reasonViewModal.isOpen && (() => {
        const entryForReason = reasonViewModal.dateStr ? (entries[reasonViewModal.dateStr] || editedRows[reasonViewModal.dateStr]) : null;
        const isLeaveRequest = entryForReason && (entryForReason.type === 'Paid Leave' || entryForReason.type === 'Unpaid Leave');
        const hasResubmitPermission = entryForReason && entryForReason.otResubmissionGranted && !entryForReason.otResubmissionUsed;
        const isLeaveResubmitFlow = isLeaveRequest && (entryForReason.status === 'Rejected' || (entryForReason.status === 'Approved' && hasResubmitPermission));
        const hasReappliedAlready = isLeaveRequest && entryForReason.leaveReapplyCount && entryForReason.leaveReapplyCount >= 1;
        
        const isHolidayRequest = entryForReason && entryForReason.type === 'Holiday';
        const hasNoTimings = entryForReason && !entryForReason.amIn && !entryForReason.amOut && !entryForReason.lunchOut && !entryForReason.lunchIn && !entryForReason.pmIn && !entryForReason.pmOut;
        const isHolidayResubmitFlow = isHolidayRequest && hasNoTimings && (entryForReason.status === 'Rejected' || (entryForReason.status === 'Approved' && hasResubmitPermission));

        let secondaryButton = null;
        if (isLeaveResubmitFlow && !isAdmin) {
          if (!hasReappliedAlready) {
            if (leaveResubmitStage === 'initial') {
              secondaryButton = (
                <button className="btn-submit-modal" onClick={() => setLeaveResubmitStage('guidelines')} style={{flex:1}}>
                  View More
                </button>
              );
            } else if (leaveResubmitStage === 'guidelines') {
              secondaryButton = (
                <button className="btn-submit-modal" onClick={() => handleLeaveResubmit(entryForReason)} style={{flex:1}}>
                  Resubmit
                </button>
              );
            }
          }
        } else {
          const hasOT = entryForReason && calculateHours(entryForReason).ot !== '--';
          const showReapply = !isAdmin && !reasonViewModal.title.includes('Resubmission Access') && (
            reasonViewModal.title.includes('OT') ||
            (reasonViewModal.title === 'Rejection Reason' && hasOT && entryForReason && entryForReason.otStatus !== 'Approved' && entryForReason.otStatus !== 'Filed' && entryForReason.otStatus !== 'Refilled')
          );
          if (showReapply) {
            secondaryButton = (
              <button className="btn-submit-modal" onClick={() => reapplyOT(entryForReason)} style={{flex:1}}>Reapply OT</button>
            );
          }
        }

        return (
          <Modal 
            isOpen={reasonViewModal.isOpen} 
            title={reasonViewModal.title} 
            onClose={() => setReasonViewModal({...reasonViewModal, isOpen: false})}
            actions={
              <div style={{display:'flex', gap:'10px', width:'100%'}}>
                <button className="btn-cancel" onClick={() => setReasonViewModal({isOpen: false, reason: '', title: '', dateStr: ''})} style={{flex:1}}>Close</button>
                {secondaryButton}
              </div>
            }
          >
            <div style={{padding: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.5', background: '#f9fafb', borderRadius: '4px', margin: '0 10px'}}>
               <div style={{
                 padding: '10px', 
                 background: '#fff', 
                 border: '1px solid #e5e7eb', 
                 borderRadius: '4px',
                 maxHeight: '300px',
                 overflowY: 'auto',
                 whiteSpace: 'pre-wrap',
                 wordBreak: 'break-word',
                 overflowWrap: 'break-word'
               }}>
                 {reasonViewModal.reason || "No reason provided."}
               </div>
               
               {isHolidayResubmitFlow && !isAdmin && (
                 <div style={{marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px', color: '#dc2626', fontWeight: '500', fontStyle: 'italic'}}>
                   Your holiday timesheet has been rejected. If you would like to resubmit, please change the Day Type and submit the timesheet again.
                 </div>
               )}

               {isLeaveResubmitFlow && !isAdmin && (
                 <div style={{marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px'}}>
                   {hasReappliedAlready ? (
                     <div style={{color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', padding: '10px'}}>
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
                         <circle cx="12" cy="12" r="10"></circle>
                         <line x1="15" y1="9" x2="9" y2="15"></line>
                         <line x1="9" y1="9" x2="15" y2="15"></line>
                       </svg>
                       This rejection is final. Resubmission is not permitted for this leave request.
                     </div>
                   ) : (
                     <>
                       {leaveResubmitStage === 'initial' ? (
                         <div style={{color: '#4b5563', fontWeight: '500', fontStyle: 'italic', display: 'block', marginTop: '6px'}}>
                           Click on 'View More' to view the resubmission guidelines.
                         </div>
                       ) : (
                         <div style={{background: '#fffbeb', border: '1.5px dashed #f59e0b', borderRadius: '6px', padding: '14px', marginTop: '10px'}}>
                           <div style={{color: '#b45309', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                             Resubmission Guidelines:
                           </div>
                           <ul style={{margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#78350f'}}>
                             <li>Your previous leave request was {entryForReason && entryForReason.status === 'Approved' ? 'approved' : 'rejected'}.</li>
                             <li>Obtain your Manager's approval at least one week before the leave date.</li>
                             <li>Review the rejection comments and make the necessary corrections.</li>
                             <li>Resubmit the leave request only after completing the above steps.</li>
                           </ul>
                         </div>
                       )}
                     </>
                   )}
                 </div>
               )}
            </div>
          </Modal>
        );
      })()}

      {isShortHoursModalOpen && shortHoursModalData && (
        <div className="modal-overlay open" style={{ zIndex: 1001, background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal" style={{ width: '420px', maxWidth: '90vw', padding: '24px' }}>
            <div className="modal-header">
              <h3>Working Hours &lt; 8 Hours</h3>
              <button className="modal-close" onClick={() => { setIsShortHoursModalOpen(false); setShortHoursModalData(null); }}>×</button>
            </div>
            <div className="modal-sub" style={{ margin: '14px 0 16px 0', color: '#475569', fontSize: '13px', lineHeight: '1.5' }}>
              Working hours on <strong>{shortHoursModalData.date}</strong> are less than 8 hours (Total: <strong>{shortHoursModalData.hours}</strong>). Please fill the reason.
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                REASON FOR SHORT WORKING HOURS <span style={{ color: '#e11d48' }}>*</span>
              </label>
              <textarea
                className="form-input"
                style={{ resize: 'vertical', minHeight: '90px', marginBottom: '0px', width: '100%' }}
                placeholder="Explain why working hours are less than 8 hours..."
                value={shortHoursReasonText}
                disabled={shortHoursModalData.isReadOnly}
                onChange={(e) => {
                  setShortHoursReasonText(e.target.value);
                  if (e.target.value.trim()) setShortHoursError('');
                }}
              />
              {shortHoursError && (
                <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                  {shortHoursError}
                </span>
              )}
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-cancel" 
                style={{ flex: 1 }} 
                onClick={() => { setIsShortHoursModalOpen(false); setShortHoursModalData(null); }}
              >
                {shortHoursModalData.isReadOnly ? 'Close' : 'Cancel'}
              </button>
                            {!shortHoursModalData.isReadOnly && (() => {
                const originalReason = (entries[shortHoursModalData.date]?.shortHoursReason || '').trim();
                const currentReason = (shortHoursReasonText || '').trim();
                const isModified = currentReason !== originalReason;
                return (
                  <button 
                    className="btn-submit-modal" 
                    style={{ flex: 1, backgroundColor: 'var(--teal)', opacity: isModified ? 1 : 0.6, cursor: isModified ? 'pointer' : 'not-allowed' }} 
                    onClick={handleShortHoursSubmit}
                    disabled={!isModified || processingMessage !== null}
                  >
                    Submit
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isAdminShortHoursModalOpen && adminShortHoursModalData && (
        <div className="modal-overlay open" style={{ zIndex: 1001, background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal" style={{ width: '420px', maxWidth: '90vw', padding: '24px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px' }}>
              <h3>Short Hours Reason Review</h3>
              <button className="modal-close" onClick={() => { setIsAdminShortHoursModalOpen(false); setAdminShortHoursModalData(null); setIsAdminRejectMode(false); }}>×</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Employee</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a2744' }}>{adminShortHoursModalData.name} ({adminShortHoursModalData.empId})</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744' }}>{adminShortHoursModalData.date}</div>
                </div>
                <div style={{ flex: 1, background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Hours Worked</div>
                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1a2744' }}>{adminShortHoursModalData.hours}</div>
                </div>
              </div>
              <div style={{ background: '#f0fdfa', padding: '14px', borderRadius: '8px', border: '1px solid #ccfbf1' }}>
                <div style={{ fontSize: '10px', color: '#0d9488', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Employee's Submitted Reason</div>
                <div style={{ fontSize: '13px', color: '#115e59', lineHeight: '1.4', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>"{adminShortHoursModalData.reason}"</div>
              </div>
            </div>

            {isAdminRejectMode && (
              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                  REJECTION REASON <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <textarea
                  className="form-input"
                  style={{ resize: 'vertical', minHeight: '80px', width: '100%' }}
                  placeholder="Explain why this short hours reason is being rejected..."
                  value={adminRejectionText}
                  onChange={(e) => {
                    setAdminRejectionText(e.target.value);
                    if (e.target.value.trim()) setAdminShortHoursError('');
                  }}
                />
                {adminShortHoursError && (
                  <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '6px', display: 'block', fontWeight: '500' }}>
                    {adminShortHoursError}
                  </span>
                )}
              </div>
            )}

            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              {adminShortHoursModalData.isReadOnly ? (
                <button 
                  className="btn-cancel" 
                  style={{ flex: 1 }} 
                  onClick={() => { setIsAdminShortHoursModalOpen(false); setAdminShortHoursModalData(null); }}
                >
                  Close
                </button>
              ) : !isAdminRejectMode ? (
                <>
                  <button 
                    className="btn-cancel" 
                    style={{ flex: 1 }} 
                    onClick={() => { setIsAdminShortHoursModalOpen(false); setAdminShortHoursModalData(null); }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn-submit-modal" 
                    style={{ flex: 1, backgroundColor: '#e85d5d' }} 
                    onClick={() => setIsAdminRejectMode(true)}
                  >
                    Reject
                  </button>
                  <button 
                    className="btn-submit-modal" 
                    style={{ flex: 1, backgroundColor: '#2d8f7b' }} 
                    onClick={() => {
                      approveTimesheet(adminShortHoursModalData.id, adminShortHoursModalData.date);
                      setIsAdminShortHoursModalOpen(false);
                      setAdminShortHoursModalData(null);
                    }}
                  >
                    Approve
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className="btn-cancel" 
                    style={{ flex: 1 }} 
                    onClick={() => { setIsAdminRejectMode(false); setAdminRejectionText(''); setAdminShortHoursError(''); }}
                  >
                    Back
                  </button>
                  <button 
                    className="btn-submit-modal" 
                    style={{ flex: 1, backgroundColor: '#e85d5d' }} 
                    onClick={handleAdminShortHoursRejectSubmit}
                  >
                    Confirm Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Export Date-Range Modal (Admin-only) ───────────────────────── */}
      {isAdmin && exportModal.isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(10, 20, 50, 0.55)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.18s ease'
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.12)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1a2744 0%, #2d8f7b 100%)',
              padding: '20px 24px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.15)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>Export Timesheet</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '1px' }}>{employee.name} &bull; {employee.empId}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportModal({ isOpen: false, fromDate: '', toDate: '', isLoading: false, error: '', fromDateError: false, toDateError: false })}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', width: '30px', height: '30px', cursor: 'pointer', color: '#fff', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleExportSubmit(); }} style={{ display: 'contents' }}>
              {/* Modal Body */}
              <div style={{ padding: '24px 24px 20px' }}>
                <p style={{ margin: '0 0 20px', fontSize: '13.5px', color: '#64748b', lineHeight: '1.5' }}>
                  Select a date range to export. The Excel file will contain all timesheet entries within the selected range.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* From Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>From Date <span style={{color:'#e11d48'}}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="date"
                        id="export-from-date"
                        className={`form-input ${exportModal.fromDateError ? 'invalid' : ''}`}
                        value={exportModal.fromDate}
                        onChange={e => setExportModal(m => ({ ...m, fromDate: e.target.value, error: '', fromDateError: false }))}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: '8px',
                          border: exportModal.fromDateError ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0',
                          fontSize: '13.5px', color: '#1a2744', background: '#f8fafc',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={e => e.target.style.borderColor = '#2d8f7b'}
                        onBlur={e => e.target.style.borderColor = exportModal.fromDateError ? '#ef4444' : '#e2e8f0'}
                      />
                    </div>
                  </div>

                  {/* To Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To Date <span style={{color:'#e11d48'}}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="date"
                        id="export-to-date"
                        className={`form-input ${exportModal.toDateError ? 'invalid' : ''}`}
                        value={exportModal.toDate}
                        min={exportModal.fromDate}
                        onChange={e => setExportModal(m => ({ ...m, toDate: e.target.value, error: '', toDateError: false }))}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: '8px',
                          border: exportModal.toDateError ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0',
                          fontSize: '13.5px', color: '#1a2744', background: '#f8fafc',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={e => e.target.style.borderColor = '#2d8f7b'}
                        onBlur={e => e.target.style.borderColor = exportModal.toDateError ? '#ef4444' : '#e2e8f0'}
                      />
                    </div>
                  </div>
                </div>

                {/* Preview pill */}
                {exportModal.fromDate && exportModal.toDate && exportModal.fromDate <= exportModal.toDate && (() => {
                  const from = new Date(exportModal.fromDate);
                  const to = new Date(exportModal.toDate);
                  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
                  return (
                    <div style={{
                      background: 'linear-gradient(135deg, #e8f5f2 0%, #dbeafe 100%)',
                      border: '1px solid #a7f3d0', borderRadius: '8px',
                      padding: '10px 14px', marginBottom: '16px',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d8f7b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      <span style={{ fontSize: '12.5px', color: '#065f46', fontWeight: '600' }}>
                        {diffDays} day{diffDays !== 1 ? 's' : ''} selected
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#047857', marginLeft: 'auto', fontFamily: 'monospace' }}>
                        {getExportFilename(employee.name, employee.empId, exportModal.fromDate, exportModal.toDate)}
                      </span>
                    </div>
                  );
                })()}

                {/* Error message */}
                {exportModal.error && (
                  <div style={{
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                    padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span style={{ fontSize: '12.5px', color: '#dc2626', fontWeight: '500' }}>{exportModal.error}</span>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px 20px', display: 'flex', gap: '12px',
                borderTop: '1px solid #f1f5f9', background: '#fafafa'
              }}>
                <button
                  type="button"
                  onClick={() => setExportModal({ isOpen: false, fromDate: '', toDate: '', isLoading: false, error: '', fromDateError: false, toDateError: false })}
                  disabled={exportModal.isLoading}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    border: '1.5px solid #e2e8f0', background: '#fff',
                    color: '#475569', fontSize: '13.5px', fontWeight: '600',
                    cursor: exportModal.isLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={exportModal.isLoading}
                  style={{
                    flex: 2, padding: '10px', borderRadius: '8px', border: 'none',
                    background: exportModal.isLoading
                      ? 'linear-gradient(135deg, #94a3b8 0%, #94a3b8 100%)'
                      : 'linear-gradient(135deg, #1a2744 0%, #2d8f7b 100%)',
                    color: '#fff', fontSize: '13.5px', fontWeight: '700',
                    cursor: exportModal.isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: exportModal.isLoading ? 'none' : '0 2px 8px rgba(45,143,123,0.35)',
                    transition: 'all 0.2s'
                  }}
                >
                  {exportModal.isLoading ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Download Excel
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProfileOpen && (
        <div 
          className="modal-overlay open" 
          style={{ zIndex: 1002 }}
          onClick={() => {
            if (!isSavingProfile) handleCloseProfileModal();
          }}
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
              textAlign: isEditingProfile ? 'left' : 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '20px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '18px', fontWeight: '700' }}>
                {isEditingProfile ? 'Edit Employee Profile' : 'Employee Profile'}
              </h3>
              <button 
                className="modal-close" 
                onClick={handleCloseProfileModal}
                style={{ fontSize: '20px', cursor: isSavingProfile ? 'not-allowed' : 'pointer' }}
                disabled={isSavingProfile}
              >
                ×
              </button>
            </div>

            {profileMessage.text && (
              <div style={{ 
                padding: '10px', 
                marginBottom: '15px', 
                borderRadius: '4px', 
                backgroundColor: profileMessage.type === 'success' ? '#e8f5e9' : '#ffebee', 
                color: profileMessage.type === 'success' ? '#2e7d32' : '#c62828', 
                fontSize: '13px', 
                border: `1px solid ${profileMessage.type === 'success' ? '#a5d6a7' : '#ef9a9a'}`,
                textAlign: 'left',
                flexShrink: 0
              }}>
                {profileMessage.text}
              </div>
            )}

            {!isEditingProfile ? (
              <>
                {/* Profile Avatar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: employee.color || '#2d8f7b',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    marginBottom: '10px'
                  }}>
                    {employee.initials || employee.name?.charAt(0) || 'U'}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--navy)' }}>{employee.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{employee.role === 'admin' ? 'Administrator' : (employee.dept || 'Employee')}</div>
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
                  marginBottom: '24px',
                  overflowY: 'auto'
                }}>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee ID</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.empId || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.dept || 'N/A'}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px', wordBreak: 'break-all' }}>{employee.email || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Manager</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.manager || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date of Joining</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.dateOfJoining || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Project Name</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.projectName || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Company Name</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{employee.companyName || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Country</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{getDisplayCountry(employee.country)}</div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Number</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>{getDisplayContactNumber(employee.contactNumber, employee.country)}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Created</span>
                    <div style={{ color: '#334155', fontWeight: '500', marginTop: '2px' }}>
                      {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {isAdmin && (
                  <div style={{ flexShrink: 0 }}>
                    <button
                      className="btn btn-teal btn-md"
                      onClick={() => setIsEditingProfile(true)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13.5px' }}
                    >
                      Edit Profile
                    </button>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={e => { e.preventDefault(); handleSaveProfile(); }} style={{ display: 'contents' }}>
                <div className="modal-sub" style={{ flexShrink: 0, marginBottom: '20px' }}>Fill in the employee details below.</div>
                {/* Edit Form Fields */}
                <div className="add-emp-form" style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
                  <div className="modal-row">
                    <div className="form-group">
                      <label className="form-label">FULL NAME <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        id="profile-name"
                        name="profile-name"
                        maxLength={32}
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.name ? 'invalid' : ''}`} 
                        value={profileData.name} 
                        onChange={e => {
                          const val = e.target.value;
                          setProfileData({ ...profileData, name: val });
                          if (val && !val.match(/^[A-Za-z ]*$/)) {
                            setProfileErrors(prev => ({ ...prev, name: 'Only alphabets and spaces are allowed.' }));
                          } else {
                            setProfileErrors(prev => ({ ...prev, name: '' }));
                          }
                        }}
                        placeholder="e.g. Arjun Sharma"
                      />
                      {profileErrors.name && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.name}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">EMPLOYEE ID <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        className="form-input" 
                        value={employee.empId} 
                        disabled 
                        style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                      />
                    </div>
                  </div>

                  <div className="modal-row">
                    <div className="form-group">
                      <label className="form-label">DEPARTMENT <span style={{color:'#e11d48'}}>*</span></label>
                      <select 
                        id="profile-dept"
                        name="profile-dept"
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.dept ? 'invalid' : ''}`} 
                        value={profileData.dept} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('dept')) return;
                          setProfileData({ ...profileData, dept: e.target.value });
                          setProfileErrors({ ...profileErrors, dept: '' });
                        }}
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('dept')) {
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
                      {profileErrors.dept && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.dept}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">MANAGER <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        id="profile-manager"
                        name="profile-manager"
                        maxLength={32}
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.manager ? 'invalid' : ''}`} 
                        value={profileData.manager} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('manager')) return;
                          const val = e.target.value;
                          setProfileData({ ...profileData, manager: val });
                          if (val && !val.match(/^[A-Za-z ]*$/)) {
                            setProfileErrors(prev => ({ ...prev, manager: 'Only alphabets and spaces are allowed.' }));
                          } else {
                            setProfileErrors(prev => ({ ...prev, manager: '' }));
                          }
                        }}
                        placeholder="e.g. Ravi Kumar"
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('manager')) {
                            e.target.blur();
                          }
                        }}
                      />
                      {profileErrors.manager && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.manager}</span>}
                    </div>
                  </div>

                  <div className="modal-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">
                        EMAIL <span style={{color:'#e11d48'}}>*</span>
                        {isCheckingEmail && <span style={{ fontSize: '9px', color: '#666', fontStyle: 'italic', marginLeft: '6px' }}>Checking...</span>}
                      </label>
                      <input 
                        id="profile-email"
                        name="profile-email"
                        disabled={isSavingProfile}
                        className={`form-input ${(profileErrors.email || emailDuplicateError) ? 'invalid' : ''}`} 
                        value={profileData.email} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('email')) return;
                          const val = e.target.value;
                          setProfileData({ ...profileData, email: val });
                          const err = validateEmailRealtime(val);
                          setProfileErrors(prev => ({ ...prev, email: err }));
                          setEmailDuplicateError('');
                        }}
                        onBlur={e => checkProfileEmailUniqueness(e.target.value)}
                        placeholder="e.g. name@company.com"
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('email')) {
                            e.target.blur();
                          }
                        }}
                      />
                      {(profileErrors.email || emailDuplicateError) && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.email || emailDuplicateError}</span>}
                    </div>
                  </div>

                  <div className="modal-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">PROJECT NAME <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        id="profile-projectName"
                        name="profile-projectName"
                        maxLength={32}
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.projectName ? 'invalid' : ''}`} 
                        value={profileData.projectName} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('projectName')) return;
                          setProfileData({ ...profileData, projectName: e.target.value });
                          setProfileErrors({ ...profileErrors, projectName: '' });
                        }}
                        placeholder="Enter Project Name"
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('projectName')) {
                            e.target.blur();
                          }
                        }}
                      />
                      {profileErrors.projectName && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.projectName}</span>}
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">COMPANY NAME <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        id="profile-companyName"
                        name="profile-companyName"
                        maxLength={32}
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.companyName ? 'invalid' : ''}`} 
                        value={profileData.companyName} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('companyName')) return;
                          setProfileData({ ...profileData, companyName: e.target.value });
                          setProfileErrors({ ...profileErrors, companyName: '' });
                        }}
                        placeholder="Enter Company Name"
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('companyName')) {
                            e.target.blur();
                          }
                        }}
                      />
                      {profileErrors.companyName && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.companyName}</span>}
                    </div>
                  </div>

                  <div className="modal-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">DATE OF JOINING <span style={{color:'#e11d48'}}>*</span></label>
                      <input 
                        id="profile-dateOfJoining"
                        name="profile-dateOfJoining"
                        type="date"
                        disabled={isSavingProfile}
                        className={`form-input ${profileErrors.dateOfJoining ? 'invalid' : ''}`} 
                        value={profileData.dateOfJoining} 
                        onChange={e => {
                          if (!checkPrecedingProfileFields('dateOfJoining')) return;
                          setProfileData({ ...profileData, dateOfJoining: e.target.value });
                          setProfileErrors({ ...profileErrors, dateOfJoining: '' });
                        }}
                        onFocus={e => {
                          if (!checkPrecedingProfileFields('dateOfJoining')) {
                            e.target.blur();
                          }
                        }}
                      />
                      {profileErrors.dateOfJoining && <span style={{ color: '#d32f2f', fontSize: '11px' }}>{profileErrors.dateOfJoining}</span>}
                    </div>

                    <div className="form-group" style={{ flex: 1.2 }}>
                      <label className="form-label">CONTACT NUMBER <span style={{color:'#e11d48'}}>*</span></label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select 
                          id="profile-country"
                          name="profile-country"
                          disabled={isSavingProfile}
                          className={`form-input ${profileErrors.country ? 'invalid' : ''}`} 
                          style={{ width: '80px', flexShrink: 0, paddingLeft: '8px', paddingRight: '4px' }}
                          value={profileData.country} 
                          onChange={e => {
                            if (!checkPrecedingProfileFields('country')) return;
                            setProfileData({ ...profileData, country: e.target.value, contactNumber: '' });
                            setProfileErrors({ ...profileErrors, country: '', contactNumber: '' });
                          }}
                          onFocus={e => {
                            if (!checkPrecedingProfileFields('country')) {
                              e.target.blur();
                            }
                          }}
                        >
                          <option value="">Code</option>
                          <option value="IN (+91)">IN (+91)</option>
                          <option value="JP (+81)">JP (+81)</option>
                        </select>
                        <input 
                          id="profile-contactNumber"
                          name="profile-contactNumber"
                          maxLength={profileData.country === 'Japan (+81)' || profileData.country === 'JP (+81)' ? 11 : 10}
                          disabled={isSavingProfile}
                          className={`form-input ${profileErrors.contactNumber ? 'invalid' : ''}`} 
                          style={{ flex: 1 }}
                          placeholder="Enter Number" 
                          value={profileData.contactNumber} 
                          onChange={e => {
                            if (!checkPrecedingProfileFields('contactNumber')) return;
                            const val = e.target.value.replace(/[^0-9]/g, ''); // numeric only
                            setProfileData({ ...profileData, contactNumber: val });
                            setContactDuplicateErrorProfile('');
                            if (!val) {
                              setProfileErrors(prev => ({ ...prev, contactNumber: 'Please enter a contact number.' }));
                            } else if ((profileData.country === 'India (+91)' || profileData.country === 'IN (+91)') && val.length !== 10) {
                              setProfileErrors(prev => ({ ...prev, contactNumber: 'Please enter a valid 10-digit mobile number.' }));
                            } else if ((profileData.country === 'Japan (+81)' || profileData.country === 'JP (+81)') && val.length !== 11) {
                              setProfileErrors(prev => ({ ...prev, contactNumber: 'Please enter a valid 11-digit mobile number.' }));
                            } else {
                              setProfileErrors(prev => ({ ...prev, contactNumber: '' }));
                            }
                          }}
                          onFocus={e => {
                            if (!checkPrecedingProfileFields('contactNumber')) {
                              e.target.blur();
                            }
                          }}
                          onBlur={async e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            // Only check uniqueness if format is valid
                            const validLen = (profileData.country === 'India (+91)' || profileData.country === 'IN (+91)') ? 10
                              : (profileData.country === 'Japan (+81)' || profileData.country === 'JP (+81)') ? 11 : null;
                            if (val && (validLen === null || val.length === validLen)) {
                              await checkContactProfileUniqueness(val, employee?.id);
                            }
                          }}
                        />
                      </div>
                      {profileErrors.country && <span style={{ color: '#d32f2f', fontSize: '11px', display: 'block' }}>{profileErrors.country}</span>}
                      {profileErrors.contactNumber && <span style={{ color: '#d32f2f', fontSize: '11px', display: 'block' }}>{profileErrors.contactNumber}</span>}
                    </div>
                  </div>

                  <div className="modal-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">DATE CREATED</label>
                      <input 
                        className="form-input" 
                        value={employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : 'N/A'} 
                        disabled 
                        style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                      />
                    </div>
                  </div>

                  <div className="modal-actions" style={{ marginTop: '20px' }}>
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={async () => {
                        if (isProfileDirty()) {
                          const confirmLeave = await showConfirm(
                            'Your changes have not been saved. Do you still want to cancel?',
                            { title: 'Unsaved Changes', type: 'leave', confirmLabel: 'Discard', cancelLabel: 'Keep Editing' }
                          );
                          if (!confirmLeave) return;
                        }
                        setIsEditingProfile(false);
                        setProfileErrors({});
                        setEmailDuplicateError('');
                        setContactDuplicateErrorProfile('');
                        setProfileMessage({ type: '', text: '' });
                      }}
                      disabled={isSavingProfile}
                      style={{ flex: 1, cursor: isSavingProfile ? 'not-allowed' : 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-submit-modal"
                      disabled={isSavingProfile || isCheckingEmail || isCheckingContactProfile}
                      style={{ flex: 1, opacity: (isSavingProfile || isCheckingEmail) ? 0.7 : 1, cursor: (isSavingProfile || isCheckingEmail) ? 'not-allowed' : 'pointer' }}
                    >
                      {isSavingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {toast.text && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          padding: '12px 24px',
          borderRadius: '8px',
          backgroundColor: toast.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: toast.type === 'success' ? '#2e7d32' : '#c62828',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          border: `1px solid ${toast.type === 'success' ? '#a5d6a7' : '#ef9a9a'}`,
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span>{toast.text}</span>
          <button 
            onClick={() => setToast({ type: '', text: '' })} 
            style={{
              background: 'none',
              border: 'none',
              color: toast.type === 'success' ? '#2e7d32' : '#c62828',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0
            }}
          >
            ×
          </button>
        </div>
      )}

      {processingMessage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px 40px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #1a2744',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{
              color: '#334155',
              fontWeight: '600',
              fontSize: '15px'
            }}>
              {processingMessage}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}

const Modal = ({ isOpen, title, onClose, children, actions, onSubmit }) => {
  if (!isOpen) return null;
  const content = (
    <div className="modal" style={{ width: '400px' }}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="modal-close" type="button" onClick={onClose}>×</button>
      </div>
      <div className="modal-body" style={{ padding: '20px 0' }}>
        {children}
      </div>
      <div className="modal-actions">
        {actions}
      </div>
    </div>
  );

  return (
    <div className="modal-overlay open">
      {onSubmit ? (
        <form onSubmit={onSubmit} style={{ display: 'contents' }}>
          {content}
        </form>
      ) : (
        content
      )}
    </div>
  );
};
