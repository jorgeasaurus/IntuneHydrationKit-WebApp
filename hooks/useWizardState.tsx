"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { WizardState, OperationMode, TaskCategory, TenantConfig } from "@/types/hydration";

interface WizardContextType {
  state: WizardState;
  setCurrentStep: (step: number) => void;
  setTenantConfig: (config: TenantConfig) => void;
  setOperationMode: (mode: OperationMode) => void;
  setSelectedTargets: (targets: TaskCategory[]) => void;
  setConfirmed: (confirmed: boolean) => void;
  resetWizard: () => void;
  nextStep: () => void;
  previousStep: () => void;
}

const WizardContext = createContext<WizardContextType | undefined>(undefined);

const initialState: WizardState = {
  currentStep: 1,
  selectedTargets: [],
  confirmed: false,
};

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);

  const setCurrentStep = (step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const setTenantConfig = (config: TenantConfig) => {
    setState((prev) => ({ ...prev, tenantConfig: config }));
  };

  const setOperationMode = (mode: OperationMode) => {
    setState((prev) => ({ ...prev, operationMode: mode }));
  };

  const setSelectedTargets = (targets: TaskCategory[]) => {
    setState((prev) => ({ ...prev, selectedTargets: targets }));
  };

  const setConfirmed = (confirmed: boolean) => {
    setState((prev) => ({ ...prev, confirmed }));
  };

  const resetWizard = () => {
    setState(initialState);
  };

  const nextStep = () => {
    setState((prev) => ({ ...prev, currentStep: Math.min(prev.currentStep + 1, 4) }));
  };

  const previousStep = () => {
    setState((prev) => ({ ...prev, currentStep: Math.max(prev.currentStep - 1, 1) }));
  };

  return (
    <WizardContext.Provider
      value={{
        state,
        setCurrentStep,
        setTenantConfig,
        setOperationMode,
        setSelectedTargets,
        setConfirmed,
        resetWizard,
        nextStep,
        previousStep,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizardState() {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error("useWizardState must be used within a WizardProvider");
  }
  return context;
}
