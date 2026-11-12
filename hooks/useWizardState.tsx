"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useMsal } from "@azure/msal-react";
import { subscribeSignOut } from "@/lib/auth/sessionEvents";
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

/**
 * Clear wizard state, including the run confirmation, when the session ends or the account or
 * tenant changes.
 * Without this, a confirmed wizard from the previous session can start a live run on /dashboard.
 */
function useResetOnSessionChange(reset: () => void): void {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  // Guest tenant profiles share one homeAccountId, so the tenant is part of the key.
  const accountKey = account ? `${account.homeAccountId}|${account.tenantId}` : null;
  const previousAccountKey = useRef(accountKey);

  useEffect(() => subscribeSignOut(reset), [reset]);

  useEffect(() => {
    const previous = previousAccountKey.current;
    previousAccountKey.current = accountKey;
    if (previous !== null && previous !== accountKey) reset();
  }, [accountKey, reset]);
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);

  const setCurrentStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const setTenantConfig = useCallback((config: TenantConfig) => {
    setState((prev) => ({ ...prev, tenantConfig: config }));
  }, []);

  const setOperationMode = useCallback((mode: OperationMode) => {
    setState((prev) => ({ ...prev, operationMode: mode }));
  }, []);

  const setIsPreview = useCallback((isPreview: boolean) => {
    setState((prev) => ({ ...prev, isPreview }));
  }, []);

  const setSelectedTargets = useCallback((targets: TaskCategory[]) => {
    setState((prev) => ({ ...prev, selectedTargets: targets }));
  }, []);

  const setSelectedCISCategories = useCallback((categories: CISCategoryId[]) => {
    setState((prev) => ({ ...prev, selectedCISCategories: categories }));
  }, []);

  const setBaselineSelection = useCallback((selection: BaselineSelection) => {
    setState((prev) => ({ ...prev, baselineSelection: selection }));
  }, []);

  const setCategorySelections = useCallback((selections: CategorySelections) => {
    setState((prev) => ({ ...prev, categorySelections: selections }));
  }, []);

  const setConfirmed = useCallback((confirmed: boolean) => {
    setState((prev) => ({ ...prev, confirmed }));
  }, []);

  const setPrerequisiteResult = useCallback((result: PrerequisiteCheckResult) => {
    setState((prev) => ({ ...prev, prerequisiteResult: result }));
  }, []);

  const resetWizard = useCallback(() => {
    setState(initialState);
  }, []);

  useResetOnSessionChange(resetWizard);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: Math.min(prev.currentStep + 1, 4) }));
  }, []);

  const previousStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: Math.max(prev.currentStep - 1, 1) }));
  }, []);

  const value = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  return (
    <WizardContext.Provider value={value}>
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
