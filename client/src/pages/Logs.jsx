import React, { useState, useEffect, useRef } from 'react';
import { FileText, Search, RefreshCw, ChevronDown, Filter } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

export default function Logs() {
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState(200);
  const [activeTab, setActiveTab] = useState('files');
  const [journalUnit, setJournalUnit] = useState('');
  const [journalLines, setJournalLines] = useState(100);
  const [dmesgContent, setDmesgContent] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const contentRef = useRef(null);

  useEffect(() => {
    axios.get('/api/logs/files')
      .then(res => setLogFiles(res.data.files || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (autoScroll && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, autoScroll]);

  const fetchLog = async () => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ path: selectedFile, lines });
      if (search) params.append('search', search);
      const res = await axios.get(`/api/logs/read?${params}`);
      setContent(res.data.content || '');
    } catch (err) {
      setContent(`Error: ${err.response?.data?.error || 'Failed to read log'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchJournal = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ lines: journalLines });
      if (journalUnit) params.append('unit', journalUnit);
      const res = await axios.get(`/api/logs/journal?${params}`);
      setContent(res.data.content || '');
    } catch (err) {
      setContent(`Error: ${err.response?.data?.error || 'Failed to read journal'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchDmesg = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/logs/dmesg?lines=200');
      setDmesgContent(res.data.content || '');
      setContent(res.data.content || '');
    } catch (err) {
      setContent('Failed to read dmesg');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setContent('');
    if (tab === 'dmesg') fetchDmesg();
  };

  // Color-code log lines
  const colorLine = (line) => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal')) {
      return 'text-red-400';
    }
    if (lower.includes('warn') || lower.includes('warning')) {
      return 'text-yellow-400';
    }
    if (lower.includes('info') || lower.includes('notice')) {
      return 'text-blue-300';
    }
    if (lower.includes('debug')) {
      return 'text-gray-500';
    }
    return 'text-green-300';
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="Log Viewer" subtitle="System and application logs" />

          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[
              { id: 'files', label: 'Log Files' },
              { id: 'journal', label: 'journalctl' },
              { id: 'dmesg', label: 'dmesg' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* File log controls */}
          {activeTab === 'files' && (
            <div className="card mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Log File</label>
                  <select
                    value={selectedFile}
                    onChange={e => setSelectedFile(e.target.value)}
                    className="input-field text-sm"
                  >
                    <option value="">Select a log file...</option>
                    {logFiles.map((f, i) => (
                      <option key={i} value={f.path}>{f.name} ({f.path})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Search</label>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter lines..."
                    className="input-field text-sm"
                    onKeyDown={e => e.key === 'Enter' && fetchLog()}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Lines</label>
                  <div className="flex gap-2">
                    <select value={lines} onChange={e => setLines(e.target.value)} className="input-field text-sm flex-1">
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                    </select>
                    <button onClick={fetchLog} disabled={!selectedFile || loading} className="btn-primary text-sm px-3">
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Load'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Journal controls */}
          {activeTab === 'journal' && (
            <div className="card mb-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Service (optional)</label>
                  <input
                    type="text"
                    value={journalUnit}
                    onChange={e => setJournalUnit(e.target.value)}
                    placeholder="nginx, sshd, docker..."
                    className="input-field text-sm"
                    onKeyDown={e => e.key === 'Enter' && fetchJournal()}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Lines</label>
                  <div className="flex gap-2">
                    <select value={journalLines} onChange={e => setJournalLines(e.target.value)} className="input-field text-sm w-24">
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                    </select>
                    <button onClick={fetchJournal} disabled={loading} className="btn-primary text-sm px-3">
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Load'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Log content */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">
                {content ? `${content.split('\n').length} lines` : 'No content loaded'}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={e => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  Auto-scroll
                </label>
                {content && (
                  <button onClick={() => setContent('')} className="text-xs text-gray-500 hover:text-gray-300">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div
              ref={contentRef}
              className="bg-gray-950 rounded-lg p-4 overflow-auto font-mono text-xs leading-relaxed"
              style={{ height: '60vh' }}
            >
              {content ? (
                content.split('\n').map((line, i) => (
                  <div key={i} className={colorLine(line)}>
                    <span className="text-gray-600 mr-3 select-none">{String(i + 1).padStart(4, ' ')}</span>
                    {line}
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600">
                  <div className="text-center">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Select a log source and click Load</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
