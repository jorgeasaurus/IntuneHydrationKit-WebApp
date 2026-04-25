import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
