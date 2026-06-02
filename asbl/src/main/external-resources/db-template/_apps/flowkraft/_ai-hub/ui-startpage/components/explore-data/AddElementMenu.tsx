"use client";

import { useState } from "react";
// lucide-react removed — heroicon wrappers replace icon components
const _TypeIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9.75v10.125a.75.75 0 0 0 1.5 0V9.75m3.75 0V19.875a.75.75 0 0 0 1.5 0V9.75m3.75 0V19.875a.75.75 0 0 0 1.5 0V9.75M4.5 4.5h15" /></svg>;
const _MinusIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>;
const _ListFilter = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>;
const _FrameIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" /></svg>;
import { useCanvasStore } from "@/lib/stores/canvas-store";
import type { WidgetType } from "@/lib/stores/canvas-store";

const ITEMS: { type: WidgetType; label: string; icon: React.ElementType; description: string }[] = [
  { type: "text", label: "Text Block", icon: _TypeIcon, description: "Notes, headings, captions" },
  { type: "divider", label: "Divider", icon: _MinusIcon, description: "Visual separator" },
  { type: "iframe", label: "iFrame", icon: _FrameIcon, description: "Embed an external page" },
  { type: "filter-pane", label: "Filter Pane", icon: _ListFilter, description: "Associative exploration" },
];

export function AddElementMenu() {
  const addWidget = useCanvasStore((s) => s.addWidget);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        id="btnAddElement"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-base-content/60 hover:bg-base-200 border border-base-300 transition-colors"
      >
        {/* Heroicon: plus */}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        Add element
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-56 rounded-md border border-base-300 bg-base-100 shadow-lg overflow-hidden">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  id={`btnAddElement-${item.type}`}
                  type="button"
                  onClick={() => { addWidget(item.type); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-base-200 transition-colors"
                >
                  <Icon className="w-4 h-4 text-base-content/60 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-base-content text-xs">{item.label}</div>
                    <div className="text-[11px] text-base-content/60 truncate">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
