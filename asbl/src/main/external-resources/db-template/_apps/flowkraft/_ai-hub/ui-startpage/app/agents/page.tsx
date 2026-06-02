'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LLMProviderForm } from '@/components/llm/LLMProviderForm';
import { getSetting, setSetting, SETTING_KEYS } from '@/lib/settings';
import { DEFAULT_LLM_FULL_CONFIG, type LLMFullConfig } from '@/lib/llm-providers';

// Short descriptions for display (avoids importing heavy agent configs into client bundle)
const AGENT_DESCRIPTIONS: Record<string, string> = {
  'Athena': 'DataPallas Guru & Data Modeling/Business Analysis Expert',
  'Hephaestus': 'Backend Jobs/ETL/Automation Expert',
  'Hermes': 'Grails Guru & Web Portal Expert',
  'Pythia': 'WordPress CMS Web Portal Expert',
  'Apollo': 'Next.js Guru & Modern Web Expert',
};

// Tag prefixes that identify alternative stack agents (hidden by default)
const ALTERNATIVE_STACK_PREFIXES = ['stack:nextjs', 'stack:wordpress'];

// Sample agent data - fallback if API fails
const sampleAgents = [
  {
    id: 'agent-1',
    name: 'Research Assistant',
    tags: ['research', 'analysis', 'data'],
    description: 'Helps with research tasks, data analysis, and summarization',
    whenToUse: 'When you need to analyze data, research topics, or summarize information',
    matrixRoom: '@research-assistant:localhost',
  },
  {
    id: 'agent-2',
    name: 'Code Review Bot',
    tags: ['code', 'review', 'quality'],
    description: 'Reviews code for best practices, bugs, and improvements',
    whenToUse: 'When you need code reviews, refactoring suggestions, or quality checks',
    matrixRoom: '@code-review:localhost',
  },
  {
    id: 'agent-3',
    name: 'Documentation Writer',
    tags: ['docs', 'writing', 'technical'],
    description: 'Creates and maintains technical documentation',
    whenToUse: 'When you need to write docs, API references, or user guides',
    matrixRoom: '@doc-writer:localhost',
  },
  {
    id: 'agent-4',
    name: 'Testing Assistant',
    tags: ['testing', 'qa', 'automation'],
    description: 'Helps create tests, test plans, and QA strategies',
    whenToUse: 'When you need to write tests, create test plans, or automate testing',
    matrixRoom: '@testing-assistant:localhost',
  },
  {
    id: 'agent-5',
    name: 'DevOps Helper',
    tags: ['devops', 'deployment', 'ci/cd'],
    description: 'Assists with deployment, CI/CD, and infrastructure tasks',
    whenToUse: 'When you need help with deployments, CI/CD pipelines, or infrastructure',
    matrixRoom: '@devops-helper:localhost',
  },
];

type Agent = typeof sampleAgents[0];

