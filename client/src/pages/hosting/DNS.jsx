import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Search, X, AlertTriangle, CheckCircle, Globe } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'PTR'];

export default function DNS() {
  const [zones, setZones] = useState([]);
  const [bindStatus, setBindStatus] = useState('unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [newZoneDomain, setNewZoneDomain] = useState('');
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneRecords, setZoneRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [newRecord, setNewRecord] = useState({ name: '@', type: 'A', value: '', ttl: '3600', priority: '10' });
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupType, setLookupType] = useState('A');
  const [lookupResults, setLookupResults] = useState(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);

  const notify = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const loadZones = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/hosting/dns/zones');
      setZones(res.data.zones || []);
      setBindStatus(res.data.bindStatus);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load DNS zones');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadZones(); }, []);

  const loadZoneRecords = async (domain) => {
    setLoadingRecords(true);
    setSelectedZone(domain);
    try {
      const res = await axios.get(`/api/hosting/dns/zones/${encodeURIComponent(domain)}/records`);
      setZoneRecords(res.data.records || []);
    } catch (err) { notify(err.response?.data?.error || 'Failed to load records', true); }
    finally { setLoadingRecords(false); }
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/hosting/dns/zones', { domain: newZoneDomain });
      notify(`Zone for ${newZoneDomain} created`);
      setShowCreateZone(false);
      setNewZoneDomain('');
      loadZones();
    } catch (err) { notify(err.response?.data?.error || 'Failed to create zone', true); }
    finally { setSaving(false); }
  };

  const handleDeleteZone = async (domain) => {
    if (!confirm(`Delete DNS zone for ${domain}? This will remove the zone file.`)) return;
    try {
      await axios.delete(`/api/hosting/dns/zones/${encodeURIComponent(domain)}`);
      notify(`Zone ${domain} deleted`);
      if (selectedZone === domain) { setSelectedZone(null); setZoneRecords([]); }
      loadZones();
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`/api/hosting/dns/zones/${encodeURIComponent(selectedZone)}/records`, newRecord);
      notify('DNS record added');
      setShowAddRecord(false);
      setNewRecord({ name: '@', type: 'A', value: '', ttl: '3600', priority: '10' });
      loadZoneRecords(selectedZone);
    } catch (err) { notify(err.response?.data?.error || 'Failed to add record', true); }
    finally { setSaving(false); }
  };

  const handleDeleteRecord = async (record) => {
    if (!confirm(`Delete ${record.type} record for ${record.name}?`)) return;
    try {
      await axios.delete(`/api/hosting/dns/zones/${encodeURIComponent(selectedZone)}/records`, {
        data: { name: record.name, type: record.type, value: record.value },
      });
      notify('Record deleted');
      loadZoneRecords(selectedZone);
    } catch (err) { notify(err.response?.data?.error || 'Delete failed', true); }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!lookupDomain) return;
    setLooking(true);
    setLookupResults(null);
    try {
      const res = await axios.post('/api/hosting/dns/lookup', { domain: lookupDomain, type: lookupType });
      setLookupResults(res.data);
    } catch (err) { notify(err.response?.data?.error || 'Lookup failed', true); }
    finally { setLooking(false); }
  };

  const getTypeColor = (type) => {
    const colors = { A: 'badge-blue', AAAA: 'badge-blue', CNAME: 'badge-yellow', MX: 'badge-green', TXT: 'badge-gray', NS: 'badge-gray' };
    return colors[type] || 'badge-gray';
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="DNS Manager" subtitle={`BIND9 status: ${bindStatus}`} onRefresh={loadZones} loading={loading} />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-dark-800 p-1 rounded-lg w-fit">
            {['DNS Zones', 'DNS Lookup'].map((t, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === i ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* DNS Zones tab */}
          {tab === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Zones list */}
              <div className="card lg:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-400">{zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setShowCreateZone(!showCreateZone)} className="btn-primary text-xs py-1 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />New Zone
                  </button>
                </div>

                {showCreateZone && (
                  <form onSubmit={handleCreateZone} className="bg-dark-800 rounded-lg p-3 mb-3 flex flex-col gap-2">
                    <input
                      value={newZoneDomain}
                      onChange={e => setNewZoneDomain(e.target.value)}
                      placeholder="example.com"
                      className="input-field text-sm"
                      required
                    />
                    <div className="flex gap-2">
                      <button type="submit" disabled={saving} className="btn-primary text-xs py-1 flex-1">
                        {saving ? 'Creating...' : 'Create Zone'}
                      </button>
                      <button type="button" onClick={() => setShowCreateZone(false)} className="btn-ghost text-xs py-1">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loading ? (
                  <div className="text-center py-6 text-gray-500 text-sm">Loading...</div>
                ) : zones.length === 0 ? (
                  <div className="text-center py-8">
                    <Network className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">
                      {bindStatus === 'not-installed' ? 'BIND9 not installed' : 'No zones configured'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {zones.map((z, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedZone === z.domain ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-dark-600'}`}
                        onClick={() => loadZoneRecords(z.domain)}
                      >
                        <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="text-sm font-mono text-gray-200 flex-1 truncate">{z.domain}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteZone(z.domain); }}
                          className="p-1 text-red-500 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete zone"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zone records */}
              <div className="card lg:col-span-2">
                {selectedZone ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-sm font-medium text-gray-200">Zone: </span>
                        <span className="text-sm font-mono text-blue-400">{selectedZone}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowAddRecord(!showAddRecord)}
                          className="btn-primary text-xs py-1 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />Add Record
                        </button>
                        <button
                          onClick={() => handleDeleteZone(selectedZone)}
                          className="btn-ghost text-xs py-1 text-red-400"
                        >
                          Delete Zone
                        </button>
                      </div>
                    </div>

                    {showAddRecord && (
                      <form onSubmit={handleAddRecord} className="bg-dark-800 rounded-lg p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <input
                            value={newRecord.name}
                            onChange={e => setNewRecord(p => ({ ...p, name: e.target.value }))}
                            placeholder="@"
                            className="input-field text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Type</label>
                          <select
                            value={newRecord.type}
                            onChange={e => setNewRecord(p => ({ ...p, type: e.target.value }))}
                            className="input-field text-xs"
                          >
                            {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Value</label>
                          <input
                            value={newRecord.value}
                            onChange={e => setNewRecord(p => ({ ...p, value: e.target.value }))}
                            placeholder="e.g. 192.168.1.1 or target.example.com"
                            className="input-field text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">TTL</label>
                          <input
                            value={newRecord.ttl}
                            onChange={e => setNewRecord(p => ({ ...p, ttl: e.target.value }))}
                            placeholder="3600"
                            className="input-field text-xs"
                          />
                        </div>
                        {newRecord.type === 'MX' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Priority</label>
                            <input
                              value={newRecord.priority}
                              onChange={e => setNewRecord(p => ({ ...p, priority: e.target.value }))}
                              placeholder="10"
                              className="input-field text-xs"
                            />
                          </div>
                        )}
                        <div className="col-span-2 sm:col-span-4 flex gap-2">
                          <button type="submit" disabled={saving} className="btn-primary text-xs py-1">
                            {saving ? 'Adding...' : 'Add Record'}
                          </button>
                          <button type="button" onClick={() => setShowAddRecord(false)} className="btn-ghost text-xs py-1">Cancel</button>
                        </div>
                      </form>
                    )}

                    {loadingRecords ? (
                      <div className="text-center py-6 text-gray-500 text-sm">Loading records...</div>
                    ) : zoneRecords.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-6">No records parsed — zone file may use complex formatting</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-dark-600">
                              <th className="text-left py-2 px-2 text-gray-500 font-medium">Name</th>
                              <th className="text-left py-2 px-2 text-gray-500 font-medium">TTL</th>
                              <th className="text-left py-2 px-2 text-gray-500 font-medium">Type</th>
                              <th className="text-left py-2 px-2 text-gray-500 font-medium">Value</th>
                              <th className="py-2 px-2 text-right"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {zoneRecords.map((r, i) => (
                              <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30">
                                <td className="py-1.5 px-2 font-mono text-gray-300">{r.name}</td>
                                <td className="py-1.5 px-2 text-gray-500">{r.ttl}</td>
                                <td className="py-1.5 px-2">
                                  <span className={`badge ${getTypeColor(r.type)}`}>{r.type}</span>
                                </td>
                                <td className="py-1.5 px-2 font-mono text-gray-300 max-w-xs truncate" title={r.value}>{r.value}</td>
                                <td className="py-1.5 px-2 text-right">
                                  <button
                                    onClick={() => handleDeleteRecord(r)}
                                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Network className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Select a zone to view records</p>
                    {bindStatus === 'not-installed' && (
                      <p className="text-gray-600 text-xs mt-1">BIND9/named is not installed on this system</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DNS Lookup tab */}
          {tab === 1 && (
            <div className="card max-w-2xl">
              <div className="card-header mb-4">DNS Lookup Tool</div>
              <form onSubmit={handleLookup} className="flex gap-2 mb-4 flex-wrap">
                <input
                  value={lookupDomain}
                  onChange={e => setLookupDomain(e.target.value)}
                  placeholder="example.com"
                  className="input-field text-sm flex-1 min-w-48"
                />
                <select
                  value={lookupType}
                  onChange={e => setLookupType(e.target.value)}
                  className="input-field text-sm w-24"
                >
                  {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="submit" disabled={looking} className="btn-primary text-sm flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  {looking ? 'Looking up...' : 'Lookup'}
                </button>
              </form>

              {lookupResults && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Results for</span>
                    <span className="font-mono text-blue-400">{lookupResults.domain}</span>
                    <span className={`badge ${getTypeColor(lookupResults.type)}`}>{lookupResults.type}</span>
                  </div>
                  {Object.entries(lookupResults.results || {}).map(([source, result]) => (
                    <div key={source} className="bg-dark-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs font-medium text-gray-300 capitalize">{source} DNS</span>
                        {source === 'google' && <span className="text-xs text-gray-600">(8.8.8.8)</span>}
                        {source === 'cloudflare' && <span className="text-xs text-gray-600">(1.1.1.1)</span>}
                      </div>
                      <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">{result || 'No result'}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
