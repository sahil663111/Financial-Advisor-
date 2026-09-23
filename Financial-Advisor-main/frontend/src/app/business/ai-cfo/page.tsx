'use client';

import { useEffect, useState, useRef } from 'react';
import { businessOrg as orgApi, businessAI, tokenStore } from '@/lib/api';
import { Bot, Send, User, Loader2, Plus, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_V1 = '/api/v1';

const QUICK_PROMPTS = [
  'Give me a financial health summary',
  'What is our current cash runway?',
  'Why did profit change this period?',
  'Show our biggest expense categories',
  'What is our credit risk score?',
  'Are there any expense anomalies?',
  'What does the 3-month forecast look like?',
  'Analyze our balance sheet',
];

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function BusinessAICFOPage() {
  const [orgId, setOrgId]             = useState<string | null>(null);
  const [conversations, setConvs]     = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [streaming, setStreaming]     = useState(false);
  const [streamText, setStreamText]   = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  // Resolve org
  useEffect(() => {
    orgApi.listOrganizations().then((orgs: any) => {
      if (orgs?.length) setOrgId(orgs[0].id || orgs[0]._id);
      else setLoadingConvs(false);
    }).catch(() => setLoadingConvs(false));
  }, []);

  // Load conversations once org resolved
  useEffect(() => {
    if (!orgId) return;
    loadConversations();
  }, [orgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const loadConversations = async () => {
    if (!orgId) return;
    setLoadingConvs(true);
    try {
      const convs: any = await businessAI.listConversations(orgId);
      setConvs(convs || []);
      if (convs?.length && !activeConvId) selectConversation(convs[0].id);
    } finally {
      setLoadingConvs(false);
    }
  };

  const selectConversation = async (convId: string) => {
    if (!orgId) return;
    setActiveConvId(convId);
    try {
      const msgs: any = await businessAI.getMessages(orgId, convId);
      setMessages((msgs || []).map((m: any) => ({
        id: m.id || m._id,
        role: m.role,
        content: m.content,
      })));
    } catch {}
  };

  const newConversation = async () => {
    if (!orgId) return;
    try {
      const conv: any = await businessAI.createConversation(orgId);
      setConvs(prev => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
    } catch {}
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || streaming || !orgId) return;

    // Ensure we have an active conversation
    let convId = activeConvId;
    if (!convId) {
      const conv: any = await businessAI.createConversation(orgId);
      setConvs(prev => [conv, ...prev]);
      setActiveConvId(conv.id);
      convId = conv.id;
    }

    // Optimistically add user message
    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamText('');

    try {
      const token = tokenStore.get();
      const res = await fetch(
        `${API_V1}/business/organizations/${orgId}/ai/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-Access-Token': token } : {}),
          },
          body: JSON.stringify({ message: content }),
        }
      );

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        // Parse SSE: data: {"content": "..."} lines
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.content) {
              full += parsed.content;
              setStreamText(full);
            }
            if (parsed.error) {
              full += `\n\n⚠️ ${parsed.error}`;
              setStreamText(full);
            }
          } catch {}
        }
      }

      // Replace streaming text with final persisted message
      setMessages(prev => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: 'model', content: full },
      ]);
      setStreamText('');

      // Refresh conversations to pick up updated title
      await loadConversations();
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'model',
          content: '⚠️ I encountered an error. Please check that your LLM API key is configured.' },
      ]);
      setStreamText('');
    } finally {
      setStreaming(false);
    }
  };

  if (!orgId && !loadingConvs) return (
    <div className="p-8 text-center">
      <div className="card max-w-md mx-auto py-12">
        <p className="text-slate-400 mb-4">No organisation found.</p>
        <a href="/business/profile" className="btn-primary">Set Up Business</a>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-indigo-400" />
            <span className="text-white font-semibold text-sm">AI CFO</span>
          </div>
          <button onClick={newConversation} className="btn-ghost p-1.5" title="New conversation">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConvs ? (
            Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)
          ) : conversations.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-4">No conversations yet</p>
          ) : conversations.map(conv => (
            <button key={conv.id} onClick={() => selectConversation(conv.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                activeConvId === conv.id
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}>
              <p className="truncate text-sm">{conv.title}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {new Date(conv.updated_at).toLocaleDateString('en-IN')}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">AI Virtual CFO</p>
              <p className="text-slate-500 text-xs">Powered by Gemini · Grounded in your real business data</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-3xl mb-4">
                🤖
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Ask your AI CFO</h2>
              <p className="text-slate-400 text-sm mb-8 max-w-md">
                I analyse your real accounting data, P&L, cash flow, forecasts and anomalies — no guessing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {QUICK_PROMPTS.map(q => (
                  <button key={q} onClick={() => sendMessage(q)}
                    className="text-left px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm whitespace-pre-wrap'
                  : 'bg-slate-800 text-slate-200 rounded-tl-sm prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700'
              }`}>
                {msg.role === 'user'
                  ? msg.content
                  : <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {streaming && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800 text-slate-200 text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                {streamText
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                  : <Loader2 size={16} className="animate-spin text-indigo-400" />}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex gap-3 items-end max-w-3xl mx-auto">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about your finances... (Enter to send)"
              rows={1}
              className="input flex-1 resize-none min-h-[44px] max-h-32 py-3"
            />
            <button onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className="btn-primary shrink-0 h-[44px] w-[44px] p-0 justify-center">
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-center text-xs text-slate-600 mt-2">
            AI CFO uses your real financial data. Not financial advice — verify with your CA.
          </p>
        </div>
      </div>
    </div>
  );
}
