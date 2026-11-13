/**
 * Generate the WinGet wrapper scripts of a Win32 app in the browser.
 *
 * This is a port of the IntuneHydrationKit PowerShell module generators
 * (Private/WinGet/Get-WinGetWrapperScriptContent.ps1, Get-WinGetBootstrapScriptFragment.ps1,
 * Get-WinGetDetectionScriptContent.ps1). For an app that is not pinned to a version, the output
 * is byte-identical to the committed scripts in public/win32-apps/<id>/ (a unit test proves it).
 *
 * One difference from the module: the detection script finds winget.exe but never installs
 * App Installer. The committed detection scripts of the web app have always worked this way;
 * the module's detection script installs App Installer when winget.exe is missing.
 *
 * A pinned version changes two scripts:
 * - Install adds "--version <version>" to the winget command.
 * - Detect reports the app as installed only when the installed version is the pinned version or
 *   newer, with the WinGet version ordering of scripts/winget-catalog.js. Thus an app that updated
 *   itself is not reported as failed.
 */

import { PINNABLE_VERSION_PATTERN } from "@/lib/winget/versionText";

export const WINGET_INSTALL_SCRIPT_NAME = "Install-WinGetPackage.ps1";
export const WINGET_UNINSTALL_SCRIPT_NAME = "Uninstall-WinGetPackage.ps1";
export const WINGET_DETECTION_SCRIPT_NAME = "Detect-WinGetPackage.ps1";

const PACKAGE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

export interface WinGetScriptApp {
  packageIdentifier: string;
  /** Display name without the " - [IHD]" suffix, for the uninstall registry check. */
  displayName: string;
  publisher: string;
}

export interface WinGetScripts {
  install: string;
  uninstall: string;
  detection: string;
}

/** Get-WinGetLogDirectoryScriptFragment. */
const LOG_DIRECTORY_FRAGMENT = `function Test-HydrationWinGetLogDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        if (-not (Test-Path -Path $Path)) {
            $null = New-Item -Path $Path -ItemType Directory -Force -ErrorAction Stop
        }

        $probePath = Join-Path -Path $Path -ChildPath ("IntuneHydrationKit-LogProbe-$([guid]::NewGuid().ToString('N')).tmp")
        Set-Content -Path $probePath -Value '' -Encoding utf8 -ErrorAction Stop
        Remove-Item -Path $probePath -Force -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

function Get-HydrationWinGetLogDirectory {
    [CmdletBinding()]
    param()

    $programDataPath = if (-not [string]::IsNullOrWhiteSpace($env:ProgramData)) {
        $env:ProgramData
    } else {
        'C:\\ProgramData'
    }

    $candidatePaths = [System.Collections.Generic.List[string]]::new()
    $candidatePaths.Add((Join-Path -Path $programDataPath -ChildPath 'Microsoft\\IntuneManagementExtension\\Logs'))

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidatePaths.Add((Join-Path -Path $env:LOCALAPPDATA -ChildPath 'IntuneHydrationKit\\Logs'))
    }

    if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
        $candidatePaths.Add((Join-Path -Path $env:TEMP -ChildPath 'IntuneHydrationKit\\Logs'))
    }

    $systemTempPath = [System.IO.Path]::GetTempPath()
    if (-not [string]::IsNullOrWhiteSpace($systemTempPath)) {
        $candidatePaths.Add((Join-Path -Path $systemTempPath -ChildPath 'IntuneHydrationKit\\Logs'))
    }

    $seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($candidatePath in $candidatePaths) {
        if ([string]::IsNullOrWhiteSpace($candidatePath) -or -not $seenPaths.Add($candidatePath)) {
            continue
        }

        if (Test-HydrationWinGetLogDirectory -Path $candidatePath) {
            return $candidatePath
        }
    }

    throw 'No writable log directory was available for WinGet script execution.'
}`;

