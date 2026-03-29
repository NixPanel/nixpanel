import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Power, AlertTriangle, RefreshCw, Network } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

export default function Firewall() {
  const [ufwStatus, setUfwStatus] = useState('');
  const [iptablesRules, setIptablesRules] = useState('');
  const [connections, setConnections] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ufw');
  const [newRule, setNewRule] = useState({ action: 'allow', port: '', protocol: 'tcp', from: '', comment: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, connRes] = await Promise.all([
        axios.get('/api/firewall/rules'),
        axios.get('/api/firewall/connections'),
      ]);
      setUfwStatus(rulesRes.data.ufw || '');
      setIptablesRules(rulesRes.data.iptables || '');
      setConnections(connRes.data.connections || '');
    } catch (err) {
      console.error('Firewall fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleUfwToggle = async (enable) => {
    if (!confirm(`${enable ? 'Enable' : 'Disable'} UFW firewall?`)) return;
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      const endpoint = enable ? '/api/firewall/ufw/enable' : '/api/firewall/ufw/disable';
      await axios.post(endpoint);
      setSuccess(`UFW ${enable ? 'enabled' : 'disabled'} successfully`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newRule.port) {
      setError('Port is required');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post('/api/firewall/ufw/rule', newRule);
      setSuccess(`Rule added: ${newRule.action} port ${newRule.port}/${newRule.protocol}`);
      setNewRule({ action: 'allow', port: '', protocol: 'tcp', from: '', comment: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add rule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRule = async (ruleNum) => {
    if (!confirm(`Delete rule #${ruleNum}?`)) return;
    try {
      await axios.delete(`/api/firewall/ufw/rule/${ruleNum}`);
      setSuccess(`Rule #${ruleNum} deleted`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const ufwEnabled = ufwStatus.toLowerCase().includes('status: active');

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Firewall"
            subtitle="UFW & iptables management"
            onRefresh={fetchData}
            loading={loading}
          />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error || success}
            </div>
          )}

          {/* UFW status banner */}
          <div className="card mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${ufwEnabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div>
                  <span className="font-medium text-white">UFW Firewall</span>
                  <span className={`ml-2 badge ${ufwEnabled ? 'badge-green' : 'badge-red'}`}>
                    {ufwEnabled ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUfwToggle(true)}
                  disabled={ufwEnabled || actionLoading}
                  className="btn-primary text-sm py-1.5 disabled:opacity-50"
                >
                  Enable
                </button>
                <button
                  onClick={() => handleUfwToggle(false)}
                  disabled={!ufwEnabled || actionLoading}
                  className="btn-danger text-sm py-1.5 disabled:opacity-50"
                >
                  Disable
                </button>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-400">
              <strong>Warning:</strong> Incorrect firewall rules can lock you out of the server.
              Always ensure SSH (port 22) is allowed before enabling UFW.
            </p>
          </div>

          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[
              { id: 'ufw', label: 'UFW Rules' },
              { id: 'add', label: 'Add Rule' },
              { id: 'iptables', label: 'iptables' },
              { id: 'connections', label: 'Connections' },
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

          {activeTab === 'ufw' && (
            <div className="card">
              <div className="card-header">UFW Rules</div>
              <pre className="terminal overflow-auto max-h-96 text-xs">{ufwStatus || 'UFW not available or no rules configured'}</pre>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="card">
              <div className="card-header">Add UFW Rule</div>
              <form onSubmit={handleAddRule} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Action *</label>
                    <select value={newRule.action} onChange={e => setNewRule(p => ({ ...p, action: e.target.value }))} className="input-field">
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                      <option value="reject">Reject</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Port *</label>
                    <input
                      type="text"
                      value={newRule.port}
                      onChange={e => setNewRule(p => ({ ...p, port: e.target.value }))}
                      placeholder="80 or 8080:9000"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Protocol</label>
                    <select value={newRule.protocol} onChange={e => setNewRule(p => ({ ...p, protocol: e.target.value }))} className="input-field">
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">From IP (optional)</label>
                    <input
                      type="text"
                      value={newRule.from}
                      onChange={e => setNewRule(p => ({ ...p, from: e.target.value }))}
                      placeholder="192.168.1.0/24"
                      className="input-field"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Comment (optional)</label>
                    <input
                      type="text"
                      value={newRule.comment}
                      onChange={e => setNewRule(p => ({ ...p, comment: e.target.value }))}
                      placeholder="Rule description"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="bg-dark-800 rounded-lg p-3 text-sm text-gray-400 font-mono">
                  ufw {newRule.action} {newRule.from ? `from ${newRule.from} to any ` : ''}port {newRule.port || '?'}/{newRule.protocol}
                </div>
                <button type="submit" disabled={actionLoading} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {actionLoading ? 'Adding...' : 'Add Rule'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'iptables' && (
            <div className="card">
              <div className="card-header">iptables Rules</div>
              <pre className="terminal overflow-auto max-h-96 text-xs">{iptablesRules || 'iptables not available'}</pre>
            </div>
          )}

          {activeTab === 'connections' && (
            <div className="card">
              <div className="card-header">Active Network Connections</div>
              <pre className="terminal overflow-auto max-h-96 text-xs">{connections || 'No connections data'}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
