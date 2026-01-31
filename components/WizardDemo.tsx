"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Settings, Play, FileCheck } from "lucide-react";

const steps = [
  { id: 1, label: "Connect", icon: Settings },
  { id: 2, label: "Configure", icon: Settings },
  { id: 3, label: "Deploy", icon: Play },
  { id: 4, label: "Complete", icon: FileCheck },
];

const mockTasks = [
  "Creating Dynamic Groups...",
  "Deploying Compliance Policies...",
  "Setting up Device Filters...",
  "Configuring Conditional Access...",
  "Applying Security Baselines...",
];

export function WizardDemo() {
  const [currentStep, setCurrentStep] = useState(1);
  const [taskIndex, setTaskIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= 4) {
          setProgress(0);
          setTaskIndex(0);
          return 1;
        }
        return prev + 1;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentStep === 3) {
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 100;
          return prev + 2;
        });
      }, 50);

      const taskInterval = setInterval(() => {
        setTaskIndex((prev) => (prev + 1) % mockTasks.length);
      }, 600);

      return () => {
        clearInterval(progressInterval);
        clearInterval(taskInterval);
      };
    }
  }, [currentStep]);

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Browser Frame */}
      <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-xs text-muted-foreground font-mono">
              Intune Hydration Kit
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[280px]">
          {/* Step Indicator */}
          <div className="flex justify-between mb-8">
            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center gap-2">
                <motion.div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    currentStep >= step.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                  animate={{
                    scale: currentStep === step.id ? [1, 1.1, 1] : 1,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {currentStep > step.id ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </motion.div>
                <span
                  className={`text-xs font-medium ${
                    currentStep >= step.id
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="h-10 bg-muted rounded-md flex items-center px-3">
                  <span className="text-sm text-muted-foreground">
                    contoso.onmicrosoft.com
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="h-10 flex-1 bg-primary/20 rounded-md animate-pulse" />
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {["Configuration Profiles", "Compliance Policies", "Security Baselines", "Dynamic Groups"].map(
                  (item, i) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-5 h-5 rounded border-2 border-primary bg-primary flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                      </div>
                      <span className="text-sm">{item}</span>
                    </motion.div>
                  )
                )}
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Circle className="w-3 h-3 text-primary animate-pulse" />
                  <span className="text-muted-foreground">
                    {mockTasks[taskIndex]}
                  </span>
                </div>
              </motion.div>
            )}

            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                </motion.div>
                <div>
                  <p className="font-semibold">Deployment Complete</p>
                  <p className="text-sm text-muted-foreground">
                    927 objects created successfully
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Decorative glow */}
      <div className="absolute -inset-4 bg-primary/10 rounded-2xl blur-2xl -z-10" />
    </div>
  );
}
