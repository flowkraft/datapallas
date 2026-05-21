'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/CodeEditor';
import { PreviewPanel } from '@/components/PreviewPanel';
import { toast } from 'sonner';

type FileNode = {
  path: string;
  type: string;
  content: string;
};

const PREVIEWABLE_EXTENSIONS = new Set(['html', 'htm', 'puml', 'plantuml', 'uml']);

export default function AgentDetailsPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(20);
  const [rightPanelWidth, setRightPanelWidth] = useState(30);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [mobilePanel, setMobilePanel] = useState<'files' | 'editor' | 'preview'>('editor');
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

  const [agentName, setAgentName] = useState<string>('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showPreview = selectedFile
    ? PREVIEWABLE_EXTENSIONS.has(selectedFile.path.toLowerCase().split('.').pop() || '')
    : false;

  // Reset mobile panel if preview goes away
  useEffect(() => {
    if (!showPreview && mobilePanel === 'preview') {
      setMobilePanel('editor');
    }
  }, [showPreview, mobilePanel]);

  // Drag resize handlers
  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const pct = (e.clientX / window.innerWidth) * 100;
        setLeftPanelWidth(Math.max(10, Math.min(40, pct)));
      }
      if (isDraggingRight) {
        const pct = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
        setRightPanelWidth(Math.max(15, Math.min(50, pct)));
      }
    };
    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingLeft, isDraggingRight]);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        setLoading(true);

        // Step 1: Fetch agent info to get name/key
        const agentRes = await fetch(`/api/agents/${agentId}`);
        if (!agentRes.ok) {
          setError('Agent not found');
          return;
        }
        const agent = await agentRes.json();
        const name = agent.name || 'Unknown Agent';
        const key = agent.metadata?.agentKey || name.toLowerCase();
        setAgentName(name);

        // Step 2: Fetch workspace files
        const wsRes = await fetch(`/api/workspace/${encodeURIComponent(key)}`);
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          const wsFiles: FileNode[] = wsData.files || [];
          setFiles(wsFiles);

          // Auto-expand all top-level folders
          const folders = new Set<string>();
          for (const file of wsFiles) {
            const parts = file.path.split('/');
            if (parts.length > 1) folders.add(parts[0]);
          }
          setExpandedFolders(folders);

          // Auto-select first file if available
          if (wsFiles.length > 0) {
            setSelectedFile(wsFiles[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load workspace:', err);
        setError('Failed to load workspace');
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, [agentId]);

  // Build file tree structure from flat paths
  const fileTree: { [key: string]: FileNode[] } = {};
  files.forEach((file: FileNode) => {
    const parts = file.path.split('/');
    if (parts.length === 1) {
      if (!fileTree['_root']) fileTree['_root'] = [];
      fileTree['_root'].push(file);
    } else {
      const folder = parts[0];
      if (!fileTree[folder]) fileTree[folder] = [];
      fileTree[folder].push(file);
    }
  });

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
  };

  const getLanguage = (type: string): string => {
    const map: { [key: string]: string } = {
      markdown: 'markdown',
      json: 'json',
      text: 'plaintext',
      html: 'markup',
      uml: 'plantuml',
      org: 'orgmode',
      groovy: 'groovy',
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
      yaml: 'yaml',
      xml: 'xml',
      css: 'css',
      sql: 'sql',
      bash: 'bash',
    };
    return map[type] || 'plaintext';
  };

  const handleCopyToClipboard = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.content).then(() => {
        toast.success('Copied to clipboard');
      });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        {/* Heroicon: arrow-path (spinner) */}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8 animate-spin text-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <Link href="/agents" className="text-primary hover:underline mb-4 inline-block">
            &larr; Back to Agents
          </Link>
          <p className="text-base-content/60">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/agents" className="text-primary hover:underline">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold">{agentName}&apos;s Workspace</h1>
            <Link
              href={`/agents/${agentId}/debug`}
              className="inline-flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content transition-colors"
              title="Debug agent"
            >
              {/* Heroicon: bug-ant */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.478 6.75 14.75c0-1.047.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44a23.916 23.916 0 0 0 1.152 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
              </svg>
              Debug
            </Link>
          </div>

          {/* Mobile Panel Selector */}
          <div className="flex md:hidden gap-1">
            <Button
              variant={mobilePanel === 'files' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMobilePanel('files')}
            >
              Files
            </Button>
            <Button
              variant={mobilePanel === 'editor' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMobilePanel('editor')}
            >
              Code
            </Button>
            {showPreview && (
              <Button
                variant={mobilePanel === 'preview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMobilePanel('preview')}
              >
                Preview
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: File Explorer */}
        <div
          className={`border-r border-base-300 bg-base-100 overflow-y-auto transition-all duration-300 ${
            mobilePanel === 'files' ? 'block' : 'hidden'
          } md:block ${isLeftPanelCollapsed ? 'md:!w-12' : ''}`}
          style={isLeftPanelCollapsed ? undefined : { width: `${leftPanelWidth}%`, minWidth: '200px' }}
        >
          {isLeftPanelCollapsed ? (
            <div className="flex flex-col items-center py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLeftPanelCollapsed(false)}
                className="hover:bg-base-200"
                title="Expand file explorer"
              >
                {/* Heroicon: chevron-right */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Button>
              <div className="mt-4 text-xs text-base-content/60 rotate-90 whitespace-nowrap origin-center">
                FILES
              </div>
            </div>
          ) : (
            <div className="relative h-full">
              <div className="absolute top-2 right-2 z-10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsLeftPanelCollapsed(true)}
                  className="hover:bg-base-200"
                  title="Collapse file explorer"
                >
                  {/* Heroicon: chevron-left */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </Button>
              </div>
              <div className="p-4">
                <h3 className="font-semibold mb-3 text-sm text-base-content/60">WORKSPACE</h3>

                {files.length === 0 && (
                  <p className="text-xs text-base-content/60 mt-4">
                    Workspace is empty. Files will appear here as {agentName} works on projects.
                  </p>
                )}

                {/* Root files */}
                {fileTree['_root']?.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-base-200 transition-colors ${
                      selectedFile?.path === file.path ? 'bg-primary/10 text-primary' : 'text-base-content'
                    }`}
                  >
                    {/* Heroicon: document-text */}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <span className="truncate">{file.path}</span>
                  </button>
                ))}

                {/* Folders */}
                {Object.keys(fileTree).filter(k => k !== '_root').sort().map((folder) => (
                  <div key={folder} className="mt-2">
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-base-200 transition-colors text-base-content"
                    >
                      {expandedFolders.has(folder) ? (
                        /* Heroicon: folder-open */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 flex-shrink-0 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                        </svg>
                      ) : (
                        /* Heroicon: folder */
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 flex-shrink-0 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                        </svg>
                      )}
                      <span className="truncate font-medium">{folder}</span>
                      {/* Heroicon: chevron-right */}
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
                           className={`w-4 h-4 ml-auto transition-transform ${expandedFolders.has(folder) ? 'rotate-90' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>

                    {expandedFolders.has(folder) && (
                      <div className="ml-4 mt-1">
                        {fileTree[folder].map((file) => {
                          const fileName = file.path.split('/').pop();
                          return (
                            <button
                              key={file.path}
                              onClick={() => setSelectedFile(file)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-base-200 transition-colors ${
                                selectedFile?.path === file.path ? 'bg-primary/10 text-primary' : 'text-base-content'
                              }`}
                            >
                              {/* Heroicon: document */}
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              <span className="truncate">{fileName}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Left resize handle */}
        {!isLeftPanelCollapsed && (
          <div
            className="hidden md:block w-1 bg-base-300 hover:bg-primary cursor-col-resize transition-colors"
            onMouseDown={() => setIsDraggingLeft(true)}
          />
        )}

        {/* CENTER PANEL: Code Editor (takes all remaining space) */}
        <div
          className={`flex-1 overflow-hidden ${
            mobilePanel === 'editor' ? 'block' : 'hidden'
          } md:block`}
        >
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="border-b border-base-300 px-4 py-2 bg-base-200/30 flex items-center justify-between">
                <p className="text-sm font-medium text-base-content">{selectedFile.path}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyToClipboard}
                  className="hover:bg-base-200"
                  title="Copy to clipboard"
                >
                  {/* Heroicon: clipboard-document */}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                <CodeEditor
                  code={selectedFile.content}
                  language={getLanguage(selectedFile.type)}
                  fileName={selectedFile.path}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-base-content/60">
              Select a file to view its contents
            </div>
          )}
        </div>

        {/* Right resize handle + Preview panel (only for HTML/PlantUML) */}
        {showPreview && selectedFile && (
          <>
            <div
              className="hidden md:block w-1 bg-base-300 hover:bg-primary cursor-col-resize transition-colors"
              onMouseDown={() => setIsDraggingRight(true)}
            />
            <div
              className={`border-l border-base-300 bg-base-100 overflow-y-auto ${
                mobilePanel === 'preview' ? 'block' : 'hidden'
              } md:block`}
              style={{ width: `${rightPanelWidth}%`, minWidth: '250px' }}
            >
              <PreviewPanel
                fileName={selectedFile.path.split('/').pop() || selectedFile.path}
                fileContent={selectedFile.content}
                language={getLanguage(selectedFile.type)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