/** The log functions of the wrapper script. */
const WRAPPER_LOG_FUNCTIONS = `function Get-WinGetWrapperLogFileName {
    [CmdletBinding()]
    param()

    $safePackageIdentifier = ($packageIdentifier -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
    if ([string]::IsNullOrWhiteSpace($safePackageIdentifier)) {
        $safePackageIdentifier = 'package'
    }

    return "IntuneHydrationKit-WinGet-$operationName-$safePackageIdentifier.log"
}

function Write-WinGetWrapperLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter()]
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
    Add-Content -Path $script:logPath -Value "\`[$timestamp\`] \`[$Level\`] $Message"
}

function Write-WinGetProcessStreamToLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$Label,

        [Parameter()]
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )

    if (-not (Test-Path -Path $Path)) {
        return
    }

    $lines = @(Get-Content -Path $Path -ErrorAction SilentlyContinue)
    if ($lines.Count -eq 0) {
        return
    }

    Write-WinGetWrapperLog -Message "\${Label}:" -Level $Level
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        Write-WinGetWrapperLog -Message $line -Level $Level
    }
}

function Test-WinGetAlreadyInstalledNoUpgradeOutput {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string[]]$Output
    )

    $outputText = ($Output -join [Environment]::NewLine)
    $foundExistingPackage = $outputText -match 'Found an existing package already installed\\. Trying to upgrade the installed package'
    $noUpgradeAvailable = $outputText -match 'No available upgrade found' -or
        $outputText -match 'No newer package versions are available'

    return $foundExistingPackage -and $noUpgradeAvailable
}`;

