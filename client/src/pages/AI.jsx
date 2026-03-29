import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Copy, Trash2, AlertCircle, Sparkles, Code } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';

function MessageBlock({ message }) {
  const isUser = message.role === 'user';

  const copyText = () => {
    navigator.clipboard.writeText(message.content);
  };

  // Simple markdown-like rendering
  const renderContent = (text) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        const lang = lines[0];
        const code = lines.slice(1).join('\n');
        return (
          <div key={i} className="relative my-2 group">
            <div className="flex items-center justify-between px-3 py-1 bg-dark-900 rounded-t-lg border-b border-dark-500">
              <span className="text-xs text-gray-500 font-mono">{lang || 'code'}</span>
              <button
                onClick={() => navigator.clipboard.writeText(code)}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> copy
              </button>
            </div>
            <pre className="bg-dark-900 rounded-b-lg p-4 overflow-x-auto text-sm font-mono text-green-300">{code}</pre>
          </div>
        );
      }
      // Inline code
      const withInlineCode = part.split(/(`[^`]+`)/g).map((seg, j) => {
        if (seg.startsWith('`') && seg.endsWith('`')) {
          return <code key={j} className="bg-dark-800 px-1.5 py-0.5 rounded text-xs font-mono text-blue-300">{seg.slice(1, -1)}</code>;
        }
        return <span key={j}>{seg}</span>;
      });
      return <p key={i} className="mb-2 last:mb-0 whitespace-pre-wrap">{withInlineCode}</p>;
    });
  };

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-purple-500 to-cyan-500'}`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-3xl ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600/20 border border-blue-600/30 text-gray-100'
            : 'bg-dark-700 border border-dark-600 text-gray-100'
        }`}>
          {message.streaming
            ? <p className="whitespace-pre-wrap">{message.content}<span className="inline-block w-1 h-4 bg-blue-400 ml-1 animate-pulse" /></p>
            : renderContent(message.content)
          }
        </div>
        {!message.streaming && (
          <button
            onClick={copyText}
            className="text-xs text-gray-600 hover:text-gray-400 mt-1 flex items-center gap-1 px-2"
          >
            <Copy className="w-3 h-3" /> copy
          </button>
        )}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  'Show me the top 10 CPU consuming processes',
  'How do I check disk usage and find large files?',
  'Explain how to set up a basic nginx reverse proxy',
  'What does this iptables rule mean: -A INPUT -p tcp --dport 22 -j ACCEPT',
  'How do I monitor system logs in real-time?',
  'Write a bash script to backup /etc directory',
];

export default function AI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || streaming) return;

    setInput('');
    setError('');

    const userMsg = { role: 'user', content: messageText };
    const aiMsg = { role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nixpanel_token')}`,
        },
        body: JSON.stringify({ message: messageText, history }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Request failed');
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullContent += data.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseErr) {
              if (parseErr.message !== 'Unexpected token') {
                throw parseErr;
              }
            }
          }
        }
      }

      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          streaming: false,
        };
        return updated;
      });

    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to get response');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      readerRef.current = null;
    }
  };

  const clearChat = () => {
    if (streaming) {
      readerRef.current?.cancel();
    }
    setMessages([]);
    setError('');
    setStreaming(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">AI Assistant</h1>
              <p className="text-xs text-gray-400">Powered by Claude · Linux admin expert</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} className="btn-ghost text-sm py-1.5 flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">NixPanel AI Assistant</h2>
              <p className="text-gray-400 text-sm text-center mb-8 max-w-md">
                Ask me anything about Linux system administration, commands, configurations, and troubleshooting.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left p-3 bg-dark-700 border border-dark-600 rounded-xl hover:border-blue-500/50 hover:bg-dark-600 transition-all text-sm text-gray-300 group"
                  >
                    <span className="text-blue-400 mr-2 text-xs">→</span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {messages.map((msg, i) => (
                <MessageBlock key={i} message={msg} />
              ))}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-dark-600">
          <div className="flex gap-3 items-end">
            <div className="flex-1 bg-dark-700 border border-dark-500 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about Linux administration, commands, configs..."
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none"
                style={{ maxHeight: '120px' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                disabled={streaming}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {streaming ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Enter to send · Shift+Enter for new line · Commands require ANTHROPIC_API_KEY
          </p>
        </div>
      </main>
    </div>
  );
}
