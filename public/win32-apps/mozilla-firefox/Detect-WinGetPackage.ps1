$PackageIdentifier = 'Mozilla.Firefox'
$PackageIdentifierPattern = 'Mozilla\.Firefox'
$DisplayName = 'Mozilla Firefox'
$Publisher = 'Mozilla'

function Write-WinGetDetectionLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter()]
        [ValidateSet('INFO', 'WARN', 'ERROR')]
        [string]$Level = 'INFO'
    )

    Write-Verbose "[$Level] $Message"
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

        Write-WinGetDetectionLog -Message 'Bootstrapping WinGet for detection.'
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
            Write-WinGetDetectionLog -Message "VC++ bootstrap exited with code $($vcRedist.ExitCode)."
        } catch {
            Write-WinGetDetectionLog -Message "VC++ bootstrap failed: $($_.Exception.Message)" -Level 'WARN'
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
        Write-WinGetDetectionLog -Message "Bootstrapped WinGet to '$programDataWingetRoot'."
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

function Test-InstalledApplicationRegistry {
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
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
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

            if (Test-ApplicationDisplayName -InstalledDisplayName $application.DisplayName) {
                Write-WinGetDetectionLog -Message "Detected '$($application.DisplayName)' from uninstall registry."
                return $true
            }
        }
    }

    return $false
}

$Winget = Get-WinGetExecutablePath
$installed = & $Winget list --id "$PackageIdentifier" --exact --accept-source-agreements 2>&1
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