/** Get-WinGetBootstrapScriptFragment: finds winget.exe and installs App Installer when it is missing. */
function getBootstrapFragment(logFunctionName: string, bootstrapMessage: string): string {
  return `function Get-WinGetExecutablePath {
    [CmdletBinding()]
    param()

    $programDataRoot = if ([string]::IsNullOrWhiteSpace($env:ProgramData)) { 'C:\\ProgramData' } else { $env:ProgramData }
    $programDataWingetRoot = Join-Path -Path $programDataRoot -ChildPath 'Microsoft.DesktopAppInstaller'
    $programDataWingetExe = Join-Path -Path $programDataWingetRoot -ChildPath 'winget.exe'
    $isSystem = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name -eq 'NT AUTHORITY\\SYSTEM'

    function Test-WinGetExecutable {
        param(
            [Parameter(Mandatory)]
            [string]$Path
        )

        if (-not (Test-Path -Path $Path -PathType Leaf)) {
            return $false
        }

        try {
            $versionOutput = & $Path --version 2>&1
            return $LASTEXITCODE -eq 0 -or $versionOutput -match 'v?\\d+\\.\\d+'
        } catch {
            return $false
        }
    }

    function Get-UserWinGetExecutablePath {
        [CmdletBinding()]
        param()

        $command = Get-Command -Name 'winget.exe' -ErrorAction SilentlyContinue
        if ($command -and -not [string]::IsNullOrWhiteSpace($command.Source) -and (Test-WinGetExecutable -Path $command.Source)) {
            return $command.Source
        }

        $searchPatterns = [System.Collections.Generic.List[string]]::new()

        if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
            $searchPatterns.Add((Join-Path -Path $env:LOCALAPPDATA -ChildPath 'Microsoft\\WindowsApps\\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
            $searchPatterns.Add((Join-Path -Path $env:ProgramFiles -ChildPath 'WindowsApps\\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace(\${env:ProgramFiles(x86)})) {
            $searchPatterns.Add((Join-Path -Path \${env:ProgramFiles(x86)} -ChildPath 'WindowsApps\\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\\winget.exe'))
        }

        foreach ($pattern in $searchPatterns) {
            if ([string]::IsNullOrWhiteSpace($pattern)) {
                continue
            }

            $candidateFiles = @(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue | Sort-Object -Property FullName -Descending)
            if ($candidateFiles.Count -gt 0 -and (Test-WinGetExecutable -Path $candidateFiles[0].FullName)) {
                return $candidateFiles[0].FullName
            }
        }

        return $null
    }

    function Install-WinGetSystemBootstrap {
        [CmdletBinding()]
        param()

        function Get-AppInstallerMsixPath {
            [CmdletBinding()]
            param(
                [Parameter(Mandatory)]
                [string]$Path
            )

            foreach ($filter in @('AppInstaller*_x64*.msix', 'AppInstaller*.msix')) {
                $msixPath = Get-ChildItem -Path $Path -Filter $filter -File -ErrorAction SilentlyContinue |
                    Sort-Object -Property Name -Descending |
                    Select-Object -First 1

                if ($msixPath) {
                    return $msixPath
                }
            }

            throw 'Unable to locate App Installer MSIX payload inside the downloaded bundle.'
        }

        function Invoke-WinGetBootstrapDownload {
            [CmdletBinding()]
            param(
                [Parameter(Mandatory)]
                [string]$Uri,

                [Parameter(Mandatory)]
                [string]$OutFile
            )

            $downloadParams = @{
                Uri        = $Uri
                OutFile    = $OutFile
                TimeoutSec = 120
            }

            if ($PSVersionTable.PSVersion.Major -lt 6) {
                $downloadParams.UseBasicParsing = $true
            }

            Invoke-WebRequest @downloadParams
        }

        $tempRoot = [System.IO.Path]::GetTempPath()
        if ([string]::IsNullOrWhiteSpace($tempRoot)) {
            $tempRoot = if ([string]::IsNullOrWhiteSpace($env:TEMP)) { 'C:\\Windows\\Temp' } else { $env:TEMP }
        }

        $stagingRoot = Join-Path -Path $tempRoot -ChildPath 'IntuneHydrationKit-WinGetBootstrap'
        $bundlePath = Join-Path -Path $stagingRoot -ChildPath 'Microsoft.DesktopAppInstaller.msixbundle'
        $bundleExtractPath = Join-Path -Path $stagingRoot -ChildPath 'bundle'
        $msixExtractPath = Join-Path -Path $stagingRoot -ChildPath 'appinstaller'
        $vcRedistPath = Join-Path -Path $stagingRoot -ChildPath 'vc_redist.x64.exe'

        ${logFunctionName} -Message '${bootstrapMessage}'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Add-Type -AssemblyName System.IO.Compression.FileSystem

        if (Test-Path -Path $stagingRoot) {
            Remove-Item -Path $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
        }

        foreach ($directoryPath in @($stagingRoot, $bundleExtractPath, $msixExtractPath)) {
            $null = New-Item -Path $directoryPath -ItemType Directory -Force
        }

        try {
            Invoke-WinGetBootstrapDownload -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $vcRedistPath
            $vcRedist = Start-Process -FilePath $vcRedistPath -ArgumentList '/q /norestart' -Wait -PassThru
            ${logFunctionName} -Message "VC++ bootstrap exited with code $($vcRedist.ExitCode)."
        } catch {
            ${logFunctionName} -Message "VC++ bootstrap failed: $($_.Exception.Message)" -Level 'WARN'
        }

        Invoke-WinGetBootstrapDownload -Uri 'https://aka.ms/getwinget' -OutFile $bundlePath
        [System.IO.Compression.ZipFile]::ExtractToDirectory($bundlePath, $bundleExtractPath)
        $msixPath = Get-AppInstallerMsixPath -Path $bundleExtractPath

        if (Test-Path -Path $programDataWingetRoot) {
            Remove-Item -Path $programDataWingetRoot -Recurse -Force -ErrorAction SilentlyContinue
        }

        $null = New-Item -Path $programDataWingetRoot -ItemType Directory -Force
        [System.IO.Compression.ZipFile]::ExtractToDirectory($msixPath.FullName, $msixExtractPath)
        Copy-Item -Path (Join-Path -Path $msixExtractPath -ChildPath '*') -Destination $programDataWingetRoot -Recurse -Force
        ${logFunctionName} -Message "Bootstrapped WinGet to '$programDataWingetRoot'."
    }

    if (-not $isSystem) {
        $userWingetExe = Get-UserWinGetExecutablePath
        if (-not [string]::IsNullOrWhiteSpace($userWingetExe)) {
            return $userWingetExe
        }

        if (Test-WinGetExecutable -Path $programDataWingetExe) {
            return $programDataWingetExe
        }

        throw 'winget.exe could not be located for this user context. Ensure App Installer is installed for the signed-in user or pre-bootstrap WinGet in SYSTEM context.'
    }

    if (Test-WinGetExecutable -Path $programDataWingetExe) {
        return $programDataWingetExe
    }

    Install-WinGetSystemBootstrap
    if (Test-WinGetExecutable -Path $programDataWingetExe) {
        return $programDataWingetExe
    }

    throw 'winget.exe could not be located or bootstrapped successfully for this context.'
}`;
}

