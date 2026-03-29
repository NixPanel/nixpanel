import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, UserPlus, Trash2, Edit, Shield, Eye, AlertCircle, User } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const roleColors = {
  admin: 'badge-blue',
  operator: 'badge-yellow',
  viewer: 'badge-gray',
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('panel');
  const [panelUsers, setPanelUsers] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer', email: '' });
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    try {
      await axios.put('/api/auth/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [panelRes, systemRes, groupRes] = await Promise.all([
        axios.get('/api/users/panel'),
        axios.get('/api/users/system'),
        axios.get('/api/users/groups'),
      ]);
      setPanelUsers(panelRes.data.users || []);
      setSystemUsers(systemRes.data.users || []);
      setGroups(groupRes.data.groups || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await axios.get('/api/users/audit?limit=50');
      setAuditLog(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') fetchAudit();
  }, [activeTab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');

    if (!newUser.username || !newUser.password) {
      setFormError('Username and password are required');
      return;
    }

    try {
      await axios.post('/api/users/panel', newUser);
      setSuccess(`User "${newUser.username}" created successfully`);
      setNewUser({ username: '', password: '', role: 'viewer', email: '' });
      setShowCreateForm(false);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/users/panel/${userId}`);
      setSuccess(`User "${username}" deleted`);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await axios.put(`/api/users/panel/${userId}`, { is_active: !currentStatus });
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update user');
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Users & Groups"
            subtitle="Manage panel users and system accounts"
            onRefresh={fetchData}
            loading={loading}
          />

          {(formError || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${formError ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError || success}
            </div>
          )}

          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[
              { id: 'panel', label: 'Panel Users' },
              { id: 'system', label: 'System Users' },
              { id: 'groups', label: 'Groups' },
              { id: 'audit', label: 'Audit Log' },
              { id: 'account', label: 'My Account' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel Users */}
          {activeTab === 'panel' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">{panelUsers.length} panel users</span>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="btn-primary flex items-center gap-2 text-sm py-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              </div>

              {showCreateForm && (
                <form onSubmit={handleCreateUser} className="mb-6 p-4 bg-dark-800 rounded-xl border border-dark-500">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Username *</label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                        className="input-field text-sm"
                        placeholder="johndoe"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Password *</label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                        className="input-field text-sm"
                        placeholder="Min 8 characters"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Role *</label>
                      <select
                        value={newUser.role}
                        onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="viewer">Viewer (read-only)</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Email</label>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                        className="input-field text-sm"
                        placeholder="user@example.com"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm py-1.5">Create User</button>
                    <button type="button" onClick={() => setShowCreateForm(false)} className="btn-ghost text-sm py-1.5">Cancel</button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {panelUsers.map(user => (
                  <div key={user.id} className="flex items-center gap-3 p-3 bg-dark-800 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-white">{user.username}</span>
                        <span className={`badge ${roleColors[user.role] || 'badge-gray'}`}>{user.role}</span>
                        {!user.is_active && <span className="badge badge-red">disabled</span>}
                        {user.id === currentUser?.id && <span className="badge badge-green">you</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {user.email || 'No email'} · Last login: {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    {user.id !== currentUser?.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          className={`p-1.5 rounded transition-colors ${user.is_active ? 'text-yellow-400 hover:bg-yellow-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                          title={user.is_active ? 'Disable' : 'Enable'}
                        >
                          {user.is_active ? <Eye className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 opacity-50" />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System Users */}
          {activeTab === 'system' && (
            <div className="card">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Username</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">UID</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Home</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">Shell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemUsers.map((u, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3 font-mono text-white">
                          {u.uid === 0 ? <span className="text-red-400 font-bold">{u.username}</span> : u.username}
                        </td>
                        <td className="py-2 px-3 font-mono text-gray-400">{u.uid}</td>
                        <td className="py-2 px-3 font-mono text-gray-500 text-xs hidden md:table-cell">{u.home}</td>
                        <td className="py-2 px-3 font-mono text-gray-500 text-xs hidden lg:table-cell">{u.shell}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Groups */}
          {activeTab === 'groups' && (
            <div className="card">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Group</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">GID</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3 font-mono text-white">{g.name}</td>
                        <td className="py-2 px-3 font-mono text-gray-400">{g.gid}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{g.members.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* My Account */}
          {activeTab === 'account' && (
            <div className="card max-w-md">
              <div className="card-header">Change Password</div>
              {pwError && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{pwSuccess}
                </div>
              )}
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                    className="input-field"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">New Password</label>
                  <input
                    type="password"
                    value={pwForm.newPassword}
                    onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                    className="input-field"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                    className="input-field"
                    autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn-primary w-full mt-2">Change Password</button>
              </form>
            </div>
          )}

          {/* Audit Log */}
          {activeTab === 'audit' && (
            <div className="card">
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Time</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">User</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Action</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Resource</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((log, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3 font-mono text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono text-blue-400">{log.username}</td>
                        <td className="py-2 px-3 font-mono text-yellow-400">{log.action}</td>
                        <td className="py-2 px-3 font-mono text-gray-300">{log.resource}</td>
                        <td className="py-2 px-3 font-mono text-gray-500 hidden md:table-cell">{log.ip_address}</td>
                      </tr>
                    ))}
                    {auditLog.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-gray-500">No audit entries yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
