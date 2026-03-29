import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function cpuColor(cpu) {
  if (cpu > 50) return 'text-red-400';
  if (cpu > 20) return 'text-yellow-400';
  return 'text-gray-300';
}

function stateColor(state) {
  const s = (state || '').toLowerCase();
  if (s === 'running' || s === 'r') return 'text-green-400';
  if (s === 'sleeping' || s === 's') return 'text-blue-400';
  if (s === 'zombie' || s === 'z') return 'text-red-400';
  if (s === 'stopped' || s === 't') return 'text-yellow-400';
  return 'text-gray-400';
}

const NICE_PRESETS = [-5, 0, 5];

export default function Processes() {
  const { user } = useAuth();
  const [processes, setProcesses] = useState([]);
  const [stats, setStats] = useState({ total: 0, running: 0, sleeping: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('cpu');
  const [sortDir, setSortDir] = useState('desc');
  const [actionOutput, setActionOutput] = useState('');
  const [actionType, setActionType] = useState('info');
  const [reniceModal, setReniceModal] = useState(null);
  const [reniceValue, setReniceValue] = useState(0);
  const pollingRef = useRef(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await axios.get('/api/processes');
      setProcesses(res.data.processes || []);
      setStats({
        total: res.data.total || 0,
        running: res.data.running || 0,
        sleeping: res.data.sleeping || 0,
      });
      if (loading) setLoading(false);
    } catch (err) {
      if (loading) setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    fetchProcesses();
    pollingRef.current = setInterval(fetchProcesses, 3000);
    return () => clearInterval(pollingRef.current);
  }, []);

  const handleKill = async (pid, e) => {
    const signal = e.shiftKey ? 'SIGKILL' : 'SIGTERM';
    try {
      await axios.post(`/api/processes/${pid}/kill`, { signal });
      setActionOutput(`Sent ${signal} to PID ${pid}`);
      setActionType('success');
      setTimeout(fetchProcesses, 500);
    } catch (err) {
      setActionOutput(`Error: ${err.response?.data?.error || 'Kill failed'}`);
      setActionType('error');
    }
  };

  const handleRenice = async (pid, nice) => {
    try {
      await axios.post(`/api/processes/${pid}/renice`, { nice });
      setActionOutput(`Reniced PID ${pid} to nice=${nice}`);
      setActionType('success');
      setReniceModal(null);
      setTimeout(fetchProcesses, 500);
    } catch (err) {
      setActionOutput(`Error: ${err.response?.data?.error || 'Renice failed'}`);
      setActionType('error');
      setReniceModal(null);
    }
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const filtered = processes
    .filter(p => {
      if (!filter) return true;
      const f = filter.toLowerCase();
      return (
        String(p.pid).includes(f) ||
        (p.name || '').toLowerCase().includes(f) ||
        (p.user || '').toLowerCase().includes(f) ||
        (p.command || '').toLowerCase().includes(f)
      );
    })
    .sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (sortDir === 'desc') return bv > av ? 1 : bv < av ? -1 : 0;
      return av > bv ? 1 : av < bv ? -1 : 0;
    });

  const SortHeader = ({ col, children }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`text-left px-3 py-3 text-xs font-medium cursor-pointer select-none whitespace-nowrap hover:text-gray-200 transition-colors ${sortBy === col ? 'text-blue-400' : 'text-gray-400'}`}
    >
      {children} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Process Manager"
            subtitle="Live process monitor (auto-refreshes every 3s)"
            onRefresh={fetchProcesses}
            loading={loading}
          />

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card py-3">
              <p className="text-xs text-gray-500 mb-0.5">Total</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-500 mb-0.5">Running</p>
              <p className="text-xl font-bold text-green-400">{stats.running}</p>
            </div>
            <div className="card py-3">
              <p className="text-xs text-gray-500 mb-0.5">Sleeping</p>
              <p className="text-xl font-bold text-blue-400">{stats.sleeping}</p>
            </div>
          </div>

          {actionOutput && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${actionType === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {actionOutput}
              <button onClick={() => setActionOutput('')} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Filter */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by PID, name, user, command..."
              className="input-field pl-9"
            />
          </div>

          <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />
            Hold <kbd className="bg-dark-600 border border-dark-500 rounded px-1 py-0.5 text-gray-300">Shift</kbd> + click Kill for SIGKILL (force kill)
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading processes...</div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-dark-800">
                    <tr className="border-b border-dark-600">
                      <SortHeader col="pid">PID</SortHeader>
                      <SortHeader col="name">Name</SortHeader>
                      <SortHeader col="user">User</SortHeader>
                      <SortHeader col="cpu">CPU%</SortHeader>
                      <SortHeader col="mem">MEM%</SortHeader>
                      <SortHeader col="state">State</SortHeader>
                      <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Command</th>
                      <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((proc) => (
                      <tr key={proc.pid} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{proc.pid}</td>
                        <td className="px-3 py-2 text-xs text-gray-200 max-w-xs">
                          <span className="font-medium truncate block">{proc.name}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">{proc.user}</td>
                        <td className={`px-3 py-2 text-xs font-mono font-medium ${cpuColor(proc.cpu)}`}>
                          {proc.cpu.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-gray-300">
                          {proc.mem.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2 text-xs ${stateColor(proc.state)}`}>
                          {proc.state}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-xs">
                          <span className="font-mono truncate block">{proc.command}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => handleKill(proc.pid, e)}
                              className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors border border-red-500/20"
                              title="Click: SIGTERM | Shift+Click: SIGKILL"
                            >
                              Kill
                            </button>
                            <button
                              onClick={() => { setReniceModal(proc); setReniceValue(proc.nice || 0); }}
                              className="px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors border border-yellow-500/20"
                              title="Change priority"
                            >
                              Nice
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No processes match your filter
                  </div>
                )}
              </div>
              <div className="px-4 py-2 border-t border-dark-600 text-xs text-gray-600">
                Showing {filtered.length} of {processes.length} processes
              </div>
            </div>
          )}

          {/* Renice Modal */}
          {reniceModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="card max-w-sm w-full mx-4">
                <h3 className="text-base font-semibold text-white mb-1">Renice Process</h3>
                <p className="text-sm text-gray-400 mb-4">
                  PID <span className="font-mono text-blue-400">{reniceModal.pid}</span> — {reniceModal.name}
                </p>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-2">Nice Value (−20 highest, +19 lowest priority)</label>
                  <div className="flex gap-2 mb-2">
                    {NICE_PRESETS.map(n => (
                      <button
                        key={n}
                        onClick={() => setReniceValue(n)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${reniceValue === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-gray-200'}`}
                      >
                        {n > 0 ? `+${n}` : n}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={19}
                    value={reniceValue}
                    onChange={e => setReniceValue(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-center text-sm text-gray-300 mt-1">Nice: {reniceValue}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleRenice(reniceModal.pid, reniceValue)} className="btn-primary">Apply</button>
                  <button onClick={() => setReniceModal(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-dark-600 rounded-lg transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