/** The part of the wrapper script after the WinGet command. */
const WRAPPER_RUN_SECTION = `$argumentString = ($wingetCommand -replace '^\\s*winget(?:\\.exe)?\\s*', '').Trim()
if ([string]::IsNullOrWhiteSpace($argumentString)) {
    throw "Unable to derive WinGet arguments from command '$wingetCommand'."
}

$logDirectory = Get-HydrationWinGetLogDirectory
$logFileName = Get-WinGetWrapperLogFileName
$script:logPath = Join-Path -Path $logDirectory -ChildPath $logFileName
$baseLogName = [System.IO.Path]::GetFileNameWithoutExtension($logFileName)
$stdoutPath = Join-Path -Path $logDirectory -ChildPath "$baseLogName.stdout.log"
$stderrPath = Join-Path -Path $logDirectory -ChildPath "$baseLogName.stderr.log"

foreach ($streamPath in @($stdoutPath, $stderrPath)) {
    if (Test-Path -Path $streamPath) {
        Remove-Item -Path $streamPath -Force -ErrorAction SilentlyContinue
    }
}

Write-WinGetWrapperLog -Message "Starting $operationName for package '$packageIdentifier'."
Write-WinGetWrapperLog -Message "Resolved IME log path: $script:logPath"
Write-WinGetWrapperLog -Message "Executing WinGet command: $wingetCommand"

try {
    $wingetPath = Get-WinGetExecutablePath
    Write-WinGetWrapperLog -Message "Resolved winget executable: $wingetPath"
    $process = Start-Process -FilePath $wingetPath -ArgumentList $argumentString -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Write-WinGetProcessStreamToLog -Path $stdoutPath -Label 'WinGet standard output'
    Write-WinGetProcessStreamToLog -Path $stderrPath -Label 'WinGet standard error' -Level 'WARN'
    $standardOutput = if (Test-Path -Path $stdoutPath) { @(Get-Content -Path $stdoutPath -ErrorAction SilentlyContinue) } else { @() }
    $exitCode = [int]$process.ExitCode
    Write-WinGetWrapperLog -Message "WinGet process exited with code $exitCode."
    if ($operationName -eq 'Install' -and ($exitCode -eq -1978335189 -or (Test-WinGetAlreadyInstalledNoUpgradeOutput -Output $standardOutput))) {
        Write-WinGetWrapperLog -Message "Package already installed (no upgrade needed). Treating as success." -Level 'INFO'
        $exitCode = 0
    }
    exit $exitCode
} catch {
    Write-WinGetProcessStreamToLog -Path $stdoutPath -Label 'WinGet standard output'
    Write-WinGetProcessStreamToLog -Path $stderrPath -Label 'WinGet standard error' -Level 'WARN'
    Write-WinGetWrapperLog -Message "Wrapper execution failed: $($_.Exception.Message)" -Level 'ERROR'
    throw
}
`;

/** The log function of the detection script. */
const DETECTION_LOG_FUNCTION = `function Write-WinGetDetectionLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter()]
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )

    Write-Verbose "[$Level] $Message"
}`;

