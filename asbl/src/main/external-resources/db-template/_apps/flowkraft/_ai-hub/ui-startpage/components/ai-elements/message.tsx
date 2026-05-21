"use client";

/**
 * Message components — AI Elements compatible.
 *
 * Renders individual chat messages with role-based styling.
 * Replace with full AI Elements via: npx ai-elements@latest add message
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Message                                                             */
/* ------------------------------------------------------------------ */

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant" | "system";
}

export function Message({ from = "assistant", children, className, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn(
        "group flex gap-3",
        from === "user" && "flex-row-reverse",
        from === "system" && "justify-center",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MessageAvatar                                                       */
/* ------------------------------------------------------------------ */

interface MessageAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  fallback?: string;
}

export function MessageAvatar({ fallback, className, children, ...props }: MessageAvatarProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm",
        className,
      )}
      {...props}
    >
      {children || fallback}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MessageContent                                                      */
/* ------------------------------------------------------------------ */

export function MessageContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex max-w-[85%] flex-col gap-2", className)} {...props}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MessageResponse — renders markdown text                             */
/* ------------------------------------------------------------------ */

export function MessageResponse({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none rounded-2xl px-4 py-3",
        "bg-base-200 text-base-content",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
