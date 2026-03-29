import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Globe, Wifi, Activity, Search, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MAX_BW_POINTS = 30;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatBytesPerSec(bps) {
  return formatBytes(bps) + '/s';
}

const TOOLS = [
  { id: 'ping', label: 'Ping' },
  { id: 'traceroute', label: 'Traceroute' },
  { id: 'dns', label: 'DNS Lookup' },
];

const DNS_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];

export default function NetworkPage() {
  const [activeTab, setActiveTab] = useState('diagnostics');

  // Diagnostics
  const [host, setHost] = useState('');
  const [tool, setTool] = useState('ping');
  const [dnsType, setDnsType] = useState('A');
  const [diagOutput, setDiagOutput] = useState('');
  const [diagRunning, setDiagRunning] = useState(false);

  // Interfaces
  const [interfaces, setInterfaces] = useState([]);
  const [ifaceLoading, setIfaceLoading] = useState(false);

  // Ports
  const [ports, setPorts] = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portFilter, setPortFilter] = useState('');

  // Bandwidth
  const [bwData, setBwData] = useState([]);
  const bwRef = useRef([]);
  const bwPollRef = useRef(null);

  const fetchInterfaces = useCallback(async () => {
    setIfaceLoading(true);
    try {
      const res = await axios.get('/api/network/interfaces');
      setInterfaces(res.data.interfaces || []);
    } catch (err) {
      console.error('Failed to fetch interfaces:', err);
    } finally {
      setIfaceLoading(false);
    }
  }, []);

  const fetchPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      const res = await axios.get('/api/network/ports');
      setPorts(res.data.ports || []);
    } catch (err) {
      console.error('Failed to fetch ports:', err);
    } finally {
      setPortsLoading(false);
    }
  }, []);

  const fetchBandwidth = useCallback(async () => {
    try {
      const res = await axios.get('/api/network/bandwidth');
      const point = { time: new Date().toLocaleTimeString() };
      for (const iface of (res.data.bandwidth || [])) {
        point[`${iface.iface}_rx`] = iface.rxSec;
        point[`${iface.iface}_tx`] = iface.txSec;
      }
      bwRef.current = [...bwRef.current.slice(-MAX_BW_POINTS + 1), point];
      setBwData([...bwRef.current]);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (activeTab === 'interfaces') {
      fetchInterfaces();
    } else if (activeTab === 'ports') {
      fetchPorts();
    }
  }, [activeTab]);

  // Start bandwidth polling
  useEffect(() => {
    fetchBandwidth();
    bwPollRef.current = setInterval(fetchBandwidth, 2000);
    return () => clearInterval(bwPollRef.current);
  }, []);

  const handleDiagnostic = async (e) => {
    e.preventDefault();
    if (!host.trim()) return;
    setDiagRunning(true);
    setDiagOutput('Running...');
    try {
      let res;
      if (tool === 'ping') {
        res = await axios.post('/api/network/ping', { host: host.trim() });
      } else if (tool === 'traceroute') {
        res = await axios.post('/api/network/traceroute', { host: host.trim() });
      } else if (tool === 'dns') {
        res = await axios.post('/api/network/dns', { host: host.trim(), type: dnsType });
      }
      setDiagOutput(res.data.output || 'No output');
    } catch (err) {
      setDiagOutput(`Error: ${err.response?.data?.error || 'Request failed'}`);
    } finally {
      setDiagRunning(false);
    }
  };

  // Get unique interface names for bandwidth chart
  const bwIfaceNames = bwData.length > 0
    ? [...new Set(
        Object.keys(bwData[bwData.length - 1] || {})
          .filter(k => k.endsWith('_rx'))
          .map(k => k.replace('_rx', ''))
      )]
    : [];

  const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const filteredPorts = ports.filter(p => {
    if (!portFilter) return true;
    const f = portFilter.toLowerCase();
    return (
      String(p.port).includes(f) ||
      (p.proto || '').toLowerCase().includes(f) ||
      (p.process || '').toLowerCase().includes(f) ||
      (p.localAddr || '').includes(f)
    );
  });

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="Network" subtitle="Diagnostics, interfaces, and ports" />

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[
              { id: 'diagnostics', label: 'Diagnostics', icon: Globe },
              { id: 'interfaces', label: 'Interfaces', icon: Wifi },
              { id: 'ports', label: 'Open Ports', icon: Network },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Diagnostics Tab */}
          {activeTab === 'diagnostics' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                <div className="card">
                  <form onSubmit={handleDiagnostic} className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Host / IP</label>
                      <input
                        type="text"
                        value={host}
                        onChange={e => setHost(e.target.value)}
                        placeholder="google.com or 8.8.8.8"
                        className="input-field"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tool</label>
                      <div className="grid grid-cols-3 gap-1">
                        {TOOLS.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTool(t.id)}
                            className={`py-1.5 text-xs rounded-lg border transition-colors ${tool === t.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-gray-200'}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {tool === 'dns' && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Record Type</label>
                        <select value={dnsType} onChange={e => setDnsType(e.target.value)} className="input-field text-sm">
                          {DNS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    )}
                    <button type="submit" disabled={diagRunning} className="btn-primary w-full">
                      {diagRunning ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                      {diagRunning ? 'Running...' : 'Run'}
                    </button>
                  </form>
                </div>

                {/* Bandwidth chart */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      Bandwidth
                    </h3>
                    <span className="text-xs text-gray-500">Live (2s)</span>
                  </div>
                  {bwData.length < 2 ? (
                    <div className="text-center py-6 text-gray-600 text-xs">Collecting data...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={bwData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" hide />
                        <YAxis tickFormatter={v => formatBytesPerSec(v)} width={60} tick={{ fontSize: 9, fill: '#6b7280' }} />
                        <Tooltip
                          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '11px' }}
                          formatter={(v, name) => [formatBytesPerSec(v), name]}
                        />
                        {bwIfaceNames.map((iface, i) => (
                          <React.Fragment key={iface}>
                            <Area type="monotone" dataKey={`${iface}_rx`} name={`${iface} RX`} stroke={chartColors[i % chartColors.length]} fill={chartColors[i % chartColors.length]} fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                            <Area type="monotone" dataKey={`${iface}_tx`} name={`${iface} TX`} stroke={chartColors[(i + 1) % chartColors.length]} fill={chartColors[(i + 1) % chartColors.length]} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                          </React.Fragment>
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="card h-full">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-300">Output</h3>
                    {diagOutput && diagOutput !== 'Running...' && (
                      <button onClick={() => setDiagOutput('')} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
                    )}
                  </div>
                  <div
                    className="bg-gray-950 rounded-lg p-4 overflow-auto font-mono text-xs leading-relaxed text-green-300"
                    style={{ minHeight: '400px', maxHeight: '70vh' }}
                  >
                    {diagOutput || (
                      <div className="flex items-center justify-center h-full text-gray-600 min-h-32">
                        <div className="text-center">
                          <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>Enter a host and run a diagnostic</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interfaces Tab */}
          {activeTab === 'interfaces' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchInterfaces} disabled={ifaceLoading} className="btn-primary text-sm py-2">
                  {ifaceLoading ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                  Refresh
                </button>
              </div>

              {ifaceLoading ? (
                <div className="text-center py-12 text-gray-500">Loading interfaces...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {interfaces.map((iface) => (
                    <div key={iface.iface} className={`card border ${iface.operstate === 'up' ? 'border-green-500/20' : 'border-dark-600'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${iface.operstate === 'up' ? 'bg-green-400' : 'bg-gray-600'}`} />
                          <span className="font-mono font-semibold text-white text-sm">{iface.iface}</span>
                          {iface.internal && <span className="text-xs text-gray-500">(loopback)</span>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {iface.speed > 0 && <span className="text-xs text-gray-500">{iface.speed} Mbps</span>}
                          <span className={`text-xs ${iface.operstate === 'up' ? 'text-green-400' : 'text-gray-500'}`}>{iface.operstate}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {iface.ip4 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">IPv4:</span>
                            <span className="font-mono text-gray-200">{iface.ip4}</span>
                          </div>
                        )}
                        {iface.ip6 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">IPv6:</span>
                            <span className="font-mono text-gray-400 text-xs truncate max-w-xs">{iface.ip6}</span>
                          </div>
                        )}
                        {iface.mac && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">MAC:</span>
                            <span className="font-mono text-gray-400">{iface.mac}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-dark-600">
                          <span className="text-gray-500">RX / TX:</span>
                          <span className="text-gray-400">
                            {formatBytes(iface.rxBytes)} / {formatBytes(iface.txBytes)}
                          </span>
                        </div>
                        {(iface.rxSec > 0 || iface.txSec > 0) && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Speed:</span>
                            <span className="text-gray-400">
                              ↓{formatBytesPerSec(iface.rxSec)} ↑{formatBytesPerSec(iface.txSec)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {interfaces.length === 0 && !ifaceLoading && (
                    <div className="col-span-2 text-center py-12 text-gray-500">
                      <Wifi className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      No interfaces found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Open Ports Tab */}
          {activeTab === 'ports' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={portFilter}
                    onChange={e => setPortFilter(e.target.value)}
                    placeholder="Filter by port, protocol, process..."
                    className="input-field pl-9"
                  />
                </div>
                <button onClick={fetchPorts} disabled={portsLoading} className="btn-primary text-sm py-2">
                  {portsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                  Refresh
                </button>
              </div>

              {portsLoading ? (
                <div className="text-center py-12 text-gray-500">Loading ports...</div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Protocol</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Port</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Address</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">State</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Process</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">PID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPorts
                          .sort((a, b) => a.port - b.port)
                          .map((port, i) => (
                            <tr key={`${port.proto}-${port.port}-${i}`} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                              <td className="px-4 py-2.5 text-xs">
                                <span className={`badge ${port.proto === 'tcp' ? 'badge-blue' : 'badge-green'}`}>
                                  {port.proto?.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-mono font-bold text-white">{port.port}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{port.localAddr}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{port.state}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-300">{port.process || '—'}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{port.pid || '—'}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                    {filteredPorts.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <Network className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        {ports.length === 0 ? 'No open ports found' : 'No ports match filter'}
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-2 border-t border-dark-600 text-xs text-gray-600">
                    {filteredPorts.length} listening ports
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