/** Finds winget.exe for detection. Unlike the wrapper fragment, it never installs App Installer. */
const DETECTION_WINGET_PATH_FRAGMENT = `function Get-WinGetExecutablePath {
    [CmdletBinding()]
    param()

    $programDataRoot = if ([string]::IsNullOrWhiteSpace($env:ProgramData)) { 'C:\\ProgramData' } else { $env:ProgramData }
    $programDataWingetRoot = Join-Path -Path $programDataRoot -ChildPath 'Microsoft.DesktopAppInstaller'
    $programDataWingetExe = Join-Path -Path $programDataWingetRoot -ChildPath 'winget.exe'
    $isSystem = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name -eq 'NT AUTHORITY\\SYSTEM'

    function Test-WinGetExecutable {
        param(
            [Parameter(Mandatory)]
            [string]$Path
        )

        if (-not (Test-Path -Path $Path -PathType Leaf)) {
            return $false
        }

        try {
            $versionOutput = & $Path --version 2>&1
            return $LASTEXITCODE -eq 0 -or $versionOutput -match 'v?\\d+\\.\\d+'
        } catch {
            return $false
        }
    }

    function Get-UserWinGetExecutablePath {
        [CmdletBinding()]
        param()

        $command = Get-Command -Name 'winget.exe' -ErrorAction SilentlyContinue
        if ($command -and -not [string]::IsNullOrWhiteSpace($command.Source) -and (Test-WinGetExecutable -Path $command.Source)) {
            return $command.Source
        }

        $searchPatterns = [System.Collections.Generic.List[string]]::new()

        if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
            $searchPatterns.Add((Join-Path -Path $env:LOCALAPPDATA -ChildPath 'Microsoft\\WindowsApps\\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
            $searchPatterns.Add((Join-Path -Path $env:ProgramFiles -ChildPath 'WindowsApps\\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace(\${env:ProgramFiles(x86)})) {
            $searchPatterns.Add((Join-Path -Path \${env:ProgramFiles(x86)} -ChildPath 'WindowsApps\\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\\winget.exe'))
        }

        foreach ($pattern in $searchPatterns) {
            if ([string]::IsNullOrWhiteSpace($pattern)) {
                continue
            }

            $candidateFiles = @(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue | Sort-Object -Property FullName -Descending)
            if ($candidateFiles.Count -gt 0 -and (Test-WinGetExecutable -Path $candidateFiles[0].FullName)) {
                return $candidateFiles[0].FullName
            }
        }

        return $null
    }

    if (-not $isSystem) {
        $userWingetExe = Get-UserWinGetExecutablePath
        if (-not [string]::IsNullOrWhiteSpace($userWingetExe)) {
            return $userWingetExe
        }

        if (Test-WinGetExecutable -Path $programDataWingetExe) {
            return $programDataWingetExe
        }

        return $null
    }

    if (Test-WinGetExecutable -Path $programDataWingetExe) {
        return $programDataWingetExe
    }

    return $null
}`;

/** Test-InstalledApplicationRegistry up to the match of an uninstall entry. */
const DETECTION_REGISTRY_FUNCTION_START = `function Test-InstalledApplicationRegistry {
    [CmdletBinding()]
    param()

    function Test-ApplicationPublisher {
        [CmdletBinding()]
        param(
            [Parameter()]
            [string]$InstalledPublisher
        )

        if ([string]::IsNullOrWhiteSpace($Publisher)) {
            return $true
        }

        if ([string]::IsNullOrWhiteSpace($InstalledPublisher)) {
            return $false
        }

        return $InstalledPublisher.IndexOf($Publisher, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }

    function Test-ApplicationDisplayName {
        [CmdletBinding()]
        param(
            [Parameter(Mandatory)]
            [string]$InstalledDisplayName
        )

        $namePatterns = @($PackageIdentifier)
        if (-not [string]::IsNullOrWhiteSpace($DisplayName)) {
            $namePatterns += $DisplayName
        }

        foreach ($namePattern in $namePatterns) {
            if ([string]::IsNullOrWhiteSpace($namePattern)) {
                continue
            }

            if ($InstalledDisplayName.Equals($namePattern, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }

            if ($InstalledDisplayName.StartsWith($namePattern, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        }

        return $false
    }

    $registryPaths = @(
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )

    foreach ($registryPath in $registryPaths) {
        $applications = Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue
        foreach ($application in $applications) {
            if ([string]::IsNullOrWhiteSpace($application.DisplayName)) {
                continue
            }

            if (-not (Test-ApplicationPublisher -InstalledPublisher $application.Publisher)) {
                continue
            }

            if (Test-ApplicationDisplayName -InstalledDisplayName $application.DisplayName) {`;

