import React, { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, AtSign, Copy, X, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

const TABS = ['Email Accounts', 'Forwarders', 'DNS Records', 'Server Status'];

export default function Email() {
  const [tab, setTab] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [forwarders, setForwarders] = useState([]);
  const [postfixStatus, setPostfixStatus] = useState('unknown');
  const [services, setServices] = useState({});
  const [dnsRecords, setDnsRecords] = useState([]);
  const [dnsDomain, setDnsDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddForwarder, setShowAddForwarder] = useState(false);
  const [newAccount, setNewAccount] = useState({ email: '', password: '', quota: '' });
  const [newForwarder, setNewForwarder] = useState({ from: '', to: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/email/accounts');
      setAccounts(res.data.accounts || []);
      setPostfixStatus(res.data.postfixStatus);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts');
    } finally { setLoading(false); }
  };

  const loadForwarders = async () => {
    try {
      const res = await axios.get('/api/hosting/email/forwarders');
      setForwarders(res.data.forwarders || []);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load forwarders'); }
  };

  const loadStatus = async () => {
    try {
      const res = await axios.get('/api/hosting/email/status');
      setServices(res.data.services || {});
    } catch (err) { setError(err.response?.data?.error || 'Failed to load status'); }
  };

  useEffect(() => {
    loadAccounts();
    loadForwarders();
    loadStatus();
  }, []);

  const loadDnsRecords = async () => {
    if (!dnsDomain) return;
    try {
      const res = await axios.get(`/api/hosting/email/dns-records/${encodeURIComponent(dnsDomain)}`);
      setDnsRecords(res.data.records || []);
    } catch (err) { notify(err.response?.data?.error || 'Failed to load DNS records', true); }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/hosting/email/accounts', newAccount);
      notify(`Email account ${newAccount.email} created`);
      setShowAddAccount(false);
      setNewAccount({ email: '', password: '', quota: '' });
      loadAccounts();
    } catch (err) { notify(err.response?.data?.error || 'Failed to create account', true); }
    finally { setSaving(false); }
  };

  const handleDeleteAccount = async (email) => {
    if (!confirm(`Delete email account ${email}?`)) return;
    try {
      await axios.delete(`/api/hosting/email/accounts/${encodeURIComponent(email)}`);
      notify(`${email} deleted`);
      loadAccounts();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleAddForwarder = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/hosting/email/forwarders', { from: newForwarder.from, to: newForwarder.to });
      notify('Forwarder created');
      setShowAddForwarder(false);
      setNewForwarder({ from: '', to: '' });
      loadForwarders();
    } catch (err) { notify(err.response?.data?.error || 'Failed to create forwarder', true); }
    finally { setSaving(false); }
  };

  const handleDeleteForwarder = async (from) => {
    if (!confirm(`Delete forwarder from ${from}?`)) return;
    try {
      await axios.delete(`/api/hosting/email/forwarders/${encodeURIComponent(from)}`);
      notify('Forwarder deleted');
      loadForwarders();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const getServiceBadge = (state) => {
    if (state === 'active') return 'badge-green';
    if (state === 'inactive') return 'badge-red';
    return 'badge-gray';
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Email Management"
            subtitle={`Postfix status: ${postfixStatus}`}
            onRefresh={loadAccounts}
            loading={loading}
          />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

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

          {/* Email Accounts tab */}
          {tab === 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">{accounts.length} email account{accounts.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setShowAddAccount(!showAddAccount)} className="btn-primary text-sm py-1.5 flex items-center gap-2">
                  <Plus className="w-4 h-4" />Create Account
                </button>
              </div>

              {showAddAccount && (
                <form onSubmit={handleAddAccount} className="bg-dark-800 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Email Address *</label>
                    <input
                      value={newAccount.email}
                      onChange={e => setNewAccount(p => ({ ...p, email: e.target.value }))}
                      placeholder="user@example.com"
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
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Quota (MB, optional)</label>
                    <input
                      value={newAccount.quota}
                      onChange={e => setNewAccount(p => ({ ...p, quota: e.target.value }))}
                      placeholder="e.g. 500"
                      className="input-field text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Creating...' : 'Create Account'}
                    </button>
                    <button type="button" onClick={() => setShowAddAccount(false)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </form>
              )}

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-10">
                  <Mail className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No email accounts configured</p>
                  <p className="text-gray-600 text-sm mt-1">Requires Postfix + Dovecot</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Email</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Domain</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Size</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <AtSign className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono text-white">{a.email}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">{a.domain}</td>
                        <td className="py-2 px-3 text-gray-500 text-xs hidden md:table-cell">{a.size || '—'}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleDeleteAccount(a.email)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                            title="Delete"
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

          {/* Forwarders tab */}
          {tab === 1 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">{forwarders.length} forwarder{forwarders.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setShowAddForwarder(!showAddForwarder)} className="btn-primary text-sm py-1.5 flex items-center gap-2">
                  <Plus className="w-4 h-4" />Add Forwarder
                </button>
              </div>

              {showAddForwarder && (
                <form onSubmit={handleAddForwarder} className="bg-dark-800 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">From *</label>
                    <input
                      value={newForwarder.from}
                      onChange={e => setNewForwarder(p => ({ ...p, from: e.target.value }))}
                      placeholder="info@yourdomain.com"
                      className="input-field text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">To *</label>
                    <input
                      value={newForwarder.to}
                      onChange={e => setNewForwarder(p => ({ ...p, to: e.target.value }))}
                      placeholder="destination@example.com"
                      className="input-field text-sm"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="submit" disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Creating...' : 'Create Forwarder'}
                    </button>
                    <button type="button" onClick={() => setShowAddForwarder(false)} className="btn-ghost text-sm">Cancel</button>
                  </div>
                </form>
              )}

              {forwarders.length === 0 ? (
                <div className="text-center py-10">
                  <Mail className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No forwarders configured</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">From</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">To</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {forwarders.map((f, i) => (
                      <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                        <td className="py-2 px-3 font-mono text-blue-400">{f.from}</td>
                        <td className="py-2 px-3 font-mono text-gray-300">{f.to}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleDeleteForwarder(f.from)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
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

          {/* DNS Records tab */}
          {tab === 2 && (
            <div className="card">
              <div className="card-header mb-4">DNS Record Suggestions</div>
              <div className="flex gap-2 mb-4">
                <input
                  value={dnsDomain}
                  onChange={e => setDnsDomain(e.target.value)}
                  placeholder="yourdomain.com"
                  className="input-field text-sm flex-1"
                  onKeyDown={e => e.key === 'Enter' && loadDnsRecords()}
                />
                <button onClick={loadDnsRecords} className="btn-primary text-sm">Generate Records</button>
              </div>

              {dnsRecords.length > 0 ? (
                <div className="space-y-3">
                  {dnsRecords.map((r, i) => (
                    <div key={i} className="bg-dark-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-blue">{r.type}</span>
                          <span className="text-sm font-mono text-gray-300">{r.name}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(r.value, i)}
                          className="p-1.5 text-gray-400 hover:text-blue-400 rounded transition-colors"
                          title="Copy value"
                        >
                          {copied === i ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="font-mono text-xs text-green-300 break-all">{r.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{r.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Enter a domain name and click "Generate Records" to see required DNS records for email.</p>
              )}
            </div>
          )}

          {/* Server Status tab */}
          {tab === 3 && (
            <div className="card">
              <div className="card-header mb-4">Mail Server Status</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(services).map(([name, state]) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                    <div>
                      <span className="text-sm font-mono text-gray-200">{name}</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {name === 'postfix' ? 'SMTP server' :
                         name === 'dovecot' ? 'IMAP/POP3 server' :
                         name === 'opendkim' ? 'DKIM signing' :
                         name === 'spamassassin' ? 'Spam filter' : 'Mail service'}
                      </p>
                    </div>
                    <span className={`badge ${state === 'active' ? 'badge-green' : state === 'inactive' ? 'badge-red' : 'badge-gray'}`}>
                      {state}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                <strong>Note:</strong> Full email hosting requires Postfix (SMTP) and Dovecot (IMAP/POP3). Optionally add OpenDKIM for DKIM signing and SpamAssassin for spam filtering.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
