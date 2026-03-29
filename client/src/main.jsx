import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0a0e1a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', padding: '2rem' }}>
          <div style={{ background: '#0f1626', border: '1px solid #ef4444', borderRadius: '12px', padding: '2rem', maxWidth: '800px', width: '100%' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>NixPanel — Startup Error</h2>
            <pre style={{ color: '#fca5a5', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.stack || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: '1rem', background: '#2563eb', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
