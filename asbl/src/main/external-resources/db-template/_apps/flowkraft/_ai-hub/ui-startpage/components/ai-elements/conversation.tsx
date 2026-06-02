"use client";

/**
 * Conversation components — AI Elements compatible.
 *
 * Provides a scrollable message thread with auto-scroll-to-bottom behavior.
 * Replace with full AI Elements via: npx ai-elements@latest add conversation
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

export function Conversation({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ConversationContent                                                 */
/* ------------------------------------------------------------------ */

export const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const ref = (forwardedRef as React.RefObject<HTMLDivElement>) || innerRef;

  // Auto-scroll to bottom when children change
  React.useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
ConversationContent.displayName = "ConversationContent";

/* ------------------------------------------------------------------ */
/* ConversationEmptyState                                              */
/* ------------------------------------------------------------------ */

interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

export function ConversationEmptyState({
  icon,
  title,
  description,
  className,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 text-center text-base-content/60",
        className,
      )}
      {...props}
    >
      {icon && <div className="text-4xl">{icon}</div>}
      <h3 className="text-lg font-medium text-base-content">{title}</h3>
      {description && <p className="max-w-sm text-sm">{description}</p>}
    </div>
  );
}
