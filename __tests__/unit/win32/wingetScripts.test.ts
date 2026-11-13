import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  getWinGetDetectionScript,
  getWinGetInstallCommand,
  getWinGetScripts,
  getWinGetUninstallCommand,
} from "@/lib/win32/wingetScripts";
import { getWin32AppTemplates } from "@/templates/win32Apps";

const require = createRequire(import.meta.url);
const { compareWinGetVersions } = require("../../../scripts/winget-catalog.js");

const STARTER_APPS = getWin32AppTemplates().filter((template) => template.packageUrl && template.winget);
const NOTEPAD = { packageIdentifier: "Notepad++.Notepad++", displayName: "Notepad++", publisher: "Don Ho" };

describe("WinGet wrapper scripts for the latest version", () => {
  it("covers the four starter apps", () => {
    expect(STARTER_APPS.map((template) => template.id).sort()).toEqual([
      "7-zip",
      "google-chrome",
      "mozilla-firefox",
      "visual-studio-code",
    ]);
  });

  it.each(STARTER_APPS.map((template) => [template.id, template] as const))(
    "generates byte-identical scripts for %s",
    (id, template) => {
      const scripts = getWinGetScripts(template.winget!);
      const directory = path.join(process.cwd(), "public/win32-apps", id);
      const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

      expect(scripts.install).toBe(read("Install-WinGetPackage.ps1"));
      expect(scripts.uninstall).toBe(read("Uninstall-WinGetPackage.ps1"));
      expect(scripts.detection).toBe(read("Detect-WinGetPackage.ps1"));
    },
  );
});

describe("WinGet wrapper scripts for a pinned version", () => {
  const pinned = getWinGetScripts(NOTEPAD, "8.9.9");
  const latest = getWinGetScripts(NOTEPAD);

  it("pins the install command and leaves the uninstall command as it is", () => {
    expect(getWinGetInstallCommand("Notepad++.Notepad++", "8.9.9")).toBe(
      "winget install --id Notepad++.Notepad++ --exact --version 8.9.9 --silent --scope machine --accept-package-agreements --accept-source-agreements",
    );
    expect(pinned.install).toContain(
      "$wingetCommand = 'winget install --id Notepad++.Notepad++ --exact --version 8.9.9 --silent --scope machine",
    );
    expect(pinned.install.replace(" --version 8.9.9", "")).toBe(latest.install);
    expect(pinned.uninstall).toBe(latest.uninstall);
    expect(getWinGetUninstallCommand("Notepad++.Notepad++")).toBe(
      "winget uninstall --id Notepad++.Notepad++ --exact --scope machine --silent",
    );
  });

  it("detects this version or newer from winget list and the uninstall registry", () => {
    expect(pinned.detection).toContain("$MinimumVersion = '8.9.9'");
    expect(pinned.detection).toContain("$PackageIdentifierPattern = 'Notepad\\+\\+\\.Notepad\\+\\+'");
    expect(pinned.detection).toContain("function Compare-WinGetVersion {");
    expect(pinned.detection).toContain("$listedVersion = Get-WinGetListedVersion -Output $installed");
    expect(pinned.detection).toContain("if (Test-WinGetVersionAtLeast -Version $listedVersion) {");
    expect(pinned.detection).toContain(
      "if (Test-WinGetVersionAtLeast -Version ([string]$application.DisplayVersion)) {",
    );
    expect(pinned.detection).not.toContain("if ($installed -match $PackageIdentifierPattern) {");
    expect(latest.detection).not.toContain("MinimumVersion");
  });

  it("refuses a version or an identifier that is not safe for the command line", () => {
    for (const version of ["1.0 --force", "1.0'", "", "1;calc", "-1"]) {
      expect(() => getWinGetScripts(NOTEPAD, version)).toThrow(/cannot be pinned|not a version/);
    }
    expect(() => getWinGetInstallCommand("Bad Id")).toThrow(/not a valid WinGet package identifier/);
  });

  it("quotes values for PowerShell single-quoted strings", () => {
    const script = getWinGetDetectionScript({ packageIdentifier: "Contoso.Tool", displayName: "O'Brien Tool", publisher: "O'Brien" });
    expect(script).toContain("$DisplayName = 'O''Brien Tool'");
    expect(script).toContain("$Publisher = 'O''Brien'");
  });
});

const VERSION_PAIRS: Array<[string, string]> = [
  ["1.10", "1.9"],
  ["2024.10", "2024.1"],
  ["24.09", "24.9"],
  ["1.0", "1"],
  ["1.0.0.0", "1"],
  ["1.2.3.4", "1.2.3"],
  ["10.0", "9.99"],
  ["0.102.3101", "0.101.2362.0"],
  ["26288.2004.5269.3420", "26276.513.5241.9675"],
  ["20240101.1", "2024.1"],
  ["v1.2", "1.2"],
  ["V2.0", "1.9"],
  ["1.1-beta", "1.1"],
  ["1.0-beta", "1.0"],
  ["1.2a", "1.2b"],
  ["1.2A", "1.2a"],
  ["1.0-rc.2", "1.0-rc.10"],
  ["beta.1", "0.1"],
  ["2.0 ", " 2.0"],
  ["1..2", "1.0.2"],
  ["99999999999999999999", "1"],
  ["18446744073709551615", "18446744073709551614"],
  ["1.2_x", "1.2a"],
  ["", "0"],
  ["160.0", "159.0.1"],
  ["2026-11-05", "2026-11-04"],
];

