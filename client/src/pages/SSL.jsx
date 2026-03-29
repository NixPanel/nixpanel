import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle, RefreshCw, ChevronDown, ChevronRight, Globe } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const statusConfig = {
  valid: { label: 'Valid', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  warning: { label: 'Expiring Soon', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  expired: { label: 'Expired', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
};

function CertCard({ cert, expanded, onToggle }) {
  const status = statusConfig[cert.status] || statusConfig.valid;
  const StatusIcon = status.icon;

  return (
    <div className={`border rounded-xl overflow-hidden ${status.border} bg-dark-800`}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-dark-700/50 transition-colors"
      >
        <StatusIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${status.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">{cert.cn || cert.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color} border ${status.border}`}>
              {status.label}
            </span>
            {cert.daysLeft !== undefined && cert.daysLeft >= 0 && (
              <span className="text-xs text-gray-500">{cert.daysLeft}d left</span>
            )}
            {cert.daysLeft !== undefined && cert.daysLeft < 0 && (
              <span className="text-xs text-red-400">Expired {Math.abs(cert.daysLeft)}d ago</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            {cert.issuer && (
              <span className="text-xs text-gray-500 truncate max-w-xs">
                Issued by: {cert.issuer.replace(/.*CN\s*=\s*/, '').split(',')[0]}
              </span>
            )}
            {cert.notAfter && (
              <span className="text-xs text-gray-500">
                Expires: {new Date(cert.notAfter).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 font-mono truncate">{cert.path}</p>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-dark-600 px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {cert.subject && (
              <div>
                <span className="text-gray-500">Subject:</span>
                <p className="text-gray-300 font-mono mt-0.5 break-all">{cert.subject}</p>
              </div>
            )}
            {cert.issuer && (
              <div>
                <span className="text-gray-500">Issuer:</span>
                <p className="text-gray-300 font-mono mt-0.5 break-all">{cert.issuer}</p>
              </div>
            )}
            {cert.notBefore && (
              <div>
                <span className="text-gray-500">Valid From:</span>
                <p className="text-gray-300 mt-0.5">{new Date(cert.notBefore).toLocaleString()}</p>
              </div>
            )}
            {cert.notAfter && (
              <div>
                <span className="text-gray-500">Valid Until:</span>
                <p className={`mt-0.5 ${cert.status === 'expired' ? 'text-red-400' : cert.status === 'warning' ? 'text-yellow-400' : 'text-gray-300'}`}>
                  {new Date(cert.notAfter).toLocaleString()}
                </p>
              </div>
            )}
            {cert.fingerprint && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">Fingerprint:</span>
                <p className="text-gray-300 font-mono mt-0.5 break-all">{cert.fingerprint}</p>
              </div>
            )}
          </div>
          {cert.sans && cert.sans.length > 0 && (
            <div>
              <span className="text-xs text-gray-500">Subject Alternative Names:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {cert.sans.filter(s => s.trim()).map((san, i) => (
                  <span key={i} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                    {san}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SSL() {
  const { user } = useAuth();
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [output, setOutput] = useState('');
  const [outputType, setOutputType] = useState('info');

  // Certbot form
  const [certbotDomain, setCertbotDomain] = useState('');
  const [certbotEmail, setCertbotEmail] = useState('');
  const [certbotRunning, setCertbotRunning] = useState(false);
  const [renewRunning, setRenewRunning] = useState(false);

  const fetchCerts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/ssl/certs');
      setCerts(res.data.certs || []);
    } catch (err) {
      console.error('Failed to fetch certs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCerts(); }, []);

  const handleCertbot = async (e) => {
    e.preventDefault();
    setCertbotRunning(true);
    setOutput('');
    try {
      const res = await axios.post('/api/ssl/certbot', { domain: certbotDomain, email: certbotEmail });
      setOutput(res.data.output || 'Certbot completed.');
      setOutputType('success');
      fetchCerts();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Certbot failed'}\n${err.response?.data?.output || ''}`);
      setOutputType('error');
    } finally {
      setCertbotRunning(false);
    }
  };

  const handleRenew = async () => {
    setRenewRunning(true);
    setOutput('');
    try {
      const res = await axios.post('/api/ssl/renew');
      setOutput(res.data.output || 'Renewal completed.');
      setOutputType('success');
      fetchCerts();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Renewal failed'}`);
      setOutputType('error');
    } finally {
      setRenewRunning(false);
    }
  };

  const validCount = certs.filter(c => c.status === 'valid').length;
  const warningCount = certs.filter(c => c.status === 'warning').length;
  const expiredCount = certs.filter(c => c.status === 'expired').length;

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="SSL Certificates"
            subtitle={`${certs.length} certificates found`}
            onRefresh={fetchCerts}
            loading={loading}
          />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="card bg-green-500/5 border-green-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Valid</span>
              </div>
              <p className="text-2xl font-bold text-green-400 mt-1">{validCount}</p>
            </div>
            <div className="card bg-yellow-500/5 border-yellow-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">Expiring</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{warningCount}</p>
            </div>
            <div className="card bg-red-500/5 border-red-500/20">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">Expired</span>
              </div>
              <p className="text-2xl font-bold text-red-400 mt-1">{expiredCount}</p>
            </div>
          </div>

          {output && (
            <pre className={`terminal mb-4 text-xs max-h-48 overflow-auto ${outputType === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {output}
            </pre>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading certificates...</div>
              ) : certs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No certificates found</p>
                  <p className="text-xs mt-1">Checked: /etc/ssl/certs, /etc/letsencrypt/live, /etc/nginx/ssl, /etc/apache2/ssl</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Sort: expired first, then warning, then valid */}
                  {[...certs]
                    .sort((a, b) => {
                      const order = { expired: 0, warning: 1, valid: 2 };
                      return (order[a.status] || 2) - (order[b.status] || 2);
                    })
                    .map((cert, i) => (
                      <CertCard
                        key={`${cert.path}-${i}`}
                        cert={cert}
                        expanded={expanded === `${cert.path}-${i}`}
                        onToggle={() => setExpanded(expanded === `${cert.path}-${i}` ? null : `${cert.path}-${i}`)}
                      />
                    ))
                  }
                </div>
              )}
            </div>

            {/* Right: Let's Encrypt panel */}
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-400" />
                  Let's Encrypt
                </h3>
                <form onSubmit={handleCertbot} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Domain</label>
                    <input
                      type="text"
                      value={certbotDomain}
                      onChange={e => setCertbotDomain(e.target.value)}
                      placeholder="example.com"
                      className="input-field text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={certbotEmail}
                      onChange={e => setCertbotEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="input-field text-sm"
                      required
                    />
                  </div>
                  <button type="submit" disabled={certbotRunning} className="btn-primary w-full text-sm">
                    {certbotRunning ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                    {certbotRunning ? 'Running...' : 'Issue Certificate'}
                  </button>
                </form>
              </div>

              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Auto-Renew</h3>
                <p className="text-xs text-gray-500 mb-3">Run certbot renew to renew all expiring certificates.</p>
                <button
                  onClick={handleRenew}
                  disabled={renewRunning}
                  className="btn-primary w-full text-sm bg-green-700 hover:bg-green-600"
                >
                  {renewRunning ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                  {renewRunning ? 'Renewing...' : 'Renew All Certificates'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
