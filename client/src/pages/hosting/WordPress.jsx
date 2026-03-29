import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Plus, RefreshCw, ExternalLink, Settings, X, AlertTriangle, CheckCircle, Package, Play } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

export default function WordPress() {
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showInstall, setShowInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState('');
  const [updating, setUpdating] = useState(null);
  const [updateOutput, setUpdateOutput] = useState('');
  const [showResetPw, setShowResetPw] = useState(null);
  const [resetPwData, setResetPwData] = useState({ username: 'admin', newPassword: '' });
  const [newInstall, setNewInstall] = useState({
    domain: '', adminUser: 'admin', adminPassword: '', adminEmail: '', siteTitle: '',
    dbName: '', dbUser: '', dbPassword: '',
  });
  const installRef = useRef(null);
  const updateRef = useRef(null);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 6000);
  };

  const loadInstallations = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/wordpress/installations');
      setInstallations(res.data.installations || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to scan for WordPress installations');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadInstallations(); }, []);

  const handleInstall = async (e) => {
    e.preventDefault();
    setInstalling(true);
    setInstallOutput('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/hosting/wordpress/install', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newInstall),
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
              if (installRef.current) installRef.current.scrollTop = installRef.current.scrollHeight;
            }
            if (data.done && data.success) {
              notify(`WordPress installed on ${data.domain}`);
              loadInstallations();
            }
            if (data.error) notify(data.error, true);
          } catch (_) {}
        }
      }
    } catch (err) {
      notify('Installation failed: ' + err.message, true);
    } finally {
      setInstalling(false);
    }
  };

  const handleUpdateAll = async (installation) => {
    setUpdating(installation.path64);
    setUpdateOutput('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/hosting/wordpress/${installation.path64}/update-all`, {
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
              setUpdateOutput(prev => prev + data.text);
              if (updateRef.current) updateRef.current.scrollTop = updateRef.current.scrollHeight;
            }
            if (data.done) {
              notify(`Updates complete for ${installation.domain}`);
              loadInstallations();
            }
            if (data.error) notify(data.error, true);
          } catch (_) {}
        }
      }
    } catch (err) {
      notify('Update failed: ' + err.message, true);
    } finally {
      setUpdating(null);
    }
  };

  const handleMaintenance = async (installation, enable) => {
    try {
      await axios.post(`/api/hosting/wordpress/${installation.path64}/maintenance`, { enable });
      notify(`Maintenance mode ${enable ? 'enabled' : 'disabled'} for ${installation.domain}`);
    } catch (err) { notify(err.response?.data?.error || 'Failed', true); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/hosting/wordpress/${showResetPw}/reset-password`, resetPwData);
      notify('Password reset successfully');
      setShowResetPw(null);
      setResetPwData({ username: 'admin', newPassword: '' });
    } catch (err) { notify(err.response?.data?.error || 'Reset failed', true); }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="WordPress Manager" subtitle="One-click install & management" onRefresh={loadInstallations} loading={loading} />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Reset password modal */}
          {showResetPw && (
            <div className="card mb-6 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-200">Reset WordPress Admin Password</span>
                <button onClick={() => setShowResetPw(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <form onSubmit={handleResetPassword} className="flex gap-2 flex-wrap">
                <input
                  value={resetPwData.username}
                  onChange={e => setResetPwData(p => ({ ...p, username: e.target.value }))}
                  placeholder="admin username"
                  className="input-field text-sm flex-1 min-w-32"
                  required
                />
                <input
                  type="password"
                  value={resetPwData.newPassword}
                  onChange={e => setResetPwData(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="New password (min 8 chars)"
                  className="input-field text-sm flex-1 min-w-48"
                  required
                />
                <button type="submit" className="btn-primary text-sm">Reset Password</button>
              </form>
            </div>
          )}

          {/* Install form */}
          {showInstall && (
            <div className="card mb-6">
              <div className="card-header mb-4">Install WordPress</div>
              <form onSubmit={handleInstall} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Domain Name *</label>
                  <input
                    value={newInstall.domain}
                    onChange={e => setNewInstall(p => ({ ...p, domain: e.target.value }))}
                    placeholder="example.com"
                    className="input-field text-sm"
                    required
                  />
                  <p className="text-xs text-gray-600 mt-1">WordPress will be installed to /var/www/{newInstall.domain || 'domain'}/public_html</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Site Title</label>
                  <input
                    value={newInstall.siteTitle}
                    onChange={e => setNewInstall(p => ({ ...p, siteTitle: e.target.value }))}
                    placeholder="My Website"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Admin Username</label>
                  <input
                    value={newInstall.adminUser}
                    onChange={e => setNewInstall(p => ({ ...p, adminUser: e.target.value }))}
                    placeholder="admin"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Admin Password *</label>
                  <input
                    type="password"
                    value={newInstall.adminPassword}
                    onChange={e => setNewInstall(p => ({ ...p, adminPassword: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="input-field text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Admin Email</label>
                  <input
                    type="email"
                    value={newInstall.adminEmail}
                    onChange={e => setNewInstall(p => ({ ...p, adminEmail: e.target.value }))}
                    placeholder={`admin@${newInstall.domain || 'example.com'}`}
                    className="input-field text-sm"
                  />
                </div>
                <div className="sm:col-span-2 border-t border-dark-600 pt-3">
                  <p className="text-xs text-gray-500 mb-2">Database (auto-generated if left empty)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      value={newInstall.dbName}
                      onChange={e => setNewInstall(p => ({ ...p, dbName: e.target.value }))}
                      placeholder="DB name (auto)"
                      className="input-field text-sm"
                    />
                    <input
                      value={newInstall.dbUser}
                      onChange={e => setNewInstall(p => ({ ...p, dbUser: e.target.value }))}
                      placeholder="DB user (auto)"
                      className="input-field text-sm"
                    />
                    <input
                      type="password"
                      value={newInstall.dbPassword}
                      onChange={e => setNewInstall(p => ({ ...p, dbPassword: e.target.value }))}
                      placeholder="DB password (auto)"
                      className="input-field text-sm"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={installing} className="btn-primary flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    {installing ? 'Installing...' : 'Install WordPress'}
                  </button>
                  <button type="button" onClick={() => setShowInstall(false)} className="btn-ghost">Cancel</button>
                </div>
              </form>

              {installOutput && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-1">Install output:</p>
                  <pre ref={installRef} className="terminal text-xs max-h-56 overflow-auto">
                    {installOutput}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Update output */}
          {updateOutput && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Update output:</span>
                <button onClick={() => setUpdateOutput('')} className="text-xs text-gray-600 hover:text-gray-400">Clear</button>
              </div>
              <pre ref={updateRef} className="terminal text-xs max-h-48 overflow-auto">{updateOutput}</pre>
            </div>
          )}

          {/* Installations list */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">
                {installations.length} WordPress installation{installations.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowInstall(!showInstall)}
                className="btn-primary text-sm py-1.5 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />Install WordPress
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Scanning for WordPress installations...</div>
            ) : installations.length === 0 ? (
              <div className="text-center py-12">
                <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No WordPress installations found</p>
                <p className="text-gray-600 text-sm mt-1">WordPress sites in /var/www will be detected automatically</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installations.map((inst, i) => (
                  <div key={i} className="bg-dark-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <Monitor className="w-4 h-4 text-blue-400" />
                          <span className="font-medium text-white">{inst.domain}</span>
                          {inst.updateAvailable && (
                            <span className="badge badge-yellow">Update Available</span>
                          )}
                          <span className="badge badge-gray">v{inst.version}</span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono">{inst.path}</p>
                        {inst.pluginCount > 0 && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            <Package className="w-3 h-3 inline mr-1" />
                            {inst.pluginCount} plugin{inst.pluginCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                        <button
                          onClick={() => window.open(`http://${inst.domain}/wp-admin`, '_blank')}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          title="Open WP Admin"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleUpdateAll(inst)}
                          disabled={updating === inst.path64}
                          className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                          title="Update all (core + plugins + themes)"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${updating === inst.path64 ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleMaintenance(inst, true)}
                          className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                          title="Enable maintenance mode"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setShowResetPw(inst.path64); setResetPwData({ username: 'admin', newPassword: '' }); }}
                          className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                          title="Reset admin password"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