const pwshAvailable = spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status === 0;

/** The PowerShell functions of the pinned detection script, without the script body. */
function detectionFunctions(minimumVersion: string): string {
  const script = getWinGetDetectionScript(NOTEPAD, minimumVersion);
  const start = script.indexOf("function ConvertTo-WinGetVersionParts {");
  const end = script.indexOf("function Test-InstalledApplicationRegistry {");
  return [
    "$PackageIdentifier = 'Notepad++.Notepad++'",
    "$PackageIdentifierPattern = 'Notepad\\+\\+\\.Notepad\\+\\+'",
    `$MinimumVersion = '${minimumVersion}'`,
    script.slice(start, end),
  ].join("\n");
}

describe.skipIf(!pwshAvailable)("version comparison inside the detection script (PowerShell)", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "winget-detect-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  function runPowerShell(body: string): unknown {
    const file = path.join(directory, `run-${Math.random().toString(36).slice(2)}.ps1`);
    writeFileSync(file, body);
    const output = execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", file], { encoding: "utf8" });
    return JSON.parse(output);
  }

  it("orders versions exactly like the catalog comparison", () => {
    const pairs = VERSION_PAIRS.flatMap(([a, b]) => [[a, b], [b, a], [a, a]]);
    const body = [
      detectionFunctions("1.0"),
      `$pairs = '${JSON.stringify(pairs).replace(/'/g, "''")}' | ConvertFrom-Json`,
      "$results = foreach ($pair in $pairs) { [int](Compare-WinGetVersion -Left $pair[0] -Right $pair[1]) }",
      "ConvertTo-Json -InputObject @($results) -Compress",
    ].join("\n");

    const results = runPowerShell(body) as number[];
    expect(results).toEqual(pairs.map(([a, b]) => Math.sign(compareWinGetVersions(a, b))));
  });

  it("accepts the pinned version and newer versions, and rejects older or missing versions", () => {
    const cases: Array<[string, string | null, boolean]> = [
      ["8.9.9", "8.9.9", true],
      ["8.9.9", "8.9.9.0", true],
      ["8.9.9", "8.9.9.1", true],
      ["8.9.9", "9.0", true],
      ["8.9.9", "8.9.8.1", false],
      ["8.9.9", "8.9", false],
      ["8.9.9", "", false],
      ["8.9.9", null, false],
      ["157.0.8103.79", "158.0.1.2", true],
      ["157.0.8103.79", "157.0.8103.78", false],
      ["1.1", "1.1-beta", false],
    ];
    const body = cases
      .map(([minimum, installed]) =>
        [
          `$MinimumVersion = '${minimum}'`,
          `[bool](Test-WinGetVersionAtLeast -Version ${installed === null ? "$null" : `'${installed}'`})`,
        ].join("\n"),
      )
      .join("\n");
    const results = runPowerShell(
      `${detectionFunctions("0")}\n$values = & {\n${body}\n}\nConvertTo-Json -InputObject @($values) -Compress`,
    ) as boolean[];
    expect(results).toEqual(cases.map(([, , expected]) => expected));
  });

  it("reads the installed version from winget list output", () => {
    const output = [
      "Name      Id                  Version Available Source",
      "------------------------------------------------------",
      "Notepad++ Notepad++.Notepad++ 8.9.9.1 8.9.10   winget",
    ];
    const truncated = ["Notepad++ Notepad++.Notepad++ 8.9.9.1234…"];
    const missing = ["No installed package found matching input criteria."];
    const body = [
      detectionFunctions("8.9.9"),
      `$a = Get-WinGetListedVersion -Output @(${output.map((line) => `'${line}'`).join(",")})`,
      `$b = Get-WinGetListedVersion -Output @(${truncated.map((line) => `'${line}'`).join(",")})`,
      `$c = Get-WinGetListedVersion -Output @(${missing.map((line) => `'${line}'`).join(",")})`,
      "ConvertTo-Json -InputObject @($a, $b, $c) -Compress",
    ].join("\n");

    expect(runPowerShell(body)).toEqual(["8.9.9.1", null, null]);
  });

  it("parses the full pinned detection script without errors", () => {
    const file = path.join(directory, "Detect-WinGetPackage.ps1");
    writeFileSync(file, getWinGetDetectionScript(NOTEPAD, "8.9.9"));
    const errors = execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        `$e = $null; [System.Management.Automation.Language.Parser]::ParseFile('${file}', [ref]$null, [ref]$e) | Out-Null; $e.Count`,
      ],
      { encoding: "utf8" },
    );
    expect(errors.trim()).toBe("0");
  });
});
