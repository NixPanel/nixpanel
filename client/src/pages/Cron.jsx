import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Edit2, Search, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PRESETS = [
  { label: 'Every minute', minute: '*', hour: '*', day: '*', month: '*', weekday: '*' },
  { label: 'Every hour', minute: '0', hour: '*', day: '*', month: '*', weekday: '*' },
  { label: 'Daily midnight', minute: '0', hour: '0', day: '*', month: '*', weekday: '*' },
  { label: 'Weekly (Sun)', minute: '0', hour: '0', day: '*', month: '*', weekday: '0' },
  { label: 'Monthly', minute: '0', hour: '0', day: '1', month: '*', weekday: '*' },
];

const emptyForm = { minute: '*', hour: '*', day: '*', month: '*', weekday: '*', command: '', user: '' };

export default function Cron() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [output, setOutput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/cron');
      setJobs(res.data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch cron jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const validateExpr = async (fields) => {
    setValidating(true);
    try {
      const res = await axios.post('/api/cron/validate', fields);
      setValidation(res.data);
    } catch (_) {
      setValidation({ valid: false, error: 'Validation failed' });
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (form.minute && form.hour && form.day && form.month && form.weekday) {
        validateExpr({ minute: form.minute, hour: form.hour, day: form.day, month: form.month, weekday: form.weekday });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.minute, form.hour, form.day, form.month, form.weekday]);

  const applyPreset = (preset) => {
    setForm(prev => ({ ...prev, ...preset }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.command.trim()) return;
    setSubmitting(true);
    setOutput('');
    try {
      if (editingId) {
        await axios.put(`/api/cron/${editingId}`, form);
        setOutput('Cron job updated successfully.');
      } else {
        await axios.post('/api/cron', form);
        setOutput('Cron job added successfully.');
      }
      setForm(emptyForm);
      setEditingId(null);
      setActiveTab('jobs');
      fetchJobs();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Operation failed'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (job) => {
    setForm({
      minute: job.minute || '*',
      hour: job.hour || '*',
      day: job.day || '*',
      month: job.month || '*',
      weekday: job.weekday || '*',
      command: job.command || '',
      user: job.user || '',
    });
    setEditingId(job.id);
    setActiveTab('add');
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/cron/${id}`);
      setOutput('Cron job deleted.');
      fetchJobs();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Delete failed'}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const filtered = jobs.filter(j =>
    !filter ||
    j.command?.toLowerCase().includes(filter.toLowerCase()) ||
    j.schedule?.includes(filter) ||
    j.user?.toLowerCase().includes(filter.toLowerCase())
  );

  const formatNextRun = (nextRun) => {
    if (!nextRun) return '—';
    const d = new Date(nextRun);
    const now = new Date();
    const diff = d - now;
    if (diff < 0) return 'Past';
    if (diff < 60000) return 'in <1 min';
    if (diff < 3600000) return `in ${Math.round(diff / 60000)}m`;
    if (diff < 86400000) return `in ${Math.round(diff / 3600000)}h`;
    return d.toLocaleString();
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Cron Jobs"
            subtitle={`${jobs.length} scheduled tasks`}
            onRefresh={fetchJobs}
            loading={loading}
          />

          {output && (
            <pre className={`terminal mb-4 text-sm ${output.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {output}
            </pre>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[{ id: 'jobs', label: 'All Jobs' }, { id: 'add', label: editingId ? 'Edit Job' : 'Add Job' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); if (tab.id === 'add' && !editingId) setForm(emptyForm); }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Jobs Tab */}
          {activeTab === 'jobs' && (
            <div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Filter jobs..."
                  className="input-field pl-9"
                />
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading cron jobs...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No cron jobs found</p>
                </div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Schedule</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Command</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Source</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Next Run</th>
                          <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((job) => (
                          <tr key={job.id} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-blue-300 whitespace-nowrap">{job.schedule}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-200 max-w-xs truncate">{job.command}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">{job.user}</td>
                            <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{job.source}</td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatNextRun(job.nextRun)}</td>
                            <td className="px-4 py-3 text-right">
                              {job.id.startsWith('user-') && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleEdit(job)}
                                    className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(job.id)}
                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add/Edit Tab */}
          {activeTab === 'add' && (
            <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Quick Presets</h3>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="px-3 py-1.5 text-xs bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg border border-dark-600 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Schedule Expression</h3>
                <div className="grid grid-cols-5 gap-3 mb-3">
                  {[
                    { key: 'minute', label: 'Minute', placeholder: '0-59' },
                    { key: 'hour', label: 'Hour', placeholder: '0-23' },
                    { key: 'day', label: 'Day', placeholder: '1-31' },
                    { key: 'month', label: 'Month', placeholder: '1-12' },
                    { key: 'weekday', label: 'Weekday', placeholder: '0-7' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <input
                        type="text"
                        value={form[key]}
                        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="input-field font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>

                {/* Validation feedback */}
                {validation && (
                  <div className={`flex items-center gap-2 text-xs ${validation.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {validation.valid
                      ? <><CheckCircle className="w-3.5 h-3.5" />Valid — Next run: {formatNextRun(validation.nextRun)}</>
                      : <><XCircle className="w-3.5 h-3.5" />{validation.error}</>
                    }
                    {validating && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
                  </div>
                )}
              </div>

              <div className="card space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Command</label>
                  <input
                    type="text"
                    value={form.command}
                    onChange={e => setForm(prev => ({ ...prev, command: e.target.value }))}
                    placeholder="/usr/bin/backup.sh"
                    className="input-field font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Run as User</label>
                  <input
                    type="text"
                    value={form.user}
                    onChange={e => setForm(prev => ({ ...prev, user: e.target.value }))}
                    placeholder={user?.username || 'root'}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || (validation && !validation.valid)}
                  className="btn-primary"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2 inline" /> : null}
                  {editingId ? 'Update Job' : 'Add Job'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setForm(emptyForm); setActiveTab('jobs'); }}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-dark-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Delete confirmation */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="card max-w-sm w-full mx-4">
                <h3 className="text-base font-semibold text-white mb-2">Delete Cron Job?</h3>
                <p className="text-sm text-gray-400 mb-4">This action cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => handleDelete(deleteConfirm)} className="btn-primary bg-red-600 hover:bg-red-700">Delete</button>
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-dark-600 rounded-lg transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
