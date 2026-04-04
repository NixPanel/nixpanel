import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Key, Eye, EyeOff, CheckCircle, XCircle, AlertCircle, Loader2, Trash2, ExternalLink, Lock, RefreshCw } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import { useLicense } from '../context/LicenseContext.jsx';

function AIConfigSection({ isPro }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // null | { configured, lastFour }
  const [keyStatus, setKeyStatus] = useState('idle'); // idle | saving | testing | deleting
  const [testResult, setTestResult] = useState(null); // null | { valid, model?, error? }
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/settings/ai-key-status');
      setStatus(res.data);
    } catch (_) {
      setStatus({ configured: false, lastFour: null });
    }
  };

  const handleSave = async () => {
    setSaveError('');
    setTestResult(null);
    setKeyStatus('saving');
    try {
      const res = await axios.post('/api/settings/ai-key', { apiKey });
      setStatus({ configured: true, lastFour: res.data.lastFour });
      setApiKey('');
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save API key');
    } finally {
      setKeyStatus('idle');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    setKeyStatus('testing');
    try {
      const payload = apiKey.trim() ? { apiKey } : {};
      const res = await axios.post('/api/settings/test-ai-key', payload);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ valid: false, error: err.response?.data?.error || 'Test failed' });
    } finally {
      setKeyStatus('idle');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove the stored API key? AI features will be disabled.')) return;
    setKeyStatus('deleting');
    setTestResult(null);
    try {
      await axios.delete('/api/settings/ai-key');
      setStatus({ configured: false, lastFour: null });
      setApiKey('');
    } catch (_) {
    } finally {
      setKeyStatus('idle');
    }
  };

  const canTest = isPro && (apiKey.trim().length > 0 || (status?.configured));
  const canSave = isPro && apiKey.trim().startsWith('sk-ant-');
  const busy = keyStatus !== 'idle';

  const statusBadge = () => {
    if (testResult) {
      if (testResult.valid) {
        return (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            AI Active — {testResult.model} connected
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <XCircle className="w-4 h-4" />
          Invalid API key — {testResult.error}
        </div>
      );
    }
    if (!status?.configured) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <AlertCircle className="w-4 h-4" />
          AI features disabled
        </div>
      );
    }
    if (apiKey.trim()) {
      return (
        <div className="flex items-center gap-2 text-sm text-yellow-400">
          <AlertCircle className="w-4 h-4" />
          Click Test to validate
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        Key configured (ends in <code className="font-mono text-gray-300">****{status.lastFour}</code>)
      </div>
    );
  };

  return (
    <div id="ai-config" className="card">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Key className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">AI Configuration</h2>
          <p className="text-sm text-gray-400 mt-0.5">Connect your Anthropic API key to enable AI features</p>
        </div>
      </div>

      {!isPro && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-3 text-sm text-yellow-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Pro license required to configure AI features.
        </div>
      )}

      <div className="space-y-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-2 bg-dark-800 rounded-lg border border-dark-600">
          {statusBadge()}
        </div>

        {/* Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Anthropic API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestResult(null); setSaveError(''); }}
              placeholder={status?.configured ? `Current key: ****${status.lastFour} (enter new key to replace)` : 'sk-ant-...'}
              disabled={!isPro || busy}
              className="w-full bg-dark-800 border border-dark-500 rounded-xl px-4 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {saveError && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> {saveError}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={!canSave || busy}
            className="btn-primary flex items-center gap-2 text-sm py-2"
          >
            {keyStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Key
          </button>
          <button
            onClick={handleTest}
            disabled={!canTest || busy}
            className="btn-secondary flex items-center gap-2 text-sm py-2"
          >
            {keyStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test Connection
          </button>
          {status?.configured && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="flex items-center gap-2 text-sm py-2 px-3 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {keyStatus === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </button>
          )}
        </div>

        {/* Help text */}
        <div className="p-3 bg-dark-800 rounded-xl border border-dark-600 text-xs text-gray-500 space-y-1.5">
          <p>Get your API key from{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
            >
              console.anthropic.com <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <p>Your key is stored securely on your server only.</p>
          <p>NixPanel never sends your key to our servers.</p>
        </div>
      </div>
    </div>
  );
}

