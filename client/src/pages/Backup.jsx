import React, { useState, useEffect } from 'react';
import { Archive, Download, Trash2, RotateCcw, Plus, AlertTriangle, RefreshCw, HardDrive } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Backup() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('backups');
  const [backups, setBackups] = useState([]);
  const [backupDir, setBackupDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [output, setOutput] = useState('');
  const [outputType, setOutputType] = useState('info');

  // Create form
  const [source, setSource] = useState('');
  const [backupName, setBackupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Restore
  const [restoreModal, setRestoreModal] = useState(null);
  const [restoreDest, setRestoreDest] = useState('/tmp/restore');
  const [restoring, setRestoring] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/backup/list');
      setBackups(res.data.backups || []);
      setBackupDir(res.data.backupDir || '');
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!source.trim()) return;
    setCreating(true);
    setOutput('');
    try {
      const res = await axios.post('/api/backup/create', {
        source: source.trim(),
        name: backupName.trim(),
      });
      setOutput(`Backup created: ${res.data.filename} (${res.data.sizeHuman})\n${res.data.output || ''}`);
      setOutputType('success');
      setSource('');
      setBackupName('');
      setActiveTab('backups');
      fetchBackups();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Backup failed'}\n${err.response?.data?.output || ''}`);
      setOutputType('error');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreModal) return;
    setRestoring(true);
    setOutput('');
    try {
      const res = await axios.post('/api/backup/restore', {
        filename: restoreModal.filename,
        destination: restoreDest.trim(),
      });
      setOutput(`Restore completed to ${restoreDest}\n${res.data.output || ''}`);
      setOutputType('success');
      setRestoreModal(null);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Restore failed'}`);
      setOutputType('error');
    } finally {
      setRestoring(false);
    }
  };

  const handleDownload = (filename) => {
    const token = localStorage.getItem('token');
    window.location.href = `/api/backup/download/${encodeURIComponent(filename)}?token=${token}`;
  };

  const handleDelete = async (filename) => {
    try {
      await axios.delete(`/api/backup/${encodeURIComponent(filename)}`);
      setOutput(`Deleted: ${filename}`);
      setOutputType('success');
      fetchBackups();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Delete failed'}`);
      setOutputType('error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Backup Manager"
            subtitle={backupDir ? `Backup directory: ${backupDir}` : 'System backups'}
            onRefresh={fetchBackups}
            loading={loading}
          />

          {output && (
            <pre className={`terminal mb-4 text-xs max-h-48 overflow-auto ${outputType === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {output}
              <button onClick={() => setOutput('')} className="ml-2 text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </pre>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[{ id: 'backups', label: 'Backups' }, { id: 'create', label: 'Create Backup' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Backups Tab */}
          {activeTab === 'backups' && (
            <div>
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading backups...</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Archive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No backups found</p>
                  <p className="text-xs mt-1">Create a backup to get started</p>
                </div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Filename</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Size</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">Created</th>
                          <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backups.map((backup) => (
                          <tr key={backup.filename} className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                <span className="font-mono text-xs text-gray-200">{backup.filename}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{backup.sizeHuman}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">{formatDate(backup.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleDownload(backup.filename)}
                                  className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setRestoreModal(backup); setRestoreDest('/tmp/restore'); }}
                                  className="p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-colors"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(backup.filename)}
                                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
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
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Create Tab */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreate} className="max-w-lg space-y-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Create Backup</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Source Directory *</label>
                    <input
                      type="text"
                      value={source}
                      onChange={e => setSource(e.target.value)}
                      placeholder="/var/www/html"
                      className="input-field font-mono"
                      required
                    />
                    <p className="text-xs text-gray-600 mt-1">Must be an absolute path</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Backup Name (optional)</label>
                    <input
                      type="text"
                      value={backupName}
                      onChange={e => setBackupName(e.target.value)}
                      placeholder="my-backup"
                      className="input-field"
                    />
                    <p className="text-xs text-gray-600 mt-1">A timestamp will be appended automatically</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400 flex items-start gap-2">
                <Archive className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Backups are saved as .tar.gz files in <span className="font-mono">{backupDir || '/var/backups/nixpanel'}</span></span>
              </div>

              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : <Plus className="w-4 h-4 inline mr-2" />}
                {creating ? 'Creating Backup...' : 'Create Backup'}
              </button>
            </form>
          )}

          {/* Restore Modal */}
          {restoreModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="card max-w-md w-full mx-4">
                <h3 className="text-base font-semibold text-white mb-1">Restore Backup</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Restore <span className="font-mono text-blue-400">{restoreModal.filename}</span> to:
                </p>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">Destination Directory</label>
                  <input
                    type="text"
                    value={restoreDest}
                    onChange={e => setRestoreDest(e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 text-xs text-yellow-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Restoring will extract files into the destination. Existing files with the same name will be overwritten.</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="btn-primary bg-green-700 hover:bg-green-600"
                  >
                    {restoring ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                    {restoring ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    onClick={() => setRestoreModal(null)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-dark-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="card max-w-sm w-full mx-4">
                <h3 className="text-base font-semibold text-white mb-2">Delete Backup?</h3>
                <p className="text-sm text-gray-400 mb-1">
                  <span className="font-mono text-blue-400">{deleteConfirm}</span>
                </p>
                <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
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