/** Test-InstalledApplicationRegistry after the match of an uninstall entry. */
const DETECTION_REGISTRY_FUNCTION_END = `            }
        }
    }

    return $false
}`;

/** The detection result for an app that is not pinned to a version. */
const DETECTION_LATEST_TAIL = `$Winget = Get-WinGetExecutablePath
$installed = if (-not [string]::IsNullOrWhiteSpace($Winget)) {
    & $Winget list --id "$PackageIdentifier" --exact --accept-source-agreements 2>&1
} else {
    @()
}
if ($installed -match $PackageIdentifierPattern) {
    Write-Output "$PackageIdentifier is installed"
    exit 0
} elseif (Test-InstalledApplicationRegistry) {
    Write-Output "$PackageIdentifier is installed"
    exit 0
} else {
    Write-Output "$PackageIdentifier is not installed"
    exit 1
}
`;

/**
 * WinGet version comparison for the detection script. It uses the same rules as
 * compareWinGetVersions in scripts/winget-catalog.js (the WinGet client Version class):
 * remove leading text before a first digit that comes before the first ".", split on ".",
 * compare each part by its number and then by its text suffix (no suffix is newer; suffixes
 * compare without case), remove trailing zero parts, and a longer version is newer.
 * [decimal] holds every unsigned 64-bit number in Windows PowerShell 5.1.
 */
const VERSION_COMPARISON_FUNCTIONS = `function ConvertTo-WinGetVersionParts {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [AllowNull()]
        [string]$Version
    )

    $text = if ($null -eq $Version) { '' } else { $Version.Trim() }
    $digitMatch = [regex]::Match($text, '[0-9]')
    $splitIndex = $text.IndexOf('.')
    if ($digitMatch.Success -and ($splitIndex -lt 0 -or $digitMatch.Index -lt $splitIndex)) {
        $text = $text.Substring($digitMatch.Index)
    }

    $maximumNumber = [decimal]::Parse('18446744073709551615', [System.Globalization.CultureInfo]::InvariantCulture)
    $parts = [System.Collections.Generic.List[object]]::new()
    foreach ($segment in $text.Split('.')) {
        $part = $segment.Trim()
        $number = [decimal]0
        $suffix = $part
        $digits = [regex]::Match($part, '^[0-9]+')
        if ($digits.Success) {
            $significantDigits = $digits.Value.TrimStart('0')
            if ($significantDigits.Length -le 20) {
                $value = if ($significantDigits.Length -eq 0) { [decimal]0 } else { [decimal]::Parse($significantDigits, [System.Globalization.CultureInfo]::InvariantCulture) }
                if ($value -le $maximumNumber) {
                    $number = $value
                    $suffix = $part.Substring($digits.Length)
                }
            }
        }

        $parts.Add([pscustomobject]@{ Number = $number; Suffix = $suffix })
    }

    while ($parts.Count -gt 0 -and $parts[$parts.Count - 1].Number -eq 0 -and $parts[$parts.Count - 1].Suffix.Length -eq 0) {
        $parts.RemoveAt($parts.Count - 1)
    }

    return ,$parts.ToArray()
}

function Compare-WinGetVersionPart {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Left,

        [Parameter(Mandatory)]
        [object]$Right
    )

    if ($Left.Number -ne $Right.Number) {
        if ($Left.Number -lt $Right.Number) { return -1 }
        return 1
    }

    if ($Left.Suffix -ceq $Right.Suffix) { return 0 }
    if ($Left.Suffix.Length -eq 0) { return 1 }
    if ($Right.Suffix.Length -eq 0) { return -1 }

    $result = [string]::CompareOrdinal($Left.Suffix.ToLowerInvariant(), $Right.Suffix.ToLowerInvariant())
    if ($result -lt 0) { return -1 }
    if ($result -gt 0) { return 1 }
    return 0
}

function Compare-WinGetVersion {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [AllowNull()]
        [string]$Left,

        [Parameter()]
        [AllowEmptyString()]
        [AllowNull()]
        [string]$Right
    )

    $leftParts = ConvertTo-WinGetVersionParts -Version $Left
    $rightParts = ConvertTo-WinGetVersionParts -Version $Right
    for ($index = 0; $index -lt $leftParts.Count; $index++) {
        if ($index -ge $rightParts.Count) { return 1 }
        $result = Compare-WinGetVersionPart -Left $leftParts[$index] -Right $rightParts[$index]
        if ($result -ne 0) { return $result }
    }

    if ($leftParts.Count -lt $rightParts.Count) { return -1 }
    return 0
}

function Test-WinGetVersionAtLeast {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [AllowNull()]
        [string]$Version
    )

    if ([string]::IsNullOrWhiteSpace($Version)) {
        return $false
    }

    return (Compare-WinGetVersion -Left $Version -Right $MinimumVersion) -ge 0
}

function Get-WinGetListedVersion {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowNull()]
        [object[]]$Output
    )

    # winget list prints: Name  Id  Version  [Available]  Source. The version follows the ID.
    # A value that winget shortened to fit the console ends with an ellipsis and is not used.
    foreach ($line in @($Output)) {
        $match = [regex]::Match([string]$line, "(?:^|\\s)$PackageIdentifierPattern\\s+(?:[<>]\\s*)?(\\S+)")
        if ($match.Success -and -not $match.Groups[1].Value.Contains([string][char]0x2026)) {
            return $match.Groups[1].Value
        }
    }

    return $null
}`;

