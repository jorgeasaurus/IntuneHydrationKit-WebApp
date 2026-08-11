import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PowerShellScriptPanel } from "@/components/templates/PowerShellScriptPanel";

const SOURCE = `$ErrorActionPreference = 'Stop'
function Test-Value {
  param([string]$Path)
  if ($Path) { return $true }
}`;

describe("PowerShellScriptPanel", () => {
  it("renders PowerShell source with readable syntax tokens", () => {
    const { container } = render(
      <PowerShellScriptPanel
        id="install-script"
        title="Install script"
        content={SOURCE}
      />
    );

    const region = screen.getByRole("region", { name: "Install script" });
    expect(region).toHaveTextContent("$ErrorActionPreference = 'Stop'");
    expect(container.querySelector(".token.variable")).toHaveClass("text-cyan-200");
    expect(container.querySelector(".token.keyword")).toHaveClass("text-fuchsia-300");
    expect(container.querySelector(".token.string")).toHaveClass("text-emerald-300");
  });
});
