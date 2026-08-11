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