const PINNED_REGISTRY_MATCH = `                if (Test-WinGetVersionAtLeast -Version ([string]$application.DisplayVersion)) {
                    Write-WinGetDetectionLog -Message "Detected '$($application.DisplayName)' $($application.DisplayVersion) from uninstall registry."
                    return $true
                }

                Write-WinGetDetectionLog -Message "Ignored '$($application.DisplayName)' $($application.DisplayVersion): not $MinimumVersion or newer."`;

const LATEST_REGISTRY_MATCH = `                Write-WinGetDetectionLog -Message "Detected '$($application.DisplayName)' from uninstall registry."
                return $true`;

const PINNED_TAIL = `$Winget = Get-WinGetExecutablePath
$installed = if (-not [string]::IsNullOrWhiteSpace($Winget)) {
    & $Winget list --id "$PackageIdentifier" --exact --accept-source-agreements 2>&1
} else {
    @()
}
$listedVersion = Get-WinGetListedVersion -Output $installed
if (Test-WinGetVersionAtLeast -Version $listedVersion) {
    Write-Output "$PackageIdentifier $listedVersion is installed ($MinimumVersion or newer)"
    exit 0
} elseif (Test-InstalledApplicationRegistry) {
    Write-Output "$PackageIdentifier is installed ($MinimumVersion or newer)"
    exit 0
} else {
    Write-Output "$PackageIdentifier $MinimumVersion or newer is not installed"
    exit 1
}
`;

