import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Edit, Power, Lock, ExternalLink, FileText, X, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

export default function Domains() {
  const [domains, setDomains] = useState([]);
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editDomain, setEditDomain] = useState(null);
  const [editConfig, setEditConfig] = useState('');
  const [logDomain, setLogDomain] = useState(null);
  const [logType, setLogType] = useState('access');
  const [logs, setLogs] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newDomain, setNewDomain] = useState({ domain: '', docRoot: '', phpVersion: '8.2', autoSSL: false });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/domains');
      setDomains(res.data.domains || []);
      setServer(res.data.server);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load domains');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await axios.post('/api/hosting/domains', {
        domain: newDomain.domain,
        docRoot: newDomain.docRoot || undefined,
        phpVersion: newDomain.phpVersion,
        autoSSL: newDomain.autoSSL,
      });
      notify(`Domain ${newDomain.domain} created successfully`);
      setShowAdd(false);
      setNewDomain({ domain: '', docRoot: '', phpVersion: '8.2', autoSSL: false });
      load();
    } catch (err) {
      notify(err.response?.data?.error || 'Failed to create domain', true);
    } finally { setAdding(false); }
  };

  const handleToggle = async (domain) => {
    try {
      await axios.post(`/api/hosting/domains/${domain}/toggle`);
      load();
    } catch (err) { notify(err.response?.data?.error || 'Toggle failed', true); }
  };

  const handleDelete = async (domain) => {
    if (!confirm(`Delete virtual host for ${domain}?`)) return;
    const removeFiles = confirm('Also delete website files? Click Cancel to keep files.');
    try {
      await axios.delete(`/api/hosting/domains/${domain}?removeFiles=${removeFiles}`);
      notify(`${domain} deleted`);
      load();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const loadConfig = async (domain) => {
    try {
      const res = await axios.get(`/api/hosting/domains/${domain}/config`);
      setEditConfig(res.data.content);
      setEditDomain(domain);
      setLogDomain(null);
    } catch (err) { notify(err.response?.data?.error || 'Failed to load config', true); }
  };

  const saveConfig = async () => {
    try {
      await axios.put(`/api/hosting/domains/${editDomain}/config`, { content: editConfig });
      notify('Config saved and reloaded');
      setEditDomain(null);
    } catch (err) { notify(err.response?.data?.error || 'Save failed', true); }
  };

  const loadLogs = async (domain, type = 'access') => {
    try {
      const res = await axios.get(`/api/hosting/domains/${domain}/logs?lines=100&type=${type}`);
      setLogs(res.data.content);
      setLogDomain(domain);
      setLogType(type);
      setEditDomain(null);
    } catch (err) { notify(err.response?.data?.error || 'Failed to load logs', true); }
  };

  const requestSSL = async (domain) => {
    try {
      await axios.post(`/api/hosting/domains/${domain}/ssl`, { email: '' });
      notify(`SSL requested for ${domain}`);
      load();
    } catch (err) { notify(err.response?.data?.error || 'SSL request failed', true); }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Domains & Virtual Hosts"
            subtitle={server ? `Web server: ${server}` : 'No web server detected'}
            onRefresh={load}
            loading={loading}
          />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Config editor */}
          {editDomain && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-300">
                  Editing config: <span className="text-blue-400 font-mono">{editDomain}</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={saveConfig} className="btn-primary text-sm py-1.5 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />Save & Reload
                  </button>
                  <button onClick={() => setEditDomain(null)} className="btn-ghost text-sm py-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                value={editConfig}
                onChange={e => setEditConfig(e.target.value)}
                className="w-full bg-gray-950 text-green-300 font-mono text-sm p-4 rounded-lg border border-dark-500 focus:outline-none focus:border-blue-500 resize-none"
                style={{ height: '320px' }}
              />
            </div>
          )}

          {/* Log viewer */}
          {logDomain && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-300">
                  Logs: <span className="text-blue-400 font-mono">{logDomain}</span>
                  <span className="ml-2 text-gray-500">({logType})</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadLogs(logDomain, 'access')}
                    className={`btn-ghost text-xs py-1 ${logType === 'access' ? 'text-blue-400' : ''}`}
                  >
                    Access
                  </button>
                  <button
                    onClick={() => loadLogs(logDomain, 'error')}
                    className={`btn-ghost text-xs py-1 ${logType === 'error' ? 'text-red-400' : ''}`}
                  >
                    Error
                  </button>
                  <button onClick={() => setLogDomain(null)} className="btn-ghost text-xs py-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="terminal text-xs max-h-48 overflow-auto whitespace-pre-wrap">{logs || 'No log entries'}</pre>
            </div>
          )}

          {/* Add domain form */}
          {showAdd && (
            <div className="card mb-6">
              <div className="card-header mb-4">Add New Domain</div>
              <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Domain Name *</label>
                  <input
                    value={newDomain.domain}
                    onChange={e => setNewDomain(p => ({ ...p, domain: e.target.value }))}
                    placeholder="example.com"
                    className="input-field text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Document Root (optional)</label>
                  <input
                    value={newDomain.docRoot}
                    onChange={e => setNewDomain(p => ({ ...p, docRoot: e.target.value }))}
                    placeholder={newDomain.domain ? `/var/www/${newDomain.domain}/public_html` : '/var/www/domain/public_html'}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PHP Version</label>
                  <select
                    value={newDomain.phpVersion}
                    onChange={e => setNewDomain(p => ({ ...p, phpVersion: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['7.4', '8.0', '8.1', '8.2', '8.3'].map(v => (
                      <option key={v} value={v}>PHP {v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newDomain.autoSSL}
                      onChange={e => setNewDomain(p => ({ ...p, autoSSL: e.target.checked }))}
                      className="rounded border-dark-400"
                    />
                    Auto SSL (Let's Encrypt certbot)
                  </label>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={adding} className="btn-primary">
                    {adding ? 'Creating...' : 'Create Virtual Host'}
                  </button>
                  <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Domain list */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">
                {domains.length} virtual host{domains.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="btn-primary text-sm py-1.5 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />Add Domain
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : domains.length === 0 ? (
              <div className="text-center py-12">
                <Globe className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">
                  {server ? 'No virtual hosts configured yet' : 'No web server (nginx/apache2) detected'}
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  {server ? 'Click "Add Domain" to create your first virtual host' : 'Install nginx or apache2 to get started'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Domain</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Document Root</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Disk</th>
                      <th className="py-2 px-3 text-right text-gray-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30 transition-colors">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <span className="font-mono text-white text-sm">{d.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-gray-500 text-xs hidden md:table-cell">
                          <span className="truncate block max-w-xs" title={d.docRoot}>{d.docRoot}</span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`badge ${d.enabled ? 'badge-green' : 'badge-gray'}`}>
                              {d.enabled ? 'active' : 'disabled'}
                            </span>
                            {d.hasSSL && <span className="badge badge-blue">SSL</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs hidden sm:table-cell">{d.diskUsage || '—'}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => window.open(`http://${d.name}`, '_blank')}
                              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                              title="Open in browser"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => loadConfig(d.name)}
                              className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                              title="Edit config"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => loadLogs(d.name)}
                              className="p-1.5 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                              title="View logs"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            {!d.hasSSL && (
                              <button
                                onClick={() => requestSSL(d.name)}
                                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                title="Request SSL certificate"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggle(d.name)}
                              className={`p-1.5 rounded transition-colors ${d.enabled ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-gray-400 hover:text-green-400 hover:bg-green-500/10'}`}
                              title={d.enabled ? 'Disable' : 'Enable'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(d.name)}
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