type LogLine = { type: 'log' | 'error' | 'warn'; message: string; ts: string };

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showProvisionConfirm, setShowProvisionConfirm] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [logStatus, setLogStatus] = useState<'running' | 'success' | 'error'>('running');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [giveDbQueryToolToAthena, setGiveDbQueryToolToAthena] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'update' | 'provider'>('update');
  const [llmConfig, setLlmConfig] = useState<LLMFullConfig>(DEFAULT_LLM_FULL_CONFIG);
  const [llmConfigLoaded, setLlmConfigLoaded] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  // Listen for "Update Agents" triggered from the navbar settings menu
  useEffect(() => {
    const handler = () => {
      setForceUpdate(false);
      setGiveDbQueryToolToAthena(false);
      setSettingsTab('update');
      setShowUpdateConfirm(true);
    };
    window.addEventListener('trigger-update-agents', handler);
    return () => window.removeEventListener('trigger-update-agents', handler);
  }, []);

  // Load LLM provider config when the settings dialog opens
  useEffect(() => {
    if (showUpdateConfirm && !llmConfigLoaded) {
      getSetting(SETTING_KEYS.LLM_PROVIDER).then((raw) => {
        if (raw) {
          try {
            setLlmConfig(JSON.parse(raw) as LLMFullConfig);
          } catch {
            setLlmConfig(DEFAULT_LLM_FULL_CONFIG);
          }
        }
        setLlmConfigLoaded(true);
      });
    }
    if (!showUpdateConfirm) {
      setLlmConfigLoaded(false);
    }
  }, [showUpdateConfirm, llmConfigLoaded]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents');
      const data = await response.json();

      if (data.success && data.agents.length > 0) {
        // Filter out sleeptime/internal agents (Letta creates companion
        // agents named "{Name}-sleeptime" that users should never see)
        const userAgents = data.agents.filter(
          (a: any) =>
            a.metadata?.agentKey &&
            !a.name?.toLowerCase().includes('sleeptime')
        );
        // Map Letta agents to our format
        const mappedAgents = userAgents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          tags: (Array.isArray(agent.tags) && agent.tags.length > 0)
            ? agent.tags
            : (agent.metadata?.tags || []),
          description: agent.system || 'No description available',
          whenToUse: 'Contact this agent for assistance',
          matrixRoom: `@${agent.name.toLowerCase().replace(/\s+/g, '-')}:localhost`,
        }));

        // Sort: Athena first, then non-alternatives alphabetically, alternatives last
        mappedAgents.sort((a: Agent, b: Agent) => {
          const aIsAthena = a.name === 'Athena' || a.tags.includes('datapallas');
          const bIsAthena = b.name === 'Athena' || b.tags.includes('datapallas');
          if (aIsAthena && !bIsAthena) return -1;
          if (!aIsAthena && bIsAthena) return 1;

          const aIsAlt = a.tags.some((t: string) => ALTERNATIVE_STACK_PREFIXES.some(prefix => t.startsWith(prefix)));
          const bIsAlt = b.tags.some((t: string) => ALTERNATIVE_STACK_PREFIXES.some(prefix => t.startsWith(prefix)));
          if (aIsAlt && !bIsAlt) return 1;
          if (!aIsAlt && bIsAlt) return -1;

          return a.name.localeCompare(b.name);
        });

        setAgents(mappedAgents);
      } else {
        // No agents found
        setAgents([]);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to fetch agents from Letta');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionAgents = async (force: boolean = true, giveDbQuery: boolean = false) => {
    try {
      setProvisioning(true);
      setLogLines([]);
      setLogStatus('running');
      setShowLogModal(true);

      // Update .env file with saved LLM provider config before provisioning
      try {
        const envRes = await fetch('/api/llm/update-env', { method: 'POST' });
        const envData = await envRes.json();
        if (envData.success) {
          const lines: LogLine[] = [
            { type: 'log', message: `Updated .env → ${envData.provider} (model: ${envData.model})`, ts: new Date().toISOString() },
          ];
          if (envData.providerChanged) {
            lines.push({
              type: 'warn',
              message: 'Provider changed — stop and start your FlowKraft\'s AI Hub application again to apply new API keys',
              ts: new Date().toISOString(),
            });
          }
          setLogLines(prev => [...lines, ...prev]);
        } else if (envData.error) {
          setLogLines(prev => [
            { type: 'warn', message: `Could not update .env: ${envData.error}`, ts: new Date().toISOString() },
            ...prev,
          ]);
        }
      } catch {
        setLogLines(prev => [
          { type: 'warn', message: 'Could not update .env (API Provider may not be configured yet)', ts: new Date().toISOString() },
          ...prev,
        ]);
      }

      const response = await fetch('/api/agents/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, giveDbQueryToolToAthena: giveDbQuery, stream: true }),
      });

      // Non-OK response (e.g. 400 no API key configured) — fall back to JSON
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || 'Failed to provision agents', { duration: 5000 });
        setLogStatus('error');
        setLogLines([{
          type: 'error',
          message: data.message || 'Failed to provision agents',
          ts: new Date().toISOString(),
        }]);
        return;
      }

      // Stream SSE events
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'done') {
              setLogStatus(event.message === 'success' ? 'success' : 'error');
              if (event.message === 'success') {
                toast.success('DataPallas AI Crew agents provisioned successfully!');
                await fetchAgents();
              } else {
                toast.error('Provisioning completed with errors');
              }
            } else if (event.type === 'result') {
              // Result JSON stored internally, not shown as log line
            } else {
              setLogLines(prev => [
                { type: event.type, message: event.message, ts: event.ts },
                ...prev,
              ]);
            }
          } catch {
            // ignore malformed SSE events
          }
        }
      }
    } catch (error) {
      console.error('Error provisioning agents:', error);
      toast.error('Failed to provision agents. Please check if Letta server is running.');
      setLogStatus('error');
      setLogLines(prev => [
        { type: 'error', message: 'Connection error: Failed to reach provisioning service', ts: new Date().toISOString() },
        ...prev,
      ]);
    } finally {
      setProvisioning(false);
    }
  };

  // Check if an agent is an alternative stack oracle (Next.js or WordPress)
  const isAlternativeOracle = (agent: Agent): boolean => {
    return agent.tags.some(tag => ALTERNATIVE_STACK_PREFIXES.some(prefix => tag.startsWith(prefix)));
  };

  // Check if an agent is Athena
  const isAthena = (agent: Agent): boolean => {
    return agent.name === 'Athena' || agent.tags.includes('datapallas');
  };

  // Get display description for an agent
  const getDescription = (agent: Agent): string => {
    return AGENT_DESCRIPTIONS[agent.name] || agent.description;
  };

  // Filter agents based on checkbox state
  const visibleAgents = showAlternatives
    ? agents
    : agents.filter(agent => !isAlternativeOracle(agent));

  const handleChatWithAgent = (agent: Agent) => {
    // Open Element Matrix with the agent's room
    const elementUrl = `http://localhost:8441/#/room/${encodeURIComponent(agent.matrixRoom)}`;
    window.open(elementUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShowInfo = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsModalOpen(true);
  };

  const renderLogPanel = () => {
    if (!showLogModal) return null;

    const headerBg =
      logStatus === 'success'
        ? 'bg-green-700'
        : logStatus === 'error'
          ? 'bg-red-700'
          : 'bg-zinc-800';

    const handleCopy = () => {
      const text = [...logLines]
        .reverse()
        .map((l) => `[${l.ts}] [${l.type.toUpperCase()}] ${l.message}`)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => toast.success('Logs copied to clipboard'));
    };

    const handleClose = () => {
      if (!provisioning) setShowLogModal(false);
    };

    return (
      <>
        {/* Semi-transparent overlay */}
        <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />

        {/* Log panel — right half (full width on mobile) */}
        <div id="log-panel" className="fixed right-0 top-0 bottom-0 w-full md:w-1/2 z-50 flex flex-col shadow-2xl">
          {/* Header bar */}
          <div className={`${headerBg} px-4 py-3 flex items-center justify-between text-white`}>
            <div className="flex items-center gap-2">
              {/* Heroicon: command-line (terminal) */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              {logStatus === 'running' ? (
                /* Heroicon: arrow-path (spinner) */
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" id={`provision-status-${logStatus}`} className="w-5 h-5 animate-spin">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              ) : logStatus === 'success' ? (
                /* Heroicon: check-circle */
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" id={`provision-status-${logStatus}`} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ) : (
                /* Heroicon: x-circle */
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" id={`provision-status-${logStatus}`} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              )}
              <span className="font-semibold">Provisioning Logs</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-white/20 hover:bg-white/30 transition-colors"
                title="Copy logs to clipboard"
              >
                {/* Heroicon: clipboard-document */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                Copy
              </button>
              <button
                id="log-panel-close-button"
                onClick={handleClose}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-white/20 hover:bg-white/30 transition-colors ${
                  provisioning ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={provisioning}
                title={provisioning ? 'Wait for provisioning to complete' : 'Close log panel'}
              >
                {/* Heroicon: x-mark */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* Log content — newest first */}
          <div className="flex-1 bg-code-bg overflow-y-auto p-4 font-mono text-sm">
            {logLines.length === 0 ? (
              <div className="text-gray-500 text-center mt-8">Waiting for logs...</div>
            ) : (
              logLines.map((line, i) => (
                <div
                  key={i}
                  className={`py-0.5 ${
                    line.type === 'error'
                      ? 'text-red-400'
                      : line.type === 'warn'
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-600 mr-2">
                    {new Date(line.ts).toLocaleTimeString()}
                  </span>
                  {line.message}
                </div>
              ))
            )}
          </div>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center py-12">
          <p className="text-base-content/60">Loading agents...</p>
        </div>
        {renderLogPanel()}
      </div>
    );
  }

  // Show provision button if no agents exist
  if (agents.length === 0) {
    return (
      <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div id="agents-empty-state" className="text-center mb-12">
            <h1 id="agents-page-heading" className="text-4xl font-bold text-base-content mb-4">Welcome to AI Crew</h1>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              No agents found. Provision the DataPallas AI Crew to get started.
            </p>
          </div>

          {/* Provision Button */}
          <div className="flex justify-center">
            <Button
              id="btn-provision-agents"
              size="lg"
              onClick={() => setShowProvisionConfirm(true)}
              disabled={provisioning}
              className="bg-primary hover:bg-primary/90 text-primary-content px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {provisioning ? (
                <>
                  {/* Heroicon: arrow-path */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 mr-3 animate-spin">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Provisioning... (60-120s)
                </>
              ) : (
                <>
                  {/* Heroicon: rocket-launch */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 mr-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                  </svg>
                  Provision DataPallas&apos;s AI Crew Agents
                </>
              )}
            </Button>
          </div>

          {/* Info Section */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-base-100 border border-base-300 rounded-lg p-6 text-center">
              <h3 className="font-semibold text-base-content mb-2">Athena</h3>
              <p className="text-sm text-base-content/60 font-medium">DataPallas Guru & Data Architect/Expert</p>
              <p className="text-xs text-base-content/60 mt-2">Get help mastering DataPallas, designing data models, writing SQL, architecting business intelligence and reporting solutions</p>
            </div>
            <div className="bg-base-100 border border-base-300 rounded-lg p-6 text-center">
              <h3 className="font-semibold text-base-content mb-2">Hephaestus</h3>
              <p className="text-sm text-base-content/60 font-medium">Automation & Backend Expert</p>
              <p className="text-xs text-base-content/60 mt-2">Ask about scheduled jobs, ETL pipelines, cron automations, Groovy scripts, and backend integrations</p>
            </div>
            <div className="bg-base-100 border border-base-300 rounded-lg p-6 text-center">
              <h3 className="font-semibold text-base-content mb-2">Hermes</h3>
              <p className="text-sm text-base-content/60 font-medium">Grails Guru & Web Portal Expert</p>
              <p className="text-xs text-base-content/60 mt-2">Ask about building dashboards, admin panels, customer portals, and self-service web applications</p>
            </div>
          </div>

          {/* Requirements Note */}
          <div className="mt-8 bg-base-200/50 border border-base-300 rounded-lg p-6">
            <h4 className="font-semibold text-base-content mb-2">Requirements</h4>
            <p className="text-sm text-base-content/60">
              Make sure you have <code className="bg-base-100 px-2 py-1 rounded text-xs">OPENAI_API_KEY</code> and{' '}
              <code className="bg-base-100 px-2 py-1 rounded text-xs">OPENAI_API_BASE</code> configured in your{' '}
              <code className="bg-base-100 px-2 py-1 rounded text-xs">.env</code> file before provisioning.
            </p>
          </div>
        </div>

        {/* Provision Confirmation Dialog */}
        <Dialog open={showProvisionConfirm} onOpenChange={setShowProvisionConfirm}>
          <DialogContent id="dialog-provision-confirm" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Provision AI Crew?</DialogTitle>
              <DialogDescription>
                This will provision Athena, Hephaestus, Hermes, Apollo, and Pythia as your DataPallas AI Crew agents. This may take 60-120 seconds. Are you sure?
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button
                id="btn-provision-confirm-yes"
                onClick={() => {
                  setShowProvisionConfirm(false);
                  handleProvisionAgents();
                }}
                disabled={provisioning}
                className="bg-primary hover:bg-primary/90 text-primary-content"
              >
                Yes, Provision Agents
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowProvisionConfirm(false)}
                disabled={provisioning}
              >
                No
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {renderLogPanel()}
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 id="agents-page-heading" className="text-3xl font-bold text-base-content mb-2">The Oracles of Ancient Greece</h1>
            <p className="text-base-content/60">
              FlowKraft&apos;s council of AI oracles, each a master of their domain. Seek their counsel or explore their workspace.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap mt-2">
            <input
              type="checkbox"
              checked={showAlternatives}
              onChange={(e) => setShowAlternatives(e.target.checked)}
              className="rounded border-base-300 text-primary focus:ring-primary cursor-pointer"
            />
            <span className="text-xs text-base-content/60">Show Next.js &amp; WordPress Oracles</span>
          </label>
        </div>
      </div>

      {/* Agents Table */}
      <div id="agents-table" className="max-w-7xl mx-auto mb-6">
        <div className="bg-base-100 border border-base-300 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-base-200/50 px-6 py-3 border-b border-base-300">
            <div className="grid grid-cols-12 gap-4 font-semibold text-sm text-base-content/60">
              <div className="col-span-12 sm:col-span-2">Name</div>
              <div className="hidden sm:block sm:col-span-4">Description</div>
              <div className="hidden md:block md:col-span-4">Tags</div>
              <div className="col-span-12 sm:col-span-2 text-right">Actions</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-base-300">
            {visibleAgents.map((agent) => {
              const athena = isAthena(agent);
              const alternative = isAlternativeOracle(agent);
              return (
                <div
                  key={agent.id}
                  id={`agent-row-${agent.name.toLowerCase().replace(/\s+/g, '-')}`}
                  data-highlighted={athena ? 'true' : undefined}
                  className={`grid grid-cols-12 gap-4 px-6 py-4 hover:bg-base-200/30 transition-colors ${
                    athena ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  {/* Name Column */}
                  <div className="col-span-12 sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`${
                          athena
                            ? 'font-semibold text-base-content'
                            : 'font-normal text-base-content ml-3'
                        }`}
                      >
                        {agent.name}
                      </span>
                      {alternative && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-base-200 text-base-content/60">
                          alt
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description Column */}
                  <div className="hidden sm:block sm:col-span-4">
                    <p className={`text-sm ${athena ? 'text-base-content font-medium' : 'text-base-content/60'}`}>
                      {getDescription(agent)}
                    </p>
                  </div>

                  {/* Tags Column (hidden on small screens) */}
                  <div className="hidden md:block md:col-span-4">
                    <div className="flex flex-wrap gap-1">
                      {agent.tags
                        .filter(tag => !tag.startsWith('stack:'))
                        .map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-tag-bg text-tag-fg border border-tag-border"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="col-span-12 sm:col-span-2 flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleShowInfo(agent)}
                      className="text-base-content/60 hover:text-base-content"
                      title="View details"
                    >
                      {/* Heroicon: information-circle */}
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                      </svg>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleChatWithAgent(agent)}
                      className="bg-primary hover:bg-primary/90 text-primary-content"
                    >
                      {/* Heroicon: chat-bubble-left-right */}
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                      Chat
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto flex gap-3">
        <Button
          id="btn-view-workspaces"
          variant="outline"
          size="lg"
          onClick={() => router.push('/workspaces')}
          className="border-primary text-primary hover:bg-primary hover:text-primary-content"
        >
          {/* Heroicon: folder-open */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
          </svg>
          View Oracle Workspaces
        </Button>
        {/* Project dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="border-primary hover:bg-primary hover:text-primary-content"
          >
            {/* Heroicon: folder-open */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
            </svg>
            Projects
            {/* Heroicon: chevron-down */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 ml-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </Button>

          {projectDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute left-0 mt-2 w-56 bg-base-100 border border-base-300 rounded-box shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      window.open('http://localhost:8442/?workspace=/workspaces/datapallas.code-workspace', '_blank', 'noopener,noreferrer');
                      setProjectDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-sm text-left hover:bg-base-200 transition-colors flex items-center gap-3"
                  >
                    {/* Heroicon: code-bracket */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-base-content/60">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                    <span className="text-base-content">DataPallas</span>
                  </button>
                  <button
                    onClick={() => {
                      window.open('http://localhost:8442/?workspace=/workspaces/flowkraft-apps.code-workspace', '_blank', 'noopener,noreferrer');
                      setProjectDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-sm text-left hover:bg-base-200 transition-colors flex items-center gap-3"
                  >
                    {/* Heroicon: code-bracket */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-base-content/60">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                    <span className="text-base-content">The Apps</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agent Info Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedAgent?.name}</DialogTitle>
            <DialogDescription className="sr-only">
              Detailed information about {selectedAgent?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4 pt-4">
              {/* Description */}
              <div>
                <h4 className="font-semibold text-sm text-base-content/60 mb-2">Description</h4>
                <p className="text-base-content">{getDescription(selectedAgent)}</p>
              </div>

              {/* Tags */}
              <div>
                <h4 className="font-semibold text-sm text-base-content/60 mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-tag-bg text-tag-fg border border-tag-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Matrix Room */}
              <div>
                <h4 className="font-semibold text-sm text-base-content/60 mb-2">Matrix Room</h4>
                <code className="text-sm bg-base-200 px-2 py-1 rounded">
                  {selectedAgent.matrixRoom}
                </code>
              </div>

              {/* Action Button */}
              <div className="pt-4 flex justify-end">
                <Button
                  onClick={() => {
                    handleChatWithAgent(selectedAgent);
                    setIsModalOpen(false);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-content"
                >
                  {/* Heroicon: chat-bubble-left-right */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  Chat with {selectedAgent.name}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (Update Agents + API Provider tabs) */}
      <Dialog open={showUpdateConfirm} onOpenChange={setShowUpdateConfirm}>
        <DialogContent id="dialog-update-confirm" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure agent updates and LLM API provider settings
            </DialogDescription>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex border-b border-base-300 -mx-6 px-6">
            <button
              type="button"
              onClick={() => setSettingsTab('update')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                settingsTab === 'update'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/60 hover:text-base-content'
              }`}
            >
              Update Agents
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab('provider')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                settingsTab === 'provider'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-base-content/60 hover:text-base-content'
              }`}
            >
              API Provider
            </button>
          </div>

          {/* Tab: Update Agents */}
          {settingsTab === 'update' && (
            <div>
              <p className="text-sm text-base-content/60 mb-4">
                This will re-provision your AI crew agents. Existing agent configurations
                and memory blocks will be updated to match the latest definitions.
              </p>

              {/* Give db_query tool to Athena checkbox */}
              <label className="flex items-start gap-3 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={giveDbQueryToolToAthena}
                  onChange={(e) => setGiveDbQueryToolToAthena(e.target.checked)}
                  className="mt-0.5 rounded border-base-300 text-primary focus:ring-primary cursor-pointer"
                />
                <div>
                  <span className="text-sm font-medium text-base-content">Give db_query tool to Athena</span>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    When checked, Athena gets READ-ONLY access to query your
                    DataPallas database connections.{' '}
                    <strong className="text-base-content">When unchecked, no AI agent
                    has any database access whatsoever.</strong>
                  </p>
                </div>
              </label>

              {/* Force checkbox */}
              <label className="flex items-start gap-3 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceUpdate}
                  onChange={(e) => setForceUpdate(e.target.checked)}
                  className="mt-0.5 rounded border-base-300 text-primary focus:ring-primary cursor-pointer"
                />
                <div>
                  <span className="text-sm font-medium text-base-content">Force recreate</span>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Delete and recreate all agents from scratch. Use this if agents are
                    in a broken state. All conversation history will be lost.
                  </p>
                </div>
              </label>

              <div className="flex justify-end gap-3 mt-4">
                <Button
                  id="btn-update-confirm-yes"
                  onClick={() => {
                    setShowUpdateConfirm(false);
                    handleProvisionAgents(forceUpdate, giveDbQueryToolToAthena);
                  }}
                  disabled={provisioning}
                  className="bg-primary hover:bg-primary/90 text-primary-content"
                >
                  Yes, Update Agents
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowUpdateConfirm(false)}
                  disabled={provisioning}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Tab: API Provider */}
          {settingsTab === 'provider' && (
            <LLMProviderForm
              fullConfig={llmConfig}
              onSave={async (newFullConfig) => {
                await setSetting(
                  SETTING_KEYS.LLM_PROVIDER,
                  JSON.stringify(newFullConfig),
                  'LLM API provider configuration'
                );
                setLlmConfig(newFullConfig);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {renderLogPanel()}
    </div>
  );
}
