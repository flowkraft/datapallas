'use client';

import React, { useEffect, useState, useMemo, use, useRef } from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
// heroicons replace lucide: ChevronLeft, ChevronDown, ChevronRight, Wrench, Database, Brain, MessageSquare, Settings, Zap
import { Button } from '@/components/ui/button';

type AgentState = any;

// Simple Accordion component (since we don't have PrimeReact)
function Accordion({ 
  children, 
  activeIndex, 
  onTabChange 
}: { 
  children: React.ReactNode; 
  activeIndex: number | null; 
  onTabChange: (e: { index: number | null }) => void;
}) {
  return <div className="space-y-1">{children}</div>;
}

function AccordionTab({ 
  header, 
  children, 
  isActive, 
  onToggle 
}: { 
  header: React.ReactNode; 
  children: React.ReactNode; 
  isActive?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="border border-base-300 rounded">
      <button 
        onClick={onToggle}
        className="w-full px-3 py-2 text-left bg-base-200 hover:bg-base-200 flex items-center justify-between text-sm"
      >
        {header}
        {isActive
          ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
          : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        }
      </button>
      {isActive && (
        <div className="px-3 py-2 bg-base-100">
          {children}
        </div>
      )}
    </div>
  );
}

// Simple Tabs component
function Tabs({ 
  tabs, 
  activeTab, 
  onTabChange 
}: { 
  tabs: { key: string; label: string; count?: number }[];
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  return (
    <div className="flex border-b border-base-300 mb-2">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === tab.key 
              ? 'border-primary text-primary' 
              : 'border-transparent text-base-content/60 hover:text-base-content'
          }`}
        >
          {tab.label} {tab.count !== undefined && `(${tab.count})`}
        </button>
      ))}
    </div>
  );
}

export default function AgentDebugPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);

  const [agent, setAgent] = useState<AgentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingSystem, setEditingSystem] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchAgent = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/agents/${agentId}`);
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      setAgent(data);
      setEditingSystem(data?.system ?? '');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!agentId) return;
    fetchAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const saveAgent = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: editingSystem }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      setAgent(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // Chat simulator transport
  const transport = useMemo(() => {
    if (!agentId) return undefined;
    return new DefaultChatTransport({ api: '/api/chat', body: { agentId } });
  }, [agentId]);

  const [streamEvents, setStreamEvents] = useState<any[]>([]);
  const { messages, setMessages, sendMessage, status } = useChat({
    transport,
    messages: [],
    onData: (chunk: any) => {
      try {
        setStreamEvents((s) => [{ time: Date.now(), chunk }, ...s].slice(0, 50));

        if (chunk && typeof chunk === 'object' && chunk.type) {
          if (chunk.type === 'text-start') {
            setMessages((prev: any[]) => {
              const msgs = [...prev];
              msgs.push({ id: `assistant-${chunk.id ?? Date.now()}`, role: 'assistant', parts: [{ type: 'text', text: '' }] });
              return msgs;
            });
          } else if (chunk.type === 'text-delta') {
            setMessages((prev: any[]) => {
              const msgs = [...prev];
              let idx = -1;
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'assistant') { idx = i; break; }
              }
              if (idx === -1) {
                msgs.push({ id: `assistant-${chunk.id ?? Date.now()}`, role: 'assistant', parts: [{ type: 'text', text: chunk.delta || '' }] });
              } else {
                const msg = { ...msgs[idx] };
                msg.parts = msg.parts ? [...msg.parts] : [];
                const textPartIndex = msg.parts.findIndex((p: any) => p.type === 'text');
                if (textPartIndex === -1) {
                  msg.parts.push({ type: 'text', text: chunk.delta || '' });
                } else {
                  const part = { ...msg.parts[textPartIndex] };
                  part.text = (part.text || '') + (chunk.delta || '');
                  msg.parts[textPartIndex] = part;
                }
                msgs[idx] = msg;
              }
              return msgs;
            });
          }
        }
      } catch (e) {}
    }
  });

  const [msgText, setMsgText] = useState('');
  const [dots, setDots] = useState('.');
  const [activeMemoryIdx, setActiveMemoryIdx] = useState<number | null>(0);
  const [archiveQuery, setArchiveQuery] = useState<string>('');
  const [activeToolsTab, setActiveToolsTab] = useState('toolsTab');
  
  // Tool source code viewer state
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [toolSourceCode, setToolSourceCode] = useState<string>('');
  const [loadingToolSource, setLoadingToolSource] = useState(false);

  // Sleeptime details state
  const [sleeptimeLoading, setSleeptimeLoading] = useState(false);
  const [sleeptimeError, setSleeptimeError] = useState<string | null>(null);
  const [sleeptimeAgent, setSleeptimeAgent] = useState<any | null>(null);
  const [sleeptimeActiveMemoryIdx, setSleeptimeActiveMemoryIdx] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') {
      const id = setInterval(() => setDots((d) => (d.length >= 3 ? '.' : d + '.')), 400);
      return () => clearInterval(id);
    }
    setDots('.');
  }, [status]);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch sleeptime agent details when the main agent has sleeptime enabled
  useEffect(() => {
    if (!agent || !agentId) return;
    if (!agent.enable_sleeptime) return;

    let mounted = true;
    setSleeptimeLoading(true);
    setSleeptimeError(null);
    setSleeptimeAgent(null);

    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/sleeptime`);
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        const data = await res.json();
        if (!mounted) return;
        setSleeptimeAgent(data?.sleeptimeAgent ?? null);
      } catch (e: any) {
        if (!mounted) return;
        setSleeptimeError(e?.message || String(e));
      } finally {
        if (!mounted) return;
        setSleeptimeLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [agent, agentId]);

  // Default expand first sleeptime memory block
  useEffect(() => {
    if (!sleeptimeAgent) {
      setSleeptimeActiveMemoryIdx(null);
      return;
    }
    const blocks = sleeptimeAgent.memoryBlocks || [];
    setSleeptimeActiveMemoryIdx(blocks.length > 0 ? 0 : null);
  }, [sleeptimeAgent]);

  const onSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!msgText.trim()) return;
    sendMessage({ text: msgText });
    setMsgText('');
  };

  // Format a number into a short human-readable form for token counts
  const formatShort = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return '0';
    if (n < 1000) return String(n);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    return `${(n / 1000).toFixed(1)}k`;
  };

  // Quick heuristic to estimate tokens from characters
  const estimateTokens = (chars: number) => Math.max(1, Math.round(chars / 4));

  // Fetch tool source code when a custom tool is selected
  const fetchToolSourceCode = async (toolId: string) => {
    try {
      setLoadingToolSource(true);
      const res = await fetch(`/api/tools/${toolId}`);
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const toolData = await res.json();
      setToolSourceCode(toolData.source_code || '// No source code available');
    } catch (e: any) {
      setToolSourceCode(`// Error loading source code: ${e?.message || String(e)}`);
    } finally {
      setLoadingToolSource(false);
    }
  };

  const handleToolClick = (tool: any) => {
    if (selectedTool?.id === tool.id) {
      setSelectedTool(null);
      setToolSourceCode('');
    } else {
      setSelectedTool(tool);
      fetchToolSourceCode(tool.id);
    }
  };

  // Tool categorization
  const MEMORY_BLOCK_TOOLS = ['memory', 'memory_insert', 'memory_replace', 'memory_rethink', 'memory_finish_edits'];
  const RECALL_MEMORY_TOOLS = ['conversation_search'];
  const ARCHIVAL_MEMORY_TOOLS = ['archival_memory_insert', 'archival_memory_search'];

  const tools = agent?.tools || [];
  const customTools = tools.filter((t: any) => t.tool_type === 'custom');
  const memoryBlockTools = tools.filter((t: any) => MEMORY_BLOCK_TOOLS.includes(String(t.name)));
  const recallTools = tools.filter((t: any) => RECALL_MEMORY_TOOLS.includes(String(t.name)));
  const archivalTools = tools.filter((t: any) => ARCHIVAL_MEMORY_TOOLS.includes(String(t.name)));
  const customToolIds = new Set(customTools.map((t: any) => t.id));
  const allKnownToolNames = [...MEMORY_BLOCK_TOOLS, ...RECALL_MEMORY_TOOLS, ...ARCHIVAL_MEMORY_TOOLS];
  const otherTools = tools.filter((t: any) => !customToolIds.has(t.id) && !allKnownToolNames.includes(String(t.name)));

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/agents" className="inline-flex items-center text-sm text-base-content/60 hover:text-base-content mb-2">
            {/* Heroicon: chevron-left */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Back to Agents
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {/* Heroicon: cpu-chip (brain substitute) */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-athena-accent"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" /></svg>
            {agent ? `${agent.name ?? ''} (${(agent.metadata?.agentKey) ?? agent.id})` : 'Loading...'}
            {agent?.enable_sleeptime && (
              <span className="ml-2 text-sm font-normal text-base-content/60" title="Sleeptime enabled">
                💤 Sleeptime
              </span>
            )}
          </h1>
          {agent?.description && (
            <p className="text-base-content/60 mt-1">{agent.description}</p>
          )}
        </div>

        {loading && <div className="text-base-content/60">Loading agent details...</div>}
        {error && <div className="text-error bg-error/10 p-3 rounded">Error: {error}</div>}

        {!loading && agent && (
          <>
            <div className="grid grid-cols-12 gap-4">
              {/* LEFT PANEL - Model, System, Tags, Tools */}
              <div className="col-span-3 bg-base-100 border border-base-300 rounded-lg p-4 space-y-4">
                {/* Model */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-base-content mb-1">
                    {/* Heroicon: cog-6-tooth */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    Model
                  </div>
                  <div className="text-sm bg-base-200 px-2 py-1 rounded">{agent.model}</div>
                </div>

                {/* System Instructions */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-base-content mb-1">
                    {/* Heroicon: chat-bubble-left */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                    System Instructions
                    {agent.system && (
                      <span className="text-xs text-base-content/60">
                        ({formatShort(estimateTokens(String(agent.system).length))} tokens)
                      </span>
                    )}
                  </div>
                  <div className="text-xs bg-base-200 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                    {agent.system || <em className="text-base-content/60">No system instructions</em>}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <div className="text-sm font-semibold text-base-content mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const t = Array.isArray(agent.tags) && agent.tags.length > 0 ? agent.tags : (Array.isArray(agent.metadata?.tags) ? agent.metadata.tags : []);
                      if (!t || t.length === 0) return <span className="text-xs text-base-content/60">No tags</span>;
                      return t.map((tg: any) => (
                        <span key={String(tg)} className="text-xs bg-base-200 border border-base-300 px-2 py-0.5 rounded-full">
                          {tg}
                        </span>
                      ));
                    })()}
                  </div>
                </div>

                <hr className="border-base-300" />

                {/* Tools / Sources Tabs */}
                <Tabs 
                  tabs={[
                    { key: 'toolsTab', label: 'Tools', count: tools.length },
                    { key: 'sourcesTab', label: 'Sources', count: (agent.sources || []).length }
                  ]}
                  activeTab={activeToolsTab}
                  onTabChange={setActiveToolsTab}
                />

                {activeToolsTab === 'toolsTab' && (
                  <div className="space-y-3 text-xs">
                    {tools.length === 0 ? (
                      <div className="text-base-content/60">No tools</div>
                    ) : (
                      <>
                        {/* Memory Block Editing */}
                        <div>
                          <div className="font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" /></svg>
                            Memory Block ({memoryBlockTools.length})
                          </div>
                          {memoryBlockTools.length === 0 ? (
                            <div className="text-base-content/60 ml-4">none</div>
                          ) : (
                            <ul className="ml-4 space-y-0.5">
                              {memoryBlockTools.map((t: any) => <li key={t.id ?? t.name}>{t.name || t.id}</li>)}
                            </ul>
                          )}
                        </div>

                        {/* Recall Memory */}
                        <div>
                          <div className="font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                            Recall Memory ({recallTools.length})
                          </div>
                          {recallTools.length === 0 ? (
                            <div className="text-base-content/60 ml-4">none</div>
                          ) : (
                            <ul className="ml-4 space-y-0.5">
                              {recallTools.map((t: any) => <li key={t.id ?? t.name}>{t.name || t.id}</li>)}
                            </ul>
                          )}
                        </div>

                        {/* Archival Memory */}
                        <div>
                          <div className="font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                            {/* Heroicon: circle-stack */}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                            Archival Memory ({archivalTools.length})
                          </div>
                          {archivalTools.length === 0 ? (
                            <div className="text-base-content/60 ml-4">none</div>
                          ) : (
                            <ul className="ml-4 space-y-0.5">
                              {archivalTools.map((t: any) => <li key={t.id ?? t.name}>{t.name || t.id}</li>)}
                            </ul>
                          )}
                        </div>

                        {/* Custom Tools */}
                        <div>
                          <div className="font-semibold text-base-content/60 mb-1 flex items-center gap-1">
                            {/* Heroicon: wrench */}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z" /></svg>
                            Custom Tools ({customTools.length})
                          </div>
                          {customTools.length === 0 ? (
                            <div className="text-base-content/60 ml-4">none</div>
                          ) : (
                            <>
                              <ul className="ml-4 space-y-0.5">
                                {customTools.map((t: any) => (
                                  <li 
                                    key={t.id ?? t.name}
                                    className={`cursor-pointer hover:text-primary ${selectedTool?.id === t.id ? 'text-primary font-medium' : ''}`}
                                    onClick={() => handleToolClick(t)}
                                  >
                                    <span className="underline">{t.name || t.id}</span>
                                  </li>
                                ))}
                              </ul>
                              
                              {selectedTool && (
                                <div className="mt-2 border border-base-300 rounded p-2 bg-base-200">
                                  <div className="font-semibold mb-1">
                                    {selectedTool.name} - Source
                                    {loadingToolSource && <span className="ml-2 text-base-content/60">Loading...</span>}
                                  </div>
                                  <textarea
                                    readOnly
                                    value={toolSourceCode}
                                    className="w-full h-48 font-mono text-[10px] p-2 border border-base-300 rounded bg-base-100 resize-y"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Other Tools */}
                        {otherTools.length > 0 && (
                          <div>
                            <div className="font-semibold text-base-content/60 mb-1">Other ({otherTools.length})</div>
                            <ul className="ml-4 space-y-0.5">
                              {otherTools.map((t: any) => <li key={t.id ?? t.name}>{t.name || t.id}</li>)}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {activeToolsTab === 'sourcesTab' && (
                  <div className="text-xs">
                    {(agent.sources || []).length === 0 ? (
                      <div className="text-base-content/60">No sources</div>
                    ) : (
                      <ul className="space-y-0.5">
                        {(agent.sources || []).map((s: any) => (
                          <li key={s.id ?? s.name}>{s.name || s.id}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* MIDDLE PANEL - Chat Simulator */}
              <div className="col-span-5 bg-base-100 border border-base-300 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-base-content mb-3 flex items-center gap-2">
                  {/* Heroicon: bolt */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-warning"><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>
                  Agent Simulator
                </h3>

                <div className="border border-base-300 rounded p-3 h-[420px] overflow-auto bg-base-200">
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div key={m.id} className={`p-2 rounded ${m.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-base-100 border border-base-300 mr-8'}`}>
                        <div className="text-xs font-semibold text-base-content/60 mb-1">
                          {m.role.toUpperCase()}
                        </div>
                        {m.parts?.map((p: any, i: number) => (
                          <div key={i}>
                            {p.type === 'text' && <div className="text-sm whitespace-pre-wrap">{p.text}</div>}
                            {p.type === 'reasoning' && <div className="text-sm text-primary italic">💭 {p.text}</div>}
                          </div>
                        ))}
                      </div>
                    ))}

                    {(status === 'submitted' || status === 'streaming') && (
                      <div className="text-base-content/60 text-sm">💬 Thinking{dots}</div>
                    )}

                    <div ref={chatEndRef} />
                  </div>
                </div>

                <form onSubmit={onSubmit} className="mt-3 flex gap-2">
                  <input
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 px-3 py-2 border border-base-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button type="submit" disabled={status !== 'ready'} size="sm">
                    {status === 'streaming' ? '...' : 'Send'}
                  </Button>
                </form>

                {/* Stream debug info */}
                {streamEvents.length > 0 && (
                  <div className="mt-2 text-xs text-base-content/60">
                    <div className="font-semibold">Recent stream events:</div>
                    {streamEvents.slice(0, 3).map((e, i) => (
                      <div key={i}>
                        {typeof e.chunk === 'object' && e.chunk?.type
                          ? `${e.chunk.type} ${e.chunk?.delta ? `(+${String(e.chunk.delta).length})` : ''}`
                          : String(e.chunk).slice(0, 60)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT PANEL - Context Window */}
              <div className="col-span-4 bg-base-100 border border-base-300 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-base-content mb-3">Context Window</h3>

                {/* Usage bar */}
                {(() => {
                  const blocks = agent.memory?.blocks || [];
                  const totalChars = blocks.reduce((acc: number, b: any) => acc + String(b.value || '').length, 0);
                  const totalTokens = estimateTokens(totalChars);
                  const maxTokens = (agent.llm_config && agent.llm_config.context_window) ? agent.llm_config.context_window : 4096;
                  const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
                  const systLen = String(agent.system || '').length;
                  const systTokens = estimateTokens(systLen);
                  const usesDefaultMax = !agent.llm_config || !agent.llm_config.context_window;
                  
                  return (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-base-content/60 mb-1">
                        <span>Usage</span>
                        <span title={`memory: ${totalTokens} tok; system: ${systTokens} tok`}>
                          {formatShort(totalTokens)}{agent.system && ` + ${formatShort(systTokens)}`} / {formatShort(maxTokens)} tokens
                          {usesDefaultMax && ' (assumed)'}
                        </span>
                      </div>
                      <div className="bg-base-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {agent.system && (
                        <div className="text-xs text-base-content/60 mt-1">
                          System instructions: {formatShort(systTokens)} tokens
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Memory Blocks Accordion */}
                <div className="mb-4">
                  <div className="text-xs font-semibold text-base-content/60 mb-2">Memory Blocks</div>
                  {(agent.memory?.blocks || []).length === 0 ? (
                    <div className="text-xs text-base-content/60">No core memory</div>
                  ) : (
                    <div className="space-y-1">
                      {(agent.memory?.blocks || []).map((b: any, idx: number) => {
                        const sharedOwners = Array.isArray(b?.metadata?.sharedOwners) ? b.metadata.sharedOwners : [];
                        const isShared = agent?.enable_sleeptime && sharedOwners.length > 1;
                        const blkLen = String(b.value || '').length;
                        const isActive = activeMemoryIdx === idx;

                        return (
                          <AccordionTab
                            key={b.id ?? b.label}
                            isActive={isActive}
                            onToggle={() => setActiveMemoryIdx(isActive ? null : idx)}
                            header={
                              <div className="flex items-center gap-2">
                                <span>{b.label}</span>
                                <span className="text-xs text-base-content/60">
                                  ({formatShort(estimateTokens(blkLen))})
                                </span>
                                {isShared && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    shared
                                  </span>
                                )}
                              </div>
                            }
                          >
                            <div className="text-xs whitespace-pre-wrap max-h-48 overflow-auto font-mono">
                              {b.value}
                            </div>
                          </AccordionTab>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Archives */}
                <div>
                  <div className="text-xs font-semibold text-base-content/60 mb-2">Archival Memories</div>
                  <input
                    placeholder="Search archives..."
                    value={archiveQuery}
                    onChange={(e) => setArchiveQuery(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-base-300 rounded mb-2"
                  />
                  {(() => {
                    const filtered = (agent.archives || []).filter((a: any) => 
                      String(a.name || '').toLowerCase().includes(archiveQuery.toLowerCase())
                    );
                    if (filtered.length === 0) return <div className="text-xs text-base-content/60">No archives</div>;
                    return (
                      <ul className="text-xs space-y-0.5">
                        {filtered.map((a: any) => <li key={a.id}>{a.name}</li>)}
                      </ul>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* SLEEPTIME SECTION */}
            {agent.enable_sleeptime && (
              <div className="mt-4 bg-base-100 border border-base-300 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-base-content mb-3 flex items-center gap-2">
                  💤 Sleeptime Variant
                </h3>

                {sleeptimeLoading && <div className="text-base-content/60 text-sm">Loading sleeptime details...</div>}
                {sleeptimeError && <div className="text-error text-sm">Error: {sleeptimeError}</div>}
                {!sleeptimeLoading && !sleeptimeError && !sleeptimeAgent && (
                  <div className="text-base-content/60 text-sm">No sleeptime agent found sharing memory with this agent.</div>
                )}

                {sleeptimeAgent && (
                  <div className="grid grid-cols-3 gap-4">
                    {/* Sleeptime Agent Info */}
                    <div>
                      <div className="text-sm font-medium mb-2">
                        {sleeptimeAgent.name ?? sleeptimeAgent.id}
                        {sleeptimeAgent.metadata?.agentKey && (
                          <span className="text-base-content/60 font-normal"> ({sleeptimeAgent.metadata.agentKey})</span>
                        )}
                      </div>
                      
                      <div className="text-xs font-semibold text-base-content/60 mb-1">Attached Archives</div>
                      {(!sleeptimeAgent.archives || sleeptimeAgent.archives.length === 0) ? (
                        <div className="text-xs text-base-content/60">No archives</div>
                      ) : (
                        <ul className="text-xs space-y-0.5">
                          {sleeptimeAgent.archives.map((a: any) => <li key={a.id}>{a.name}</li>)}
                        </ul>
                      )}
                    </div>

                    {/* Sleeptime Memory Blocks */}
                    <div>
                      <div className="text-xs font-semibold text-base-content/60 mb-2">Memory Blocks</div>
                      {(!sleeptimeAgent.memoryBlocks || sleeptimeAgent.memoryBlocks.length === 0) ? (
                        <div className="text-xs text-base-content/60">No memory blocks</div>
                      ) : (
                        <div className="space-y-1">
                          {(sleeptimeAgent.memoryBlocks || []).map((b: any, idx: number) => {
                            const sharedOwners = Array.isArray(b?.metadata?.sharedOwners) ? b.metadata.sharedOwners : [];
                            const isShared = sharedOwners.length > 1;
                            const blkLen = String(b.value || '').length;
                            const isActive = sleeptimeActiveMemoryIdx === idx;

                            return (
                              <AccordionTab
                                key={b.id ?? b.label}
                                isActive={isActive}
                                onToggle={() => setSleeptimeActiveMemoryIdx(isActive ? null : idx)}
                                header={
                                  <div className="flex items-center gap-2">
                                    <span>{b.label}</span>
                                    <span className="text-xs text-base-content/60">
                                      ({formatShort(estimateTokens(blkLen))})
                                    </span>
                                    {isShared && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                        shared
                                      </span>
                                    )}
                                  </div>
                                }
                              >
                                <div className="text-xs whitespace-pre-wrap max-h-32 overflow-auto font-mono">
                                  {b.value}
                                </div>
                              </AccordionTab>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Sleeptime Tools */}
                    <div>
                      <div className="text-xs font-semibold text-base-content/60 mb-2">
                        Tools ({sleeptimeAgent.tools?.length || 0})
                      </div>
                      {(!sleeptimeAgent.tools || sleeptimeAgent.tools.length === 0) ? (
                        <div className="text-xs text-base-content/60">No tools attached</div>
                      ) : (
                        <ul className="text-xs space-y-0.5">
                          {sleeptimeAgent.tools.map((tool: any) => {
                            const tags = tool.tags || [];
                            const isCustom = tags.includes('ai-flowstack') || tags.includes('custom');
                            const isBase = tags.includes('base') || (!isCustom && tags.length === 0);
                            return (
                              <li key={tool.id} className="flex items-center gap-1">
                                <span className="text-primary">{tool.name}</span>
                                {isCustom && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-success/10 text-success">custom</span>
                                )}
                                {isBase && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-error/10 text-error">base</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
