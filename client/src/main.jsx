import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Global fetch interceptor: Tự động đính kèm Teacher Bearer token cho các request /api/
const originalFetch = window.fetch;
window.fetch = async (resource, config = {}) => {
  try {
    const teacherToken = sessionStorage.getItem('lan_exam_teacher_token');
    const url = typeof resource === 'string' ? resource : resource?.url;
    if (teacherToken && url && (url.startsWith('/api') || url.includes('/api/'))) {
      if (resource instanceof Request) {
        resource.headers.set('Authorization', `Bearer ${teacherToken}`);
      } else {
        const headers = new Headers(config.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${teacherToken}`);
        }
        config.headers = headers;
      }
    }
  } catch (err) {
    console.warn('[Fetch Interceptor] Error injecting token:', err);
  }
  return originalFetch(resource, config);
};

window.addEventListener('error', (event) => {
  console.error('Lỗi Global Window Error:', event.error || event.message);
  const root = document.getElementById('root');
  if (root && (!root.children || root.children.length === 0)) {
    root.innerHTML = `
      <div style="background:#090d16; color:#f87171; min-height:100vh; padding:32px; font-family:system-ui, -apple-system, sans-serif; box-sizing:border-box;">
        <div style="max-width:700px; margin:40px auto; background:#0f172a; border:1px solid #dc2626; border-radius:16px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.6);">
          <h2 style="color:#ef4444; margin-top:0; display:flex; align-items:center; gap:8px;">⚠️ Lỗi Khởi Động Ứng Dụng (Runtime Error)</h2>
          <p style="color:#f1f5f9; font-size:14px;"><strong>Thông báo lỗi:</strong> ${event.message || event.error?.message || 'Lỗi không xác định'}</p>
          <pre style="background:#1e293b; color:#cbd5e1; padding:16px; border-radius:8px; overflow:auto; max-height:300px; font-size:12px; font-family:monospace;">${event.error?.stack || (event.filename + ':' + event.lineno)}</pre>
          <div style="margin-top:20px; display:flex; gap:10px;">
            <button onclick="sessionStorage.clear(); localStorage.clear(); location.reload();" style="padding:10px 18px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:13px;">
              🔄 Xóa Dữ Liệu Cache & Tải Lại
            </button>
            <button onclick="location.href='/'" style="padding:10px 18px; background:#334155; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:13px;">
              🏠 Về Trang Chủ
            </button>
          </div>
        </div>
      </div>
    `;
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary bắt được lỗi React:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#090d16', color: '#f87171', minHeight: '100vh', padding: '32px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '750px', margin: '40px auto', background: '#0f172a', border: '1px solid #ef4444', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <h2 style={{ color: '#ef4444', marginTop: 0 }}>⚠️ Đã Xảy Ra Lỗi Hiển Thị Giao Diện</h2>
            <p style={{ color: '#f1f5f9', fontSize: '14px' }}>
              <strong>Chi tiết lỗi:</strong> {this.state.error?.message || 'Lỗi không xác định'}
            </p>
            <pre style={{ background: '#1e293b', color: '#cbd5e1', padding: '16px', borderRadius: '8px', overflow: 'auto', maxHeight: '350px', fontSize: '12px', fontFamily: 'monospace' }}>
              {this.state.error?.stack || String(this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  sessionStorage.clear();
                  localStorage.clear();
                  window.location.reload();
                }}
                style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                🔄 Xóa Phiên Đăng Nhập & Tải Lại Trang
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{ padding: '10px 20px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                🏠 Về Trang Chủ
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
