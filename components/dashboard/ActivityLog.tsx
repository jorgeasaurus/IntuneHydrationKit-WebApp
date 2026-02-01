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
  info: <Info className="h-3.5 w-3.5 text-blue-500" />,
  progress: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

const MESSAGE_COLORS: Record<ActivityMessage["type"], string> = {
  info: "text-muted-foreground",
  progress: "text-blue-600 dark:text-blue-400",
  success: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
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
          <Terminal className="h-4 w-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className="h-[200px] overflow-y-auto rounded-md border bg-muted/30 p-3"
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
                <span className="text-muted-foreground opacity-60 flex-shrink-0">
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
