'use client';

import { useEffect, useState } from 'react';
// lucide-react removed
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  fileName: string;
  fileContent: string;
  language: string;
}

// Opens rendered content in a new browser tab (full-screen preview)
function openInBrowser(html: string, title: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function PreviewPanel({ fileName, fileContent, language }: PreviewPanelProps) {
  const [previewType, setPreviewType] = useState<'html' | 'plantuml' | 'none'>('none');
  const [processedContent, setProcessedContent] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const ext = fileName.toLowerCase().split('.').pop() || '';

    if (ext === 'html' || ext === 'htm') {
      setPreviewType('html');
      setProcessedContent(fileContent);
    } else if (ext === 'puml' || ext === 'plantuml' || ext === 'uml') {
      setPreviewType('plantuml');
      renderPlantUML(fileContent);
    } else {
      setPreviewType('none');
      setProcessedContent('');
    }
  }, [fileName, fileContent]);

  const renderPlantUML = async (content: string) => {
    try {
      const pako = await import('pako');

      const textEncoder = new TextEncoder();
      const bytes = textEncoder.encode(content);
      const deflated = pako.deflate(bytes);

      const binaryString = Array.from(deflated)
        .map((byte) => String.fromCharCode(byte))
        .join('');

      const base64 = btoa(binaryString);
      const urlSafe = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      setProcessedContent(`https://kroki.io/plantuml/svg/${urlSafe}`);
      setError('');
    } catch (err) {
      setError('Failed to encode PlantUML diagram');
      console.error('PlantUML encoding error:', err);
    }
  };

  if (previewType === 'none') {
    return (
      <div className="flex items-center justify-center h-full bg-base-200/10">
        <div className="text-center text-base-content/60">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12 mx-auto mb-4 opacity-50" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
          <p>No preview available for this file type</p>
          <p className="text-sm mt-2">Supported: HTML, PlantUML</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-error/10">
        <div className="text-center text-error">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12 mx-auto mb-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          <p className="font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-base-100">
      {previewType === 'html' && (
        <HtmlPreview content={processedContent} fileName={fileName} />
      )}
      {previewType === 'plantuml' && (
        <PlantUMLPreview url={processedContent} />
      )}
    </div>
  );
}

// Shared preview header bar with "View in Browser" button
function PreviewHeader({ label, onViewInBrowser }: { label: string; onViewInBrowser: () => void }) {
  return (
    <div className="flex justify-between items-center p-4 border-b border-base-300 bg-base-200/50 sticky top-0 z-10">
      <span className="text-sm text-base-content/60">{label}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onViewInBrowser}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mr-1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
        View in Browser
      </Button>
    </div>
  );
}

// HTML Preview Component
function HtmlPreview({ content, fileName }: { content: string; fileName: string }) {
  return (
    <div className="w-full h-full flex flex-col">
      <PreviewHeader
        label="HTML Preview"
        onViewInBrowser={() => openInBrowser(content, fileName)}
      />
      <div className="flex-1 p-4 overflow-auto">
        <iframe
          srcDoc={content}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border border-base-300 rounded-lg"
          title="HTML Preview"
        />
      </div>
    </div>
  );
}

// PlantUML Preview Component (iframe with kroki.io)
function PlantUMLPreview({ url }: { url: string }) {
  return (
    <div className="w-full h-full flex flex-col">
      <PreviewHeader
        label="PlantUML Diagram"
        onViewInBrowser={() => window.open(url, '_blank')}
      />
      <div className="flex-1 p-4 overflow-auto">
        <iframe
          src={url}
          className="w-full h-full border border-base-300 rounded-lg"
          title="PlantUML Diagram"
        />
      </div>
    </div>
  );
}
