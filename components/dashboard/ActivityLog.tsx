"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityMessage } from "@/lib/hydration/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Terminal,
} from "lucide-react";

interface ActivityLogProps {
  messages: ActivityMessage[];
  className?: string;
}

const MESSAGE_ICONS: Record<ActivityMessage["type"], React.ReactNode> = {
  info: <Info className="size-3.5 text-slate-200" />,
  progress: <Loader2 className="size-3.5 animate-spin text-sky-200" />,
  success: <CheckCircle2 className="size-3.5 text-emerald-200" />,
  warning: <AlertTriangle className="size-3.5 text-amber-200" />,
  error: <XCircle className="size-3.5 text-red-200" />,
};

const MESSAGE_COLORS: Record<ActivityMessage["type"], string> = {
  info: "text-slate-100",
  progress: "text-sky-200",
  success: "text-emerald-200",
  warning: "text-amber-200",
  error: "text-red-200",
};

export function ActivityLog({ messages, className }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="size-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className="h-[200px] overflow-y-auto rounded-md border bg-slate-950/80 p-3"
          ref={scrollRef}
        >
          <div className="space-y-1.5 font-mono text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-2",
                  MESSAGE_COLORS[msg.type]
                )}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {MESSAGE_ICONS[msg.type]}
                </span>
                <span className="flex-shrink-0 text-slate-300">
                  [{format(msg.timestamp, "HH:mm:ss")}]
                </span>
                <span className="break-words">{msg.message}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
