import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DriftResult } from "@/components/drift/DriftResult";
import { getDifferenceNextStep } from "@/lib/hydration/drift/nextSteps";
import type { DriftItem, DriftReport } from "@/lib/hydration/drift/scan";

vi.mock("@/components/SensitiveData", () => ({ SensitiveData: ({ value }: { value: string }) => <span>{value}</span> }));

function item(overrides: Partial<DriftItem>): DriftItem {
  return {
    category: "filters",
    itemName: "[IHD] Filter",
    objectId: "id-1",
    objectName: "[IHD] Filter",
    marker: "present",
    comparison: { status: "matches", differences: [], reason: "Matches the template." },
    ...overrides,
  };
}

function differs(path: string, overrides: Partial<DriftItem> = {}): DriftItem {
  return item({
    comparison: {
      status: "differs",
      differences: [{ path, template: '"template value"', tenant: '"tenant value"' }],
      reason: "1 template-owned setting(s) differ from the template.",
    },
    ...overrides,
  });
}

const report: DriftReport = {
  tenantId: "tenant-1",
  scannedAt: "2026-11-13T03:18:32.094Z",
  kitObjects: [
    differs("rule", { objectId: "rule-filter", itemName: "[IHD] Rule filter", objectName: "[IHD] Rule filter" }),
    differs("platform", { objectId: "platform-filter", itemName: "[IHD] Platform filter", objectName: "[IHD] Platform filter" }),
    item({ objectId: "match-1", itemName: "[IHD] Matching group", objectName: "[IHD] Matching group", category: "groups" }),
    item({
      objectId: "app-1",
      itemName: "[IHD] App policy",
      objectName: "[IHD] App policy",
      category: "appProtection",
      comparison: { status: "cannotCompare", differences: [], reason: "App Protection settings are not compared." },
    }),
  ],
  unmarkedMatches: [],
  missing: [{ category: "compliance", itemName: "[IHD] iOS Compliance" }],
  orphans: [{ objectType: "Settings Catalog policies", objectId: "orphan-1", objectName: "[IHD] CIS policy" }],
  unchecked: [],
  orphanTypesNotChecked: [],
};

describe("getDifferenceNextStep", () => {
  it("says the kit can update a group or filter rule", () => {
    expect(getDifferenceNextStep(differs("rule")).kind).toBe("kit");
    expect(getDifferenceNextStep(differs("membershipRule", { category: "groups" })).kind).toBe("kit");
  });

  it("does not offer a kit update for a setting or a type that the kit cannot update", () => {
    expect(getDifferenceNextStep(differs("platform")).label).toBe("Delete and create again");
    const conditionalAccess = getDifferenceNextStep(differs("grantControls.operator", { category: "conditionalAccess" }));
    expect(conditionalAccess.kind).toBe("manual");
    expect(conditionalAccess.text).toMatch(/never changes a Conditional Access policy/);
    expect(getDifferenceNextStep(differs("passwordRequired", { category: "compliance" })).kind).toBe("manual");
  });
});

describe("DriftResult", () => {
  it("shows the counts and opens the findings that need a decision", () => {
    render(<DriftResult report={report} />);

    expect(screen.getByText("Drift found")).toBeInTheDocument();
    for (const [label, value] of [["Kit objects", "4"], ["Match", "1"], ["Differ", "2"], ["Not in tenant", "1"], ["No template", "1"], ["Cannot compare", "1"]]) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    }

    // Differences and missing templates are open. The other findings are closed.
    expect(screen.getByText("[IHD] Rule filter")).toBeInTheDocument();
    expect(screen.getByText("[IHD] iOS Compliance")).toBeInTheDocument();
    expect(screen.queryByText("[IHD] CIS policy")).not.toBeInTheDocument();
    expect(screen.queryByText("[IHD] Matching group")).not.toBeInTheDocument();
  });

  it("shows both values and the next step for each difference", () => {
    render(<DriftResult report={report} />);

    const ruleRow = screen.getByText("[IHD] Rule filter").closest("li") as HTMLElement;
    expect(within(ruleRow).getByText("tenant value")).toBeInTheDocument();
    expect(within(ruleRow).getByText("template value")).toBeInTheDocument();
    expect(within(ruleRow).getByText("Kit can update")).toBeInTheDocument();

    const platformRow = screen.getByText("[IHD] Platform filter").closest("li") as HTMLElement;
    expect(within(platformRow).getByText("Delete and create again")).toBeInTheDocument();
    expect(within(platformRow).queryByText("Kit can update")).not.toBeInTheDocument();
  });

  it("links a finding to the wizard and an object to the admin portal", () => {
    render(<DriftResult report={report} />);

    expect(screen.getByRole("link", { name: "Create in the wizard" })).toHaveAttribute("href", "/wizard");
    const ruleRow = screen.getByText("[IHD] Rule filter").closest("li") as HTMLElement;
    const portalLink = within(ruleRow).getByRole("link");
    expect(portalLink).toHaveAttribute("href", expect.stringContaining("https://intune.microsoft.com"));
    expect(portalLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("explains what to do with kit objects that have no template", async () => {
    render(<DriftResult report={report} />);

    await userEvent.click(screen.getByRole("button", { name: /Kit objects without a matching template/ }));
    expect(screen.getByText("[IHD] CIS policy")).toBeInTheDocument();
    expect(screen.getByText(/run the wizard in Delete mode/)).toBeInTheDocument();
  });

  it("reports no drift when every object matches and no template is missing", () => {
    render(<DriftResult report={{ ...report, kitObjects: [report.kitObjects[2]], missing: [], orphans: [] }} />);

    expect(screen.getByText("No drift found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kit objects that differ from the template/ })).toBeDisabled();
  });
});
