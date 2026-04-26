import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WizardProvider, useWizardState } from "@/hooks/useWizardState";

describe("useWizardState", () => {
  it("defaults preview mode to enabled and restores it on reset", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WizardProvider>{children}</WizardProvider>
    );

    const { result } = renderHook(() => useWizardState(), { wrapper });

    expect(result.current.state.isPreview).toBe(true);

    act(() => {
      result.current.setIsPreview(false);
      result.current.resetWizard();
    });

    expect(result.current.state.isPreview).toBe(true);
  });

  it("updates wizard fields and clamps step navigation within bounds", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WizardProvider>{children}</WizardProvider>
    );

    const { result } = renderHook(() => useWizardState(), { wrapper });
    const prerequisiteResult = {
      organization: null,
      licenses: null,
      permissions: null,
      isValid: true,
      warnings: [],
      errors: [],
      timestamp: new Date("2025-01-01T00:00:00.000Z"),
    };

    act(() => {
      result.current.setTenantConfig({
        tenantId: "11111111-1111-1111-1111-111111111111",
        tenantName: "Contoso",
        cloudEnvironment: "global",
      });
      result.current.setOperationMode("delete");
      result.current.setSelectedTargets(["groups", "enrollment"]);
      result.current.setSelectedCISCategories(["cis-windows-11"]);
      result.current.setBaselineSelection({
        platforms: ["WINDOWS"],
        selectedPolicies: ["baseline/windows"],
        excludedPolicies: [],
      });
      result.current.setCategorySelections({
        groups: { selectedItems: ["All Devices"] },
      });
      result.current.setConfirmed(true);
      result.current.setPrerequisiteResult(prerequisiteResult);
      result.current.setCurrentStep(3);
      result.current.nextStep();
      result.current.nextStep();
      result.current.previousStep();
      result.current.previousStep();
      result.current.previousStep();
      result.current.setIsPreview(false);
    });

    expect(result.current.state).toMatchObject({
      currentStep: 1,
      tenantConfig: {
        tenantId: "11111111-1111-1111-1111-111111111111",
        tenantName: "Contoso",
        cloudEnvironment: "global",
      },
      operationMode: "delete",
      isPreview: false,
      selectedTargets: ["groups", "enrollment"],
      selectedCISCategories: ["cis-windows-11"],
      baselineSelection: {
        platforms: ["WINDOWS"],
        selectedPolicies: ["baseline/windows"],
        excludedPolicies: [],
      },
      categorySelections: {
        groups: { selectedItems: ["All Devices"] },
      },
      confirmed: true,
      prerequisiteResult,
    });
  });

  it("throws outside the provider", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useWizardState())).toThrow(
      "useWizardState must be used within a WizardProvider"
    );

    errorSpy.mockRestore();
  });
});
