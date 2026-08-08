"use client";

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { CheckCircle2, Circle, AlertCircle, Terminal } from "lucide-react";

interface LogEntry {
  id: number;
  type: "info" | "success" | "warning" | "command";
  message: string;
  timestamp: string;
}

const COMMANDS = [
  { type: "command" as const, message: "$ hydrate --mode create --all" },
  { type: "info" as const, message: "Connecting to Microsoft Graph..." },
  { type: "success" as const, message: "Authentication successful" },
  { type: "info" as const, message: "Fetching existing tenant objects..." },
  { type: "info" as const, message: "Building task queue (927 objects)..." },
  { type: "success" as const, message: "Created: Dynamic Group - All Windows Devices" },
  { type: "success" as const, message: "Created: Dynamic Group - All macOS Devices" },
  { type: "success" as const, message: "Created: Device Filter - Corporate Windows" },
  { type: "success" as const, message: "Created: Compliance Policy - Windows 11 Baseline" },
  { type: "warning" as const, message: "Skipped: Device Filter - BYOD iOS (exists)" },
  { type: "success" as const, message: "Created: Settings Catalog - BitLocker" },
  { type: "success" as const, message: "Created: Settings Catalog - Windows Update" },
  { type: "success" as const, message: "Created: CA Policy - Require MFA (disabled)" },
  { type: "success" as const, message: "Created: App Protection - iOS MAM" },
  { type: "info" as const, message: "Processing batch 12/47..." },
  { type: "success" as const, message: "Created: Enrollment Profile - Windows Autopilot" },
];

const FINAL_STATS = {
  total: 927,
  created: 888,
  skipped: 39,
  failed: 0,
  duration: "8m 42s",
};

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createLogEntry(command: (typeof COMMANDS)[number]): LogEntry {
  return {
    id: Date.now(),
    type: command.type,
    message: command.message,
    timestamp: getTimestamp(),
  };
}

function getLogIcon(type: LogEntry["type"]) {
  switch (type) {
    case "success":
      return <CheckCircle2 className="size-3.5 text-signal-success" />;
    case "warning":
      return <AlertCircle className="size-3.5 text-signal-warning" />;
    case "command":
      return <Terminal className="size-3.5 text-electric" />;
    default:
      return <Circle className="size-3.5 text-muted-foreground" />;
  }
}

function getLogColor(type: LogEntry["type"]) {
  switch (type) {
    case "success":
      return "text-signal-success";
    case "warning":
      return "text-signal-warning";
    case "command":
      return "text-electric font-semibold";
    default:
      return "text-muted-foreground";
  }
}

export function TerminalDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phase, setPhase] = useState<"running" | "complete">("running");
  const [progress, setProgress] = useState(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logIndexRef = useRef(0);

  useEffect(() => {
    if (phase !== "running") {
      return;
    }

    let logIndex = logIndexRef.current;
    const addLog = () => {
      if (logIndex < COMMANDS.length) {
        const cmd = COMMANDS[logIndex];
        setLogs((prev) => [
          ...prev.slice(-12), // Keep last 12 entries
          createLogEntry(cmd),
        ]);
        setProgress(Math.min(100, Math.round((logIndex / COMMANDS.length) * 100)));
        logIndex++;
        logIndexRef.current = logIndex;
      } else {
        // Show completion
        setPhase("complete");
        clearInterval(interval);

      }
    };

    const interval = setInterval(addLog, 400);

    return () => {
      clearInterval(interval);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "complete") {
      return;
    }

    const resetTimeout = setTimeout(() => {
      const firstCommand = COMMANDS[0];
      setLogs([createLogEntry(firstCommand)]);
      setProgress(0);
      logIndexRef.current = 1;
      setPhase("running");
    }, 5000);

    return () => clearTimeout(resetTimeout);
  }, [phase]);

  // Auto-scroll to bottom within container only
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative">
      {/* Terminal Window */}
      <div className="terminal-block rounded-lg overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <div className="terminal-header">
          <div className="flex gap-2">
            <div className="terminal-dot terminal-dot-red" />
            <div className="terminal-dot terminal-dot-yellow" />
            <div className="terminal-dot terminal-dot-green" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-xs font-mono text-muted-foreground">
              intune-hydration-kit
            </span>
          </div>
          <div className="w-16" />
        </div>

        {/* Terminal Content */}
        <div
          ref={logsContainerRef}
          className="p-4 bg-background min-h-[320px] max-h-[320px] overflow-y-auto"
        >
          <AnimatePresence mode="wait">
            {phase === "running" ? (
              <m.div
                key="running"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1 font-mono text-xs"
              >
                {logs.map((log) => (
                  <m.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2"
                  >
                    <span className="text-muted-foreground/50 w-16 shrink-0">
                      {log.timestamp}
                    </span>
                    {getLogIcon(log.type)}
                    <span className={getLogColor(log.type)}>{log.message}</span>
                  </m.div>
                ))}

                {/* Blinking cursor line */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-muted-foreground/50 w-16 shrink-0">
                    {getTimestamp()}
                  </span>
                  <Circle className="size-3.5 text-muted-foreground animate-pulse" />
                  <span className="text-muted-foreground">Processing…</span>
                  <span className="terminal-cursor" />
                </div>
              </m.div>
            ) : (
              <m.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex flex-col items-center justify-center gap-y-6 text-center"
              >
                <m.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="p-4 rounded-full bg-signal-success/10 border border-signal-success/30"
                >
                  <CheckCircle2 className="size-12 text-signal-success" />
                </m.div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Hydration Complete</h3>
                  <p className="text-sm text-muted-foreground font-mono">
                    Duration: {FINAL_STATS.duration}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4 w-full max-w-xs">
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {FINAL_STATS.total}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Total
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-signal-success">
                      {FINAL_STATS.created}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Created
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-signal-warning">
                      {FINAL_STATS.skipped}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Skipped
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-signal-error">
                      {FINAL_STATS.failed}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Failed
                    </div>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-muted">
          <m.div
            className="h-full bg-gradient-to-r from-electric to-primary"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress / 100 }}
            transition={{ duration: 0.3 }}
            style={{ transformOrigin: "left" }}
          />
        </div>
      </div>

      {/* Glow Effect */}
      <div className="absolute -inset-4 bg-electric/5 rounded-2xl blur-2xl -z-10" />
      </div>
    </LazyMotion>
  );
}