function PanelSSLSection() {
  const [sslStatus, setSslStatus] = useState(null);
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [setupRunning, setSetupRunning] = useState(false);
  const [renewRunning, setRenewRunning] = useState(false);
  const [removeRunning, setRemoveRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/settings/ssl');
      setSslStatus(res.data);
    } catch (_) {
      setSslStatus({ configured: false, domain: null, certPath: null, keyPath: null, certInfo: null });
    }
  };

  const showMsg = (msg, error = false) => {
    setMessage(msg);
    setIsError(error);
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setSetupRunning(true);
    setMessage('');
    try {
      const res = await axios.post('/api/settings/ssl/setup', { domain, email });
      showMsg(res.data.message || `Certificate issued for ${domain}`);
      setDomain('');
      fetchStatus();
    } catch (err) {
      showMsg(err.response?.data?.error || 'SSL setup failed', true);
    } finally {
      setSetupRunning(false);
    }
  };

  const handleRenew = async () => {
    setRenewRunning(true);
    setMessage('');
    try {
      const res = await axios.post('/api/settings/ssl/renew');
      showMsg(res.data.message || 'Certificate renewed successfully');
      fetchStatus();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Renewal failed', true);
    } finally {
      setRenewRunning(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove SSL configuration? The cert files will not be deleted.')) return;
    setRemoveRunning(true);
    setMessage('');
    try {
      const res = await axios.delete('/api/settings/ssl');
      showMsg(res.data.message || 'SSL configuration cleared');
      fetchStatus();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed to clear SSL config', true);
    } finally {
      setRemoveRunning(false);
    }
  };

  const busy = setupRunning || renewRunning || removeRunning;

  return (
    <div id="ssl-config" className="card">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 border border-green-500/20 flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">HTTPS / SSL</h2>
          <p className="text-sm text-gray-400 mt-0.5">Secure NixPanel with a Let's Encrypt certificate</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm border flex items-center justify-between gap-3 ${isError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
        </div>
      )}

      {sslStatus?.configured ? (
        <div className="space-y-4">
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            SSL configured for <strong>{sslStatus.domain}</strong>
          </div>

          {sslStatus.certInfo && (
            <div className="px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-xs text-gray-400 space-y-1">
              <div>Expires: <span className={`font-medium ${sslStatus.certInfo.daysLeft < 14 ? 'text-red-400' : sslStatus.certInfo.daysLeft < 30 ? 'text-yellow-400' : 'text-gray-300'}`}>
                {new Date(sslStatus.certInfo.notAfter).toLocaleDateString()} ({sslStatus.certInfo.daysLeft}d remaining)
              </span></div>
              <div className="font-mono text-gray-500 truncate">{sslStatus.certPath}</div>
            </div>
          )}

          <div className="p-3 bg-dark-800 border border-dark-600 rounded-xl text-xs text-gray-400">
            HTTPS URL:{' '}
            <a
              href={`https://${sslStatus.domain}:3443`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline font-mono inline-flex items-center gap-1"
            >
              https://{sslStatus.domain}:3443 <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRenew}
              disabled={busy}
              className="btn-primary flex items-center gap-2 text-sm py-2"
            >
              {renewRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Renew Certificate
            </button>
            <button
              onClick={handleRemove}
              disabled={busy}
              className="flex items-center gap-2 text-sm py-2 px-3 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {removeRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="panel.example.com"
              disabled={busy}
              className="w-full bg-dark-800 border border-dark-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={busy}
              className="w-full bg-dark-800 border border-dark-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              required
            />
          </div>

          <div className="p-3 bg-dark-800 rounded-xl border border-dark-600 text-xs text-gray-500 space-y-1">
            <p>Port 80 must be publicly accessible for domain verification.</p>
            <p>Certbot will be installed automatically if not present.</p>
            <p>The HTTPS server will start on port 3443 after restart.</p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary flex items-center gap-2 text-sm py-2 w-full justify-center"
          >
            {setupRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            {setupRunning ? 'Issuing Certificate...' : 'Secure with HTTPS'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function Settings() {
  const { isPro } = useLicense();

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="px-6 py-6 max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-dark-700 border border-dark-600 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Settings</h1>
              <p className="text-xs text-gray-400">Configure NixPanel</p>
            </div>
          </div>

          <AIConfigSection isPro={isPro} />
          <PanelSSLSection />
        </div>
      </main>
    </div>
  );
}
