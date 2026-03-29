import React, { useState, useEffect, useRef } from 'react';
import { Code, Plus, RefreshCw, Settings, X, AlertTriangle, CheckCircle, Play } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

export default function PHPManager() {
  const [versions, setVersions] = useState([]);
  const [supported, setSupported] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [installing, setInstalling] = useState(null);
  const [installOutput, setInstallOutput] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [editVersion, setEditVersion] = useState(null);
  const [iniData, setIniData] = useState(null);
  const [iniEdits, setIniEdits] = useState({});
  const [savingIni, setSavingIni] = useState(false);
  const outputRef = useRef(null);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/php/versions');
      setVersions(res.data.versions || []);
      setSupported(res.data.supported || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load PHP versions');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadVersions(); }, []);

  const handleInstall = async () => {
    if (!selectedVersion) return;
    setInstalling(selectedVersion);
    setInstallOutput('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/hosting/php/install/${selectedVersion}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              setInstallOutput(prev => prev + data.text);
              if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
            if (data.done) {
              if (data.exitCode === 0) notify(`PHP ${selectedVersion} installed successfully`);
              else notify(`Install finished with exit code ${data.exitCode}`, true);
              loadVersions();
            }
            if (data.error) notify(data.error, true);
          } catch (_) {}
        }
      }
    } catch (err) {
      notify('Installation failed: ' + err.message, true);
    } finally {
      setInstalling(null);
    }
  };

  const handleRestart = async (version) => {
    try {
      await axios.post(`/api/hosting/php/${version}/restart`);
      notify(`PHP ${version}-FPM restarted`);
      loadVersions();
    } catch (err) { notify(err.response?.data?.error || 'Restart failed', true); }
  };

  const loadIni = async (version) => {
    try {
      const res = await axios.get(`/api/hosting/php/${version}/ini`);
      setIniData(res.data);
      setIniEdits(res.data.settings || {});
      setEditVersion(version);
    } catch (err) { notify(err.response?.data?.error || 'Failed to load php.ini', true); }
  };

  const handleSaveIni = async () => {
    setSavingIni(true);
    try {
      await axios.put(`/api/hosting/php/${editVersion}/ini`, { settings: iniEdits });
      notify(`PHP ${editVersion} settings saved`);
      setEditVersion(null);
    } catch (err) { notify(err.response?.data?.error || 'Save failed', true); }
    finally { setSavingIni(false); }
  };

  const iniFields = [
    { key: 'memory_limit', label: 'Memory Limit', placeholder: '256M' },
    { key: 'upload_max_filesize', label: 'Upload Max Filesize', placeholder: '64M' },
    { key: 'post_max_size', label: 'Post Max Size', placeholder: '64M' },
    { key: 'max_execution_time', label: 'Max Execution Time', placeholder: '300' },
    { key: 'max_input_time', label: 'Max Input Time', placeholder: '300' },
    { key: 'display_errors', label: 'Display Errors', placeholder: 'Off' },
    { key: 'max_file_uploads', label: 'Max File Uploads', placeholder: '20' },
    { key: 'date.timezone', label: 'Timezone', placeholder: 'UTC' },
  ];

  const getFpmBadge = (status) => {
    if (status === 'active') return 'badge-green';
    if (status === 'inactive' || status === 'failed') return 'badge-red';
    if (status === 'default') return 'badge-blue';
    return 'badge-gray';
  };

  const notInstalled = supported.filter(v => !versions.find(i => i.version === v));

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="PHP Manager" subtitle="PHP versions and configuration" onRefresh={loadVersions} loading={loading} />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* php.ini editor */}
          {editVersion && iniData && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-sm font-medium text-gray-200">PHP {editVersion} Settings</span>
                  {iniData.iniPath && (
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{iniData.iniPath}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveIni} disabled={savingIni} className="btn-primary text-sm py-1.5">
                    {savingIni ? 'Saving...' : 'Save & Restart FPM'}
                  </button>
                  <button onClick={() => setEditVersion(null)} className="btn-ghost text-sm py-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {iniFields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                    <input
                      value={iniEdits[f.key] || ''}
                      onChange={e => setIniEdits(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="input-field text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Install new version */}
          <div className="card mb-6">
            <div className="card-header mb-3">Install PHP Version</div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedVersion}
                onChange={e => setSelectedVersion(e.target.value)}
                className="input-field text-sm w-40"
              >
                <option value="">Select version...</option>
                {supported.map(v => (
                  <option key={v} value={v}>
                    PHP {v}{versions.find(i => i.version === v) ? ' (installed)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleInstall}
                disabled={!selectedVersion || !!installing}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {installing ? `Installing PHP ${installing}...` : 'Install'}
              </button>
            </div>

            {installOutput && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Installation output:</span>
                  <button onClick={() => setInstallOutput('')} className="text-xs text-gray-600 hover:text-gray-400">Clear</button>
                </div>
                <pre
                  ref={outputRef}
                  className="terminal text-xs max-h-56 overflow-auto"
                >
                  {installOutput}
                </pre>
              </div>
            )}
          </div>

          {/* Installed versions */}
          <div className="card">
            <div className="card-header mb-4">Installed PHP Versions</div>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Scanning for PHP installations...</div>
            ) : versions.length === 0 ? (
              <div className="text-center py-10">
                <Code className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No PHP versions detected</p>
                <p className="text-gray-600 text-sm mt-1">Use the install section above to install PHP</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((v, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-dark-800 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white">PHP {v.version}</span>
                        <span className={`badge ${getFpmBadge(v.fpmStatus)}`}>
                          {v.fpmStatus === 'default' ? 'default' : `FPM: ${v.fpmStatus}`}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{v.path}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => loadIni(v.version)}
                        className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                        title="Edit php.ini settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRestart(v.version)}
                        className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                        title="Restart PHP-FPM"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