/** PowerShell single-quoted string content: a quote is written twice. */
function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/** The same escape as .NET [regex]::Escape. */
function regexEscape(value: string): string {
  return value.replace(/[\\*+?|{[()^$.#\s]/g, (character) => {
    switch (character) {
      case "\t":
        return "\\t";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\f":
        return "\\f";
      case " ":
        return "\\ ";
      default:
        return `\\${character}`;
    }
  });
}

function assertPackageIdentifier(packageIdentifier: string): void {
  if (!PACKAGE_IDENTIFIER_PATTERN.test(packageIdentifier) || !packageIdentifier.includes(".")) {
    throw new Error(`"${packageIdentifier}" is not a valid WinGet package identifier.`);
  }
}

function assertPinnableVersion(version: string): void {
  if (!PINNABLE_VERSION_PATTERN.test(version)) {
    throw new Error(`"${version}" is not a version that can be pinned.`);
  }
}

/** The winget install command. A pinned version adds "--version <version>" after "--exact". */
export function getWinGetInstallCommand(packageIdentifier: string, version?: string): string {
  assertPackageIdentifier(packageIdentifier);
  if (version !== undefined) assertPinnableVersion(version);
  const versionArgument = version === undefined ? "" : ` --version ${version}`;
  return `winget install --id ${packageIdentifier} --exact${versionArgument} --silent --scope machine --accept-package-agreements --accept-source-agreements`;
}

/** The winget uninstall command. The version does not change it. */
export function getWinGetUninstallCommand(packageIdentifier: string): string {
  assertPackageIdentifier(packageIdentifier);
  return `winget uninstall --id ${packageIdentifier} --exact --scope machine --silent`;
}

/** Get-WinGetWrapperScriptContent: the install or uninstall wrapper script. */
export function getWinGetWrapperScript(
  wingetCommand: string,
  packageIdentifier: string,
  operation: "Install" | "Uninstall",
): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$packageIdentifier = '${psQuote(packageIdentifier)}'`,
    `$operationName = '${psQuote(operation)}'`,
    "",
    LOG_DIRECTORY_FRAGMENT,
    "",
    WRAPPER_LOG_FUNCTIONS,
    "",
    getBootstrapFragment("Write-WinGetWrapperLog", "Resolving WinGet for current execution context."),
    "",
    `$wingetCommand = '${psQuote(wingetCommand)}'`,
    WRAPPER_RUN_SECTION,
  ].join("\n");
}

/**
 * The detection script. Without a minimum version, the app is installed when winget lists the
 * package or a matching uninstall entry exists. With a minimum version, the listed version or
 * the DisplayVersion of the uninstall entry must be that version or newer.
 */
export function getWinGetDetectionScript(app: WinGetScriptApp, minimumVersion?: string): string {
  assertPackageIdentifier(app.packageIdentifier);
  if (minimumVersion !== undefined) assertPinnableVersion(minimumVersion);
  const pinned = minimumVersion !== undefined;
  return [
    `$PackageIdentifier = '${psQuote(app.packageIdentifier)}'`,
    `$PackageIdentifierPattern = '${psQuote(regexEscape(app.packageIdentifier))}'`,
    `$DisplayName = '${psQuote(app.displayName)}'`,
    `$Publisher = '${psQuote(app.publisher)}'`,
    ...(pinned ? [`$MinimumVersion = '${psQuote(minimumVersion)}'`] : []),
    "",
    DETECTION_LOG_FUNCTION,
    "",
    DETECTION_WINGET_PATH_FRAGMENT,
    "",
    ...(pinned ? [VERSION_COMPARISON_FUNCTIONS, ""] : []),
    DETECTION_REGISTRY_FUNCTION_START,
    pinned ? PINNED_REGISTRY_MATCH : LATEST_REGISTRY_MATCH,
    DETECTION_REGISTRY_FUNCTION_END,
    "",
    pinned ? PINNED_TAIL : DETECTION_LATEST_TAIL,
  ].join("\n");
}

/** The three scripts of a WinGet app. `version` undefined means the latest version. */
export function getWinGetScripts(app: WinGetScriptApp, version?: string): WinGetScripts {
  return {
    install: getWinGetWrapperScript(getWinGetInstallCommand(app.packageIdentifier, version), app.packageIdentifier, "Install"),
    uninstall: getWinGetWrapperScript(getWinGetUninstallCommand(app.packageIdentifier), app.packageIdentifier, "Uninstall"),
    detection: getWinGetDetectionScript(app, version),
  };
}
