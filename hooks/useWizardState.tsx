"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { WizardState, OperationMode, TaskCategory, TenantConfig, CISCategoryId, BaselineSelection, CategorySelections } from "@/types/hydration";
import { PrerequisiteCheckResult } from "@/types/prerequisites";

interface WizardContextType {
  state: WizardState;
  setCurrentStep: (step: number) => void;
  setTenantConfig: (config: TenantConfig) => void;
  setOperationMode: (mode: OperationMode) => void;
  setIsPreview: (isPreview: boolean) => void;
  setSelectedTargets: (targets: TaskCategory[]) => void;
  setSelectedCISCategories: (categories: CISCategoryId[]) => void;
  setBaselineSelection: (selection: BaselineSelection) => void;
  setCategorySelections: (selections: CategorySelections) => void;
  setConfirmed: (confirmed: boolean) => void;
  setPrerequisiteResult: (result: PrerequisiteCheckResult) => void;
  resetWizard: () => void;
  nextStep: () => void;
  previousStep: () => void;
}

const WizardContext = createContext<WizardContextType | undefined>(undefined);

const initialState: WizardState = {
  currentStep: 1,
  isPreview: true,
  selectedTargets: [],
  selectedCISCategories: [],
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

  const setIsPreview = (isPreview: boolean) => {
    setState((prev) => ({ ...prev, isPreview }));
  };

  const setSelectedTargets = (targets: TaskCategory[]) => {
    setState((prev) => ({ ...prev, selectedTargets: targets }));
  };

  const setSelectedCISCategories = (categories: CISCategoryId[]) => {
    setState((prev) => ({ ...prev, selectedCISCategories: categories }));
  };

  const setBaselineSelection = (selection: BaselineSelection) => {
    setState((prev) => ({ ...prev, baselineSelection: selection }));
  };

  const setCategorySelections = (selections: CategorySelections) => {
    setState((prev) => ({ ...prev, categorySelections: selections }));
  };

  const setConfirmed = (confirmed: boolean) => {
    setState((prev) => ({ ...prev, confirmed }));
  };

  const setPrerequisiteResult = (result: PrerequisiteCheckResult) => {
    setState((prev) => ({ ...prev, prerequisiteResult: result }));
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
        setIsPreview,
        setSelectedTargets,
        setSelectedCISCategories,
        setBaselineSelection,
        setCategorySelections,
        setConfirmed,
        setPrerequisiteResult,
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
