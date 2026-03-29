import React, { useState } from 'react';
import {
  FolderOpen, Folder, File, FileText, ChevronRight, Home,
  Trash2, Edit, Plus, Save, X, AlertCircle, ArrowUp,
} from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function FileIcon({ type, name }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (type === 'directory') return <Folder className="w-4 h-4 text-yellow-400" />;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h'].includes(ext)) return <FileText className="w-4 h-4 text-blue-400" />;
  if (['log', 'txt', 'md'].includes(ext)) return <FileText className="w-4 h-4 text-gray-400" />;
  if (['conf', 'cfg', 'ini', 'yaml', 'yml', 'toml', 'json'].includes(ext)) return <FileText className="w-4 h-4 text-green-400" />;
  return <File className="w-4 h-4 text-gray-500" />;
}

export default function Files() {
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editContent, setEditContent] = useState(null);
  const [editPath, setEditPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newDirName, setNewDirName] = useState('');
  const [showNewDir, setShowNewDir] = useState(false);

  const fetchDir = async (path = '/') => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`/api/files/list?path=${encodeURIComponent(path)}`);
      setEntries(res.data.entries || []);
      setCurrentPath(res.data.path);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path) => {
    setError('');
    try {
      const res = await axios.get(`/api/files/read?path=${encodeURIComponent(path)}`);
      setEditContent(res.data.content);
      setEditPath(path);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to read file');
    }
  };

  const saveFile = async () => {
    setSaving(true);
    setError('');
    try {
      await axios.put('/api/files/write', { path: editPath, content: editContent });
      setSuccess('File saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (path, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await axios.delete(`/api/files/delete?path=${encodeURIComponent(path)}`);
      setSuccess(`"${name}" deleted`);
      fetchDir(currentPath);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const createDir = async (e) => {
    e.preventDefault();
    if (!newDirName.trim()) return;
    const newPath = `${currentPath}/${newDirName}`.replace('//', '/');
    try {
      await axios.post('/api/files/mkdir', { path: newPath });
      setSuccess(`Directory "${newDirName}" created`);
      setNewDirName('');
      setShowNewDir(false);
      fetchDir(currentPath);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create directory');
    }
  };

  // Breadcrumb
  const pathParts = currentPath === '/' ? [''] : currentPath.split('/');
  const breadcrumbs = pathParts.map((_, i) => ({
    label: pathParts[i] || '/',
    path: pathParts.slice(0, i + 1).join('/') || '/',
  }));

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="File Manager" subtitle="Browse and edit system files" />

          {(error || success) && (
            <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error || success}
            </div>
          )}

          {editContent !== null ? (
            /* File editor */
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="font-mono text-sm text-gray-300">{editPath}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveFile} disabled={saving} className="btn-primary flex items-center gap-2 text-sm py-1.5">
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditContent(null); setEditPath(''); }} className="btn-ghost text-sm py-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full bg-gray-950 text-green-300 font-mono text-sm p-4 rounded-lg border border-dark-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                style={{ height: '65vh' }}
                spellCheck={false}
              />
            </div>
          ) : (
            /* Directory browser */
            <div className="card">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => fetchDir('/')}
                    className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-dark-600 rounded transition-colors"
                    title="Home"
                  >
                    <Home className="w-4 h-4" />
                  </button>
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1 text-sm overflow-x-auto">
                    {breadcrumbs.map((crumb, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />}
                        <button
                          onClick={() => fetchDir(crumb.path)}
                          className="text-blue-400 hover:text-blue-300 font-mono whitespace-nowrap"
                        >
                          {crumb.label || '/'}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNewDir(!showNewDir)}
                    className="btn-ghost text-sm py-1.5 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Dir
                  </button>
                </div>
              </div>

              {showNewDir && (
                <form onSubmit={createDir} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newDirName}
                    onChange={e => setNewDirName(e.target.value)}
                    placeholder="Directory name"
                    className="input-field text-sm flex-1"
                    autoFocus
                  />
                  <button type="submit" className="btn-primary text-sm py-1.5">Create</button>
                  <button type="button" onClick={() => setShowNewDir(false)} className="btn-ghost text-sm py-1.5">Cancel</button>
                </form>
              )}

              {/* File listing */}
              {!entries.length && !loading ? (
                <div className="text-center py-16 text-gray-500">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Click on a path to browse, or</p>
                  <button onClick={() => fetchDir('/')} className="text-blue-400 hover:text-blue-300 mt-2 text-sm">
                    Browse root directory
                  </button>
                </div>
              ) : loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-600">
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Size</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium hidden lg:table-cell">Modified</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium hidden sm:table-cell">Perms</th>
                        <th className="py-2 px-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, i) => (
                        <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30 transition-colors group">
                          <td className="py-2 px-3">
                            <button
                              onClick={() => entry.type === 'directory' ? fetchDir(entry.path) : openFile(entry.path)}
                              className="flex items-center gap-2 font-mono text-left hover:text-blue-400 transition-colors"
                            >
                              <FileIcon type={entry.type} name={entry.name} />
                              <span className={entry.type === 'directory' ? 'text-yellow-300' : 'text-gray-200'}>
                                {entry.name}
                              </span>
                            </button>
                          </td>
                          <td className="py-2 px-3 text-gray-500 text-xs hidden md:table-cell">
                            {entry.type === 'directory' ? '—' : formatSize(entry.size)}
                          </td>
                          <td className="py-2 px-3 text-gray-500 text-xs hidden lg:table-cell">
                            {entry.modified ? new Date(entry.modified).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-2 px-3 font-mono text-gray-500 text-xs hidden sm:table-cell">{entry.permissions}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => deleteEntry(entry.path, entry.name)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-500/10 rounded transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
