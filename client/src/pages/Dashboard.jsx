import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cpu, MemoryStick, HardDrive, Network, Activity,
  Server, Clock, Layers, TrendingUp, Wifi,
  AlertTriangle, CheckCircle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import StatCard from '../components/StatCard.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MAX_HISTORY = 30;

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  if (!seconds) return 'Unknown';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}%</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { token } = useAuth();
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const historyRef = useRef([]);

  const fetchOverview = useCallback(async () => {
    try {
      const [overviewRes, statsRes] = await Promise.all([
        axios.get('/api/system/overview'),
        axios.get('/api/system/stats'),
      ]);
      setOverview(overviewRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch system data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket for real-time stats
  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname;
    const wsPort = import.meta.env.DEV ? '3001' : window.location.port;
    const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws?token=${token}`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 5000); // Reconnect after 5s
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'stats') {
            const point = {
              time: new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              cpu: msg.payload.cpu,
              memory: msg.payload.memory,
            };

            historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), point];
            setHistory([...historyRef.current]);

            setStats(prev => prev ? {
              ...prev,
              cpu: { ...prev.cpu, usage: msg.payload.cpu },
              memory: { ...prev.memory, usedPercent: msg.payload.memory },
            } : prev);
          }
        } catch (_) {}
      };
    };

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [token]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="flex h-screen bg-dark-900">
        <Sidebar />
        <main className="flex-1 lg:ml-64 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Loading system data...</p>
          </div>
        </main>
      </div>
    );
  }

  const os = overview?.os;
  const cpu = overview?.cpu;
  const memory = stats?.memory;
  const disk = stats?.disk?.[0];
  const processes = stats?.processes;

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />

      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Dashboard"
            subtitle={os ? `${os.distro} ${os.release} · ${os.hostname}` : 'Loading...'}
            onRefresh={fetchOverview}
            loading={loading}
          />

          {/* Connection status */}
          <div className="flex items-center gap-2 mb-6">
            {wsConnected ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live monitoring active
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                Connecting to live feed...
              </div>
            )}
          </div>

          {/* System info banner */}
          {os && cpu && (
            <div className="bg-dark-700 border border-dark-600 rounded-xl p-4 mb-6 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="text-xs text-gray-500">Hostname</div>
                  <div className="text-sm font-mono text-white">{os.hostname}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-xs text-gray-500">OS</div>
                  <div className="text-sm font-mono text-white">{os.distro} {os.release}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="text-xs text-gray-500">Kernel</div>
                  <div className="text-sm font-mono text-white">{os.kernel}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <div>
                  <div className="text-xs text-gray-500">Uptime</div>
                  <div className="text-sm font-mono text-white">{formatUptime(overview?.uptime?.seconds)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-green-400" />
                <div>
                  <div className="text-xs text-gray-500">CPU</div>
                  <div className="text-sm font-mono text-white">{cpu.brand} ({cpu.cores}c)</div>
                </div>
              </div>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="CPU Usage"
              value={`${stats?.cpu?.usage?.toFixed(1) || 0}%`}
              percent={stats?.cpu?.usage || 0}
              icon={Cpu}
              subtitle={cpu ? `${cpu.cores} cores @ ${cpu.speed} GHz` : ''}
            />
            <StatCard
              title="Memory"
              value={formatBytes(memory?.used)}
              percent={memory?.usedPercent || 0}
              icon={MemoryStick}
              subtitle={`of ${formatBytes(memory?.total)}`}
            />
            <StatCard
              title="Disk Usage"
              value={formatBytes(disk?.used)}
              percent={disk?.usedPercent || 0}
              icon={HardDrive}
              subtitle={disk ? `${disk.mount} · ${formatBytes(disk?.size)} total` : 'No disk data'}
            />
            <StatCard
              title="Processes"
              value={processes?.all || 0}
              icon={Activity}
              subtitle={`${processes?.running || 0} running · ${processes?.sleeping || 0} sleeping`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            {/* CPU & Memory chart */}
            <div className="card">
              <div className="card-header">CPU & Memory History</div>
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2540" />
                    <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="memory" name="Memory" stroke="#10b981" fill="url(#memGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
                  <div className="text-center">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Collecting data...
                  </div>
                </div>
              )}
            </div>

            {/* Disk & Network */}
            <div className="grid grid-rows-2 gap-4">
              {/* Disk breakdown */}
              <div className="card">
                <div className="card-header">Disk Partitions</div>
                <div className="space-y-2">
                  {stats?.disk?.slice(0, 3).map((d, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400 font-mono">{d.mount}</span>
                        <span className="text-gray-500">{formatBytes(d.used)} / {formatBytes(d.size)}</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className={`progress-bar-fill ${d.usedPercent >= 90 ? 'bg-red-500' : d.usedPercent >= 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                          style={{ width: `${d.usedPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Network interfaces */}
              <div className="card">
                <div className="card-header">Network</div>
                <div className="space-y-2">
                  {overview?.network?.slice(0, 2).map((n, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-sm text-gray-300 font-mono">{n.iface}</span>
                      </div>
                      <div className="text-xs text-gray-500 font-mono">{n.ip4}</div>
                    </div>
                  ))}
                  {stats?.network?.slice(0, 2).map((n, i) => (
                    <div key={i} className="flex items-center gap-4 text-xs text-gray-500 font-mono pl-5">
                      <span className="text-emerald-400">↓ {formatBytes(n.rxSec)}/s</span>
                      <span className="text-blue-400">↑ {formatBytes(n.txSec)}/s</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CPU Cores */}
          {stats?.cpu?.cores && stats.cpu.cores.length > 0 && (
            <div className="card">
              <div className="card-header">CPU Cores ({stats.cpu.cores.length} threads)</div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {stats.cpu.cores.map((usage, i) => {
                  const color = usage >= 90 ? 'bg-red-500' : usage >= 70 ? 'bg-yellow-500' : 'bg-blue-500';
                  return (
                    <div key={i} className="text-center">
                      <div className="text-xs text-gray-500 mb-1">C{i}</div>
                      <div className="h-12 bg-dark-600 rounded relative overflow-hidden">
                        <div
                          className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${color}`}
                          style={{ height: `${usage}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1 font-mono">{usage}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
