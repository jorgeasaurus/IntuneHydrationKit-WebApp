import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportComparison } from "@/components/dashboard/ReportComparison";

vi.mock("@/components/SensitiveData", () => ({ SensitiveData: ({ value }: { value: string }) => <span>{value}</span> }));

function reportFile(mode: string) {
  const contents = JSON.stringify({
    executionMode: mode,
    summary: { tenantId: "example", operationMode: "create", stats: { total: 1 } },
    tasks: [{ itemName: "Example policy", category: "baseline", status: "success" }],
  });
  const file = new File([contents], "report.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

describe("ReportComparison", () => {
  it("compares local reports and shows preview/live limits without network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ReportComparison />);
    fireEvent.change(screen.getByLabelText("First report"), { target: { files: [reportFile("live")] } });
    fireEvent.change(screen.getByLabelText("Second report"), { target: { files: [reportFile("preview")] } });
    expect(await screen.findByText("1 task inventory or outcome differences.")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Would create")).toBeInTheDocument();
    expect(screen.getByText("Execution mode differs between reports.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects unsupported files and clears the previous comparison", async () => {
    render(<ReportComparison />);
    fireEvent.change(screen.getByLabelText("First report"), { target: { files: [reportFile("live")] } });
    fireEvent.change(screen.getByLabelText("Second report"), { target: { files: [reportFile("preview")] } });
    await screen.findByText("1 task inventory or outcome differences.");
    fireEvent.change(screen.getByLabelText("First report"), { target: { files: [new File(["data"], "report.html")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Select a Markdown");
    await waitFor(() => expect(screen.queryByText("1 task inventory or outcome differences.")).not.toBeInTheDocument());
  });
});
