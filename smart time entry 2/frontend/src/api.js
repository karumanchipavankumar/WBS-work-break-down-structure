import axios from 'axios';

const hostname = window.location.hostname;
const defaultBaseUrl = hostname === 'localhost' || hostname === '127.0.0.1'
  ? 'http://localhost:8080/api'
  : '/api';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const isLoginRequest = error.config && error.config.url && error.config.url.includes('/auth/login');
      if (!isLoginRequest) {
        // Check if this is a stale-session invalidation from a password change
        const responseData = error.response.data;
        const isSessionInvalidated =
          (typeof responseData === 'object' && responseData?.error === 'SESSION_INVALIDATED') ||
          (typeof responseData === 'string' && responseData.includes('SESSION_INVALIDATED'));

        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        localStorage.removeItem('empId');
        localStorage.removeItem('selectedEmployee');
        localStorage.removeItem('admin_selected_employee');

        if (isSessionInvalidated) {
          // Store a message so the login page can display it prominently
          sessionStorage.setItem(
            'auth_message',
            'Your password has been changed. Please log in again using your new credentials.'
          );
          window.location.href = '/';
        } else {
          // Dispatch a custom session-expired event so React can show the warning popup
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
