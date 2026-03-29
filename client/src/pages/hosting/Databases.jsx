import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, Download, Users, X, AlertTriangle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

const TABS = ['Databases', 'DB Users'];

export default function Databases() {
  const [tab, setTab] = useState(0);
  const [databases, setDatabases] = useState([]);
  const [dbUsers, setDbUsers] = useState([]);
  const [mysqlStatus, setMysqlStatus] = useState('unknown');
  const [mysqlVersion, setMysqlVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newDb, setNewDb] = useState({ name: '', createUser: false, username: '', password: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', database: '', privileges: 'ALL' });
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const loadDatabases = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/databases');
      setDatabases(res.data.databases || []);
      setMysqlStatus(res.data.mysqlStatus);
      setMysqlVersion(res.data.mysqlVersion || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load databases');
    } finally { setLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const res = await axios.get('/api/hosting/databases/users');
      setDbUsers(res.data.users || []);
    } catch (err) { /* ignore */ }
  };

  useEffect(() => { loadDatabases(); loadUsers(); }, []);

  const handleAddDb = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/hosting/databases', newDb);
      notify(`Database ${newDb.name} created${newDb.createUser ? ` with user ${newDb.username}` : ''}`);
      setShowAdd(false);
      setNewDb({ name: '', createUser: false, username: '', password: '' });
      loadDatabases();
      loadUsers();
    } catch (err) { notify(err.response?.data?.error || 'Failed to create database', true); }
    finally { setSaving(false); }
  };

  const handleDeleteDb = async (name) => {
    if (!confirm(`Delete database "${name}"? This cannot be undone!`)) return;
    try {
      await axios.delete(`/api/hosting/databases/${name}`);
      notify(`Database ${name} deleted`);
      loadDatabases();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleDeleteUser = async (username) => {
    if (!confirm(`Delete database user "${username}"?`)) return;
    try {
      await axios.delete(`/api/hosting/databases/users/${username}`);
      notify(`User ${username} deleted`);
      loadUsers();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleExport = async (name) => {
    setExporting(name);
    try {
      const res = await axios.post(`/api/hosting/databases/${name}/export`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_export.sql.gz`;
      a.click();
      window.URL.revokeObjectURL(url);
      notify(`${name} exported`);
    } catch (err) { notify(err.response?.data?.error || 'Export failed', true); }
    finally { setExporting(null); }
  };

  const handleAssignUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`/api/hosting/databases/${newUser.database}/users`, newUser);
      notify(`User ${newUser.username} assigned to ${newUser.database}`);
      setShowAddUser(false);
      setNewUser({ username: '', password: '', database: '', privileges: 'ALL' });
      loadUsers();
    } catch (err) { notify(err.response?.data?.error || 'Failed to assign user', true); }
    finally { setSaving(false); }
  };

  const statusColor = mysqlStatus === 'active' ? 'badge-green' : mysqlStatus === 'error' ? 'badge-red' : 'badge-gray';

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="Databases" subtitle="MySQL/MariaDB management" onRefresh={loadDatabases} loading={loading} />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* MySQL status banner */}
          <div className="card mb-4 flex items-center gap-4">
            <Database className="w-5 h-5 text-blue-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">MySQL / MariaDB</span>
                <span className={`badge ${statusColor}`}>{mysqlStatus}</span>
              </div>
              {mysqlVersion && mysqlVersion !== 'unknown' && (
                <p className="text-xs text-gray-500 mt-0.5">Version: {mysqlVersion}</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-dark-800 p-1 rounded-lg w-fit">
            {TABS.map((t, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === i ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Databases tab */}
          {tab === 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">{databases.length} database{databases.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm py-1.5 flex items-center gap-2">
                  <Plus className="w-4 h-4" />Create Database
                </button>
              </div>

              {showAdd && (
                <form onSubmit={handleAddDb} className="bg-dark-800 rounded-lg p-4 mb-4 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Database Name *</label>
                    <input
                      value={newDb.name}
                      onChange={e => setNewDb(p => ({ ...p, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))}
                      placeholder="my_database"
                      className="input-field text-sm"
                      required
                    />
                    <p className="text-xs text-gray-600 mt-1">Alphanumeric and underscore only</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newDb.createUser}
                      onChange={e => setNewDb(p => ({ ...p, createUser: e.target.checked }))}
                      className="rounded"
                    />
                    Create database user
                  </label>
                  {newDb.createUser && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4 border-l-2 border-blue-500/30">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Username *</label>
                        <input
                          value={newDb.username}
                          onChange={e => setNewDb(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                          placeholder="db_user"
                          className="input-field text-sm"
                          required={newDb.createUser}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Password *</label>
                        <input
                          type="password"
                          value={newDb.password}
                          onChange={e => setNewDb(p => ({ ...p, password: e.target.value }))}
                          placeholder="Min 8 characters"
                          className="input-field text-sm"
                          required={newDb.createUser}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Creating...' : 'Create Database'}
                    </button>
                    <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </form>
              )}

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading databases...</div>
              ) : databases.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">
                    {mysqlStatus === 'active' ? 'No databases found' : 'MySQL/MariaDB is not running'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Size</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {databases.map((d, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono text-white">{d.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">
                          {d.sizeMb ? `${d.sizeMb} MB` : '< 1 MB'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleExport(d.name)}
                              disabled={exporting === d.name}
                              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                              title="Export as .sql.gz"
                            >
                              <Download className={`w-3.5 h-3.5 ${exporting === d.name ? 'animate-bounce' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleDeleteDb(d.name)}
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
          )}

          {/* DB Users tab */}
          {tab === 1 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">{dbUsers.length} user{dbUsers.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setShowAddUser(!showAddUser)} className="btn-primary text-sm py-1.5 flex items-center gap-2">
                  <Plus className="w-4 h-4" />Assign User
                </button>
              </div>

              {showAddUser && (
                <form onSubmit={handleAssignUser} className="bg-dark-800 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Username *</label>
                    <input
                      value={newUser.username}
                      onChange={e => setNewUser(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      placeholder="db_user"
                      className="input-field text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Password (leave empty to keep existing)</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                      placeholder="Optional"
                      className="input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Database *</label>
                    <select
                      value={newUser.database}
                      onChange={e => setNewUser(p => ({ ...p, database: e.target.value }))}
                      className="input-field text-sm"
                      required
                    >
                      <option value="">Select database...</option>
                      {databases.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Privileges</label>
                    <select
                      value={newUser.privileges}
                      onChange={e => setNewUser(p => ({ ...p, privileges: e.target.value }))}
                      className="input-field text-sm"
                    >
                      <option value="ALL">ALL PRIVILEGES</option>
                      <option value="SELECT">SELECT only</option>
                      <option value="SELECT,INSERT,UPDATE,DELETE">Read/Write</option>
                      <option value="SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,INDEX,ALTER">Full (no admin)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Assigning...' : 'Assign User'}
                    </button>
                    <button type="button" onClick={() => setShowAddUser(false)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </form>
              )}

              {dbUsers.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No database users found</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Username</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Host</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbUsers.map((u, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3 font-mono text-white">{u.user}</td>
                        <td className="py-2 px-3 font-mono text-gray-400">{u.host}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.user)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
