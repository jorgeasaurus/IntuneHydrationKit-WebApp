$ErrorActionPreference = 'Stop'
$packageIdentifier = 'Google.Chrome'
$operationName = 'Install'

function Test-HydrationWinGetLogDirectory {
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
        'C:\ProgramData'
    }

    $candidatePaths = [System.Collections.Generic.List[string]]::new()
    $candidatePaths.Add((Join-Path -Path $programDataPath -ChildPath 'Microsoft\IntuneManagementExtension\Logs'))

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidatePaths.Add((Join-Path -Path $env:LOCALAPPDATA -ChildPath 'IntuneHydrationKit\Logs'))
    }

    if (-not [string]::IsNullOrWhiteSpace($env:TEMP)) {
        $candidatePaths.Add((Join-Path -Path $env:TEMP -ChildPath 'IntuneHydrationKit\Logs'))
    }

    $systemTempPath = [System.IO.Path]::GetTempPath()
    if (-not [string]::IsNullOrWhiteSpace($systemTempPath)) {
        $candidatePaths.Add((Join-Path -Path $systemTempPath -ChildPath 'IntuneHydrationKit\Logs'))
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
}

function Get-WinGetWrapperLogFileName {
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
    Add-Content -Path $script:logPath -Value "`[$timestamp`] `[$Level`] $Message"
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

    Write-WinGetWrapperLog -Message "${Label}:" -Level $Level
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
    $foundExistingPackage = $outputText -match 'Found an existing package already installed\. Trying to upgrade the installed package'
    $noUpgradeAvailable = $outputText -match 'No available upgrade found' -or
        $outputText -match 'No newer package versions are available'

    return $foundExistingPackage -and $noUpgradeAvailable
}

function Get-WinGetExecutablePath {
    [CmdletBinding()]
    param()

    $programDataRoot = if ([string]::IsNullOrWhiteSpace($env:ProgramData)) { 'C:\ProgramData' } else { $env:ProgramData }
    $programDataWingetRoot = Join-Path -Path $programDataRoot -ChildPath 'Microsoft.DesktopAppInstaller'
    $programDataWingetExe = Join-Path -Path $programDataWingetRoot -ChildPath 'winget.exe'
    $isSystem = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name -eq 'NT AUTHORITY\SYSTEM'

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
            return $LASTEXITCODE -eq 0 -or $versionOutput -match 'v?\d+\.\d+'
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
            $searchPatterns.Add((Join-Path -Path $env:LOCALAPPDATA -ChildPath 'Microsoft\WindowsApps\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
            $searchPatterns.Add((Join-Path -Path $env:ProgramFiles -ChildPath 'WindowsApps\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\winget.exe'))
        }

        if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
            $searchPatterns.Add((Join-Path -Path ${env:ProgramFiles(x86)} -ChildPath 'WindowsApps\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\winget.exe'))
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
            $tempRoot = if ([string]::IsNullOrWhiteSpace($env:TEMP)) { 'C:\Windows\Temp' } else { $env:TEMP }
        }

        $stagingRoot = Join-Path -Path $tempRoot -ChildPath 'IntuneHydrationKit-WinGetBootstrap'
        $bundlePath = Join-Path -Path $stagingRoot -ChildPath 'Microsoft.DesktopAppInstaller.msixbundle'
        $bundleExtractPath = Join-Path -Path $stagingRoot -ChildPath 'bundle'
        $msixExtractPath = Join-Path -Path $stagingRoot -ChildPath 'appinstaller'
        $vcRedistPath = Join-Path -Path $stagingRoot -ChildPath 'vc_redist.x64.exe'

        Write-WinGetWrapperLog -Message 'Resolving WinGet for current execution context.'
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
            Write-WinGetWrapperLog -Message "VC++ bootstrap exited with code $($vcRedist.ExitCode)."
        } catch {
            Write-WinGetWrapperLog -Message "VC++ bootstrap failed: $($_.Exception.Message)" -Level 'WARN'
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
        Write-WinGetWrapperLog -Message "Bootstrapped WinGet to '$programDataWingetRoot'."
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
}

$wingetCommand = 'winget install --id Google.Chrome --exact --silent --scope machine --accept-package-agreements --accept-source-agreements'
$argumentString = ($wingetCommand -replace '^\s*winget(?:\.exe)?\s*', '').Trim()
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
