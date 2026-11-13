import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import TemplatePage from "@/app/templates/[id]/page";
import { WinGetVersionsSection } from "@/components/templates/WinGetVersionsSection";
import { parseWinGetVersionCatalog, type WinGetCatalogApp } from "@/lib/winget/versionCatalog";

const originalFetch = globalThis.fetch;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/Navigation", () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterAll(() => {
  globalThis.fetch = originalFetch;
});

const APP: WinGetCatalogApp = {
  templateId: "contoso-tool",
  packageIdentifier: "Contoso.Tool",
  displayName: "Contoso Tool",
  publisher: "Contoso",
  manifestPath: "manifests/c/Contoso/Tool",
  versions: [
    {
      version: "2.0",
      latest: true,
      bestEffort: false,
      releaseDate: "2026-01-31",
      installers: [
        { architecture: "x64", installerType: "msi", nestedInstallerType: null, scope: "machine", url: "https://downloads.contoso.example/2.0/x64.msi" },
        { architecture: "arm64", installerType: "msi", nestedInstallerType: null, scope: "machine", url: "https://downloads.contoso.example/2.0/arm64.msi" },
        { architecture: "x64", installerType: "exe", nestedInstallerType: null, scope: "user", url: "https://downloads.contoso.example/2.0/x64.exe" },
      ],
    },
    {
      version: "1.9",
      latest: false,
      bestEffort: true,
      releaseDate: null,
      installers: [
        { architecture: "x86", installerType: "exe", nestedInstallerType: null, scope: null, url: "https://downloads.contoso.example/1.9/x86.exe" },
      ],
    },
  ],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("WinGetVersionsSection", () => {
  it("lists each version with its label, release date, architectures, and installer types", () => {
    render(<WinGetVersionsSection app={APP} />);

    const section = screen.getByRole("region", { name: "Available versions" });
    const table = within(section).getByRole("table", { name: "WinGet versions of Contoso Tool" });
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("rowheader")).toHaveTextContent("2.0");
    expect(rows[0]).toHaveTextContent("Latest");
    expect(rows[0]).toHaveTextContent("2026-01-31");
    expect(rows[0]).toHaveTextContent("arm64, x64");
    expect(rows[0]).toHaveTextContent("exe, msi");
    expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("1.9");
    expect(rows[1]).toHaveTextContent("Best effort");
    expect(rows[1]).toHaveTextContent("Not stated");
    expect(rows[1]).toHaveTextContent("x86");
    expect(rows[0]).toHaveTextContent("Yes");
    expect(rows[1]).toHaveTextContent("No (no machine-scope x64 installer)");
  });

  it("explains best effort and the detection rule, and offers no install action", () => {
    render(<WinGetVersionsSection app={APP} />);

    const section = screen.getByRole("region", { name: "Available versions" });
    expect(section).toHaveTextContent(/can remove or replace the download of an older version/);
    expect(section).toHaveTextContent(/this version or newer/);
    expect(section).toHaveTextContent(/a version that you\s+select/);
    expect(within(section).queryByRole("button")).toBeNull();
    expect(within(section).queryByRole("link")).toBeNull();
  });
});

describe("/templates/[id] WinGet versions", () => {
  const committed = parseWinGetVersionCatalog(
    JSON.parse(readFileSync(path.join(__dirname, "../../../public/winget-versions.json"), "utf8"))
  );

  it("shows the committed versions on a WinGet starter app page", async () => {
    render(await TemplatePage(params("win32-apps--7-zip")));

    const expected = committed.apps.find((app) => app.templateId === "7-zip");
    const section = screen.getByRole("region", { name: "Available versions" });
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(
      expected?.versions.map((version) => version.version)
    );
    expect(rows[0]).toHaveTextContent("Latest");
  });

  it("does not show versions on a template that is not a WinGet app", async () => {
    render(await TemplatePage(params("win32-apps--autopilot-branding")));

    expect(screen.queryByRole("region", { name: "Available versions" })).toBeNull();
  });
});
