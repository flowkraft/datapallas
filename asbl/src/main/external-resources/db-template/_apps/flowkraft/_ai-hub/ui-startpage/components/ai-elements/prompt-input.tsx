"use client";

/**
 * PromptInput components — AI Elements compatible.
 *
 * Chat input with auto-resizing textarea and submit button.
 * Replace with full AI Elements via: npx ai-elements@latest add prompt-input
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* PromptInput                                                         */
/* ------------------------------------------------------------------ */

interface PromptInputProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  onSubmit: (message: { text: string }, event: React.FormEvent) => void;
}

export function PromptInput({ onSubmit, children, className, ...props }: PromptInputProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const text = (formData.get("prompt") as string)?.trim();
    if (text) {
      onSubmit({ text }, e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-base-300 bg-base-100 p-2 shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* PromptInputTextarea                                                 */
/* ------------------------------------------------------------------ */

interface PromptInputTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ className, onKeyDown, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const combinedRef = ref || textareaRef;

  // Auto-resize
  const resize = React.useCallback(() => {
    const el = (combinedRef as React.RefObject<HTMLTextAreaElement>).current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [combinedRef]);

  // Re-run resize when value changes externally (e.g., cleared after submit)
  React.useEffect(() => {
    resize();
  }, [props.value, resize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest("form");
      form?.requestSubmit();
    }
    onKeyDown?.(e);
  };

  return (
    <textarea
      ref={combinedRef}
      name="prompt"
      rows={1}
      onInput={resize}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none",
        "placeholder:text-base-content/60",
        className,
      )}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

/* ------------------------------------------------------------------ */
/* PromptInputSubmit                                                   */
/* ------------------------------------------------------------------ */

interface PromptInputSubmitProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status?: "ready" | "streaming" | "submitted";
}

export function PromptInputSubmit({
  status = "ready",
  disabled,
  className,
  ...props
}: PromptInputSubmitProps) {
  const isLoading = status === "streaming" || status === "submitted";

  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
        "bg-primary text-primary-content transition-colors",
        "hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        /* Heroicon: arrow-path (spinner) */
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 animate-spin">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ) : (
        /* Heroicon: paper-airplane (send) */
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
      )}
    </button>
  );
}
