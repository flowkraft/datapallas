"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
// lucide-react removed

/**
 * Wraps a single explore-data widget. When the child throws during render or
 * inside a lifecycle method, the rest of the canvas keeps working; this
 * widget slot shows a compact error card with a retry button.
 *
 * React Error Boundaries can only be class components — this is the sole
 * class component in the explore-data folder, kept minimal on purpose.
 *
 * The caller should pass `resetKey={widgetId}` so changing the active widget
 * inside a slot (e.g. swapping viz types) auto-clears any prior error without
 * requiring the user to click retry.
 */
interface WidgetErrorBoundaryProps {
  children: ReactNode;
  /** When this changes, the boundary clears any error and re-renders. */
  resetKey?: string | number;
}

interface WidgetErrorBoundaryState {
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  state: WidgetErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: WidgetErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the full stack so it's visible in browser console without the
    // user having to expand the card. Canvas keeps working either way.
    console.error("[widget-error]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error.message || error.name || "Unknown error";
    return (
      <div className="flex h-full w-full items-center justify-center p-3 overflow-auto">
        <div className="max-w-full w-full">
          <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 mt-0.5 text-error shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-base-content">This widget crashed</div>
              <div className="mt-1 text-[11px] text-base-content/60 break-words">{message}</div>
              <button
                type="button"
                onClick={this.handleReset}
                className="mt-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-base-content hover:bg-base-200 border border-base-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg> Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
