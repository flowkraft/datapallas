'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
// lucide-react removed — icons replaced with inline heroicons below
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

export default function WorkspacesPage() {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(20);
  const [rightPanelWidth, setRightPanelWidth] = useState(30);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [mobilePanel, setMobilePanel] = useState<'files' | 'editor' | 'preview'>('editor');
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isCodeEditorCollapsed, setIsCodeEditorCollapsed] = useState(false);

  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [agentDirMap, setAgentDirMap] = useState<Record<string, string>>({});
  const [draggedFile, setDraggedFile] = useState<FileNode | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);

  const showPreview = selectedFile
    ? PREVIEWABLE_EXTENSIONS.has(selectedFile.path.toLowerCase().split('.').pop() || '')
    : false;

  // Reset mobile panel and code editor collapse if preview goes away
  useEffect(() => {
    if (!showPreview) {
      if (mobilePanel === 'preview') setMobilePanel('editor');
      if (isCodeEditorCollapsed) setIsCodeEditorCollapsed(false);
    }
  }, [showPreview, mobilePanel, isCodeEditorCollapsed]);

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
    async function loadWorkspaces() {
      try {
        setLoading(true);
        const res = await fetch('/api/workspace');
        if (res.ok) {
          const data = await res.json();
          const wsFiles: FileNode[] = data.files || [];
          setFiles(wsFiles);
          if (data.agentDirMap) setAgentDirMap(data.agentDirMap);

          // Auto-expand all top-level folders
          const folders = new Set<string>();
          for (const file of wsFiles) {
            const parts = file.path.split('/');
            if (parts.length > 1) folders.add(parts[0]);
          }
          setExpandedFolders(folders);

          // Auto-select first file
          if (wsFiles.length > 0) {
            setSelectedFile(wsFiles[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      } finally {
        setLoading(false);
      }
    }
    loadWorkspaces();
  }, []);

  // Build file tree structure from flat paths (supports nested folders)
  type TreeNode = {
    name: string;
    fullPath: string;
    file?: FileNode;
    children: Map<string, TreeNode>;
  };

  const rootTree = useMemo(() => {
    const root: TreeNode = { name: '', fullPath: '', children: new Map() };
    files.forEach((file) => {
      const parts = file.path.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            fullPath: parts.slice(0, i + 1).join('/'),
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      }
      current.file = file;
    });
    return root;
  }, [files]);

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);

    // Check if this is an agent folder (path like "Agents/AgentName")
    const isAgentFolder = folder.startsWith('Agents/') && folder.split('/').length === 2;

    if (newExpanded.has(folder)) {
      // Collapsing - just remove it
      newExpanded.delete(folder);
    } else {
      // Expanding
      if (isAgentFolder) {
        // Collapse all other agent folders first (accordion behavior)
        for (const path of newExpanded) {
          if (path.startsWith('Agents/') && path.split('/').length === 2 && path !== folder) {
            newExpanded.delete(path);
          }
        }
      }
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
  };

  // Select a folder (shows folder path on the right, clears file preview)
  const selectFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (!newExpanded.has(folder)) {
      // Also expand when selecting
      const isAgentFolder = folder.startsWith('Agents/') && folder.split('/').length === 2;
      if (isAgentFolder) {
        for (const p of newExpanded) {
          if (p.startsWith('Agents/') && p.split('/').length === 2 && p !== folder) {
            newExpanded.delete(p);
          }
        }
      }
      newExpanded.add(folder);
      setExpandedFolders(newExpanded);
    }
    setSelectedFile(null);
    setSelectedFolder(folder);
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

  // Convert display path to filesystem-relative path (relative to agents-output-artifacts/)
  const displayPathToFsRel = (displayPath: string): string | null => {
    if (!displayPath.startsWith('Agents/')) return null;
    const rest = displayPath.slice('Agents/'.length);
    for (const [displayName, dirName] of Object.entries(agentDirMap)) {
      if (rest.startsWith(displayName + '/')) {
        return dirName + '/' + rest.slice(displayName.length + 1);
      }
      if (rest === displayName) {
        return dirName;
      }
    }
    return null;
  };

  // Handle file drop onto a folder
  const handleFileDrop = async (file: FileNode, destFolder: string) => {
    const fileFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
    if (fileFolderPath === destFolder) return;

    const sourceFsRel = displayPathToFsRel(file.path);
    const destFsRel = displayPathToFsRel(destFolder);
    if (!sourceFsRel || !destFsRel) {
      toast.error('Cannot resolve path for move operation');
      return;
    }

    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFsRelPath: sourceFsRel, destFsRelFolder: destFsRel }),
      });
      if (res.ok) {
        toast.success(`Moved ${file.path.split('/').pop()} to ${destFolder.split('/').pop()}`);
        const refreshRes = await fetch('/api/workspace');
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setFiles(data.files || []);
          if (data.agentDirMap) setAgentDirMap(data.agentDirMap);
          setSelectedFile(null);
          setSelectedFolder(destFolder);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to move file');
      }
    } catch {
      toast.error('Failed to move file');
    }
    setDraggedFile(null);
  };

  // Render a tree node recursively
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isFile = node.file && node.children.size === 0;
    const isExpanded = expandedFolders.has(node.fullPath);
    const isSelected = isFile && selectedFile?.path === node.file?.path;
    const isDropping = !isFile && dropTargetFolder === node.fullPath;
    const isDragging = isFile && draggedFile?.path === node.file?.path;

    // Indent guides for tree depth
    const guides = Array.from({ length: depth }, (_, i) => (
      <span key={i} className="file-tree-guide" />
    ));

    // File leaf
    if (isFile) {
      return (
        <div
          key={node.fullPath}
          className={`file-tree-row${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
          onClick={() => { setSelectedFile(node.file!); setSelectedFolder(null); }}
          draggable
          onDragStart={(e) => {
            setDraggedFile(node.file!);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => { setDraggedFile(null); setDropTargetFolder(null); }}
          title={node.name}
        >
          {guides}
          <span className="file-tree-no-chevron" />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="file-tree-icon file"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
          <span className="file-tree-name">{node.name}</span>
        </div>
      );
    }

    // Folder
    const isAgentsFolder = node.fullPath === 'Agents';
    const sortedChildren = isAgentsFolder
      ? Array.from(node.children.values())
      : Array.from(node.children.values()).sort((a, b) => {
          const aIsFolder = a.children.size > 0 && !a.file;
          const bIsFolder = b.children.size > 0 && !b.file;
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.name.localeCompare(b.name);
        });

    const isAthena = node.name.toLowerCase().startsWith('athena');

    return (
      <div key={node.fullPath}>
        <div
          className={`file-tree-row${isDropping ? ' drop-target' : ''}`}
          onClick={() => selectFolder(node.fullPath)}
          onDragOver={(e) => {
            if (draggedFile) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropTargetFolder(node.fullPath);
            }
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (!related || !e.currentTarget.contains(related)) {
              setDropTargetFolder(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropTargetFolder(null);
            if (draggedFile) handleFileDrop(draggedFile, node.fullPath);
          }}
          title={node.name}
        >
          {guides}
          <span
            className={`file-tree-chevron${isExpanded ? ' expanded' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleFolder(node.fullPath); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </span>
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="file-tree-icon folder"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="file-tree-icon folder"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
          )}
          <span className={`file-tree-name${isAthena ? ' font-semibold' : ''}`}>
            {node.name}
          </span>
        </div>
        {isExpanded && sortedChildren.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8 animate-spin text-primary"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link id="btn-back-to-agents" href="/agents" className="text-primary hover:underline">
              &larr; Back
            </Link>
            <h1 id="workspaces-page-heading" className="text-xl font-bold">Oracle Output Artifacts</h1>
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
          id="file-explorer-panel"
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
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
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
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </Button>
              </div>
              <div className="file-tree">
                <div className="file-tree-header">OUTPUT ARTIFACTS</div>

                {files.length === 0 && (
                  <p className="text-xs text-base-content/60 px-3 mt-2">
                    No output artifacts found. Files will appear here as the oracles work on projects.
                  </p>
                )}

                {/* Render tree */}
                {Array.from(rootTree.children.values())
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((node) => renderTreeNode(node, 0))}
              </div>
            </div>
          )}
        </div>

        {/* Left resize handle */}
        {!isLeftPanelCollapsed && (
          <div
            className="hidden md:block w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
            onMouseDown={() => setIsDraggingLeft(true)}
          />
        )}

        {/* CENTER PANEL: Code Editor */}
        <div
          id="code-editor-panel"
          className={`overflow-hidden transition-all duration-300 ${
            mobilePanel === 'editor' ? 'block' : 'hidden'
          } md:block ${isCodeEditorCollapsed && showPreview ? 'md:!w-12 md:!min-w-[48px] md:!flex-none' : 'flex-1'}`}
        >
          {isCodeEditorCollapsed && showPreview ? (
            <div className="flex flex-col items-center py-4 h-full border-r border-base-300 bg-base-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCodeEditorCollapsed(false)}
                className="hover:bg-base-200"
                title="Show code editor"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
              </Button>
              <div className="mt-4 text-xs text-base-content/60 rotate-90 whitespace-nowrap origin-center">
                CODE
              </div>
            </div>
          ) : selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="border-b border-base-300 px-4 py-2 bg-base-200/30 flex items-center justify-between">
                <p className="text-sm font-medium text-base-content">{selectedFile.path}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyToClipboard}
                    className="hover:bg-base-200"
                    title="Copy to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                  </Button>
                  {showPreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCodeEditorCollapsed(true)}
                      className="hover:bg-base-200"
                      title="Hide code editor, expand preview"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </Button>
                  )}
                </div>
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
            <div className="h-full flex flex-col items-center justify-center text-base-content/60 gap-3 px-8">
              {selectedFolder && (
                <div className="font-mono text-xs bg-base-200 px-3 py-1.5 rounded text-base-content/60 max-w-full truncate">
                  {selectedFolder}
                </div>
              )}
              <p className="text-sm">No file selected yet, please select a file to preview</p>
            </div>
          )}
        </div>

        {/* Right resize handle + Preview panel (only for HTML/PlantUML) */}
        {showPreview && selectedFile && (
          <>
            {!isCodeEditorCollapsed && (
              <div
                className="hidden md:block w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
                onMouseDown={() => setIsDraggingRight(true)}
              />
            )}
            <div
              id="preview-panel"
              className={`border-l border-base-300 bg-base-100 overflow-y-auto ${
                mobilePanel === 'preview' ? 'block' : 'hidden'
              } md:block`}
              style={isCodeEditorCollapsed
                ? { flex: 1 }
                : { width: `${rightPanelWidth}%`, minWidth: '250px' }
              }
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
