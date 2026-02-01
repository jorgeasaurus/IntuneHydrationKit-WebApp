"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Play,
  FileCheck,
  Users,
  Shield,
  Filter,
  Loader2,
} from "lucide-react";

type Phase = "configure" | "deploying" | "complete";

const CATEGORIES = [
  { id: "groups", label: "Dynamic Groups", icon: Users, count: 47 },
  { id: "filters", label: "Device Filters", icon: Filter, count: 24 },
  { id: "compliance", label: "Compliance Policies", icon: Shield, count: 16 },
  { id: "baseline", label: "Security Baselines", icon: FileCheck, count: 795 },
];

const DEPLOYMENT_TASKS = [
  "Creating Dynamic Groups...",
  "Deploying Device Filters...",
  "Configuring Compliance Policies...",
  "Applying Security Baselines...",
  "Setting up Conditional Access...",
];

const FINAL_STATS = {
  total: 927,
  created: 888,
  skipped: 39,
  failed: 0,
};

export function WebAppDemo() {
  const [phase, setPhase] = useState<Phase>("configure");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState(0);

  // Animation cycle
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (phase === "configure") {
      // Simulate selecting categories one by one
      const selectNext = (index: number) => {
        if (index < CATEGORIES.length) {
          setSelectedCategories((prev) => [...prev, CATEGORIES[index].id]);
          timeout = setTimeout(() => selectNext(index + 1), 600);
        } else {
          // All selected, move to deploying
          timeout = setTimeout(() => setPhase("deploying"), 1000);
        }
      };
      timeout = setTimeout(() => selectNext(0), 800);
    } else if (phase === "deploying") {
      // Simulate deployment progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            setPhase("complete");
            return 100;
          }
          return prev + 2;
        });
      }, 80);

      const taskInterval = setInterval(() => {
        setCurrentTask((prev) => (prev + 1) % DEPLOYMENT_TASKS.length);
      }, 800);

      return () => {
        clearInterval(progressInterval);
        clearInterval(taskInterval);
      };
    } else if (phase === "complete") {
      // Reset after showing complete
      timeout = setTimeout(() => {
        setPhase("configure");
        setSelectedCategories([]);
        setProgress(0);
        setCurrentTask(0);
      }, 4000);
    }

    return () => clearTimeout(timeout);
  }, [phase]);

  return (
    <div className="relative">
      {/* Browser Window Frame */}
      <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Browser Chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-signal-warning/80" />
            <div className="w-3 h-3 rounded-full bg-signal-success/80" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 rounded-md bg-background/50 text-xs text-muted-foreground font-mono">
            Intune Hydration Kit
            </div>
          </div>
          <div className="w-12" />
        </div>

        {/* App Content */}
        <div className="p-5 bg-background min-h-[340px]">
          <AnimatePresence mode="wait">
            {/* Configure Phase */}
            {phase === "configure" && (
              <motion.div
                key="configure"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {/* Step Header */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Select Categories</h3>
                    <p className="text-xs text-muted-foreground">
                      Choose what to deploy
                    </p>
                  </div>
                </div>

                {/* Category Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <motion.div
                        key={cat.id}
                        initial={{ scale: 1 }}
                        animate={{
                          scale: isSelected ? [1, 1.02, 1] : 1,
                        }}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg border transition-all
                          ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card"
                          }
                        `}
                      >
                        <div
                          className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                          ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }
                        `}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                            </motion.div>
                          )}
                        </div>
                        <cat.icon className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {cat.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {cat.count} items
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Deploy Button */}
                <motion.button
                  className={`
                    w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all
                    ${
                      selectedCategories.length === CATEGORIES.length
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }
                  `}
                  animate={{
                    scale:
                      selectedCategories.length === CATEGORIES.length
                        ? [1, 1.02, 1]
                        : 1,
                  }}
                  transition={{ delay: 0.3 }}
                >
                  <Play className="w-4 h-4" />
                  Start Deployment
                </motion.button>
              </motion.div>
            )}

            {/* Deploying Phase */}
            {phase === "deploying" && (
              <motion.div
                key="deploying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {/* Step Header */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Deploying</h3>
                    <p className="text-xs text-muted-foreground">
                      Creating configurations...
                    </p>
                  </div>
                </div>

                {/* Progress Section */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-mono font-medium">{progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Current Task */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {DEPLOYMENT_TASKS[currentTask]}
                  </span>
                </div>

                {/* Live Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="text-lg font-bold font-mono text-signal-success">
                      {Math.round((progress / 100) * FINAL_STATS.created)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Created
                    </div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="text-lg font-bold font-mono text-signal-warning">
                      {Math.round((progress / 100) * FINAL_STATS.skipped)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Skipped
                    </div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="text-lg font-bold font-mono text-signal-error">
                      {FINAL_STATS.failed}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Failed
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Complete Phase */}
            {phase === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center h-[280px] text-center space-y-5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="p-4 rounded-full bg-signal-success/10 border border-signal-success/30"
                >
                  <CheckCircle2 className="h-10 w-10 text-signal-success" />
                </motion.div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold">Deployment Complete</h3>
                  <p className="text-sm text-muted-foreground">
                    All configurations deployed successfully
                  </p>
                </div>

                {/* Final Stats */}
                <div className="grid grid-cols-4 gap-3 w-full max-w-xs">
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono">
                      {FINAL_STATS.total}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Total
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-signal-success">
                      {FINAL_STATS.created}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Created
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-signal-warning">
                      {FINAL_STATS.skipped}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Skipped
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-signal-error">
                      {FINAL_STATS.failed}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">
                      Failed
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Bar at Bottom */}
        {phase === "deploying" && (
          <div className="h-1 bg-muted">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Glow Effect */}
      <div className="absolute -inset-4 bg-primary/5 rounded-2xl blur-2xl -z-10" />
    </div>
  );
}
