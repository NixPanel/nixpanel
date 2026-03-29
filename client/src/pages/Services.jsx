import React, { useState, useEffect } from 'react';
import { Server, Play, Square, RotateCcw, Search, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

const statusColors = {
  active: 'badge-green',
  running: 'badge-green',
  inactive: 'badge-gray',
  failed: 'badge-red',
  dead: 'badge-gray',
  exited: 'badge-yellow',
};

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState({});
  const [expandedService, setExpandedService] = useState(null);
  const [serviceLogs, setServiceLogs] = useState({});
  const [output, setOutput] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/services');
      setServices(res.data.services || []);
    } catch (err) {
      console.error('Failed to fetch services:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const handleAction = async (serviceName, action) => {
    const key = `${serviceName}-${action}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    setOutput('');

    try {
      const res = await axios.post(`/api/services/${serviceName}/${action}`);
      setOutput(`✓ ${action} ${serviceName}: ${res.data.output || 'Success'}`);
      setTimeout(fetchServices, 1000);
    } catch (err) {
      setOutput(`✗ Error: ${err.response?.data?.error || `${action} failed`}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const fetchLogs = async (serviceName) => {
    try {
      const res = await axios.get(`/api/services/${serviceName}/logs?lines=50`);
      setServiceLogs(prev => ({ ...prev, [serviceName]: res.data.logs }));
    } catch (err) {
      setServiceLogs(prev => ({ ...prev, [serviceName]: 'Failed to load logs' }));
    }
  };

  const toggleExpand = (name) => {
    if (expandedService === name) {
      setExpandedService(null);
    } else {
      setExpandedService(name);
      if (!serviceLogs[name]) fetchLogs(name);
    }
  };

  const filtered = services.filter(s => {
    const matchName = !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.description?.toLowerCase().includes(filter.toLowerCase());
    const matchStatus = filterStatus === 'all' || s.active === filterStatus;
    return matchName && matchStatus;
  });

  const isLoading = (name, action) => actionLoading[`${name}-${action}`];

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Services"
            subtitle={`${services.length} services · ${services.filter(s => s.active === 'active').length} active`}
            onRefresh={fetchServices}
            loading={loading}
          />

          {output && (
            <pre className={`terminal mb-4 text-sm ${output.startsWith('✗') ? 'text-red-400' : 'text-green-400'}`}>
              {output}
            </pre>
          )}

          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter services..."
                className="input-field pl-9"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input-field w-40"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading services...</div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((svc) => (
                <div key={svc.name} className="bg-dark-700 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      svc.active === 'active' ? 'bg-emerald-400' :
                      svc.active === 'failed' ? 'bg-red-400 animate-pulse' :
                      'bg-gray-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white text-sm">{svc.name}</span>
                        <span className={`badge ${statusColors[svc.active] || 'badge-gray'}`}>
                          {svc.sub || svc.active}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{svc.description}</p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleAction(svc.name, 'start')}
                        disabled={isLoading(svc.name, 'start') || svc.active === 'active'}
                        className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded disabled:opacity-30 transition-colors"
                        title="Start"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAction(svc.name, 'stop')}
                        disabled={isLoading(svc.name, 'stop') || svc.active !== 'active'}
                        className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded disabled:opacity-30 transition-colors"
                        title="Stop"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAction(svc.name, 'restart')}
                        disabled={isLoading(svc.name, 'restart')}
                        className="p-1.5 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded disabled:opacity-30 transition-colors"
                        title="Restart"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${isLoading(svc.name, 'restart') ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => toggleExpand(svc.name)}
                        className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-dark-500 rounded transition-colors"
                        title="View logs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expandedService === svc.name && (
                    <div className="border-t border-dark-600">
                      <pre className="terminal rounded-none text-xs max-h-48 overflow-y-auto p-4">
                        {serviceLogs[svc.name] || 'Loading logs...'}
                      </pre>
                    </div>
                  )}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  No services match your filter
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
