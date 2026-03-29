import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, Edit, Server, Wifi, X, AlertTriangle, CheckCircle, Copy } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

export default function FTPManager() {
  const [accounts, setAccounts] = useState([]);
  const [ftpStatus, setFtpStatus] = useState('unknown');
  const [ftpServer, setFtpServer] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [connections, setConnections] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [changePwUser, setChangePwUser] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [newAccount, setNewAccount] = useState({ username: '', password: '', directory: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [accRes, statusRes, connRes] = await Promise.all([
        axios.get('/api/hosting/ftp/accounts'),
        axios.get('/api/hosting/ftp/status'),
        axios.get('/api/hosting/ftp/connections'),
      ]);
      setAccounts(accRes.data.accounts || []);
      setFtpStatus(accRes.data.ftpStatus);
      setFtpServer(accRes.data.ftpServer);
      setStatusData(statusRes.data);
      setConnections(connRes.data.connections || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load FTP data');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/hosting/ftp/accounts', newAccount);
      notify(`FTP account ${newAccount.username} created`);
      setShowAdd(false);
      setNewAccount({ username: '', password: '', directory: '' });
      loadAll();
    } catch (err) { notify(err.response?.data?.error || 'Failed to create account', true); }
    finally { setSaving(false); }
  };

  const handleDelete = async (username) => {
    if (!confirm(`Delete FTP account "${username}"? This also removes the system user.`)) return;
    try {
      await axios.delete(`/api/hosting/ftp/accounts/${username}`);
      notify(`${username} deleted`);
      loadAll();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/hosting/ftp/accounts/${changePwUser}/password`, { password: newPw });
      notify(`Password updated for ${changePwUser}`);
      setChangePwUser(null);
      setNewPw('');
    } catch (err) { notify(err.response?.data?.error || 'Password change failed', true); }
  };

  const copyConnInfo = () => {
    if (!statusData) return;
    const info = `FTP Host: ${statusData.serverIp || 'your-server-ip'}\nPort: 21\nProtocol: FTP (explicit TLS recommended)`;
    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="FTP Manager" subtitle="File Transfer Protocol accounts" onRefresh={loadAll} loading={loading} />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Password change form */}
          {changePwUser && (
            <div className="card mb-4 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-300">Change password for <span className="font-mono text-yellow-400">{changePwUser}</span></span>
                <button onClick={() => setChangePwUser(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <form onSubmit={handleChangePassword} className="flex gap-2">
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="input-field text-sm flex-1"
                  required
                  minLength={8}
                />
                <button type="submit" className="btn-primary text-sm">Update</button>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* FTP server status card */}
            <div className="card">
              <div className="card-header mb-3">FTP Server Status</div>
              <div className="space-y-2">
                {statusData && Object.entries(statusData.services || {}).map(([name, state]) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-dark-800 rounded-lg">
                    <span className="text-sm font-mono text-gray-300">{name}</span>
                    <span className={`badge ${state === 'active' ? 'badge-green' : state === 'not-installed' ? 'badge-gray' : 'badge-red'}`}>
                      {state}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection info card */}
            <div className="card col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <span className="card-header">Connection Details</span>
                <button
                  onClick={copyConnInfo}
                  className="p-1.5 text-gray-400 hover:text-blue-400 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Host', value: statusData?.serverIp || 'your-server-ip' },
                  { label: 'Port', value: '21' },
                  { label: 'Protocol', value: 'FTP / FTPS' },
                  { label: 'Passive Mode', value: 'Recommended' },
                  { label: 'Encryption', value: 'Explicit TLS' },
                  { label: 'Server', value: ftpServer || 'Not detected' },
                ].map((item, i) => (
                  <div key={i} className="bg-dark-800 rounded-lg p-2">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-sm font-mono text-gray-200 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* FTP accounts */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">{accounts.length} FTP account{accounts.length !== 1 ? 's' : ''}</span>
              <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm py-1.5 flex items-center gap-2">
                <Plus className="w-4 h-4" />Add FTP Account
              </button>
            </div>

            {showAdd && (
              <form onSubmit={handleAdd} className="bg-dark-800 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Username *</label>
                  <input
                    value={newAccount.username}
                    onChange={e => setNewAccount(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_\-]/g, '') }))}
                    placeholder="ftpuser"
                    className="input-field text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Password *</label>
                  <input
                    type="password"
                    value={newAccount.password}
                    onChange={e => setNewAccount(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="input-field text-sm"
                    required
                    minLength={8}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Home Directory (optional)</label>
                  <input
                    value={newAccount.directory}
                    onChange={e => setNewAccount(p => ({ ...p, directory: e.target.value }))}
                    placeholder={newAccount.username ? `/var/www/${newAccount.username}` : '/var/www/username'}
                    className="input-field text-sm"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary text-sm">
                    {saving ? 'Creating...' : 'Create Account'}
                  </button>
                  <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-sm">Cancel</button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-10">
                <FolderOpen className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No FTP accounts found</p>
                <p className="text-gray-600 text-sm mt-1">FTP accounts are system users with /usr/sbin/nologin shell</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Username</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Directory</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Status</th>
                    <th className="py-2 px-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                      <td className="py-2 px-3 font-mono text-white">{a.username}</td>
                      <td className="py-2 px-3 font-mono text-gray-500 text-xs hidden md:table-cell">
                        <span className="truncate block max-w-xs" title={a.directory}>{a.directory || '—'}</span>
                      </td>
                      <td className="py-2 px-3 hidden sm:table-cell">
                        <span className={`badge ${a.enabled ? 'badge-green' : 'badge-gray'}`}>
                          {a.enabled ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setChangePwUser(a.username); setNewPw(''); }}
                            className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                            title="Change password"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(a.username)}
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
            )}
          </div>

          {/* Active connections */}
          {connections && connections !== 'No active connections' && (
            <div className="card mt-4">
              <div className="card-header mb-2">Active Connections</div>
              <pre className="terminal text-xs max-h-32 overflow-auto">{connections}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
